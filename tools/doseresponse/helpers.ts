// Pure helpers + typed prop interfaces for the dose–response tool.
// Math (4PL, hand-rolled Levenberg–Marquardt, Wald CIs, delta-method curve
// band, F-test for shared parameters, pre-fit transforms, warning gates)
// has no React/DOM dependency and is exercised by tests/doseresponse.test.js
// + tests/doseresponse.property.test.js via tests/helpers/doseresponse-loader.js.
//
// Free-variable globals consumed (declared in types/globals.d.ts, loaded
// at runtime via tools/shared.bundle.js): `tinv`, `fcdf`, `pStars`.

import type { LegendBlock, HowToContent } from "../_shell";
export type { LegendBlock, HowToContent };

// ── Layout constants ──────────────────────────────────────────────────────

export const MARGIN = { top: 32, right: 36, bottom: 64, left: 76 };
export const VBW = 800;
export const VBH = 500;
export const RESIDUAL_STRIP_H = 110;
export const RESIDUAL_STRIP_GAP = 16;
export const LN10 = Math.log(10);

// ── Modes ────────────────────────────────────────────────────────────────

export type DoseResponseModel = "4PL" | "3PL";
export type WeightingMode = "equal" | "inv-y2" | "inv-sd2";
export type NormalisationMode = "none" | "pct-max" | "min-max" | "user";
export type ZeroDoseMode = "drop" | "reference" | "floor";
export type DoseUnit = "raw" | "log10";

export const PARAM_KEYS = ["logEC50", "hillSlope", "top", "bottom"] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export interface ParamLock {
  fixed: boolean;
  value: number | null;
  lower: number | null;
  upper: number | null;
}

export type ParamLocks = Record<ParamKey, ParamLock>;

export const DEFAULT_PARAM_LOCKS: ParamLocks = {
  logEC50: { fixed: false, value: null, lower: null, upper: null },
  hillSlope: { fixed: false, value: null, lower: null, upper: null },
  top: { fixed: false, value: null, lower: null, upper: null },
  bottom: { fixed: false, value: null, lower: null, upper: null },
};

// ── Per-condition palette (color-blind-safe, 8-cycle) ────────────────────

export const CURVE_PALETTE = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#F0E442",
  "#56B4E9",
  "#E69F00",
  "#000000",
];
export const CURVE_DASH = ["none", "8,4", "2,3", "10,3,2,3"];
export const CURVE_MARKER = ["circle", "triangle", "square", "diamond"] as const;
export type CurveMarker = (typeof CURVE_MARKER)[number];

// ── Core types ───────────────────────────────────────────────────────────

export interface Observation {
  x: number; // log10(dose) after transform
  y: number;
  w: number; // sqrt-weight applied during LM
  isZeroDose?: boolean; // dropped from fit; tracked for off-axis reference rendering
  rawDose: number;
  conditionIdx: number;
}

export interface FitParams {
  logEC50: number;
  hillSlope: number;
  top: number;
  bottom: number;
}

export const PARAM_INDEX: Record<ParamKey, number> = {
  logEC50: 0,
  hillSlope: 1,
  top: 2,
  bottom: 3,
};

export interface FitWarning {
  code:
    | "few-doses"
    | "no-plateau"
    | "hill-zero"
    | "hill-extreme"
    | "no-convergence"
    | "ic50-suspect"
    | "all-fixed";
  message: string;
}

export type FitResult =
  | { valid: false; reason: string; warnings: FitWarning[] }
  | {
      valid: true;
      params: FitParams;
      paramSE: Record<ParamKey, number>;
      paramCI: Record<ParamKey, [number, number]>;
      ec50: number;
      ec50CI: [number, number];
      n: number;
      df: number;
      sse: number;
      residualSE: number;
      r2: number;
      converged: boolean;
      iterations: number;
      // Compressed for downstream covariance / curve-band consumers. The
      // full Jacobian is (n × p_free); covariance is (p_free × p_free).
      covariance: number[][];
      freeParamKeys: ParamKey[];
      warnings: FitWarning[];
    };

export interface ConditionFit {
  condition: string;
  conditionIdx: number;
  fit: FitResult;
  observations: Observation[];
}

export interface SharedParamTest {
  paramKey: ParamKey;
  F: number;
  df1: number;
  df2: number;
  p: number;
  pStars: string;
  ssFull: number;
  ssConstrained: number;
  // null when we couldn't build a constrained fit (e.g. < 2 conditions
  // or the constrained LM failed to converge). UI surfaces a hint instead.
  failed: boolean;
}

// ── 4PL model + analytical gradient ──────────────────────────────────────
//
// y = bottom + (top − bottom) / (1 + 10^((logEC50 − x) · hillSlope)),
// where x = log10(dose).

export function fourPL(x: number, p: FitParams): number {
  const z = (p.logEC50 - x) * p.hillSlope;
  return p.bottom + (p.top - p.bottom) / (1 + Math.pow(10, z));
}

// Returns [d/dlogEC50, d/dhill, d/dtop, d/dbottom] in PARAM_INDEX order.
export function fourPLGrad(x: number, p: FitParams): [number, number, number, number] {
  const z = (p.logEC50 - x) * p.hillSlope;
  const e = Math.pow(10, z);
  const denom = 1 + e;
  const frac = 1 / denom;
  const range = p.top - p.bottom;
  // d/dlogEC50: −range · frac² · e · hill · ln10
  // d/dhill:    −range · frac² · e · (logEC50 − x) · ln10
  // d/dtop:     frac
  // d/dbottom:  1 − frac
  const dEC = -range * frac * frac * e * p.hillSlope * LN10;
  const dHill = -range * frac * frac * e * (p.logEC50 - x) * LN10;
  return [dEC, dHill, frac, 1 - frac];
}

// ── Linear algebra (small matrices only) ─────────────────────────────────
//
// Gauss–Jordan with partial pivoting. `m` is square, modified in place if
// passed mutably. Returns inverse or null if singular.

export function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length;
  const a: number[][] = m.map((r) => r.slice());
  const inv: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let pivotAbs = Math.abs(a[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r][col]);
      if (v > pivotAbs) {
        pivot = r;
        pivotAbs = v;
      }
    }
    if (pivotAbs < 1e-14) return null;
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [inv[col], inv[pivot]] = [inv[pivot], inv[col]];
    }
    const piv = a[col][col];
    for (let j = 0; j < n; j++) {
      a[col][j] /= piv;
      inv[col][j] /= piv;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        a[r][j] -= f * a[col][j];
        inv[r][j] -= f * inv[col][j];
      }
    }
  }
  return inv;
}

// Solve (J^T J + λ diag(J^T J)) δ = J^T r, returning δ on success or null
// if the augmented system is singular. Used inside the LM loop. Wraps
// `invertMatrix` rather than rolling another solver — JTJ is small (≤ 4×4).
function lmSolve(JtJ: number[][], JtR: number[], lambda: number): number[] | null {
  const n = JtJ.length;
  const aug: number[][] = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)));
  const inv = invertMatrix(aug);
  if (!inv) return null;
  const delta = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += inv[i][j] * JtR[j];
    delta[i] = s;
  }
  return delta;
}

// ── Initial guesses ──────────────────────────────────────────────────────

export function correlationSign(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 1;
  const n = xs.length;
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
  }
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (denom === 0) return 1;
  const r = (n * sxy - sx * sy) / denom;
  return r >= 0 ? 1 : -1;
}

export function initialGuesses(obs: Observation[]): FitParams {
  if (obs.length === 0) return { logEC50: 0, hillSlope: 1, top: 1, bottom: 0 };
  const xs = obs.map((o) => o.x);
  const ys = obs.map((o) => o.y);
  const top = Math.max(...ys);
  const bottom = Math.min(...ys);
  const sortedX = [...xs].sort((a, b) => a - b);
  const median = sortedX[Math.floor(sortedX.length / 2)];
  const sign = correlationSign(xs, ys);
  return { logEC50: median, hillSlope: sign, top, bottom };
}

// ── LM solver (generic over a residual + Jacobian generator) ─────────────

export interface LmReport {
  params: number[];
  sse: number;
  iterations: number;
  converged: boolean;
  // (n × p_free) Jacobian at the final point. Rows already weighted by sqrt(w).
  jacobian: number[][];
  // Residuals at the final point, also weighted by sqrt(w).
  residuals: number[];
}

export interface LmOptions {
  maxIter?: number;
  ftol?: number;
  xtol?: number;
  initialLambda?: number;
}

// `evalRJ` returns (residuals, full-width Jacobian) at parameter vector p.
// `freeIdx` selects which columns of J participate in the LM step; the
// remaining params are held at their initial values for the run. `bounds`
// is an optional [lo, hi] per full-width param.
export function runLM(
  p0: number[],
  freeIdx: number[],
  evalRJ: (p: number[]) => { r: number[]; J: number[][] },
  bounds: Array<[number | null, number | null]>,
  opts: LmOptions = {}
): LmReport {
  const maxIter = opts.maxIter ?? 200;
  const ftol = opts.ftol ?? 1e-8;
  const xtol = opts.xtol ?? 1e-8;
  let lambda = opts.initialLambda ?? 1e-3;
  let p = p0.slice();
  let { r: rCurr, J: JFull } = evalRJ(p);
  let sseCurr = sumSq(rCurr);
  let iter = 0;
  let converged = false;
  let JCurr = sliceCols(JFull, freeIdx);
  for (; iter < maxIter; iter++) {
    const JtJ = matMulT(JCurr, JCurr);
    const JtR = matVecT(JCurr, rCurr);
    const delta = lmSolve(JtJ, JtR, lambda);
    if (!delta) {
      // Singular system → bump damping and try once more; if still singular
      // on the next pass we abandon (converged stays false).
      lambda = Math.min(lambda * 10, 1e10);
      if (lambda > 1e9) break;
      continue;
    }
    // Gauss–Newton step is δ_GN = −(JᵀJ)⁻¹·Jᵀr — subtract because lmSolve
    // returns the unsigned (JᵀJ + λ·diag(JᵀJ))⁻¹·Jᵀr so the direction-of-
    // descent flip lives at the call site.
    const pTry = p.slice();
    for (let k = 0; k < freeIdx.length; k++) {
      pTry[freeIdx[k]] = clampToBounds(p[freeIdx[k]] - delta[k], bounds[freeIdx[k]]);
    }
    const trial = evalRJ(pTry);
    const sseTry = sumSq(trial.r);
    // Accept on `<=` rather than `<` so that a no-op step at the optimum
    // (sse already zero, or LM δ clamped to zero by bounds) still feeds
    // through the xtol/ftol convergence gate below — strict `<` would let
    // λ ramp up indefinitely on a perfect fit.
    if (Number.isFinite(sseTry) && sseTry <= sseCurr) {
      const xRel = relativeChange(p, pTry, freeIdx);
      const fRel = sseCurr === 0 ? 0 : Math.abs(sseCurr - sseTry) / sseCurr;
      p = pTry;
      rCurr = trial.r;
      JFull = trial.J;
      JCurr = sliceCols(JFull, freeIdx);
      sseCurr = sseTry;
      lambda = Math.max(lambda / 10, 1e-15);
      if (xRel < xtol && fRel < ftol) {
        converged = true;
        iter++;
        break;
      }
    } else {
      lambda *= 10;
      if (lambda > 1e10) break;
    }
  }
  return {
    params: p,
    sse: sseCurr,
    iterations: iter,
    converged,
    jacobian: JCurr,
    residuals: rCurr,
  };
}

function sumSq(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v * v;
  return s;
}

function sliceCols(J: number[][], idx: number[]): number[][] {
  return J.map((row) => idx.map((c) => row[c]));
}

function matMulT(A: number[][], B: number[][]): number[][] {
  const m = A[0]?.length ?? 0;
  const k = A.length;
  const n = B[0]?.length ?? 0;
  const out: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let p = 0; p < k; p++) s += A[p][i] * B[p][j];
      out[i][j] = s;
    }
  }
  return out;
}

function matVecT(A: number[][], v: number[]): number[] {
  const m = A[0]?.length ?? 0;
  const k = A.length;
  const out = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let p = 0; p < k; p++) s += A[p][i] * v[p];
    out[i] = s;
  }
  return out;
}

function clampToBounds(v: number, b: [number | null, number | null]): number {
  let r = v;
  if (b[0] != null && r < b[0]) r = b[0];
  if (b[1] != null && r > b[1]) r = b[1];
  return r;
}

function relativeChange(prev: number[], next: number[], idx: number[]): number {
  let m = 0;
  for (const k of idx) {
    const denom = Math.max(Math.abs(prev[k]), 1e-12);
    const d = Math.abs(next[k] - prev[k]) / denom;
    if (d > m) m = d;
  }
  return m;
}

// ── 4PL fit wrapper ──────────────────────────────────────────────────────

export interface FourPLFitOptions {
  paramLocks?: ParamLocks;
  alpha?: number;
  maxIter?: number;
}

function buildEvalRJ(obs: Observation[]): (p: number[]) => { r: number[]; J: number[][] } {
  return (p) => {
    const params: FitParams = {
      logEC50: p[0],
      hillSlope: p[1],
      top: p[2],
      bottom: p[3],
    };
    const r = new Array<number>(obs.length);
    const J: number[][] = Array.from({ length: obs.length }, () => new Array<number>(4).fill(0));
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const yhat = fourPL(o.x, params);
      const w = o.w;
      r[i] = w * (o.y - yhat);
      const g = fourPLGrad(o.x, params);
      // Residual is r = w*(y - f), so dr/dp = -w * df/dp.
      J[i][0] = -w * g[0];
      J[i][1] = -w * g[1];
      J[i][2] = -w * g[2];
      J[i][3] = -w * g[3];
    }
    return { r, J };
  };
}

export function fit4PL(obs: Observation[], options: FourPLFitOptions = {}): FitResult {
  const fitObs = obs.filter((o) => !o.isZeroDose);
  const warnings: FitWarning[] = [];
  if (fitObs.length < 4) {
    return {
      valid: false,
      reason: "Need ≥ 4 (dose, response) observations to fit a 4-parameter curve.",
      warnings,
    };
  }
  const distinctDoses = new Set(fitObs.map((o) => o.x)).size;
  if (distinctDoses < 5) {
    warnings.push({
      code: "few-doses",
      message: `Only ${distinctDoses} distinct dose levels — parameters are weakly identified.`,
    });
  }

  const seed = initialGuesses(fitObs);
  const locks = options.paramLocks ?? DEFAULT_PARAM_LOCKS;
  const p0 = [seed.logEC50, seed.hillSlope, seed.top, seed.bottom];
  const bounds: Array<[number | null, number | null]> = [
    [locks.logEC50.lower, locks.logEC50.upper],
    [locks.hillSlope.lower, locks.hillSlope.upper],
    [locks.top.lower, locks.top.upper],
    [locks.bottom.lower, locks.bottom.upper],
  ];
  for (const key of PARAM_KEYS) {
    const lk = locks[key];
    if (lk.fixed && lk.value != null) {
      p0[PARAM_INDEX[key]] = lk.value;
    }
  }
  const freeIdx: number[] = [];
  const freeParamKeys: ParamKey[] = [];
  for (const key of PARAM_KEYS) {
    if (!locks[key].fixed) {
      freeIdx.push(PARAM_INDEX[key]);
      freeParamKeys.push(key);
    }
  }
  if (freeIdx.length === 0) {
    warnings.push({
      code: "all-fixed",
      message: "Every parameter is fixed — there is nothing to fit.",
    });
    return {
      valid: false,
      reason: "All four parameters are fixed; nothing to estimate.",
      warnings,
    };
  }

  const evalRJ = buildEvalRJ(fitObs);
  const report = runLM(p0, freeIdx, evalRJ, bounds, { maxIter: options.maxIter });
  if (!report.converged) {
    warnings.push({
      code: "no-convergence",
      message: `Levenberg–Marquardt did not converge after ${report.iterations} iterations. The reported parameters are not reliable.`,
    });
  }
  const params: FitParams = {
    logEC50: report.params[0],
    hillSlope: report.params[1],
    top: report.params[2],
    bottom: report.params[3],
  };
  const n = fitObs.length;
  const pFree = freeIdx.length;
  const df = Math.max(n - pFree, 1);
  const sse = report.sse;
  const sigma2 = sse / df;
  const residualSE = Math.sqrt(sigma2);
  const totalSS = totalSumOfSquares(fitObs);
  const r2 = totalSS > 0 ? 1 - sse / totalSS : NaN;

  const JtJ = matMulT(report.jacobian, report.jacobian);
  const cov = invertMatrix(JtJ);
  const paramSE: Record<ParamKey, number> = {
    logEC50: NaN,
    hillSlope: NaN,
    top: NaN,
    bottom: NaN,
  };
  const paramCI: Record<ParamKey, [number, number]> = {
    logEC50: [NaN, NaN],
    hillSlope: [NaN, NaN],
    top: [NaN, NaN],
    bottom: [NaN, NaN],
  };
  let scaledCov: number[][] = [];
  if (cov) {
    scaledCov = cov.map((row) => row.map((v) => v * sigma2));
    const tcrit = tinv(1 - (options.alpha ?? 0.05) / 2, df);
    for (let k = 0; k < freeParamKeys.length; k++) {
      const key = freeParamKeys[k];
      const variance = scaledCov[k][k];
      const se = variance >= 0 ? Math.sqrt(variance) : NaN;
      paramSE[key] = se;
      const point = params[key];
      paramCI[key] = [point - tcrit * se, point + tcrit * se];
    }
  }
  // Fixed parameters keep SE = 0 / CI = [point, point] for downstream UI clarity.
  for (const key of PARAM_KEYS) {
    if (locks[key].fixed) {
      paramSE[key] = 0;
      paramCI[key] = [params[key], params[key]];
    }
  }
  const ec50 = Math.pow(10, params.logEC50);
  const ec50CI: [number, number] = [
    Math.pow(10, paramCI.logEC50[0]),
    Math.pow(10, paramCI.logEC50[1]),
  ];

  // Plateau check: relative span of observed responses vs |top − bottom|.
  const yMin = Math.min(...fitObs.map((o) => o.y));
  const yMax = Math.max(...fitObs.map((o) => o.y));
  const ySpan = yMax - yMin;
  const fitSpan = Math.abs(params.top - params.bottom);
  if (fitSpan > 0 && ySpan / fitSpan < 0.7) {
    warnings.push({
      code: "no-plateau",
      message: `Observed response covers only ${((ySpan / fitSpan) * 100).toFixed(0)}% of |top − bottom|. Consider constraining Top or Bottom — confidence intervals are likely wide.`,
    });
  }
  const hillSE = paramSE.hillSlope;
  if (Number.isFinite(hillSE) && hillSE > 0) {
    const lo = paramCI.hillSlope[0];
    const hi = paramCI.hillSlope[1];
    if ((lo < 0 && hi > 0) || lo === 0 || hi === 0) {
      warnings.push({
        code: "hill-zero",
        message:
          "Hill-slope CI crosses zero — the curve is consistent with no dose dependence at this confidence level.",
      });
    }
  }
  if (Math.abs(params.hillSlope) > 3) {
    warnings.push({
      code: "hill-extreme",
      message: `|Hill slope| = ${params.hillSlope.toFixed(2)}. Slopes beyond ±3 typically indicate the wrong model or unusually steep dose dependence.`,
    });
  }

  const covOut = scaledCov.length ? scaledCov : [];
  return {
    valid: true,
    params,
    paramSE,
    paramCI,
    ec50,
    ec50CI,
    n,
    df,
    sse,
    residualSE,
    r2,
    converged: report.converged,
    iterations: report.iterations,
    covariance: covOut,
    freeParamKeys,
    warnings,
  };
}

function totalSumOfSquares(obs: Observation[]): number {
  if (obs.length === 0) return 0;
  let mean = 0;
  let totalW = 0;
  for (const o of obs) {
    const w2 = o.w * o.w;
    mean += w2 * o.y;
    totalW += w2;
  }
  if (totalW === 0) return 0;
  mean /= totalW;
  let sst = 0;
  for (const o of obs) {
    const r = o.w * (o.y - mean);
    sst += r * r;
  }
  return sst;
}

// ── Curve confidence band (delta method) ─────────────────────────────────
//
// var(ŷ(x)) ≈ ∇f(x; p̂) Σ ∇f(x; p̂)ᵀ where Σ is the parameter covariance
// over free parameters. Reuses fourPLGrad and respects which params were free
// during the fit (fixed params contribute 0 variance).

export interface CurvePoint {
  x: number;
  y: number;
  yLo: number;
  yHi: number;
}

export function curveBand(fit: FitResult, xGrid: number[], alpha = 0.05): CurvePoint[] {
  if (!fit.valid) return [];
  const { params, covariance: cov, freeParamKeys, df } = fit;
  if (cov.length === 0 || cov.length !== freeParamKeys.length) {
    return xGrid.map((x) => {
      const y = fourPL(x, params);
      return { x, y, yLo: y, yHi: y };
    });
  }
  const tcrit = tinv(1 - alpha / 2, df);
  const out: CurvePoint[] = [];
  for (const x of xGrid) {
    const fullGrad = fourPLGrad(x, params);
    const grad = freeParamKeys.map((k) => fullGrad[PARAM_INDEX[k]]);
    let variance = 0;
    for (let i = 0; i < grad.length; i++) {
      for (let j = 0; j < grad.length; j++) {
        variance += grad[i] * cov[i][j] * grad[j];
      }
    }
    const se = variance > 0 ? Math.sqrt(variance) : 0;
    const y = fourPL(x, params);
    out.push({ x, y, yLo: y - tcrit * se, yHi: y + tcrit * se });
  }
  return out;
}

export function buildXGrid(xMin: number, xMax: number, nPoints = 200): number[] {
  if (xMax <= xMin || nPoints < 2) return [xMin, xMax];
  const out = new Array<number>(nPoints);
  const step = (xMax - xMin) / (nPoints - 1);
  for (let i = 0; i < nPoints; i++) out[i] = xMin + step * i;
  return out;
}

// ── Pre-fit transforms ───────────────────────────────────────────────────

export interface RowInput {
  dose: number;
  response: number;
  condition: string;
  replicate?: string;
}

export interface BuildObsOptions {
  doseUnit: DoseUnit;
  zeroDoseMode: ZeroDoseMode;
  floorMolar?: number; // when zeroDoseMode === "floor": replacement dose value (raw units)
  normalisation: NormalisationMode;
  baseline?: number | null;
  topRef?: number | null;
  weighting: WeightingMode;
  // Per-condition grouped SDs for inv-sd2 weighting; key = condition.
  // When absent and weighting is inv-sd2, we fall back to equal weights.
  conditionStats?: Map<string, Map<number, number>>;
}

export interface BuildObsResult {
  observations: Observation[];
  conditions: string[];
}

// Splits raw rows into one Observation per row (post-transform), assigning
// a stable conditionIdx that the chart uses for color/shape rotation.
export function buildObservations(rows: RowInput[], opts: BuildObsOptions): BuildObsResult {
  const conditionOrder: string[] = [];
  const condIdx = new Map<string, number>();
  for (const r of rows) {
    if (!condIdx.has(r.condition)) {
      condIdx.set(r.condition, conditionOrder.length);
      conditionOrder.push(r.condition);
    }
  }

  // Normalisation reference points (Top, Bottom proxies).
  const yByCondition = new Map<string, number[]>();
  for (const r of rows) {
    const arr = yByCondition.get(r.condition) ?? [];
    arr.push(r.response);
    yByCondition.set(r.condition, arr);
  }

  const observations: Observation[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.dose) || !Number.isFinite(r.response)) continue;
    let dose = r.dose;
    let isZeroDose = false;
    if (opts.doseUnit === "raw") {
      if (dose <= 0) {
        isZeroDose = true;
        if (opts.zeroDoseMode === "drop" || opts.zeroDoseMode === "reference") {
          // keep the row metadata but mark as excluded from fit
        } else if (opts.zeroDoseMode === "floor") {
          const floor = opts.floorMolar ?? 1e-15;
          dose = floor;
          isZeroDose = false;
        }
      }
    } else {
      // log10 already supplied — no zero-dose semantics
      isZeroDose = false;
    }
    const x = isZeroDose
      ? Number.NEGATIVE_INFINITY
      : opts.doseUnit === "raw"
        ? Math.log10(dose)
        : dose;

    let y = r.response;
    if (opts.normalisation === "pct-max") {
      const ys = yByCondition.get(r.condition) ?? [r.response];
      const ymax = Math.max(...ys);
      y = ymax !== 0 ? (r.response / ymax) * 100 : r.response;
    } else if (opts.normalisation === "min-max") {
      const ys = yByCondition.get(r.condition) ?? [r.response];
      const ymax = Math.max(...ys);
      const ymin = Math.min(...ys);
      const span = ymax - ymin;
      y = span !== 0 ? ((r.response - ymin) / span) * 100 : r.response;
    } else if (opts.normalisation === "user") {
      const baseline = opts.baseline ?? 0;
      const top = opts.topRef ?? 100;
      const span = top - baseline;
      y = span !== 0 ? ((r.response - baseline) / span) * 100 : r.response;
    }

    let w = 1;
    if (opts.weighting === "inv-y2") {
      const denom = Math.abs(y);
      w = denom > 1e-12 ? 1 / denom : 1; // sqrt(weight): residual scaled by 1/|y|
    } else if (opts.weighting === "inv-sd2" && opts.conditionStats) {
      const condStats = opts.conditionStats.get(r.condition);
      const sd = condStats?.get(r.dose);
      w = sd && sd > 0 ? 1 / sd : 1;
    }

    observations.push({
      x,
      y,
      w,
      isZeroDose,
      rawDose: r.dose,
      conditionIdx: condIdx.get(r.condition) ?? 0,
    });
  }
  return { observations, conditions: conditionOrder };
}

// Compute per-(condition, dose) SDs from raw rows for the inv-sd2 weighting
// path. Skips singleton groups (sd is undefined; the caller falls back to w=1).
export function computeReplicateSds(rows: RowInput[]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  const groups = new Map<string, Map<number, number[]>>();
  for (const r of rows) {
    if (!Number.isFinite(r.dose) || !Number.isFinite(r.response)) continue;
    let perCond = groups.get(r.condition);
    if (!perCond) {
      perCond = new Map();
      groups.set(r.condition, perCond);
    }
    const arr = perCond.get(r.dose) ?? [];
    arr.push(r.response);
    perCond.set(r.dose, arr);
  }
  for (const [cond, perDose] of groups) {
    const inner = new Map<number, number>();
    for (const [dose, vals] of perDose) {
      if (vals.length < 2) continue;
      const m = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / (vals.length - 1));
      if (sd > 0) inner.set(dose, sd);
    }
    out.set(cond, inner);
  }
  return out;
}

// ── Multi-curve fit + F-test for shared parameters ───────────────────────

export interface MultiFitResult {
  perCondition: ConditionFit[];
  sharedTests: SharedParamTest[];
}

export function fitMulti(
  observations: Observation[],
  conditionNames: string[],
  options: FourPLFitOptions = {}
): ConditionFit[] {
  const out: ConditionFit[] = [];
  const byCondIdx = new Map<number, Observation[]>();
  for (const o of observations) {
    const arr = byCondIdx.get(o.conditionIdx) ?? [];
    arr.push(o);
    byCondIdx.set(o.conditionIdx, arr);
  }
  for (let i = 0; i < conditionNames.length; i++) {
    const obs = byCondIdx.get(i) ?? [];
    const fit = fit4PL(obs, options);
    out.push({ condition: conditionNames[i], conditionIdx: i, fit, observations: obs });
  }
  return out;
}

// Joint LM with one parameter shared across every condition. The combined
// parameter vector lays out as: [shared, perCond_0_other_params,
// perCond_1_other_params, ...] where "other" is the 3-param suffix in
// PARAM_KEYS order minus the shared key.

interface JointFitReport {
  sse: number;
  totalN: number;
  freeCount: number;
  converged: boolean;
}

function fitJointShared(
  conditionFits: ConditionFit[],
  sharedKey: ParamKey,
  options: FourPLFitOptions
): JointFitReport | null {
  const fittable = conditionFits.filter(
    (cf) => cf.fit.valid && cf.observations.filter((o) => !o.isZeroDose).length >= 4
  );
  if (fittable.length < 2) return null;

  const sharedIdx = PARAM_INDEX[sharedKey];
  const otherKeys = PARAM_KEYS.filter((k) => k !== sharedKey);
  const otherIdx = otherKeys.map((k) => PARAM_INDEX[k]);

  // Layout: pVec[0] is the shared param, then 3 entries per condition for
  // the remaining params (in `otherKeys` order).
  const numConds = fittable.length;
  const pSize = 1 + numConds * 3;

  const initSharedValues = fittable.map((cf) => (cf.fit.valid ? cf.fit.params[sharedKey] : 0));
  const sharedSeed =
    initSharedValues.reduce((s, v) => s + v, 0) / Math.max(1, initSharedValues.length);
  const pVec: number[] = new Array<number>(pSize).fill(0);
  pVec[0] = sharedSeed;
  for (let c = 0; c < numConds; c++) {
    const fit = fittable[c].fit;
    if (!fit.valid) return null;
    for (let j = 0; j < otherKeys.length; j++) {
      pVec[1 + c * 3 + j] = fit.params[otherKeys[j]];
    }
  }

  const allObs: Array<{ obs: Observation; condRank: number }> = [];
  for (let c = 0; c < numConds; c++) {
    const obs = fittable[c].observations.filter((o) => !o.isZeroDose);
    for (const o of obs) allObs.push({ obs: o, condRank: c });
  }
  if (allObs.length < pSize) return null;

  const locks = options.paramLocks ?? DEFAULT_PARAM_LOCKS;
  const bounds: Array<[number | null, number | null]> = [
    [locks[sharedKey].lower, locks[sharedKey].upper],
  ];
  for (let c = 0; c < numConds; c++) {
    for (const k of otherKeys) {
      bounds.push([locks[k].lower, locks[k].upper]);
    }
  }
  const freeIdx: number[] = [];
  if (!locks[sharedKey].fixed) freeIdx.push(0);
  for (let c = 0; c < numConds; c++) {
    for (let j = 0; j < otherKeys.length; j++) {
      if (!locks[otherKeys[j]].fixed) freeIdx.push(1 + c * 3 + j);
    }
  }
  if (freeIdx.length === 0) return null;

  const evalRJ = (p: number[]): { r: number[]; J: number[][] } => {
    const r = new Array<number>(allObs.length);
    const J: number[][] = Array.from({ length: allObs.length }, () =>
      new Array<number>(pSize).fill(0)
    );
    for (let i = 0; i < allObs.length; i++) {
      const { obs, condRank } = allObs[i];
      const localParams: FitParams = {
        logEC50: 0,
        hillSlope: 0,
        top: 0,
        bottom: 0,
      };
      // shared
      (localParams as Record<ParamKey, number>)[sharedKey] = p[0];
      // other
      for (let j = 0; j < otherKeys.length; j++) {
        (localParams as Record<ParamKey, number>)[otherKeys[j]] = p[1 + condRank * 3 + j];
      }
      const yhat = fourPL(obs.x, localParams);
      const w = obs.w;
      r[i] = w * (obs.y - yhat);
      const grad = fourPLGrad(obs.x, localParams);
      // Map the 4-element grad back into pSize-long Jacobian row.
      J[i][0] = -w * grad[sharedIdx];
      for (let j = 0; j < otherKeys.length; j++) {
        J[i][1 + condRank * 3 + j] = -w * grad[otherIdx[j]];
      }
    }
    return { r, J };
  };

  const report = runLM(pVec, freeIdx, evalRJ, bounds, { maxIter: options.maxIter });
  if (!report.converged) return null;
  return {
    sse: report.sse,
    totalN: allObs.length,
    freeCount: freeIdx.length,
    converged: true,
  };
}

export function fTestSharedParam(
  conditionFits: ConditionFit[],
  sharedKey: ParamKey,
  options: FourPLFitOptions = {}
): SharedParamTest {
  const result: SharedParamTest = {
    paramKey: sharedKey,
    F: NaN,
    df1: NaN,
    df2: NaN,
    p: NaN,
    pStars: "",
    ssFull: NaN,
    ssConstrained: NaN,
    failed: true,
  };
  const fittable = conditionFits.filter((cf) => cf.fit.valid);
  if (fittable.length < 2) return result;

  // Full model: independent fits.
  let ssFull = 0;
  let dfFull = 0;
  for (const cf of fittable) {
    if (!cf.fit.valid) return result;
    ssFull += cf.fit.sse;
    dfFull += cf.fit.df;
  }
  result.ssFull = ssFull;

  const joint = fitJointShared(fittable, sharedKey, options);
  if (!joint) return result;
  result.ssConstrained = joint.sse;
  const dfConstrained = joint.totalN - joint.freeCount;
  const deltaP = dfConstrained - dfFull;
  if (deltaP <= 0 || dfFull <= 0 || ssFull <= 0) return result;
  const F = (joint.sse - ssFull) / deltaP / (ssFull / dfFull);
  const p = F > 0 ? 1 - fcdf(F, deltaP, dfFull) : 1;
  result.F = F;
  result.df1 = deltaP;
  result.df2 = dfFull;
  result.p = Math.max(0, Math.min(1, p));
  result.pStars = pStars(result.p);
  result.failed = false;
  return result;
}

// ── Tick + axis helpers for log10(dose) on the X axis ────────────────────

export function logTickRange(xMin: number, xMax: number): number[] {
  const lo = Math.floor(xMin);
  const hi = Math.ceil(xMax);
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

export function formatLogTick(x: number): string {
  // Returns a "10^k" style label (e.g. 10⁻⁹). Only emits clean labels for
  // integer powers; non-integer ticks fall back to scientific notation.
  if (Math.abs(x - Math.round(x)) < 1e-9) {
    const exp = Math.round(x);
    return `10${superscript(exp)}`;
  }
  return Math.pow(10, x).toExponential(1);
}

const SUPER_DIGITS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

function superscript(n: number): string {
  return String(n)
    .split("")
    .map((ch) => SUPER_DIGITS[ch] ?? ch)
    .join("");
}

export function fmtNum(v: number, sig = 3): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 10000 || abs < 0.001) return v.toExponential(1);
  return parseFloat(v.toPrecision(sig)).toString();
}

export function fmtEC50(ec50: number): string {
  if (!Number.isFinite(ec50) || ec50 <= 0) return "—";
  // Pick a sensible SI unit so users see "12 nM" rather than 1.2e-8 M.
  const units: Array<[number, string]> = [
    [1, "M"],
    [1e-3, "mM"],
    [1e-6, "µM"],
    [1e-9, "nM"],
    [1e-12, "pM"],
    [1e-15, "fM"],
  ];
  for (const [scale, label] of units) {
    if (ec50 >= scale) {
      const v = ec50 / scale;
      return `${fmtNum(v, 3)} ${label}`;
    }
  }
  return ec50.toExponential(2);
}

// ── Vis state + chart prop interfaces ────────────────────────────────────

export interface DoseResponseVis {
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  xLabel: string;
  yLabel: string;
  plotTitle: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  doseUnit: DoseUnit;
  zeroDoseMode: ZeroDoseMode;
  normalisation: NormalisationMode;
  normalisationBaseline: number | null;
  normalisationTop: number | null;
  weighting: WeightingMode;
  model: DoseResponseModel;
  paramLocks: ParamLocks;
  showCIBand: boolean;
  ciBandOpacity: number;
  showResidualsStrip: boolean;
  showParamTable: boolean;
  conditionColors: Record<string, string>;
  pointSize: number;
  pointOpacity: number;
  curveStrokeWidth: number;
  // Confidence level for parameter + curve CIs (default 0.05 → 95% CIs).
  alpha: number;
}

export const VIS_INIT_DOSERESPONSE: DoseResponseVis = {
  xMin: null,
  xMax: null,
  yMin: null,
  yMax: null,
  xLabel: "",
  yLabel: "",
  plotTitle: "",
  plotBg: "#ffffff",
  showGrid: true,
  gridColor: "#e0e0e0",
  doseUnit: "raw",
  zeroDoseMode: "drop",
  normalisation: "none",
  normalisationBaseline: null,
  normalisationTop: null,
  weighting: "equal",
  model: "4PL",
  paramLocks: DEFAULT_PARAM_LOCKS,
  showCIBand: true,
  ciBandOpacity: 0.18,
  showResidualsStrip: true,
  showParamTable: true,
  conditionColors: {},
  pointSize: 5,
  pointOpacity: 0.85,
  curveStrokeWidth: 2,
  alpha: 0.05,
};

export type UpdVis = (patch: Partial<DoseResponseVis> | { _reset: true }) => void;

export interface AutoAxis {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface DoseRoleAssignment {
  doseCol: number;
  responseCol: number;
  conditionCol: number | null;
  replicateCol: number | null;
}

export interface ChartProps {
  conditionFits: ConditionFit[];
  sharedTests: SharedParamTest[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  title: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  showCIBand: boolean;
  ciBandOpacity: number;
  showResidualsStrip: boolean;
  showParamTable: boolean;
  conditionColors: Record<string, string>;
  pointSize: number;
  pointOpacity: number;
  curveStrokeWidth: number;
  alpha: number;
  svgLegend: LegendBlock[] | null;
}

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  rawText: string | null;
  doParse: (text: string, sep: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export interface PlotStepProps {
  parsed: ParseDataResult;
  fileName: string;
  numericCols: number[];
  textCols: number[];
  roles: DoseRoleAssignment;
  setRoles: (r: DoseRoleAssignment) => void;
  rows: RowInput[];
  conditions: string[];
  conditionFits: ConditionFit[];
  sharedTests: SharedParamTest[];
  vis: DoseResponseVis;
  updVis: UpdVis;
  autoAxis: AutoAxis;
  effAxis: AutoAxis;
  resetAll: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
  svgLegend: LegendBlock[] | null;
}

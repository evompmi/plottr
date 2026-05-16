// stats/tests.ts — descriptive helpers + parametric / nonparametric tests +
// effect sizes.
//
// Layout:
//   3. Sample helpers          — mean, variance, sd, rank-with-ties
//   4. Shapiro-Wilk normality  — Royston 1995, AS R94
//   5. Levene / Brown-Forsythe equal-variance test
//   6. Two-sample location     — t-test (Student / Welch), Mann-Whitney U
//   7. Two-sample effect sizes — Cohen's d, Hedges' g, rank-biserial
//   8. k-sample location       — one-way / Welch ANOVA, Kruskal-Wallis
//   9. Correlation             — Pearson r, Spearman ρ, Kendall τ-b,
//                                selectCorrelation auto-picker
//  10. k-sample effect sizes   — η², ε²

import { bisect, chi2cdf, fcdf_upper, gammaln, nctcdf, norminv, normsf, tcdf_upper } from "./dist";
import { formatP } from "./format";
import type {
  ANOVAResult,
  KendallResult,
  KruskalWallisResult,
  LeveneResult,
  MannWhitneyResult,
  PairwiseComplete,
  PearsonResult,
  RankWithTies,
  ShapiroWilkResult,
  SpearmanResult,
  TTestResult,
} from "./types";

// ── 3. Sample helpers ───────────────────────────────────────────────────────

export function sampleMean(x: number[]): number {
  const n = x.length;
  if (n === 0) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  return s / n;
}

// Sample variance with (n-1) denominator (Bessel-corrected). Welford's
// online algorithm: one pass, no need to compute the mean separately, and
// numerically more robust than the naive E[X²] − E[X]² formula (which
// catastrophically cancels when the data have a large offset). The classic
// two-pass algorithm is comparable in accuracy on most inputs, but Welford
// avoids a second loop and pre-computed mean, which is cleaner and slightly
// faster on large arrays.
export function sampleVariance(x: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  let mean = 0,
    M2 = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean;
    mean += d / (i + 1);
    M2 += d * (x[i] - mean);
  }
  return M2 / (n - 1);
}

export function sampleSD(x: number[]): number {
  return Math.sqrt(sampleVariance(x));
}

// Midrank assignment with ties — returns ranks[i] = 1-based rank of x[i],
// averaging ranks for tied values. Also returns the sum of (t³−t)/12 for each
// tie group, needed as the tie-correction term in Mann-Whitney / Kruskal-Wallis.
export function rankWithTies(x: number[]): RankWithTies {
  const n = x.length;
  const idx: [number, number][] = x
    .map((v, i): [number, number] => [v, i])
    .sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  let tieCorrection = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j + 2) / 2; // 1-based average of ranks [i+1 .. j+1]
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avgRank;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t * t * t - t;
    i = j + 1;
  }
  return { ranks, tieCorrection };
}

// ── 4. Normality: Shapiro-Wilk (Royston 1995, AS R94) ───────────────────────

export function shapiroWilk(x: number[]): ShapiroWilkResult {
  const n = x.length;
  if (n < 3 || n > 5000) {
    return { W: NaN, p: NaN, error: "Shapiro-Wilk requires 3 ≤ n ≤ 5000" };
  }
  const sorted = [...x].sort((a, b) => a - b);

  // Expected values of normal order statistics via Blom's approximation:
  //   m_i ≈ Φ⁻¹((i − 3/8) / (n + 1/4))
  // These are the "m" vector in AS R94.
  const m = new Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = norminv((i + 1 - 3 / 8) / (n + 1 / 4));
  }
  let mm = 0;
  for (let i = 0; i < n; i++) mm += m[i] * m[i];

  // Coefficients a_i (Royston 1992 analytical form, AS R94).
  const a = new Array(n);
  const u = 1 / Math.sqrt(n);
  const sqrtMm = Math.sqrt(mm);

  if (n === 3) {
    // Exact for n = 3: a_1 = √(1/2), a_3 = −a_1, a_2 = 0.
    a[0] = -Math.SQRT1_2;
    a[1] = 0;
    a[2] = Math.SQRT1_2;
  } else {
    const an =
      m[n - 1] / sqrtMm +
      0.221157 * u -
      0.147981 * u * u -
      2.07119 * u * u * u +
      4.434685 * u * u * u * u -
      2.706056 * u * u * u * u * u;
    a[n - 1] = an;
    a[0] = -an;

    if (n >= 6) {
      const an1 =
        m[n - 2] / sqrtMm +
        0.042981 * u -
        0.293762 * u * u -
        1.75246 * u * u * u +
        5.682633 * u * u * u * u -
        3.582633 * u * u * u * u * u;
      a[n - 2] = an1;
      a[1] = -an1;

      // Epsilon correction for middle coefficients (AS R94).
      const phi =
        (mm - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2]) /
        (1 - 2 * an * an - 2 * an1 * an1);
      const sqrtPhi = Math.sqrt(phi);
      for (let i = 2; i < n - 2; i++) a[i] = m[i] / sqrtPhi;
    } else {
      // n = 4 or 5: only tail coefficients, simpler correction.
      const phi = (mm - 2 * m[n - 1] * m[n - 1]) / (1 - 2 * an * an);
      const sqrtPhi = Math.sqrt(phi);
      for (let i = 1; i < n - 1; i++) a[i] = m[i] / sqrtPhi;
    }
  }

  // W = (Σ a_i · x_(i))² / Σ (x_i − x̄)²
  let xbar = 0;
  for (let i = 0; i < n; i++) xbar += sorted[i];
  xbar /= n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += a[i] * sorted[i];
    const d = sorted[i] - xbar;
    den += d * d;
  }
  if (den === 0) return { W: NaN, p: NaN, error: "Zero variance" };
  // Clamp to [0, 1] — floating-point can produce W = 1 + ε for a perfect
  // linear sample (e.g. n=3 [1,2,3]), which would break asin(√W) below.
  const W = Math.max(0, Math.min(1, (num * num) / den));

  // P-value via Royston 1995 normalizing transform.
  let p: number;
  if (n === 3) {
    // Exact distribution at n=3: p = 6 · (asin(√W) − asin(√(3/4))) / π
    const pi6 = 6 / Math.PI;
    const stqr = Math.asin(Math.sqrt(3 / 4));
    p = pi6 * (Math.asin(Math.sqrt(W)) - stqr);
    if (p < 0) p = 0;
    if (p > 1) p = 1;
  } else if (n <= 11) {
    // Polynomial in n for gamma and mu, log-transform on (gamma − ln(1−W)).
    const gamma = -2.273 + 0.459 * n;
    const mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
    const sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
    const y = -Math.log(gamma - Math.log(1 - W));
    const z = (y - mu) / sigma;
    p = normsf(z);
  } else {
    // n ≥ 12: log(1−W) is approximately normal after transform.
    const lnN = Math.log(n);
    const mu = -1.5861 - 0.31082 * lnN - 0.083751 * lnN * lnN + 0.0038915 * lnN * lnN * lnN;
    const sigma = Math.exp(-0.4803 - 0.082676 * lnN + 0.0030302 * lnN * lnN);
    const y = Math.log(1 - W);
    const z = (y - mu) / sigma;
    p = normsf(z);
  }

  return { W, p };
}

// ── 5. Equal-variance tests ─────────────────────────────────────────────────

export function leveneTest(groups: number[][]): LeveneResult {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  // Absolute deviations from the group median.
  const devs = groups.map((g) => {
    const s = [...g].sort((a, b) => a - b);
    const n = s.length;
    const med = n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[Math.floor(n / 2)];
    return g.map((v) => Math.abs(v - med));
  });
  // One-way ANOVA on deviations.
  let Ntot = 0;
  let grandSum = 0;
  for (const d of devs) {
    Ntot += d.length;
    for (const v of d) grandSum += v;
  }
  if (Ntot <= k) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Not enough observations" };
  const grandMean = grandSum / Ntot;
  let ssBetween = 0,
    ssWithin = 0;
  for (const d of devs) {
    const n = d.length;
    if (n === 0) continue;
    let s = 0;
    for (const v of d) s += v;
    const m = s / n;
    ssBetween += n * (m - grandMean) * (m - grandMean);
    for (const v of d) ssWithin += (v - m) * (v - m);
  }
  const df1 = k - 1;
  const df2 = Ntot - k;
  if (ssWithin === 0) {
    return {
      F: NaN,
      df1,
      df2,
      p: NaN,
      error: "Data are essentially constant (zero within-group dispersion)",
    };
  }
  const F = ssBetween / df1 / (ssWithin / df2);
  const p = fcdf_upper(F, df1, df2);
  return { F, df1, df2, p };
}

// ── 6. Two-sample location tests ────────────────────────────────────────────

export function tTest(x: number[], y: number[], opts: { equalVar?: boolean } = {}): TTestResult {
  const equalVar = opts.equalVar !== false;
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 2 || n2 < 2) {
    return { t: NaN, df: 0, p: NaN, error: "Each group needs n≥2" };
  }
  const m1 = sampleMean(x),
    m2 = sampleMean(y);
  const v1 = sampleVariance(x),
    v2 = sampleVariance(y);
  if (v1 === 0 && v2 === 0) {
    return {
      t: NaN,
      df: NaN,
      p: NaN,
      mean1: m1,
      mean2: m2,
      var1: v1,
      var2: v2,
      n1,
      n2,
      error: "Data are essentially constant (zero variance in both groups)",
    };
  }
  let t: number, df: number;
  if (equalVar) {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    t = (m1 - m2) / se;
    df = n1 + n2 - 2;
  } else {
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    t = (m1 - m2) / se;
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    df = num / den;
  }
  const p = 2 * tcdf_upper(Math.abs(t), df);
  return { t, df, p, mean1: m1, mean2: m2, var1: v1, var2: v2, n1, n2 };
}

export function mannWhitneyU(x: number[], y: number[]): MannWhitneyResult {
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 1 || n2 < 1) return { U: NaN, z: NaN, p: NaN, error: "Empty group" };
  const all = x.concat(y);
  // All observations identical → the tie-corrected variance collapses to
  // exactly 0, the test is undefined, and an unguarded run reports z = 0,
  // p = 1 ("not significant") — a false negative. Mirror the kruskalWallis
  // guard and surface an error instead.
  let allTied = true;
  for (let i = 1; i < all.length; i++) {
    if (all[i] !== all[0]) {
      allTied = false;
      break;
    }
  }
  if (allTied) return { U: NaN, z: NaN, p: NaN, error: "Data are essentially constant" };
  const { ranks, tieCorrection } = rankWithTies(all);
  let R1 = 0;
  for (let i = 0; i < n1; i++) R1 += ranks[i];
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const N = n1 + n2;
  const muU = (n1 * n2) / 2;
  // σ_U² with tie correction (Lehmann 1975):
  //  σ² = n1·n2/12 · [(N+1) − Σ(t³−t) / (N(N−1))]
  const sigma2 = ((n1 * n2) / 12) * (N + 1 - tieCorrection / (N * (N - 1)));
  const sigmaU = Math.sqrt(sigma2);
  const diff = U1 - muU;
  let z: number;
  if (sigmaU === 0) z = 0;
  else if (diff > 0) z = (diff - 0.5) / sigmaU;
  else if (diff < 0) z = (diff + 0.5) / sigmaU;
  else z = 0;
  const p = 2 * normsf(Math.abs(z));
  return { U, U1, U2, z, p, n1, n2 };
}

// ── 7. Two-sample effect sizes ──────────────────────────────────────────────

export function cohenD(x: number[], y: number[]): number {
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 2 || n2 < 2) return NaN;
  const m1 = sampleMean(x),
    m2 = sampleMean(y);
  const v1 = sampleVariance(x),
    v2 = sampleVariance(y);
  const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  if (sp2 === 0) return NaN;
  return (m1 - m2) / Math.sqrt(sp2);
}

export function hedgesG(x: number[], y: number[]): number {
  const d = cohenD(x, y);
  if (!Number.isFinite(d)) return d;
  const df = x.length + y.length - 2;
  if (df < 1) return NaN;
  // Exact small-sample correction factor:
  //   J(df) = Γ(df/2) / (Γ((df−1)/2) · √(df/2))
  const J = Math.exp(gammaln(df / 2) - gammaln((df - 1) / 2) - 0.5 * Math.log(df / 2));
  return d * J;
}

// Rank-biserial correlation from Mann-Whitney U (Kerby 2014).
export function rankBiserial(U1: number, n1: number, n2: number): number {
  if (n1 * n2 === 0) return NaN;
  return 1 - (2 * U1) / (n1 * n2);
}

// 95 % confidence interval for Cohen's d (or d_av) on two independent samples,
// using the noncentral-t pivot of Cumming & Finch 2001.
export function cohenDCI(
  d: number,
  n1: number,
  n2: number,
  conf?: number
): { lo: number; hi: number } {
  const c = conf == null ? 0.95 : conf;
  if (!Number.isFinite(d) || n1 < 2 || n2 < 2 || c <= 0 || c >= 1) {
    return { lo: NaN, hi: NaN };
  }
  const alpha = 1 - c;
  const seFactor = Math.sqrt(1 / n1 + 1 / n2);
  const tObs = d / seFactor;
  const df = n1 + n2 - 2;
  const halfRange = Math.abs(tObs) + 20;
  const negNct = (lam: number): number => -nctcdf(tObs, df, lam);
  const lambdaLo = bisect(negNct, -(1 - alpha / 2), -halfRange, halfRange);
  const lambdaHi = bisect(negNct, -alpha / 2, -halfRange, halfRange);
  if (!Number.isFinite(lambdaLo) || !Number.isFinite(lambdaHi)) {
    return { lo: NaN, hi: NaN };
  }
  return { lo: lambdaLo * seFactor, hi: lambdaHi * seFactor };
}

// ── 8. k-sample location tests ──────────────────────────────────────────────

export function oneWayANOVA(groups: number[][]): ANOVAResult {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  let Ntot = 0;
  let grandSum = 0;
  for (const g of groups) {
    Ntot += g.length;
    for (const v of g) grandSum += v;
  }
  if (Ntot <= k) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Not enough observations" };
  const grandMean = grandSum / Ntot;
  let ssBetween = 0,
    ssWithin = 0;
  for (const g of groups) {
    const n = g.length;
    if (n === 0) continue;
    let s = 0;
    for (const v of g) s += v;
    const m = s / n;
    ssBetween += n * (m - grandMean) * (m - grandMean);
    for (const v of g) ssWithin += (v - m) * (v - m);
  }
  const df1 = k - 1;
  const df2 = Ntot - k;
  if (ssWithin === 0) {
    return {
      F: NaN,
      df1,
      df2,
      p: NaN,
      ssBetween,
      ssWithin,
      grandMean,
      error: "Data are essentially constant (zero within-group dispersion)",
    };
  }
  const F = ssBetween / df1 / (ssWithin / df2);
  const p = fcdf_upper(F, df1, df2);
  return { F, df1, df2, p, ssBetween, ssWithin, grandMean };
}

export function welchANOVA(groups: number[][]): ANOVAResult {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  const ns = groups.map((g) => g.length);
  if (ns.some((n) => n < 2)) {
    return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Each group needs n≥2" };
  }
  const means = groups.map(sampleMean);
  const vars_ = groups.map(sampleVariance);
  if (vars_.some((v) => v === 0)) {
    return {
      F: NaN,
      df1: k - 1,
      df2: NaN,
      p: NaN,
      error: "Data are essentially constant (zero variance in at least one group)",
    };
  }
  const w = vars_.map((v, i) => ns[i] / v);
  const Wsum = w.reduce((a, b) => a + b, 0);
  const m = w.reduce((a, wi, i) => a + wi * means[i], 0) / Wsum;
  let num = 0;
  for (let i = 0; i < k; i++) num += w[i] * (means[i] - m) * (means[i] - m);
  num /= k - 1;
  let h = 0;
  for (let i = 0; i < k; i++) {
    const term = 1 - w[i] / Wsum;
    h += (term * term) / (ns[i] - 1);
  }
  const den = 1 + ((2 * (k - 2)) / (k * k - 1)) * h;
  const F = num / den;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * h);
  const p = fcdf_upper(F, df1, df2);
  return { F, df1, df2, p };
}

export function kruskalWallis(groups: number[][]): KruskalWallisResult {
  const k = groups.length;
  if (k < 2) return { H: NaN, df: 0, p: NaN, error: "≥2 groups required" };
  const all: number[] = [];
  const owner: number[] = [];
  for (let i = 0; i < k; i++) {
    for (const v of groups[i]) {
      all.push(v);
      owner.push(i);
    }
  }
  const N = all.length;
  if (N <= k) return { H: NaN, df: 0, p: NaN, error: "Not enough observations" };
  let allTied = true;
  for (let i = 1; i < N; i++) {
    if (all[i] !== all[0]) {
      allTied = false;
      break;
    }
  }
  if (allTied) {
    return { H: NaN, df: k - 1, p: NaN, error: "Data are essentially constant" };
  }
  const { ranks, tieCorrection } = rankWithTies(all);
  const R = new Array(k).fill(0);
  for (let i = 0; i < N; i++) R[owner[i]] += ranks[i];
  let sumR2n = 0;
  for (let i = 0; i < k; i++) sumR2n += (R[i] * R[i]) / groups[i].length;
  let H = (12 / (N * (N + 1))) * sumR2n - 3 * (N + 1);
  const C = 1 - tieCorrection / (N * N * N - N);
  if (C > 0) H /= C;
  const df = k - 1;
  const p = 1 - chi2cdf(H, df);
  return { H, df, p };
}

// ── 9. Correlation (paired bivariate) ──────────────────────────────────────

// Drop rows with non-finite x or y; return the cleaned pair.
function _pairwiseComplete(x: number[], y: number[]): PairwiseComplete {
  const n = Math.min(x.length, y.length);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const xv = x[i],
      yv = y[i];
    if (Number.isFinite(xv) && Number.isFinite(yv)) {
      xs.push(xv);
      ys.push(yv);
    }
  }
  return { xs, ys, n: xs.length };
}

export function pearsonCorrelation(
  x: number[],
  y: number[],
  opts: { conf?: number } = {}
): PearsonResult {
  const { xs, ys, n } = _pairwiseComplete(x, y);
  if (n < 3) {
    return {
      r: NaN,
      t: NaN,
      df: 0,
      p: NaN,
      n,
      ci: { lo: NaN, hi: NaN },
      error: "Need ≥3 complete pairs",
    };
  }
  const mx = sampleMean(xs);
  const my = sampleMean(ys);
  let S2x = 0,
    S2y = 0,
    Sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    S2x += dx * dx;
    S2y += dy * dy;
    Sxy += dx * dy;
  }
  if (S2x === 0 || S2y === 0) {
    return {
      r: NaN,
      t: NaN,
      df: n - 2,
      p: NaN,
      n,
      ci: { lo: NaN, hi: NaN },
      error: "Data are essentially constant (zero variance in x or y)",
    };
  }
  let r = Sxy / Math.sqrt(S2x * S2y);
  if (r > 1) r = 1;
  if (r < -1) r = -1;
  const df = n - 2;
  const conf = opts.conf == null ? 0.95 : opts.conf;
  const ci = { lo: NaN, hi: NaN };
  if (n >= 4) {
    const z = Math.atanh(r);
    const se = 1 / Math.sqrt(n - 3);
    const zcrit = norminv(1 - (1 - conf) / 2);
    ci.lo = Math.tanh(z - zcrit * se);
    ci.hi = Math.tanh(z + zcrit * se);
  }
  const oneMinusR2 = Math.max(0, 1 - r * r);
  const t = oneMinusR2 === 0 ? (r > 0 ? Infinity : -Infinity) : r * Math.sqrt(df / oneMinusR2);
  const p = oneMinusR2 === 0 ? 0 : 2 * tcdf_upper(Math.abs(t), df);
  return { r, t, df, p, n, ci };
}

export function spearmanCorrelation(
  x: number[],
  y: number[],
  opts: { conf?: number } = {}
): SpearmanResult {
  const { xs, ys, n } = _pairwiseComplete(x, y);
  if (n < 3) {
    return {
      rho: NaN,
      t: NaN,
      df: 0,
      p: NaN,
      n,
      ci: { lo: NaN, hi: NaN },
      error: "Need ≥3 complete pairs",
    };
  }
  const { ranks: rx } = rankWithTies(xs);
  const { ranks: ry } = rankWithTies(ys);
  // Reuse the Pearson implementation on the rank vectors.
  const pearsonOnRanks = pearsonCorrelation(rx, ry, opts);
  if (pearsonOnRanks.error) {
    return {
      rho: NaN,
      t: NaN,
      df: n - 2,
      p: NaN,
      n,
      ci: { lo: NaN, hi: NaN },
      error: pearsonOnRanks.error,
    };
  }
  const rho = pearsonOnRanks.r;
  const df = n - 2;
  const oneMinusRho2 = Math.max(0, 1 - rho * rho);
  const t =
    oneMinusRho2 === 0 ? (rho > 0 ? Infinity : -Infinity) : rho * Math.sqrt(df / oneMinusRho2);
  const p = oneMinusRho2 === 0 ? 0 : 2 * tcdf_upper(Math.abs(t), df);
  const conf = opts.conf == null ? 0.95 : opts.conf;
  const ci = { lo: NaN, hi: NaN };
  if (n >= 4) {
    const z = Math.atanh(rho);
    const se = Math.sqrt((1 + (rho * rho) / 2) / (n - 3));
    const zcrit = norminv(1 - (1 - conf) / 2);
    ci.lo = Math.tanh(z - zcrit * se);
    ci.hi = Math.tanh(z + zcrit * se);
  }
  return { rho, t, df, p, n, ci };
}

export function kendallTau(
  x: number[],
  y: number[],
  opts: Record<string, unknown> = {}
): KendallResult {
  void opts;
  const { xs, ys, n } = _pairwiseComplete(x, y);
  if (n < 3) {
    return { tau: NaN, z: NaN, p: NaN, n, S: 0, error: "Need ≥3 complete pairs" };
  }
  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    const xi = xs[i],
      yi = ys[i];
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j] - xi;
      const dy = ys[j] - yi;
      if (dx === 0 || dy === 0) continue;
      S += dx > 0 === dy > 0 ? 1 : -1;
    }
  }
  const tieGroups = (arr: number[]): number[] => {
    // equiv-mutant: .slice() copy keeps xs intact; in-place sort is harmless only as xs is unused after
    const sorted = arr.slice().sort((a, b) => a - b);
    const groups: number[] = [];
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && sorted[j + 1] === sorted[i]) j++;
      const t = j - i + 1;
      if (t > 1) groups.push(t);
      i = j + 1;
    }
    return groups;
  };
  const tx = tieGroups(xs);
  const ty = tieGroups(ys);
  const sumPairs = (g: number[]): number => g.reduce((s, t) => s + (t * (t - 1)) / 2, 0);
  const n0 = (n * (n - 1)) / 2;
  const n1 = sumPairs(tx);
  const n2 = sumPairs(ty);
  if (n0 - n1 <= 0 || n0 - n2 <= 0) {
    return {
      tau: NaN,
      z: NaN,
      p: NaN,
      n,
      S,
      error: "Data are essentially constant (all ties in x or y)",
    };
  }
  const tau = S / Math.sqrt((n0 - n1) * (n0 - n2));
  let varS = (n * (n - 1) * (2 * n + 5)) / 18;
  for (const t of tx) varS -= (t * (t - 1) * (2 * t + 5)) / 18;
  for (const t of ty) varS -= (t * (t - 1) * (2 * t + 5)) / 18;
  if (tx.length && ty.length && n >= 3) {
    const sx3 = tx.reduce((s, t) => s + t * (t - 1) * (t - 2), 0);
    const sy3 = ty.reduce((s, t) => s + t * (t - 1) * (t - 2), 0);
    varS += (sx3 * sy3) / (9 * n * (n - 1) * (n - 2));
    const sx2 = tx.reduce((s, t) => s + t * (t - 1), 0);
    const sy2 = ty.reduce((s, t) => s + t * (t - 1), 0);
    varS += (sx2 * sy2) / (2 * n * (n - 1));
  }
  if (varS <= 0) {
    return { tau, z: NaN, p: NaN, n, S };
  }
  const z = S / Math.sqrt(varS);
  const p = 2 * normsf(Math.abs(z));
  return { tau, z, p, n, S };
}

// Diagnostic + recommendation for a paired scatter dataset.
interface SelectCorrelationAxis {
  axis: "x" | "y";
  n: number;
  W: number | null;
  p: number | null;
  normal: boolean | null;
  note?: string;
}
interface SelectCorrelationResult {
  n: number;
  normality: SelectCorrelationAxis[];
  allNormal: boolean;
  recommendation: { test: "pearson"; reason: string };
  suggestion?: { test: "spearman"; reason: string };
}

export function selectCorrelation(
  x: number[],
  y: number[],
  opts: { alphaNormality?: number } = {}
): SelectCorrelationResult {
  const alphaN = opts.alphaNormality != null ? opts.alphaNormality : 0.05;
  const { xs, ys, n } = _pairwiseComplete(x, y);
  if (n < 3) {
    return {
      n,
      normality: [],
      allNormal: false,
      recommendation: { test: "pearson", reason: "Need ≥3 complete pairs to test a correlation." },
    };
  }
  const swCheck = (arr: number[], axis: "x" | "y"): SelectCorrelationAxis => {
    if (arr.length < 3) {
      return { axis, n: arr.length, W: null, p: null, normal: null, note: "n<3" };
    }
    const sw = shapiroWilk(arr);
    if (sw.error) {
      return { axis, n: arr.length, W: null, p: null, normal: null, note: sw.error };
    }
    return { axis, n: arr.length, W: sw.W, p: sw.p, normal: sw.p >= alphaN };
  };
  const normality: SelectCorrelationAxis[] = [swCheck(xs, "x"), swCheck(ys, "y")];
  const allKnownNormal = normality.every((r) => r.normal === true);
  const flagged = normality.filter((r) => r.normal === false);
  const test = "pearson" as const;
  const baseDefault =
    "Default pick: Pearson product-moment correlation. Pearson is the most powerful test when both axes are approximately normal; Spearman and Kendall stay available as rank-based alternatives.";
  const swNarrative = ((): string => {
    if (flagged.length === 0 && allKnownNormal) {
      return `Shapiro-Wilk did not reject normality on x or y at α = ${alphaN}.`;
    }
    if (flagged.length > 0) {
      const labels = flagged
        .map((r) => `${r.axis} (W=${(r.W as number).toFixed(3)}, p=${formatP(r.p)})`)
        .join(", ");
      return `Shapiro-Wilk flagged ${labels} as non-normal at α = ${alphaN}.`;
    }
    return "Shapiro-Wilk could not run on one or both axes (n < 3).";
  })();
  let suggestion: { test: "spearman"; reason: string } | undefined;
  let suggestionNarrative = "";
  if (flagged.length > 0) {
    suggestion = {
      test: "spearman",
      reason:
        "Shapiro-Wilk flagged at least one axis as non-normal. Spearman ranks both axes before correlating, which is more robust to heavy tails and outliers than Pearson.",
    };
    suggestionNarrative =
      " If the non-normality looks substantive (heavy tails, strong skew, ordinal data), consider switching to Spearman ρ from the test dropdown; for very small or heavily-tied samples Kendall τ-b is a further alternative.";
  }
  const overrideHint =
    " You can override this pick from the stats panel's per-test dropdown; the trace below shows the diagnostics the recommendation is based on.";
  const out: SelectCorrelationResult = {
    n,
    normality,
    allNormal: allKnownNormal,
    recommendation: {
      test,
      reason: `${baseDefault} ${swNarrative}${suggestionNarrative}${overrideHint}`,
    },
  };
  if (suggestion) out.suggestion = suggestion;
  return out;
}

// ── 10. k-sample effect sizes ────────────────────────────────────────────────

export function etaSquared(groups: number[][]): number {
  const a = oneWayANOVA(groups);
  if (a.error) return NaN;
  const ssTotal = (a.ssBetween as number) + (a.ssWithin as number);
  return ssTotal === 0 ? 0 : (a.ssBetween as number) / ssTotal;
}

export function epsilonSquared(groups: number[][]): number {
  const kw = kruskalWallis(groups);
  if (kw.error) return NaN;
  let N = 0;
  for (const g of groups) N += g.length;
  return N > 1 ? kw.H / (N - 1) : NaN;
}

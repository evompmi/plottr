// stats/categorical.ts — tests and intervals for counts / proportions.
//
// Every function mirrors an R reference so the benchmark can pin it:
//   wilsonCI              — prop.test(x, n, correct = FALSE)$conf.int
//   binomTest             — binom.test(x, n, p)$p.value
//   chiSquareIndependence — chisq.test(table, correct = …)
//   chiSquareGOF          — chisq.test(x, p = probs)
//   fisherExact           — fisher.test(table) (2×2: p, conditional-MLE odds
//                           ratio + CI; R×C: exact p with a seeded Monte-Carlo
//                           fallback, R's simulate.p.value formula)
//   multinomialExactGOF   — exact multinomial goodness-of-fit (sum of the
//                           probabilities of every outcome no more likely
//                           than the observed one; R has no base function —
//                           the benchmark enumerates with dmultinom)
//   holmAdjust            — p.adjust(p, "holm")
//
// Two-sided exact p-values use R's convention: sum the probabilities of all
// outcomes whose probability is ≤ the observed one × (1 + 1e-7). The relative
// slack keeps outcomes that tie with the observed one (up to floating-point
// noise) on the "as extreme" side.
//
// Wilson rather than Wald for proportion CIs: Brown, Cai & DasGupta (2001)
// show the Wald interval's coverage is erratic and often far below nominal,
// even for large n; the Wilson score interval is their recommended default.

import { chi2cdf_upper, gammaln } from "./dist";
import { bhAdjust } from "./posthoc";
import { arrayMax, seededRandom } from "../numeric";

const LOG_REL_ERR = Math.log1p(1e-7);

// ── log-factorial (cached table, gammaln beyond it) ─────────────────────────

const LFACT_CACHE_MAX = 100000;
const LFACT: number[] = [0];

export function logFactorial(n: number): number {
  if (n > LFACT_CACHE_MAX) return gammaln(n + 1);
  for (let i = LFACT.length; i <= n; i++) LFACT[i] = LFACT[i - 1] + Math.log(i);
  return LFACT[n];
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function isCount(v: number): boolean {
  return Number.isInteger(v) && v >= 0;
}

function validTable(table: number[][]): boolean {
  if (!Array.isArray(table) || table.length < 2) return false;
  const c = table[0].length;
  if (c < 2) return false;
  return table.every((row) => row.length === c && row.every(isCount));
}

function rowSums(table: number[][]): number[] {
  return table.map((row) => row.reduce((a, b) => a + b, 0));
}

function colSums(table: number[][]): number[] {
  return table[0].map((_, j) => table.reduce((a, row) => a + row[j], 0));
}

// ── Normal quantile (Wichura 1988, AS 241 PPND16) ──────────────────────────
// Full double precision (~1e-16), same algorithm as R's qnorm. dist.ts's
// norminv (Acklam, ~1e-9) is fine for power/CI work elsewhere, but Wilson
// bounds are pinned to R's prop.test at machine precision.

export function qnormPrecise(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (
      (q *
        (((((((r * 2509.0809287301227 + 33430.57558358813) * r + 67265.7709270087) * r +
          45921.95393154987) *
          r +
          13731.69376550946) *
          r +
          1971.5909503065513) *
          r +
          133.14166789178438) *
          r +
          3.3871328727963665)) /
      (((((((r * 5226.495278852546 + 28729.085735721943) * r + 39307.89580009271) * r +
        21213.794301586597) *
        r +
        5394.196021424751) *
        r +
        687.1870074920579) *
        r +
        42.31333070160091) *
        r +
        1)
    );
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let val: number;
  if (r <= 5) {
    r -= 1.6;
    val =
      (((((((r * 0.0007745450142783414 + 0.022723844989269184) * r + 0.2417807251774506) * r +
        1.2704582524523684) *
        r +
        3.6478483247632045) *
        r +
        5.769497221460691) *
        r +
        4.630337846156546) *
        r +
        1.4234371107496835) /
      (((((((r * 1.0507500716444169e-9 + 0.0005475938084995345) * r + 0.015198666563616457) * r +
        0.14810397642748008) *
        r +
        0.6897673349851) *
        r +
        1.6763848301838038) *
        r +
        2.053191626637759) *
        r +
        1);
  } else {
    r -= 5;
    val =
      (((((((r * 2.0103343992922881e-7 + 0.000027115555687434876) * r + 0.0012426609473880784) * r +
        0.026532189526576124) *
        r +
        0.29656057182850487) *
        r +
        1.7848265399172913) *
        r +
        5.463784911164114) *
        r +
        6.657904643501103) /
      (((((((r * 2.0442631033899397e-15 + 1.421511758316446e-7) * r + 0.000018463183175100548) * r +
        0.0007868691311456133) *
        r +
        0.014875361290850615) *
        r +
        0.1369298809227358) *
        r +
        0.599832206555888) *
        r +
        1);
  }
  return q < 0 ? -val : val;
}

// ── Wilson score interval ───────────────────────────────────────────────────

export interface ProportionCI {
  p: number;
  lower: number;
  upper: number;
}

export function wilsonCI(x: number, n: number, conf = 0.95): ProportionCI {
  if (!isCount(x) || !isCount(n) || n === 0 || x > n || !(conf > 0 && conf < 1)) {
    return { p: NaN, lower: NaN, upper: NaN };
  }
  const z = qnormPrecise((1 + conf) / 2);
  const p = x / n;
  const z22n = (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + z22n / (2 * n));
  const lower = x === 0 ? 0 : (p + z22n - half) / (1 + 2 * z22n);
  const upper = x === n ? 1 : (p + z22n + half) / (1 + 2 * z22n);
  return { p, lower: Math.max(0, lower), upper: Math.min(1, upper) };
}

// ── Holm step-down adjustment ───────────────────────────────────────────────

export function holmAdjust(ps: number[]): number[] {
  const idx = ps.map((_, i) => i).filter((i) => !Number.isNaN(ps[i]));
  const m = idx.length;
  // Stable sort, as R's order() is.
  const order = [...idx].sort((a, b) => ps[a] - ps[b] || a - b);
  const out = ps.map(() => NaN);
  let running = 0;
  order.forEach((i, rank) => {
    running = Math.max(running, (m - rank) * ps[i]);
    out[i] = Math.min(1, running);
  });
  return out;
}

// ── Exact binomial test ─────────────────────────────────────────────────────

function logDbinom(x: number, n: number, p: number): number {
  if (p === 0) return x === 0 ? 0 : -Infinity;
  if (p === 1) return x === n ? 0 : -Infinity;
  return logChoose(n, x) + x * Math.log(p) + (n - x) * Math.log1p(-p);
}

export interface BinomTestResult {
  p: number;
  estimate: number;
  error?: string;
}

export function binomTest(x: number, n: number, p0 = 0.5): BinomTestResult {
  if (!isCount(x) || !isCount(n) || n === 0 || x > n || !(p0 >= 0 && p0 <= 1)) {
    return { p: NaN, estimate: NaN, error: "invalid input" };
  }
  const estimate = x / n;
  if (p0 === 0) return { p: x === 0 ? 1 : 0, estimate };
  if (p0 === 1) return { p: x === n ? 1 : 0, estimate };
  const m = n * p0;
  if (x === m) return { p: 1, estimate };
  const thr = logDbinom(x, n, p0) + LOG_REL_ERR;
  // Sum every outcome no more likely than the observed one. The pmf is
  // unimodal, so this equals R's two-tail construction.
  let p = 0;
  for (let i = 0; i <= n; i++) {
    const ld = logDbinom(i, n, p0);
    if (ld <= thr) p += Math.exp(ld);
  }
  return { p: Math.min(1, p), estimate };
}

// ── χ² test of independence ─────────────────────────────────────────────────

export interface ChiSquareResult {
  X2: number;
  df: number;
  p: number;
  expected: number[][];
  stdres: number[][];
  cramersV: number;
  yates: boolean;
  minExpected: number;
  nExpectedBelow5: number;
  error?: string;
}

function chi2Error(msg: string): ChiSquareResult {
  return {
    X2: NaN,
    df: NaN,
    p: NaN,
    expected: [],
    stdres: [],
    cramersV: NaN,
    yates: false,
    minExpected: NaN,
    nExpectedBelow5: 0,
    error: msg,
  };
}

export function expectedCounts(table: number[][]): number[][] {
  const sr = rowSums(table);
  const sc = colSums(table);
  const n = sr.reduce((a, b) => a + b, 0);
  return sr.map((r) => sc.map((c) => (r * c) / n));
}

export function chiSquareIndependence(
  table: number[][],
  opts: { correct?: boolean } = {}
): ChiSquareResult {
  if (!validTable(table)) return chi2Error("table must be ≥2×2 non-negative integer counts");
  const sr = rowSums(table);
  const sc = colSums(table);
  if (sr.some((v) => v === 0) || sc.some((v) => v === 0)) {
    return chi2Error("every row and column needs a non-zero total");
  }
  const n = sr.reduce((a, b) => a + b, 0);
  const nr = table.length;
  const nc = table[0].length;
  const E = expectedCounts(table);
  let yates = 0;
  if (opts.correct && nr === 2 && nc === 2) {
    let minDev = Infinity;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) minDev = Math.min(minDev, Math.abs(table[i][j] - E[i][j]));
    yates = Math.min(0.5, minDev);
  }
  let X2 = 0;
  let X2raw = 0;
  let minExpected = Infinity;
  let nExpectedBelow5 = 0;
  const stdres: number[][] = [];
  for (let i = 0; i < nr; i++) {
    const row: number[] = [];
    for (let j = 0; j < nc; j++) {
      const e = E[i][j];
      const dev = Math.abs(table[i][j] - e);
      X2 += (dev - yates) ** 2 / e;
      X2raw += (dev * dev) / e;
      minExpected = Math.min(minExpected, e);
      if (e < 5) nExpectedBelow5++;
      const v = (sc[j] * sr[i] * (n - sr[i]) * (n - sc[j])) / n ** 3;
      row.push((table[i][j] - e) / Math.sqrt(v));
    }
    stdres.push(row);
  }
  const df = (nr - 1) * (nc - 1);
  return {
    X2,
    df,
    p: chi2cdf_upper(X2, df),
    expected: E,
    stdres,
    cramersV: Math.sqrt(X2raw / (n * (Math.min(nr, nc) - 1))),
    yates: yates > 0,
    minExpected,
    nExpectedBelow5,
  };
}

// ── Goodness of fit ─────────────────────────────────────────────────────────

export interface GOFResult {
  p: number;
  method: "exact" | "chi2";
  X2: number;
  df: number;
  expected: number[];
  stdres: number[];
  // True when the exact test was requested but the outcome space exceeded
  // the enumeration cap, so the χ² approximation was returned instead.
  fallback: boolean;
  error?: string;
}

function normaliseProbs(probs: number[]): number[] | null {
  if (!probs.every((v) => Number.isFinite(v) && v > 0)) return null;
  const s = probs.reduce((a, b) => a + b, 0);
  return probs.map((v) => v / s);
}

function gofError(msg: string): GOFResult {
  return {
    p: NaN,
    method: "chi2",
    X2: NaN,
    df: NaN,
    expected: [],
    stdres: [],
    fallback: false,
    error: msg,
  };
}

export function chiSquareGOF(observed: number[], ratio: number[]): GOFResult {
  const probs = normaliseProbs(ratio);
  if (!probs || observed.length !== probs.length || observed.length < 2) {
    return gofError("ratio must have one positive entry per category");
  }
  if (!observed.every(isCount)) return gofError("counts must be non-negative integers");
  const n = observed.reduce((a, b) => a + b, 0);
  if (n === 0) return gofError("no observations");
  const expected = probs.map((p) => n * p);
  let X2 = 0;
  const stdres = observed.map((o, i) => {
    X2 += (o - expected[i]) ** 2 / expected[i];
    return (o - expected[i]) / Math.sqrt(expected[i] * (1 - probs[i]));
  });
  const df = observed.length - 1;
  return { p: chi2cdf_upper(X2, df), method: "chi2", X2, df, expected, stdres, fallback: false };
}

export const MULTINOMIAL_EXACT_MAX_OUTCOMES = 2_000_000;

export function multinomialOutcomeCount(n: number, k: number): number {
  return Math.round(Math.exp(logChoose(n + k - 1, k - 1)));
}

export function multinomialExactGOF(
  observed: number[],
  ratio: number[],
  maxOutcomes = MULTINOMIAL_EXACT_MAX_OUTCOMES
): GOFResult {
  const chi = chiSquareGOF(observed, ratio);
  if (chi.error) return chi;
  const probs = normaliseProbs(ratio) as number[];
  const k = observed.length;
  const n = observed.reduce((a, b) => a + b, 0);
  if (k === 2) {
    return { ...chi, p: binomTest(observed[0], n, probs[0]).p, method: "exact" };
  }
  if (multinomialOutcomeCount(n, k) > maxOutcomes) return { ...chi, fallback: true };
  const logp = probs.map(Math.log);
  const base = logFactorial(n);
  const logPmf = (xs: number[]): number =>
    xs.reduce((acc, x, i) => acc + x * logp[i] - logFactorial(x), base);
  const logObs = logPmf(observed);
  const thr = logObs + LOG_REL_ERR;
  // Accumulate relative to the observed probability to stay in range.
  let sum = 0;
  const walk = (i: number, left: number, acc: number): void => {
    if (i === k - 1) {
      const lp = acc + left * logp[i] - logFactorial(left);
      if (lp <= thr) sum += Math.exp(lp - logObs);
      return;
    }
    for (let x = 0; x <= left; x++) {
      walk(i + 1, left - x, acc + x * logp[i] - logFactorial(x));
    }
  };
  walk(0, n, base);
  return { ...chi, p: Math.min(1, sum * Math.exp(logObs)), method: "exact" };
}

// ── Fisher's exact test ─────────────────────────────────────────────────────

export interface FisherResult {
  p: number;
  // "exact" — full (pruned) enumeration; "monteCarlo" — R×C table too large
  // to enumerate within the node budget, p simulated from B random tables
  // with the observed margins (R: simulate.p.value = TRUE formula).
  method: "exact" | "monteCarlo";
  B?: number;
  // Binomial standard error of the simulated p (Monte-Carlo only).
  mcSE?: number;
  // 2×2 only: R's conditional maximum-likelihood odds ratio and its CI.
  oddsRatio?: number;
  orCI?: [number, number];
  error?: string;
}

export interface FisherOptions {
  conf?: number;
  maxWork?: number;
  B?: number;
  seed?: number;
}

export const FISHER_MAX_WORK = 2_000_000;
export const FISHER_MC_B = 20_000;
export const FISHER_MC_SEED = 20010501;

// 2×2 machinery, following R's fisher.test internals (dnhyper / mnhyper /
// pnhyper) with the noncentrality parameter solved on the log scale by a
// bracketed bisection to full double precision (R's uniroot stops at
// ~1.2e-4, so R's printed estimate can differ from ours in the 4th digit).
interface NcHyper {
  support: number[];
  logdc: number[];
  lo: number;
  hi: number;
}

function ncHyper(m: number, n: number, k: number): NcHyper {
  const lo = Math.max(0, k - n);
  const hi = Math.min(k, m);
  const support: number[] = [];
  const logdc: number[] = [];
  const denom = logChoose(m + n, k);
  for (let x = lo; x <= hi; x++) {
    support.push(x);
    logdc.push(logChoose(m, x) + logChoose(n, k - x) - denom);
  }
  return { support, logdc, lo, hi };
}

function dnhyper(h: NcHyper, logNcp: number): number[] {
  const d = h.logdc.map((l, i) => l + logNcp * h.support[i]);
  const mx = arrayMax(d);
  const e = d.map((v) => Math.exp(v - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function mnhyper(h: NcHyper, logNcp: number): number {
  const d = dnhyper(h, logNcp);
  return d.reduce((acc, v, i) => acc + v * h.support[i], 0);
}

function pnhyper(h: NcHyper, q: number, logNcp: number, upper: boolean): number {
  const d = dnhyper(h, logNcp);
  let s = 0;
  h.support.forEach((x, i) => {
    if (upper ? x >= q : x <= q) s += d[i];
  });
  return s;
}

// Root of an increasing function f(θ) = target on the real line.
function solveIncreasing(f: (t: number) => number, target: number): number {
  let lo = -1;
  let hi = 1;
  while (f(lo) > target && lo > -1e4) lo *= 2;
  while (f(hi) < target && hi < 1e4) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-13 * Math.max(1, Math.abs(lo)); i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function fisher2x2(table: number[][], conf: number): FisherResult {
  const m = table[0][0] + table[1][0];
  const n = table[0][1] + table[1][1];
  const k = table[0][0] + table[0][1];
  const x = table[0][0];
  const h = ncHyper(m, n, k);
  const idx = x - h.lo;
  const thr = h.logdc[idx] + LOG_REL_ERR;
  let p = 0;
  h.logdc.forEach((l) => {
    if (l <= thr) p += Math.exp(l);
  });
  p = Math.min(1, p);

  let oddsRatio: number;
  if (h.lo === h.hi) oddsRatio = NaN;
  else if (x === h.lo) oddsRatio = 0;
  else if (x === h.hi) oddsRatio = Infinity;
  else oddsRatio = Math.exp(solveIncreasing((t) => mnhyper(h, t), x));

  const alpha = (1 - conf) / 2;
  let lower: number;
  let upper: number;
  if (h.lo === h.hi) {
    lower = 0;
    upper = Infinity;
  } else {
    // Lower bound: upper-tail probability P(X ≥ x; ψ) = α, increasing in ψ.
    lower = x === h.lo ? 0 : Math.exp(solveIncreasing((t) => pnhyper(h, x, t, true), alpha));
    // Upper bound: lower-tail P(X ≤ x; ψ) = α, decreasing in ψ.
    upper =
      x === h.hi ? Infinity : Math.exp(solveIncreasing((t) => -pnhyper(h, x, t, false), -alpha));
  }
  return { p, method: "exact", oddsRatio, orCI: [lower, upper] };
}

// R×C exact p by a network algorithm (after Mehta & Patel 1983). Tables are
// built column by column. A node is the multiset of row totals still to be
// filled; every path reaching a node carries its "past" log-weight
// −Σ lfact(n_ij) over the columns placed so far, and paths with equal past
// weight merge. For each node, bounds on the log-weight of any completion
// decide each past in O(1): if even the most probable completion is no more
// likely than the observed table, every completion counts (their total mass
// has a closed form); if even the least probable completion is more likely,
// none does. Only undecided pasts are expanded. Returns null when the work
// budget is exceeded (the caller falls back to Monte-Carlo).
function fisherRxCExact(table: number[][], maxWork: number): number | null {
  // Orient so rows are the shorter dimension (fewer compositions per column).
  let t = table;
  if (t.length > t[0].length) t = t[0].map((_, j) => t.map((row) => row[j]));
  // Insertion sort, descending — rows are few, and this runs per composition.
  const desc = (xs: number[]): number[] => {
    const out = xs.slice();
    for (let i = 1; i < out.length; i++) {
      const v = out[i];
      let k = i - 1;
      while (k >= 0 && out[k] < v) {
        out[k + 1] = out[k];
        k--;
      }
      out[k + 1] = v;
    }
    return out;
  };
  const r = desc(rowSums(t));
  const c = desc(colSums(t));
  const N = r.reduce((a, b) => a + b, 0);
  const nr = r.length;
  const nc = c.length;
  const sumLf = (xs: number[]): number => xs.reduce((a, v) => a + logFactorial(v), 0);
  const K0 = sumLf(r) + sumLf(c) - logFactorial(N);
  const logObs = K0 - t.reduce((a, row) => a + sumLf(row), 0);
  const thr = logObs + LOG_REL_ERR;

  // Suffix sums of column totals and of their log-factorials.
  const cSuffix: number[] = new Array(nc + 1).fill(0);
  const lcSuffix: number[] = new Array(nc + 1).fill(0);
  for (let j = nc - 1; j >= 0; j--) {
    cSuffix[j] = cSuffix[j + 1] + c[j];
    lcSuffix[j] = lcSuffix[j + 1] + logFactorial(c[j]);
  }

  // Compositions of `total` over rows capped by `caps`; calls `fn(x, dw)`
  // with dw = −Σ lfact(x_i). Returns false as soon as `fn` does.
  const compositions = (
    total: number,
    caps: number[],
    fn: (x: number[], dw: number) => boolean
  ): boolean => {
    const capAfter: number[] = new Array(nr + 1).fill(0);
    for (let i = nr - 1; i >= 0; i--) capAfter[i] = capAfter[i + 1] + caps[i];
    const x: number[] = new Array(nr).fill(0);
    const place = (i: number, left: number, acc: number): boolean => {
      if (i === nr - 1) {
        x[i] = left;
        return fn(x, acc - logFactorial(left));
      }
      const lo = Math.max(0, left - capAfter[i + 1]);
      const hi = Math.min(caps[i], left);
      for (let v = lo; v <= hi; v++) {
        x[i] = v;
        if (!place(i + 1, left - v, acc - logFactorial(v))) return false;
      }
      return true;
    };
    return place(0, total, 0);
  };

  // Bounds on the log-weight −Σ lfact(n_ij) of any completion from a node.
  // Upper: each remaining column spread as evenly as the row caps allow
  // (−lfact is concave), ignoring the coupling between columns — a valid
  // relaxation; for the last two columns the coupled maximum is exact (a
  // separable concave allocation, solved greedily). Lower: each column
  // concentrated into the largest caps (lfact is convex and superadditive),
  // again a relaxation, so ≤ the true minimum.
  const maxSpread = (total: number, caps: number[]): number => {
    const sorted = [...caps].sort((a, b) => a - b);
    let left = total;
    let acc = 0;
    for (let i = 0; i < sorted.length; i++) {
      const slots = sorted.length - i;
      if (sorted[i] * slots <= left) {
        acc -= logFactorial(sorted[i]);
        left -= sorted[i];
      } else {
        const base = Math.floor(left / slots);
        const extra = left - base * slots;
        return acc - extra * logFactorial(base + 1) - (slots - extra) * logFactorial(base);
      }
    }
    return acc;
  };
  const minConcentrate = (total: number, capsDesc: number[]): number => {
    let left = total;
    let acc = 0;
    for (const cap of capsDesc) {
      const x = Math.min(cap, left);
      acc -= logFactorial(x);
      left -= x;
      if (left === 0) break;
    }
    return acc;
  };
  // Max over x (Σx = total, 0 ≤ x_i ≤ rem_i) of −Σ [lfact(x_i) + lfact(rem_i − x_i)].
  const maxLastTwo = (total: number, rem: number[]): number => {
    const x: number[] = rem.map(() => 0);
    for (let u = 0; u < total; u++) {
      let best = -1;
      let gain = -Infinity;
      for (let i = 0; i < rem.length; i++) {
        if (x[i] >= rem[i]) continue;
        const g = Math.log((rem[i] - x[i]) / (x[i] + 1));
        if (g > gain) {
          gain = g;
          best = i;
        }
      }
      x[best]++;
    }
    return -rem.reduce((a, v, i) => a + logFactorial(x[i]) + logFactorial(v - x[i]), 0);
  };
  const boundMemo = new Map<string, [number, number]>();
  let work = 0;
  const bounds = (j: number, rem: number[]): [number, number] => {
    if (j === nc - 1) {
      const w = -sumLf(rem);
      return [w, w];
    }
    const key = j + "|" + rem.join(",");
    const hit = boundMemo.get(key);
    if (hit) return hit;
    let hiW = 0;
    let loW = 0;
    for (let jj = j; jj < nc; jj++) loW += minConcentrate(c[jj], rem);
    if (j === nc - 2) hiW = maxLastTwo(c[j], rem);
    else for (let jj = j; jj < nc; jj++) hiW += maxSpread(c[jj], rem);
    const res: [number, number] = [hiW, loW];
    boundMemo.set(key, res);
    return res;
  };

  interface NetNode {
    rem: number[]; // remaining row totals, sorted descending
    // past log-weight (rounded key) → exact weight + number of merged paths
    pasts: Map<number, { past: number; mult: number }>;
  }
  let stage = new Map<string, NetNode>();
  stage.set(r.join(","), { rem: r, pasts: new Map([[0, { past: K0, mult: 1 }]]) });
  let sum = 0; // Σ P(table) / P(observed) over tables at least as extreme
  for (let j = 0; j < nc; j++) {
    const next = new Map<string, NetNode>();
    for (const { rem, pasts } of stage.values()) {
      if (j === nc - 1) {
        const w = -sumLf(rem);
        for (const [, { past, mult }] of pasts) {
          if (past + w <= thr) sum += mult * Math.exp(past + w - logObs);
        }
        continue;
      }
      const [upper, lower] = bounds(j, rem);
      // Σ over completions of Π 1/n_ij! = Nrem! / (Π rem_i! Π c_j!).
      const logW = logFactorial(cSuffix[j]) - sumLf(rem) - lcSuffix[j];
      const live: [number, number][] = [];
      for (const [, { past, mult }] of pasts) {
        if (past + upper <= thr) sum += mult * Math.exp(past + logW - logObs);
        else if (past + lower <= thr) live.push([past, mult]);
      }
      work += pasts.size;
      if (live.length === 0) continue;
      if (j === nc - 2) {
        // The last column is forced, so each composition of this column
        // fixes a full completion. Sort the completion weights once and
        // answer every undecided past with a binary search over the
        // ascending cumulative mass (accumulated smallest-first).
        const ws: number[] = [];
        const ok = compositions(c[j], rem, (x, dw) => {
          ws.push(dw - sumLf(rem.map((v, i) => v - x[i])));
          return ++work <= maxWork;
        });
        if (!ok) return null;
        ws.sort((a, b) => a - b);
        const wRef = ws[ws.length - 1];
        const cum: number[] = [];
        let acc = 0;
        for (const w of ws) {
          acc += Math.exp(w - wRef);
          cum.push(acc);
        }
        for (const [past, mult] of live) {
          // Count of completions with past + w ≤ thr.
          let lo = 0;
          let hi = ws.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (past + ws[mid] <= thr) lo = mid + 1;
            else hi = mid;
          }
          if (lo > 0) sum += mult * Math.exp(past + wRef - logObs) * cum[lo - 1];
        }
        work += live.length;
        continue;
      }
      const ok = compositions(c[j], rem, (x, dw) => {
        const nextRem = desc(rem.map((v, i) => v - x[i]));
        const key = nextRem.join(",");
        const childBd = bounds(j + 1, nextRem);
        const childLogW = logFactorial(cSuffix[j + 1]) - sumLf(nextRem) - lcSuffix[j + 1];
        let node = next.get(key);
        for (const [past, mult] of live) {
          const np = past + dw;
          // Decide against the child's bounds now when possible, so only
          // still-undecided pasts are stored.
          if (np + childBd[0] <= thr) {
            sum += mult * Math.exp(np + childLogW - logObs);
            continue;
          }
          if (np + childBd[1] > thr) continue;
          if (!node) {
            node = { rem: nextRem, pasts: new Map() };
            next.set(key, node);
          }
          // Merge paths whose weights differ only by float noise.
          const k = Math.round(np * 1e9);
          const e = node.pasts.get(k);
          if (e) e.mult += mult;
          else node.pasts.set(k, { past: np, mult });
        }
        work += live.length;
        return work <= maxWork;
      });
      if (!ok) return null;
    }
    stage = next;
  }
  return Math.min(1, sum * Math.exp(logObs));
}

// Draw x ~ Hypergeometric(population N, K successes, n draws) by inversion.
function rhyper(N: number, K: number, n: number, u: number): number {
  const lo = Math.max(0, n - (N - K));
  const hi = Math.min(n, K);
  if (lo === hi) return lo;
  const lw: number[] = [];
  let mx = -Infinity;
  for (let x = lo; x <= hi; x++) {
    const v = logChoose(K, x) + logChoose(N - K, n - x);
    lw.push(v);
    if (v > mx) mx = v;
  }
  let s = 0;
  const w = lw.map((v) => {
    const e = Math.exp(v - mx);
    s += e;
    return e;
  });
  let target = u * s;
  for (let i = 0; i < w.length; i++) {
    target -= w[i];
    if (target <= 0) return lo + i;
  }
  return hi;
}

function fisherMonteCarlo(table: number[][], B: number, seed: number): FisherResult {
  const r = rowSums(table);
  const c = colSums(table);
  const nr = r.length;
  const nc = c.length;
  const stat = (t: number[][]): number =>
    -t.reduce((a, row) => a + row.reduce((b, v) => b + logFactorial(v), 0), 0);
  const thr = stat(table) + LOG_REL_ERR;
  const rand = seededRandom(seed);
  let hits = 0;
  const colRem: number[] = new Array(nc);
  for (let b = 0; b < B; b++) {
    for (let j = 0; j < nc; j++) colRem[j] = c[j];
    let s = 0;
    let pool = c.reduce((a, v) => a + v, 0);
    for (let i = 0; i < nr; i++) {
      let need = r[i];
      let poolRow = pool;
      for (let j = 0; j < nc; j++) {
        let x: number;
        if (i === nr - 1) x = colRem[j];
        else if (j === nc - 1) x = need;
        else x = rhyper(poolRow, colRem[j], need, rand());
        s -= logFactorial(x);
        poolRow -= colRem[j];
        colRem[j] -= x;
        need -= x;
      }
      pool -= r[i];
    }
    if (s <= thr) hits++;
  }
  const p = (1 + hits) / (B + 1);
  return { p, method: "monteCarlo", B, mcSE: Math.sqrt((p * (1 - p)) / B) };
}

export function fisherExact(table: number[][], opts: FisherOptions = {}): FisherResult {
  if (!validTable(table)) {
    return { p: NaN, method: "exact", error: "table must be ≥2×2 non-negative integer counts" };
  }
  const conf = opts.conf ?? 0.95;
  if (table.length === 2 && table[0].length === 2) return fisher2x2(table, conf);
  // Empty rows / columns carry no information and do not change p.
  const sr = rowSums(table);
  const sc = colSums(table);
  const trimmed = table.filter((_, i) => sr[i] > 0).map((row) => row.filter((_, j) => sc[j] > 0));
  if (trimmed.length < 2 || trimmed[0].length < 2) return { p: 1, method: "exact" };
  if (trimmed.length === 2 && trimmed[0].length === 2) {
    return { p: fisher2x2(trimmed, conf).p, method: "exact" };
  }
  const exact = fisherRxCExact(trimmed, opts.maxWork ?? FISHER_MAX_WORK);
  if (exact !== null) return { p: exact, method: "exact" };
  return fisherMonteCarlo(trimmed, opts.B ?? FISHER_MC_B, opts.seed ?? FISHER_MC_SEED);
}

// ── Test selection ──────────────────────────────────────────────────────────

export type CountsTest = "fisher" | "chi2";
export type CountsTestReason = "twoByTwo" | "cochranOk" | "cochranFail";

export interface CountsTestSelection {
  test: CountsTest;
  reason: CountsTestReason;
  minExpected: number;
  nExpectedBelow5: number;
  nCells: number;
}

// 2×2 → Fisher (exact and cheap). Larger tables → χ² when Cochran's rule
// holds (every expected count ≥ 1 and at most 20 % below 5), Fisher otherwise.
export function selectCountsTest(table: number[][]): CountsTestSelection {
  const E = expectedCounts(table);
  const flat = E.flat();
  const minExpected = Math.min(...flat);
  const nExpectedBelow5 = flat.filter((e) => e < 5).length;
  const nCells = flat.length;
  const base = { minExpected, nExpectedBelow5, nCells };
  if (table.length === 2 && table[0].length === 2) {
    return { test: "fisher", reason: "twoByTwo", ...base };
  }
  const ok = minExpected >= 1 && nExpectedBelow5 <= 0.2 * nCells;
  return ok
    ? { test: "chi2", reason: "cochranOk", ...base }
    : { test: "fisher", reason: "cochranFail", ...base };
}

// ── Pairwise comparisons between rows ───────────────────────────────────────

export type PAdjustMethod = "holm" | "bh";

export interface CountsPair {
  i: number;
  j: number;
  p: number;
  pAdj: number;
  method: "exact" | "monteCarlo";
  oddsRatio?: number;
}

// Fisher's exact test on every pair of rows (2 × k sub-table; columns empty
// in both rows dropped), then a familywise (Holm) or FDR (BH) adjustment.
export function pairwiseFisher(
  table: number[][],
  adjust: PAdjustMethod = "holm",
  opts: FisherOptions = {}
): CountsPair[] {
  const pairs: CountsPair[] = [];
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      const sub = [table[i], table[j]];
      const keep = sub[0].map((_, c) => sub[0][c] + sub[1][c] > 0);
      const trimmed = sub.map((row) => row.filter((_, c) => keep[c]));
      const both = trimmed[0].length >= 2 && rowSums(trimmed).every((v) => v > 0);
      const res = both ? fisherExact(trimmed, opts) : null;
      pairs.push({
        i,
        j,
        p: res ? res.p : 1,
        pAdj: NaN,
        method: res ? res.method : "exact",
        ...(res && res.oddsRatio !== undefined ? { oddsRatio: res.oddsRatio } : {}),
      });
    }
  }
  const raw = pairs.map((p) => p.p);
  const adj = adjust === "holm" ? holmAdjust(raw) : bhAdjust(raw);
  pairs.forEach((p, k) => {
    p.pAdj = adj[k];
  });
  return pairs;
}

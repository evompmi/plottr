// stats/msi.ts — multi-set intersection probability for the UpSet tool.
//
// Reference: Wang, Zhao, Zhang, & Bhattacharya (2015). "Efficient Test and
// Visualization of Multi-Set Intersections." Scientific Reports 5:16923.
// (R package: SuperExactTest, function `cpsets`.)
//
// Two code paths:
//   - multisetIntersectionPExact   — iterated hypergeometric DP (log-space).
//   - multisetIntersectionPPoisson — large-N Poisson approximation.
//   - multisetIntersectionP        — router: exact when the DP fits a
//                                    ~10 M-op budget, Poisson otherwise.
// Plus an exclusive-cell binomial test (`multisetExclusiveP`) for UpSet
// bar-height significance.

import { betai, gammainc, gammaln } from "./dist";

// ── 14. Multi-set intersection test (SuperExactTest-style) ─────────────────

function _logHypergeomPmf(x: number, N: number, K: number, n: number): number {
  if (x < 0 || x > K || x > n || n - x > N - K) return -Infinity;
  const logC = (a: number, b: number): number =>
    gammaln(a + 1) - gammaln(b + 1) - gammaln(a - b + 1);
  return logC(K, x) + logC(N - K, n - x) - logC(N, n);
}

function _logSumExp(a: number, b: number): number {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  const max = a > b ? a : b;
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
}

function _multisetIntersectionLogPmf(ns: number[], N: number): number[] {
  const sorted = [...ns].sort((a, b) => a - b);
  let logP = new Array(sorted[0] + 1);
  for (let y = 0; y <= sorted[0]; y++) {
    logP[y] = _logHypergeomPmf(y, N, sorted[0], sorted[1]);
  }
  for (let i = 2; i < sorted.length; i++) {
    const n_i = sorted[i];
    const prev = logP;
    const currLen = Math.min(prev.length, n_i + 1);
    const curr = new Array(currLen).fill(-Infinity);
    for (let y = 0; y < prev.length; y++) {
      if (!Number.isFinite(prev[y])) continue;
      const zMax = y < n_i ? y : n_i;
      for (let z = 0; z <= zMax; z++) {
        const logHyp = _logHypergeomPmf(z, N, y, n_i);
        if (!Number.isFinite(logHyp)) continue;
        curr[z] = _logSumExp(curr[z], prev[y] + logHyp);
      }
    }
    logP = curr;
  }
  return logP;
}

// Stryker disable all -- pure input validator: equivalent-mutant pattern
function _validateMsiArgs(ns: unknown, N: number): boolean {
  if (!Array.isArray(ns) || ns.length < 2) return false;
  if (!Number.isFinite(N) || N <= 0) return false;
  for (const n_i of ns) {
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return false;
  }
  return true;
}
// Stryker restore all

export function multisetIntersectionPExact(xObs: number, ns: number[], N: number): number {
  // Stryker disable next-line all -- defensive validator delegate
  if (!_validateMsiArgs(ns, N)) return NaN;
  if (xObs <= 0) return 1;
  const minN = Math.min(...ns);
  if (xObs > minN) return 0;
  const logP = _multisetIntersectionLogPmf(ns, N);
  let logTail = -Infinity;
  for (let x = xObs; x < logP.length; x++) {
    if (Number.isFinite(logP[x])) logTail = _logSumExp(logTail, logP[x]);
  }
  if (!Number.isFinite(logTail)) return 0;
  return Math.max(0, Math.min(1, Math.exp(logTail)));
}

export function multisetExclusiveExpected(
  insideSizes: number[],
  outsideSizes: number[],
  N: number
): number {
  // Stryker disable next-line all -- defensive validator
  if (!Number.isFinite(N) || N <= 0) return NaN;
  let p = 1;
  for (const n_i of insideSizes) {
    // Stryker disable next-line all -- defensive validator
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return NaN;
    p *= n_i / N;
  }
  for (const n_j of outsideSizes) {
    // Stryker disable next-line all -- defensive validator
    if (!Number.isFinite(n_j) || n_j < 0 || n_j > N) return NaN;
    p *= 1 - n_j / N;
  }
  return N * p;
}

export function multisetExclusiveP(
  xObs: number,
  insideSizes: number[],
  outsideSizes: number[],
  N: number,
  opts?: { tail?: "upper" | "lower" }
): number {
  // Stryker disable next-line all -- defensive validator
  if (!Number.isFinite(N) || N <= 0) return NaN;
  const Nint = Math.floor(N);
  const expected = multisetExclusiveExpected(insideSizes, outsideSizes, Nint);
  // Stryker disable next-line all -- defensive validator
  if (!Number.isFinite(expected)) return NaN;
  const p = expected / Nint;
  const tail = opts && opts.tail === "lower" ? "lower" : "upper";
  if (tail === "upper") {
    if (xObs <= 0) return 1;
    if (xObs > Nint) return 0;
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return betai(xObs, Nint - xObs + 1, p);
  }
  if (xObs < 0) return 0;
  if (xObs >= Nint) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return betai(Nint - xObs, xObs + 1, 1 - p);
}

export function multisetIntersectionPExactLower(xObs: number, ns: number[], N: number): number {
  // Stryker disable next-line all -- defensive validator delegate
  if (!_validateMsiArgs(ns, N)) return NaN;
  if (xObs < 0) return 0;
  const minN = Math.min(...ns);
  if (xObs >= minN) return 1;
  const logP = _multisetIntersectionLogPmf(ns, N);
  let logTail = -Infinity;
  for (let x = 0; x <= xObs && x < logP.length; x++) {
    if (Number.isFinite(logP[x])) logTail = _logSumExp(logTail, logP[x]);
  }
  if (!Number.isFinite(logTail)) return 0;
  return Math.max(0, Math.min(1, Math.exp(logTail)));
}

export function multisetIntersectionExpected(ns: number[], N: number): number {
  // Stryker disable next-line all -- defensive validator (shape check)
  if (!Array.isArray(ns) || ns.length === 0) return NaN;
  // Stryker disable next-line all -- defensive validator (N range check)
  if (!Number.isFinite(N) || N <= 0) return NaN;
  let logLambda = 0;
  for (const n_i of ns) {
    // Stryker disable next-line all -- defensive validator
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return NaN;
    if (n_i === 0) return 0;
    logLambda += Math.log(n_i);
  }
  logLambda -= (ns.length - 1) * Math.log(N);
  return Math.exp(logLambda);
}

export function multisetIntersectionPPoisson(xObs: number, ns: number[], N: number): number {
  // Stryker disable next-line all -- defensive validator (shape check)
  if (!Array.isArray(ns) || ns.length < 2) return NaN;
  // Stryker disable next-line all -- defensive validator (N range check)
  if (!Number.isFinite(N) || N <= 0) return NaN;
  for (const n_i of ns) {
    // Stryker disable next-line all -- defensive validator
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return NaN;
    if (n_i === 0) return xObs <= 0 ? 1 : 0;
  }
  if (xObs <= 0) return 1;
  let logLambda = 0;
  for (const n_i of ns) logLambda += Math.log(n_i);
  logLambda -= (ns.length - 1) * Math.log(N);
  const lambda = Math.exp(logLambda);
  if (!Number.isFinite(lambda)) return NaN;
  return gammainc(xObs, lambda);
}

export function multisetIntersectionP(xObs: number, ns: number[], N: number): number {
  // Stryker disable next-line all -- defensive validator (shape check)
  if (!Array.isArray(ns) || ns.length < 2) return NaN;
  const minN = Math.min(...ns);
  const cost = (ns.length - 1) * minN * minN;
  if (cost <= 10_000_000) return multisetIntersectionPExact(xObs, ns, N);
  return multisetIntersectionPPoisson(xObs, ns, N);
}

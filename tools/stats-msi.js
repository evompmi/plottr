// stats-msi.js — multi-set intersection probability for the UpSet tool.
//
// Reference: Wang, Zhao, Zhang, & Bhattacharya (2015). "Efficient Test and
// Visualization of Multi-Set Intersections." Scientific Reports 5:16923.
// (R package: SuperExactTest, function `cpsets`.)
//
// Depends on stats-dist.js for `gammaln`, `betai`, and `gammainc`.
//
// Two code paths:
//   - multisetIntersectionPExact   — iterated hypergeometric DP (log-space).
//   - multisetIntersectionPPoisson — large-N Poisson approximation.
//   - multisetIntersectionP        — router: exact when the DP fits a
//                                    ~10 M-op budget, Poisson otherwise.
// Plus an exclusive-cell binomial test (`multisetExclusiveP`) for UpSet
// bar-height significance.

// ── 14. Multi-set intersection test (SuperExactTest-style) ─────────────────
//
// Under the null of k independent uniformly-random subsets S_1 … S_k of a
// universe U (|U| = N), each with fixed size n_i, what is the probability of
// observing an intersection of size ≥ x_obs?
//
// Reference: Wang, Zhao, Zhang, & Bhattacharya (2015). "Efficient Test and
// Visualization of Multi-Set Intersections." Scientific Reports 5:16923.
// (R package: SuperExactTest, function `cpsets`.)
//
// Two code paths:
//
//   `multisetIntersectionPExact` — iterated hypergeometric conditioning.
//     Y_2 = |S_1 ∩ S_2| ~ Hypergeometric(N, n_1, n_2)
//     Y_i | Y_{i-1} ~ Hypergeometric(N, Y_{i-1}, n_i)  for i ≥ 3
//   We maintain the log-probability distribution of Y_i at each step and
//   marginalise via logSumExp. Returns exp(logTail). All combinatorics run in
//   log-space (stats.js has gammaln) so nothing overflows for N up to ~50 k.
//
//   `multisetIntersectionPPoisson` — large-N approximation. When N is big and
//   the expected intersection size λ = Π(n_i)/N^(k-1) is moderate, |∩| is
//   well-approximated by Poisson(λ). The upper tail is the lower regularised
//   incomplete gamma `P(x_obs, λ)` = `gammainc(x_obs, λ)`.
//
//   `multisetIntersectionP` — router. Picks exact when the DP cost k · min(n_i)²
//   fits a ~10 M-op budget; falls back to Poisson otherwise.
//
// Convention: returned p is a strict upper tail P(|∩| ≥ x_obs) — the "is the
// observed overlap surprisingly large?" question. R's `cpsets` with
// `lower.tail=FALSE` uses P(|∩| > x), so benchmark rows pass `x_obs - 1`.

function _logHypergeomPmf(x, N, K, n) {
  // log P(X = x) for X ~ Hypergeometric(N, K, n). Returns -Infinity on an
  // out-of-support argument so logSumExp skips it.
  if (x < 0 || x > K || x > n || n - x > N - K) return -Infinity;
  const logC = (a, b) => gammaln(a + 1) - gammaln(b + 1) - gammaln(a - b + 1);
  return logC(K, x) + logC(N - K, n - x) - logC(N, n);
}

function _logSumExp(a, b) {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  const max = a > b ? a : b;
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
}

// Internal: full log-probability distribution of |∩ S_i| under the fixed-
// margin null. Factored out of the public `multisetIntersectionPExact` so
// `multisetIntersectionPExactLower` can reuse the DP result instead of
// recomputing it. Returns an array indexed 0 … min(ns); entries outside
// the support are -Infinity.
function _multisetIntersectionLogPmf(ns, N) {
  // Caller has already validated ns.length ≥ 2, N > 0, and 0 ≤ n_i ≤ N.
  // Smallest set first — keeps intermediate Y vectors narrower (Y_i is bounded
  // by min of {Y_{i-1}, n_i}, so sorting ascending shrinks the state space).
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

// Stryker disable all -- pure input validator: when this lets bad inputs
// through, the algorithm body propagates NaN/Infinity through arithmetic
// and the caller still sees NaN, so individual clauses are equivalent
// mutants. The relevant caller-visible behaviour (NaN on bad shape) is
// pinned in tests/stats.property.test.js's "invalid args → NaN" tests.
function _validateMsiArgs(ns, N) {
  if (!Array.isArray(ns) || ns.length < 2) return false;
  if (!Number.isFinite(N) || N <= 0) return false;
  for (const n_i of ns) {
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return false;
  }
  return true;
}
// Stryker restore all

function multisetIntersectionPExact(xObs, ns, N) {
  // Stryker disable next-line all -- defensive validator delegate; equivalent-mutant pattern (bad inputs would NaN through the DP anyway)
  if (!_validateMsiArgs(ns, N)) return NaN;
  if (xObs <= 0) return 1;
  const minN = Math.min(...ns);
  if (xObs > minN) return 0;
  const logP = _multisetIntersectionLogPmf(ns, N);
  // Upper tail: P(|∩| ≥ x_obs).
  let logTail = -Infinity;
  for (let x = xObs; x < logP.length; x++) {
    if (Number.isFinite(logP[x])) logTail = _logSumExp(logTail, logP[x]);
  }
  if (!Number.isFinite(logTail)) return 0;
  return Math.max(0, Math.min(1, Math.exp(logTail)));
}

// Lower-tail companion: P(|∩| ≤ x_obs) — the depletion test. Same DP as
// `multisetIntersectionPExact`, opposite sum direction. Use this when the
// observed overlap is SMALLER than the expected intersection size
// (`multisetIntersectionExpected`) and you want to test under-enrichment.
// ── Exclusive-cell test (UpSet bar height) ────────────────────────────────
//
// The inclusive-intersection primitives above answer "is |∩ S_i| enriched?"
// (SuperExactTest). But what a user reads off an UpSet bar is the EXCLUSIVE
// count: items in every `inside` set AND no `outside` set. Those are
// different quantities, with different expected values.
//
// Under the independence approximation (each item independently falls in
// S_i with probability n_i/N), the exclusive count for a cell defined by
//   inside = {S_i1, …, S_ip},  outside = {S_j1, …, S_jq}
// is Binomial(N, p_M) with
//   p_M = Π_{i∈inside}(n_i/N) · Π_{j∈outside}(1 − n_j/N)
//
// E[x_exc] = N · p_M, and the p-value uses the regularized incomplete beta
// to compute the Binomial tail without building the CDF term-by-term.
//
// Why not the fixed-margin exact here? That's a 2^k multivariate
// hypergeometric — intractable past k ≈ 6 and overkill for the UI case.
// The independence Binomial is what published UpSet-style exclusive-cell
// tests (VennPlex, pybedtools shuffle reference tables) use.

function multisetExclusiveExpected(insideSizes, outsideSizes, N) {
  // Stryker disable next-line all -- defensive validator; bad N collapses the product to NaN/Infinity through arithmetic anyway, equivalent mutants
  if (!Number.isFinite(N) || N <= 0) return NaN;
  let p = 1;
  for (const n_i of insideSizes) {
    // Stryker disable next-line all -- defensive validator (same reasoning as the N guard above)
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return NaN;
    p *= n_i / N;
  }
  for (const n_j of outsideSizes) {
    // Stryker disable next-line all -- defensive validator (same reasoning)
    if (!Number.isFinite(n_j) || n_j < 0 || n_j > N) return NaN;
    p *= 1 - n_j / N;
  }
  return N * p;
}

// Binomial tail via regularized incomplete beta.
//   tail = "upper" → P(X ≥ x) = I_p(x, N − x + 1)
//   tail = "lower" → P(X ≤ x) = I_{1−p}(N − x, x + 1)
function multisetExclusiveP(xObs, insideSizes, outsideSizes, N, opts) {
  // Stryker disable next-line all -- defensive validator; same reasoning as multisetExclusiveExpected
  if (!Number.isFinite(N) || N <= 0) return NaN;
  const Nint = Math.floor(N);
  const expected = multisetExclusiveExpected(insideSizes, outsideSizes, Nint);
  // Stryker disable next-line all -- defensive: expected is NaN exactly when its inputs are bad; this rethrow is redundant with the upstream check inside multisetExclusiveExpected
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

function multisetIntersectionPExactLower(xObs, ns, N) {
  // Stryker disable next-line all -- defensive validator delegate; equivalent-mutant pattern (bad inputs would NaN through the algorithm body anyway)
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

// Expected value of |∩ S_i| under the fixed-margin null: each item
// independently falls in every S_i with marginal probability n_i / N, so the
// expected intersection size is N · Π(n_i / N) = Π(n_i) / N^(k-1). Kept in
// log-space to avoid Π(n_i) overflow for large k or n_i.
function multisetIntersectionExpected(ns, N) {
  // Stryker disable next-line all -- defensive validator (shape check)
  if (!Array.isArray(ns) || ns.length === 0) return NaN;
  // Stryker disable next-line all -- defensive validator (N range check); equivalent-mutant pattern via NaN propagation through Math.log(N)
  if (!Number.isFinite(N) || N <= 0) return NaN;
  let logLambda = 0;
  for (const n_i of ns) {
    // Stryker disable next-line all -- defensive validator; same reasoning
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return NaN;
    if (n_i === 0) return 0;
    logLambda += Math.log(n_i);
  }
  logLambda -= (ns.length - 1) * Math.log(N);
  return Math.exp(logLambda);
}

function multisetIntersectionPPoisson(xObs, ns, N) {
  // Stryker disable next-line all -- defensive validator (shape check); equivalent-mutant pattern, bad inputs would propagate through gammainc as NaN
  if (!Array.isArray(ns) || ns.length < 2) return NaN;
  // Stryker disable next-line all -- defensive validator (N range check); same reasoning
  if (!Number.isFinite(N) || N <= 0) return NaN;
  for (const n_i of ns) {
    // Stryker disable next-line all -- defensive validator; same reasoning
    if (!Number.isFinite(n_i) || n_i < 0 || n_i > N) return NaN;
    if (n_i === 0) return xObs <= 0 ? 1 : 0;
  }
  if (xObs <= 0) return 1;
  // λ = Π(n_i / N) · N = Π(n_i) / N^(k-1). Compute in log-space to stay finite
  // when Π(n_i) overflows double precision (e.g. k=10, n_i=1000).
  let logLambda = 0;
  for (const n_i of ns) logLambda += Math.log(n_i);
  logLambda -= (ns.length - 1) * Math.log(N);
  const lambda = Math.exp(logLambda);
  if (!Number.isFinite(lambda)) return NaN;
  // P(Poisson(λ) ≥ x_obs) = P(x_obs, λ) (lower regularised incomplete gamma).
  return gammainc(xObs, lambda);
}

function multisetIntersectionP(xObs, ns, N) {
  // Stryker disable next-line all -- defensive validator (shape check); the dispatch below to PExact / PPoisson re-validates fully, so this guard is doubly redundant
  if (!Array.isArray(ns) || ns.length < 2) return NaN;
  // Exact DP cost is ~ (k - 1) · min(n_i)² log-sum-exp evaluations. Cap at
  // ~10 M ops so UI round-trips stay sub-second. Beyond that, Poisson is a
  // safe approximation for the regime (large N relative to the n_i).
  const minN = Math.min(...ns);
  const cost = (ns.length - 1) * minN * minN;
  if (cost <= 10_000_000) return multisetIntersectionPExact(xObs, ns, N);
  return multisetIntersectionPPoisson(xObs, ns, N);
}

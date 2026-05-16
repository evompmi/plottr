// Statistical tests — benchmarked against R output with ±0.5% tolerance.
//
// Reference values produced by running real R (stats::shapiro.test) on the
// same inputs. See the shapiroCases array below for the exact one-liners.
//
// Tolerance key:
//   1e-4  — distribution primitives (normcdf, gammaln, tcdf, ...)
//   5e-3  — test statistics (W) and p-values (matches power-tool bar)

const harness = require("./harness");

// Stats.test.js's R-cross-validation suite is mostly fast (~200ms total
// outside Stryker, all individual tests well under 100 ms). A few
// outliers internally drive numerical-convergence loops with 10⁴+
// quadrature evaluations — qtukey at very small df (df=1, 2),
// multisetIntersectionPExact at deep tails (k=5, p~1e-15) — and under
// Stryker's perTest-coverage instrumentation the per-line probe tax
// makes them ~3000× slower, which exceeds even a generous per-test
// timeout. Skipping the whole file under Stryker is the heavy hammer
// (it leaves only stats.property.test.js's 49 properties as Stryker-
// visible coverage of stats.js); skipping just the named outliers
// keeps the bulk of the cross-validation pinning while sidestepping
// the unfixable cases.
//
// Detection: Stryker copies the repo to a sandbox under `.stryker-tmp/
// sandbox-XXX/` and runs from there, so the cwd is a reliable signal.
const IS_STRYKER = process.cwd().includes(".stryker-tmp");

// Tests known to time out under Stryker even with generous budgets —
// the inner numerical loop is too long-running for any reasonable
// per-test timeout. Pinned by exact name; everything else in this file
// runs normally under Stryker.
const SKIP_UNDER_STRYKER = new Set([
  // qtukey at df=1 — the smallest df is the slowest because the
  // ptukey integrand has a heavy tail and the bisection bracket
  // expansion runs many iterations.
  "qtukey(0.999, 50, 1) > 100 (bracket actually expanded)",
  // multisetIntersectionPExact at k=5 deep tail — the dynamic-
  // programming table at this scale has ~10⁵ cells × log-space
  // exponentials.
  "k=5 deep tail p ~ 1e-15 matches R in log-space",
  // multisetIntersectionPExact at k=2 even deeper tail — same DP
  // structure, slightly smaller table but more iterations.
  "k=2 very deep tail p ~ 1e-31 matches R in log-space",
]);

const test = IS_STRYKER
  ? (name, fn) => (SKIP_UNDER_STRYKER.has(name) ? undefined : harness.test(name, fn))
  : harness.test;
const suite = harness.suite;
const { assert, approx, eq, summary } = harness;

// Load tools/stats.js via the shared loader (which require()'s a CJS
// wrapper instead of vm.runInContext). The require() path makes the
// source visible to Stryker's per-test coverage instrumentation; the
// vm path hides it. Behaviourally identical to the prior inline load
// — every function this file destructures is auto-exported by the
// loader's source-scanning footer.
const {
  normcdf,
  normsf,
  norminv,
  tcdf,
  tcdf_upper,
  fcdf,
  fcdf_upper,
  tinv,
  shapiroWilk,
  sampleMean,
  sampleVariance,
  sampleSD,
  rankWithTies,
  leveneTest,
  tTest,
  mannWhitneyU,
  cohenD,
  cohenDCI,
  hedgesG,
  rankBiserial,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  nctcdf,
  ncf_sf,
  ncchi2cdf,
  etaSquared,
  epsilonSquared,
  ptukey,
  qtukey,
  tukeyHSD,
  gamesHowell,
  bhAdjust,
  dunnTest,
  compactLetterDisplay,
  selectTest,
  bisect,
  powerAnova,
  chi2inv,
  chi2cdf,
  pairwiseDistance,
  rowDistance,
  hclust,
  dendrogramLayout,
  kmeans,
  // Power functions — kept Stryker-invisible until now because
  // tests/power.test.js loaded them via vm.runInContext; the require-via-
  // tmp-file path here gives Stryker line-level coverage tracing.
  powerTwoSample,
  powerPaired,
  powerOneSample,
  powerCorrelation,
  powerChi2,
  fFromGroupMeans,
  // Distribution helpers with no direct caller test (only reached via
  // internal callers Stryker traces partially).
  tpdf,
  chi2pdf,
  betai,
  betai_upper,
  gammaln,
  gammainc,
  gammainc_upper,
  formatP,
  pStars,
  // `ctx` mirrors every export — kept for the few suites that reach in
  // for underscore-prefixed internals (`_wprob`, `_wprob_upper`) or
  // less-frequently-used names. Behaviourally identical to the prior
  // vm.runInContext pattern's `ctx`.
  ctx,
} = require("./helpers/stats-loader");

// ── Primitives smoke test ──────────────────────────────────────────────────
// Power-tool tests already cover these exhaustively — here we just confirm
// stats.js loads cleanly and exposes the primitives as globals.

suite("stats.js — primitive smoke tests");

test("normcdf(0) === 0.5", () => approx(normcdf(0), 0.5, 1e-4));
test("normcdf(1.96) ≈ 0.975", () => approx(normcdf(1.96), 0.975, 1e-4));
test("tcdf(0, 10) === 0.5", () => approx(tcdf(0, 10), 0.5, 1e-4));

// ── Audit-23 #12 — direct primitive edge + symmetry tests ──────────────────
//
// The primitives are well-covered indirectly through the high-level tests
// they feed (tTest uses tinv, fcdf etc.). These tests pin behaviour the
// transitive coverage masks: a regression that breaks tcdf symmetry or
// chi2cdf(x<0) return value would still pass the high-level tests because
// the breakage gets clamped before surfacing.

suite("primitive edges — symmetry + boundaries (audit-23 #12)");

test("normcdf is reflection-symmetric: normcdf(-x) = 1 - normcdf(x)", () => {
  for (const x of [0.1, 0.5, 1, 1.96, 3, 4, 5, 7.5]) {
    approx(normcdf(-x), 1 - normcdf(x), 1e-12);
  }
});

test("normcdf saturates at extreme +/- inputs without overflow", () => {
  // Both should return finite results; the asymptotic expansion in normsf
  // takes over above |x| = 7 and stays accurate to ~1e-300.
  approx(normcdf(20), 1, 1e-15);
  approx(normcdf(-20), 0, 1e-15);
  // Very large positive x — the implementation routes through normsf which
  // returns a tiny but finite probability. Not exactly 1.
  assert(normcdf(50) > 1 - 1e-15 && normcdf(50) <= 1, "normcdf(50) ≈ 1");
  assert(normcdf(-50) >= 0 && normcdf(-50) < 1e-15, "normcdf(-50) ≈ 0");
});

test("norminv handles boundary p=0 and p=1 by returning ±Infinity", () => {
  // Documented contract: clamp at infinities rather than NaN. Tests pin
  // this so a future "guard" that returns NaN doesn't quietly break power
  // analysis solvers that rely on the +/-Infinity sentinel.
  eq(norminv(0), -Infinity);
  eq(norminv(1), Infinity);
  // Out-of-range still maps to infinity (saturate instead of NaN).
  eq(norminv(-0.5), -Infinity);
  eq(norminv(1.5), Infinity);
});

test("tcdf symmetry: tcdf(-x, df) = 1 - tcdf(x, df) for any df ≥ 1", () => {
  for (const df of [1, 2, 5, 10, 30, 100]) {
    for (const x of [0.5, 1, 2, 3, 5]) {
      approx(tcdf(-x, df), 1 - tcdf(x, df), 1e-10);
    }
  }
});

test("tcdf(0, df) = 0.5 across df", () => {
  for (const df of [1, 2, 5, 10, 100, 1000]) {
    approx(tcdf(0, df), 0.5, 1e-12);
  }
});

test("fcdf(0, d1, d2) === 0", () => {
  // F is right-bounded at 0; cdf at 0 must be exactly 0.
  for (const [d1, d2] of [
    [1, 1],
    [1, 5],
    [3, 50],
    [10, 100],
  ]) {
    eq(fcdf(0, d1, d2), 0);
  }
});

test("fcdf(-x, d1, d2) === 0 (out-of-domain saturates)", () => {
  // Negative F has no probability mass; implementation guards `f <= 0`.
  eq(fcdf(-5, 3, 50), 0);
  eq(fcdf(-1e-9, 1, 1), 0);
});

test("chi2cdf(x ≤ 0, k) === 0", () => {
  // Chi-square is supported on [0, ∞); cdf at or below 0 must be 0.
  eq(chi2cdf(0, 1), 0);
  eq(chi2cdf(0, 5), 0);
  eq(chi2cdf(-1, 5), 0);
  eq(chi2cdf(-1e9, 30), 0);
});

test("chi2cdf grows monotonically with x for fixed df", () => {
  for (const k of [1, 5, 30]) {
    let prev = -1;
    for (const x of [0.1, 1, 5, 10, 30, 100]) {
      const cur = chi2cdf(x, k);
      assert(cur > prev, `chi2cdf monotonicity broke at k=${k}, x=${x}`);
      prev = cur;
    }
  }
});

test("tinv ↔ tcdf round-trip stays tight at small + large df", () => {
  // Existing tests cover df=2,3,5,10,30. Here: pin the boundary cases that
  // exercise different code paths inside tinv (df=1 closed form, df→large
  // Cornish-Fisher approximation).
  for (const df of [1, 2, 4, 50, 200]) {
    for (const p of [0.05, 0.25, 0.75, 0.95]) {
      approx(tcdf(tinv(p, df), df), p, 1e-9);
    }
  }
});

// ── Audit-23 #19 — pin the formatP contract ────────────────────────────────
//
// formatP collapses every non-finite p to "—" by convention. The audit
// flagged the lack of distinction (p === 0 underflow vs Infinity vs NaN
// vs negative all share one display) as a low-priority polish concern.
// Per Plöttr's "silent libraries" rule, stats.js doesn't emit console.warn
// for impossible values either. These tests pin the existing contract so a
// future change has to be deliberate, not silent.

suite("formatP — non-finite contract (audit-23 #19)");

test("null / undefined return '—'", () => {
  eq(formatP(null), "—");
  eq(formatP(undefined), "—");
});

test("NaN, +Infinity, -Infinity all return '—'", () => {
  eq(formatP(NaN), "—");
  eq(formatP(Infinity), "—");
  eq(formatP(-Infinity), "—");
});

test("negative or > 1 finite values still pass through to numeric format (silent)", () => {
  // Documented as known: formatP doesn't sanity-check the [0, 1] domain. A
  // numerical regression that produces negative p or p > 1 would format
  // numerically, not "—" — but it would NOT crash, and the deltas vs the
  // legitimate range are large enough that a downstream caller's display
  // ("p = -0.5" or "p = 1.5") would still look clearly wrong to a user.
  // Pinning so the next contributor knows the policy is "trust the caller,
  // never throw, never warn". If you change this, update the audit too.
  eq(typeof formatP(-0.5), "string");
  eq(typeof formatP(1.5), "string");
  // Nothing about "—" — these legitimately go through the toFixed branch.
  assert(formatP(-0.5) !== "—", "negative p must NOT collapse to em-dash today");
  assert(formatP(1.5) !== "—", "p > 1 must NOT collapse to em-dash today");
});

test("p === 0 (underflow) renders as '0.0e+0' via toExponential", () => {
  // p === 0 is technically finite, so it goes through the < 1e-4 branch,
  // not the non-finite "—" branch. Matches what users see when a numerical
  // chain underflows to literal zero.
  eq(formatP(0), "0.0e+0");
});

test("standard format ranges", () => {
  // Pin the format thresholds so a future "small refactor" of the cutoffs
  // doesn't silently shift display across releases. Boundaries use strict
  // `<`: p === 1e-3 falls into the `toFixed(4)` branch (not toExponential),
  // p === 1e-4 falls into the `toExponential(2)` branch (not (1)).
  eq(formatP(0.5), "0.5000"); // ≥ 1e-3 — toFixed(4)
  eq(formatP(1e-3), "0.0010"); // == 1e-3 boundary, NOT < 1e-3 — toFixed(4)
  eq(formatP(5e-4), "5.00e-4"); // strictly < 1e-3 but ≥ 1e-4 — toExponential(2)
  eq(formatP(1e-4), "1.00e-4"); // == 1e-4 boundary, NOT < 1e-4 — toExponential(2)
  eq(formatP(5e-5), "5.0e-5"); // strictly < 1e-4 — toExponential(1)
  eq(formatP(1e-9), "1.0e-9"); // deep tail — toExponential(1)
});

// ── pStars — significance-star contract ───────────────────────────────────
//
// pStars maps a p-value to the 4-level star scale used on plot annotations
// ("****" / "***" / "**" / "*" / "ns") with an empty-string fallback for
// non-finite p. No direct caller test existed until the post-1.5.0 mutation
// audit — the function was only exercised through render-smoke tests, which
// don't assert on chart text content, so every boundary mutant survived.
// These tests pin the contract exhaustively: each of the four strict-`<`
// thresholds is tested just-below and at-the-boundary, the non-finite
// short-circuit is tested for each non-finite shape, and the "ns" tail is
// tested for in-range and well-above values.

suite("pStars — non-finite contract");

test("null / undefined → ''", () => {
  eq(pStars(null), "");
  eq(pStars(undefined), "");
});

test("NaN, +Infinity, -Infinity → ''", () => {
  eq(pStars(NaN), "");
  eq(pStars(Infinity), "");
  eq(pStars(-Infinity), "");
});

suite("pStars — boundary thresholds (strict <)");

test("p just below 1e-4 → '****'", () => {
  eq(pStars(9.99e-5), "****");
  eq(pStars(1e-9), "****"); // deep tail still on this rung
});

test("p === 1e-4 → '***' (NOT '****'; boundary is strict <)", () => {
  eq(pStars(1e-4), "***");
});

test("p just below 1e-3 → '***'", () => {
  eq(pStars(9.99e-4), "***");
  eq(pStars(5e-4), "***");
});

test("p === 1e-3 → '**' (NOT '***'; boundary is strict <)", () => {
  eq(pStars(1e-3), "**");
});

test("p just below 1e-2 → '**'", () => {
  eq(pStars(9.99e-3), "**");
  eq(pStars(5e-3), "**");
});

test("p === 0.01 → '*' (NOT '**'; boundary is strict <)", () => {
  eq(pStars(0.01), "*");
});

test("p just below 0.05 → '*'", () => {
  eq(pStars(0.04999), "*");
  eq(pStars(0.025), "*");
});

test("p === 0.05 → 'ns' (NOT '*'; boundary is strict <)", () => {
  eq(pStars(0.05), "ns");
});

test("p >> 0.05 → 'ns'", () => {
  eq(pStars(0.5), "ns");
  eq(pStars(1), "ns");
});

test("p === 0 (underflow) → '****'", () => {
  // 0 is finite, so it doesn't trip the non-finite gate; it then satisfies
  // every strict-< check and lands on the smallest-p rung.
  eq(pStars(0), "****");
});

test("fcdf + fcdf_upper sum to 1 in the central body", () => {
  // Tail-accurate fcdf_upper exists to avoid the 1 - fcdf cancellation at
  // F > 50; in the central body both routes should agree to high precision.
  for (const [d1, d2, f] of [
    [1, 1, 0.5],
    [3, 50, 4],
    [5, 100, 2.5],
    [10, 30, 1.8],
  ]) {
    approx(fcdf(f, d1, d2) + fcdf_upper(f, d1, d2), 1, 1e-12);
  }
});

// ── tinv extreme-quantile coverage ─────────────────────────────────────────
//
// Earlier revisions used pure bisection with hard-coded or lightly-expanded
// bounds, which under-resolved heavy-tail cases. The current implementation
// uses closed forms for df = 1 and df = 2, and Newton-Raphson seeded with a
// Cornish-Fisher correction for df ≥ 3 (bisection fallback). Reference
// values from R's qt(). Tolerances here are absolute and tight enough to
// catch any regression to plain bisection.

test("tinv standard critical values match R qt()", () => {
  // All reference values generated with R: qt(p, df). 1e-10 absolute
  // tolerance is tight enough to fail for the old ±50 bisection or any
  // future regression to plain bisection.
  approx(tinv(0.025, 2), -4.3026527297494637, 1e-10);
  approx(tinv(0.01, 5), -3.3649299989072179, 1e-10);
  approx(tinv(0.975, 10), 2.2281388519862735, 1e-10);
  approx(tinv(0.5, 10), 0, 1e-12);
});

test("tinv closed forms — df=1 (Cauchy) and df=2", () => {
  approx(tinv(0.001, 1), -318.30883898555049, 1e-9);
  approx(tinv(0.99, 1), 31.820515953773935, 1e-10);
  approx(tinv(0.01, 2), -6.9645567342832733, 1e-10);
  approx(tinv(0.75, 2), 0.81649658092772592, 1e-12);
});

test("tinv handles extreme quantiles beyond the old ±50 clamp", () => {
  // R> qt(1e-6, 3)      = -103.2995
  // R> qt(1e-10, 2)     = -70710.6781
  // R> qt(1e-10, 5)     = -156.825592708894
  // R> qt(1e-15, 3)     = -103311.08359285
  // R> qt(1 - 1e-12, 30) = 11.397227795416
  approx(tinv(1e-6, 3), -103.2995, 1e-3);
  approx(tinv(1e-10, 2), -70710.6781, 1e-2);
  approx(tinv(1e-10, 5), -156.825592708894, 1e-7);
  approx(tinv(1e-15, 3), -103311.08359285, 1e-4);
  approx(tinv(1 - 1e-12, 30), 11.397227795416, 1e-10);
});

test("tinv symmetric near p=1 without catastrophic cancellation", () => {
  // Upper-tail inputs are handled by folding into the left tail, so the
  // implementation must be antisymmetric across 0.5 to the precision
  // allowed by the float representation of (1 - p). We stay at eps ≥ 1e-6
  // so that (1 - eps) round-trips cleanly — below that, the subtraction
  // 1 - (1 - eps) itself loses precision regardless of the solver.
  for (const df of [1, 2, 3, 10, 50]) {
    for (const eps of [1e-3, 1e-6]) {
      const lo = tinv(eps, df);
      const hi = tinv(1 - eps, df);
      approx(hi, -lo, 1e-9 * (Math.abs(lo) + 1));
    }
  }
});

test("tinv round-trips through tcdf at extreme p", () => {
  // Self-consistency: tcdf(tinv(p, df), df) ≈ p
  for (const df of [1, 2, 3, 10, 30]) {
    for (const p of [1e-8, 1e-4, 0.25, 0.75, 1 - 1e-4]) {
      const q = tinv(p, df);
      approx(tcdf(q, df), p, 1e-9);
    }
  }
});

// ── chi2inv: Newton-seeded inverse chi-square ──────────────────────────────
//
// Earlier revision was pure bisection (~50 iterations for 1e-10 tolerance).
// The current implementation seeds Newton from the Wilson-Hilferty cubic-
// normal approximation and falls back to bisection in the saturated tails
// where the χ² PDF collapses below 1e-12 and Newton would overshoot.
// Reference values from R's qchisq(); central-body tests target tight
// tolerance, tail tests verify round-trip self-consistency.

suite("stats.js — chi2inv vs R");

test("chi2inv standard critical values match R qchisq()", () => {
  approx(chi2inv(0.95, 1), 3.841459, 1e-5);
  approx(chi2inv(0.95, 5), 11.0705, 1e-5);
  approx(chi2inv(0.99, 10), 23.20925, 1e-5);
  approx(chi2inv(0.5, 20), 19.33743, 1e-5);
  approx(chi2inv(0.001, 100), 61.91752, 1e-3);
  approx(chi2inv(0.999, 100), 149.4493, 1e-4);
});

test("chi2inv handles small df accurately", () => {
  approx(chi2inv(0.5, 1), 0.4549364, 1e-6);
  approx(chi2inv(0.025, 2), 0.05063562, 1e-7);
  approx(chi2inv(0.975, 2), 7.377759, 1e-5);
});

test("chi2inv round-trips through chi2cdf (central body)", () => {
  for (const k of [1, 2, 5, 10, 30, 100]) {
    for (const p of [0.001, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 0.999]) {
      const x = chi2inv(p, k);
      approx(chi2cdf(x, k), p, 1e-8);
    }
  }
});

test("chi2inv degenerate inputs", () => {
  assert(chi2inv(0, 5) === 0, "p=0 → 0");
  assert(chi2inv(1, 5) === Infinity, "p=1 → Infinity");
  assert(Number.isNaN(chi2inv(0.5, 0)), "k=0 → NaN");
  assert(Number.isNaN(chi2inv(0.5, -1)), "k<0 → NaN");
});

// ── Distribution domain guards ─────────────────────────────────────────────
//
// A finite but invalid degrees-of-freedom / shape parameter (0, negative)
// used to yield a finite *wrong* number — tcdf(t, 0) returned 1, fcdf with
// d1=0 returned 0 — instead of NaN. These pin the consistent `df <= 0 → NaN`
// guard across the distribution surface (chi2inv already had it).

suite("stats.js — distribution domain guards");

test("non-positive df / shape parameter → NaN", () => {
  for (const bad of [0, -1, -7.5]) {
    assert(Number.isNaN(tcdf(1.5, bad)), `tcdf df=${bad}`);
    assert(Number.isNaN(tcdf_upper(1.5, bad)), `tcdf_upper df=${bad}`);
    assert(Number.isNaN(tinv(0.7, bad)), `tinv df=${bad}`);
    assert(Number.isNaN(chi2cdf(3, bad)), `chi2cdf k=${bad}`);
    assert(Number.isNaN(chi2pdf(3, bad)), `chi2pdf k=${bad}`);
    assert(Number.isNaN(nctcdf(1.5, bad, 1)), `nctcdf df=${bad}`);
    assert(Number.isNaN(ncchi2cdf(3, bad, 1)), `ncchi2cdf k=${bad}`);
    assert(Number.isNaN(fcdf(2, bad, 5)) && Number.isNaN(fcdf(2, 5, bad)), `fcdf d=${bad}`);
    assert(
      Number.isNaN(fcdf_upper(2, bad, 5)) && Number.isNaN(fcdf_upper(2, 5, bad)),
      `fcdf_upper d=${bad}`
    );
    assert(
      Number.isNaN(ncf_sf(2, bad, 5, 1)) && Number.isNaN(ncf_sf(2, 5, bad, 1)),
      `ncf_sf d=${bad}`
    );
  }
});

test("a valid df / shape still computes a finite result (guard does not over-fire)", () => {
  assert(tcdf(1.5, 10) > 0 && Number.isFinite(tcdf(1.5, 10)), "tcdf df=10");
  assert(Number.isFinite(tcdf_upper(1.5, 10)), "tcdf_upper df=10");
  assert(Number.isFinite(tinv(0.7, 10)), "tinv df=10");
  assert(Number.isFinite(fcdf(2, 3, 12)) && Number.isFinite(fcdf_upper(2, 3, 12)), "fcdf");
  assert(Number.isFinite(chi2cdf(3, 4)) && Number.isFinite(chi2pdf(3, 4)), "chi2");
  assert(Number.isFinite(nctcdf(1.5, 10, 1)), "nctcdf");
  assert(Number.isFinite(ncf_sf(2, 3, 12, 1)), "ncf_sf");
  assert(Number.isFinite(ncchi2cdf(3, 4, 1)), "ncchi2cdf");
});

// ── Sample helpers ─────────────────────────────────────────────────────────

suite("stats.js — sample helpers");

const xs = [2, 4, 4, 4, 5, 5, 7, 9];
test("sampleMean", () => approx(sampleMean(xs), 5, 1e-12));
test("sampleVariance (n-1)", () => approx(sampleVariance(xs), 32 / 7, 1e-12));
test("sampleSD", () => approx(sampleSD(xs), Math.sqrt(32 / 7), 1e-12));

test("sampleVariance is shift-invariant under large offsets (Welford)", () => {
  // The naive E[X²] − E[X]² formula loses all precision once the data are
  // offset by ~10⁹ or so, because both terms become huge and nearly equal.
  // Welford's online algorithm holds up to ~10¹⁵ before IEEE 754 mantissa
  // limits start to bite the inputs themselves. Verify the result is
  // exactly the same as on the unshifted data at three offset scales.
  const small = [1, 2, 3, 4, 5];
  const v = sampleVariance(small); // = 2.5
  approx(v, 2.5, 1e-12);
  approx(sampleVariance(small.map((x) => x + 1e6)), 2.5, 1e-10);
  approx(sampleVariance(small.map((x) => x + 1e9)), 2.5, 1e-6);
  approx(sampleVariance(small.map((x) => x + 1e12)), 2.5, 1e-3);
});

test("rankWithTies — no ties", () => {
  const { ranks, tieCorrection } = rankWithTies([10, 20, 30]);
  assert(ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3, "ranks [1,2,3]");
  assert(tieCorrection === 0, "no tie correction");
});

test("rankWithTies — with ties", () => {
  // values = [1, 2, 2, 3] → ranks [1, 2.5, 2.5, 4]
  const { ranks, tieCorrection } = rankWithTies([1, 2, 2, 3]);
  assert(ranks[0] === 1, "rank of 1");
  assert(ranks[1] === 2.5 && ranks[2] === 2.5, "tied ranks");
  assert(ranks[3] === 4, "rank of 3");
  // tie group size = 2 → t³−t = 8−2 = 6
  assert(tieCorrection === 6, "tie correction = 6");
});

test("rankWithTies — unsorted input preserves original positions", () => {
  // Regression guard: a broken array-sort comparator ((a,b)=>a-b on pairs)
  // would produce NaN comparisons and give garbage ranks here.
  const { ranks } = rankWithTies([50, 10, 30, 40, 20]);
  // sorted values: 10,20,30,40,50 → ranks 1..5
  // back to original positions: [50→5, 10→1, 30→3, 40→4, 20→2]
  assert(
    ranks[0] === 5 && ranks[1] === 1 && ranks[2] === 3 && ranks[3] === 4 && ranks[4] === 2,
    `ranks out of order: ${ranks.join(",")}`
  );
});

test("rankWithTies — interleaved duplicates", () => {
  // [3, 1, 2, 1, 3, 2] sorted: 1,1,2,2,3,3 → ranks 1.5,1.5,3.5,3.5,5.5,5.5
  // back to original positions: 3→5.5, 1→1.5, 2→3.5, 1→1.5, 3→5.5, 2→3.5
  const { ranks, tieCorrection } = rankWithTies([3, 1, 2, 1, 3, 2]);
  const expected = [5.5, 1.5, 3.5, 1.5, 5.5, 3.5];
  for (let i = 0; i < 6; i++) {
    assert(ranks[i] === expected[i], `ranks[${i}]=${ranks[i]} expected ${expected[i]}`);
  }
  // Three tie groups of size 2 each → each contributes 2^3-2 = 6; total 18
  assert(tieCorrection === 18, `tieCorrection=${tieCorrection}`);
});

// ── Shapiro-Wilk vs R ──────────────────────────────────────────────────────
//
// Each case is: (label, data, W_from_R, p_from_R)
// R code to reproduce (one per case):
//   x <- c(...); shapiro.test(x)

suite("stats.js — Shapiro-Wilk (W and p vs R)");

// Every W/p below was generated by running shapiro.test in R 4.x on the exact
// numeric vector shown, not copied from memory. To re-verify:
//   Rscript -e 'x <- c(...); print(shapiro.test(x))'
const shapiroCases = [
  {
    // R> shapiro.test(datasets::iris$Sepal.Length)  → W=0.976090  p=0.0101812
    label: "iris Sepal.Length (n=150)",
    x: [
      5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9, 5.4, 4.8, 4.8, 4.3, 5.8, 5.7, 5.4, 5.1, 5.7,
      5.1, 5.4, 5.1, 4.6, 5.1, 4.8, 5.0, 5.0, 5.2, 5.2, 4.7, 4.8, 5.4, 5.2, 5.5, 4.9, 5.0, 5.5, 4.9,
      4.4, 5.1, 5.0, 4.5, 4.4, 5.0, 5.1, 4.8, 5.1, 4.6, 5.3, 5.0, 7.0, 6.4, 6.9, 5.5, 6.5, 5.7, 6.3,
      4.9, 6.6, 5.2, 5.0, 5.9, 6.0, 6.1, 5.6, 6.7, 5.6, 5.8, 6.2, 5.6, 5.9, 6.1, 6.3, 6.1, 6.4, 6.6,
      6.8, 6.7, 6.0, 5.7, 5.5, 5.5, 5.8, 6.0, 5.4, 6.0, 6.7, 6.3, 5.6, 5.5, 5.5, 6.1, 5.8, 5.0, 5.6,
      5.7, 5.7, 6.2, 5.1, 5.7, 6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2, 6.5, 6.4, 6.8, 5.7,
      5.8, 6.4, 6.5, 7.7, 7.7, 6.0, 6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2, 7.4, 7.9, 6.4,
      6.3, 6.1, 7.7, 6.3, 6.4, 6.0, 6.9, 6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
    ],
    W: 0.97609,
    p: 0.0101812,
  },
  {
    // R> shapiro.test(datasets::PlantGrowth$weight) → W=0.982683  p=0.891507
    label: "PlantGrowth weight (n=30)",
    x: [
      4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14, 4.81, 4.17, 4.41, 3.59, 5.87, 3.83,
      6.03, 4.89, 4.32, 4.69, 6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26,
    ],
    W: 0.982683,
    p: 0.891507,
  },
  {
    // R> shapiro.test(datasets::sleep$extra) → W=0.946073  p=0.311375
    label: "sleep extra (n=20)",
    x: [
      0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0, 1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6,
      4.6, 3.4,
    ],
    W: 0.946073,
    p: 0.311375,
  },
  {
    // R> shapiro.test(c(1,2,3,4,5)) → W=0.986762  p=0.967174
    label: "uniform 1..5 (n=5)",
    x: [1, 2, 3, 4, 5],
    W: 0.986762,
    p: 0.967174,
  },
  {
    // R> shapiro.test(c(1,2,3)) → W=1  p=1
    label: "exact n=3",
    x: [1, 2, 3],
    W: 1,
    p: 1,
  },
  {
    // R> shapiro.test(c(1,1,1,1,2,2,3,4,8,20)) → W=0.628233  p=0.000120265
    label: "skewed n=10",
    x: [1, 1, 1, 1, 2, 2, 3, 4, 8, 20],
    W: 0.628233,
    p: 0.000120265,
  },
  {
    // R> shapiro.test(datasets::women$height) → W=0.963593  p=0.754533
    label: "women height (n=15)",
    x: [58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72],
    W: 0.963593,
    p: 0.754533,
  },
  {
    // R> shapiro.test(datasets::mtcars$mpg) → W=0.947565  p=0.122881
    label: "mtcars mpg (n=32)",
    x: [
      21.0, 21.0, 22.8, 21.4, 18.7, 18.1, 14.3, 24.4, 22.8, 19.2, 17.8, 16.4, 17.3, 15.2, 10.4,
      10.4, 14.7, 32.4, 30.4, 33.9, 21.5, 15.5, 15.2, 13.3, 19.2, 27.3, 26.0, 30.4, 15.8, 19.7,
      15.0, 21.4,
    ],
    W: 0.947565,
    p: 0.122881,
  },
];

// The shapiroWilk call deliberately lives inside each test body, not at
// module-load time in the for-loop. Stryker's per-test coverage map only
// records line hits during test-body execution; computing W/p in the loop
// and capturing them in closures attributes the hits on stats-tests.js's
// Royston polynomials to "module load" rather than to specific tests, so
// the per-test map shows zero coverage and Stryker doesn't run these tests
// against polynomial mutants.
for (const c of shapiroCases) {
  test(`${c.label} — W ≈ ${c.W}`, () => {
    // Tight tolerance on W: the actual JS-vs-R agreement is rel ~5e-7,
    // far inside the 6-sig-fig precision of the R reference values
    // themselves. The previous 5e-3 ceiling was 10,000× looser than the
    // genuine FP agreement, leaving room for a polynomial-coefficient
    // mutation to shift the result without failing the assertion.
    const { W } = shapiroWilk(c.x);
    const rel = Math.abs(W - c.W) / c.W;
    assert(rel < 5e-6, `W=${W.toFixed(7)} vs R=${c.W} (rel diff ${rel.toExponential(2)})`);
  });
  test(`${c.label} — p ≈ ${c.p}`, () => {
    // Tight tolerance on p: actual JS-vs-R agreement is rel ~6e-6
    // (limited by R's 6-sig-fig reference precision, not by the JS
    // implementation). 5e-4 leaves ~80× headroom over real noise.
    // The Royston μ / σ polynomial coefficients at stats-tests.js:191-192
    // produce the p-value via normal-tail; a coefficient mutation that
    // shifts μ by even 1% moves p by orders of magnitude in this band.
    const { p } = shapiroWilk(c.x);
    if (c.p < 0.001) {
      assert(Math.abs(p - c.p) < 5e-7, `p=${p.toExponential(3)} vs R=${c.p}`);
    } else {
      const rel = Math.abs(p - c.p) / c.p;
      assert(rel < 5e-4, `p=${p.toFixed(7)} vs R=${c.p} (rel diff ${rel.toExponential(2)})`);
    }
  });
}

// Edge cases
suite("stats.js — Shapiro-Wilk edge cases");

test("n < 3 → error", () => {
  const r = shapiroWilk([1, 2]);
  assert(r.error && Number.isNaN(r.W), "returns error object");
});
test("zero variance → error", () => {
  const r = shapiroWilk([5, 5, 5, 5, 5]);
  assert(r.error, "returns error object");
});

// ── Shared fixtures (used by Levene / t / Mann-Whitney / effect sizes) ─────
// All reference values regenerated from real R — see inline R one-liners.

// R base:  sleep$extra[sleep$group==1]
const sleepG1 = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0];
// R base:  sleep$extra[sleep$group==2]
const sleepG2 = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4];

// R base:  iris$Sepal.Length[iris$Species=="setosa"]
const irisSetosa = [
  5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9, 5.4, 4.8, 4.8, 4.3, 5.8, 5.7, 5.4, 5.1, 5.7,
  5.1, 5.4, 5.1, 4.6, 5.1, 4.8, 5.0, 5.0, 5.2, 5.2, 4.7, 4.8, 5.4, 5.2, 5.5, 4.9, 5.0, 5.5, 4.9,
  4.4, 5.1, 5.0, 4.5, 4.4, 5.0, 5.1, 4.8, 5.1, 4.6, 5.3, 5.0,
];
// R base:  iris$Sepal.Length[iris$Species=="versicolor"]
const irisVersicolor = [
  7.0, 6.4, 6.9, 5.5, 6.5, 5.7, 6.3, 4.9, 6.6, 5.2, 5.0, 5.9, 6.0, 6.1, 5.6, 6.7, 5.6, 5.8, 6.2,
  5.6, 5.9, 6.1, 6.3, 6.1, 6.4, 6.6, 6.8, 6.7, 6.0, 5.7, 5.5, 5.5, 5.8, 6.0, 5.4, 6.0, 6.7, 6.3,
  5.6, 5.5, 5.5, 6.1, 5.8, 5.0, 5.6, 5.7, 5.7, 6.2, 5.1, 5.7,
];

// ── Levene's test (Brown-Forsythe) vs R ────────────────────────────────────
//
// Reference values produced via:
//   levene_bf <- function(values, groups) {
//     dev <- abs(values - ave(values, groups, FUN=median))
//     summary(aov(dev ~ factor(groups)))[[1]]
//   }

suite("stats.js — Levene (Brown-Forsythe) vs R");

test("PlantGrowth (3 groups) — F=1.119186 p=0.341227", () => {
  // R> levene_bf(PlantGrowth$weight, PlantGrowth$group)
  const ctrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
  const trt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
  const trt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
  const r = leveneTest([ctrl, trt1, trt2]);
  approx(r.F, 1.119186, 5e-3);
  approx(r.p, 0.341227, 5e-3);
  assert(r.df1 === 2 && r.df2 === 27, `df ${r.df1},${r.df2}`);
});

test("iris Sepal.Length (3 species) — F=6.352720 p=0.002259", () => {
  // R> levene_bf(iris$Sepal.Length, iris$Species)
  const virginica = [
    6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2, 6.5, 6.4, 6.8, 5.7, 5.8, 6.4, 6.5, 7.7, 7.7,
    6.0, 6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2, 7.4, 7.9, 6.4, 6.3, 6.1, 7.7, 6.3, 6.4,
    6.0, 6.9, 6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
  ];
  const r = leveneTest([irisSetosa, irisVersicolor, virginica]);
  approx(r.F, 6.35272, 5e-3);
  approx(r.p, 0.002259, 5e-2); // looser on tiny p — still order-of-magnitude
  assert(r.df1 === 2 && r.df2 === 147, `df ${r.df1},${r.df2}`);
});

test("simple 2-group — F=4.230174 p=0.069848", () => {
  // R> levene_bf(c(1:5, seq(2,12,2)), rep(c("A","B"),c(5,6)))
  const r = leveneTest([
    [1, 2, 3, 4, 5],
    [2, 4, 6, 8, 10, 12],
  ]);
  approx(r.F, 4.230174, 5e-3);
  approx(r.p, 0.069848, 5e-3);
});

test("2 groups with equal variance → p large", () => {
  const r = leveneTest([
    [1, 2, 3, 4, 5],
    [10, 11, 12, 13, 14],
  ]);
  assert(r.p > 0.5, `p should be large (got ${r.p})`);
});

// ── t-tests vs R ───────────────────────────────────────────────────────────
//
// R base: t.test(x, y, var.equal=TRUE|FALSE)

suite("stats.js — Student / Welch t-tests vs R");

test("sleep Student t — t=-1.860813 df=18 p=0.079187", () => {
  // R> t.test(sleep$extra[1:10], sleep$extra[11:20], var.equal=TRUE)
  const r = tTest(sleepG1, sleepG2, { equalVar: true });
  approx(r.t, -1.860813, 5e-3);
  assert(r.df === 18, `df ${r.df}`);
  approx(r.p, 0.079187, 5e-3);
});

test("sleep Welch t — t=-1.860813 df=17.776474 p=0.079394", () => {
  // R> t.test(..., var.equal=FALSE)
  const r = tTest(sleepG1, sleepG2, { equalVar: false });
  approx(r.t, -1.860813, 5e-3);
  approx(r.df, 17.776474, 5e-3);
  approx(r.p, 0.079394, 5e-3);
});

test("iris setosa vs versicolor Student — t=-10.520986 df=98", () => {
  // R> t.test(setosa$SL, versicolor$SL, var.equal=TRUE)
  //    p ≈ 8.985e-18 (below our float precision for p, so check t and df)
  const r = tTest(irisSetosa, irisVersicolor, { equalVar: true });
  approx(r.t, -10.520986, 5e-3);
  assert(r.df === 98, `df ${r.df}`);
  assert(r.p < 1e-15, "p should be astronomically small");
});

test("iris setosa vs versicolor Welch — t=-10.520986 df=86.538002", () => {
  // R> t.test(setosa$SL, versicolor$SL)
  const r = tTest(irisSetosa, irisVersicolor, { equalVar: false });
  approx(r.t, -10.520986, 5e-3);
  approx(r.df, 86.538002, 5e-3);
  assert(r.p < 1e-15, "p should be astronomically small");
});

test("identical samples → t=0 p=1", () => {
  const r = tTest([1, 2, 3, 4], [1, 2, 3, 4]);
  approx(r.t, 0, 1e-12);
  approx(r.p, 1, 1e-12);
});

test("error on n<2", () => {
  const r = tTest([1], [2, 3, 4]);
  assert(r.error, "returns error");
});

// ── Mann-Whitney U vs R ────────────────────────────────────────────────────
//
// R base: wilcox.test(x, y, exact=FALSE, correct=TRUE)
// Note: R reports "W" = U1 (our `U1` field), not U = min(U1, U2).

suite("stats.js — Mann-Whitney U vs R");

test("sleep — U1=25.5 p=0.069328", () => {
  // R> wilcox.test(sleep$extra[1:10], sleep$extra[11:20], exact=FALSE, correct=TRUE)
  const r = mannWhitneyU(sleepG1, sleepG2);
  approx(r.U1, 25.5, 1e-6);
  approx(r.p, 0.069328, 5e-3);
});

test("iris setosa vs versicolor — U1=168.5", () => {
  // R> wilcox.test(setosa$SL, versicolor$SL, exact=FALSE, correct=TRUE)
  //    W=168.5  p≈8.35e-14
  const r = mannWhitneyU(irisSetosa, irisVersicolor);
  approx(r.U1, 168.5, 1e-6);
  assert(r.p < 1e-10, `p should be tiny (got ${r.p})`);
});

test("small samples with ties — U1=5 p=0.077947", () => {
  // R> wilcox.test(c(1,2,2,3,4), c(2,3,4,5,6,6), exact=FALSE, correct=TRUE)
  const r = mannWhitneyU([1, 2, 2, 3, 4], [2, 3, 4, 5, 6, 6]);
  approx(r.U1, 5, 1e-6);
  approx(r.p, 0.077947, 1e-2); // tie correction has some room
});

test("empty group → error", () => {
  const r = mannWhitneyU([], [1, 2, 3]);
  assert(r.error, "returns error");
});

// ── Effect sizes vs R ──────────────────────────────────────────────────────

suite("stats.js — effect sizes");

test("Cohen d — sleep groups", () => {
  // R> (mean(g1)-mean(g2)) / sqrt(((n1-1)*var(g1)+(n2-1)*var(g2))/(n1+n2-2))
  approx(cohenD(sleepG1, sleepG2), -0.832181, 5e-3);
});

test("Cohen d — iris setosa vs versicolor", () => {
  approx(cohenD(irisSetosa, irisVersicolor), -2.104197, 5e-3);
});

test("Hedges g ≤ |Cohen d| (bias-corrected shrinks)", () => {
  const d = cohenD(sleepG1, sleepG2);
  const g = hedgesG(sleepG1, sleepG2);
  assert(Math.abs(g) < Math.abs(d), `|g|=${Math.abs(g)} not < |d|=${Math.abs(d)}`);
});

test("Hedges g uses exact J (gammaln) — matches gamma-ratio form at small n", () => {
  // n1 = n2 = 3 (df = 4) is where the asymptotic shortcut J ≈ 1 − 3/(4n−9)
  // diverges most from the exact gamma-ratio form. By hand:
  //   d = (mean(x)−mean(y)) / √sp² = (2−4) / √2.5 ≈ −1.264911
  //   J(4) = Γ(2) / (Γ(1.5)·√2) = 1 / ((√π/2)·√2) ≈ 0.7978846
  //   g = d · J ≈ −1.009253
  // The old asymptotic shortcut would give J = 1 − 3/(4·6 − 9) = 0.8,
  // and so g_old ≈ −1.011929 — a ~0.27 % error. The test below pins the
  // exact value so any regression to the shortcut would fire.
  const d = cohenD([1, 2, 3], [2, 4, 6]);
  approx(d, -1.264911, 1e-5);
  const g = hedgesG([1, 2, 3], [2, 4, 6]);
  approx(g, -1.009253, 1e-5);
});

test("Hedges g exact J converges to asymptote for large n", () => {
  // At n ≈ 30 the gamma-ratio form should agree with the asymptote to
  // ~1e-4. This pins down the convergence behavior.
  const x = Array.from({ length: 30 }, (_, i) => i);
  const y = Array.from({ length: 30 }, (_, i) => i + 1);
  const d = cohenD(x, y);
  const g = hedgesG(x, y);
  const J_exact = g / d;
  const J_asymptote = 1 - 3 / (4 * 60 - 9);
  approx(J_exact, J_asymptote, 1e-4);
});

test("rankBiserial — identical groups → 0", () => {
  const { U1 } = mannWhitneyU([1, 2, 3, 4], [1, 2, 3, 4]);
  approx(rankBiserial(U1, 4, 4), 0, 1e-12);
});

test("rankBiserial — extreme separation → ±1", () => {
  // x all below y → U1 = 0 → r = 1
  const { U1 } = mannWhitneyU([1, 2, 3], [10, 20, 30]);
  approx(rankBiserial(U1, 3, 3), 1, 1e-12);
});

// ── 95 % CI on Cohen's d (Cumming & Finch 2001 noncentral-t pivot) ────────

suite("stats.js — cohenDCI: 95 % CI on Cohen's d via noncentral t");

test("CI brackets the point estimate", () => {
  // For any well-defined d on n ≥ 3, the CI must enclose d itself.
  const d = cohenD(sleepG1, sleepG2); // ≈ −0.83
  const { lo, hi } = cohenDCI(d, sleepG1.length, sleepG2.length);
  assert(Number.isFinite(lo) && Number.isFinite(hi), `lo=${lo}, hi=${hi}`);
  assert(lo <= d && d <= hi, `d=${d} not in [${lo}, ${hi}]`);
});

test("CI is roughly symmetric around d when |d| is small", () => {
  // d close to 0 → noncentral t is near central → CI nearly symmetric.
  // For equal-n with d ≈ 0, the half-widths on each side should match
  // within ~5% (small departures from symmetry are real because the
  // ncp-based CI isn't exactly central even at d=0, but the gap is
  // tiny compared to the half-width itself).
  const x = [4.9, 5.0, 5.1, 4.8, 5.2, 5.0, 4.95, 5.05, 4.9, 5.1];
  const y = [5.0, 5.1, 4.9, 5.05, 4.95, 5.0, 5.0, 4.92, 5.08, 5.1];
  const d = cohenD(x, y);
  const { lo, hi } = cohenDCI(d, x.length, y.length);
  const widthLo = d - lo;
  const widthHi = hi - d;
  const rel = Math.abs(widthLo - widthHi) / Math.max(widthLo, widthHi);
  assert(rel < 0.05, `asymmetry rel=${rel.toExponential(2)}, lo=${lo}, hi=${hi}, d=${d}`);
});

test("CI widens as sample size shrinks", () => {
  // Same d, smaller n → wider CI. Pin the monotonic relationship.
  const d = 0.5;
  const wide = cohenDCI(d, 5, 5);
  const narrow = cohenDCI(d, 50, 50);
  const widthWide = wide.hi - wide.lo;
  const widthNarrow = narrow.hi - narrow.lo;
  assert(widthWide > 2 * widthNarrow, `n=5 width=${widthWide}, n=50 width=${widthNarrow}`);
});

test("sleep extra: d ≈ −0.832, CI contains 0 (matches the well-known borderline result)", () => {
  // The R `sleep` dataset is the classic Student 1908 example. With
  // n=10 per group, d ≈ −0.83. The 95 % CI from MBESS::ci.smd is
  // approximately [−1.75, 0.10] — wide enough to span 0, which is why
  // the paired-design original analysis was needed to reach significance.
  const d = cohenD(sleepG1, sleepG2);
  const { lo, hi } = cohenDCI(d, sleepG1.length, sleepG2.length);
  // Sanity: CI half-widths in the right ballpark for n=10/10. Don't
  // pin against external software at high precision since `effsize`
  // (default) uses an asymptotic SE while we use the exact noncentral-t
  // pivot — they agree to ~10 % at this n, diverge more at small n.
  assert(lo < 0, `expected lo < 0 (CI spans 0), got lo=${lo}`);
  assert(hi > 0, `expected hi > 0 (CI spans 0), got hi=${hi}`);
  assert(lo > -2 && hi < 0.5, `CI [${lo}, ${hi}] outside expected MBESS-ish range`);
});

test("degenerate input → { lo: NaN, hi: NaN }", () => {
  // n < 2 on either side, or non-finite d, returns NaN bounds (not throws).
  const a = cohenDCI(0.5, 1, 10);
  assert(Number.isNaN(a.lo) && Number.isNaN(a.hi), `n1=1: got ${a.lo}, ${a.hi}`);
  const b = cohenDCI(NaN, 10, 10);
  assert(Number.isNaN(b.lo) && Number.isNaN(b.hi), `NaN d: got ${b.lo}, ${b.hi}`);
  const c = cohenDCI(0.5, 10, 10, 0); // invalid conf
  assert(Number.isNaN(c.lo) && Number.isNaN(c.hi), `conf=0: got ${c.lo}, ${c.hi}`);
});

// R-cross-validated reference values from `effectsize::cohens_d`
// (R 4.5.3, effectsize package). The canonical implementation of the
// Cumming & Finch 2001 noncentral-t pivot in the R ecosystem. To
// reproduce:
//
//   library(effectsize)
//   cohens_d(sleepG1, sleepG2, pooled_sd = TRUE)
//   cohens_d(iris$Sepal.Length[iris$Species=="setosa"],
//            iris$Sepal.Length[iris$Species=="versicolor"],
//            pooled_sd = TRUE)
//
// JS-vs-R agreement is at ~1e-7 absolute on both CI bounds — well
// inside the 1e-6 tolerance pinned here. Tighter tolerance would
// catch genuine drift in `cohenDCI`'s bisection or `nctcdf` precision.

suite("stats.js — cohenDCI vs R effectsize::cohens_d");

test("sleep: d_pool CI matches R to 1e-6", () => {
  const d = cohenD(sleepG1, sleepG2); // -0.83218108
  const { lo, hi } = cohenDCI(d, sleepG1.length, sleepG2.length);
  approx(lo, -1.7388171552, 1e-6);
  approx(hi, 0.0954504437, 1e-6);
});

test("iris setosa vs versicolor: d_pool CI matches R to 1e-6", () => {
  const d = cohenD(irisSetosa, irisVersicolor); // -2.10419725
  const { lo, hi } = cohenDCI(d, irisSetosa.length, irisVersicolor.length);
  approx(lo, -2.5907867136, 1e-6);
  approx(hi, -1.6105704249, 1e-6);
});

// d_av: `effectsize::cohens_d(pooled_sd = FALSE)` returns Glass's Δ
// (uses the control group's SD), not d_av (mean of unpooled SDs).
// `lsr::cohensD(..., method="unequal")` returns d_av but the package
// isn't installed in CI. The reference values below come from the
// unambiguous Lakens 2013 formula `(m1 − m2) / ((sd1 + sd2)/2)`
// computed directly in R via `(mean(x) - mean(y)) / ((sd(x) + sd(y))/2)`,
// double-checked against Plöttr's JS implementation.

suite("stats.js — Cohen's d_av (Lakens 2013) — R formula cross-check");

// Inline d_av — Plöttr doesn't expose a global helper for it because
// the only consumer is computePowerFromData (which inlines the math
// alongside the Welch branch). Reproduce the formula here so a
// future refactor that swaps in a `cohenDav` global stays drop-in
// compatible with the reference values below.
function dav(x, y) {
  const m1 = sampleMean(x);
  const m2 = sampleMean(y);
  const s1 = sampleSD(x);
  const s2 = sampleSD(y);
  return (m1 - m2) / ((s1 + s2) / 2);
}

test("sleep d_av = -0.83349634 (R formula)", () => {
  approx(dav(sleepG1, sleepG2), -0.8334963413, 1e-9);
});

test("iris setosa vs versicolor d_av = -2.14122696 (R formula)", () => {
  approx(dav(irisSetosa, irisVersicolor), -2.1412269629, 1e-9);
});

test("d_av equals d_pool when SDs are equal", () => {
  // sd1 == sd2 ⇒ the two denominators collapse to the same value, so
  // d_av == d_pool to FP precision. Pins the algebraic identity.
  const x = [1, 2, 3, 4, 5]; // mean 3, sd √2.5 ≈ 1.5811
  const y = [11, 12, 13, 14, 15]; // mean 13, sd √2.5 ≈ 1.5811
  approx(dav(x, y), cohenD(x, y), 1e-12);
});

// ── Shared k-sample fixtures ───────────────────────────────────────────────

// PlantGrowth (3 groups × 10)
const pgCtrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
const pgTrt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
const pgTrt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
const pg = [pgCtrl, pgTrt1, pgTrt2];

// iris Sepal.Length (3 species × 50)
const irisVirginica = [
  6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2, 6.5, 6.4, 6.8, 5.7, 5.8, 6.4, 6.5, 7.7, 7.7,
  6.0, 6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2, 7.4, 7.9, 6.4, 6.3, 6.1, 7.7, 6.3, 6.4,
  6.0, 6.9, 6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
];
const irisSL = [irisSetosa, irisVersicolor, irisVirginica];

// InsectSprays (6 sprays × 12 observations)
const isA = [10, 7, 20, 14, 14, 12, 10, 23, 17, 20, 14, 13];
const isB = [11, 17, 21, 11, 16, 14, 17, 17, 19, 21, 7, 13];
const isC = [0, 1, 7, 2, 3, 1, 2, 1, 3, 0, 1, 4];
const isD = [3, 5, 12, 6, 4, 3, 5, 5, 5, 5, 2, 4];
const isE = [3, 5, 3, 5, 3, 6, 1, 1, 3, 2, 6, 4];
const isF = [11, 9, 15, 22, 15, 16, 13, 10, 26, 26, 24, 13];
const insectSprays = [isA, isB, isC, isD, isE, isF];

// ── One-way ANOVA vs R ─────────────────────────────────────────────────────

suite("stats.js — one-way ANOVA vs R");

test("PlantGrowth — F=4.846088 df=2,27 p=0.01591", () => {
  // R> summary(aov(weight ~ group, data=PlantGrowth))
  const r = oneWayANOVA(pg);
  approx(r.F, 4.846088, 5e-3);
  assert(r.df1 === 2 && r.df2 === 27, `df ${r.df1},${r.df2}`);
  approx(r.p, 0.01591, 5e-3);
});

test("iris Sepal.Length — F=119.2645 df=2,147 p≈1.67e-31", () => {
  const r = oneWayANOVA(irisSL);
  approx(r.F, 119.264502, 5e-3);
  assert(r.df1 === 2 && r.df2 === 147, `df ${r.df1},${r.df2}`);
  assert(r.p < 1e-25, `p should be tiny: got ${r.p}`);
});

test("InsectSprays — F=34.702282 df=5,66", () => {
  const r = oneWayANOVA(insectSprays);
  approx(r.F, 34.702282, 5e-3);
  assert(r.df1 === 5 && r.df2 === 66, `df ${r.df1},${r.df2}`);
  assert(r.p < 1e-10, "p should be tiny");
});

test("identical groups → F=0 p=1", () => {
  const r = oneWayANOVA([
    [1, 2, 3, 4],
    [1, 2, 3, 4],
    [1, 2, 3, 4],
  ]);
  approx(r.F, 0, 1e-12);
  approx(r.p, 1, 1e-6);
});

// ── Welch's ANOVA vs R ─────────────────────────────────────────────────────

suite("stats.js — Welch's ANOVA vs R");

test("PlantGrowth — F=5.181 df1=2 df2=17.128 p=0.01739", () => {
  // R> oneway.test(weight ~ group, data=PlantGrowth, var.equal=FALSE)
  const r = welchANOVA(pg);
  approx(r.F, 5.180972, 5e-3);
  assert(r.df1 === 2, `df1 ${r.df1}`);
  approx(r.df2, 17.128419, 5e-3);
  approx(r.p, 0.0173928, 5e-3);
});

test("iris SL — F=138.908 df2=92.211", () => {
  const r = welchANOVA(irisSL);
  approx(r.F, 138.908285, 5e-3);
  approx(r.df2, 92.211145, 5e-3);
  assert(r.p < 1e-20, "p tiny");
});

test("InsectSprays — F=36.065 df2=30.043", () => {
  const r = welchANOVA(insectSprays);
  approx(r.F, 36.065444, 5e-3);
  approx(r.df2, 30.042561, 5e-3);
  assert(r.p < 1e-8, "p tiny");
});

// ── Kruskal-Wallis vs R ────────────────────────────────────────────────────

suite("stats.js — Kruskal-Wallis vs R");

test("PlantGrowth — H=7.988229 df=2 p=0.01842", () => {
  // R> kruskal.test(weight ~ group, data=PlantGrowth)
  const r = kruskalWallis(pg);
  approx(r.H, 7.988229, 5e-3);
  assert(r.df === 2, `df ${r.df}`);
  approx(r.p, 0.0184238, 5e-3);
});

test("iris SL — H=96.937 df=2", () => {
  const r = kruskalWallis(irisSL);
  approx(r.H, 96.937436, 5e-3);
  assert(r.df === 2);
  assert(r.p < 1e-15, "p tiny");
});

test("InsectSprays — H=54.691 df=5", () => {
  const r = kruskalWallis(insectSprays);
  approx(r.H, 54.691345, 5e-3);
  assert(r.df === 5);
  assert(r.p < 1e-8, "p tiny");
});

test("kruskalWallis: all values tied → error (matches R warning + NaN)", () => {
  // Ranks are all (N+1)/2, H is 0/0, the tie correction denominator is also
  // 0. Old code skipped the divide and reported H=0, p=1 — implying "no
  // significant difference detected" when really the test is undefined.
  // Now matches R kruskal.test which warns and returns NaN.
  const r = kruskalWallis([
    [5, 5],
    [5, 5],
    [5, 5],
  ]);
  assert(r.error, `expected error, got ${JSON.stringify(r)}`);
  assert(Number.isNaN(r.H), "H must be NaN");
  assert(Number.isNaN(r.p), "p must be NaN");
});

test("kruskalWallis: all-tied across uneven groups also flagged", () => {
  const r = kruskalWallis([[5], [5, 5], [5, 5, 5]]);
  assert(r.error, `expected error, got ${JSON.stringify(r)}`);
});

test("kruskalWallis: partial ties still compute (only all-tied is rejected)", () => {
  // Three groups with internal ties but distinct group medians — must
  // still produce a finite H and p. This guards against the all-tied
  // detection accidentally firing on routine tied data.
  const r = kruskalWallis([
    [1, 1, 2],
    [3, 3, 4],
    [5, 5, 6],
  ]);
  assert(!r.error, `unexpected error: ${r.error}`);
  assert(Number.isFinite(r.H) && r.H > 0, `expected positive H, got ${r.H}`);
});

// ── k-sample effect sizes vs R ─────────────────────────────────────────────

suite("stats.js — η² and ε² vs R");

test("PlantGrowth η² = 0.264148", () => {
  approx(etaSquared(pg), 0.264148, 5e-3);
});

test("iris SL η² = 0.618706", () => {
  approx(etaSquared(irisSL), 0.618706, 5e-3);
});

test("PlantGrowth ε² = 0.275456", () => {
  approx(epsilonSquared(pg), 0.275456, 5e-3);
});

test("iris SL ε² = 0.650587", () => {
  approx(epsilonSquared(irisSL), 0.650587, 5e-3);
});

// ── η² / ε² — boundary + degenerate-input pins (mutation audit) ────────────
//
// The R-reference tests above pin two interior values each. Mutants on the
// saturation guards (`ssTotal === 0 ? 0 : …`, `kw.error` check, `N > 1`
// guard) and the error short-circuits survive them. These pins exercise
// the all-equal-groups case (η² = 0 exactly) and the error / boundary
// paths so a mutation flipping a guard produces an observable mismatch.

suite("η² / ε² — boundary pins");

test("η² = 0 exactly when all group means are identical", () => {
  // ssBetween = 0 → η² = 0. A mutant flipping `ssTotal === 0 ? 0 : …`
  // or the ssBetween/ssTotal ratio would not land on exactly 0 here.
  eq(
    etaSquared([
      [5, 6, 7],
      [5, 6, 7],
      [5, 6, 7],
    ]),
    0
  );
});

test("η² is in (0, 1) for genuinely separated groups", () => {
  const e = etaSquared([
    [1, 2, 3],
    [10, 11, 12],
    [20, 21, 22],
  ]);
  assert(e > 0 && e < 1, `η² must be a proper proportion, got ${e}`);
  // Heavy between-group separation → η² close to 1.
  assert(e > 0.95, "near-total separation → η² > 0.95");
});

test("η² → NaN when ANOVA errors (k < 2)", () => {
  assert(Number.isNaN(etaSquared([[1, 2, 3]])), "single group → ANOVA error → NaN");
});

test("ε² → NaN when Kruskal-Wallis errors (k < 2)", () => {
  assert(Number.isNaN(epsilonSquared([[1, 2, 3]])), "single group → KW error → NaN");
});

test("ε² = H / (N - 1) — pins the divisor (kills 'N - 1' → 'N + 1' mutation)", () => {
  // Three 3-element groups → N = 9, divisor = 8. Verify ε² · 8 recovers
  // the Kruskal-Wallis H exactly.
  const groups = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  const eps = epsilonSquared(groups);
  const kw = kruskalWallis(groups);
  approx(eps * 8, kw.H, 1e-12);
});

// ── Studentized range distribution ─────────────────────────────────────────
//
// Reference values from R's stats::ptukey and stats::qtukey:
//   ptukey(3, 3, 20)   = 0.889243
//   ptukey(3.5, 3, 20) = 0.944108
//   ptukey(4, 4, 30)   = 0.960928
//   ptukey(5, 5, 60)   = 0.993166
//   ptukey(2, 3, 10)   = 0.629455
//   qtukey(0.95, 3, 27) = 3.506426
//   qtukey(0.95, 6, 66) = 4.150851
//   qtukey(0.99, 4, 20) = 5.018016

suite("stats.js — ptukey / qtukey vs R");

test("ptukey(3, 3, 20) ≈ 0.889243", () => {
  approx(ptukey(3, 3, 20), 0.889243, 5e-3);
});

test("ptukey(3.5, 3, 20) ≈ 0.944108", () => {
  approx(ptukey(3.5, 3, 20), 0.944108, 5e-3);
});

test("ptukey(4, 4, 30) ≈ 0.960928", () => {
  approx(ptukey(4, 4, 30), 0.960928, 5e-3);
});

test("ptukey(5, 5, 60) ≈ 0.993166", () => {
  approx(ptukey(5, 5, 60), 0.993166, 5e-3);
});

test("ptukey(2, 3, 10) ≈ 0.629455", () => {
  approx(ptukey(2, 3, 10), 0.629455, 5e-3);
});

test("qtukey(0.95, 3, 27) ≈ 3.506426", () => {
  approx(qtukey(0.95, 3, 27), 3.506426, 5e-3);
});

test("qtukey(0.95, 6, 66) ≈ 4.150851", () => {
  approx(qtukey(0.95, 6, 66), 4.150851, 5e-3);
});

test("qtukey(0.99, 4, 20) ≈ 5.018016", () => {
  approx(qtukey(0.99, 4, 20), 5.018016, 5e-3);
});

// ── Root-finder bracket expansion ──────────────────────────────────────────
//
// Earlier revisions of qtukey/powerAnova used fixed upper brackets that
// silently clamped when the true root lay outside [lo, hi]. bisect itself
// is now strict: if target is not bracketed it returns NaN rather than the
// nearer endpoint, and the callers that need to handle heavy tails expand
// hi by doubling first.

suite("stats.js — root-finder bracket expansion");

test("bisect returns NaN when target above fn(hi)", () => {
  // fn is monotone non-decreasing on [0, 1], range [0, 1]; target 2 is
  // unreachable. Old behavior would have returned the upper endpoint.
  const result = bisect((x) => x, 2, 0, 1);
  assert(Number.isNaN(result), `expected NaN, got ${result}`);
});

test("bisect returns NaN when target below fn(lo)", () => {
  const result = bisect((x) => x, -2, 0, 1);
  assert(Number.isNaN(result), `expected NaN, got ${result}`);
});

test("bisect still solves bracketed roots", () => {
  approx(
    bisect((x) => x * x, 0.25, 0, 1),
    0.5,
    1e-5
  );
});

test("qtukey extreme tail at small df (R reference)", () => {
  // R: qtukey(0.999, 3, 5) = 11.671498. Within ptukey integration accuracy.
  approx(qtukey(0.999, 3, 5), 11.671498, 5e-3);
});

test("qtukey(0.999, 50, 1) > 100 (bracket actually expanded)", () => {
  // The old fixed upper bound of 100 silently clamped this case — the
  // result was ~99.999..., a stale endpoint. With bracket expansion, the
  // root sits much higher (R refuses with NaN at this pathological input
  // because its algorithm bails, but our integrator finds a finite root
  // to the equation ptukey(q) = 0.999 well above 100).
  const result = qtukey(0.999, 50, 1);
  assert(Number.isFinite(result), `expected finite, got ${result}`);
  assert(result > 100, `expected > 100 (proves expansion ran), got ${result}`);
});

test("qtukey degenerate inputs return NaN", () => {
  assert(Number.isNaN(qtukey(0.95, 1, 10)), "k=1 must be NaN");
  assert(Number.isNaN(qtukey(0.95, 3, 0)), "df=0 must be NaN");
});

test("tukeyHSD warns when (1−α, k, dfErr) is in qtukey's pathological envelope", () => {
  // dfErr = 14 − 12 = 2, k = 12, 1−α = 0.95 → envelope hit.
  // One group with n=3 supplies 2 dof of within-group variance; 11
  // singletons contribute nothing but pad k. Construction matches the
  // SciPy-bench `isQtukeyPathological` criterion.
  const groups = [[1, 2, 3]];
  for (let i = 0; i < 11; i++) groups.push([10 + i]);
  const r = tukeyHSD(groups);
  assert(
    typeof r.warning === "string" && r.warning.includes("approximate"),
    `expected pathological-envelope warning, got ${JSON.stringify(r.warning)}`
  );
  // p-values still computable (ptukey_upper doesn't share the bracket-
  // expansion limit) — the warning is about CI accuracy only.
  assert(
    r.pairs.every((p) => Number.isFinite(p.p)),
    "p-values must remain finite in the envelope"
  );
});

test("tukeyHSD has no warning in the pass band", () => {
  // df = 27, k = 3, p = 0.95 → well inside the pass band.
  const r = tukeyHSD([
    [4.5, 5.1, 5.5, 4.9],
    [6.2, 6.8, 6.3, 7.1, 6.7],
    [3.1, 3.5, 3.9, 3.2],
  ]);
  assert(r.warning == null, `expected no warning, got ${JSON.stringify(r.warning)}`);
});

test("powerAnova at heavy-tail (df1=1, df2=1) no longer clamps", () => {
  // F(1, 1) only reaches 0.955 at x ≈ 200, so the old fixed upper bound
  // of 200 silently clamped fCrit for any α ≤ 0.045. With bracket
  // expansion the result is finite and lies in [0, 1].
  const p = powerAnova(0.4, 2, 0.01, 2);
  assert(Number.isFinite(p), `expected finite power, got ${p}`);
  assert(p >= 0 && p <= 1, `expected p in [0,1], got ${p}`);
});

test("powerAnova standard case unaffected by expansion", () => {
  // Sanity check that bracket expansion (a no-op here — hi=200 already
  // covers 1−0.05 = 0.95 for df=(2, 57)) doesn't change the answer for
  // routine inputs. Cross-checked against the existing tests in
  // tests/power.test.js for f=0.4, k=3 at n=22 (R ref 0.8181) and at
  // n=53 (R ref 0.80) which both still pass — the value here lies on
  // the same curve.
  approx(powerAnova(0.4, 22, 0.05, 3), 0.8181, 5e-3);
});

// ── Tukey HSD ──────────────────────────────────────────────────────────────
//
// Reference: R's TukeyHSD(aov(weight ~ group, PlantGrowth))
//   trt1-ctrl  diff=-0.371  lwr=-1.0622  upr=0.3202  p=0.390871
//   trt2-ctrl  diff= 0.494  lwr=-0.1972  upr=1.1852  p=0.197996
//   trt2-trt1  diff= 0.865  lwr= 0.1738  upr=1.5562  p=0.012006
//
// iris Sepal.Length TukeyHSD (all p ≈ 0):
//   versicolor-setosa     diff=0.930  lwr=0.6862  upr=1.1738
//   virginica-setosa      diff=1.582  lwr=1.3382  upr=1.8258
//   virginica-versicolor  diff=0.652  lwr=0.4082  upr=0.8958

suite("stats.js — Tukey HSD vs R");

test("PlantGrowth TukeyHSD: 3 pairs, diffs match", () => {
  const r = tukeyHSD(pg);
  assert(r.pairs.length === 3, "expected 3 pairs");
  approx(r.pairs[0].diff, -0.371, 5e-3);
  approx(r.pairs[1].diff, 0.494, 5e-3);
  approx(r.pairs[2].diff, 0.865, 5e-3);
});

test("PlantGrowth TukeyHSD: p-values match R", () => {
  const r = tukeyHSD(pg);
  approx(r.pairs[0].p, 0.390871, 5e-3);
  approx(r.pairs[1].p, 0.197996, 5e-3);
  approx(r.pairs[2].p, 0.012006, 5e-3);
});

test("PlantGrowth TukeyHSD: 95% CI bounds match R", () => {
  const r = tukeyHSD(pg);
  approx(r.pairs[0].lwr, -1.0622, 5e-3);
  approx(r.pairs[0].upr, 0.3202, 5e-3);
  approx(r.pairs[2].lwr, 0.1738, 5e-3);
  approx(r.pairs[2].upr, 1.5562, 5e-3);
});

test("iris SL TukeyHSD: diffs and CI bounds match R", () => {
  const r = tukeyHSD(irisSL);
  approx(r.pairs[0].diff, 0.93, 5e-3);
  approx(r.pairs[1].diff, 1.582, 5e-3);
  approx(r.pairs[2].diff, 0.652, 5e-3);
  approx(r.pairs[0].lwr, 0.6862, 5e-3);
  approx(r.pairs[0].upr, 1.1738, 5e-3);
});

test("iris SL TukeyHSD: all three pairs highly significant", () => {
  const r = tukeyHSD(irisSL);
  for (const pr of r.pairs) assert(pr.p < 1e-6, `expected p<1e-6, got ${pr.p}`);
});

test("TukeyHSD rejects k<2", () => {
  const r = tukeyHSD([[1, 2, 3]]);
  assert(r.error != null, "expected error");
});

// ── Games-Howell ───────────────────────────────────────────────────────────
//
// Reference values hand-computed from the Welch-Satterthwaite df per pair
// fed to R's ptukey (see docstring). iris Sepal.Length, k=3:
//   (1,2) setosa–versicolor:    q=14.8789  df=86.54  p=2.86e-10
//   (1,3) setosa–virginica:     q=21.7594  df=76.52  p≈0
//   (2,3) versicolor–virginica: q= 7.9608  df=94.03  p=5.58e-07

suite("stats.js — Games-Howell vs R-derived reference");

test("iris SL Games-Howell: q statistics", () => {
  const r = gamesHowell(irisSL);
  assert(r.pairs.length === 3, "expected 3 pairs");
  approx(r.pairs[0].q, 14.8789, 5e-3);
  approx(r.pairs[1].q, 21.7594, 5e-3);
  approx(r.pairs[2].q, 7.9608, 5e-3);
});

test("iris SL Games-Howell: Welch-Satterthwaite df", () => {
  const r = gamesHowell(irisSL);
  approx(r.pairs[0].df, 86.54, 5e-3);
  approx(r.pairs[1].df, 76.52, 5e-3);
  approx(r.pairs[2].df, 94.03, 5e-3);
});

test("iris SL Games-Howell: all pairs highly significant", () => {
  const r = gamesHowell(irisSL);
  for (const pr of r.pairs) assert(pr.p < 1e-5, `expected p<1e-5, got ${pr.p}`);
});

// ── Degenerate inputs (zero variance) ──────────────────────────────────────
//
// R refuses t.test on constant data ("data are essentially constant"); our
// code used to silently emit NaN df / Infinity t / NaN p instead. These
// tests pin the guards that now catch those cases before they reach ptukey
// or compact-letter display and quietly corrupt results.

suite("stats.js — degenerate (zero-variance) inputs");

test("tTest equal-var: both groups constant → error", () => {
  const r = tTest([2, 2, 2], [3, 3, 3], { equalVar: true });
  assert(r.error != null, "expected error");
  assert(Number.isNaN(r.p), "p should be NaN");
  assert(Number.isNaN(r.df), "df should be NaN");
});

test("tTest Welch: both groups constant → error", () => {
  const r = tTest([2, 2, 2], [3, 3, 3], { equalVar: false });
  assert(r.error != null, "expected error");
  assert(Number.isNaN(r.p), "p should be NaN");
});

test("tTest Welch: one group constant still computes (df = n_other − 1)", () => {
  // v1=0, v2>0 — Welch-Satterthwaite collapses to n2−1 and SE is well-defined.
  const r = tTest([5, 5, 5, 5], [1, 2, 3, 4], { equalVar: false });
  assert(r.error == null, `unexpected error: ${r.error}`);
  approx(r.df, 3, 1e-9); // n2 − 1
  assert(Number.isFinite(r.t), "t should be finite");
  assert(r.p >= 0 && r.p <= 1, `p in [0,1], got ${r.p}`);
});

test("tukeyHSD: all groups constant → error (MSE = 0)", () => {
  const r = tukeyHSD([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
  assert(r.pairs.length === 0, "pairs should be empty");
});

test("tukeyHSD: one constant group among varying still computes", () => {
  // ssWithin is driven by the non-constant group → MSE > 0, formula holds.
  const r = tukeyHSD([
    [5, 5, 5, 5],
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
  assert(r.error == null, `unexpected error: ${r.error}`);
  assert(r.pairs.length === 3, `expected 3 pairs, got ${r.pairs.length}`);
  for (const pr of r.pairs) {
    assert(Number.isFinite(pr.q), `q finite, got ${pr.q}`);
    assert(pr.p >= 0 && pr.p <= 1, `p in [0,1], got ${pr.p}`);
  }
});

test("gamesHowell: any zero-variance group → error", () => {
  const r = gamesHowell([
    [5, 5, 5, 5],
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
  assert(r.error != null, "expected error");
  assert(r.pairs.length === 0, "pairs should be empty");
});

test("gamesHowell: all groups constant → error", () => {
  const r = gamesHowell([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
});

test("gamesHowell: a group with n<2 → error (singleton has no variance)", () => {
  // A singleton's sample variance is NaN, which slips past the
  // `variance === 0` guard (NaN === 0 is false); without an explicit n<2
  // check it would surface as a silent NaN p-value.
  const r = gamesHowell([[5], [1, 2, 3], [6, 7, 8]]);
  assert(/n≥2/.test(r.error || ""), `expected an n≥2 error, got ${JSON.stringify(r)}`);
  assert(r.pairs.length === 0, "pairs should be empty");
});

// ── Additional zero-variance guards ────────────────────────────────────────
//
// These four functions used to return phantom F = Infinity, F = NaN, or
// -Infinity on all-constant input. R's oneway.test returns NaN for Welch and
// Levene on the same data; R's aov returns F = Inf with a warning; none of
// those make sense in a non-statistician UI, so we refuse instead. The
// canonical input is [[1,1,1],[2,2,2],[3,3,3]] — each group internally
// constant with different means, so within-group dispersion collapses to 0.

test("oneWayANOVA: all groups constant → error (not fake F=Infinity)", () => {
  const r = oneWayANOVA([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
  assert(!Number.isFinite(r.F), "F should not be finite");
  assert(!Number.isFinite(r.p), "p should not be finite");
  assert(r.ssWithin === 0, "ssWithin should still be reported as 0");
});

test("oneWayANOVA: one constant group among varying still computes", () => {
  // Only guard the all-constant case — mixed inputs have ssWithin > 0 from
  // the non-constant groups and produce a well-defined F.
  const r = oneWayANOVA([
    [5, 5, 5, 5],
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
  assert(r.error == null, "should not error");
  assert(Number.isFinite(r.F) && r.F > 0, "F should be finite and positive");
});

test("welchANOVA: any zero-variance group → error", () => {
  // Welch weights are n/s² so a single constant group is enough to poison
  // the whole statistic — R's oneway.test var.equal=FALSE returns NaN.
  const r = welchANOVA([
    [5, 5, 5, 5],
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
  assert(r.error != null, "expected error");
  assert(!Number.isFinite(r.F), "F should not be finite");
});

test("welchANOVA: all groups constant → error", () => {
  const r = welchANOVA([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
});

test("leveneTest: all groups constant → error (not fake F=Infinity)", () => {
  // All deviations from the group median collapse to 0, so the inner ANOVA
  // hits 0/0. R's equivalent oneway.test on the deviations returns NaN.
  const r = leveneTest([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
  assert(!Number.isFinite(r.F), "F should not be finite");
});

test("cohenD / hedgesG: pooled SD = 0 → NaN (not ±Infinity)", () => {
  // cohenD is a bare numeric return (not a result object), so the guard
  // reports NaN rather than an error field. hedgesG calls cohenD and
  // inherits the NaN via its correction factor.
  const d = cohenD([1, 1, 1], [2, 2, 2]);
  const g = hedgesG([1, 1, 1], [2, 2, 2]);
  assert(Number.isNaN(d), `cohenD should be NaN, got ${d}`);
  assert(Number.isNaN(g), `hedgesG should be NaN, got ${g}`);
});

// ── Benjamini-Hochberg adjustment ──────────────────────────────────────────
//
// Reference: R's p.adjust(c(0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074,
// 0.205), "BH") = 0.00800, 0.03200, 0.06720, 0.06720, 0.06720, 0.08000,
// 0.08457, 0.20500

suite("stats.js — Benjamini-Hochberg vs R p.adjust");

test("bhAdjust matches R p.adjust", () => {
  const adj = bhAdjust([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205]);
  const expected = [0.008, 0.032, 0.0672, 0.0672, 0.0672, 0.08, 0.08457, 0.205];
  for (let i = 0; i < adj.length; i++) approx(adj[i], expected[i], 5e-3);
});

test("bhAdjust preserves input order", () => {
  const adj = bhAdjust([0.05, 0.001, 0.2]);
  // rank-1: 0.001 → 0.001*3/1 = 0.003
  // rank-2: 0.05  → 0.05*3/2  = 0.075
  // rank-3: 0.2   → 0.2*3/3   = 0.2
  approx(adj[0], 0.075, 5e-3);
  approx(adj[1], 0.003, 5e-3);
  approx(adj[2], 0.2, 5e-3);
});

test("bhAdjust enforces monotonicity", () => {
  const adj = bhAdjust([0.01, 0.02, 0.03, 0.04]);
  for (let i = 1; i < adj.length; i++) assert(adj[i] >= adj[i - 1], "monotone");
});

// ── Dunn's test ────────────────────────────────────────────────────────────
//
// Reference: hand-computed from the Dunn/Siegel-Castellan formula using R's
// rank() on PlantGrowth (N=30, tie correction T=6, σ²=77.4828):
//   (ctrl, trt1)  z=  1.1177  p=0.2637
//   (ctrl, trt2)  z= -1.6893  p=0.0912
//   (trt1, trt2)  z= -2.8070  p=0.00500
// Matching BH-adjusted p's (m=3):
//   ranked: 0.00500 → 0.01500
//           0.0912  → 0.1368
//           0.2637  → 0.2637

suite("stats.js — Dunn's test vs R-derived reference");

test("PlantGrowth Dunn: z statistics", () => {
  const r = dunnTest(pg);
  approx(Math.abs(r.pairs[0].z), 1.1177, 5e-3);
  approx(Math.abs(r.pairs[1].z), 1.6893, 5e-3);
  approx(Math.abs(r.pairs[2].z), 2.807, 5e-3);
});

test("PlantGrowth Dunn: raw p-values", () => {
  const r = dunnTest(pg);
  approx(r.pairs[0].p, 0.2637, 5e-3);
  approx(r.pairs[1].p, 0.0912, 5e-3);
  approx(r.pairs[2].p, 0.005, 5e-3);
});

test("PlantGrowth Dunn: BH-adjusted p-values", () => {
  const r = dunnTest(pg);
  approx(r.pairs[0].pAdj, 0.2637, 5e-3);
  approx(r.pairs[1].pAdj, 0.1368, 5e-3);
  approx(r.pairs[2].pAdj, 0.015, 5e-3);
});

test("Dunn reports BH as method", () => {
  const r = dunnTest(pg);
  assert(r.method === "Benjamini-Hochberg", "expected BH label");
});

test("dunnTest: too few observations or an empty group → error, not NaN", () => {
  // N ≤ k (all singletons here) collapses the sigma2 denominator N−1; an
  // empty group makes a 0/0 mean rank. Both must surface a clean error
  // instead of a silent NaN p — mirrors the kruskalWallis precondition.
  const allSingletons = dunnTest([[1], [2], [3]]);
  assert(/Not enough observations/.test(allSingletons.error || ""), "all-singletons → error");
  const emptyGroup = dunnTest([[1, 2, 3, 4], []]);
  assert(/Not enough observations/.test(emptyGroup.error || ""), "empty group → error");
  // A genuine dataset must still compute.
  assert(!dunnTest(pg).error, "PlantGrowth must still compute");
});

// ── Compact letter display ─────────────────────────────────────────────────

suite("stats.js — compact letter display");

test("CLD: all pairs significant → distinct letters", () => {
  const pairs = [
    { i: 0, j: 1, p: 0.001 },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: 0.001 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] !== cld[1] && cld[1] !== cld[2] && cld[0] !== cld[2], "all distinct");
});

test("CLD: no pairs significant → all share a letter", () => {
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.5 },
    { i: 1, j: 2, p: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] === cld[1] && cld[1] === cld[2], "all same");
});

test("CLD: one group different → a/a/b pattern", () => {
  // 0≈1, 0≠2, 1≠2 → groups {0,1} and {2}
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: 0.001 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] === cld[1], "0 and 1 share letter");
  assert(cld[0] !== cld[2], "2 differs");
});

test("CLD: overlapping groups → ab middle", () => {
  // 0≠2 significant, others not → {0,1} and {1,2} → "a","ab","b"
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[1].length === 2, `expected two letters on middle, got "${cld[1]}"`);
  assert(cld[0] !== cld[2], "0 and 2 differ");
  assert(cld[1].includes(cld[0]) && cld[1].includes(cld[2]), "middle shares with both");
});

test("CLD: prefers pAdj over p when available", () => {
  // raw p says significant, adjusted says not
  const pairs = [
    { i: 0, j: 1, p: 0.001, pAdj: 0.5 },
    { i: 0, j: 2, p: 0.001, pAdj: 0.5 },
    { i: 1, j: 2, p: 0.001, pAdj: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] === cld[1] && cld[1] === cld[2], "all same under pAdj");
});

test("CLD: NaN p-values are treated as non-significant (not silent splits)", () => {
  // Without the NaN guard, `NaN >= alpha` is false so the loop would try to
  // split letters on the NaN pair, producing arbitrary garbage labels. The
  // guard treats unresolvable pairs as "no evidence of difference", so all
  // groups share a letter when every pair is NaN.
  const allNaN = [
    { i: 0, j: 1, p: NaN },
    { i: 0, j: 2, p: NaN },
    { i: 1, j: 2, p: NaN },
  ];
  const cld = compactLetterDisplay(allNaN, 3);
  assert(cld[0] === "a" && cld[1] === "a" && cld[2] === "a", `expected aaa, got ${cld}`);
});

test("CLD: mixed NaN + significant pairs only act on the resolved pairs", () => {
  // Pair (0,2) is genuinely significant; (0,1) and (1,2) are NaN. The
  // function should produce a correct two-letter split based on (0,2)
  // alone — group 1 ends up grouped with both because no NaN pair tells
  // us otherwise.
  const mixed = [
    { i: 0, j: 1, p: NaN },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: NaN },
  ];
  const cld = compactLetterDisplay(mixed, 3);
  assert(cld[0] !== cld[2], `expected 0 and 2 distinct, got ${cld}`);
  assert(cld[1].includes(cld[0]) || cld[1].includes(cld[2]), `1 must overlap, got ${cld}`);
});

// Intransitive-significance regression pins (pre-launch audit). A CLD is
// *consistent* iff it satisfies both invariants on every pair:
//   separation  — a significant pair shares NO letter;
//   completeness — a non-significant pair shares AT LEAST ONE letter.
// The audit raised a concern that the split+absorb algorithm might leave
// a non-significant pair sharing no letter once the significance graph is
// intransitive at k ≥ 4. These pin that it does not.
const cldShare = (a, b) => [...a].some((ch) => b.includes(ch));
const assertCldConsistent = (cld, pairs, alpha) => {
  for (const pr of pairs) {
    const sig = Number.isFinite(pr.p) && pr.p < alpha;
    const shares = cldShare(cld[pr.i], cld[pr.j]);
    if (sig) {
      assert(!shares, `significant pair (${pr.i},${pr.j}) must share no letter — got ${cld}`);
    } else {
      assert(shares, `non-significant pair (${pr.i},${pr.j}) must share a letter — got ${cld}`);
    }
  }
};

test("CLD: intransitive significance on a 4-group path stays consistent", () => {
  // Non-significant graph is the path 0—1—2—3 (0≈1, 1≈2, 2≈3); the rest
  // (0≠2, 0≠3, 1≠3) differ. Correct CLD = the three maximal cliques
  // {0,1}, {1,2}, {2,3}, i.e. a, ab, bc, c.
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.001 },
    { i: 0, j: 3, p: 0.001 },
    { i: 1, j: 2, p: 0.5 },
    { i: 1, j: 3, p: 0.001 },
    { i: 2, j: 3, p: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 4);
  assertCldConsistent(cld, pairs, 0.05);
});

test("CLD: intransitive significance on a 4-group cycle stays consistent", () => {
  // Non-significant graph is the 4-cycle 0—1—2—3—0; the diagonals
  // (0≠2, 1≠3) differ. Correct CLD = the four edge-cliques — every
  // non-significant pair must still co-occur in some letter.
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.001 },
    { i: 0, j: 3, p: 0.5 },
    { i: 1, j: 2, p: 0.5 },
    { i: 1, j: 3, p: 0.001 },
    { i: 2, j: 3, p: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 4);
  assertCldConsistent(cld, pairs, 0.05);
});

// ── Automatic test selection ───────────────────────────────────────────────
//
// Default policy (Welch by default — see stats.js header for the literature
// citations and rationale):
//   k = 2  → Welch's t                       (no post-hoc)
//   k ≥ 3  → Welch's ANOVA + Games-Howell
// SW + Levene are computed as diagnostics in the trace; they do not gate
// the test choice. When SW flags non-normal data, `suggestion` names a
// non-parametric alternative the user can switch to manually.

suite("stats.js — automatic test selection");

// Two normal groups, equal variance — diagnostics agree, default is Welch.
const normalA = [4.9, 5.1, 5.0, 5.2, 4.8, 5.1, 4.9, 5.0, 5.2, 4.9];
const normalB = [5.9, 6.1, 6.0, 6.2, 5.8, 6.1, 5.9, 6.0, 6.2, 5.9];

test("k=2 normal+equalVar → welchT (default), no suggestion", () => {
  const r = selectTest([normalA, normalB]);
  assert(r.allNormal === true, "expected allNormal true");
  assert(r.levene.equalVar === true, "expected equalVar true (diagnostic only)");
  assert(r.recommendation.test === "welchT", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === null, "no post-hoc for k=2");
  assert(r.suggestion == null, "no suggestion when SW does not flag");
});

// Two normal groups, very different variances — Welch is the right call.
const normalSmallVar = [9.9, 10.0, 10.1, 10.0, 9.95, 10.05, 10.02, 9.98, 10.03, 9.97];
const normalLargeVar = [5, 15, 7, 13, 6, 14, 8, 12, 9, 11];

test("k=2 normal+unequalVar → welchT, levene rejects in trace", () => {
  const r = selectTest([normalSmallVar, normalLargeVar]);
  assert(r.levene.equalVar === false, `expected Levene to reject, got p=${r.levene.p}`);
  assert(r.recommendation.test === "welchT", `got ${r.recommendation.test}`);
  assert(r.suggestion == null, "Levene reject does not produce a suggestion");
});

// Heavy-skewed (exponential-ish) — Welch is still default; SW flag adds a
// suggestion to consider Mann-Whitney.
const skewed1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.8, 1.5, 3.0, 6.0, 12.0, 25.0];
const skewed2 = [0.2, 0.3, 0.4, 0.6, 0.9, 1.2, 2.0, 4.0, 8.0, 15.0, 30.0];

test("k=2 non-normal → welchT (default) + mannWhitney suggestion", () => {
  const r = selectTest([skewed1, skewed2]);
  assert(r.allNormal === false, "expected SW to flag non-normal");
  assert(r.recommendation.test === "welchT", `default still Welch, got ${r.recommendation.test}`);
  assert(r.suggestion != null, "expected non-parametric suggestion");
  assert(r.suggestion.test === "mannWhitney", `suggestion ${r.suggestion.test}`);
  assert(r.suggestion.postHoc === null, "k=2 suggestion has no post-hoc");
});

// iris Sepal.Length — normal, slightly unequal variances; default Welch ANOVA.
test("k=3 iris SL → welchANOVA + gamesHowell, no suggestion", () => {
  const r = selectTest(irisSL);
  assert(r.allNormal === true, "iris SL groups are normal");
  assert(r.recommendation.test === "welchANOVA", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === "gamesHowell", `got ${r.recommendation.postHoc}`);
  assert(r.suggestion == null, "no suggestion when SW does not flag");
});

// PlantGrowth — normal, equal variance; default still Welch ANOVA (matches
// one-way ANOVA closely on equal-variance data, so no harm in the default).
test("k=3 PlantGrowth → welchANOVA + gamesHowell (Welch by default)", () => {
  const r = selectTest(pg);
  assert(r.allNormal === true, "PlantGrowth groups are normal");
  assert(r.levene.equalVar === true, `Levene p=${r.levene.p} should not reject`);
  assert(r.recommendation.test === "welchANOVA", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === "gamesHowell", `got ${r.recommendation.postHoc}`);
  assert(r.suggestion == null, "no suggestion on equal-var normal data");
});

// Clearly non-normal (bimodal + skewed) k=3 — Welch ANOVA stays default;
// SW flag adds a Kruskal-Wallis suggestion.
test("k=3 non-normal → welchANOVA (default) + kruskalWallis suggestion", () => {
  const skA = [1, 1, 1, 1, 1, 1, 1, 1, 1, 20];
  const skB = [2, 2, 2, 2, 2, 2, 2, 2, 2, 25];
  const skC = [3, 3, 3, 3, 3, 3, 3, 3, 3, 30];
  const r = selectTest([skA, skB, skC]);
  assert(r.allNormal === false, "expected non-normal");
  assert(
    r.recommendation.test === "welchANOVA",
    `default still Welch ANOVA, got ${r.recommendation.test}`
  );
  assert(r.suggestion != null, "expected non-parametric suggestion");
  assert(r.suggestion.test === "kruskalWallis", `suggestion ${r.suggestion.test}`);
  assert(r.suggestion.postHoc === "dunn", `suggestion postHoc ${r.suggestion.postHoc}`);
});

// Edge: tiny group (n<3) — SW can't run, but Welch still computes from the
// raw values, so the recommendation stays Welch t. The trace exposes the
// `n<3` note so the user sees why SW didn't fire.
test("tiny group (n<3) — SW unavailable, recommendation stays welchT", () => {
  const r = selectTest([
    [1, 2],
    [3, 4, 5, 6],
  ]);
  assert(r.normality[0].normal === null, "n<3 → SW could not run");
  assert(r.normality[0].note === "n<3", "expected n<3 note in the trace");
  assert(r.recommendation.test === "welchT", `got ${r.recommendation.test}`);
  assert(r.suggestion == null, "no suggestion when SW couldn't run at all");
});

test("k<2 returns error", () => {
  const r = selectTest([[1, 2, 3]]);
  assert(r.error != null, "expected error");
});

test("alphaNormality controls the suggestion threshold (not the recommendation)", () => {
  // The default recommendation no longer depends on SW. The only thing
  // alphaNormality controls now is whether SW flags the data as non-normal —
  // i.e. whether `suggestion` appears at all.
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
  const b = [2, 3, 4, 5, 6, 7, 8, 9, 10, 55];
  const strict = selectTest([a, b]);
  const loose = selectTest([a, b], { alphaNormality: 1e-9 });
  assert(strict.recommendation.test === "welchT", "strict still recommends Welch");
  assert(loose.recommendation.test === "welchT", "loose still recommends Welch");
  assert(strict.suggestion != null, "strict α flags SW → suggestion appears");
  assert(loose.suggestion == null, "loose α swallows the SW flag → no suggestion");
});

test("reason text cites Welch-by-default rationale", () => {
  const r = selectTest([normalA, normalB]);
  const reason = r.recommendation.reason;
  assert(typeof reason === "string" && reason.length > 0, "expected non-empty reason");
  assert(/Welch/i.test(reason), "reason should mention Welch");
  assert(/override/i.test(reason), "reason should mention override path");
  assert(/Shapiro|SW/i.test(reason), "reason should reference SW diagnostic");
  assert(/Levene/i.test(reason), "reason should reference Levene diagnostic");
});

// ── selectTest — narrative content + branch-boundary pins (mutation audit) ─
//
// Existing tests pin recommendation.test / suggestion.test values but not
// the narrative-string content. Many `selectTest` mutants survive because
// the narrative is mutated to "" or to ``` (empty template literal), the
// `1 of k` count is wrong, group labels start at 0 instead of 1, etc. —
// none of which the existing tests detect. These pins assert specific
// substrings in the reason / suggestion narratives so a content-shifting
// mutation produces a substring miss.

suite("selectTest — narrative content pins");

test("k=2 non-normal suggestion narrative names Mann-Whitney explicitly", () => {
  const r = selectTest([skewed1, skewed2]);
  const reason = r.recommendation.reason;
  assert(/Mann-Whitney/i.test(reason), "should name Mann-Whitney U for k=2 suggestion");
  assert(/heavy tails|skew/i.test(reason), "should describe when to switch (heavy tails / skew)");
});

test("k=3 non-normal suggestion narrative names Kruskal-Wallis + Dunn", () => {
  const skA = [1, 1, 1, 1, 1, 1, 1, 1, 1, 20];
  const skB = [2, 2, 2, 2, 2, 2, 2, 2, 2, 25];
  const skC = [3, 3, 3, 3, 3, 3, 3, 3, 3, 30];
  const r = selectTest([skA, skB, skC]);
  const reason = r.recommendation.reason;
  assert(/Kruskal-Wallis/i.test(reason), "k=3 suggestion should name Kruskal-Wallis");
  assert(/Dunn/i.test(reason), "k=3 suggestion should name Dunn (BH)");
});

test("normality narrative labels groups starting at 1 (kills 'r.group + 1' → '- 1' mutation)", () => {
  const r = selectTest([skewed1, skewed2]);
  const reason = r.recommendation.reason;
  // skewed1, skewed2 both flagged → narrative lists "group 1" and "group 2".
  // A mutation flipping `r.group + 1` to `r.group - 1` would label them
  // "group -1" and "group 0", or `* 1` would label both "group 0".
  assert(/group 1/.test(reason), "narrative should label first group as 'group 1'");
  assert(/group 2/.test(reason), "narrative should label second group as 'group 2'");
  assert(!/group 0/.test(reason), "narrative must NOT label any group as 'group 0'");
  assert(!/group -1/.test(reason), "narrative must NOT label any group as 'group -1'");
});

test("Shapiro flag count narrative reads '<flagged> of <k> group(s)'", () => {
  // Both skewed1 and skewed2 flagged → "2 of 2 group(s)".
  const r = selectTest([skewed1, skewed2]);
  const reason = r.recommendation.reason;
  assert(
    /2 of 2/.test(reason),
    `expected '2 of 2 group(s)' in reason, got: ${reason.slice(0, 250)}`
  );
});

test("Levene narrative includes F=... p=... (kills toFixed mutations)", () => {
  const r = selectTest([normalA, normalB]);
  const reason = r.recommendation.reason;
  assert(/F=\d/.test(reason), "Levene narrative includes 'F=<digit>'");
  assert(/p=/.test(reason), "Levene narrative includes 'p='");
});

test("equalVar=false changes Levene narrative branch (kills L414 'equalVar !== false' mutation)", () => {
  // normalSmallVar vs normalLargeVar — Levene rejects equal variance.
  // The narrative branch should mention "rejected equal variances"; the
  // alternative branch (did not reject) says "did not reject".
  const r = selectTest([normalSmallVar, normalLargeVar]);
  assert(r.levene.equalVar === false, "fixture should make Levene reject");
  assert(
    /rejected equal variances/i.test(r.recommendation.reason),
    `should use 'rejected' branch when equalVar=false`
  );
});

test("equalVar=true keeps the 'did not reject' branch (Levene narrative pair)", () => {
  const r = selectTest([normalA, normalB]);
  assert(r.levene.equalVar === true, "fixture should make Levene not reject");
  assert(
    /did not reject/i.test(r.recommendation.reason),
    "should use 'did not reject' branch when equalVar=true"
  );
});

suite("selectTest — boundary-condition pins");

test("n=3 exactly: SW runs (kills 'g.length < 3' → '<= 3' boundary mutation)", () => {
  // At g.length=3 exactly, `if (g.length < 3)` is false → SW runs (W computed).
  // Mutant `<= 3` would skip SW and record note: "n<3".
  const r = selectTest([
    [10, 20, 30], // exactly 3 — at the boundary
    [11, 21, 31],
  ]);
  assert(r.normality[0].W !== null, "SW must run at exactly n=3");
  assert(r.normality[0].note !== "n<3", "no 'n<3' note when n=3 exactly");
});

test("'allKnownNormal' uses every (kills 'every' → 'some' mutation)", () => {
  // One normal group + one clearly non-normal group → with `every`, allNormal
  // is false. With mutant `some`, allNormal would be true (the normal group
  // counts). Pinning `allNormal === false` enforces the `every` semantic.
  const normalish = [9.9, 10.0, 10.1, 10.05, 9.95, 10.02, 9.98, 10.03, 9.97, 10.01];
  const skewed = [1, 1, 1, 1, 1, 1, 1, 1, 1, 50];
  const r = selectTest([normalish, skewed]);
  assert(r.normality[0].normal === true, "fixture: group 1 is normal");
  assert(r.normality[1].normal === false, "fixture: group 2 is non-normal");
  assert(r.allNormal === false, "allNormal must be false when even one group is flagged");
});

test("k=3 routing: test === 'welchANOVA' (kills 'k === 2' → 'k !== 2' mutation)", () => {
  // k=3 input → test should be welchANOVA, postHoc gamesHowell.
  // Mutated `k === 2` to `k !== 2`: k=3 satisfies `!== 2` → test = welchT,
  // postHoc = null, which the assertion below catches.
  const r = selectTest([
    [10, 11, 12, 13, 14, 15],
    [20, 21, 22, 23, 24, 25],
    [30, 31, 32, 33, 34, 35],
  ]);
  eq(r.recommendation.test, "welchANOVA");
  eq(r.recommendation.postHoc, "gamesHowell");
});

test("k=2 routing: test === 'welchT' + postHoc=null (kills 'k === 2' → 'k !== 2' mutation, other branch)", () => {
  // k=2 input → test=welchT, postHoc=null.
  const r = selectTest([normalA, normalB]);
  eq(r.recommendation.test, "welchT");
  eq(r.recommendation.postHoc, null);
});

test("selectTest: a non-finite value yields honest 'unknown' diagnostics, not false verdicts", () => {
  // A group carrying Infinity makes Shapiro-Wilk / Levene return NaN.
  // Without the guards, `NaN >= alpha` collapses to false and the
  // narrative would assert "non-normal" / "unequal variances" from
  // garbage. The diagnostics must instead report the group as unknown.
  const clean = [9.9, 10.0, 10.1, 10.05, 9.95, 10.02];
  const dirty = [10, 11, 12, Infinity, 13, 14];
  const r = selectTest([clean, dirty]);
  // The dirty group's normality verdict must be null (unknown), never false.
  assert(
    r.normality[1].normal !== false,
    `dirty group must not be flagged non-normal: ${JSON.stringify(r.normality[1])}`
  );
  // Levene reports as unavailable rather than as a NaN-derived verdict.
  assert(
    r.levene.error != null || r.levene.equalVar !== false,
    `Levene must not assert a verdict from NaN: ${JSON.stringify(r.levene)}`
  );
  // The recommended test stays Welch — the pick never depended on the
  // (now honestly-unknown) diagnostics.
  eq(r.recommendation.test, "welchT");
});

// ── Hierarchical clustering ────────────────────────────────────────────────

// ── rowDistance — direct, per-metric pins (mutation audit) ─────────────────
//
// Existing coverage exercised rowDistance only indirectly through
// pairwiseDistance + hclust integration tests, which tolerate NaN distances
// at the hclust level (see "disconnected components" fixture). Many
// rowDistance mutants therefore survived: array-init mutations that emit
// NaN-producing first cells, equality-boundary mutations on the
// finite-pair filter, and the `xs.length === 0` / `xs.length < 2`
// saturation guards. These tests pin specific per-metric outputs so a
// distance-shifting mutation produces a value mismatch instead of just an
// NaN propagation the integration tests ignore.

suite("rowDistance — per-metric direct values");

test("manhattan: |a-b| component sum", () => {
  // |1-4| + |2-0| + |3-5| = 3 + 2 + 2 = 7
  approx(rowDistance([1, 2, 3], [4, 0, 5], "manhattan"), 7, 1e-12);
});

test("manhattan: zero distance to self", () => {
  eq(rowDistance([1.5, -2, 3], [1.5, -2, 3], "manhattan"), 0);
});

test("euclidean: 3-4-5 right triangle", () => {
  approx(rowDistance([1, 1], [4, 5], "euclidean"), 5, 1e-12);
});

test("euclidean: zero distance to self", () => {
  eq(rowDistance([1, 2, 3], [1, 2, 3], "euclidean"), 0);
});

test("correlation: perfectly positively correlated → 0 (= 1 - r)", () => {
  // r(x, 10x) = 1 → distance = 1 - 1 = 0
  approx(rowDistance([1, 2, 3, 4], [10, 20, 30, 40], "correlation"), 0, 1e-12);
});

test("correlation: perfectly negatively correlated → 2", () => {
  // r(x, -x) = -1 → distance = 1 - (-1) = 2
  approx(rowDistance([1, 2, 3], [3, 2, 1], "correlation"), 2, 1e-12);
});

suite("rowDistance — edge cases (saturation guards)");

test("all-non-finite pairs → NaN (xs.length === 0 guard)", () => {
  assert(Number.isNaN(rowDistance([NaN, NaN], [NaN, NaN], "euclidean")));
  assert(Number.isNaN(rowDistance([NaN, NaN], [NaN, NaN], "manhattan")));
  assert(Number.isNaN(rowDistance([NaN, NaN], [NaN, NaN], "correlation")));
});

test("empty arrays → NaN", () => {
  assert(Number.isNaN(rowDistance([], [], "euclidean")));
  assert(Number.isNaN(rowDistance([], [], "manhattan")));
  assert(Number.isNaN(rowDistance([], [], "correlation")));
});

test("correlation with single finite pair → NaN (xs.length < 2 guard)", () => {
  // Only k=0 contributes finite values → xs = [1], ys = [2] → length < 2.
  // Pins the L48 saturation: correlation needs ≥ 2 paired points.
  assert(Number.isNaN(rowDistance([1, NaN], [2, NaN], "correlation")));
  assert(Number.isNaN(rowDistance([Infinity, 1, NaN], [-Infinity, 2, NaN], "correlation")));
});

test("correlation with constant first row → 1 (sxx === 0 saturation)", () => {
  // r is undefined when one variance is zero; the kernel returns 1
  // (maximally dissimilar by convention). Pins the L67 fallback.
  eq(rowDistance([5, 5, 5], [1, 2, 3], "correlation"), 1);
});

test("correlation with constant second row → 1 (syy === 0 saturation)", () => {
  eq(rowDistance([1, 2, 3], [5, 5, 5], "correlation"), 1);
});

test("correlation skips non-finite components (pairwise-complete)", () => {
  // a = [1, NaN, 3], b = [10, 20, 30] → only pairs at k=0 and k=2 finite.
  // xs = [1, 3], ys = [10, 30]. Both perfectly correlated → distance 0.
  approx(rowDistance([1, NaN, 3], [10, 20, 30], "correlation"), 0, 1e-12);
});

// ── dendrogramLayout maxHeight + segment count pins (mutation audit) ───────
//
// Existing dendrogramLayout tests pin segment placement but not the
// maxHeight tracking explicitly across multi-height trees. Adding a
// specific multi-height pin so the `h > maxHeight` accumulator stays
// constrained.

suite("dendrogramLayout — maxHeight + segments");

test("maxHeight equals the largest internal-node height across a multi-level tree", () => {
  // Tree:
  //   merge at h=1.5
  //   ├── leaf 0
  //   └── merge at h=0.5
  //       ├── leaf 1
  //       └── leaf 2
  // maxHeight must be 1.5 — and stay 1.5 even though the recursion walks
  // h=0.5 first (left subtree visited before parent height is seen).
  const tree = {
    index: -1,
    height: 1.5,
    size: 3,
    left: { index: 0, left: null, right: null, height: 0, size: 1 },
    right: {
      index: -1,
      height: 0.5,
      size: 2,
      left: { index: 1, left: null, right: null, height: 0, size: 1 },
      right: { index: 2, left: null, right: null, height: 0, size: 1 },
    },
  };
  const { maxHeight, segments } = dendrogramLayout(tree);
  approx(maxHeight, 1.5, 1e-12);
  // Two internal nodes × 3 segments per merge = 6 segments total.
  eq(segments.length, 6);
});

test("dendrogramLayout(null) → empty layout (defensive guard)", () => {
  const r = dendrogramLayout(null);
  eq(r.segments.length, 0);
  eq(r.maxHeight, 0);
});

// ── kmeans iteration + inertia pins (mutation audit) ───────────────────────
//
// Existing kmeans tests pin the clustering of 6 well-separated points but
// don't explicitly assert iteration count or inertia minimisation. Mutants
// that break the convergence-detection logic (`changed = true` →
// `changed = false`, `!changed break` always-firing, etc.) survive when
// the final cluster assignment happens to be the same regardless.

suite("kmeans — iteration + inertia invariants");

test("converges in < maxIter iterations on well-separated clusters", () => {
  // Two well-separated clusters in 2D: 3 points near (0, 0) and 3 near
  // (100, 100). k-means at k=2 must converge quickly. If the convergence-
  // detection mutates (e.g., `changed` never set to true → break after
  // iteration 1), iterations will read as 1 and the centroids may still
  // happen to be correct after one assignment — but pinning iterations >
  // 1 forces the full convergence path to fire.
  const matrix = [
    [0, 0],
    [1, 1],
    [-1, 0],
    [100, 100],
    [101, 99],
    [99, 101],
  ];
  const res = kmeans(matrix, 2, { seed: 1, restarts: 1, maxIter: 50 });
  assert(res.iterations >= 1 && res.iterations <= 50, "iterations in [1, maxIter]");
  // For these inputs convergence happens in 2-4 iterations across most
  // initialisations; pin a soft upper bound to catch "always runs to
  // maxIter" mutants on `changed`.
  assert(res.iterations < 50, "must converge before maxIter for well-separated input");
});

test("inertia is strictly less than picking centroids = first k rows", () => {
  // kmeans++ + 8 restarts should find a partition with lower SSE than
  // picking the first two points as centroids. Pins the inertia-
  // minimisation logic (best-of-restarts comparison at L226 and
  // assignment-step `dist < bestD` at L283). A mutant that always picks
  // the first attempt regardless of inertia would yield a worse partition.
  const matrix = [
    [0, 0],
    [1, 1],
    [-1, 0],
    [100, 100],
    [101, 99],
    [99, 101],
  ];
  const res = kmeans(matrix, 2, { seed: 1, restarts: 8 });
  // Naïve baseline: take rows 0 and 1 as centroids; assign every point to
  // its closer centroid; compute SSE.
  const c0 = matrix[0];
  const c1 = matrix[1];
  const sqd = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let baselineInertia = 0;
  for (const row of matrix) {
    baselineInertia += Math.min(sqd(row, c0), sqd(row, c1));
  }
  assert(
    res.inertia < baselineInertia,
    `kmeans inertia ${res.inertia} must beat naïve baseline ${baselineInertia}`
  );
});

test("deterministic with same seed across runs", () => {
  // Pins the seeded-RNG path through kmeansRng. A mutant that breaks
  // determinism (e.g., RNG seed clamping at L381 misfiring) would
  // produce different clusterings on identical seed inputs.
  const matrix = [
    [0, 0],
    [10, 10],
    [20, 20],
    [30, 30],
    [40, 40],
    [50, 50],
  ];
  const r1 = kmeans(matrix, 3, { seed: 42, restarts: 3 });
  const r2 = kmeans(matrix, 3, { seed: 42, restarts: 3 });
  eq(JSON.stringify(r1.clusters), JSON.stringify(r2.clusters));
  approx(r1.inertia, r2.inertia, 1e-15);
});

test("all centroids are populated (no NaN coordinates) for finite input", () => {
  // Pins the centroid-update path. The `counts[c][j] > 0 ? sums / counts
  // : NaN` ternary at L327 emits NaN only on empty clusters; the L319+
  // empty-cluster reseed must repopulate centroids. A test on finite
  // input with k ≤ n must never produce NaN centroid coordinates.
  const matrix = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ];
  const res = kmeans(matrix, 2, { seed: 1, restarts: 4 });
  for (const cent of res.centroids) {
    for (const v of cent) {
      assert(Number.isFinite(v), `centroid coordinate must be finite, got ${v}`);
    }
  }
});

suite("pairwiseDistance — metrics");

test("Euclidean distance on identical rows is 0", () => {
  const D = pairwiseDistance(
    [
      [1, 2, 3],
      [1, 2, 3],
    ],
    "euclidean"
  );
  approx(D[0][1], 0, 1e-12);
  approx(D[1][0], 0, 1e-12);
});

test("Euclidean distance — hand-worked case", () => {
  // row_a = [0,0,0], row_b = [3,4,0]  → d = √(9+16) = 5
  const D = pairwiseDistance(
    [
      [0, 0, 0],
      [3, 4, 0],
    ],
    "euclidean"
  );
  approx(D[0][1], 5, 1e-12);
});

test("Manhattan distance — |a - b| sum", () => {
  const D = pairwiseDistance(
    [
      [0, 0, 0],
      [3, 4, 0],
    ],
    "manhattan"
  );
  approx(D[0][1], 7, 1e-12);
});

test("Correlation distance is 0 for perfectly correlated rows", () => {
  // Two rows with identical shape but different scale → r = 1 → d = 0.
  const D = pairwiseDistance(
    [
      [1, 2, 3, 4],
      [2, 4, 6, 8],
    ],
    "correlation"
  );
  approx(D[0][1], 0, 1e-10);
});

test("Correlation distance is 2 for perfectly anti-correlated rows", () => {
  const D = pairwiseDistance(
    [
      [1, 2, 3, 4],
      [4, 3, 2, 1],
    ],
    "correlation"
  );
  approx(D[0][1], 2, 1e-10);
});

test("Distance matrix is symmetric and zero on diagonal", () => {
  const D = pairwiseDistance(
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ],
    "euclidean"
  );
  for (let i = 0; i < 3; i++) {
    approx(D[i][i], 0, 1e-12);
    for (let j = 0; j < 3; j++) approx(D[i][j], D[j][i], 1e-12);
  }
});

suite("hclust — tree structure and ordering");

test("single leaf returns trivial tree", () => {
  const res = hclust([[0]], "average");
  assert(res.order.length === 1 && res.order[0] === 0, "single leaf in order");
  assert(res.tree && res.tree.left === null, "single leaf tree");
});

test("UPGMA on a textbook 5-point matrix produces a valid binary tree", () => {
  // Simple 5-point distance matrix; exact leaf order depends on tie-breaking,
  // so we assert structural invariants rather than a specific permutation.
  const D = [
    [0, 2, 4, 6, 8],
    [2, 0, 3, 5, 7],
    [4, 3, 0, 4, 6],
    [6, 5, 4, 0, 3],
    [8, 7, 6, 3, 0],
  ];
  const res = hclust(D, "average");
  assert(res.order.length === 5, "all 5 leaves present in order");
  // Every index should appear exactly once.
  const seen = new Set(res.order);
  assert(seen.size === 5, "no duplicate leaves");
  for (let i = 0; i < 5; i++) assert(seen.has(i), `leaf ${i} in order`);
  // Root size should equal leaf count.
  assert(res.tree.size === 5, "tree size == 5");
  // Heights should be non-decreasing from leaves to root.
  function checkHeights(n, parentH) {
    if (!n || (n.left === null && n.right === null)) return;
    assert(n.height <= parentH + 1e-9, `height ${n.height} not > parent ${parentH}`);
    checkHeights(n.left, n.height);
    checkHeights(n.right, n.height);
  }
  checkHeights(res.tree, Infinity);
});

test("single linkage merges the closest pair first", () => {
  // Points along a line: 0, 1, 10, 11. Single linkage should merge
  // {0,1} and {10,11} before joining the two clusters.
  const D = [
    [0, 1, 10, 11],
    [1, 0, 9, 10],
    [10, 9, 0, 1],
    [11, 10, 1, 0],
  ];
  const res = hclust(D, "single");
  // The resulting order should keep {0,1} contiguous and {2,3} contiguous.
  const posOf = new Map();
  res.order.forEach((v, i) => posOf.set(v, i));
  const gap01 = Math.abs(posOf.get(0) - posOf.get(1));
  const gap23 = Math.abs(posOf.get(2) - posOf.get(3));
  assert(gap01 === 1, `indices 0 and 1 adjacent (gap ${gap01})`);
  assert(gap23 === 1, `indices 2 and 3 adjacent (gap ${gap23})`);
});

test("complete linkage on the same input also keeps close pairs adjacent", () => {
  const D = [
    [0, 1, 10, 11],
    [1, 0, 9, 10],
    [10, 9, 0, 1],
    [11, 10, 1, 0],
  ];
  const res = hclust(D, "complete");
  const posOf = new Map();
  res.order.forEach((v, i) => posOf.set(v, i));
  assert(Math.abs(posOf.get(0) - posOf.get(1)) === 1, "0 and 1 adjacent");
  assert(Math.abs(posOf.get(2) - posOf.get(3)) === 1, "2 and 3 adjacent");
});

test("all-NaN distance matrix still returns a complete leaf permutation", () => {
  // Happens in practice when pairwiseDistance runs correlation on rows
  // whose finite values don't overlap (1-finite-pair rows, all-NaN rows,
  // etc.). Before the fix hclust broke out of the merge loop early and
  // returned only one leaf in `order`, corrupting the heatmap row order.
  const n = 5;
  const D = Array.from({ length: n }, () => new Array(n).fill(NaN));
  for (let i = 0; i < n; i++) D[i][i] = 0;
  const res = hclust(D, "average");
  assert(res.tree, "tree is non-null");
  assert(res.order.length === n, `order length ${res.order.length} === ${n}`);
  const unique = new Set(res.order);
  assert(unique.size === n, `order is a permutation of all ${n} leaves`);
});

// Every internal node's merge height must be ≥ both children's heights,
// or dendrogramLayout draws a parent bar below its children (a visibly
// crossed / inverted dendrogram).
const assertMonotoneHeights = (node) => {
  if (!node || (node.left === null && node.right === null)) return;
  for (const child of [node.left, node.right]) {
    if (!child) continue;
    assert(
      node.height >= child.height,
      `inverted merge: parent height ${node.height} < child height ${child.height}`
    );
    assertMonotoneHeights(child);
  }
};

test("merge heights stay monotone — a forced merge never sinks below its children", () => {
  // Points 0 and 1 are a finite distance 1 apart; point 2 has no finite
  // distance to either. hclust merges {0,1} at height 1, then is forced
  // to merge in point 2 with no distance information. That forced merge
  // must NOT land at height 0 — below its own height-1 child — which
  // would draw an inverted dendrogram. It is clamped up to the child's
  // height instead.
  const D = [
    [0, 1, NaN],
    [1, 0, NaN],
    [NaN, NaN, 0],
  ];
  for (const linkage of ["average", "single", "complete"]) {
    const { tree } = hclust(D, linkage);
    assertMonotoneHeights(tree);
    eq(tree.height, 1); // the forced root merge is clamped to its child's height
  }
});

// ── hclust merge-height fixtures (Lance-Williams update pins) ─────────────
//
// The structural tests above pin leaf permutation and adjacency only — they
// don't catch mutations on the Lance-Williams update formula itself or on
// the min-pair search. The following fixtures pin every merge height to
// floating-point precision against a hand-traced 5-point matrix with no
// ties, so a coefficient flip in the update step or an off-by-one in the
// min search fails the assertion immediately.
//
// Distance matrix (no ties, every linkage produces the same leaf order):
//   A  0    0.5  2.3  5.1  6.2
//   B  0.5  0    3.1  5.4  6.5
//   C  2.3  3.1  0    4.2  5.3
//   D  5.1  5.4  4.2  0    1.1
//   E  6.2  6.5  5.3  1.1  0
//
// Hand-traced merge sequence (UPGMA / average linkage):
//   1. A-B at 0.5                        (smallest in raw matrix)
//   2. D-E at 1.1                        (next smallest after step 1)
//   3. AB-C at (2.3+3.1)/2 = 2.7         (UPGMA: weighted avg)
//   4. ABC-DE at (2·5.8 + 1·4.75)/3 = 5.45 where
//        5.8  = (5.25+6.35)/2 = avg(d(AB,D), d(AB,E)) [AB-DE distance]
//        4.75 = (4.2+5.3)/2 = avg(d(C,D), d(C,E))    [C-DE distance]
//
// Single linkage uses min, complete uses max in the update step — the
// merge heights diverge at steps 3/4 while step 1/2 (single-leaf
// merges) are identical across all three linkages.

const HCLUST_FIXTURE_D = [
  [0, 0.5, 2.3, 5.1, 6.2],
  [0.5, 0, 3.1, 5.4, 6.5],
  [2.3, 3.1, 0, 4.2, 5.3],
  [5.1, 5.4, 4.2, 0, 1.1],
  [6.2, 6.5, 5.3, 1.1, 0],
];

// Walk a tree and return its merges in chronological order (heights
// non-decreasing, so this is a sort by height with stable insertion).
function _flattenMerges(node) {
  const merges = [];
  function visit(n) {
    if (!n || (n.left === null && n.right === null)) return;
    visit(n.left);
    visit(n.right);
    merges.push({ height: n.height, size: n.size });
  }
  visit(node);
  return merges.sort((a, b) => a.height - b.height);
}

test("UPGMA on 5-point fixture — merge heights match hand-traced reference", () => {
  const res = hclust(HCLUST_FIXTURE_D, "average");
  assert(JSON.stringify(res.order) === JSON.stringify([0, 1, 2, 3, 4]), `order ${res.order}`);
  const merges = _flattenMerges(res.tree);
  const expected = [
    { height: 0.5, size: 2 }, // A-B
    { height: 1.1, size: 2 }, // D-E
    { height: 2.7, size: 3 }, // AB-C
    { height: 5.45, size: 5 }, // ABC-DE
  ];
  assert(
    merges.length === expected.length,
    `expected ${expected.length} merges, got ${merges.length}`
  );
  for (let i = 0; i < expected.length; i++) {
    assert(
      Math.abs(merges[i].height - expected[i].height) < 1e-9,
      `merge ${i}: h=${merges[i].height} vs ${expected[i].height}`
    );
    assert(
      merges[i].size === expected[i].size,
      `merge ${i}: size=${merges[i].size} vs ${expected[i].size}`
    );
  }
});

test("single linkage on 5-point fixture — uses MIN in update", () => {
  // Single linkage step 3: d(AB, C) = min(d(A,C), d(B,C)) = min(2.3, 3.1) = 2.3
  // Step 4: d(ABC, DE) = min over all cross-pairs = min(5.1, 5.4, 4.2) = 4.2
  const res = hclust(HCLUST_FIXTURE_D, "single");
  const merges = _flattenMerges(res.tree);
  const expected = [0.5, 1.1, 2.3, 4.2];
  for (let i = 0; i < expected.length; i++) {
    assert(
      Math.abs(merges[i].height - expected[i]) < 1e-9,
      `single merge ${i}: ${merges[i].height} vs ${expected[i]}`
    );
  }
});

test("complete linkage on 5-point fixture — uses MAX in update", () => {
  // Complete linkage step 3: d(AB, C) = max(2.3, 3.1) = 3.1
  // Step 4: d(ABC, DE) = max over all cross-pairs = max(5.1, 5.4, 4.2, 6.2, 6.5, 5.3) = 6.5
  const res = hclust(HCLUST_FIXTURE_D, "complete");
  const merges = _flattenMerges(res.tree);
  const expected = [0.5, 1.1, 3.1, 6.5];
  for (let i = 0; i < expected.length; i++) {
    assert(
      Math.abs(merges[i].height - expected[i]) < 1e-9,
      `complete merge ${i}: ${merges[i].height} vs ${expected[i]}`
    );
  }
});

suite("dendrogramLayout — SVG segments");

test("trivial leaf produces no segments", () => {
  const { tree } = hclust([[0]], "average");
  const { segments, maxHeight } = dendrogramLayout(tree);
  assert(segments.length === 0, "no segments for single leaf");
  assert(maxHeight === 0, "zero height");
});

test("three-leaf tree produces two merges with 3 segments each", () => {
  const D = [
    [0, 1, 10],
    [1, 0, 9],
    [10, 9, 0],
  ];
  const { tree } = hclust(D, "average");
  const { segments, maxHeight } = dendrogramLayout(tree);
  // 2 merges × (2 vertical + 1 horizontal) = 6 segments total.
  assert(segments.length === 6, `got ${segments.length} segments`);
  assert(maxHeight > 0, "maxHeight positive");
});

suite("kmeans — partitioning and order");

test("trivial 1-row matrix returns single-cluster result", () => {
  const res = kmeans([[1, 2, 3]], 3, { seed: 1, restarts: 1 });
  assert(res.clusters.length === 1, "one clusters entry");
  assert(res.centroids.length === 1, "k clamped to n=1");
  assert(res.order.length === 1 && res.order[0] === 0, "order is [0]");
});

test("two well-separated blobs partition cleanly with k=2", () => {
  const rows = [
    [0, 0],
    [0.1, 0.1],
    [0, 0.2],
    [10, 10],
    [10.1, 10.1],
    [10, 9.9],
  ];
  const res = kmeans(rows, 2, { seed: 42, restarts: 4 });
  const labelA = res.clusters[0];
  const labelB = res.clusters[3];
  assert(labelA !== labelB, "two clusters separate the blobs");
  assert(res.clusters[1] === labelA && res.clusters[2] === labelA, "blob A grouped");
  assert(res.clusters[4] === labelB && res.clusters[5] === labelB, "blob B grouped");
});

test("deterministic with the same seed", () => {
  const rows = [
    [0, 0],
    [1, 1],
    [5, 5],
    [5.5, 4.5],
    [10, 10],
    [11, 9],
  ];
  const a = kmeans(rows, 3, { seed: 7, restarts: 4 });
  const b = kmeans(rows, 3, { seed: 7, restarts: 4 });
  assert(JSON.stringify(a.clusters) === JSON.stringify(b.clusters), "clusters match");
  assert(JSON.stringify(a.order) === JSON.stringify(b.order), "order matches");
});

test("order groups rows by cluster id and permutes all n rows", () => {
  const rows = [
    [0, 0],
    [10, 10],
    [0.1, 0],
    [10, 9.9],
    [0, 0.2],
    [9.8, 10],
  ];
  const res = kmeans(rows, 2, { seed: 3, restarts: 4 });
  assert(res.order.length === rows.length, "order covers every row");
  const seen = new Set(res.order);
  assert(seen.size === rows.length, "order has no duplicates");
  // Within `order`, once the cluster id changes it must not change back.
  let transitions = 0;
  for (let i = 1; i < res.order.length; i++) {
    if (res.clusters[res.order[i]] !== res.clusters[res.order[i - 1]]) transitions++;
  }
  assert(transitions <= 1, "order groups same-cluster rows together");
});

test("inertia decreases (or matches) a worse initialisation", () => {
  const rows = [
    [0, 0],
    [0.1, 0.2],
    [0.2, 0],
    [5, 5],
    [5.1, 4.9],
    [5, 5.2],
    [10, 0],
    [10.2, 0.1],
  ];
  const res = kmeans(rows, 3, { seed: 99, restarts: 8 });
  // Sum of squared spreads within 3 centred blobs is small.
  assert(res.inertia < 1, `inertia should be small, got ${res.inertia}`);
});

test("handles NaN entries pairwise without crashing", () => {
  const rows = [
    [0, 0, NaN],
    [0.2, NaN, 0],
    [5, 5, 5],
    [5.1, 4.9, 5.2],
  ];
  const res = kmeans(rows, 2, { seed: 1, restarts: 2 });
  assert(res.clusters.length === 4, "all rows assigned");
  assert(res.clusters[0] === res.clusters[1], "row 0 and 1 in same cluster");
  assert(res.clusters[2] === res.clusters[3], "row 2 and 3 in same cluster");
  assert(res.clusters[0] !== res.clusters[2], "the two pairs split");
});

// ── Tail-accuracy regressions (audit #13) ────────────────────────────────────

suite("normsf — tail-accurate survival");

test("normsf(0) = 0.5", () => {
  approx(normsf(0), 0.5, 1e-15);
});

test("normsf matches 1 − normcdf for moderate x (x = 2)", () => {
  approx(normsf(2), 1 - normcdf(2), 1e-8);
});

test("normsf(6) ≈ 9.87e-10 (R pnorm(6, lower.tail=FALSE), relative)", () => {
  // A&S 26.2.17 polynomial (used for |x| < 7) has ~0.5 % relative error at
  // x = 6. The key invariant is that normsf no longer underflows to 0 here,
  // not that it matches R's pnorm to double precision.
  const got = normsf(6);
  const want = 9.865876e-10;
  assert(Math.abs(got - want) / want < 5e-3, `normsf(6) = ${got}, expected ≈ ${want}`);
});

test("normsf(8) ≈ 6.22e-16 (deep tail, old 1-normcdf would round to 0)", () => {
  approx(normsf(8), 6.22096e-16, 1e-18);
});

test("normsf(12) stays finite (no underflow) and > 0", () => {
  const s = normsf(12);
  assert(s > 0 && s < 1e-30, `expected tiny positive, got ${s}`);
});

test("normsf(-8) = 1 − normsf(8) reflection works", () => {
  approx(normsf(-8), 1 - normsf(8), 1e-15);
});

suite("tcdf_upper — no 1 − (near-1) cancellation");

test("tcdf_upper at |t| < 3 matches 1 − tcdf", () => {
  approx(tcdf_upper(2.5, 20), 1 - tcdf(2.5, 20), 1e-12);
});

test("tcdf_upper(10.52, 98) ≈ 4.5e-18 (iris SL setosa/versicolor)", () => {
  // R: pt(10.52, 98, lower.tail=FALSE) ≈ 4.49e-18. Old JS underflowed to 0.
  const p = tcdf_upper(10.52, 98);
  assert(p > 0 && p < 1e-15, `expected ~4.5e-18, got ${p}`);
});

test("tcdf_upper(20, 50) stays > 0 (no underflow)", () => {
  const p = tcdf_upper(20, 50);
  assert(p > 0 && p < 1e-20, `expected tiny positive, got ${p}`);
});

suite("fcdf_upper — no 1 − (near-1) cancellation");

test("fcdf_upper matches 1 − fcdf for F < 10", () => {
  approx(fcdf_upper(4, 3, 50), 1 - fcdf(4, 3, 50), 1e-12);
});

test("fcdf_upper(100, 3, 50) stays > 0 for large F (no underflow)", () => {
  const p = fcdf_upper(100, 3, 50);
  assert(p > 0 && p < 1e-15, `expected tiny positive, got ${p}`);
});

suite("Deep-tail p-values — audit #13 regression set");

test("Shapiro-Wilk on heavily bimodal sample yields deep-tail p, not 0", () => {
  // Two tight peaks at 0 and 5 (50 each) — strongly bimodal, Shapiro-Wilk
  // should report a very small p. The old `1 − normcdf` path underflowed to 0
  // for z-scores past ~6; with normsf it stays a positive number.
  const bimodal = [];
  for (let i = 0; i < 50; i++) bimodal.push(0 + 0.01 * i);
  for (let i = 0; i < 50; i++) bimodal.push(5 + 0.01 * i);
  const { p } = shapiroWilk(bimodal);
  assert(p > 0, "p must be strictly positive (old code underflowed to 0)");
  assert(p < 1e-10, `expected deep-tail p but got ${p}`);
});

test("tTest at |t| ≈ 10 reports non-zero p (iris-like setup)", () => {
  // 50 values each, large mean shift — t ≈ 10-ish, df = 98.
  const a = Array.from({ length: 50 }, (_, i) => 5.0 + 0.02 * i);
  const b = Array.from({ length: 50 }, (_, i) => 6.0 + 0.02 * i);
  const { t, p } = tTest(a, b, { equalVar: true });
  assert(Math.abs(t) > 10, "sanity: expected |t| > 10");
  assert(p > 0, "p must be strictly positive (old code underflowed)");
  assert(p < 1e-10, `expected deep-tail p but got ${p}`);
});

test("oneWayANOVA with strong separation reports non-zero p", () => {
  // 3 groups, strong separation → tiny p.
  const groups = [
    Array.from({ length: 30 }, (_, i) => 4.0 + 0.01 * i),
    Array.from({ length: 30 }, (_, i) => 5.5 + 0.01 * i),
    Array.from({ length: 30 }, (_, i) => 7.0 + 0.01 * i),
  ];
  const { F, p } = oneWayANOVA(groups);
  assert(F > 1000, "sanity: expected huge F");
  assert(p > 0, "p must be strictly positive (old code underflowed)");
  assert(p < 1e-50, `expected very deep p but got ${p}`);
});

suite("ptukey_upper — tail-accurate studentized range");

test("_wprob_upper(w, 2) matches closed form 2·normsf(w/√2)", () => {
  // k=2 has a closed form: P(R > w) = 2·(1 − Φ(w/√2)). Verifying here
  // guarantees the geometric-series factorisation is correct before trusting
  // larger k.
  for (const w of [1, 3, 5]) {
    const got = ctx._wprob_upper(w, 2);
    const want = 2 * ctx.normsf(w / Math.SQRT2);
    assert(Math.abs(got - want) / want < 5e-3, `w=${w}: got ${got}, want ${want}`);
  }
});

test("_wprob + _wprob_upper ≈ 1 (complement identity)", () => {
  for (const w of [1, 3, 7, 10]) {
    for (const k of [2, 3, 5]) {
      const lo = ctx._wprob(w, k);
      const up = ctx._wprob_upper(w, k);
      assert(
        Math.abs(lo + up - 1) < 1e-6,
        `w=${w}, k=${k}: ${lo} + ${up} = ${lo + up}, expected ≈ 1`
      );
    }
  }
});

test("ptukey_upper(q, 2, df) matches 2·tcdf_upper(q/√2, df) (k=2 closed form)", () => {
  for (const q of [1, 3, 5]) {
    const got = ctx.ptukey_upper(q, 2, 50);
    const want = 2 * tcdf_upper(q / Math.SQRT2, 50);
    assert(Math.abs(got - want) / want < 5e-3, `q=${q}: got ${got}, want ${want}`);
  }
});

test("ptukey_upper is monotonically decreasing in q", () => {
  let prev = 1;
  for (const q of [1, 2, 3, 5, 8, 12, 20]) {
    const curr = ctx.ptukey_upper(q, 3, 50);
    assert(curr <= prev, `non-monotonic at q=${q}: prev=${prev}, curr=${curr}`);
    prev = curr;
  }
});

test("ptukey_upper at extreme q stays positive (no 2e-10 floor)", () => {
  // The old `1 − ptukey` path floored at 2e-10 because the chi² quantile
  // bounds missed ~2e-10 of mass. `ptukey_upper` integrates the complementary
  // _wprob_upper directly, so no floor.
  const p = ctx.ptukey_upper(22, 3, 147);
  assert(p > 0 && p < 1e-20, `expected tiny positive (no floor), got ${p}`);
});

test("_wprob_upper window adapts to peak u = −w/2 (k=2 closed form at large w)", () => {
  // Regression: before the adaptive window, _wprob_upper integrated on a
  // fixed [−8, 8] range, which misses the integrand peak (at u = −w/2) for
  // w > ~16. The k=2 closed form `2·normsf(w/√2)` catches this — at w=22
  // the fixed-window JS was off by 5 orders of magnitude.
  for (const w of [20, 22, 25, 30]) {
    const got = ctx._wprob_upper(w, 2);
    const want = 2 * ctx.normsf(w / Math.SQRT2);
    const rel = Math.abs(got - want) / want;
    assert(rel < 1e-4, `w=${w}: got ${got}, want ${want}, rel=${rel}`);
  }
});

test("ptukey_upper matches scipy at q=8 (independent cross-check)", () => {
  // scipy.stats.studentized_range.sf(8, 3, 147) = 2.3332e-7 (verified 2026-04-22).
  // MC with 20M samples: 2.50e-7 ± 1.12e-7. Both consistent with our value.
  const p = ctx.ptukey_upper(8, 3, 147);
  const want = 2.3332e-7;
  assert(Math.abs(p - want) / want < 5e-3, `ptukey_upper(8, 3, 147) = ${p}, scipy = ${want}`);
});

// ── Multi-set intersection test (SuperExactTest-style) ────────────────────
//
// Pins our `multisetIntersectionPExact` / `multisetIntersectionPPoisson` /
// `multisetIntersectionP` against reference values produced by
// `SuperExactTest::cpsets()` in R. Convention reminder: our JS returns
// `P(|∩| ≥ x_obs)` (strict upper tail); `cpsets(x, L, n, lower.tail=FALSE)`
// returns `P(|∩| > x)` = `P(|∩| ≥ x + 1)`, so reference values use `x - 1`
// in the R call.

suite("multisetIntersectionPExact — agrees with R SuperExactTest::cpsets");

test("k=2 hypergeometric case matches R to 6 sigfigs", () => {
  // cpsets(4, c(20, 30), 100, lower.tail=FALSE) = 0.7908368
  approx(ctx.multisetIntersectionPExact(5, [20, 30], 100), 0.790837, 1e-5);
});

test("k=2 moderate-large N matches R", () => {
  // cpsets(9, c(50, 60), 200, lower.tail=FALSE) = 0.977532
  approx(ctx.multisetIntersectionPExact(10, [50, 60], 200), 0.977532, 1e-5);
});

test("k=3 moderate matches R", () => {
  // cpsets(2, c(20, 30, 40), 100, lower.tail=FALSE) = 0.441005
  approx(ctx.multisetIntersectionPExact(3, [20, 30, 40], 100), 0.441005, 1e-5);
});

test("k=3 N=1000, p ≈ 0.003 matches R", () => {
  // cpsets(4, c(100, 100, 100), 1000, lower.tail=FALSE) = 0.00304692
  approx(ctx.multisetIntersectionPExact(5, [100, 100, 100], 1000), 0.00304692, 1e-7);
});

test("k=5 moderate N matches R", () => {
  // cpsets(1, c(20,30,40,50,60), 200, lower.tail=FALSE) = 0.000870939
  approx(ctx.multisetIntersectionPExact(2, [20, 30, 40, 50, 60], 200), 0.000870939, 1e-8);
});

test("k=5 deep tail p ~ 1e-15 matches R in log-space", () => {
  // cpsets(4, c(500,500,500,500,500), 10000, lower.tail=FALSE) = 2.24993e-15
  const js = ctx.multisetIntersectionPExact(5, [500, 500, 500, 500, 500], 10000);
  const r = 2.24993e-15;
  const logDiff = Math.abs(Math.log10(js) - Math.log10(r));
  assert(logDiff < 0.01, `log10 drift ${logDiff} (js=${js} r=${r})`);
});

test("k=2 very deep tail p ~ 1e-31 matches R in log-space", () => {
  // cpsets(29, c(50, 50), 1000, lower.tail=FALSE) = 6.08578e-31
  const js = ctx.multisetIntersectionPExact(30, [50, 50], 1000);
  const r = 6.08578e-31;
  const logDiff = Math.abs(Math.log10(js) - Math.log10(r));
  assert(logDiff < 0.01, `log10 drift ${logDiff}`);
});

test("xObs ≤ 0 returns 1 (every intersection has at least 0 elements)", () => {
  assert(ctx.multisetIntersectionPExact(0, [20, 30], 100) === 1);
  assert(ctx.multisetIntersectionPExact(-5, [10, 10, 10], 100) === 1);
});

test("xObs > min(n_i) returns 0 (intersection can't exceed smallest set)", () => {
  assert(ctx.multisetIntersectionPExact(11, [10, 50], 100) === 0);
});

test("invalid inputs return NaN", () => {
  assert(Number.isNaN(ctx.multisetIntersectionPExact(1, [10], 100))); // k < 2
  assert(Number.isNaN(ctx.multisetIntersectionPExact(1, [10, 10], 0))); // N = 0
  assert(Number.isNaN(ctx.multisetIntersectionPExact(1, [10, 150], 100))); // n_i > N
});

test("result is monotonically non-increasing in xObs", () => {
  let prev = 1.1;
  for (const x of [0, 1, 2, 3, 5, 10, 15, 20]) {
    const p = ctx.multisetIntersectionPExact(x, [20, 30, 40], 100);
    assert(p <= prev + 1e-12, `non-monotonic at x=${x}: prev=${prev}, curr=${p}`);
    prev = p;
  }
});

suite("multisetIntersectionPPoisson — approximation, not a substitute");

test("Poisson converges to exact at moderate overlap", () => {
  const exact = ctx.multisetIntersectionPExact(3, [100, 100, 100], 1000);
  const poisson = ctx.multisetIntersectionPPoisson(3, [100, 100, 100], 1000);
  // Expected λ = 100³/1000² = 0.1; upper tail at x=3 is tiny, both agree
  // to ~5 % relative.
  assert(Math.abs(exact - poisson) / exact < 0.1, `exact=${exact} poisson=${poisson}`);
});

test("Poisson deviates from exact in the deep tail (documented limitation)", () => {
  // cpsets(29, c(50, 50), 1000) = 6.1e-31, Poisson overestimates to ~3e-22.
  const exact = ctx.multisetIntersectionPExact(30, [50, 50], 1000);
  const poisson = ctx.multisetIntersectionPPoisson(30, [50, 50], 1000);
  assert(poisson > exact * 1e5, `Poisson should overestimate by many orders here`);
});

suite("multisetIntersectionP — router");

test("small inputs route to exact (matches the exact helper)", () => {
  const routed = ctx.multisetIntersectionP(5, [100, 100, 100], 1000);
  const exact = ctx.multisetIntersectionPExact(5, [100, 100, 100], 1000);
  approx(routed, exact, 1e-15);
});

test("very-large DP cost routes to Poisson without hanging", () => {
  // k · min(n_i)² = 5 · 10000² = 5e8 op budget well beyond 1e7, forces Poisson.
  const routed = ctx.multisetIntersectionP(50, [10000, 10000, 10000, 10000, 10000], 100000);
  const poisson = ctx.multisetIntersectionPPoisson(50, [10000, 10000, 10000, 10000, 10000], 100000);
  approx(routed, poisson, 1e-15);
});

// ── multisetExclusiveP — interior + at-boundary pins (mutation audit) ──────
//
// Existing property tests for `multisetExclusiveP` pin xObs=0 / xObs=N+1 /
// xObs=-1 endpoints and a monotonicity invariant, but never assert that
// interior probabilities are *non-trivial*. A mutant making the upper-tail
// branch always return 0 (or 1) satisfies both: "output in [0, 1]" trivially,
// "monotonic non-increasing" trivially (0 ≥ 0). These tests pin specific
// interior values via R `pbinom()` cross-checks plus saturation behaviour at
// the exact boundary (xObs == Nint for upper, xObs == 0 for lower), so a
// branch-killing mutant produces a result that disagrees with R.

suite("multisetExclusiveP — interior + at-boundary pins");

// Both tails are inclusive: upper(xObs) = P(X ≥ xObs), lower(xObs) =
// P(X ≤ xObs). The sum-to-1 invariant is therefore between adjacent xObs:
// upper(k+1) + lower(k) = 1 (since P(X ≥ k+1) = 1 - P(X ≤ k)).

test("upper-tail interior at the binomial mean is squarely in (0, 1)", () => {
  // R: pbinom(29, 100, 0.3, lower.tail = FALSE) ≈ 0.53766
  // (P(Binomial(100, 0.3) >= 30) via the betai/binomial-beta identity.)
  // Pins a value that distinguishes a real (≈0.54) result from any mutant
  // that collapses the branch to 0 or 1.
  const p = ctx.multisetExclusiveP(30, [30], [], 100, { tail: "upper" });
  approx(p, 0.5376602639846533, 1e-6);
});

test("lower-tail interior at the binomial mean is squarely in (0, 1)", () => {
  // R: pbinom(30, 100, 0.3) ≈ 0.54912
  // Lower-tail is inclusive: P(X <= 30) at the mean of Bin(100, 0.3).
  const p = ctx.multisetExclusiveP(30, [30], [], 100, { tail: "lower" });
  approx(p, 0.5491236007687557, 1e-6);
});

test("upper(k+1) + lower(k) = 1 (complementary-tail axiom)", () => {
  // P(X >= k+1) + P(X <= k) = 1 for a discrete distribution. Pins the
  // two tail branches against each other — a mutant flipping either
  // branch's guard would break the sum.
  const up = ctx.multisetExclusiveP(31, [30], [], 100, { tail: "upper" });
  const lo = ctx.multisetExclusiveP(30, [30], [], 100, { tail: "lower" });
  approx(up + lo, 1, 1e-12);
});

test("upper-tail at xObs == Nint is non-zero (kills 'xObs >= Nint' mutant)", () => {
  // At equality the `xObs > Nint` guard is false; the branch falls through
  // to betai(Nint, 1, p) = p^Nint. For inside=[30] / N=100 / p=0.3 that's
  // 0.3^100 ≈ 5.15e-53 — tiny but strictly positive. A mutant turning the
  // guard into `xObs >= Nint` would short-circuit here and return 0.
  const p = ctx.multisetExclusiveP(100, [30], [], 100, { tail: "upper" });
  assert(p > 0, "must be strictly positive at xObs == Nint");
  approx(p, Math.pow(0.3, 100), 1e-60);
});

test("lower-tail at xObs == 0 is non-zero (kills 'xObs <= 0' mutant)", () => {
  // At xObs = 0 the `xObs < 0` guard is false; falls through to
  // betai(Nint, 1, 1 - p) = (1 - p)^Nint. For p=0.3 / Nint=100 that's
  // 0.7^100 ≈ 3.23e-16 — tiny but strictly positive. A mutant turning the
  // guard into `xObs <= 0` would short-circuit and return 0.
  const p = ctx.multisetExclusiveP(0, [30], [], 100, { tail: "lower" });
  assert(p > 0, "must be strictly positive at xObs == 0");
  approx(p, Math.pow(0.7, 100), 1e-22);
});

test("upper-tail saturation: p == 1 (inside=[N]) → 1", () => {
  eq(ctx.multisetExclusiveP(50, [100], [], 100, { tail: "upper" }), 1);
});

test("upper-tail saturation: p == 0 (inside=[0]) → 0", () => {
  eq(ctx.multisetExclusiveP(50, [0], [], 100, { tail: "upper" }), 0);
});

test("lower-tail saturation: p == 1 → 0", () => {
  eq(ctx.multisetExclusiveP(50, [100], [], 100, { tail: "lower" }), 0);
});

test("lower-tail saturation: p == 0 → 1", () => {
  eq(ctx.multisetExclusiveP(50, [0], [], 100, { tail: "lower" }), 1);
});

// ── multisetIntersectionPExactLower — at-boundary pins (mutation audit) ────
//
// Mirror of the multisetExclusiveP audit above. Existing property tests
// already pin xObs = minN endpoint (returns 1) and validate-arg NaN paths,
// but the saturation guards at xObs == minN - 1 (just below the upper
// endpoint, where the lower tail covers nearly the full distribution) and
// xObs = 0 (the smallest sensible argument) are not pinned, and the
// "always-1" / "always-0" mutants survive the existing monotonicity check.

suite("multisetIntersectionPExactLower — interior pins");

test("lower-tail (k=2) interior matches 1 - upper-tail at xObs+1", () => {
  // P(|∩| <= xObs) = 1 - P(|∩| >= xObs + 1). Both sides are computed
  // independently in the kernel (different code paths through the DP),
  // so the round-trip pins the two tail branches against each other.
  const lower = ctx.multisetIntersectionPExactLower(5, [20, 30], 100);
  const upperAtNext = ctx.multisetIntersectionPExact(6, [20, 30], 100);
  approx(lower + upperAtNext, 1, 1e-10);
});

test("lower-tail (k=3) interior matches 1 - upper-tail at xObs+1", () => {
  const lower = ctx.multisetIntersectionPExactLower(3, [20, 30, 40], 100);
  const upperAtNext = ctx.multisetIntersectionPExact(4, [20, 30, 40], 100);
  approx(lower + upperAtNext, 1, 1e-10);
});

test("lower-tail at xObs = 0 is the P(|∩| == 0) mass (strictly positive)", () => {
  // For valid inputs with non-zero set sizes, P(|∩| == 0) > 0 — the
  // intersection can always be empty given finite probability of disjoint
  // draws. Pins the at-boundary behaviour: the `xObs < 0` guard does not
  // fire, the `xObs >= minN` guard does not fire, the DP runs and returns
  // logP[0]'s exponential.
  const p = ctx.multisetIntersectionPExactLower(0, [20, 30], 100);
  assert(p > 0 && p < 1, "P(|∩| == 0) must be strictly in (0, 1)");
});

// ── Non-central distribution fixtures vs SciPy 1.17 ────────────────────────
//
// The non-central CDFs (`nctcdf`, `ncf_sf`, `ncchi2cdf`) are reached only
// through the power calculator + the SciPy benchmark — neither path pins
// the *numerical* output tightly enough to catch precision-shifting
// mutations on the A&S / Gauss-Legendre coefficients (the bulk of mutation
// survivors live in these branches).
//
// Each row below is a SciPy 1.17.1 reference value lifted from
// `benchmark/results-scipy.json`, hand-picked to stay in the regime where
// the JS implementation agrees with SciPy at FP precision (rel ≲ 1e-9).
// Tolerances are set just above the observed agreement: a real precision
// shift would move the output by ≥ 1e-4 and fail the assertion, while
// legitimate FP-level disagreement passes.
//
// Adding more rows is cheap — pick from `npm run benchmark:scipy`'s
// "pass"-classified output, drop anything in `deep-tail` / `underflow` /
// `pathological` buckets.

suite("stats.js — nctcdf vs SciPy 1.17 reference fixtures");

test("central regime (delta=0) — agreement at FP precision", () => {
  // delta=0 reduces nctcdf to central tcdf via Gauss-Legendre quadrature
  // of the chi-mixture; FP-level agreement (rel ≲ 1e-13).
  const FIX = [
    { t: -5, df: 30, delta: 0, scipy: 0.000011648342733503901 },
    { t: -1, df: 30, delta: 0, scipy: 0.162654307713015 },
    { t: 1, df: 100, delta: 0, scipy: 0.8401379221079384 },
    { t: -1, df: 100, delta: 0, scipy: 0.1598620778920617 },
  ];
  for (const { t, df, delta, scipy } of FIX) {
    approx(nctcdf(t, df, delta), scipy, 1e-12, `nctcdf(${t}, ${df}, ${delta})`);
  }
});

test("non-central regime (|delta| ≤ 5, df ≥ 5) — agreement to 1e-7 relative", () => {
  // Hand-picked from SciPy 1.17 fixtures in the regime where JS's Gauss-
  // Legendre quadrature stays accurate. A relative-tolerance check rather
  // than absolute so values near 0 or 1 are pinned as tightly as mid-range
  // outputs.
  const FIX = [
    { t: 1, df: 5, delta: 1, scipy: 0.4809261412421052 },
    { t: 1, df: 30, delta: 1, scipy: 0.49669879455361443 },
    { t: 5, df: 100, delta: 5, scipy: 0.49512918850821674 },
    { t: 10, df: 5, delta: 1, scipy: 0.9993313223580297 },
    { t: 10, df: 30, delta: 5, scipy: 0.9990895029688033 },
    { t: 10, df: 100, delta: 5, scipy: 0.9999793684618338 },
  ];
  for (const { t, df, delta, scipy } of FIX) {
    const got = nctcdf(t, df, delta);
    const rel = Math.abs(got - scipy) / Math.max(1e-300, Math.abs(scipy));
    assert(rel < 1e-7, `nctcdf(${t}, ${df}, ${delta}): got ${got}, scipy ${scipy} (rel ${rel})`);
  }
});

suite("stats.js — ncf_sf vs SciPy 1.17 reference fixtures");

test("ncf_sf at d1=1 / d2=30 / lambda ∈ {0, 1} — FP-precision agreement", () => {
  const FIX = [
    { f: 0.5, d1: 1, d2: 30, lambda: 0, scipy: 0.4849569686830381 },
    { f: 2, d1: 1, d2: 30, lambda: 0, scipy: 0.167594108019346 },
    { f: 10, d1: 1, d2: 30, lambda: 0, scipy: 0.0035685233088176825 },
    { f: 0.5, d1: 1, d2: 30, lambda: 1, scipy: 0.6620816209044876 },
    { f: 2, d1: 1, d2: 30, lambda: 1, scipy: 0.35512751989132135 },
    { f: 10, d1: 1, d2: 30, lambda: 1, scipy: 0.02378631056588776 },
  ];
  for (const { f, d1, d2, lambda, scipy } of FIX) {
    approx(ncf_sf(f, d1, d2, lambda), scipy, 1e-12, `ncf_sf(${f}, ${d1}, ${d2}, ${lambda})`);
  }
});

suite("stats.js — ncchi2cdf vs SciPy 1.17 reference fixtures");

test("ncchi2cdf at k=5 / lambda ∈ {0, 1} — FP-precision agreement", () => {
  const FIX = [
    { x: 0.1, k: 5, lambda: 0, scipy: 0.0001623166119226152 },
    { x: 1, k: 5, lambda: 0, scipy: 0.03743422675270362 },
    { x: 10, k: 5, lambda: 0, scipy: 0.9247647538534879 },
    { x: 0.1, k: 5, lambda: 1, scipy: 0.0000991529210363362 },
    { x: 1, k: 5, lambda: 1, scipy: 0.02431662113720006 },
    { x: 10, k: 5, lambda: 1, scipy: 0.8626668135599576 },
  ];
  for (const { x, k, lambda, scipy } of FIX) {
    approx(ncchi2cdf(x, k, lambda), scipy, 1e-12, `ncchi2cdf(${x}, ${k}, ${lambda})`);
  }
});

// ── Power functions — direct pins via R `pwr` package (mutation audit) ─────
//
// `tests/power.test.js` exercises these via the `TESTS` registry inside a
// vm.runInContext context — that hides them from Stryker's per-test
// coverage instrumentation. These direct tests give Stryker line-level
// trace through `powerTwoSample` / `powerPaired` / `powerOneSample` /
// `powerCorrelation` / `powerChi2` / `fFromGroupMeans`. Reference values
// from R's pwr package (transplanted from `tests/power.test.js`).

suite("powerTwoSample — R pwr::pwr.t.test reference");

test("d=0.5, n=64, α=0.05, 2-tail → 0.80 (R: pwr.t.test)", () => {
  approx(powerTwoSample(0.5, 64, 0.05, 2), 0.8, 0.005);
});

test("d=0.8, n=26, α=0.05, 2-tail → 0.8075", () => {
  approx(powerTwoSample(0.8, 26, 0.05, 2), 0.8075, 0.005);
});

test("d=1.2, n=12, α=0.05, 2-tail → 0.8021", () => {
  approx(powerTwoSample(1.2, 12, 0.05, 2), 0.8021, 0.005);
});

test("d=0.5, n=64, α=0.01 → 0.5853 (α effect)", () => {
  approx(powerTwoSample(0.5, 64, 0.01, 2), 0.5853, 0.005);
});

test("d=0.5, n=51, α=0.05, 1-tail → 0.8059 (1-tail bump)", () => {
  approx(powerTwoSample(0.5, 51, 0.05, 1), 0.8059, 0.005);
});

suite("powerPaired — R pwr::pwr.t.test (paired) reference");

test("d=0.5, n=34, α=0.05, 2-tail → 0.80 (R: pwr.t.test paired)", () => {
  approx(powerPaired(0.5, 34, 0.05, 2), 0.8, 0.01);
});

test("d=0.8, n=15, α=0.05, 2-tail → 0.81", () => {
  approx(powerPaired(0.8, 15, 0.05, 2), 0.8213, 0.005);
});

suite("powerOneSample — delegates to powerPaired");

test("equals powerPaired for same args (delegation contract)", () => {
  // The kernel implements one-sample as a direct delegate to paired
  // (same noncentrality structure under H1).
  approx(powerOneSample(0.5, 34, 0.05, 2), powerPaired(0.5, 34, 0.05, 2), 1e-15);
  approx(powerOneSample(0.8, 15, 0.05, 2), powerPaired(0.8, 15, 0.05, 2), 1e-15);
});

suite("powerCorrelation — R pwr::pwr.r.test reference");

test("r=0.3, n=85, α=0.05, 2-tail → 0.80", () => {
  // R: pwr.r.test(r=0.3, n=85, sig.level=0.05)$power ≈ 0.80
  approx(powerCorrelation(0.3, 85, 0.05, 2), 0.8, 0.02);
});

test("r=0.5, n=29, α=0.05, 2-tail → 0.80", () => {
  // R: pwr.r.test(r=0.5, n=29, sig.level=0.05)$power ≈ 0.80
  approx(powerCorrelation(0.5, 29, 0.05, 2), 0.8, 0.02);
});

test("r=0.1, n=783, α=0.05, 2-tail → 0.80 (small effect needs large n)", () => {
  // R: pwr.r.test(r=0.1, n=783, sig.level=0.05)$power ≈ 0.80
  approx(powerCorrelation(0.1, 783, 0.05, 2), 0.8, 0.02);
});

suite("powerChi2 — R pwr::pwr.chisq.test reference");

test("w=0.3, n=88, df=1, α=0.05 → 0.80", () => {
  approx(powerChi2(0.3, 88, 0.05, 1), 0.8, 0.02);
});

test("w=0.5, n=32, df=1, α=0.05 → 0.81", () => {
  approx(powerChi2(0.5, 32, 0.05, 1), 0.81, 0.02);
});

test("w=0.3, n=133, df=4, α=0.05 → 0.80", () => {
  approx(powerChi2(0.3, 133, 0.05, 4), 0.8, 0.02);
});

suite("fFromGroupMeans — Cohen's f from group means + within-SD (direct)");

test("3 means [10, 12, 14], sd=4 → f ≈ 0.4082", () => {
  approx(fFromGroupMeans([10, 12, 14], 4), 0.40825, 0.0001);
});

test("4 means [10, 11, 12, 13], sd=5 → f ≈ 0.2236", () => {
  approx(fFromGroupMeans([10, 11, 12, 13], 5), 0.22361, 0.0001);
});

test("all-equal means → f = 0 (no between-group variance)", () => {
  approx(fFromGroupMeans([5, 5, 5], 2), 0, 1e-10);
});

test("sd <= 0 → f = 0 (degenerate within-group)", () => {
  approx(fFromGroupMeans([10, 12, 14], 0), 0, 1e-10);
  approx(fFromGroupMeans([10, 12, 14], -1), 0, 1e-10);
});

test("empty means → f = 0", () => {
  approx(fFromGroupMeans([], 5), 0, 1e-10);
});

// ── Distribution PDFs + upper-tail helpers (mutation audit) ────────────────
//
// `tpdf`, `chi2pdf`, `betai_upper`, `gammainc_upper`, `ncchi2cdf_upper`
// had no direct test calls — they're invoked only by Newton-Raphson
// derivative paths or by complementary-tail helpers. Direct pins via
// R reference values and the relevant sum-to-1 identity.

suite("tpdf — R dt() reference");

test("dt(0, 10) = 0.38910 (peak of standard t with df=10)", () => {
  approx(tpdf(0, 10), 0.3891, 1e-5);
});

test("dt(1, 5) = 0.21967 (skewed-tail value)", () => {
  approx(tpdf(1, 5), 0.21967, 1e-5);
});

test("dt(0, 1) = 1 / π (Cauchy peak)", () => {
  // df = 1 → Cauchy distribution, peak height = 1/π
  approx(tpdf(0, 1), 1 / Math.PI, 1e-12);
});

suite("chi2pdf — closed-form pin");

test("chi2pdf(3, 4) = 3·exp(-1.5)/4 ≈ 0.16735 (df=4 closed form)", () => {
  // df=4: dchisq(x, 4) = x/4 · exp(-x/2). At x=3: 0.75 · 0.22313 ≈ 0.16735.
  approx(chi2pdf(3, 4), 0.75 * Math.exp(-1.5), 1e-12);
});

test("chi2pdf(10, 5) ≈ 0.02833 (R: dchisq(10, 5))", () => {
  // Pinned to current kernel output; cross-validated against R via the
  // benchmark suite for chi2cdf which uses the same gammaln + log-space
  // exponentiation. A precision-shifting mutation on the prefactor
  // exponent would push this by ≫ tol.
  approx(chi2pdf(10, 5), 0.028334555341734437, 1e-12);
});

test("dchisq(0, k) = 0 for k > 2 (boundary)", () => {
  eq(chi2pdf(0, 4), 0);
  eq(chi2pdf(0, 10), 0);
});

test("dchisq(x <= 0, k) saturates to 0", () => {
  eq(chi2pdf(-1, 5), 0);
  eq(chi2pdf(-100, 5), 0);
});

suite("betai_upper — complementary to betai (sum-to-1 identity)");

test("betai(a, b, x) + betai_upper(a, b, x) = 1 for interior x", () => {
  // Pins the complementary-tail axiom. Mutants that flip a sign or
  // swap branches in betai_upper break the sum.
  for (const [a, b, x] of [
    [2, 3, 0.4],
    [5, 5, 0.5],
    [10, 30, 0.2],
    [50, 50, 0.5],
  ]) {
    approx(betai(a, b, x) + betai_upper(a, b, x), 1, 1e-12, `a=${a}, b=${b}, x=${x}`);
  }
});

test("betai_upper saturation: x <= 0 → 1, x >= 1 → 0", () => {
  eq(betai_upper(5, 5, 0), 1);
  eq(betai_upper(5, 5, -0.5), 1);
  eq(betai_upper(5, 5, 1), 0);
  eq(betai_upper(5, 5, 1.5), 0);
});

test("betai_upper at deep upper tail: x close to 1 (tail-accurate path)", () => {
  // For x ≈ 1, betai(a, b, x) ≈ 1, so 1 - betai cancels to machine
  // precision; betai_upper takes the opposite continued-fraction branch
  // to stay accurate. Pinned to kernel output (≈ 1.22e-8 at (5, 5, 0.99));
  // sum-to-1 with betai is enforced by the previous test, so this pin
  // guards the upper-tail branch's prefactor + cf separately.
  approx(betai_upper(5, 5, 0.99), 1.2185368570000197e-8, 1e-12);
});

suite("gammainc_upper — complementary to gammainc (sum-to-1 identity)");

test("gammainc(a, x) + gammainc_upper(a, x) = 1 for interior", () => {
  // Pins the complementary-tail axiom.
  for (const [a, x] of [
    [2, 1],
    [5, 4],
    [10, 7],
    [20, 25],
  ]) {
    approx(gammainc(a, x) + gammainc_upper(a, x), 1, 1e-10, `a=${a}, x=${x}`);
  }
});

test("gammainc_upper at deep upper tail (large x relative to a)", () => {
  // Pinned to current kernel output at (a=5, x=20) — ~6.7σ above the
  // Erlang(5, 1) mean. Sum-to-1 with gammainc is enforced separately;
  // this pin guards the upper-tail Cephes continued-fraction branch.
  approx(gammainc_upper(5, 20), 1.6944743930067385e-5, 1e-12);
});

// ── tests.ts — error-message + boundary pins (mutation audit) ──────────────
//
// The R cross-validations above pin the happy path of every test/effect-size
// helper. These pin what they don't reach: the structured error objects (a
// mutant blanking the message to "" still passes a bare `error` truthiness
// check), the n-boundary guards (`< 2` vs `<= 2`), and a handful of interior
// arithmetic terms whose effect on F / H is too small to clear the
// cross-validation tolerances. Each assertion is exact or independently
// reconstructed — no tolerance is loosened to accommodate a survivor.

suite("tests.ts — error message + boundary pins");

test("sampleVariance([]) is NaN (n<2 guard, not a divide-through to -0)", () => {
  // With the `n < 2` guard deleted, n=0 falls through to `0 / (0-1)` = -0,
  // which is not NaN — so this pins the guard, not just "non-finite".
  assert(Number.isNaN(sampleVariance([])), "empty input → NaN");
  assert(Number.isNaN(sampleVariance([7])), "single value → NaN");
});

test("shapiroWilk n=3 takes the exact-distribution path (closed-form W and p)", () => {
  // For n=3 the AS R94 coefficients are exact: a = [-1/√2, 0, 1/√2], so
  // W = (a·x_sorted)² / Σ(x-x̄)². For [1,2,4]: num=(4-1)/√2, Σ(x-7/3)²=14/3,
  // W = (9/2)/(14/3) = 27/28. The n=3 p-value is the exact arcsine form.
  const r = shapiroWilk([1, 2, 4]);
  approx(r.W, 27 / 28, 1e-12);
  const pExact = (6 / Math.PI) * (Math.asin(Math.sqrt(27 / 28)) - Math.asin(Math.sqrt(3 / 4)));
  approx(r.p, pExact, 1e-9);
});

test("shapiroWilk accepts n = 5000 exactly (upper-bound guard is `> 5000`)", () => {
  const ramp = Array.from({ length: 5000 }, (_, i) => i * 0.7 + Math.sin(i));
  const r = shapiroWilk(ramp);
  assert(!r.error, `n=5000 must be accepted, got error: ${r.error}`);
  assert(Number.isFinite(r.W) && r.W > 0 && r.W <= 1, `W in (0,1]: ${r.W}`);
});

test("leveneTest error messages name each rejection cause", () => {
  assert(/≥2 groups required/.test(leveneTest([[1, 2, 3]]).error || ""), "k<2 message");
  assert(/Not enough observations/.test(leveneTest([[1], [2]]).error || ""), "Ntot≤k message");
  assert(
    /zero within-group dispersion/.test(
      leveneTest([
        [5, 5, 5],
        [5, 5, 5],
      ]).error || ""
    ),
    "constant-data message"
  );
});

test("tTest: n=2 per group computes, n<2 errors with the n≥2 message", () => {
  const ok = tTest([1, 2], [3, 5]);
  assert(!ok.error && Number.isFinite(ok.t), "n=2 each is the valid boundary");
  const bad = tTest([1], [3, 4, 5]);
  assert(/Each group needs n≥2/.test(bad.error || ""), `n<2 message: ${bad.error}`);
  const flat = tTest([5, 5, 5], [7, 7, 7]);
  assert(
    /zero variance in both groups/.test(flat.error || ""),
    `both-constant message: ${flat.error}`
  );
});

test("mannWhitneyU: empty group errors; U/U1/U2 satisfy U = min, U2 = n1n2 - U1", () => {
  assert(/Empty group/.test(mannWhitneyU([], [1, 2]).error || ""), "empty-group message");
  // n1=1 is the valid lower boundary — must compute, not error.
  assert(!mannWhitneyU([5], [1, 2, 3]).error, "n1=1 is accepted");
  const m = mannWhitneyU([1, 2, 3, 4], [3, 4, 5, 6]);
  eq(m.U1, 2);
  eq(m.U2, 14); // n1*n2 - U1 = 16 - 2
  eq(m.U, 2); // min(U1, U2)
});

test("mannWhitneyU: all-tied data is rejected, not reported as p=1", () => {
  // Every observation identical → tie-corrected σ² = 0, the test is
  // undefined. An unguarded run returns z=0, p=1 ("not significant") —
  // a false negative. Must surface an error instead (mirrors kruskalWallis).
  const r = mannWhitneyU([5, 5, 5], [5, 5]);
  assert(
    /essentially constant/.test(r.error || ""),
    `expected all-tied error, got ${JSON.stringify(r)}`
  );
  assert(Number.isNaN(r.p), "p must be NaN on all-tied input");
  // Partial ties (distinct values present) must still compute — the guard
  // must not false-positive on routine tied data.
  assert(!mannWhitneyU([1, 1, 2], [2, 3, 3]).error, "partial ties must still compute");
});

test("oneWayANOVA error messages + exact sums of squares", () => {
  assert(/≥2 groups required/.test(oneWayANOVA([[1, 2, 3]]).error || ""), "k<2 message");
  assert(/Not enough observations/.test(oneWayANOVA([[1], [2]]).error || ""), "Ntot≤k message");
  // groups 1-3 / 4-6 / 7-9: means 2,5,8; grandMean 5;
  // ssBetween = 3·(2-5)² + 3·0 + 3·(8-5)² = 54; ssWithin = 3·(2) = 6.
  const a = oneWayANOVA([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
  eq(a.grandMean, 5);
  approx(a.ssBetween, 54, 1e-12); // mutating `m - grandMean` → `m + grandMean` gives 954
  approx(a.ssWithin, 6, 1e-12);
  approx(a.F, 27, 1e-12);
});

test("welchANOVA error messages + F pinned on a clearly-separated dataset", () => {
  assert(/≥2 groups required/.test(welchANOVA([[1, 2]]).error || ""), "k<2 message");
  assert(/Each group needs n≥2/.test(welchANOVA([[1], [2, 3]]).error || ""), "n<2 message");
  assert(
    /zero variance in at least one group/.test(
      welchANOVA([
        [5, 5, 5],
        [7, 8, 9],
      ]).error || ""
    ),
    "constant-group message"
  );
  // Regression pin (current kernel) — guards the weighted between-group
  // term `w[i]·(means[i]-m)²` and the `k-1` numerator divisor.
  const w = welchANOVA([
    [10, 12, 11],
    [20, 22, 19],
    [30, 28, 31],
  ]);
  eq(w.df1, 2);
  approx(w.F, 139.3652392947104, 1e-9);
});

test("kruskalWallis error messages + H pinned on tied data", () => {
  assert(/≥2 groups required/.test(kruskalWallis([[1, 2, 3]]).error || ""), "k<2 message");
  assert(/Not enough observations/.test(kruskalWallis([[1], [2]]).error || ""), "N≤k message");
  assert(
    /essentially constant/.test(
      kruskalWallis([
        [5, 5, 5],
        [5, 5, 5],
      ]).error || ""
    ),
    "all-tied message"
  );
  // Tied data exercises the (N³-N) tie-correction denominator; regression
  // pin against the current kernel.
  const k = kruskalWallis([
    [1, 1, 2],
    [2, 3, 3],
    [4, 4, 5],
  ]);
  eq(k.df, 2);
  approx(k.H, 7.057471264367809, 1e-9);
});

test("effect sizes return NaN on inputs below their domain", () => {
  assert(Number.isNaN(cohenD([1], [3, 4, 5])), "cohenD needs n≥2 per group");
  assert(Number.isFinite(cohenD([1, 2], [3, 4, 5])), "cohenD n=2 is the valid boundary");
  assert(Number.isNaN(hedgesG([1], [3, 4, 5])), "hedgesG inherits the n≥2 guard");
  assert(Number.isNaN(rankBiserial(5, 0, 3)), "rankBiserial NaN when n1·n2 = 0");
  const ci = cohenDCI(0.5, 1, 5);
  assert(Number.isNaN(ci.lo) && Number.isNaN(ci.hi), "cohenDCI {NaN,NaN} when n1<2");
});

test("etaSquared returns NaN (not 0) when its ANOVA errors", () => {
  // With the `if (a.error) return NaN` guard deleted, a zero-variance ANOVA
  // yields ssBetween = ssWithin = 0 and etaSquared falls through to 0.
  assert(
    Number.isNaN(
      etaSquared([
        [5, 5],
        [5, 5],
      ])
    ),
    "constant data → NaN, not 0"
  );
  assert(
    Number.isNaN(
      epsilonSquared([
        [5, 5, 5],
        [5, 5, 5],
      ])
    ),
    "epsilonSquared → NaN"
  );
});

// ── cluster.ts — kmeans + tree path pins (mutation audit) ──────────────────
//
// The kmeans suites above run well-separated blobs that converge in a
// single refinement step, so the multi-iteration loop, the empty-cluster
// reseed (L308-325), and the dendrogram leaf walk stay under-exercised.
// These drive data that actually reaches those paths.

suite("cluster.ts — kmeans + tree path pins");

test("kmeans multi-iteration run — clusters / iterations / inertia pinned", () => {
  // A 1-D ramp at k=3 takes three refinement iterations to settle (seed 5,
  // restarts 1). A mutant that cuts the loop short — `changed` never set
  // true, or the `!changed` break inverted — returns the 1-iteration
  // partition with a different label vector and a higher inertia.
  const line = [[0], [1], [2], [3], [4], [5], [6], [7], [8]];
  const res = kmeans(line, 3, { seed: 5, restarts: 1, maxIter: 100 });
  eq(res.iterations, 3);
  eq(JSON.stringify(res.clusters), JSON.stringify([2, 2, 1, 1, 1, 0, 0, 0, 0]));
  approx(res.inertia, 7.5, 1e-12);
  // `order` sorts rows within each cluster by distance to their centroid —
  // pins the L243 members.sort comparator.
  eq(JSON.stringify(res.order), JSON.stringify([6, 7, 5, 8, 3, 2, 4, 0, 1]));
});

test("kmeans result is a Lloyd fixed point — every row sits at its nearest centroid", () => {
  // Seed-independent invariant of a converged partition. A short-circuited
  // refinement leaves rows attached to a stale pre-update centroid.
  const line = [[0], [1], [2], [3], [4], [5], [6], [7], [8]];
  const res = kmeans(line, 3, { seed: 5, restarts: 1, maxIter: 100 });
  const sq = (a, b) => {
    let s = 0;
    for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
    return s;
  };
  for (let i = 0; i < line.length; i++) {
    let nearest = 0;
    let nd = sq(line[i], res.centroids[0]);
    for (let c = 1; c < res.centroids.length; c++) {
      const dc = sq(line[i], res.centroids[c]);
      if (dc < nd) {
        nd = dc;
        nearest = c;
      }
    }
    eq(res.clusters[i], nearest, `row ${i} must sit in its nearest centroid`);
  }
});

test("kmeans empty-cluster path — k > distinct points keeps centroids finite", () => {
  // Only two distinct points but k=4: kmeans++ collides centroids, clusters
  // go empty, and the L309-325 empty-cluster block runs. It must keep every
  // centroid coordinate finite — a skipped reseed leaves the centroid
  // update's `counts[c][j] > 0 ? … : NaN` to emit NaN coords, and a row
  // pointed at a NaN centroid pushes inertia to Infinity.
  const dup = [
    [0, 0],
    [0, 0],
    [0, 0],
    [100, 100],
    [100, 100],
    [100, 100],
  ];
  const res = kmeans(dup, 4, { seed: 1, restarts: 1 });
  for (const cent of res.centroids) {
    for (const v of cent) assert(Number.isFinite(v), `centroid coord finite, got ${v}`);
  }
  eq(JSON.stringify(res.clusters), JSON.stringify([3, 0, 0, 1, 1, 1]));
  approx(res.inertia, 0, 1e-12);
});

test("hclust walk emits a complete leaf ordering", () => {
  // `order` must be a permutation of every original row index; a mutant
  // collapsing the leaf test in `walk` pushes only the root (-1) or
  // recurses past leaves and pushes nothing.
  const D = pairwiseDistance(
    [
      [0, 0],
      [1, 0],
      [10, 0],
      [11, 0],
    ],
    "euclidean"
  );
  const { order } = hclust(D, "complete");
  eq(JSON.stringify([...order].sort((a, b) => a - b)), JSON.stringify([0, 1, 2, 3]));
});

test("dendrogramLayout — 3 segments per internal node, all coords finite", () => {
  // 4 leaves → 3 internal nodes → 9 segments. Finite coords prove the leaf
  // numbering walk ran (a mutant skipping it leaves `_leafPos` undefined).
  const D = pairwiseDistance(
    [
      [0, 0],
      [1, 0],
      [10, 0],
      [11, 0],
    ],
    "euclidean"
  );
  const { tree } = hclust(D, "complete");
  const layout = dendrogramLayout(tree);
  eq(layout.segments.length, 9);
  for (const seg of layout.segments) {
    assert(
      Number.isFinite(seg.x1) &&
        Number.isFinite(seg.y1) &&
        Number.isFinite(seg.x2) &&
        Number.isFinite(seg.y2),
      "segment coords finite"
    );
  }
  approx(layout.maxHeight, 11, 1e-9);
});

test("kmeans default options — omitted seed/restarts/maxIter run deterministically", () => {
  // No opts → seed=1, restarts=8, maxIter=100. Pins the
  // `options.X != null ? options.X : default` ternaries: a mutant forcing
  // the `options.X` branch reads `undefined` and the RNG collapses.
  const line = [[0], [1], [2], [3], [4], [5], [6], [7], [8]];
  const res = kmeans(line, 3);
  eq(JSON.stringify(res.clusters), JSON.stringify([0, 0, 0, 2, 2, 2, 1, 1, 1]));
  approx(res.inertia, 6, 1e-12);
});

test("kmeans honours a small maxIter — non-converging input stops at the cap", () => {
  // The duplicate-point input never converges (the reseed keeps flipping
  // labels); maxIter:5 must cap iterations at 5, not the default 100.
  const dup = [
    [0, 0],
    [0, 0],
    [0, 0],
    [100, 100],
    [100, 100],
    [100, 100],
  ];
  const res = kmeans(dup, 4, { seed: 1, restarts: 1, maxIter: 5 });
  eq(res.iterations, 5);
});

test("kmeans seed 0 — the seed≤0 normalization path produces a valid clustering", () => {
  // kmeansRng maps a non-positive seed into (0, 2³¹−1) via `if (s <= 0)
  // s += …`. seed 0 exercises that branch; a mutant skipping it leaves the
  // Park-Miller LCG stuck at 0 so every draw collapses to the same index.
  const line = [[0], [1], [2], [3], [4], [5], [6], [7], [8]];
  const res = kmeans(line, 3, { seed: 0, restarts: 1, maxIter: 100 });
  eq(JSON.stringify(res.clusters), JSON.stringify([1, 1, 1, 2, 2, 2, 0, 0, 0]));
  approx(res.inertia, 6, 1e-12);
});

test("kmeans centroid mean skips NaN cells, not whole rows", () => {
  // Cluster 0 holds [0,0], [0,10], [0,NaN]: the centroid's column 1 must
  // average only the two finite cells → 5, rather than letting the NaN
  // poison the whole coordinate.
  const m = [
    [0, 0],
    [0, 10],
    [0, NaN],
    [100, 100],
    [100, 100],
    [100, 100],
  ];
  const res = kmeans(m, 2, { seed: 1, restarts: 1 });
  eq(JSON.stringify(res.clusters), JSON.stringify([0, 0, 0, 1, 1, 1]));
  approx(res.centroids[0][1], 5, 1e-12);
  for (const cent of res.centroids) {
    for (const v of cent) assert(Number.isFinite(v), `centroid coord finite, got ${v}`);
  }
});

// ── posthoc.ts — post-hoc path pins (mutation audit) ───────────────────────
//
// The R cross-validations above pin each post-hoc's happy path. These pin
// the branches they skip: the structured k<2 error objects (a "" mutant on
// the message still passes a bare `error` check), the k=2 lower boundary,
// ANOVA-error propagation, the option ternaries, the Dunn tie-correction
// term, the compact-letter-display split logic, and selectTest's k routing
// + zero-variance-group handling.

suite("posthoc.ts — post-hoc path pins");

test("post-hoc functions reject k<2 with the ≥2-groups message and an empty pairs list", () => {
  for (const [name, r] of [
    ["tukeyHSD", tukeyHSD([[1, 2, 3]])],
    ["gamesHowell", gamesHowell([[1, 2, 3]])],
    ["dunnTest", dunnTest([[1, 2, 3]])],
  ]) {
    assert(/≥2 groups required/.test(r.error || ""), `${name} k<2 message`);
    eq(r.pairs.length, 0, `${name} k<2 returns no pairs`);
  }
  assert(/≥2 groups required/.test(selectTest([[1, 2, 3]]).error || ""), "selectTest k<2");
});

test("post-hoc functions accept k=2 — the ≥2 boundary computes a finite pair", () => {
  const t = tukeyHSD([
    [1, 2, 3],
    [4, 5, 6],
  ]);
  const g = gamesHowell([
    [1, 2, 3],
    [4, 5, 6],
  ]);
  // ptukey / ptukey_upper must accept k=2 (a `k <= 2` guard mutant returns NaN)
  assert(!t.error && Number.isFinite(t.pairs[0].p), "tukeyHSD k=2 → finite p");
  assert(!g.error && Number.isFinite(g.pairs[0].p), "gamesHowell k=2 → finite p");
  assert(
    !dunnTest([
      [1, 2, 3],
      [4, 5, 6],
    ]).error,
    "dunnTest k=2 computes"
  );
  assert(
    !selectTest([
      [1, 2, 3],
      [4, 5, 6],
    ]).error,
    "selectTest k=2 computes"
  );
});

test("tukeyHSD propagates the ANOVA error on zero-variance data", () => {
  const r = tukeyHSD([
    [5, 5, 5],
    [5, 5, 5],
  ]);
  assert(/zero within-group dispersion/.test(r.error || ""), `error: ${r.error}`);
  eq(r.pairs.length, 0);
});

test("tukeyHSD alpha option widens the CI as alpha tightens", () => {
  const g = [
    [1, 2, 3, 4],
    [3, 4, 5, 6],
    [8, 9, 10, 11],
  ];
  // a tighter alpha → larger qCrit → wider interval → lower lwr bound
  assert(
    tukeyHSD(g, { alpha: 0.01 }).pairs[0].lwr < tukeyHSD(g, { alpha: 0.05 }).pairs[0].lwr,
    "0.01 CI must be wider than 0.05"
  );
});

test("gamesHowell flags a zero-variance group with the named error", () => {
  const r = gamesHowell([
    [5, 5, 5],
    [1, 2, 3],
  ]);
  assert(/zero variance/.test(r.error || ""), `error: ${r.error}`);
  eq(r.pairs.length, 0);
});

test("dunnTest tie correction — sigma2 carries the tie term (tied data)", () => {
  // Tied values make tieCorrection ≠ 0, so the `- tieCorrection/(12(N-1))`
  // term in sigma2 is live; regression pin against the current kernel.
  const r = dunnTest([
    [1, 1, 2],
    [2, 3, 3],
    [4, 4, 5],
  ]);
  approx(r.pairs[0].z, -1.2129568697262454, 1e-9);
  approx(r.pairs[0].p, 0.2251464364896625, 1e-9);
});

test("compactLetterDisplay — overlapping vs all-significant pair structures", () => {
  // 0 vs 2 significant, 0~1 and 1~2 not → groups a / ab / b. Pins the
  // `L.has(i) && L.has(j)` split test: an || mutant mis-splits the overlap.
  eq(
    JSON.stringify(
      compactLetterDisplay(
        [
          { i: 0, j: 1, p: 0.5 },
          { i: 0, j: 2, p: 0.001 },
          { i: 1, j: 2, p: 0.5 },
        ],
        3
      )
    ),
    JSON.stringify(["a", "ab", "b"])
  );
  // every pair significant → three distinct letters
  eq(
    JSON.stringify(
      compactLetterDisplay(
        [
          { i: 0, j: 1, p: 0.001 },
          { i: 0, j: 2, p: 0.001 },
          { i: 1, j: 2, p: 0.001 },
        ],
        3
      )
    ),
    JSON.stringify(["a", "b", "c"])
  );
});

test("selectTest — k routing: welchT for k=2, welchANOVA + Games-Howell for k≥3", () => {
  const s2 = selectTest([
    [1, 2, 3, 4],
    [3, 4, 5, 6],
  ]);
  const s3 = selectTest([
    [1, 2, 3, 4],
    [3, 4, 5, 6],
    [7, 8, 9, 10],
  ]);
  eq(s2.recommendation.test, "welchT");
  eq(s3.recommendation.test, "welchANOVA");
  assert(/Welch's t-test/.test(s2.recommendation.reason), "k=2 reason names Welch's t-test");
  assert(/Welch's ANOVA/.test(s3.recommendation.reason), "k≥3 reason names Welch's ANOVA");
});

test("selectTest — a zero-variance group is recorded normal:null with an SW note", () => {
  // shapiroWilk errors on zero variance; selectTest must record that as
  // normal:null (unknown) with the error carried in `note`, not crash or
  // mis-classify it as non-normal.
  const r = selectTest([
    [5, 5, 5, 5],
    [1, 2, 3, 4, 5],
  ]);
  eq(r.normality[0].normal, null);
  assert(r.normality[0].note != null, "zero-variance group carries an SW note");
});

test("selectTest — alphaVariance option moves the Levene equal-variance verdict", () => {
  const g = [
    [1, 2, 3, 4, 5],
    [1, 3, 5, 7, 20],
  ];
  eq(selectTest(g).levene.equalVar, true);
  eq(selectTest(g, { alphaVariance: 0.99 }).levene.equalVar, false);
});

test("selectTest — Shapiro-Wilk narrative names the all-normal vs flagged branch", () => {
  const normal = selectTest([
    [2, 4, 5, 4, 5, 7, 8, 9, 10, 12],
    [1, 3, 4, 3, 4, 6, 7, 8, 9, 11],
  ]);
  assert(
    /did not reject normality in any group/.test(normal.recommendation.reason),
    "all-normal narrative"
  );
  const flagged = selectTest([
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 50],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  ]);
  assert(
    /Shapiro-Wilk flagged 1 of 2 group/.test(flagged.recommendation.reason),
    `flagged narrative: ${flagged.recommendation.reason}`
  );
  // a group with n<3 → Shapiro-Wilk cannot run → the third narrative branch
  const smallN = selectTest([
    [1, 2],
    [3, 4, 5, 6],
  ]);
  assert(
    /Shapiro-Wilk could not run on every group/.test(smallN.recommendation.reason),
    `small-n narrative: ${smallN.recommendation.reason}`
  );
});

// ── dist.ts — uncovered-path pins (mutation audit) ─────────────────────────
//
// dist.ts's R / SciPy cross-validations pin the happy path of every
// distribution. These reach the branches they skip: the domain guards,
// the gammaln Euler reflection, the |x|≥7 tail switchover, the one-tailed
// power branches, the large-λ normal-approximation short-circuits in
// ncf_sf / ncchi2cdf, and fFromGroupMeans' centring on the grand mean.

suite("dist.ts — uncovered-path pins");

test("gammaln reflection — x < 0.5 routes through the Euler reflection formula", () => {
  // gammaln(x<0.5) = ln(π/sin(πx)) − gammaln(1−x). Γ(0.25) ≈ 3.6256099,
  // Γ(0.1) ≈ 9.5135077.
  approx(gammaln(0.25), Math.log(3.625609908221908), 1e-10);
  approx(gammaln(0.1), Math.log(9.513507698668732), 1e-10);
});

test("norminv / tinv reject out-of-range p with ±Infinity", () => {
  eq(norminv(0), -Infinity);
  eq(norminv(1), Infinity);
  eq(norminv(-1), -Infinity);
  eq(tinv(0, 5), -Infinity);
  eq(tinv(1, 5), Infinity);
  eq(tinv(-0.1, 5), -Infinity);
});

test("normcdf |x| ≥ 7 uses the tail-accurate normsf switchover", () => {
  // At x=7 the A&S polynomial has lost its digits; normcdf delegates to
  // 1 − normsf. A `1 + normsf` mutant would push the result above 1.
  approx(normcdf(7), 0.9999999999987201, 1e-15);
  approx(normcdf(-7), 1.2798125429085443e-12, 1e-20);
  assert(normcdf(7) < 1, "normcdf(7) stays strictly below 1");
});

test("power functions honour the one-tailed branch (tails=1 ≠ tails=2)", () => {
  approx(powerTwoSample(0.5, 30, 0.05, 1), 0.6060253082451761, 1e-9);
  approx(powerPaired(0.5, 30, 0.05, 1), 0.8482541787793818, 1e-9);
  approx(powerCorrelation(0.3, 80, 0.05, 1), 0.8579534422541399, 1e-9);
  // a one-tailed test has more power than two-tailed at the same α
  assert(
    powerTwoSample(0.5, 30, 0.05, 1) > powerTwoSample(0.5, 30, 0.05, 2),
    "one-tailed power exceeds two-tailed"
  );
});

test("powerAnova — df2 = k(n−1) noncentral-F power", () => {
  // Regression pin: a `k(n+1)` df2 mutant or a broken fCrit bracket shifts this.
  approx(powerAnova(0.4, 20, 0.05, 3), 0.7757304738540571, 1e-9);
});

test("fFromGroupMeans centres on the grand mean (means far from 0)", () => {
  // Cohen's f = population SD of the group means ÷ within-SD. Means
  // [100,110,120], sd 5 → √(200/3)/5. A `m + grandMean` mutant explodes it.
  approx(fFromGroupMeans([100, 110, 120], 5), Math.sqrt(200 / 3) / 5, 1e-12);
});

test("ncf_sf large-λ normal-approximation short-circuit", () => {
  // halfLam = 1000 > 500 with d2 = 100: f far below the NCF mean → 1, far
  // above → 0; a mid-range f falls through to the Poisson mixture sum.
  eq(ncf_sf(0.001, 3, 100, 2000), 1);
  eq(ncf_sf(1e7, 3, 100, 2000), 0);
  approx(ncf_sf(200, 3, 100, 2000), 0.9999999999997912, 1e-9);
});

test("ncchi2cdf large-λ normal-approximation short-circuit", () => {
  // halfLam = 1000 > 500: x far below the mean k+λ → 0, far above → 1, a
  // mid-range x falls through to the Poisson mixture sum.
  eq(ncchi2cdf(1, 3, 2000), 0);
  eq(ncchi2cdf(1e6, 3, 2000), 1);
  approx(ncchi2cdf(2003, 3, 2000), 0.50445780319877, 1e-9);
});

summary();

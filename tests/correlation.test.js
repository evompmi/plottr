// Correlation tests cross-validated against R's `cor.test` on R 4.5.
// All reference values were produced by running cor.test on the same
// inputs — see the R snippets in the comments above each case.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  pearsonCorrelation,
  spearmanCorrelation,
  kendallTau,
  selectCorrelation,
  norminv,
} = require("./helpers/stats-loader");

// ── Pearson ────────────────────────────────────────────────────────────────

suite("pearsonCorrelation");

test("perfect positive linear data → r=1, t=Inf, p=0, CI [1, 1]", () => {
  const x = [1, 2, 3, 4, 5];
  const y = [2, 4, 6, 8, 10];
  const r = pearsonCorrelation(x, y);
  approx(r.r, 1, 1e-12);
  approx(r.p, 0, 1e-12);
  eq(r.n, 5);
  eq(r.df, 3);
  approx(r.ci.lo, 1, 1e-12);
  approx(r.ci.hi, 1, 1e-12);
});

test("perfect negative linear data → r=-1", () => {
  const x = [1, 2, 3, 4, 5];
  const y = [5, 4, 3, 2, 1];
  const r = pearsonCorrelation(x, y);
  approx(r.r, -1, 1e-12);
  approx(r.p, 0, 1e-12);
});

// R reference (R 4.5):
//   x <- 1:10
//   y <- c(2,4,5,4,5,7,8,9,10,12)
//   cor.test(x, y, method = "pearson")
//   → r = 0.9719076166, t = 11.67971924, df = 8, p = 2.634e-06,
//     CI [0.882028755, 0.993545238]
test("matches R's cor.test (Pearson) on a small noisy ramp", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const r = pearsonCorrelation(x, y);
  approx(r.r, 0.9719076166, 1e-6);
  approx(r.t, 11.67971924, 1e-4);
  eq(r.df, 8);
  approx(r.p, 2.634e-6, 1e-8);
  approx(r.ci.lo, 0.882028755, 1e-5);
  approx(r.ci.hi, 0.993545238, 1e-5);
});

// R reference: iris Sepal.Length vs Sepal.Width
//   cor.test(iris$Sepal.Length, iris$Sepal.Width, method = "pearson")
//   → r = -0.1175697841, t = -1.440287089, df = 148, p = 0.1518982607,
//     CI [-0.2726932479, 0.04351158358]
test("matches R's cor.test (Pearson) on iris Sepal.Length vs Sepal.Width", () => {
  // prettier-ignore
  const x = [5.1,4.9,4.7,4.6,5.0,5.4,4.6,5.0,4.4,4.9,5.4,4.8,4.8,4.3,5.8,5.7,5.4,5.1,5.7,5.1,5.4,5.1,4.6,5.1,4.8,5.0,5.0,5.2,5.2,4.7,4.8,5.4,5.2,5.5,4.9,5.0,5.5,4.9,4.4,5.1,5.0,4.5,4.4,5.0,5.1,4.8,5.1,4.6,5.3,5.0,7.0,6.4,6.9,5.5,6.5,5.7,6.3,4.9,6.6,5.2,5.0,5.9,6.0,6.1,5.6,6.7,5.6,5.8,6.2,5.6,5.9,6.1,6.3,6.1,6.4,6.6,6.8,6.7,6.0,5.7,5.5,5.5,5.8,6.0,5.4,6.0,6.7,6.3,5.6,5.5,5.5,6.1,5.8,5.0,5.6,5.7,5.7,6.2,5.1,5.7,6.3,5.8,7.1,6.3,6.5,7.6,4.9,7.3,6.7,7.2,6.5,6.4,6.8,5.7,5.8,6.4,6.5,7.7,7.7,6.0,6.9,5.6,7.7,6.3,6.7,7.2,6.2,6.1,6.4,7.2,7.4,7.9,6.4,6.3,6.1,7.7,6.3,6.4,6.0,6.9,6.7,6.9,5.8,6.8,6.7,6.7,6.3,6.5,6.2,5.9];
  // prettier-ignore
  const y = [3.5,3.0,3.2,3.1,3.6,3.9,3.4,3.4,2.9,3.1,3.7,3.4,3.0,3.0,4.0,4.4,3.9,3.5,3.8,3.8,3.4,3.7,3.6,3.3,3.4,3.0,3.4,3.5,3.4,3.2,3.1,3.4,4.1,4.2,3.1,3.2,3.5,3.6,3.0,3.4,3.5,2.3,3.2,3.5,3.8,3.0,3.8,3.2,3.7,3.3,3.2,3.2,3.1,2.3,2.8,2.8,3.3,2.4,2.9,2.7,2.0,3.0,2.2,2.9,2.9,3.1,3.0,2.7,2.2,2.5,3.2,2.8,2.5,2.8,2.9,3.0,2.8,3.0,2.9,2.6,2.4,2.4,2.7,2.7,3.0,3.4,3.1,2.3,3.0,2.5,2.6,3.0,2.6,2.3,2.7,3.0,2.9,2.9,2.5,2.8,3.3,2.7,3.0,2.9,3.0,3.0,2.5,2.9,2.5,3.6,3.2,2.7,3.0,2.5,2.8,3.2,3.0,3.8,2.6,2.2,3.2,2.8,2.8,2.7,3.3,3.2,2.8,3.0,2.8,3.0,2.8,3.8,2.8,2.8,2.6,3.0,3.4,3.1,3.0,3.1,3.1,3.1,2.7,3.2,3.3,3.0,2.5,3.0,3.4,3.0];
  const r = pearsonCorrelation(x, y);
  eq(r.n, 150);
  approx(r.r, -0.1175697841, 1e-6);
  approx(r.t, -1.440287089, 1e-5);
  eq(r.df, 148);
  approx(r.p, 0.1518982607, 1e-5);
  approx(r.ci.lo, -0.2726932479, 1e-5);
  approx(r.ci.hi, 0.04351158358, 1e-5);
});

test("complete-pairs filtering drops NaN / non-finite rows", () => {
  const x = [1, 2, NaN, 4, 5];
  const y = [2, 4, 6, NaN, 10];
  const r = pearsonCorrelation(x, y);
  eq(r.n, 3); // only (1,2), (2,4), (5,10) survive
  approx(r.r, 1, 1e-12);
});

test("rejects n < 3 with a structured error", () => {
  const r = pearsonCorrelation([1, 2], [3, 4]);
  assert(r.error != null, "should error with n < 3");
  eq(r.n, 2);
});

test("rejects zero-variance axis", () => {
  const r = pearsonCorrelation([1, 1, 1, 1], [1, 2, 3, 4]);
  assert(r.error != null, "constant x should error");
});

test("confidence level parameter changes CI width", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const r95 = pearsonCorrelation(x, y);
  const r99 = pearsonCorrelation(x, y, { conf: 0.99 });
  assert(r99.ci.lo < r95.ci.lo, "99% CI lower bound is below 95%");
  assert(r99.ci.hi > r95.ci.hi, "99% CI upper bound is above 95%");
});

// ── Spearman ───────────────────────────────────────────────────────────────

suite("spearmanCorrelation");

test("matches R's cor.test (Spearman, exact=FALSE) on the noisy ramp", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const r = spearmanCorrelation(x, y);
  // R reference: rho = 0.969530219, p = 3.634851476e-06
  approx(r.rho, 0.969530219, 1e-6);
  approx(r.p, 3.634851476e-6, 1e-8);
  eq(r.n, 10);
});

test("matches R's cor.test (Spearman, exact=FALSE) on iris", () => {
  // prettier-ignore
  const x = [5.1,4.9,4.7,4.6,5.0,5.4,4.6,5.0,4.4,4.9,5.4,4.8,4.8,4.3,5.8,5.7,5.4,5.1,5.7,5.1,5.4,5.1,4.6,5.1,4.8,5.0,5.0,5.2,5.2,4.7,4.8,5.4,5.2,5.5,4.9,5.0,5.5,4.9,4.4,5.1,5.0,4.5,4.4,5.0,5.1,4.8,5.1,4.6,5.3,5.0,7.0,6.4,6.9,5.5,6.5,5.7,6.3,4.9,6.6,5.2,5.0,5.9,6.0,6.1,5.6,6.7,5.6,5.8,6.2,5.6,5.9,6.1,6.3,6.1,6.4,6.6,6.8,6.7,6.0,5.7,5.5,5.5,5.8,6.0,5.4,6.0,6.7,6.3,5.6,5.5,5.5,6.1,5.8,5.0,5.6,5.7,5.7,6.2,5.1,5.7,6.3,5.8,7.1,6.3,6.5,7.6,4.9,7.3,6.7,7.2,6.5,6.4,6.8,5.7,5.8,6.4,6.5,7.7,7.7,6.0,6.9,5.6,7.7,6.3,6.7,7.2,6.2,6.1,6.4,7.2,7.4,7.9,6.4,6.3,6.1,7.7,6.3,6.4,6.0,6.9,6.7,6.9,5.8,6.8,6.7,6.7,6.3,6.5,6.2,5.9];
  // prettier-ignore
  const y = [3.5,3.0,3.2,3.1,3.6,3.9,3.4,3.4,2.9,3.1,3.7,3.4,3.0,3.0,4.0,4.4,3.9,3.5,3.8,3.8,3.4,3.7,3.6,3.3,3.4,3.0,3.4,3.5,3.4,3.2,3.1,3.4,4.1,4.2,3.1,3.2,3.5,3.6,3.0,3.4,3.5,2.3,3.2,3.5,3.8,3.0,3.8,3.2,3.7,3.3,3.2,3.2,3.1,2.3,2.8,2.8,3.3,2.4,2.9,2.7,2.0,3.0,2.2,2.9,2.9,3.1,3.0,2.7,2.2,2.5,3.2,2.8,2.5,2.8,2.9,3.0,2.8,3.0,2.9,2.6,2.4,2.4,2.7,2.7,3.0,3.4,3.1,2.3,3.0,2.5,2.6,3.0,2.6,2.3,2.7,3.0,2.9,2.9,2.5,2.8,3.3,2.7,3.0,2.9,3.0,3.0,2.5,2.9,2.5,3.6,3.2,2.7,3.0,2.5,2.8,3.2,3.0,3.8,2.6,2.2,3.2,2.8,2.8,2.7,3.3,3.2,2.8,3.0,2.8,3.0,2.8,3.8,2.8,2.8,2.6,3.0,3.4,3.1,3.0,3.1,3.1,3.1,2.7,3.2,3.3,3.0,2.5,3.0,3.4,3.0];
  const r = spearmanCorrelation(x, y);
  // R reference: rho = -0.1667776583, p = 0.04136799425
  approx(r.rho, -0.1667776583, 1e-6);
  approx(r.p, 0.04136799425, 1e-5);
  eq(r.n, 150);
});

test("Spearman is invariant under monotone transformations of either axis", () => {
  const x = [1, 2, 3, 4, 5, 6, 7];
  const y = [10, 12, 14, 16, 18, 20, 22];
  // y' = exp(y / 10) — monotone, but Pearson would change
  const yt = y.map((v) => Math.exp(v / 10));
  const a = spearmanCorrelation(x, y);
  const b = spearmanCorrelation(x, yt);
  approx(a.rho, b.rho, 1e-12);
});

test("Spearman with ties — matches R reference", () => {
  // R reference: tied data c(1,1,2,2,3,3,4,4) vs c(1,2,1,2,3,4,3,4)
  // → rho = 0.8, p = 0.01712 (cor.test, exact = FALSE)
  const x = [1, 1, 2, 2, 3, 3, 4, 4];
  const y = [1, 2, 1, 2, 3, 4, 3, 4];
  const r = spearmanCorrelation(x, y);
  approx(r.rho, 0.8, 1e-6);
  approx(r.p, 0.01712, 1e-4);
});

// ── Kendall ────────────────────────────────────────────────────────────────

suite("kendallTau");

test("matches R's cor.test (Kendall, exact=FALSE) on the noisy ramp", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const k = kendallTau(x, y);
  // R reference: tau = 0.9320589306, z = 3.696845502, p = 0.0002182951
  approx(k.tau, 0.9320589306, 1e-6);
  approx(k.z, 3.696845502, 1e-5);
  approx(k.p, 0.0002182951, 1e-7);
  eq(k.n, 10);
});

test("Kendall τ-b with ties on both axes matches R", () => {
  // R reference: tau-b = 0.6666666667, z = 2.102629932, p = 0.03549813132
  const x = [1, 1, 2, 2, 3, 3, 4, 4];
  const y = [1, 2, 1, 2, 3, 4, 3, 4];
  const k = kendallTau(x, y);
  approx(k.tau, 0.6666666667, 1e-6);
  approx(k.z, 2.102629932, 1e-5);
  approx(k.p, 0.03549813132, 1e-5);
});

test("matches R's cor.test (Kendall) on iris", () => {
  // prettier-ignore
  const x = [5.1,4.9,4.7,4.6,5.0,5.4,4.6,5.0,4.4,4.9,5.4,4.8,4.8,4.3,5.8,5.7,5.4,5.1,5.7,5.1,5.4,5.1,4.6,5.1,4.8,5.0,5.0,5.2,5.2,4.7,4.8,5.4,5.2,5.5,4.9,5.0,5.5,4.9,4.4,5.1,5.0,4.5,4.4,5.0,5.1,4.8,5.1,4.6,5.3,5.0,7.0,6.4,6.9,5.5,6.5,5.7,6.3,4.9,6.6,5.2,5.0,5.9,6.0,6.1,5.6,6.7,5.6,5.8,6.2,5.6,5.9,6.1,6.3,6.1,6.4,6.6,6.8,6.7,6.0,5.7,5.5,5.5,5.8,6.0,5.4,6.0,6.7,6.3,5.6,5.5,5.5,6.1,5.8,5.0,5.6,5.7,5.7,6.2,5.1,5.7,6.3,5.8,7.1,6.3,6.5,7.6,4.9,7.3,6.7,7.2,6.5,6.4,6.8,5.7,5.8,6.4,6.5,7.7,7.7,6.0,6.9,5.6,7.7,6.3,6.7,7.2,6.2,6.1,6.4,7.2,7.4,7.9,6.4,6.3,6.1,7.7,6.3,6.4,6.0,6.9,6.7,6.9,5.8,6.8,6.7,6.7,6.3,6.5,6.2,5.9];
  // prettier-ignore
  const y = [3.5,3.0,3.2,3.1,3.6,3.9,3.4,3.4,2.9,3.1,3.7,3.4,3.0,3.0,4.0,4.4,3.9,3.5,3.8,3.8,3.4,3.7,3.6,3.3,3.4,3.0,3.4,3.5,3.4,3.2,3.1,3.4,4.1,4.2,3.1,3.2,3.5,3.6,3.0,3.4,3.5,2.3,3.2,3.5,3.8,3.0,3.8,3.2,3.7,3.3,3.2,3.2,3.1,2.3,2.8,2.8,3.3,2.4,2.9,2.7,2.0,3.0,2.2,2.9,2.9,3.1,3.0,2.7,2.2,2.5,3.2,2.8,2.5,2.8,2.9,3.0,2.8,3.0,2.9,2.6,2.4,2.4,2.7,2.7,3.0,3.4,3.1,2.3,3.0,2.5,2.6,3.0,2.6,2.3,2.7,3.0,2.9,2.9,2.5,2.8,3.3,2.7,3.0,2.9,3.0,3.0,2.5,2.9,2.5,3.6,3.2,2.7,3.0,2.5,2.8,3.2,3.0,3.8,2.6,2.2,3.2,2.8,2.8,2.7,3.3,3.2,2.8,3.0,2.8,3.0,2.8,3.8,2.8,2.8,2.6,3.0,3.4,3.1,3.0,3.1,3.1,3.1,2.7,3.2,3.3,3.0,2.5,3.0,3.4,3.0];
  const k = kendallTau(x, y);
  // R reference: tau = -0.07699678812, z = -1.331814917, p = 0.1829210151
  approx(k.tau, -0.07699678812, 1e-6);
  approx(k.z, -1.331814917, 1e-4);
  approx(k.p, 0.1829210151, 1e-5);
});

test("Kendall τ is invariant under monotone transformations of either axis", () => {
  const x = [1, 2, 3, 4, 5, 6, 7];
  const y = [3, 1, 4, 1, 5, 9, 2];
  const yt = y.map((v) => Math.exp(v));
  const a = kendallTau(x, y);
  const b = kendallTau(x, yt);
  approx(a.tau, b.tau, 1e-12);
});

// ── selectCorrelation ──────────────────────────────────────────────────────

suite("selectCorrelation");

test("recommends Pearson by default and suggests Spearman on non-normal data", () => {
  // Mostly normal x; y has one extreme outlier that pushes SW past α=0.05.
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
  const out = selectCorrelation(x, y);
  eq(out.recommendation.test, "pearson");
  assert(out.suggestion != null, "should surface a Spearman suggestion");
  eq(out.suggestion.test, "spearman");
});

test("normality entries carry the axis tag", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const out = selectCorrelation(x, y);
  eq(out.normality.length, 2);
  eq(out.normality[0].axis, "x");
  eq(out.normality[1].axis, "y");
});

test("n < 3 short-circuits with no suggestion and a flat recommendation", () => {
  const out = selectCorrelation([1, 2], [3, 4]);
  eq(out.recommendation.test, "pearson");
  eq(out.suggestion, undefined);
});

// ── kendallTau — exact S-statistic + sign pins (mutation audit) ────────────
//
// The existing Kendall tests pin tau / z / p against R `cor.test` at 1e-5
// tolerances. A single arithmetic mutation in the O(n²) concordance loop
// often shifts the result by less than that tolerance on a 10-point
// dataset, so ~160 kendallTau mutants survived. The fix: pin the `S`
// statistic — an exact integer (sum of ±1 over all pairs) — so any
// loop-bound, sign, or arithmetic mutation moves S off its integer value.
// Inputs deliberately include negatives + non-monotonic order so that
// `xs[j] - xi` → `xs[j] + xi` sign mutations actually flip pair outcomes.

suite("kendallTau — exact S-statistic pins");

test("perfectly concordant: S = n(n-1)/2, tau = 1", () => {
  const k = kendallTau([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
  eq(k.S, 10); // all 10 pairs concordant
  approx(k.tau, 1, 1e-12);
  assert(k.z > 0, "concordant data → positive z");
});

test("perfectly discordant: S = -n(n-1)/2, tau = -1", () => {
  const k = kendallTau([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]);
  eq(k.S, -10);
  approx(k.tau, -1, 1e-12);
  assert(k.z < 0, "discordant data → negative z");
});

test("negative-valued, non-monotonic input pins S exactly (kills dx/dy sign mutations)", () => {
  // x = [-2, 3, -1], y = [5, -4, 1]:
  //   (0,1): dx=+5, dy=-9 → -1
  //   (0,2): dx=+1, dy=-4 → -1
  //   (1,2): dx=-4, dy=+5 → -1
  //   S = -3. A `xs[j] - xi` → `xs[j] + xi` mutation flips pairs (0,2)
  //   and (1,2) to concordant, shifting S to +1 — caught by the eq pin.
  const k = kendallTau([-2, 3, -1], [5, -4, 1]);
  eq(k.S, -3);
});

test("mixed concordant/discordant: S = 4 for [1,2,3,4] vs [1,3,2,4]", () => {
  // pairs: (0,1)+1 (0,2)+1 (0,3)+1 (1,2)-1 (1,3)+1 (2,3)+1 → S = 4
  const k = kendallTau([1, 2, 3, 4], [1, 3, 2, 4]);
  eq(k.S, 4);
});

test("n = 3 exactly: computes, does not error (kills 'n < 3' boundary mutation)", () => {
  const k = kendallTau([1, 2, 3], [1, 2, 3]);
  assert(!k.error, "n=3 must compute");
  eq(k.S, 3);
});

test("n = 2: errors with the ≥3-pairs message", () => {
  const k = kendallTau([1, 2], [1, 2]);
  assert(k.error != null, "n<3 must error");
  assert(Number.isNaN(k.tau), "errored result has NaN tau");
});

test("a tie in x skips the pair (dx === 0 → continue)", () => {
  // x = [1, 1, 2], y = [1, 2, 3]: pair (0,1) has dx=0 → skipped.
  //   remaining: (0,2)+1 (1,2)+1 → S = 2.
  const k = kendallTau([1, 1, 2], [1, 2, 3]);
  eq(k.S, 2);
});

// ── spearmanCorrelation — monotone-extreme pins (mutation audit) ───────────

suite("spearmanCorrelation — monotone-extreme pins");

test("perfectly increasing ranks: rho = 1, t = +Infinity, p = 0", () => {
  const r = spearmanCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  approx(r.rho, 1, 1e-12);
  eq(r.t, Infinity);
  eq(r.p, 0);
});

test("perfectly decreasing ranks: rho = -1, t = -Infinity, p = 0", () => {
  const r = spearmanCorrelation([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]);
  approx(r.rho, -1, 1e-12);
  eq(r.t, -Infinity);
  eq(r.p, 0);
});

test("n < 3 → error, NaN rho", () => {
  const r = spearmanCorrelation([1, 2], [3, 4]);
  assert(r.error != null, "n<3 must error");
  assert(Number.isNaN(r.rho));
});

test("n = 3: CI stays NaN (the n >= 4 guard does not fire)", () => {
  // Fisher-z CI for Spearman needs n >= 4; at n=3 ci.lo/ci.hi stay NaN.
  const r = spearmanCorrelation([1, 2, 3], [1, 2, 3]);
  assert(Number.isNaN(r.ci.lo) && Number.isNaN(r.ci.hi), "n=3 → CI undefined");
});

// ── correlation — error-path + clamp + CI pins (mutation audit) ────────────
//
// The R cross-validation cases above pin the happy path. These pin the
// branches the cross-validations don't reach: the structured error objects
// (a survivor mutating the message string to "" still satisfies a bare
// `error != null` check), the r/ρ clamps, the perfect-correlation t = ±∞
// shortcut, and the Spearman Fisher-z CI (reconstructed independently from
// the Bonett-Wright variance formula so an arithmetic mutation diverges).

suite("pearsonCorrelation — error-path + clamp pins");

test("n<3 error carries the ≥3-pairs message and a NaN-shaped CI", () => {
  const r = pearsonCorrelation([1, 2], [3, 4]);
  assert(/≥3 complete pairs/.test(r.error || ""), `error text: ${r.error}`);
  assert(Number.isNaN(r.ci.lo) && Number.isNaN(r.ci.hi), "CI is {NaN,NaN} on the n<3 path");
  assert(Number.isNaN(r.r) && Number.isNaN(r.t) && Number.isNaN(r.p), "stats are NaN");
});

test("zero-variance axis error names the constant-data cause", () => {
  const r = pearsonCorrelation([1, 1, 1, 1], [1, 2, 3, 4]);
  assert(/zero variance/.test(r.error || ""), `error text: ${r.error}`);
  assert(Number.isNaN(r.r), "r is NaN on the zero-variance path");
  assert(Number.isNaN(r.ci.lo) && Number.isNaN(r.ci.hi), "CI is {NaN,NaN}");
});

test("perfect positive data clamps r to exactly 1 and t to +Infinity", () => {
  // y = 2x exactly → r computes to 1; oneMinusR2 collapses to 0 so t takes
  // the ±Infinity shortcut rather than dividing by zero.
  const r = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  eq(r.r, 1);
  eq(r.t, Infinity);
  eq(r.p, 0);
});

test("perfect negative data clamps r to exactly -1 and t to -Infinity", () => {
  const r = pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
  eq(r.r, -1);
  eq(r.t, -Infinity);
  eq(r.p, 0);
});

suite("spearmanCorrelation — error-path + CI pins");

test("n<3 error carries the ≥3-pairs message and a NaN-shaped CI", () => {
  const r = spearmanCorrelation([1, 2], [3, 4]);
  assert(/≥3 complete pairs/.test(r.error || ""), `error text: ${r.error}`);
  assert(Number.isNaN(r.ci.lo) && Number.isNaN(r.ci.hi), "CI is {NaN,NaN} on the n<3 path");
});

test("constant axis propagates the Pearson-on-ranks zero-variance error", () => {
  // Every rank of a constant axis is identical → Pearson on the rank
  // vectors errors, and spearmanCorrelation surfaces that error string.
  const r = spearmanCorrelation([1, 1, 1, 1], [1, 2, 3, 4]);
  assert(/zero variance/.test(r.error || ""), `error text: ${r.error}`);
  assert(Number.isNaN(r.rho), "rho is NaN when the rank correlation errors");
});

test("95% CI matches an independent Bonett-Wright Fisher-z reconstruction", () => {
  // Spearman's CI uses se = sqrt((1 + rho^2/2)/(n-3)) — the Bonett-Wright
  // variance — then back-transforms through tanh. Rebuilding it here from
  // Math primitives + the literal z_0.975 means any arithmetic mutation in
  // the kernel's se / tanh expressions diverges from this expectation.
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const r = spearmanCorrelation(x, y);
  const n = 10;
  const z = Math.atanh(r.rho);
  const se = Math.sqrt((1 + (r.rho * r.rho) / 2) / (n - 3));
  const zcrit = norminv(0.975); // kernel's own normal quantile, as the source uses
  approx(r.ci.lo, Math.tanh(z - zcrit * se), 1e-12);
  approx(r.ci.hi, Math.tanh(z + zcrit * se), 1e-12);
  // Sanity: a genuine interval that brackets rho.
  assert(r.ci.lo < r.rho && r.rho < r.ci.hi, "CI brackets rho");
});

test("n = 4 exactly: the Fisher-z CI fires (n >= 4 boundary)", () => {
  const r = spearmanCorrelation([1, 2, 3, 4], [1, 2, 4, 3]);
  assert(Number.isFinite(r.ci.lo) && Number.isFinite(r.ci.hi), "n=4 → CI is computed");
});

test("conf option widens the CI (opts.conf is honoured, not ignored)", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const r95 = spearmanCorrelation(x, y);
  const r99 = spearmanCorrelation(x, y, { conf: 0.99 });
  assert(r99.ci.lo < r95.ci.lo, "99% CI lower bound below 95%");
  assert(r99.ci.hi > r95.ci.hi, "99% CI upper bound above 95%");
});

suite("kendallTau — error-path pins");

test("n=2 error carries the ≥3-pairs message", () => {
  const k = kendallTau([1, 2], [1, 2]);
  assert(/≥3 complete pairs/.test(k.error || ""), `error text: ${k.error}`);
});

test("all ties on x → the all-constant error, NaN tau/z/p, S still reported", () => {
  // n0 - n1 collapses to 0 when every x value is identical.
  const k = kendallTau([5, 5, 5, 5], [1, 2, 3, 4]);
  assert(/all ties in x or y/.test(k.error || ""), `error text: ${k.error}`);
  assert(Number.isNaN(k.tau) && Number.isNaN(k.z) && Number.isNaN(k.p), "stats are NaN");
  eq(k.n, 4);
});

test("all ties on y → the all-constant error", () => {
  const k = kendallTau([1, 2, 3, 4], [7, 7, 7, 7]);
  assert(/all ties in x or y/.test(k.error || ""), `error text: ${k.error}`);
  assert(Number.isNaN(k.tau), "tau is NaN");
});

// ── selectCorrelation — structure + narrative pins (mutation audit) ────────
//
// selectCorrelation is a diagnostic/recommendation builder: its output is a
// structured object plus a plain-English `reason`. The cross-validations
// above only touch `recommendation.test` and `suggestion`, so the survivors
// cluster in the normality array, the allNormal flag, the α threshold, and
// the narrative strings. These pin each.

suite("selectCorrelation — structure + narrative pins");

test("n<3 short-circuits to an empty normality array and allNormal=false", () => {
  const out = selectCorrelation([1, 2], [3, 4]);
  eq(out.n, 2);
  eq(out.normality.length, 0); // L716: returns `normality: []`
  eq(out.allNormal, false); // L717: returns `allNormal: false`
  assert(
    /Need ≥3 complete pairs/.test(out.recommendation.reason),
    `reason: ${out.recommendation.reason}`
  );
  eq(out.suggestion, undefined);
});

test("n = 3 exactly does NOT short-circuit — normality is tested on both axes", () => {
  const out = selectCorrelation([1, 2, 3], [3, 1, 2]);
  eq(out.normality.length, 2); // proves the n<3 guard is `<`, not `<=`
});

test("both axes normal → allNormal=true, no suggestion, normality flags set", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const out = selectCorrelation(x, y);
  eq(out.allNormal, true);
  eq(out.suggestion, undefined);
  eq(out.normality[0].normal, true);
  eq(out.normality[1].normal, true);
  // each axis entry carries the Shapiro-Wilk W and p it was classified on
  assert(out.normality[0].W > 0 && out.normality[0].p > 0.05, "x: W>0, p above α");
  assert(
    /did not reject normality on x or y at α = 0.05/.test(out.recommendation.reason),
    `reason: ${out.recommendation.reason}`
  );
});

test("an outlier-flagged axis → allNormal=false + a structured Spearman suggestion", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
  const out = selectCorrelation(x, y);
  eq(out.allNormal, false);
  eq(out.normality[1].normal, false);
  assert(out.suggestion != null, "suggestion present");
  eq(out.suggestion.test, "spearman");
  assert(
    /ranks both axes/.test(out.suggestion.reason),
    `suggestion.reason: ${out.suggestion.reason}`
  );
  // narrative names the flagged axis and the follow-up advice
  assert(/flagged y/.test(out.recommendation.reason), "reason names flagged axis y");
  assert(/non-normal at α = 0.05/.test(out.recommendation.reason), "reason states the α threshold");
  assert(
    /consider switching to Spearman/.test(out.recommendation.reason),
    "reason carries the Spearman follow-up"
  );
});

test("alphaNormality is honoured — a strict α flips a borderline axis to flagged", () => {
  // The noisy ramp's y axis sits at Shapiro-Wilk p ≈ 0.83: normal at the
  // 0.05 default, flagged once α is raised past it.
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 10, 12];
  const lenient = selectCorrelation(x, y);
  const strict = selectCorrelation(x, y, { alphaNormality: 0.9 });
  eq(lenient.allNormal, true);
  eq(strict.allNormal, false);
  assert(strict.suggestion != null, "strict α surfaces the Spearman suggestion");
  assert(/α = 0.9/.test(strict.recommendation.reason), "reason echoes the custom α");
});

test("a constant axis → normal:null with a diagnostic note, not a flag", () => {
  // Shapiro-Wilk errors on zero variance; selectCorrelation records that as
  // normal:null (unknown) rather than false (rejected).
  const out = selectCorrelation([3, 3, 3, 3, 3], [1, 2, 3, 4, 5]);
  eq(out.normality[0].normal, null);
  assert(out.normality[0].note != null, "constant axis carries a note");
  eq(out.allNormal, false);
});

summary();

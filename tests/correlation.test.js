// Correlation tests cross-validated against R's `cor.test` on R 4.5.
// All reference values were produced by running cor.test on the same
// inputs — see the R snippets in the comments above each case.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  pearsonCorrelation,
  spearmanCorrelation,
  kendallTau,
  selectCorrelation,
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

summary();

// `computePowerFromData` lives in `tools/_shell/power-from-data.ts` and
// surfaces the "n for 80% power" rows on the stats panel. The effect-size
// denominator follows the chosen test's variance assumption, the way R's
// `effectsize::cohens_d` does:
//
//   - Student's t / Mann-Whitney → pooled SD                ("Cohen's d")
//   - Welch's t                   → unpooled √((s₁²+s₂²)/2)  ("Cohen's d (unpooled SD)")
//
// and the Welch CI is the noncentral-t pivot on Welch's t with
// Welch–Satterthwaite df (`cohens_d(pooled_sd = FALSE)`). With equal n the
// two denominators coincide, so the fixture below is unbalanced.

const { suite, test, assert, approx, summary } = require("./harness");
const { computePowerFromData } = require("./helpers/boxplot-loader");

const X = [3.5, 4.5, 5.0, 5.5, 6.5];
const Y = [4.7, 13.6, 21.5, 26.4, 33.8, 40.1, 12.2];

suite("computePowerFromData — Welch uses the unpooled SD, Student/MWU the pooled SD");

test("welchT branch reports 'Cohen's d (unpooled SD)' as the effect-size label", () => {
  const r = computePowerFromData("welchT", [X, Y]);
  assert(r != null, "expected a result for welchT");
  assert(r.effectLabel === "Cohen's d (unpooled SD)", `label: ${r.effectLabel}`);
});

test("studentT branch reports 'Cohen's d' (pooled) as the effect-size label", () => {
  const r = computePowerFromData("studentT", [X, Y]);
  assert(r != null, "expected a result for studentT");
  assert(r.effectLabel === "Cohen's d", `label: ${r.effectLabel}`);
});

test("studentT d and CI match effectsize::cohens_d(x, y)", () => {
  // R> cohens_d(X, Y)  →  -1.71300356275889398  [-3.04921609819507555, -0.31745276757196428]
  const r = computePowerFromData("studentT", [X, Y]);
  approx(r.effect, -1.713003562758894, 1e-12);
  approx(r.effectCI.lo, -3.0492160981950756, 1e-5);
  approx(r.effectCI.hi, -0.31745276757196428, 1e-5);
});

test("welchT d and CI match effectsize::cohens_d(x, y, pooled_sd = FALSE)", () => {
  // R> cohens_d(X, Y, pooled_sd = FALSE)
  //    →  -1.87405499555983512  [-3.30425997643223734, -0.37168690910318986]
  const r = computePowerFromData("welchT", [X, Y]);
  approx(r.effect, -1.874054995559835, 1e-12);
  approx(r.effectCI.lo, -3.3042599764322373, 1e-5);
  approx(r.effectCI.hi, -0.37168690910318986, 1e-5);
});

test("equal SDs: both denominators give the same signed d", () => {
  const a = [4, 5, 6]; // mean 5, sd 1
  const b = [9, 10, 11]; // mean 10, sd 1
  const welch = computePowerFromData("welchT", [a, b]);
  const student = computePowerFromData("studentT", [a, b]);
  assert(welch && student);
  approx(welch.effect, -5, 1e-9);
  approx(student.effect, -5, 1e-9);
});

test("mannWhitney branch still reports pooled 'Cohen's d'", () => {
  // MWU is non-parametric and doesn't strictly have a Cohen's d, but
  // Plöttr reports the parametric analog as an approximation
  // (flagged via `approximate: true` for downstream display). The
  // denominator stays pooled — modifying that wasn't part of the
  // 2026-05-13 methodology pass.
  const r = computePowerFromData("mannWhitney", [X, Y]);
  assert(r != null, "expected a result for mannWhitney");
  assert(r.effectLabel === "Cohen's d", `label: ${r.effectLabel}`);
  assert(r.approximate === true, "MWU result should flag approximate=true");
});

summary();

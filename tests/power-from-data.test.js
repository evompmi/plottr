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
const {
  computePowerFromData,
  smallestNReaching,
  powerAnova,
  powerTwoSample,
} = require("./helpers/boxplot-loader");

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

suite("smallestNReaching — binary search returns the linear scan's n");

// The n-for-80%-power rows used to scan n = 2 … 5000 one by one. The binary
// search must return exactly the n that scan found, including null when
// even n = 5000 falls short.
const linearScan = (power, target) => {
  for (let n = 2; n <= 5000; n++) if (power(n) >= target) return n;
  return null;
};

// Small effects (n in the thousands, or past the 5000 cap → null) make the
// linear reference slow, so the grid keeps one near-cap and one null case.
test("two-sample t: every d × α on a grid", () => {
  for (const [d, alphas] of [
    [0.04, [0.05]], // n > 5000 → null
    [0.06, [0.05]], // n ≈ 4 400, just under the cap
    [0.2, [0.05, 0.001]],
    [0.5, [0.05, 0.01, 0.001]],
    [0.8, [0.05, 0.01, 0.001]],
    [2, [0.05, 0.01, 0.001]],
    [8, [0.05, 0.001]],
  ]) {
    for (const alpha of alphas) {
      const power = (n) => powerTwoSample(d, n, alpha, 2);
      const want = linearScan(power, 0.8);
      const got = smallestNReaching(power, 0.8);
      assert(got === want, `d=${d} α=${alpha}: binary ${got} vs linear ${want}`);
    }
  }
});

test("ANOVA: every f × k × α on a grid", () => {
  for (const f of [0.1, 0.25, 0.4, 0.8, 1.5, 4]) {
    for (const k of [3, 6]) {
      for (const alpha of [0.05, 0.001]) {
        const power = (n) => powerAnova(f, n, alpha, k);
        const want = linearScan(power, 0.8);
        const got = smallestNReaching(power, 0.8);
        assert(got === want, `f=${f} k=${k} α=${alpha}: binary ${got} vs linear ${want}`);
      }
    }
  }
});

test("null when n = 5000 is not enough; lo when n = 2 already is", () => {
  assert(smallestNReaching(() => 0.5, 0.8) === null, "never reaching target → null");
  assert(smallestNReaching(() => 0.9, 0.8) === 2, "always reaching target → 2");
  assert(smallestNReaching((n) => (n >= 4321 ? 1 : 0), 0.8) === 4321, "step at 4321");
  assert(smallestNReaching((n) => (n >= 5000 ? 1 : 0), 0.8) === 5000, "step at the cap");
});

test("Welch fixture keeps its n-for-80%-power rows", () => {
  const r = computePowerFromData("welchT", [X, Y]);
  const d = Math.abs(r.effect);
  for (const row of r.rows) {
    const want = linearScan((n) => powerTwoSample(d, n, row.alpha, 2), 0.8);
    assert(row.nForTarget === want, `α=${row.alpha}: ${row.nForTarget} vs ${want}`);
  }
});

summary();

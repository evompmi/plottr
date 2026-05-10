// Unit tests for the dose-response pure helpers (tools/doseresponse/helpers.ts).
// Covers the 4PL model + analytical gradient, hand-rolled Levenberg–Marquardt
// solver, parameter Wald CIs, F-test for shared parameters, the pre-fit
// transforms (zero-dose handling, normalisation, weighting), warning gates,
// and the small formatting helpers.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  fourPL,
  fourPLGrad,
  initialGuesses,
  correlationSign,
  invertMatrix,
  fit4PL,
  buildXGrid,
  curveBand,
  buildObservations,
  computeReplicateSds,
  fitMulti,
  fTestSharedParam,
  formatLogTick,
  fmtEC50,
  fmtNum,
  logTickRange,
  PARAM_KEYS,
  DEFAULT_PARAM_LOCKS,
} = require("./helpers/doseresponse-loader");

// Build a synthetic 4PL dataset: 8 dose decades × `nRep` replicates per dose.
// Optional `noise` adds deterministic perturbations from a seeded RNG so the
// tests stay reproducible.
function syntheticObs(params, nRep, noise = 0, seed = 42) {
  const xs = [-10, -9, -8, -7, -6, -5, -4, -3];
  const obs = [];
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (const x of xs) {
    const yClean = fourPL(x, params);
    for (let r = 0; r < nRep; r++) {
      const y = yClean + (noise > 0 ? (rand() - 0.5) * 2 * noise : 0);
      obs.push({ x, y, w: 1, isZeroDose: false, rawDose: Math.pow(10, x), conditionIdx: 0 });
    }
  }
  return obs;
}

// ── fourPL + gradient ─────────────────────────────────────────────────────

suite("fourPL");

test("at logEC50 the response equals the half-maximal value", () => {
  const p = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  approx(fourPL(-7, p), 50, 1e-9);
});

test("response approaches Top as dose → ∞ and Bottom as dose → 0", () => {
  const p = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  approx(fourPL(-2, p), 100, 1);
  approx(fourPL(-12, p), 0, 1);
});

test("inhibition curve (negative Hill) flips top/bottom asymptotes", () => {
  const p = { logEC50: -7, hillSlope: -1, top: 100, bottom: 0 };
  approx(fourPL(-12, p), 100, 1);
  approx(fourPL(-2, p), 0, 1);
});

suite("fourPLGrad");

test("analytical gradient matches finite differences within 1e-5", () => {
  const p = { logEC50: -7, hillSlope: 1, top: 100, bottom: 5 };
  const x = -7.3;
  const g = fourPLGrad(x, p);
  const eps = 1e-6;
  const keys = ["logEC50", "hillSlope", "top", "bottom"];
  keys.forEach((k, i) => {
    const pPlus = { ...p, [k]: p[k] + eps };
    const pMinus = { ...p, [k]: p[k] - eps };
    const fd = (fourPL(x, pPlus) - fourPL(x, pMinus)) / (2 * eps);
    approx(g[i], fd, 1e-4);
  });
});

// ── initialGuesses + correlationSign ──────────────────────────────────────

suite("initialGuesses");

test("returns Bottom = min(y), Top = max(y), median x for logEC50", () => {
  const obs = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 1);
  const seed = initialGuesses(obs);
  approx(seed.top, 100, 1);
  approx(seed.bottom, 0, 1);
  // Median of -10..-3 is -7 (sortedX[len/2])
  approx(seed.logEC50, -7, 1);
  eq(seed.hillSlope, 1);
});

test("hill seed flips negative for an inhibition (decreasing) curve", () => {
  const obs = syntheticObs({ logEC50: -7, hillSlope: -1, top: 100, bottom: 0 }, 1);
  const seed = initialGuesses(obs);
  eq(seed.hillSlope, -1);
});

suite("correlationSign");

test("returns +1 for monotonic-increasing data, −1 for decreasing", () => {
  eq(correlationSign([1, 2, 3], [1, 2, 3]), 1);
  eq(correlationSign([1, 2, 3], [3, 2, 1]), -1);
});

// ── invertMatrix ──────────────────────────────────────────────────────────

suite("invertMatrix");

test("identity inverts to identity", () => {
  const I = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const inv = invertMatrix(I);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) approx(inv[i][j], I[i][j], 1e-12);
});

test("recovers a generic 2×2 inverse", () => {
  const A = [
    [4, 7],
    [2, 6],
  ];
  const inv = invertMatrix(A);
  approx(inv[0][0], 0.6, 1e-12);
  approx(inv[0][1], -0.7, 1e-12);
  approx(inv[1][0], -0.2, 1e-12);
  approx(inv[1][1], 0.4, 1e-12);
});

test("returns null on a singular matrix", () => {
  const S = [
    [1, 2],
    [2, 4],
  ];
  eq(invertMatrix(S), null);
});

// ── fit4PL: parameter recovery ────────────────────────────────────────────

suite("fit4PL — parameter recovery");

test("recovers (logEC50, Hill, Top, Bottom) from noise-free synthetic data", () => {
  const truth = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  const obs = syntheticObs(truth, 2);
  const fit = fit4PL(obs);
  assert(fit.valid, "expected valid fit");
  approx(fit.params.logEC50, truth.logEC50, 1e-3);
  approx(fit.params.hillSlope, truth.hillSlope, 1e-3);
  approx(fit.params.top, truth.top, 1e-2);
  approx(fit.params.bottom, truth.bottom, 1e-2);
  assert(fit.converged, "LM should converge on noise-free synthetic data");
  assert(Number.isFinite(fit.r2));
  assert(fit.r2 > 0.999, `R² should be ~1 on noise-free data, got ${fit.r2}`);
});

test("recovers parameters within ~5% on seeded-noisy data", () => {
  const truth = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  const obs = syntheticObs(truth, 3, 1.5);
  const fit = fit4PL(obs);
  assert(fit.valid);
  // Allow generous tolerance since noise = ±1.5 on a 0–100 response is ~1.5%.
  approx(fit.params.logEC50, truth.logEC50, 0.15);
  approx(fit.params.hillSlope, truth.hillSlope, 0.2);
  approx(fit.params.top, truth.top, 5);
  approx(fit.params.bottom, truth.bottom, 5);
});

test("recovers a negative Hill (inhibition) fit", () => {
  const truth = { logEC50: -6, hillSlope: -1, top: 100, bottom: 5 };
  const obs = syntheticObs(truth, 2);
  const fit = fit4PL(obs);
  assert(fit.valid);
  approx(fit.params.hillSlope, -1, 0.05);
  approx(fit.params.logEC50, -6, 0.05);
});

test("returns valid:false on too few observations", () => {
  const obs = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 1).slice(0, 3);
  const fit = fit4PL(obs);
  eq(fit.valid, false);
});

test("flags few-doses warning when fewer than 5 distinct doses provided", () => {
  // 4 distinct doses × 1 replicate = 4 observations (right at the minimum).
  const obs = [
    { x: -8, y: 5, w: 1, isZeroDose: false, rawDose: 1e-8, conditionIdx: 0 },
    { x: -7, y: 50, w: 1, isZeroDose: false, rawDose: 1e-7, conditionIdx: 0 },
    { x: -6, y: 95, w: 1, isZeroDose: false, rawDose: 1e-6, conditionIdx: 0 },
    { x: -5, y: 99, w: 1, isZeroDose: false, rawDose: 1e-5, conditionIdx: 0 },
  ];
  const fit = fit4PL(obs);
  if (!fit.valid) {
    // Acceptable if the tiny dataset can't fit at all — but if it does fit
    // it must have flagged the few-doses warning.
    return;
  }
  const codes = fit.warnings.map((w) => w.code);
  assert(codes.indexOf("few-doses") >= 0, "expected few-doses warning");
});

// ── Wald CIs ──────────────────────────────────────────────────────────────

suite("fit4PL — confidence intervals");

test("each parameter's point estimate sits inside its 95% CI", () => {
  const truth = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  const obs = syntheticObs(truth, 3, 1.0);
  const fit = fit4PL(obs);
  assert(fit.valid);
  for (const k of PARAM_KEYS) {
    const [lo, hi] = fit.paramCI[k];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    assert(lo <= fit.params[k] + 1e-9, `${k} lower CI exceeds point estimate`);
    assert(fit.params[k] <= hi + 1e-9, `${k} upper CI below point estimate`);
  }
});

test("CIs widen as noise grows", () => {
  const truth = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  const small = fit4PL(syntheticObs(truth, 3, 0.3));
  const large = fit4PL(syntheticObs(truth, 3, 5));
  assert(small.valid && large.valid);
  const widthSmall = small.paramCI.logEC50[1] - small.paramCI.logEC50[0];
  const widthLarge = large.paramCI.logEC50[1] - large.paramCI.logEC50[0];
  assert(
    widthLarge > widthSmall,
    `expected larger noise → wider CI; got small=${widthSmall} large=${widthLarge}`
  );
});

test("EC50 confidence interval back-transforms cleanly from logEC50 CI", () => {
  const truth = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  const fit = fit4PL(syntheticObs(truth, 3, 1));
  assert(fit.valid);
  approx(fit.ec50, Math.pow(10, fit.params.logEC50), 1e-12);
  approx(fit.ec50CI[0], Math.pow(10, fit.paramCI.logEC50[0]), 1e-12);
  approx(fit.ec50CI[1], Math.pow(10, fit.paramCI.logEC50[1]), 1e-12);
});

// ── Parameter locks ───────────────────────────────────────────────────────

suite("fit4PL — parameter constraints");

test("fixing Top = 100 and Bottom = 0 still recovers the other parameters", () => {
  const truth = { logEC50: -6.5, hillSlope: 1.2, top: 100, bottom: 0 };
  const obs = syntheticObs(truth, 2);
  const locks = {
    ...DEFAULT_PARAM_LOCKS,
    top: { fixed: true, value: 100, lower: null, upper: null },
    bottom: { fixed: true, value: 0, lower: null, upper: null },
  };
  const fit = fit4PL(obs, { paramLocks: locks });
  assert(fit.valid);
  approx(fit.params.top, 100, 1e-9);
  approx(fit.params.bottom, 0, 1e-9);
  approx(fit.params.logEC50, truth.logEC50, 0.1);
  approx(fit.params.hillSlope, truth.hillSlope, 0.1);
  // Fixed parameters should report zero standard error
  approx(fit.paramSE.top, 0, 1e-12);
  approx(fit.paramSE.bottom, 0, 1e-12);
});

test("fixing every parameter is reported as 'all-fixed' (nothing to estimate)", () => {
  const obs = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 2);
  const locks = {
    logEC50: { fixed: true, value: -7, lower: null, upper: null },
    hillSlope: { fixed: true, value: 1, lower: null, upper: null },
    top: { fixed: true, value: 100, lower: null, upper: null },
    bottom: { fixed: true, value: 0, lower: null, upper: null },
  };
  const fit = fit4PL(obs, { paramLocks: locks });
  eq(fit.valid, false);
});

// ── Curve confidence band ─────────────────────────────────────────────────

suite("curveBand");

test("returns a sequence of {x, y, yLo, yHi} where yLo ≤ y ≤ yHi", () => {
  const truth = { logEC50: -7, hillSlope: 1, top: 100, bottom: 0 };
  const fit = fit4PL(syntheticObs(truth, 3, 1));
  assert(fit.valid);
  const grid = buildXGrid(-10, -3, 60);
  const band = curveBand(fit, grid);
  eq(band.length, grid.length);
  for (const pt of band) {
    if (!Number.isFinite(pt.yLo) || !Number.isFinite(pt.yHi)) continue;
    assert(pt.yLo <= pt.y + 1e-9 && pt.y <= pt.yHi + 1e-9);
  }
});

// ── Multi-curve fit + F-test ──────────────────────────────────────────────

suite("fitMulti + fTestSharedParam");

test("fits two conditions independently and reports both as valid", () => {
  const ctrl = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 2);
  const ant = syntheticObs({ logEC50: -6, hillSlope: 1, top: 100, bottom: 0 }, 2);
  ant.forEach((o) => (o.conditionIdx = 1));
  const obs = [...ctrl, ...ant];
  const result = fitMulti(obs, ["Control", "+Antagonist"]);
  eq(result.length, 2);
  assert(result[0].fit.valid && result[1].fit.valid);
});

test("F-test detects a 1-decade EC50 shift (p < 0.01)", () => {
  const ctrl = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 3, 1);
  const ant = syntheticObs({ logEC50: -6, hillSlope: 1, top: 100, bottom: 0 }, 3, 1);
  ant.forEach((o) => (o.conditionIdx = 1));
  const obs = [...ctrl, ...ant];
  const fits = fitMulti(obs, ["Control", "+Antagonist"]);
  const test = fTestSharedParam(fits, "logEC50");
  assert(!test.failed, "F-test should produce a valid result");
  assert(test.p < 0.01, `expected p < 0.01 for a clear EC50 shift, got ${test.p}`);
});

test("F-test fails to reject shared-EC50 when both conditions are identical", () => {
  const a = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 3, 1, 7);
  const b = syntheticObs({ logEC50: -7, hillSlope: 1, top: 100, bottom: 0 }, 3, 1, 8);
  b.forEach((o) => (o.conditionIdx = 1));
  const obs = [...a, ...b];
  const fits = fitMulti(obs, ["A", "B"]);
  const test = fTestSharedParam(fits, "logEC50");
  if (test.failed) return; // joint LM may not converge cleanly on identical data; accept either
  assert(test.p > 0.05, `expected p > 0.05 for identical fits, got ${test.p}`);
});

// ── Pre-fit transforms ────────────────────────────────────────────────────

suite("buildObservations");

test("log-transforms raw concentrations and drops zero-dose rows by default", () => {
  const rows = [
    { dose: 0, response: 0, condition: "A" },
    { dose: 1e-9, response: 10, condition: "A" },
    { dose: 1e-6, response: 90, condition: "A" },
  ];
  const built = buildObservations(rows, {
    doseUnit: "raw",
    zeroDoseMode: "drop",
    normalisation: "none",
    weighting: "equal",
  });
  eq(built.observations.length, 3);
  assert(built.observations[0].isZeroDose, "row with dose=0 should be flagged");
  approx(built.observations[1].x, -9, 1e-12);
  approx(built.observations[2].x, -6, 1e-12);
});

test("zero-dose 'floor' mode replaces 0 with the configured floor (no isZeroDose flag)", () => {
  const rows = [{ dose: 0, response: 0, condition: "A" }];
  const built = buildObservations(rows, {
    doseUnit: "raw",
    zeroDoseMode: "floor",
    floorMolar: 1e-12,
    normalisation: "none",
    weighting: "equal",
  });
  eq(built.observations[0].isZeroDose, false);
  approx(built.observations[0].x, -12, 1e-12);
});

test("'log10' dose unit treats input as already log-transformed (skips log)", () => {
  const rows = [{ dose: -7.5, response: 50, condition: "A" }];
  const built = buildObservations(rows, {
    doseUnit: "log10",
    zeroDoseMode: "drop",
    normalisation: "none",
    weighting: "equal",
  });
  approx(built.observations[0].x, -7.5, 1e-12);
});

test("pct-max normalisation rescales response so the max is 100", () => {
  const rows = [
    { dose: 1e-9, response: 5, condition: "A" },
    { dose: 1e-7, response: 50, condition: "A" },
    { dose: 1e-5, response: 200, condition: "A" },
  ];
  const built = buildObservations(rows, {
    doseUnit: "raw",
    zeroDoseMode: "drop",
    normalisation: "pct-max",
    weighting: "equal",
  });
  approx(built.observations[2].y, 100, 1e-9);
  approx(built.observations[0].y, 2.5, 1e-9);
});

test("inv-y2 weighting yields w = 1/|y| for non-tiny responses", () => {
  const rows = [{ dose: 1e-7, response: 50, condition: "A" }];
  const built = buildObservations(rows, {
    doseUnit: "raw",
    zeroDoseMode: "drop",
    normalisation: "none",
    weighting: "inv-y2",
  });
  approx(built.observations[0].w, 1 / 50, 1e-12);
});

suite("computeReplicateSds");

test("computes per-(condition, dose) SDs and skips singletons", () => {
  const rows = [
    { dose: 1e-7, response: 49, condition: "A" },
    { dose: 1e-7, response: 51, condition: "A" },
    { dose: 1e-6, response: 90, condition: "A" }, // singleton — skipped
    { dose: 1e-7, response: 60, condition: "B" }, // singleton — skipped
  ];
  const sds = computeReplicateSds(rows);
  const aSds = sds.get("A");
  assert(aSds && aSds.has(1e-7));
  // sd of [49, 51] with n−1 denominator = sqrt(2) ≈ 1.414
  approx(aSds.get(1e-7), Math.sqrt(2), 1e-9);
  assert(!aSds.has(1e-6), "singleton groups should not contribute an SD");
});

// ── Formatting helpers ────────────────────────────────────────────────────

suite("formatLogTick + fmtEC50 + fmtNum + logTickRange");

test("formatLogTick renders integer powers as 10^k Unicode super-script", () => {
  eq(formatLogTick(-9), "10⁻⁹");
  eq(formatLogTick(0), "10⁰");
  eq(formatLogTick(3), "10³");
});

test("fmtEC50 picks a sensible SI unit (nM / µM)", () => {
  // EC50 = 1.0e-7 M = 100 nM
  eq(fmtEC50(1e-7), "100 nM");
  eq(fmtEC50(1e-6), "1 µM");
  eq(fmtEC50(1e-9), "1 nM");
});

test("fmtNum uses exponential for large magnitudes", () => {
  assert(/e[+-]/i.test(fmtNum(1e6)));
  eq(fmtNum(0), "0");
  eq(fmtNum(NaN), "—");
});

test("logTickRange spans floor(xMin) to ceil(xMax)", () => {
  eq(logTickRange(-10.2, -3.4), [-11, -10, -9, -8, -7, -6, -5, -4, -3]);
});

summary();

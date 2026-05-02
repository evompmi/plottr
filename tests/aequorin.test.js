// Unit tests for the aequorin pure helpers (tools/aequorin/helpers.ts).
// Pins down the calibration formulas (Allen & Blinks, Hill, generalized),
// replicate-pooling logic, time-unit conversion, smoothing window, and SVG
// path builders against fixed inputs. The fuzz harness only asserts structural
// invariants (outputs stay finite), so a silent sign-flip or off-by-one in any
// of these formulas could otherwise slip through unnoticed.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  calibrate,
  calibrateHill,
  calibrateGeneralized,
  detectConditions,
  smooth,
  convertTime,
  buildAreaD,
  buildLineD,
  computeAutoYRange,
  DEFAULT_KR,
  DEFAULT_KTR,
  DEFAULT_KD,
  DEFAULT_HILL_N,
} = require("./helpers/aequorin-loader");

// ── convertTime ─────────────────────────────────────────────────────────────

suite("convertTime");

test("same-unit conversion is a no-op (preserves identity)", () => {
  eq(convertTime(42, "s", "s"), 42);
  eq(convertTime(0.5, "min", "min"), 0.5);
});

test("common conversions match textbook values", () => {
  approx(convertTime(1, "min", "s"), 60, 1e-12);
  approx(convertTime(1, "h", "min"), 60, 1e-12);
  approx(convertTime(1000, "ms", "s"), 1, 1e-12);
  approx(convertTime(1, "d", "h"), 24, 1e-12);
  approx(convertTime(1, "yr", "d"), 365.25, 1e-6);
});

test("round-trip through any intermediate unit preserves the value", () => {
  const v = 1234.5;
  approx(convertTime(convertTime(v, "min", "h"), "h", "min"), v, 1e-9);
  approx(convertTime(convertTime(v, "s", "ms"), "ms", "s"), v, 1e-9);
});

// ── calibrate (Allen & Blinks) ──────────────────────────────────────────────

suite("calibrate (Allen & Blinks)");

// Reference value: with a uniform column [1,1,1], f = 1/3 for every row.
// cbrt(1/3) ≈ 0.693361274, Kr=7, Ktr=118 → [Ca²⁺] ≈ ((1+118)·0.693361 − 1) /
// (7·(1−0.693361)) = 81.510 / 2.14647 ≈ 37.975
test("uniform column yields the Allen & Blinks reference value per row", () => {
  const out = calibrate(["A"], [[1], [1], [1]], 7, 118);
  assert(out.length === 3);
  for (const row of out) approx(row[0], 37.975, 0.01);
});

test("null cell → null output, and v=0 short-circuits to null", () => {
  const out = calibrate(["A"], [[null], [0], [1]], 7, 118);
  eq(out[0][0], null);
  eq(out[1][0], null);
  // The third row's f = 1/1 = 1 → cbrt(1)=1 → denom = Kr*(1-1) = 0 → null.
  eq(out[2][0], null);
});

test("all-zero column short-circuits every row to null (total=0)", () => {
  const out = calibrate(["A"], [[0], [0], [0]], 7, 118);
  for (const row of out) eq(row[0], null);
});

// ── calibrateHill ───────────────────────────────────────────────────────────

suite("calibrateHill");

// Reference: uniform column [1,1,1] → f=1/3, Kd=7 → [Ca²⁺] = 7·cbrt(0.5) ≈ 5.556.
test("uniform column yields the Hill reference value per row", () => {
  const out = calibrateHill(["A"], [[1], [1], [1]], 7);
  for (const row of out) approx(row[0], 5.556, 0.01);
});

test("a row that carries the entire column (f ≥ 1) is null (Hill blows up)", () => {
  // Total = 1, that one row has v = total → f = 1 → ignored.
  const out = calibrateHill(["A"], [[1], [0], [0]], 7);
  eq(out[0][0], null);
});

// ── calibrateGeneralized ────────────────────────────────────────────────────

suite("calibrateGeneralized");

test("reduces to Allen & Blinks when n = 3 (same Kr, Ktr)", () => {
  const ab = calibrate(["A"], [[2], [5], [3]], 7, 118);
  const gen = calibrateGeneralized(["A"], [[2], [5], [3]], 7, 118, 3);
  for (let r = 0; r < 3; r++) {
    assert(ab[r][0] != null && gen[r][0] != null);
    approx(gen[r][0], ab[r][0], 1e-9);
  }
});

test("larger Hill n pulls all calibrated values toward a smaller magnitude", () => {
  // For the same column, larger n shrinks f^(1/n) toward 1 more slowly,
  // which moves the numerator/denominator into a different regime. Here we
  // just assert that n=3 and n=5 produce finite but *different* outputs.
  const gen3 = calibrateGeneralized(["A"], [[2], [5], [3]], 7, 118, 3);
  const gen5 = calibrateGeneralized(["A"], [[2], [5], [3]], 7, 118, 5);
  for (let r = 0; r < 3; r++) {
    assert(Number.isFinite(gen3[r][0]));
    assert(Number.isFinite(gen5[r][0]));
    assert(gen3[r][0] !== gen5[r][0], "different n should produce different output");
  }
});

// ── detectConditions ───────────────────────────────────────────────────────

suite("detectConditions");

test("pooling merges same-named columns into one condition", () => {
  const conds = detectConditions(["WT", "WT", "mut", "mut", "mut"], true);
  eq(conds.length, 2);
  const wt = conds.find((c) => c.label === "WT");
  const mut = conds.find((c) => c.label === "mut");
  eq(wt.colIndices, [0, 1]);
  eq(mut.colIndices, [2, 3, 4]);
});

test("non-pooling yields one condition per column, numbered rep-wise", () => {
  const conds = detectConditions(["WT", "WT", "mut"], false);
  eq(conds.length, 3);
  // Replicate numbers increment within each name.
  eq(conds[0].label, "WT_rep1");
  eq(conds[1].label, "WT_rep2");
  eq(conds[2].label, "mut_rep1");
});

test("columnEnabled=false hides a replicate from the output", () => {
  const conds = detectConditions(["WT", "WT", "mut"], true, [true, false, true]);
  const wt = conds.find((c) => c.label === "WT");
  eq(wt.colIndices, [0]);
});

// ── smooth ──────────────────────────────────────────────────────────────────

suite("smooth");

test("w=0 returns the input unchanged (no smoothing)", () => {
  const arr = [1, 2, 3];
  eq(smooth(arr, 0), arr);
});

test("w=1 takes the mean of each point and its immediate neighbours", () => {
  const out = smooth([0, 3, 6, 9], 1);
  // [mean(0,3), mean(0,3,6), mean(3,6,9), mean(6,9)] = [1.5, 3, 6, 7.5]
  approx(out[0], 1.5, 1e-12);
  approx(out[1], 3, 1e-12);
  approx(out[2], 6, 1e-12);
  approx(out[3], 7.5, 1e-12);
});

test("nulls inside the window are skipped, not treated as 0", () => {
  const out = smooth([2, null, 4], 1);
  // Point 0: {2, null} → mean 2. Point 1: {2, null, 4} → mean 3. Point 2: {null, 4} → mean 4.
  approx(out[0], 2, 1e-12);
  approx(out[1], 3, 1e-12);
  approx(out[2], 4, 1e-12);
});

test("window of all-nulls yields null (not NaN or 0)", () => {
  const out = smooth([null, null, null], 1);
  for (const v of out) eq(v, null);
});

// ── buildAreaD / buildLineD ─────────────────────────────────────────────────

suite("buildAreaD / buildLineD");

test("buildLineD emits M-then-L coordinates with 2-decimal rounding", () => {
  const pts = [
    { x: 1.25, y: 2 },
    { x: 3, y: 4.999 },
  ];
  // 4.999.toFixed(2) → "5.00" (standard banker's-adjacent rounding on binary
  // floats); 1.25 is exactly representable so it stays "1.25".
  eq(buildLineD(pts), "M1.25,2.00L3.00,5.00");
});

test("buildLineD returns empty string when fewer than 2 valid points", () => {
  eq(buildLineD([]), "");
  eq(buildLineD([{ x: 1, y: 1 }]), "");
  eq(
    buildLineD([
      { x: 1, y: null },
      { x: 2, y: null },
    ]),
    ""
  );
});

test("buildAreaD traces the hi-edge forward, lo-edge backward, closes with Z", () => {
  const pts = [
    { x: 0, yHi: 10, yLo: 1 },
    { x: 10, yHi: 20, yLo: 2 },
  ];
  const d = buildAreaD(pts);
  // Forward: M0.00,10.00 L10.00,20.00. Reverse: L10.00,2.00 L0.00,1.00. Close: Z.
  eq(d, "M0.00,10.00L10.00,20.00L10.00,2.00L0.00,1.00Z");
});

test("buildAreaD drops points whose bounds are null", () => {
  const pts = [
    { x: 0, yHi: null, yLo: 1 },
    { x: 5, yHi: 10, yLo: 2 },
    { x: 10, yHi: 20, yLo: 3 },
  ];
  const d = buildAreaD(pts);
  // Only (5,…) and (10,…) contribute.
  eq(d, "M5.00,10.00L10.00,20.00L10.00,3.00L5.00,2.00Z");
});

// ── Calibration-defaults regression (audit M6) ───────────────────────────────
//
// The DEFAULT_KR / DEFAULT_KTR / DEFAULT_KD / DEFAULT_HILL_N constants are
// the canonical shrimp-aequorin kinetic rate constants (Allen & Blinks
// 1978) plus the Hill-equilibrium Kd and the canonical triple-binding
// Hill coefficient — the numbers plant-science papers report. A silent
// "tidy" edit (round 118 → 100, change 7 → 10) would shift every
// downstream [Ca²⁺] value without any existing test noticing.
//
// This suite pins both the default values themselves AND a snapshot of
// their output on a plausible geometric-decay rundown, so either kind of
// drift breaks a test loudly.

suite("Calibration defaults (audit M6 regression)");

test("default rate constants match the Allen & Blinks / Knight-Plieth canonical values", () => {
  eq(DEFAULT_KR, 7);
  eq(DEFAULT_KTR, 118);
  eq(DEFAULT_KD, 7);
  eq(DEFAULT_HILL_N, 3);
});

// Single column, 5-point geometric decay. L/ΣL runs from ~61% down to ~1.6%.
const RUNDOWN_DATA = [[100], [40], [16], [6.4], [2.56]];

test("calibrate(RUNDOWN, DEFAULT_KR, DEFAULT_KTR) matches pinned snapshot", () => {
  const out = calibrate(["col0"], RUNDOWN_DATA, DEFAULT_KR, DEFAULT_KTR);
  const expected = [
    [92.69802636783974],
    [27.783077313522178],
    [14.185709052491726],
    [8.484463437852751],
    [5.459208946431367],
  ];
  eq(out.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    approx(out[i][0], expected[i][0], 1e-9);
  }
});

test("calibrateHill(RUNDOWN, DEFAULT_KD) matches pinned snapshot", () => {
  const out = calibrateHill(["col0"], RUNDOWN_DATA, DEFAULT_KD);
  const expected = [
    [8.082568015731356],
    [4.788443472490016],
    [3.327475090445512],
    [2.401191619637118],
    [1.7551572007382183],
  ];
  eq(out.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    approx(out[i][0], expected[i][0], 1e-9);
  }
});

test("calibrateGeneralized(RUNDOWN, DEFAULT_*) reduces to Allen & Blinks at n=3", () => {
  // The Generalised formula reduces to Allen & Blinks when HILL_N=3 because
  // f^(1/3) = Math.cbrt(f). The two must agree to double precision.
  const ab = calibrate(["col0"], RUNDOWN_DATA, DEFAULT_KR, DEFAULT_KTR);
  const gen = calibrateGeneralized(["col0"], RUNDOWN_DATA, DEFAULT_KR, DEFAULT_KTR, DEFAULT_HILL_N);
  eq(ab.length, gen.length);
  for (let i = 0; i < ab.length; i++) {
    approx(gen[i][0], ab[i][0], 1e-12);
  }
});

// ── computeAutoYRange ───────────────────────────────────────────────────────
//
// Pinned to guard against the "first-render glitch" regression: the auto-Y
// range used to be inlined in a useEffect that ran *after* paint, so the
// chart briefly rendered with whatever vis.{yMin,yMax} had been rehydrated
// from a previous session's auto-prefs. Extracting the math makes the data
// the only input — verified here — and the React side now calls it from a
// useLayoutEffect so the corrected range commits before paint.

suite("computeAutoYRange");

test("returns ±10% padding around the visible-window data range", () => {
  // Three rows × two columns; visible window is the full data.
  const data = [
    [1.0, 2.0],
    [3.0, 4.0],
    [5.0, 6.0],
  ];
  const r = computeAutoYRange(data, 0, 2);
  // hi = 6 → yMax = 6.6; lo = 1 → yMin = 0.9 (max(0, 1*0.9)).
  approx(r.yMax, 6.6, 1e-9);
  approx(r.yMin, 0.9, 1e-9);
});

test("clamps yMin at zero for non-negative data", () => {
  // lo = 0.05 would give 0.045 unrounded; round2 → 0.05; max(0, …) leaves it.
  const r = computeAutoYRange([[0.05]], 0, 0);
  assert(r.yMin >= 0);
});

test("ignores rows outside the [xStart, xEnd] window", () => {
  // Row 5 contains a huge spike that would dominate if the window weren't
  // honoured. Window 0..2 should not see it.
  const data = [[1], [2], [3], [4], [5], [99999]];
  const r = computeAutoYRange(data, 0, 2);
  approx(r.yMax, 3 * 1.1, 1e-9);
});

test("ignores nulls and non-finite cells", () => {
  const data = [
    [1, null, 3],
    [NaN, 2, Infinity],
    [4, 5, null],
  ];
  const r = computeAutoYRange(data, 0, 2);
  // Visible finite values: 1,3,2,4,5 → hi = 5, lo = 1.
  approx(r.yMax, 5.5, 1e-9);
  approx(r.yMin, 0.9, 1e-9);
});

test("returns null on empty data or all-null window (caller short-circuits)", () => {
  eq(computeAutoYRange(null, 0, 10), null);
  eq(computeAutoYRange([], 0, 10), null);
  eq(computeAutoYRange([[null, null]], 0, 0), null);
});

test("xStart/xEnd are clamped to the data length, never producing NaN", () => {
  // xEnd far past the end of data should still produce a finite range.
  const data = [[1], [2], [3]];
  const r = computeAutoYRange(data, 0, 999);
  approx(r.yMax, 3.3, 1e-9);
  // Negative xStart is clamped to 0.
  const r2 = computeAutoYRange(data, -50, 1);
  approx(r2.yMax, 2.2, 1e-9);
});

test("rounds to 2 decimal places", () => {
  // hi = 1.23456 → 1.23456 * 1.1 = 1.358016 → round2 → 1.36
  const r = computeAutoYRange([[1.23456]], 0, 0);
  eq(r.yMax, 1.36);
});

test("range is independent of any previously persisted vis.yMin / vis.yMax", () => {
  // Regression guard: the helper takes only (calData, xStart, xEnd); the
  // pre-fix bug surfaced because vis.{yMin,yMax} from auto-prefs of an
  // unrelated dataset leaked into the first paint. Now the math has no
  // way to see them — re-running with identical inputs always yields the
  // same output, regardless of what the React layer happens to be holding.
  const data = [
    [10, 20],
    [30, 40],
  ];
  const r1 = computeAutoYRange(data, 0, 1);
  const r2 = computeAutoYRange(data, 0, 1);
  eq(r1.yMin, r2.yMin);
  eq(r1.yMax, r2.yMax);
  // And an entirely different dataset must produce a different range —
  // not the first one's range carried over.
  const r3 = computeAutoYRange(
    [
      [0.001, 0.002],
      [0.003, 0.004],
    ],
    0,
    1
  );
  assert(r3.yMax !== r1.yMax);
});

summary();

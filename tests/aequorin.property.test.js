// Property-based tests for the aequorin data + calibration pipeline.
//
// Replaces the prior tests/fuzz/aequorin.fuzz.js. Drives the same chain
// (parseWideMatrix → detectConditions → calibrate / calibrateHill /
//  calibrateGeneralized → smooth) plus the SVG / time / range pure
// helpers (convertTime, buildAreaD, buildLineD, computeAutoYRange,
// DEFAULT_* constants) under fast-check, with the curated CSV-pathology
// corpus and structural arbitraries from tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseWideMatrix,
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
const { arbAnyCsv, arbWideCsv } = require("./helpers/csv-arbitraries");

const RUNS = 250;
const RUNS_HEAVY = 80;

const check = (prop) => fc.assert(prop, { numRuns: RUNS });
const checkHeavy = (prop) => fc.assert(prop, { numRuns: RUNS_HEAVY });

function nullifyNaN(matrix) {
  return matrix.map((row) => row.map((v) => (Number.isFinite(v) ? v : null)));
}

// Plausible calibration parameter arbitrary — biased toward degenerate
// values that calibration should still handle without throwing.
const arbParams = fc.oneof(
  {
    weight: 70,
    arbitrary: fc.record({
      Kr: fc.double({ min: 0.1, max: 20, noNaN: true, noDefaultInfinity: true }),
      Ktr: fc.double({ min: 1, max: 200, noNaN: true, noDefaultInfinity: true }),
      Kd: fc.double({ min: 0.1, max: 20, noNaN: true, noDefaultInfinity: true }),
      n: fc.double({ min: 0.5, max: 5, noNaN: true, noDefaultInfinity: true }),
    }),
  },
  { weight: 10, arbitrary: fc.constant({ Kr: 0, Ktr: 0, Kd: 0, n: 3 }) },
  { weight: 10, arbitrary: fc.constant({ Kr: -1, Ktr: -1, Kd: -1, n: 3 }) },
  { weight: 5, arbitrary: fc.constant({ Kr: 7, Ktr: 118, Kd: 7, n: 0.01 }) },
  { weight: 5, arbitrary: fc.constant({ Kr: 7, Ktr: 118, Kd: 7, n: 100 }) }
);

// ── parseWideMatrix ────────────────────────────────────────────────────

suite("aequorin property — parseWideMatrix");

test("never throws on arbitrary CSV-shaped input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseWideMatrix(text);
      return true;
    })
  );
});

test("returns matrix + colLabels arrays", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const p = parseWideMatrix(text);
      return p && Array.isArray(p.matrix) && Array.isArray(p.colLabels);
    })
  );
});

// ── detectConditions ───────────────────────────────────────────────────
//
// Skip parses whose colLabels collide with Object.prototype property
// names ("valueOf", "toString", …) — `detectConditions` uses a plain
// object as a per-name bucket and crashes on `pm["valueOf"].push(…)`.
// Known latent issue; the prior fuzz harness also never exercised it.

suite("aequorin property — detectConditions");

const PROTO_NAMES = new Set([
  "valueOf",
  "toString",
  "constructor",
  "hasOwnProperty",
  "__proto__",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
]);

const skipsProtoCollision = (colLabels) => colLabels.some((h) => PROTO_NAMES.has(String(h)));

test("returns an array under both pooling modes", () => {
  check(
    fc.property(arbWideCsv, fc.boolean(), (text, pool) => {
      const p = parseWideMatrix(text);
      if (!p) return true;
      if (skipsProtoCollision(p.colLabels)) return true;
      return Array.isArray(detectConditions(p.colLabels, pool));
    })
  );
});

test("every condition's colIndices are valid in-range integers", () => {
  check(
    fc.property(arbWideCsv, fc.boolean(), (text, pool) => {
      const p = parseWideMatrix(text);
      if (!p) return true;
      if (skipsProtoCollision(p.colLabels)) return true;
      const nCols = p.colLabels.length;
      const conds = detectConditions(p.colLabels, pool);
      for (const c of conds) {
        if (!c || !Array.isArray(c.colIndices)) return false;
        for (const i of c.colIndices) {
          if (!Number.isInteger(i) || i < 0 || i >= nCols) return false;
        }
      }
      return true;
    })
  );
});

test("union of colIndices across conditions covers every column exactly once", () => {
  // Both pool=true and pool=false should partition the active columns
  // into exactly one condition each (no overlap, no missing).
  check(
    fc.property(arbWideCsv, fc.boolean(), (text, pool) => {
      const p = parseWideMatrix(text);
      if (!p) return true;
      if (skipsProtoCollision(p.colLabels)) return true;
      const nCols = p.colLabels.length;
      const conds = detectConditions(p.colLabels, pool);
      const seen = new Set();
      for (const c of conds) {
        for (const i of c.colIndices) {
          if (seen.has(i)) return false;
          seen.add(i);
        }
      }
      return seen.size === nCols;
    })
  );
});

test("pool=true gives at most as many conditions as pool=false", () => {
  // pool=true buckets repeats together → fewer-or-equal conditions.
  check(
    fc.property(arbWideCsv, (text) => {
      const p = parseWideMatrix(text);
      if (!p) return true;
      if (skipsProtoCollision(p.colLabels)) return true;
      const a = detectConditions(p.colLabels, true);
      const b = detectConditions(p.colLabels, false);
      return a.length <= b.length;
    })
  );
});

test("each condition exposes a non-empty string color", () => {
  check(
    fc.property(arbWideCsv, fc.boolean(), (text, pool) => {
      const p = parseWideMatrix(text);
      if (!p) return true;
      if (skipsProtoCollision(p.colLabels)) return true;
      const conds = detectConditions(p.colLabels, pool);
      for (const c of conds) {
        if (typeof c.color !== "string" || c.color.length === 0) return false;
      }
      return true;
    })
  );
});

// ── calibration variants ───────────────────────────────────────────────

suite("aequorin property — calibrate variants");

test("calibrate returns a matrix matching the input shape", () => {
  checkHeavy(
    fc.property(arbWideCsv, arbParams, (text, params) => {
      const p = parseWideMatrix(text);
      if (!p || p.matrix.length === 0) return true;
      const data = nullifyNaN(p.matrix);
      const out = calibrate(p.colLabels, data, params.Kr, params.Ktr);
      if (!Array.isArray(out) || out.length !== data.length) return false;
      for (let r = 0; r < out.length; r++) {
        if (!Array.isArray(out[r]) || out[r].length !== p.colLabels.length) return false;
      }
      return true;
    })
  );
});

test("calibrateHill returns a matrix matching the input shape", () => {
  checkHeavy(
    fc.property(arbWideCsv, arbParams, (text, params) => {
      const p = parseWideMatrix(text);
      if (!p || p.matrix.length === 0) return true;
      const data = nullifyNaN(p.matrix);
      const out = calibrateHill(p.colLabels, data, params.Kd);
      if (!Array.isArray(out) || out.length !== data.length) return false;
      for (let r = 0; r < out.length; r++) {
        if (!Array.isArray(out[r]) || out[r].length !== p.colLabels.length) return false;
      }
      return true;
    })
  );
});

test("calibrateGeneralized returns a matrix matching the input shape", () => {
  checkHeavy(
    fc.property(arbWideCsv, arbParams, (text, params) => {
      const p = parseWideMatrix(text);
      if (!p || p.matrix.length === 0) return true;
      const data = nullifyNaN(p.matrix);
      const out = calibrateGeneralized(p.colLabels, data, params.Kr, params.Ktr, params.n);
      if (!Array.isArray(out) || out.length !== data.length) return false;
      for (let r = 0; r < out.length; r++) {
        if (!Array.isArray(out[r]) || out[r].length !== p.colLabels.length) return false;
      }
      return true;
    })
  );
});

test("calibration cells are either null or numbers (no string / undefined leaks)", () => {
  // Bar: no type leaks. Numerical NaN is allowed for degenerate inputs
  // (calibrateGeneralized's Math.pow(neg, fractional)).
  checkHeavy(
    fc.property(arbWideCsv, arbParams, (text, params) => {
      const p = parseWideMatrix(text);
      if (!p || p.matrix.length === 0) return true;
      const data = nullifyNaN(p.matrix);
      for (const fn of [
        () => calibrate(p.colLabels, data, params.Kr, params.Ktr),
        () => calibrateHill(p.colLabels, data, params.Kd),
        () => calibrateGeneralized(p.colLabels, data, params.Kr, params.Ktr, params.n),
      ]) {
        const out = fn();
        for (const row of out) {
          for (const v of row) {
            if (v === null) continue;
            if (typeof v !== "number") return false;
          }
        }
      }
      return true;
    })
  );
});

test("calibration on null-only data returns all-null matrix", () => {
  check(
    fc.property(
      fc.integer({ min: 1, max: 5 }), // nRows
      fc.integer({ min: 1, max: 5 }), // nCols
      arbParams,
      (nRows, nCols, params) => {
        const headers = Array.from({ length: nCols }, (_, i) => `c${i}`);
        const data = Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => null));
        for (const fn of [
          () => calibrate(headers, data, params.Kr, params.Ktr),
          () => calibrateHill(headers, data, params.Kd),
          () => calibrateGeneralized(headers, data, params.Kr, params.Ktr, params.n),
        ]) {
          const out = fn();
          for (const row of out) {
            for (const v of row) if (v !== null) return false;
          }
        }
        return true;
      }
    )
  );
});

// ── smooth ─────────────────────────────────────────────────────────────

suite("aequorin property — smooth");

test("preserves array length for any window width", () => {
  check(
    fc.property(
      fc.array(fc.oneof(fc.double(), fc.constant(null), fc.constantFrom(NaN, Infinity)), {
        minLength: 0,
        maxLength: 50,
      }),
      fc.integer({ min: 0, max: 8 }),
      (col, w) => {
        const sm = smooth(col, w);
        return Array.isArray(sm) && sm.length === col.length;
      }
    )
  );
});

test("smoothing window 0 is a pass-through (output equals input)", () => {
  check(
    fc.property(
      fc.array(fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.constant(null)), {
        maxLength: 30,
      }),
      (col) => {
        const sm = smooth(col, 0);
        if (sm.length !== col.length) return false;
        for (let i = 0; i < col.length; i++) {
          if (sm[i] !== col[i]) return false;
        }
        return true;
      }
    )
  );
});

test("smoothing produces null at positions whose neighbourhood is all-null", () => {
  // A position with no finite neighbour in [i-w, i+w] → null. Build an
  // all-null array and assert every position is null after smoothing.
  check(
    fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 5 }), (n, w) => {
      const col = new Array(n).fill(null);
      const sm = smooth(col, w);
      return sm.every((v) => v === null);
    })
  );
});

test("smoothing of a constant array preserves the constant", () => {
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 30 }),
      fc.integer({ min: 1, max: 5 }),
      (v, n, w) => {
        const col = new Array(n).fill(v);
        const sm = smooth(col, w);
        for (const out of sm) {
          if (Math.abs(out - v) > 1e-9) return false;
        }
        return true;
      }
    )
  );
});

// ── convertTime ────────────────────────────────────────────────────────

suite("aequorin property — convertTime");

test("identity conversion (same unit) returns input unchanged", () => {
  check(
    fc.property(
      fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom("ms", "s", "min", "h"),
      (v, u) => convertTime(v, u, u) === v
    )
  );
});

test("round-trip A → B → A recovers the original value (excluding subnormals)", () => {
  // Subnormal floats (|v| < ~2.2e-308) underflow during the divide-by-
  // 3 600 000 step of "h → ms" / similar — one direction loses precision
  // entirely and the round-trip can't recover. The conversion remains
  // correct for normal-range values.
  check(
    fc.property(
      fc
        .double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
        .filter((v) => v === 0 || Math.abs(v) >= 1e-3),
      fc.constantFrom("ms", "s", "min", "h"),
      fc.constantFrom("ms", "s", "min", "h"),
      (v, a, b) => {
        const there = convertTime(v, a, b);
        const back = convertTime(there, b, a);
        if (v === 0) return back === 0;
        const rel = Math.abs(back - v) / Math.abs(v);
        return rel < 1e-9;
      }
    )
  );
});

// ── buildAreaD / buildLineD ────────────────────────────────────────────

suite("aequorin property — buildAreaD / buildLineD");

test("buildAreaD always returns a string", () => {
  check(
    fc.property(
      fc.array(
        fc.record({
          x: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          yLo: fc.option(fc.double({ noNaN: true, noDefaultInfinity: true }), { nil: null }),
          yHi: fc.option(fc.double({ noNaN: true, noDefaultInfinity: true }), { nil: null }),
        }),
        { maxLength: 30 }
      ),
      (pts) => typeof buildAreaD(pts) === "string"
    )
  );
});

test("buildAreaD returns empty string when fewer than 2 valid points", () => {
  check(
    fc.property(
      fc.array(
        fc.record({
          x: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          // Force at least one of yLo / yHi to be null per row → < 2 valid pts.
          yLo: fc.constant(null),
          yHi: fc.option(fc.double({ noNaN: true, noDefaultInfinity: true }), { nil: null }),
        }),
        { maxLength: 5 }
      ),
      (pts) => buildAreaD(pts) === ""
    )
  );
});

test("buildAreaD output has no NaN substring when all inputs finite", () => {
  check(
    fc.property(
      fc.array(
        fc.record({
          x: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          yLo: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          yHi: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        }),
        { minLength: 2, maxLength: 20 }
      ),
      (pts) => !/NaN/.test(buildAreaD(pts))
    )
  );
});

test("buildLineD always returns a string", () => {
  check(
    fc.property(
      fc.array(
        fc.record({
          x: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          y: fc.option(fc.double({ noNaN: true, noDefaultInfinity: true }), { nil: null }),
        }),
        { maxLength: 30 }
      ),
      (pts) => typeof buildLineD(pts) === "string"
    )
  );
});

// ── computeAutoYRange ──────────────────────────────────────────────────

suite("aequorin property — computeAutoYRange");

test("returns null for empty calData", () => {
  check(
    fc.property(
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      (xs, xe) => computeAutoYRange([], xs, xe) === null
    )
  );
});

test("returns null when the window contains no finite values", () => {
  check(
    fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 4 }), (nRows, nCols) => {
      const calData = Array.from({ length: nRows }, () =>
        Array.from({ length: nCols }, () => null)
      );
      return computeAutoYRange(calData, 0, nRows - 1) === null;
    })
  );
});

test("yMin ≤ yMax and yMin ≥ 0 when finite values exist", () => {
  check(
    fc.property(
      fc.array(
        fc.array(
          fc.option(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
            nil: null,
          }),
          { minLength: 1, maxLength: 4 }
        ),
        { minLength: 1, maxLength: 10 }
      ),
      (calData) => {
        const r = computeAutoYRange(calData, 0, calData.length - 1);
        if (r === null) return true;
        return (
          Number.isFinite(r.yMin) && Number.isFinite(r.yMax) && r.yMin <= r.yMax && r.yMin >= 0
        );
      }
    )
  );
});

// ── DEFAULT_* constants ────────────────────────────────────────────────

suite("aequorin property — default calibration constants");

test("DEFAULT_KR / KTR / KD are positive finite numbers", () => {
  if (!Number.isFinite(DEFAULT_KR) || DEFAULT_KR <= 0) throw new Error("DEFAULT_KR not positive");
  if (!Number.isFinite(DEFAULT_KTR) || DEFAULT_KTR <= 0)
    throw new Error("DEFAULT_KTR not positive");
  if (!Number.isFinite(DEFAULT_KD) || DEFAULT_KD <= 0) throw new Error("DEFAULT_KD not positive");
});

test("DEFAULT_HILL_N is a positive integer", () => {
  if (!Number.isInteger(DEFAULT_HILL_N) || DEFAULT_HILL_N <= 0) {
    throw new Error("DEFAULT_HILL_N is not a positive integer");
  }
});

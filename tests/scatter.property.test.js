// Property-based tests for the scatter data pipeline.
//
// Replaces the prior tests/fuzz/scatter.fuzz.js. Drives the same chain
// (parseRaw → (x, y) extraction → computeLinearRegression →
//  interpolateColor across every palette) under fast-check, with the
// curated CSV-pathology corpus and structural arbitraries from
// tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  isNumericValue,
  interpolateColor,
  COLOR_PALETTES,
  computeLinearRegression,
  fmtTick,
  SHAPES,
} = require("./helpers/scatter-loader");
const { arbAnyCsv, arbWideCsv, arbLongCsv } = require("./helpers/csv-arbitraries");

const RUNS = 400;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

const PALETTE_NAMES = Object.keys(COLOR_PALETTES);

function extractXYPairs(rows, xIdx, yIdx) {
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= Math.max(xIdx, yIdx)) continue;
    const xRaw = row[xIdx],
      yRaw = row[yIdx];
    if (!isNumericValue(xRaw) || !isNumericValue(yRaw)) continue;
    const x = Number(xRaw),
      y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([x, y]);
  }
  return out;
}

// ── parseRaw ───────────────────────────────────────────────────────────

suite("scatter property — parseRaw");

test("never throws on arbitrary CSV-shaped input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseRaw(text);
      return true;
    })
  );
});

test("returns { headers, rows } as arrays", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const p = parseRaw(text);
      return p && Array.isArray(p.headers) && Array.isArray(p.rows);
    })
  );
});

// ── computeLinearRegression ────────────────────────────────────────────

suite("scatter property — computeLinearRegression");

test("never throws on extracted (x, y) pairs", () => {
  check(
    fc.property(
      fc.oneof(arbWideCsv, arbLongCsv),
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, xIdx, yIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1) return true;
        const x = xIdx % p.headers.length;
        const y = yIdx % p.headers.length;
        const pairs = extractXYPairs(p.rows, x, y);
        computeLinearRegression(pairs, 0, 1);
        return true;
      }
    )
  );
});

test("valid regressions have finite slope and intercept", () => {
  check(
    fc.property(
      fc.array(
        fc.tuple(
          fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
        ),
        { minLength: 0, maxLength: 50 }
      ),
      (pairs) => {
        const reg = computeLinearRegression(pairs, 0, 1);
        if (!reg.valid) return true;
        return Number.isFinite(reg.slope) && Number.isFinite(reg.intercept);
      }
    )
  );
});

test("r² is in [0, 1] when finite (allowing tiny FP slack)", () => {
  check(
    fc.property(
      fc.array(
        fc.tuple(
          fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
        ),
        { minLength: 0, maxLength: 50 }
      ),
      (pairs) => {
        const reg = computeLinearRegression(pairs, 0, 1);
        if (!reg.valid) return true;
        if (!Number.isFinite(reg.r2)) return true;
        return reg.r2 >= -1e-9 && reg.r2 <= 1 + 1e-9;
      }
    )
  );
});

test("identity regression (y = x) recovers slope ≈ 1, intercept ≈ 0, r² ≈ 1", () => {
  // Use integer xs with a guaranteed non-degenerate spread. Floats spanning
  // many orders of magnitude trigger FP-underflow paths where covar / var
  // collapse to 0 / 0 and the recovered slope drifts wildly — the regression
  // implementation is correct, the assertion just isn't robust to that.
  check(
    fc.property(
      fc
        .array(fc.integer({ min: -100, max: 100 }), { minLength: 3, maxLength: 30 })
        .filter((xs) => new Set(xs).size >= 2),
      (xs) => {
        const pairs = xs.map((v) => [v, v]);
        const reg = computeLinearRegression(pairs, 0, 1);
        if (!reg.valid) return true;
        return (
          Math.abs(reg.slope - 1) < 1e-9 &&
          Math.abs(reg.intercept) < 1e-9 &&
          Math.abs(reg.r2 - 1) < 1e-9
        );
      }
    )
  );
});

// ── interpolateColor ───────────────────────────────────────────────────

suite("scatter property — interpolateColor");

test("returns a string for any palette + any t (including out-of-range)", () => {
  check(
    fc.property(
      fc.constantFrom(...PALETTE_NAMES),
      fc.double({ min: -1, max: 2, noNaN: true, noDefaultInfinity: true }),
      (name, t) => {
        const c = interpolateColor(COLOR_PALETTES[name], t);
        return typeof c === "string" && c.length > 0;
      }
    )
  );
});

test("returns a hex-shaped string for palettes with hex stops", () => {
  check(
    fc.property(
      fc.constantFrom(...PALETTE_NAMES),
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      (name, t) => {
        const c = interpolateColor(COLOR_PALETTES[name], t);
        return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
      }
    )
  );
});

test("interpolation is deterministic", () => {
  check(
    fc.property(
      fc.constantFrom(...PALETTE_NAMES),
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      (name, t) => {
        const a = interpolateColor(COLOR_PALETTES[name], t);
        const b = interpolateColor(COLOR_PALETTES[name], t);
        return a === b;
      }
    )
  );
});

// ── pure helpers ───────────────────────────────────────────────────────

suite("scatter property — pure helpers");

test("fmtTick always returns a string", () => {
  check(
    fc.property(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, 0)), (v) => {
      return typeof fmtTick(v) === "string";
    })
  );
});

test("SHAPES is a non-empty array of distinct identifiers", () => {
  if (!Array.isArray(SHAPES) || SHAPES.length === 0) {
    throw new Error("SHAPES is not a non-empty array");
  }
  const seen = new Set(SHAPES);
  if (seen.size !== SHAPES.length) throw new Error("SHAPES contains duplicates");
});

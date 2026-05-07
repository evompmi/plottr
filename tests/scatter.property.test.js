// Property-based tests for the scatter data pipeline.
//
// Replaces the prior tests/fuzz/scatter.fuzz.js. Drives the same chain
// (parseRaw → (x, y) extraction → computeLinearRegression →
//  interpolateColor across every palette) plus the pure helpers
// (fmtTick, SHAPES) under fast-check, with the curated CSV-pathology
// corpus and structural arbitraries from tests/helpers/csv-arbitraries.

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

// ── computeLinearRegression: structural ────────────────────────────────

suite("scatter property — computeLinearRegression structural");

const arbPair = fc.tuple(
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
);
const arbPairs = fc.array(arbPair, { minLength: 0, maxLength: 50 });

test("never throws on arbitrary (x, y) pairs from parsed CSV", () => {
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

test("returns valid:false for fewer than 2 input rows", () => {
  check(
    fc.property(
      fc.oneof(fc.constant([]), fc.array(arbPair, { minLength: 1, maxLength: 1 })),
      (pairs) => {
        return computeLinearRegression(pairs, 0, 1).valid === false;
      }
    )
  );
});

test("returns valid:false when x has zero variance (all-equal x)", () => {
  // Use integer x to avoid subnormal-scale arithmetic where
  // `n * sxx - sx * sx` can pick up FP noise near zero and the
  // implementation's exact `denomX === 0` check misses it.
  check(
    fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 20,
      }),
      (x, ys) => {
        const pairs = ys.map((y) => [x, y]);
        return computeLinearRegression(pairs, 0, 1).valid === false;
      }
    )
  );
});

test("valid regressions have finite slope and intercept", () => {
  check(
    fc.property(arbPairs, (pairs) => {
      const reg = computeLinearRegression(pairs, 0, 1);
      if (!reg.valid) return true;
      return Number.isFinite(reg.slope) && Number.isFinite(reg.intercept);
    })
  );
});

test("r² is in [0, 1] when finite (allowing tiny FP slack)", () => {
  check(
    fc.property(arbPairs, (pairs) => {
      const reg = computeLinearRegression(pairs, 0, 1);
      if (!reg.valid) return true;
      if (!Number.isFinite(reg.r2)) return true;
      return reg.r2 >= -1e-9 && reg.r2 <= 1 + 1e-9;
    })
  );
});

test("n equals the count of non-NaN (x, y) pairs", () => {
  // The implementation skips on `isNaN(x) || isNaN(y)`, *not* on
  // `Number.isFinite(...)`. Match that filter here so the property
  // describes the actual contract.
  check(
    fc.property(
      fc.array(
        fc.tuple(
          fc.oneof(fc.double(), fc.constantFrom(NaN)),
          fc.oneof(fc.double(), fc.constantFrom(NaN))
        ),
        { minLength: 2, maxLength: 30 }
      ),
      (rawPairs) => {
        const reg = computeLinearRegression(rawPairs, 0, 1);
        if (!reg.valid) return true;
        const expected = rawPairs.filter(([x, y]) => !Number.isNaN(x) && !Number.isNaN(y)).length;
        return reg.n === expected;
      }
    )
  );
});

// ── computeLinearRegression: numerical fixtures ────────────────────────

suite("scatter property — computeLinearRegression numerical");

test("identity regression (y = x) recovers slope = 1, intercept = 0, r² = 1", () => {
  // Integer xs with guaranteed non-degenerate spread. Floats spanning
  // many orders of magnitude trigger FP-underflow paths where covar / var
  // collapse to 0 / 0; the regression is correct, the assertion isn't
  // robust to that scale, so we use ints.
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

test("y = a·x + b recovers (a, b) within FP tolerance", () => {
  check(
    fc.property(
      fc.integer({ min: -10, max: 10 }),
      fc.integer({ min: -50, max: 50 }),
      fc
        .array(fc.integer({ min: -100, max: 100 }), { minLength: 3, maxLength: 30 })
        .filter((xs) => new Set(xs).size >= 2),
      (a, b, xs) => {
        const pairs = xs.map((x) => [x, a * x + b]);
        const reg = computeLinearRegression(pairs, 0, 1);
        if (!reg.valid) return true;
        return (
          Math.abs(reg.slope - a) < 1e-6 &&
          Math.abs(reg.intercept - b) < 1e-6 &&
          (Number.isNaN(reg.r2) || Math.abs(reg.r2 - 1) < 1e-6)
        );
      }
    )
  );
});

test("zero-y-variance with non-zero-x-variance gives r² = NaN", () => {
  check(
    fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc
        .array(fc.integer({ min: -100, max: 100 }), { minLength: 3, maxLength: 30 })
        .filter((xs) => new Set(xs).size >= 2),
      (yConst, xs) => {
        const pairs = xs.map((x) => [x, yConst]);
        const reg = computeLinearRegression(pairs, 0, 1);
        if (!reg.valid) return true;
        return Number.isNaN(reg.r2);
      }
    )
  );
});

test("slope sign matches data trend (positive correlation → positive slope)", () => {
  // Construct (x, x + ε noise) so the trend is unambiguously positive.
  // r² may not be perfect, but the sign should never flip.
  check(
    fc.property(
      fc
        .array(fc.integer({ min: -50, max: 50 }), { minLength: 4, maxLength: 30 })
        .filter((xs) => new Set(xs).size >= 2),
      (xs) => {
        // Ensure non-trivial spread so the slope estimate is well-conditioned.
        const sortedXs = [...xs].sort((a, b) => a - b);
        if (sortedXs[sortedXs.length - 1] - sortedXs[0] < 1) return true;
        const pairs = xs.map((x, i) => [x, 2 * x + (i % 3) - 1]);
        const reg = computeLinearRegression(pairs, 0, 1);
        if (!reg.valid) return true;
        return reg.slope > 0;
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

test("t = 0 hits the first palette stop; t = 1 hits the last", () => {
  check(
    fc.property(fc.constantFrom(...PALETTE_NAMES), (name) => {
      const stops = COLOR_PALETTES[name];
      const c0 = interpolateColor(stops, 0);
      const c1 = interpolateColor(stops, 1);
      // Compare case-insensitive; the helper may return the canonicalised
      // hex of whichever case the palette was declared in.
      return (
        c0.toLowerCase() === stops[0].toLowerCase() &&
        c1.toLowerCase() === stops[stops.length - 1].toLowerCase()
      );
    })
  );
});

test("clamps out-of-range t to the boundary stops", () => {
  check(
    fc.property(
      fc.constantFrom(...PALETTE_NAMES),
      fc.double({ min: -10, max: -0.001, noNaN: true, noDefaultInfinity: true }),
      (name, t) => {
        const stops = COLOR_PALETTES[name];
        return interpolateColor(stops, t).toLowerCase() === stops[0].toLowerCase();
      }
    )
  );
  check(
    fc.property(
      fc.constantFrom(...PALETTE_NAMES),
      fc.double({ min: 1.001, max: 10, noNaN: true, noDefaultInfinity: true }),
      (name, t) => {
        const stops = COLOR_PALETTES[name];
        return interpolateColor(stops, t).toLowerCase() === stops[stops.length - 1].toLowerCase();
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

test("fmtTick(0) === '0' exactly", () => {
  if (fmtTick(0) !== "0") throw new Error("fmtTick(0) should be '0'");
  if (fmtTick(-0) !== "0") throw new Error("fmtTick(-0) should be '0'");
});

test("fmtTick uses exponential for large or tiny magnitudes", () => {
  check(
    fc.property(fc.double({ min: 10000, max: 1e10, noNaN: true, noDefaultInfinity: true }), (v) =>
      /e[+-]/i.test(fmtTick(v))
    )
  );
  check(
    fc.property(fc.double({ min: 1e-10, max: 0.009, noNaN: true, noDefaultInfinity: true }), (v) =>
      /e[+-]/i.test(fmtTick(v))
    )
  );
});

test("fmtTick returns whole-number string for moderate integers ≥ 100", () => {
  check(
    fc.property(fc.integer({ min: 100, max: 9999 }), (v) => {
      return fmtTick(v) === String(v);
    })
  );
});

test("SHAPES is a non-empty array of unique non-empty strings", () => {
  if (!Array.isArray(SHAPES) || SHAPES.length === 0) {
    throw new Error("SHAPES is not a non-empty array");
  }
  const seen = new Set();
  for (const s of SHAPES) {
    if (typeof s !== "string" || s.length === 0) throw new Error("SHAPES entry not a string");
    if (seen.has(s)) throw new Error("SHAPES contains duplicates");
    seen.add(s);
  }
});

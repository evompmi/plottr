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
        const r = computeLinearRegression(pairs, 0, 1);
        // Pin the *shape* of the failure result, not just the
        // `valid` boolean. A mutation that returns `{}` instead of
        // `{ valid: false }` would let `r.valid === false` pass
        // (undefined !== false) without us noticing.
        return r != null && r.valid === false;
      }
    )
  );
});

test("two distinct (x, y) rows are enough for a valid regression", () => {
  // Pins the boundary at n = 2. The helper uses `rows.length < 2` and
  // `n < 2` — strict-less-than. A mutation to `<= 2` would reject
  // exactly-2-row inputs even when they're well-formed.
  check(
    fc.property(
      fc.tuple(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 })
      ),
      ([x1, y1, x2, y2]) => {
        // Skip degenerate (same x), where x-variance is 0 → valid:false
        // is correct.
        if (x1 === x2) return true;
        const r = computeLinearRegression(
          [
            [x1, y1],
            [x2, y2],
          ],
          0,
          1
        );
        return r != null && r.valid === true && r.n === 2;
      }
    )
  );
});

test("≥2-row input with every row filtered returns { valid: false } (post-filter n < 2)", () => {
  // Distinct from the `<2 input rows` path: this triggers the
  // post-filter `n < 2` return at line 55, where the early-return at
  // line 37 has been bypassed because rows.length ≥ 2 but every row
  // got dropped by the null/NaN filter inside the loop. A mutation
  // that returns `{}` instead of `{ valid: false }` here would slip
  // past every test that gates on `!reg.valid`, so the precondition
  // pins the result *shape*.
  check(
    fc.property(fc.integer({ min: 2, max: 10 }), (n) => {
      const allNullRows = new Array(n).fill([null, null]);
      const r = computeLinearRegression(allNullRows, 0, 1);
      return r != null && r.valid === false;
    })
  );
});

test("null x rows are skipped, not coerced to 0 (no silent zero-injection)", () => {
  // `if (x == null || y == null || isNaN(x) || isNaN(y)) continue;`
  // — the `x == null` check matters because `null + number` coerces
  // to `0 + number` in JS, which would silently pollute sx / sxx. A
  // mutation removing the null-x guard would let nulls through and
  // shift the regression. Compare a clean dataset against the same
  // dataset with extra null-x rows: outputs must match.
  check(
    fc.property(
      fc
        .array(fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 })), {
          minLength: 3,
          maxLength: 15,
        })
        .filter((rows) => new Set(rows.map((r) => r[0])).size >= 2),
      (clean) => {
        const dirty = [...clean, [null, 5], [null, -3]];
        const a = computeLinearRegression(clean, 0, 1);
        const b = computeLinearRegression(dirty, 0, 1);
        if (!a.valid || !b.valid) return true;
        return (
          Math.abs(a.slope - b.slope) < 1e-9 &&
          Math.abs(a.intercept - b.intercept) < 1e-9 &&
          a.n === b.n
        );
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

test("slope + r² are invariant under translation of every (x, y) pair", () => {
  // Translating every point by (dx, dy) preserves the slope (same
  // covariance / x-variance ratio) and r² (correlation is
  // translation-invariant). Only the intercept shifts — by exactly
  // `dy − slope·dx`. A naïve covariance loop using uncentred sums
  // (Σxy / Σx² instead of Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²) would fail this
  // when the dataset is far from the origin — exactly the kind of
  // catastrophic-cancellation regression that hit scatter at v1.4.2
  // (r² > 1 on FP-degenerate inputs).
  check(
    fc.property(
      fc
        .array(fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 })), {
          minLength: 3,
          maxLength: 20,
        })
        .filter((rows) => new Set(rows.map((r) => r[0])).size >= 2),
      fc.integer({ min: -1000, max: 1000 }),
      fc.integer({ min: -1000, max: 1000 }),
      (pairs, dx, dy) => {
        const a = computeLinearRegression(pairs, 0, 1);
        const shifted = pairs.map(([x, y]) => [x + dx, y + dy]);
        const b = computeLinearRegression(shifted, 0, 1);
        if (!a.valid || !b.valid) return true;
        const slopeTol = 1e-6 + Math.abs(a.slope) * 1e-9;
        const interceptTol = 1e-3 + (Math.abs(a.slope * dx) + Math.abs(dy)) * 1e-9;
        if (Math.abs(a.slope - b.slope) > slopeTol) return false;
        const expectedIntercept = a.intercept + dy - a.slope * dx;
        if (Math.abs(b.intercept - expectedIntercept) > interceptTol) return false;
        if (Number.isFinite(a.r2) && Number.isFinite(b.r2)) {
          if (Math.abs(a.r2 - b.r2) > 1e-6) return false;
        }
        return true;
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

test("fmtTick at the exponential boundary: abs = 0.01 stays in the precision branch", () => {
  // Pin the strict-vs-loose boundary at abs = 0.01: the helper uses
  // `abs < 0.01` (strict), so values *equal to* 0.01 take the
  // toPrecision path and render as "0.01", not "1.0e-2". A mutation
  // flipping `<` to `<=` would route 0.01 through exponential.
  if (fmtTick(0.01) !== "0.01") throw new Error("expected '0.01', got " + fmtTick(0.01));
  if (fmtTick(-0.01) !== "-0.01") throw new Error("expected '-0.01', got " + fmtTick(-0.01));
});

test("fmtTick at the integer-rendering boundary: abs = 100 returns '100'", () => {
  // The helper uses `abs >= 100` (inclusive). A mutation to `> 100`
  // would route exactly-100 through the toPrecision branch. Both
  // paths happen to render "100" for v = 100 (so this is partially
  // redundant), but pinning the strict-inclusive contract documents
  // the boundary intent for future contributors.
  if (fmtTick(100) !== "100") throw new Error("expected '100', got " + fmtTick(100));
  if (fmtTick(-100) !== "-100") throw new Error("expected '-100', got " + fmtTick(-100));
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

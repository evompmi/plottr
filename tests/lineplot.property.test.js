// Property-based tests for the lineplot data + per-x stats pipeline.
//
// Replaces the prior tests/fuzz/lineplot.fuzz.js. Drives the same chain
// (parseRaw → numeric coercion → computeSeries → computePerXStats) plus
// the SVG / formatting helpers (buildLineD, formatX) under fast-check,
// with the curated CSV-pathology corpus and structural arbitraries from
// tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  isNumericValue,
  computeSeries,
  computePerXStats,
  buildLineD,
  formatX,
} = require("./helpers/lineplot-loader");
const { arbAnyCsv, arbLongCsv } = require("./helpers/csv-arbitraries");

const RUNS = 250;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];
const NO_GROUP_COLORS = {};

function coerceNumericMatrix(rows, nCols) {
  return rows.map((row) => {
    const out = new Array(nCols).fill(null);
    for (let c = 0; c < nCols && c < row.length; c++) {
      const v = row[c];
      if (v === "" || v == null) continue;
      if (!isNumericValue(v)) continue;
      const n = Number(v);
      if (Number.isFinite(n)) out[c] = n;
    }
    return out;
  });
}

// ── parseRaw ───────────────────────────────────────────────────────────

suite("lineplot property — parseRaw");

test("never throws on arbitrary CSV-shaped input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseRaw(text);
      return true;
    })
  );
});

// ── computeSeries ──────────────────────────────────────────────────────

suite("lineplot property — computeSeries");

const arbColIdxTriple = fc
  .tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 0, max: 5 }),
    fc.option(fc.integer({ min: 0, max: 5 }), { nil: null })
  )
  .map(([x, y, g]) => ({ xRaw: x, yRaw: y, gRaw: g }));

function runSeries(text, sel) {
  const p = parseRaw(text);
  if (!p || p.headers.length < 2) return null;
  const nCols = p.headers.length;
  const xCol = sel.xRaw % nCols;
  const yCol = sel.yRaw % nCols;
  const groupCol = sel.gRaw == null ? null : sel.gRaw % nCols;
  const data = coerceNumericMatrix(p.rows, nCols);
  return computeSeries(data, p.rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
}

test("returns an array and never throws", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      return series === null || Array.isArray(series);
    })
  );
});

test("series have unique names", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      const seen = new Set();
      for (const s of series) {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
      }
      return true;
    })
  );
});

test("every series point has finite x and mean", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      for (const s of series) {
        for (const pt of s.points) {
          if (!Number.isFinite(pt.x) || !Number.isFinite(pt.mean)) return false;
        }
      }
      return true;
    })
  );
});

test("series points are strictly ascending in x within each series", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      for (const s of series) {
        for (let i = 1; i < s.points.length; i++) {
          if (s.points[i].x <= s.points[i - 1].x) return false;
        }
      }
      return true;
    })
  );
});

test("each point's n is a positive integer; sd / sem / ci95 are finite ≥ 0", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      for (const s of series) {
        for (const pt of s.points) {
          if (!Number.isInteger(pt.n) || pt.n < 1) return false;
          if (!Number.isFinite(pt.sd) || pt.sd < -1e-9) return false;
          if (!Number.isFinite(pt.sem) || pt.sem < -1e-9) return false;
          if (!Number.isFinite(pt.ci95) || pt.ci95 < -1e-9) return false;
        }
      }
      return true;
    })
  );
});

test("singleton point (n=1) has sd = sem = ci95 = 0", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      for (const s of series) {
        for (const pt of s.points) {
          if (pt.n !== 1) continue;
          if (pt.sd !== 0 || pt.sem !== 0 || pt.ci95 !== 0) return false;
        }
      }
      return true;
    })
  );
});

test("each series carries a string name and color", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      for (const s of series) {
        if (typeof s.name !== "string") return false;
        if (typeof s.color !== "string" || s.color.length === 0) return false;
      }
      return true;
    })
  );
});

// ── computePerXStats ──────────────────────────────────────────────────

suite("lineplot property — computePerXStats");

test("returns an array and never throws", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      return Array.isArray(computePerXStats(series));
    })
  );
});

test("pAdj is null OR finite in [0, 1]", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      const perX = computePerXStats(series);
      for (const r of perX) {
        if (r.pAdj == null) continue;
        if (!Number.isFinite(r.pAdj) || r.pAdj < 0 || r.pAdj > 1 + 1e-9) return false;
      }
      return true;
    })
  );
});

test("p is null OR finite in [0, 1]", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      const perX = computePerXStats(series);
      for (const r of perX) {
        if (r.p == null) continue;
        if (!Number.isFinite(r.p) || r.p < 0 || r.p > 1 + 1e-9) return false;
      }
      return true;
    })
  );
});

test("perX rows are strictly ascending in x", () => {
  check(
    fc.property(arbLongCsv, arbColIdxTriple, (text, sel) => {
      const series = runSeries(text, sel);
      if (!series) return true;
      const perX = computePerXStats(series);
      for (let i = 1; i < perX.length; i++) {
        if (perX[i].x <= perX[i - 1].x) return false;
      }
      return true;
    })
  );
});

// ── computeSeries — boundary fixtures (Stryker-driven gap closure) ────
//
// The property tests above use random fc-generated CSVs which sometimes
// don't reliably hit specific boundaries (n = 1 vs n ≥ 2; out-of-order
// insertion of unique x values). The fixtures below pin those edges
// deterministically so mutations like `n > 1 → false ? ci95 : 0` (which
// would zero out ci95 for n>1) and `[...xSet].sort` removal can't slip
// through.

suite("lineplot property — computeSeries fixtures");

function buildSeriesFromValues(rowsAsValues) {
  // rowsAsValues is an array of [x, y] number pairs; group is implicit
  // single-bucket. computeSeries expects (data, rawData, xCol, yCol,
  // groupCol, groupColors, palette).
  const data = rowsAsValues.map(([x, y]) => [x, y]);
  const rawData = rowsAsValues.map(([x, y]) => [String(x), String(y)]);
  return computeSeries(data, rawData, 0, 1, null, NO_GROUP_COLORS, PALETTE);
}

test("ci95 is strictly positive when n ≥ 2 and sd > 0", () => {
  // Pins the `n > 1 ? ci95 : 0` ternary against the `false ? ci95 : 0`
  // mutation that would always return 0. With a deterministic 5-point
  // fixture (sd > 0), original returns ci95 > 0; mutated returns 0.
  const series = buildSeriesFromValues([
    [1, 1],
    [1, 3],
    [1, 5],
    [1, 7],
    [1, 9],
  ]);
  const pt = series[0].points[0];
  if (pt.n !== 5) throw new Error(`expected n = 5, got ${pt.n}`);
  if (!(pt.sd > 0)) throw new Error(`expected sd > 0, got ${pt.sd}`);
  if (!(pt.ci95 > 0)) throw new Error(`expected ci95 > 0, got ${pt.ci95}`);
});

test("ci95 is computed against (n - 1) df, not (n + 1)", () => {
  // The mutation `tinv(0.975, n - 1) → tinv(0.975, n + 1)` is silent
  // under the "ci95 ≥ 0" property — both df produce positive ci95s.
  // Catching it requires a numerical fixture: for n = 5, sd = √10
  // (the {1,3,5,7,9} fixture above), the original ci95 must equal
  // tinv(0.975, 4) · sd / √5. Hard-code the expected value.
  const series = buildSeriesFromValues([
    [1, 1],
    [1, 3],
    [1, 5],
    [1, 7],
    [1, 9],
  ]);
  const pt = series[0].points[0];
  // sample SD of {1,3,5,7,9} = sqrt(10) ≈ 3.16228
  // sem = sd/sqrt(5) ≈ 1.41421
  // tinv(0.975, 4) ≈ 2.77645
  // ci95 ≈ 2.77645 × 1.41421 ≈ 3.92646
  // The mutation tinv(0.975, n+1=6) ≈ 2.44691 → ci95 ≈ 3.46095. Pin
  // the original value to 3 decimals.
  const expected = 3.926646;
  if (Math.abs(pt.ci95 - expected) > 1e-3) {
    throw new Error(`expected ci95 ≈ ${expected}, got ${pt.ci95}`);
  }
});

test("singleton x bucket (n = 1) has sd = sem = ci95 = 0", () => {
  // Construct a CSV where x = 0 appears exactly once. With n = 1 the
  // ternary `n > 1 ? a : 0` must return 0 for all three error metrics;
  // `n > 1 → true` mutations would re-route through tinv(0.975, 0)
  // producing NaN.
  const series = buildSeriesFromValues([
    [0, 5],
    [1, 1],
    [1, 3],
  ]);
  const pt0 = series[0].points.find((p) => p.x === 0);
  if (!pt0) throw new Error("missing the x=0 singleton point");
  if (pt0.n !== 1) throw new Error(`expected n = 1, got ${pt0.n}`);
  if (pt0.sd !== 0) throw new Error(`expected sd = 0, got ${pt0.sd}`);
  if (pt0.sem !== 0) throw new Error(`expected sem = 0, got ${pt0.sem}`);
  if (pt0.ci95 !== 0) throw new Error(`expected ci95 = 0, got ${pt0.ci95}`);
});

test("series points are ascending in x even when input rows arrive in arbitrary order", () => {
  // Pins the `[...xSet].sort((a, b) => a - b)` step in computeSeries
  // against mutations that drop the sort or swap the comparator. The
  // Set's iteration order matches *insertion* order, so non-ascending
  // input rows would produce non-ascending points without the explicit
  // sort. Rows are deliberately scrambled; insertion order would be
  // [3, 1, 4, 2] but the output must be sorted to [1, 2, 3, 4].
  const series = buildSeriesFromValues([
    [3, 30],
    [1, 10],
    [4, 40],
    [2, 20],
  ]);
  const xs = series[0].points.map((p) => p.x);
  if (JSON.stringify(xs) !== JSON.stringify([1, 2, 3, 4])) {
    throw new Error(`expected [1,2,3,4], got ${JSON.stringify(xs)}`);
  }
});

test("computePerXStats sets pAdj to null (strict) when the chosen test returns a non-finite p", () => {
  // Pins the line-228 guard `r.result && !r.result.error &&
  // r.result.p != null && Number.isFinite(r.result.p)` against
  // logical-operator mutations that would let invalid results into
  // the BH-adjustment pool. Construct a case where the chosen test
  // legitimately returns NaN p (zero-variance groups → every
  // parametric/rank test treats as degenerate); the original guard
  // rejects the row, so pAdj must stay strictly null.
  //
  // The strict `=== null` check (not `== null`, not `!= null`) is what
  // also pins the line-234 default-init `rows.forEach((r) =>
  // (r.pAdj = null))` against an `() => undefined` mutation. Without
  // the explicit null-init, `r.pAdj` would be `undefined` here, which
  // `== null` accepts loosely but `=== null` rejects.
  const sA = buildSeriesFromValues([
    [1, 5],
    [1, 5],
    [1, 5],
    [2, 5],
    [2, 5],
    [2, 5],
  ])[0];
  const sB = buildSeriesFromValues([
    [1, 5],
    [1, 5],
    [1, 5],
    [2, 5],
    [2, 5],
    [2, 5],
  ])[0];
  const perX = computePerXStats([sA, sB]);
  for (const row of perX) {
    if (row.pAdj !== null) {
      throw new Error(
        `expected pAdj === null at x=${row.x} (zero-variance result), got ${row.pAdj}`
      );
    }
  }
});

test("computePerXStats rows are sorted by x when series insertion order is non-ascending", () => {
  // Pins the `[...xSet].sort((a, b) => a - b)` step in *computePerXStats*
  // (line 205), distinct from computeSeries' own sort. computeSeries
  // sorts each series internally, so a fixture with two equally-shaped
  // series doesn't trigger the perX sort — both contribute x values in
  // the same ascending order, and Set insertion is already monotone.
  //
  // To force a non-ascending Set insertion order: use three series
  // where the first has only the *largest* x. xSet adds 5 first (from
  // sA), then 1 (from sB, new) — so iteration order becomes [5, 1].
  // With the original sort, perX returns rows ordered [1, 5]; with the
  // sort dropped or mis-comparator'd, it returns [5, 1].
  const sA = buildSeriesFromValues([
    [5, 50],
    [5, 51],
  ])[0];
  const sB = buildSeriesFromValues([
    [1, 10],
    [1, 11],
    [5, 52],
    [5, 53],
  ])[0];
  const sC = buildSeriesFromValues([
    [1, 12],
    [1, 13],
    [5, 54],
    [5, 55],
  ])[0];
  const perX = computePerXStats([sA, sB, sC]);
  const xs = perX.map((r) => r.x);
  if (JSON.stringify(xs) !== JSON.stringify([1, 5])) {
    throw new Error(`expected [1, 5], got ${JSON.stringify(xs)}`);
  }
});

// ── buildLineD ─────────────────────────────────────────────────────────

suite("lineplot property — buildLineD");

const arbLinePoint = fc.record({
  x: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  y: fc.option(fc.double({ noNaN: true, noDefaultInfinity: true }), { nil: null }),
});

test("always returns a string", () => {
  check(
    fc.property(fc.array(arbLinePoint, { maxLength: 30 }), (pts) => {
      return typeof buildLineD(pts) === "string";
    })
  );
});

test("output has no NaN substring when all input ys are finite", () => {
  check(
    fc.property(
      fc.array(
        fc.record({
          x: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          y: fc.double({ noNaN: true, noDefaultInfinity: true }),
        }),
        { minLength: 2, maxLength: 20 }
      ),
      (pts) => !/NaN/.test(buildLineD(pts))
    )
  );
});

test("empty / single-point input yields an empty path string", () => {
  check(
    fc.property(fc.array(arbLinePoint, { minLength: 0, maxLength: 1 }), (pts) => {
      return buildLineD(pts) === "";
    })
  );
});

// ── formatX ────────────────────────────────────────────────────────────

suite("lineplot property — formatX");

test("always returns a string", () => {
  check(
    fc.property(
      fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, null, undefined)),
      (v) => typeof formatX(v) === "string"
    )
  );
});

test("integer input round-trips through Number.parseInt", () => {
  check(
    fc.property(fc.integer({ min: -1e6, max: 1e6 }), (v) => {
      const s = formatX(v);
      return Number.parseInt(s, 10) === v;
    })
  );
});

test("non-integer finite input is rounded to 4 decimal places", () => {
  check(
    fc.property(fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }), (v) => {
      const s = formatX(v);
      // No more than 4 decimal places after the dot.
      const dot = s.indexOf(".");
      if (dot < 0) return true;
      return s.length - dot - 1 <= 4;
    })
  );
});

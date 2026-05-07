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

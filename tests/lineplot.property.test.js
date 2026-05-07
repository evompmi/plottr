// Property-based tests for the lineplot data + per-x stats pipeline.
//
// Replaces the prior tests/fuzz/lineplot.fuzz.js. Drives the same chain
// (parseRaw → numeric coercion → computeSeries → computePerXStats)
// under fast-check, with the curated CSV-pathology corpus and
// structural arbitraries from tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  isNumericValue,
  computeSeries,
  computePerXStats,
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

test("returns an array and never throws", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
      (text, xRaw, yRaw, gRaw) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 2) return true;
        const nCols = p.headers.length;
        const xCol = xRaw % nCols;
        const yCol = yRaw % nCols;
        const groupCol = gRaw == null ? null : gRaw % nCols;
        const data = coerceNumericMatrix(p.rows, nCols);
        const series = computeSeries(data, p.rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
        return Array.isArray(series);
      }
    )
  );
});

test("every series point has finite x and mean", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
      (text, xRaw, yRaw, gRaw) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 2) return true;
        const nCols = p.headers.length;
        const xCol = xRaw % nCols;
        const yCol = yRaw % nCols;
        const groupCol = gRaw == null ? null : gRaw % nCols;
        const data = coerceNumericMatrix(p.rows, nCols);
        const series = computeSeries(data, p.rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
        for (const s of series) {
          for (const pt of s.points) {
            if (!Number.isFinite(pt.x) || !Number.isFinite(pt.mean)) return false;
          }
        }
        return true;
      }
    )
  );
});

test("series points are sorted by x within each series", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
      (text, xRaw, yRaw, gRaw) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 2) return true;
        const nCols = p.headers.length;
        const xCol = xRaw % nCols;
        const yCol = yRaw % nCols;
        const groupCol = gRaw == null ? null : gRaw % nCols;
        const data = coerceNumericMatrix(p.rows, nCols);
        const series = computeSeries(data, p.rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
        for (const s of series) {
          for (let i = 1; i < s.points.length; i++) {
            if (s.points[i].x < s.points[i - 1].x) return false;
          }
        }
        return true;
      }
    )
  );
});

// ── computePerXStats ──────────────────────────────────────────────────

suite("lineplot property — computePerXStats");

test("returns an array and never throws", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
      (text, xRaw, yRaw, gRaw) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 2) return true;
        const nCols = p.headers.length;
        const xCol = xRaw % nCols;
        const yCol = yRaw % nCols;
        const groupCol = gRaw == null ? null : gRaw % nCols;
        const data = coerceNumericMatrix(p.rows, nCols);
        const series = computeSeries(data, p.rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
        const perX = computePerXStats(series);
        return Array.isArray(perX);
      }
    )
  );
});

test("pAdj is null OR finite in [0, 1]", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
      (text, xRaw, yRaw, gRaw) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 2) return true;
        const nCols = p.headers.length;
        const xCol = xRaw % nCols;
        const yCol = yRaw % nCols;
        const groupCol = gRaw == null ? null : gRaw % nCols;
        const data = coerceNumericMatrix(p.rows, nCols);
        const series = computeSeries(data, p.rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
        const perX = computePerXStats(series);
        for (const r of perX) {
          if (r.pAdj == null) continue;
          if (!Number.isFinite(r.pAdj) || r.pAdj < 0 || r.pAdj > 1 + 1e-9) return false;
        }
        return true;
      }
    )
  );
});

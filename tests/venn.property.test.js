// Property-based tests for the venn data + geometry pipeline.
//
// Replaces the prior tests/fuzz/venn.fuzz.js. Two independent property
// suites mirror the harness's two loops:
//
//   1. Text → parseRaw → parseSetData → computeIntersections.
//      Invariants: each region mask is a unique bitmask of the active
//      sets; size === items.length; items is sorted; correct number of
//      regions for n sets ((1 << n) − 1).
//
//   2. Random-geometry → circleOverlapArea / solveDistance /
//      buildRegionPaths / computeAllRegionAreas. Generators bias toward
//      degenerate configs (tangency, containment, near-coincident
//      centres, zero-radius) — the same ones the prior fuzz exercised
//      because they have measure zero under uniform sampling.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  parseSetData,
  computeIntersections,
  circleOverlapArea,
  solveDistance,
  buildRegionPaths,
  computeAllRegionAreas,
} = require("./helpers/venn-loader");
const { arbAnyCsv, arbSetCsv } = require("./helpers/csv-arbitraries");

const RUNS = 300;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

// ── Loop 1: text → set membership ───────────────────────────────────────

suite("venn property — set membership");

test("parseRaw never throws on arbitrary CSV input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseRaw(text);
      return true;
    })
  );
});

test("parseSetData never throws on parseRaw output", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const r = parseSetData(headers, p.rows);
      return r != null && Array.isArray(r.setNames);
    })
  );
});

test("computeIntersections returns the correct number of regions ((1<<n)-1)", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const regions = computeIntersections(setData.setNames, setData.sets);
      const n = setData.setNames.length;
      return Array.isArray(regions) && regions.length === (1 << n) - 1;
    })
  );
});

test("region masks are unique positive integers in (0, 1<<n − 1]", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const regions = computeIntersections(setData.setNames, setData.sets);
      const n = setData.setNames.length;
      const max = (1 << n) - 1;
      const seen = new Set();
      for (const r of regions) {
        if (!Number.isInteger(r.mask) || r.mask <= 0 || r.mask > max) return false;
        if (seen.has(r.mask)) return false;
        seen.add(r.mask);
      }
      return true;
    })
  );
});

test("region size equals items.length", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const regions = computeIntersections(setData.setNames, setData.sets);
      for (const r of regions) {
        if (!Array.isArray(r.items)) return false;
        if (r.size !== r.items.length) return false;
      }
      return true;
    })
  );
});

// ── Loop 2: random-geometry ─────────────────────────────────────────────

suite("venn property — geometry");

const arbCircle = fc.record({
  cx: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
  cy: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
  r: fc.double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true }),
});

// Bias toward degenerate configurations: a uniform sample misses
// tangency / containment / near-coincident-centres because they have
// measure zero. Mirror the prior fuzz harness's distribution.
const arbDegenerate2 = fc
  .double({ min: 5, max: 25, noNaN: true, noDefaultInfinity: true })
  .map((r) => [
    { cx: 0, cy: 0, r },
    { cx: r + r, cy: 0, r }, // tangent pair
  ]);

const arbContained2 = fc.constant([
  { cx: 0, cy: 0, r: 30 },
  { cx: 5, cy: 0, r: 5 },
]);

const arbCoincident2 = fc.constant([
  { cx: 0, cy: 0, r: 10 },
  { cx: 0.001, cy: 0.001, r: 8 },
]);

const arbZeroRadius2 = fc.constant([
  { cx: 0, cy: 0, r: 0 },
  { cx: 10, cy: 0, r: 5 },
]);

const arbCircles2 = fc.oneof(
  { weight: 60, arbitrary: fc.array(arbCircle, { minLength: 2, maxLength: 2 }) },
  { weight: 10, arbitrary: arbDegenerate2 },
  { weight: 10, arbitrary: arbContained2 },
  { weight: 10, arbitrary: arbCoincident2 },
  { weight: 10, arbitrary: arbZeroRadius2 }
);

const arbCircles3 = fc.array(arbCircle, { minLength: 3, maxLength: 3 });

test("circleOverlapArea is finite ≥ 0 and ≤ π·min(r)² for any pair", () => {
  check(
    fc.property(arbCircles2, (circles) => {
      const [a, b] = circles;
      const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const area = circleOverlapArea(a.r, b.r, d);
      if (!Number.isFinite(area)) return false;
      if (area < -1e-9) return false;
      const maxPossible = Math.PI * Math.min(a.r, b.r) ** 2;
      if (area > maxPossible + 1e-6) return false;
      return true;
    })
  );
});

test("circleOverlapArea is symmetric in r1 / r2", () => {
  check(
    fc.property(arbCircles2, (circles) => {
      const [a, b] = circles;
      const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const ab = circleOverlapArea(a.r, b.r, d);
      const ba = circleOverlapArea(b.r, a.r, d);
      return Math.abs(ab - ba) < 1e-9;
    })
  );
});

test("solveDistance returns a finite non-negative distance for in-range targets", () => {
  check(
    fc.property(
      fc.double({ min: 1, max: 25, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1, max: 25, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 1.05, noNaN: true, noDefaultInfinity: true }),
      (r1, r2, frac) => {
        const maxA = Math.PI * Math.min(r1, r2) ** 2;
        const target = frac * maxA;
        const d = solveDistance(r1, r2, target);
        return Number.isFinite(d) && d >= 0;
      }
    )
  );
});

test("buildRegionPaths returns an object of strings (no NaN in path data)", () => {
  check(
    fc.property(fc.oneof(arbCircles2, arbCircles3), (circles) => {
      const paths = buildRegionPaths(circles);
      if (!paths || typeof paths !== "object") return false;
      for (const p of Object.values(paths)) {
        if (typeof p !== "string") return false;
        if (/NaN/.test(p)) return false;
      }
      return true;
    })
  );
});

test("computeAllRegionAreas yields finite non-negative areas ≤ π·max(r)²", () => {
  check(
    fc.property(fc.oneof(arbCircles2, arbCircles3), (circles) => {
      const areas = computeAllRegionAreas(circles);
      const maxCircle = Math.max(...circles.map((c) => Math.PI * c.r * c.r));
      for (const [, a] of areas) {
        if (!Number.isFinite(a)) return false;
        if (a < -1e-9) return false;
        if (a > maxCircle + 1e-6) return false;
      }
      return true;
    })
  );
});

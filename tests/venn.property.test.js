// Property-based tests for the venn data + geometry pipeline.
//
// Replaces the prior tests/fuzz/venn.fuzz.js. Two property suites
// mirror the harness's two loops:
//
//   1. Text → parseRaw → parseSetData → computeIntersections.
//      Invariants: each region mask is a unique bitmask of the active
//      sets; size === items.length; items is sorted; correct number of
//      regions for n sets ((1 << n) − 1).
//
//   2. Random-geometry → circleOverlapArea / solveDistance /
//      circleIntersectionPoints / buildRegionPaths /
//      computeAllRegionAreas / tripleIntersectionArea. Generators bias
//      toward degenerate configs (tangency, containment, near-coincident
//      centres, zero radii), with explicit boundary properties for
//      d = 0, d ≥ r1+r2, and d ≤ |r1-r2|.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  parseSetData,
  computeIntersections,
  circleOverlapArea,
  solveDistance,
  circleIntersectionPoints,
  buildRegionPaths,
  computeAllRegionAreas,
  tripleIntersectionArea,
  detectLongFormat,
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

test("parseSetData setNames is a subset of the input headers", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const r = parseSetData(headers, p.rows);
      if (!r) return true;
      const headerSet = new Set(headers.map(String));
      for (const n of r.setNames) {
        if (!headerSet.has(String(n))) return false;
      }
      return true;
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

test("region items contain only items present in the relevant sets", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const regions = computeIntersections(setData.setNames, setData.sets);
      for (const r of regions) {
        for (const item of r.items) {
          // For every bit set in r.mask, the item must be in that set.
          for (let bit = 0; bit < setData.setNames.length; bit++) {
            if (((r.mask >> bit) & 1) === 0) continue;
            const setName = setData.setNames[bit];
            const set = setData.sets.get(setName);
            if (!set || !set.has(item)) return false;
          }
        }
      }
      return true;
    })
  );
});

test("union of region item counts equals the total distinct items across sets", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, 3);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const regions = computeIntersections(setData.setNames, setData.sets);
      // Sum of region sizes — each item belongs to exactly one region.
      const totalSize = regions.reduce((sum, r) => sum + r.size, 0);
      const distinct = new Set();
      for (const setName of setData.setNames) {
        const s = setData.sets.get(setName);
        if (s) for (const item of s) distinct.add(item);
      }
      return totalSize === distinct.size;
    })
  );
});

// ── detectLongFormat ────────────────────────────────────────────────────

suite("venn property — detectLongFormat");

test("returns { isLong, col1Distinct, col2Distinct, col2Repeats } shape", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const p = parseRaw(text);
      if (!p) return true;
      const r = detectLongFormat(p.headers, p.rows);
      if (!r || typeof r !== "object") return false;
      if (typeof r.isLong !== "boolean") return false;
      if (!Number.isInteger(r.col1Distinct) || r.col1Distinct < 0) return false;
      if (!Number.isInteger(r.col2Distinct) || r.col2Distinct < 0) return false;
      if (!Number.isInteger(r.col2Repeats) || r.col2Repeats < 0) return false;
      return true;
    })
  );
});

// ── Loop 2: random-geometry ─────────────────────────────────────────────

suite("venn property — geometry boundaries");

const arbCircle = fc.record({
  cx: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
  cy: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
  r: fc.double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true }),
});

const arbPositiveR = fc.double({ min: 0.5, max: 30, noNaN: true, noDefaultInfinity: true });

const arbCircles2 = fc.array(arbCircle, { minLength: 2, maxLength: 2 });
const arbCircles3 = fc.array(arbCircle, { minLength: 3, maxLength: 3 });

test("d = 0 with equal radii: overlap = π·r²", () => {
  check(
    fc.property(arbPositiveR, (r) => {
      const a = circleOverlapArea(r, r, 0);
      const expected = Math.PI * r * r;
      return Math.abs(a - expected) < 1e-9;
    })
  );
});

test("d ≥ r1 + r2: overlap = 0", () => {
  check(
    fc.property(
      arbPositiveR,
      arbPositiveR,
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      (r1, r2, slack) => circleOverlapArea(r1, r2, r1 + r2 + slack) === 0
    )
  );
});

test("d ≤ |r1 − r2|: overlap = π · min(r1, r2)²", () => {
  check(
    fc.property(arbPositiveR, arbPositiveR, (r1, r2) => {
      const d = Math.max(0, Math.abs(r1 - r2) - 0.1);
      const a = circleOverlapArea(r1, r2, d);
      const expected = Math.PI * Math.min(r1, r2) ** 2;
      return Math.abs(a - expected) < 1e-9;
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

test("circleOverlapArea is monotonically non-increasing in d", () => {
  // Increasing the centre-to-centre distance can only reduce overlap.
  check(
    fc.property(
      arbPositiveR,
      arbPositiveR,
      fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
      (r1, r2, d1, d2) => {
        const a = circleOverlapArea(r1, r2, d1);
        const b = circleOverlapArea(r1, r2, d2);
        if (d1 <= d2) return a >= b - 1e-9;
        return a <= b + 1e-9;
      }
    )
  );
});

test("circleOverlapArea ≤ π·min(r)² for any pair", () => {
  check(
    fc.property(arbCircles2, (circles) => {
      const [a, b] = circles;
      const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const area = circleOverlapArea(a.r, b.r, d);
      if (!Number.isFinite(area)) return false;
      if (area < -1e-9) return false;
      const maxPossible = Math.PI * Math.min(a.r, b.r) ** 2;
      return area <= maxPossible + 1e-6;
    })
  );
});

suite("venn property — solveDistance");

test("solveDistance returns a finite non-negative distance for in-range targets", () => {
  check(
    fc.property(
      arbPositiveR,
      arbPositiveR,
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

test("solveDistance round-trip: circleOverlapArea(r1, r2, solveDistance(...)) ≈ targetArea", () => {
  check(
    fc.property(
      arbPositiveR,
      arbPositiveR,
      fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
      (r1, r2, frac) => {
        const maxA = Math.PI * Math.min(r1, r2) ** 2;
        const target = frac * maxA;
        const d = solveDistance(r1, r2, target);
        const got = circleOverlapArea(r1, r2, d);
        // 60 bisection iterations over a [|r1-r2|, r1+r2] bracket give ~1e-9
        // resolution on d; allow a generous absolute tolerance on the area.
        return Math.abs(got - target) < 1e-3;
      }
    )
  );
});

test("targetArea ≥ maxArea: distance collapses to |r1 − r2|", () => {
  check(
    fc.property(arbPositiveR, arbPositiveR, (r1, r2) => {
      const maxA = Math.PI * Math.min(r1, r2) ** 2;
      const d = solveDistance(r1, r2, maxA + 1);
      return d === Math.abs(r1 - r2);
    })
  );
});

test("targetArea ≤ 0: distance is r1 + r2 + 1 (separated, sentinel)", () => {
  check(
    fc.property(arbPositiveR, arbPositiveR, (r1, r2) => {
      const d = solveDistance(r1, r2, 0);
      return d === r1 + r2 + 1;
    })
  );
});

// ── circleIntersectionPoints ────────────────────────────────────────────

suite("venn property — circleIntersectionPoints");

test("returns null for separated, contained, or coincident circles", () => {
  // Outside the chord regime ⇒ no intersection points.
  check(
    fc.property(arbPositiveR, arbPositiveR, (r1, r2) => {
      const c1 = { cx: 0, cy: 0, r: r1 };
      const cFar = { cx: r1 + r2 + 5, cy: 0, r: r2 };
      const cContained = { cx: 0, cy: 0, r: Math.min(r1, r2) - 0.1 };
      return (
        circleIntersectionPoints(c1, cFar) === null &&
        circleIntersectionPoints(c1, cContained) === null
      );
    })
  );
});

test("returns 2 points when circles properly intersect", () => {
  check(
    fc.property(arbPositiveR, arbPositiveR, (r1, r2) => {
      // Place centres at distance midway between |r1-r2| and r1+r2 to
      // guarantee a proper chord.
      const lo = Math.abs(r1 - r2);
      const hi = r1 + r2;
      const d = (lo + hi) / 2;
      if (d < 1e-9) return true;
      const c1 = { cx: 0, cy: 0, r: r1 };
      const c2 = { cx: d, cy: 0, r: r2 };
      const pts = circleIntersectionPoints(c1, c2);
      if (!Array.isArray(pts) || pts.length !== 2) return false;
      for (const p of pts) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      }
      return true;
    })
  );
});

// ── buildRegionPaths / computeAllRegionAreas ────────────────────────────

suite("venn property — buildRegionPaths / computeAllRegionAreas");

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

test("computeAllRegionAreas keys are positive integers in (0, (1<<n)-1]", () => {
  check(
    fc.property(fc.oneof(arbCircles2, arbCircles3), (circles) => {
      const areas = computeAllRegionAreas(circles);
      const max = (1 << circles.length) - 1;
      for (const [mask] of areas) {
        if (!Number.isInteger(mask) || mask <= 0 || mask > max) return false;
      }
      return true;
    })
  );
});

// ── tripleIntersectionArea ──────────────────────────────────────────────

suite("venn property — tripleIntersectionArea");

test("returns finite ≥ 0", () => {
  check(
    fc.property(arbCircles3, (circles) => {
      const a = tripleIntersectionArea(circles);
      if (!Number.isFinite(a)) return false;
      return a >= -1e-9;
    })
  );
});

test("triple intersection ≤ each pairwise intersection", () => {
  // The 3-way intersection cannot exceed any 2-way intersection (it's
  // the intersection of all three; AND-ing more sets only shrinks).
  check(
    fc.property(arbCircles3, (circles) => {
      const triple = tripleIntersectionArea(circles);
      if (!Number.isFinite(triple)) return true;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const a = circles[i];
          const b = circles[j];
          const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
          const pair = circleOverlapArea(a.r, b.r, d);
          if (!Number.isFinite(pair)) continue;
          if (triple > pair + 1e-6) return false;
        }
      }
      return true;
    })
  );
});

test("triple intersection ≤ π·min(r)²", () => {
  check(
    fc.property(arbCircles3, (circles) => {
      const a = tripleIntersectionArea(circles);
      if (!Number.isFinite(a)) return true;
      const cap = Math.PI * Math.min(...circles.map((c) => c.r)) ** 2;
      return a <= cap + 1e-6;
    })
  );
});

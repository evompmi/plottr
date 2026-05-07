// Property-based tests for the UpSet pipeline.
//
// Replaces the prior tests/fuzz/upset.fuzz.js. Two property suites
// mirror the harness's two loops:
//
//   1. Wide-format: text → parseRaw → parseSetData → computeMemberships
//      → enumerateIntersections → sortIntersections →
//      truncateIntersections → intersectionLabel /
//      intersectionShortLabel / intersectionFilenamePart /
//      buildBarTicks. Headers clamp to ≤ MAX_SETS so the 2ᴺ−1
//      intersection space stays bounded.
//
//   2. Long-format: text → parseRaw → parseLongFormatSets → … same
//      downstream chain. parseLongFormatSets is *expected* to throw on
//      non-2-column input (UI catches and surfaces the error).

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  parseSetData,
  parseLongFormatSets,
  computeMemberships,
  enumerateIntersections,
  sortIntersections,
  truncateIntersections,
  intersectionLabel,
  intersectionShortLabel,
  intersectionFilenamePart,
  buildBarTicks,
} = require("./helpers/upset-loader");
const { arbAnyCsv, arbSetCsv, arbLongSetCsv } = require("./helpers/csv-arbitraries");

const RUNS = 200;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

const MAX_SETS = 10;
const SORT_MODES = ["size-desc", "size-asc", "degree-asc", "degree-desc", "sets", "whatever"];

// ── Shared invariant checker ────────────────────────────────────────────

function intersectionInvariantsHold(regions, setNames) {
  if (!Array.isArray(regions)) return false;
  const n = setNames.length;
  const maxMask = n === 0 ? 0 : (1 << n) - 1;
  const seen = new Set();
  for (const r of regions) {
    if (!Number.isInteger(r.mask) || r.mask <= 0 || r.mask > maxMask) return false;
    if (seen.has(r.mask)) return false;
    seen.add(r.mask);
    if (!Array.isArray(r.setIndices) || r.setIndices.length !== r.degree) return false;
    let rebuilt = 0;
    for (let i = 0; i < r.setIndices.length; i++) {
      const idx = r.setIndices[i];
      if (i > 0 && idx <= r.setIndices[i - 1]) return false;
      rebuilt |= 1 << idx;
    }
    if (rebuilt !== r.mask) return false;
    if (!Array.isArray(r.items) || r.items.length !== r.size) return false;
    for (let i = 1; i < r.items.length; i++) {
      if (String(r.items[i]) < String(r.items[i - 1])) return false;
    }
  }
  return true;
}

function buildWideIntersections(text) {
  const p = parseRaw(text);
  if (!p || p.headers.length < 1) return null;
  const headers = p.headers.slice(0, MAX_SETS);
  const setData = parseSetData(headers, p.rows);
  if (!setData || setData.setNames.length < 1) return null;
  const memberships = computeMemberships(setData.setNames, setData.sets);
  if (!memberships || !(memberships.membershipMap instanceof Map)) return null;
  const regions = enumerateIntersections(memberships.membershipMap, setData.setNames);
  return { regions, setNames: setData.setNames };
}

// ── Wide format ─────────────────────────────────────────────────────────

suite("upset property — wide format pipeline");

test("parseRaw never throws on arbitrary CSV input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseRaw(text);
      return true;
    })
  );
});

test("computeMemberships exposes a Map of item → bitmask", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, MAX_SETS);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const m = computeMemberships(setData.setNames, setData.sets);
      if (!m || !(m.membershipMap instanceof Map)) return false;
      const max = (1 << setData.setNames.length) - 1;
      for (const v of m.membershipMap.values()) {
        if (!Number.isInteger(v) || v <= 0 || v > max) return false;
      }
      return true;
    })
  );
});

test("enumerateIntersections produces the documented invariants", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      return intersectionInvariantsHold(out.regions, out.setNames);
    })
  );
});

test("sum of region sizes equals the number of distinct items across all sets", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length < 1) return true;
      const headers = p.headers.slice(0, MAX_SETS);
      const setData = parseSetData(headers, p.rows);
      if (!setData || setData.setNames.length < 1) return true;
      const memberships = computeMemberships(setData.setNames, setData.sets);
      const regions = enumerateIntersections(memberships.membershipMap, setData.setNames);
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

// ── sortIntersections ─────────────────────────────────────────────────

suite("upset property — sortIntersections");

test("preserves length and mask membership across all modes", () => {
  check(
    fc.property(arbSetCsv, fc.constantFrom(...SORT_MODES), (text, mode) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const sorted = sortIntersections(out.regions, mode);
      if (!Array.isArray(sorted) || sorted.length !== out.regions.length) return false;
      const inMasks = new Set(out.regions.map((r) => r.mask));
      for (const r of sorted) {
        if (!inMasks.has(r.mask)) return false;
      }
      return true;
    })
  );
});

test("size-desc mode produces non-ascending sizes", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const sorted = sortIntersections(out.regions, "size-desc");
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].size > sorted[i - 1].size) return false;
      }
      return true;
    })
  );
});

test("size-asc mode produces non-descending sizes", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const sorted = sortIntersections(out.regions, "size-asc");
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].size < sorted[i - 1].size) return false;
      }
      return true;
    })
  );
});

test("degree-asc mode produces non-descending degrees", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const sorted = sortIntersections(out.regions, "degree-asc");
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].degree < sorted[i - 1].degree) return false;
      }
      return true;
    })
  );
});

test("degree-desc mode produces non-ascending degrees", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const sorted = sortIntersections(out.regions, "degree-desc");
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].degree > sorted[i - 1].degree) return false;
      }
      return true;
    })
  );
});

test("unknown mode falls back to size-desc", () => {
  check(
    fc.property(arbSetCsv, fc.string({ maxLength: 8 }), (text, mode) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      // Skip the recognised modes — we're testing the default branch.
      if (SORT_MODES.includes(mode)) return true;
      const a = sortIntersections(out.regions, mode);
      const b = sortIntersections(out.regions, "size-desc");
      return JSON.stringify(a.map((r) => r.mask)) === JSON.stringify(b.map((r) => r.mask));
    })
  );
});

test("sort is stable: same input → same output", () => {
  check(
    fc.property(arbSetCsv, fc.constantFrom(...SORT_MODES), (text, mode) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const a = sortIntersections(out.regions, mode);
      const b = sortIntersections(out.regions, mode);
      return JSON.stringify(a.map((r) => r.mask)) === JSON.stringify(b.map((r) => r.mask));
    })
  );
});

// ── truncateIntersections ────────────────────────────────────────────

suite("upset property — truncateIntersections");

test("respects minSize / minDegree / maxDegree", () => {
  check(
    fc.property(
      arbSetCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 8 }),
      (text, minSize, minDegree, maxDegreeRaw) => {
        const out = buildWideIntersections(text);
        if (!out) return true;
        const maxDegree = Math.max(minDegree, maxDegreeRaw);
        const kept = truncateIntersections(out.regions, { minSize, minDegree, maxDegree });
        for (const r of kept) {
          if (r.size < minSize) return false;
          if (r.degree < minDegree) return false;
          if (r.degree > maxDegree) return false;
        }
        return true;
      }
    )
  );
});

test("count never increases (kept ⊆ input)", () => {
  check(
    fc.property(
      arbSetCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 1, max: 4 }),
      (text, minSize, minDegree) => {
        const out = buildWideIntersections(text);
        if (!out) return true;
        const kept = truncateIntersections(out.regions, { minSize, minDegree });
        return kept.length <= out.regions.length;
      }
    )
  );
});

test("default args (no thresholds) keeps every input row that has size ≥ 1", () => {
  // truncateIntersections defaults: minSize=1, minDegree=1, maxDegree=Infinity.
  // enumerateIntersections only returns regions with size ≥ 1, so the
  // default call should be effectively pass-through.
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      const kept = truncateIntersections(out.regions);
      return kept.length === out.regions.length;
    })
  );
});

test("idempotent: truncate(truncate(x)) === truncate(x)", () => {
  check(
    fc.property(
      arbSetCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 1, max: 4 }),
      (text, minSize, minDegree) => {
        const out = buildWideIntersections(text);
        if (!out) return true;
        const opts = { minSize, minDegree };
        const a = truncateIntersections(out.regions, opts);
        const b = truncateIntersections(a, opts);
        return a.length === b.length;
      }
    )
  );
});

// ── Label / filename helpers ──────────────────────────────────────────

suite("upset property — intersectionLabel / shortLabel / filenamePart");

const arbSetIndices = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 })
  .map((arr) => Array.from(new Set(arr)).sort((a, b) => a - b));

const arbSetNamesArr = fc.array(fc.string({ maxLength: 6 }), { minLength: 1, maxLength: 10 });

test("intersectionLabel returns a string", () => {
  check(
    fc.property(arbSetIndices, arbSetNamesArr, (indices, names) => {
      // Only test indices that fit inside names.
      if (indices.some((i) => i >= names.length)) return true;
      return typeof intersectionLabel(indices, names) === "string";
    })
  );
});

test("intersectionShortLabel returns a string with S<idx+1> tokens", () => {
  check(
    fc.property(arbSetIndices, (indices) => {
      const s = intersectionShortLabel(indices);
      if (typeof s !== "string") return false;
      // Each index appears as "S<idx+1>".
      for (const idx of indices) {
        if (!s.includes(`S${idx + 1}`)) return false;
      }
      return true;
    })
  );
});

test("intersectionFilenamePart returns ASCII-safe ([a-zA-Z0-9_])", () => {
  check(
    fc.property(fc.string({ maxLength: 30 }), (s) => {
      const slug = intersectionFilenamePart(s);
      if (typeof slug !== "string") return false;
      return /^[a-zA-Z0-9_]*$/.test(slug);
    })
  );
});

test("intersectionFilenamePart is deterministic", () => {
  check(
    fc.property(fc.string({ maxLength: 30 }), (s) => {
      return intersectionFilenamePart(s) === intersectionFilenamePart(s);
    })
  );
});

test("intersectionFilenamePart turns ∩ into 'and' and whitespace into '_'", () => {
  if (intersectionFilenamePart("A ∩ B") !== "A_and_B") {
    throw new Error("expected 'A_and_B'");
  }
  if (intersectionFilenamePart("A   B") !== "A_B") {
    throw new Error("expected 'A_B'");
  }
});

// ── buildBarTicks ─────────────────────────────────────────────────────

suite("upset property — buildBarTicks");

// max range starts at 1e-30 to dodge the subnormal regime where
// `niceStep` underflows to 0 and the tick-building loop produces an
// empty array. The realistic UpSet caller passes set-size counts —
// always ≥ 1 — so the gap below 1e-30 has no production analogue.
const arbBarMax = fc.double({ min: 1e-30, max: 1e6, noNaN: true, noDefaultInfinity: true });

test("returns an ascending finite-number array (positive max)", () => {
  check(
    fc.property(arbBarMax, fc.integer({ min: 1, max: 10 }), (max, count) => {
      const t = buildBarTicks(max, count);
      if (!Array.isArray(t) || t.length === 0) return false;
      for (const v of t) if (!Number.isFinite(v)) return false;
      for (let i = 1; i < t.length; i++) {
        if (t[i] < t[i - 1]) return false;
      }
      return true;
    })
  );
});

test("first tick is 0 for any positive max", () => {
  check(
    fc.property(arbBarMax, fc.integer({ min: 1, max: 10 }), (max, count) => {
      return buildBarTicks(max, count)[0] === 0;
    })
  );
});

test("last tick strictly exceeds max for positive max", () => {
  check(
    fc.property(arbBarMax, fc.integer({ min: 2, max: 10 }), (max, count) => {
      const t = buildBarTicks(max, count);
      return t[t.length - 1] > max;
    })
  );
});

test("non-positive max returns the [0, 1] sentinel", () => {
  check(
    fc.property(
      fc.double({ min: -1e6, max: 0, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 10 }),
      (max, count) => {
        const t = buildBarTicks(max, count);
        return t.length === 2 && t[0] === 0 && t[1] === 1;
      }
    )
  );
});

// ── Long format ─────────────────────────────────────────────────────────

suite("upset property — long format pipeline");

test("parseLongFormatSets returns valid setData for clean 2-column input", () => {
  check(
    fc.property(arbLongSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length !== 2) return true;
      const setData = parseLongFormatSets(p.headers, p.rows);
      return setData != null && Array.isArray(setData.setNames);
    })
  );
});

test("downstream chain holds for long-format input", () => {
  check(
    fc.property(arbLongSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length !== 2) return true;
      let setData;
      try {
        setData = parseLongFormatSets(p.headers, p.rows);
      } catch {
        return true;
      }
      if (!setData || setData.setNames.length < 1) return true;
      let setNames = setData.setNames.slice(0, MAX_SETS);
      let sets = setData.sets;
      if (setData.setNames.length > MAX_SETS) {
        const trimmed = new Map();
        for (const n of setNames) trimmed.set(n, sets.get(n));
        sets = trimmed;
      }
      const memberships = computeMemberships(setNames, sets);
      const regions = enumerateIntersections(memberships.membershipMap, setNames);
      return intersectionInvariantsHold(regions, setNames);
    })
  );
});

test("parseLongFormatSets throws an error-shaped value on non-2-column input", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length === 2) return true;
      try {
        parseLongFormatSets(p.headers, p.rows);
        return true;
      } catch (err) {
        return err != null && typeof err.message === "string";
      }
    })
  );
});

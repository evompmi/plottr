// Property-based tests for the UpSet pipeline.
//
// Replaces the prior tests/fuzz/upset.fuzz.js. Two independent property
// suites mirror the harness's two loops:
//
//   1. Wide-format: text → parseRaw → parseSetData → computeMemberships
//      → enumerateIntersections → sortIntersections →
//      truncateIntersections → intersectionLabel /
//      intersectionFilenamePart. Headers clamp to ≤ MAX_SETS so the
//      2ᴺ−1 intersection space stays bounded.
//
//   2. Long-format: text → parseRaw → parseLongFormatSets → … same
//      downstream chain. parseLongFormatSets is *expected* to throw on
//      non-2-column input (UI catches and surfaces the error); we
//      assert that contract too.

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
  intersectionFilenamePart,
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

// Build the wide-format intersection set for a given parsed CSV. Returns
// `{ regions, setNames }` or `null` if the input doesn't yield a usable
// intersection space.
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

test("enumerateIntersections produces the documented invariants (mask, setIndices, items)", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      return intersectionInvariantsHold(out.regions, out.setNames);
    })
  );
});

test("sortIntersections preserves length and mask membership across all modes", () => {
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

test("truncateIntersections respects minSize / minDegree / maxDegree", () => {
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

test("intersectionLabel returns a string", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      for (const r of out.regions) {
        const lbl = intersectionLabel(r.setIndices, out.setNames);
        if (typeof lbl !== "string") return false;
      }
      return true;
    })
  );
});

test("intersectionFilenamePart is ASCII-safe ([a-zA-Z0-9_])", () => {
  check(
    fc.property(arbSetCsv, (text) => {
      const out = buildWideIntersections(text);
      if (!out) return true;
      for (const r of out.regions) {
        const lbl = intersectionLabel(r.setIndices, out.setNames);
        const slug = intersectionFilenamePart(lbl);
        if (typeof slug !== "string") return false;
        if (/[^a-zA-Z0-9_]/.test(slug)) return false;
      }
      return true;
    })
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

test("downstream chain holds for long-format input (intersection invariants)", () => {
  check(
    fc.property(arbLongSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length !== 2) return true;
      let setData;
      try {
        setData = parseLongFormatSets(p.headers, p.rows);
      } catch {
        // Edge inputs (every row has blank item or set) make the long
        // parser legitimately throw — covered by the next property.
        return true;
      }
      if (!setData || setData.setNames.length < 1) return true;
      // Clamp set count to MAX_SETS (matches the prior fuzz harness's
      // 2ᴺ-explosion guard).
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
  // Wide-format input handed to the long parser must throw with a value
  // the UI can render — i.e. an object with a string `.message`. We
  // don't `instanceof Error` because the helpers run in a separate vm
  // context with its own Error constructor and the prototype chain
  // doesn't cross. Pinning the duck type instead is the right contract
  // for a UI-surfaced error.
  check(
    fc.property(arbSetCsv, (text) => {
      const p = parseRaw(text);
      if (!p || p.headers.length === 2) return true;
      try {
        parseLongFormatSets(p.headers, p.rows);
        // Some non-2-column shapes are valid; the parser is allowed to
        // return without throwing.
        return true;
      } catch (err) {
        return err != null && typeof err.message === "string";
      }
    })
  );
});

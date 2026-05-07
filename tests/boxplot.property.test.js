// Property-based tests for the boxplot data + statistics pipeline.
//
// Replaces the prior tests/fuzz/boxplot.fuzz.js. Drives the same chain
// (parseRaw → bucket-into-groups → quartiles / computeStats / kde →
//  selectTest → tTest|mannWhitneyU|oneWayANOVA|welchANOVA|kruskalWallis →
//  tukeyHSD|gamesHowell|dunnTest → bhAdjust → assignBracketLevels)
// under fast-check, with the curated CSV-pathology corpus and
// structural arbitraries from tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  isNumericValue,
  quartiles,
  computeStats,
  kde,
  selectTest,
  tTest,
  mannWhitneyU,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  tukeyHSD,
  gamesHowell,
  dunnTest,
  bhAdjust,
  assignBracketLevels,
} = require("./helpers/boxplot-loader");
const { arbAnyCsv, arbLongCsv } = require("./helpers/csv-arbitraries");

const RUNS = 300;
const RUNS_HEAVY = 80; // post-hoc + bracket levels are O(k²)

const check = (prop) => fc.assert(prop, { numRuns: RUNS });
const checkHeavy = (prop) => fc.assert(prop, { numRuns: RUNS_HEAVY });

const KNOWN_TESTS = new Set([
  "studentT",
  "welchT",
  "mannWhitney",
  "oneWayANOVA",
  "welchANOVA",
  "kruskalWallis",
]);

// Bucket parsed rows into numeric groups keyed by the group column.
// Mirrors the boxplot tool's intake; capped at 8 groups so the
// downstream O(k²) post-hocs stay cheap.
function bucketGroups(rows, valueIdx, groupIdx, maxGroups = 8) {
  const map = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= Math.max(valueIdx, groupIdx)) continue;
    const rawVal = row[valueIdx];
    if (rawVal === "" || rawVal == null) continue;
    if (!isNumericValue(rawVal)) continue;
    const num = Number(rawVal);
    if (!Number.isFinite(num)) continue;
    const key = String(row[groupIdx] ?? "");
    if (!map.has(key)) {
      if (map.size >= maxGroups) continue;
      map.set(key, []);
    }
    map.get(key).push(num);
  }
  return [...map.values()].filter((g) => g.length >= 1);
}

// ── parseRaw resilience ────────────────────────────────────────────────

suite("boxplot property — parseRaw");

test("never throws on arbitrary CSV-shaped input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseRaw(text);
      return true;
    })
  );
});

test("returns { headers, rows } where both are arrays", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const p = parseRaw(text);
      return p && Array.isArray(p.headers) && Array.isArray(p.rows);
    })
  );
});

// ── Per-group descriptive stats ────────────────────────────────────────

suite("boxplot property — per-group stats");

test("quartiles never throws and satisfies q1 ≤ med ≤ q3", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, valIdx, grpIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1 || p.rows.length < 1) return true;
        const v = valIdx % p.headers.length;
        const g = grpIdx % p.headers.length;
        const groups = bucketGroups(p.rows, v, g);
        for (const gr of groups) {
          const q = quartiles(gr);
          if (!q) continue;
          if (!(q.q1 <= q.med && q.med <= q.q3)) return false;
        }
        return true;
      }
    )
  );
});

test("computeStats never throws on numeric groups", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, valIdx, grpIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1) return true;
        const v = valIdx % p.headers.length;
        const g = grpIdx % p.headers.length;
        const groups = bucketGroups(p.rows, v, g);
        for (const gr of groups) computeStats(gr);
        return true;
      }
    )
  );
});

test("kde returns an array and never throws", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, valIdx, grpIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1) return true;
        const v = valIdx % p.headers.length;
        const g = grpIdx % p.headers.length;
        const groups = bucketGroups(p.rows, v, g);
        for (const gr of groups) {
          if (!Array.isArray(kde(gr))) return false;
        }
        return true;
      }
    )
  );
});

// ── selectTest + chosen test ───────────────────────────────────────────

suite("boxplot property — selectTest");

test("returns a recognised test name (or an explicit error)", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, valIdx, grpIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1) return true;
        const v = valIdx % p.headers.length;
        const g = grpIdx % p.headers.length;
        const testable = bucketGroups(p.rows, v, g).filter((gr) => gr.length >= 2);
        if (testable.length < 2) return true;
        const pick = selectTest(testable);
        if (!pick) return false;
        if (pick.error) return true;
        const rec = pick.recommendation || {};
        return KNOWN_TESTS.has(rec.test);
      }
    )
  );
});

test("the chosen test runs without throwing", () => {
  check(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, valIdx, grpIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1) return true;
        const v = valIdx % p.headers.length;
        const g = grpIdx % p.headers.length;
        const testable = bucketGroups(p.rows, v, g).filter((gr) => gr.length >= 2);
        if (testable.length < 2) return true;
        const pick = selectTest(testable);
        if (!pick || pick.error) return true;
        const rec = pick.recommendation || {};
        if (rec.test === "studentT" || rec.test === "welchT") {
          tTest(testable[0], testable[1], { equalVar: rec.test === "studentT" });
        } else if (rec.test === "mannWhitney") {
          mannWhitneyU(testable[0], testable[1]);
        } else if (rec.test === "oneWayANOVA") {
          oneWayANOVA(testable);
        } else if (rec.test === "welchANOVA") {
          welchANOVA(testable);
        } else if (rec.test === "kruskalWallis") {
          kruskalWallis(testable);
        }
        return true;
      }
    )
  );
});

// ── Post-hoc + bracket layout ──────────────────────────────────────────

suite("boxplot property — post-hoc + bracket layout");

test("post-hoc runs without throwing for k ≥ 3", () => {
  checkHeavy(
    fc.property(
      arbLongCsv,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      (text, valIdx, grpIdx) => {
        const p = parseRaw(text);
        if (!p || p.headers.length < 1) return true;
        const v = valIdx % p.headers.length;
        const g = grpIdx % p.headers.length;
        const testable = bucketGroups(p.rows, v, g).filter((gr) => gr.length >= 2);
        if (testable.length < 3) return true;
        const pick = selectTest(testable);
        if (!pick || pick.error) return true;
        const rec = pick.recommendation || {};
        if (rec.postHoc === "tukeyHSD") tukeyHSD(testable);
        else if (rec.postHoc === "gamesHowell") gamesHowell(testable);
        else if (rec.postHoc === "dunn") dunnTest(testable);
        return true;
      }
    )
  );
});

test("bhAdjust never throws and outputs values are finite ≥ 0", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => {
        const out = bhAdjust(ps);
        if (!Array.isArray(out)) return false;
        for (const p of out) {
          if (!Number.isFinite(p)) return false;
          if (p < 0) return false;
        }
        return true;
      }
    )
  );
});

test("assignBracketLevels returns non-negative integer levels", () => {
  check(
    fc.property(
      fc.array(
        fc
          .tuple(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 8 }))
          .filter(([i, j]) => i !== j),
        { minLength: 1, maxLength: 20 }
      ),
      (raw) => {
        const pairs = raw.map(([i, j]) => ({ i: Math.min(i, j), j: Math.max(i, j) }));
        const layout = assignBracketLevels(pairs);
        if (!Array.isArray(layout) || layout.length !== pairs.length) return false;
        for (const b of layout) {
          if (!Number.isInteger(b._level) || b._level < 0) return false;
        }
        return true;
      }
    )
  );
});

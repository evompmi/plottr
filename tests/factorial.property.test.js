// Property tests for the Factorial Analysis tool's parse → cellize →
// validate pipeline. Complements the kernel-level twoWayANOVA properties
// in tests/stats.property.test.js by pinning end-to-end invariants on
// the tool's own helpers.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  summarizeDesign,
  validateDesign,
  twoWayANOVA,
} = require("./helpers/factorial-loader");

const RUNS = 200;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

// Arbitrary: pick k_A levels for factor A, k_B for factor B, and n
// replicates per cell. Build a balanced long-format CSV (header +
// rows). Returns the CSV text plus the design parameters so the
// property can reason about the expected shape.
function arbBalancedCsv() {
  return fc
    .record({
      kA: fc.integer({ min: 2, max: 3 }),
      kB: fc.integer({ min: 2, max: 3 }),
      n: fc.integer({ min: 2, max: 4 }),
      seed: fc.integer({ min: 1, max: 1000 }),
    })
    .map(({ kA, kB, n, seed }) => {
      let s = seed;
      const next = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return ((s % 1000) / 100).toFixed(2);
      };
      const lines = ["A,B,y"];
      for (let a = 0; a < kA; a++) {
        for (let b = 0; b < kB; b++) {
          for (let r = 0; r < n; r++) {
            lines.push(`a${a},b${b},${next()}`);
          }
        }
      }
      return { text: lines.join("\n"), kA, kB, n };
    });
}

suite("factorial property — parse → summarize");

test("parsed long-format CSV → summarizeDesign matches the CSV's design", () => {
  check(
    fc.property(arbBalancedCsv(), ({ text, kA, kB, n }) => {
      const { headers, rows } = parseRaw(text, ",");
      if (headers.length !== 3) return false;
      const a = rows.map((r) => r[0]);
      const b = rows.map((r) => r[1]);
      const s = summarizeDesign(a, b);
      if (s.levelsA.length !== kA) return false;
      if (s.levelsB.length !== kB) return false;
      if (!s.balanced) return false;
      if (s.N !== kA * kB * n) return false;
      if (s.emptyCells !== 0) return false;
      for (const c of s.cellCounts) {
        if (c !== n) return false;
      }
      return true;
    })
  );
});

test("validateDesign accepts every well-formed balanced design", () => {
  check(
    fc.property(arbBalancedCsv(), ({ text }) => {
      const { rows } = parseRaw(text, ",");
      const a = rows.map((r) => r[0]);
      const b = rows.map((r) => r[1]);
      const s = summarizeDesign(a, b);
      const err = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
      return err == null;
    })
  );
});

suite("factorial property — end-to-end parse → twoWayANOVA");

test("balanced design end-to-end: validate passes ⇒ kernel returns no error", () => {
  check(
    fc.property(arbBalancedCsv(), ({ text }) => {
      const { rows } = parseRaw(text, ",");
      const aSeries = rows.map((r) => r[0]);
      const bSeries = rows.map((r) => r[1]);
      const vSeries = rows.map((r) => parseFloat(r[2]));
      const s = summarizeDesign(aSeries, bSeries);
      const err = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
      if (err != null) return false;
      const result = twoWayANOVA(vSeries, aSeries, bSeries);
      if (result.error) return false;
      // Sanity: ANOVA's own level lists agree with summarize's.
      if (result.levelsA.length !== s.levelsA.length) return false;
      if (result.levelsB.length !== s.levelsB.length) return false;
      return true;
    })
  );
});

test("removing a level from factor A drops summary.levelsA.length by 1", () => {
  check(
    fc.property(arbBalancedCsv(), ({ text }) => {
      const { rows } = parseRaw(text, ",");
      const a = rows.map((r) => r[0]);
      const b = rows.map((r) => r[1]);
      const s0 = summarizeDesign(a, b);
      if (s0.levelsA.length < 3) return true; // skip 2×k designs (can't drop)
      const drop = s0.levelsA[0];
      const keep = a.map((v, i) => (v === drop ? null : { ai: v, bi: b[i] }));
      const aKept = keep.filter((x) => x !== null).map((x) => x.ai);
      const bKept = keep.filter((x) => x !== null).map((x) => x.bi);
      const s1 = summarizeDesign(aKept, bKept);
      return s1.levelsA.length === s0.levelsA.length - 1;
    })
  );
});

test("empty-cell injection: introducing a missing (a, b) combo flags emptyCells > 0", () => {
  check(
    fc.property(arbBalancedCsv(), ({ text, kA, kB }) => {
      if (kA < 2 || kB < 2) return true;
      const { rows } = parseRaw(text, ",");
      // Drop every row matching (a0, b0) — guaranteed to leave that cell empty.
      const filtered = rows.filter((r) => !(r[0] === "a0" && r[1] === "b0"));
      const aSeries = filtered.map((r) => r[0]);
      const bSeries = filtered.map((r) => r[1]);
      const s = summarizeDesign(aSeries, bSeries);
      // The (a0, b0) cell should now report n = 0.
      const idxA = s.levelsA.indexOf("a0");
      const idxB = s.levelsB.indexOf("b0");
      if (idxA === -1 || idxB === -1) {
        // a0 or b0 had no other rows — the level itself disappeared, which
        // is a different (also valid) outcome. Skip.
        return true;
      }
      const cell = s.cellCounts[idxA * s.levelsB.length + idxB];
      if (cell !== 0) return false;
      if (s.emptyCells === 0) return false;
      const err = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
      return err != null && /non-estimable/i.test(err);
    })
  );
});

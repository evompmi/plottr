// Property-based tests for the boxplot data + statistics pipeline.
//
// Replaces the prior tests/fuzz/boxplot.fuzz.js. Drives the same chain
// (parseRaw → bucket-into-groups → quartiles / computeStats / kde →
//  selectTest → tTest|mannWhitneyU|oneWayANOVA|welchANOVA|kruskalWallis →
//  tukeyHSD|gamesHowell|dunnTest → bhAdjust → assignBracketLevels) plus
// the boxplot pure helpers (formatBpStatShort, computeBpAnnotationSpec,
// summariseNormality / summariseEqualVariance, mergeSubgroupAnnotations,
// statsSummaryHeight) under fast-check, with the curated CSV-pathology
// corpus and structural arbitraries from tests/helpers/csv-arbitraries.

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
  formatBpStatShort,
  computeBpAnnotationSpec,
  summariseNormality,
  summariseEqualVariance,
  mergeSubgroupAnnotations,
  statsSummaryHeight,
} = require("./helpers/boxplot-loader");
const { arbAnyCsv, arbLongCsv } = require("./helpers/csv-arbitraries");

const RUNS = 300;
const RUNS_HEAVY = 80;

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

suite("boxplot property — quartiles / computeStats / kde");

// Group arbitrary that excludes subnormal floats. fc.double(...) can
// produce values like 9e-323 within the [-1000, 1000] range — those are
// subnormals (smaller than Number.MIN_NORMAL ≈ 2.2e-308) and the
// quartile-interpolation FP arithmetic loses monotonicity at that
// scale (q3 < q1 due to underflow in the linear-interp step). Real
// boxplot data is always normal-range; filtering subnormals here is
// the input-domain bound that matches the function's contract.
const arbNumericGroup = fc.array(
  fc
    .double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true })
    .filter((v) => v === 0 || Math.abs(v) >= 2.2e-308),
  { minLength: 1, maxLength: 50 }
);

test("quartiles satisfies q1 ≤ med ≤ q3 (when q is finite)", () => {
  check(
    fc.property(arbNumericGroup, (group) => {
      const q = quartiles(group);
      if (!q) return true;
      if (!Number.isFinite(q.q1) || !Number.isFinite(q.med) || !Number.isFinite(q.q3)) return true;
      // FP tolerance: when two values near the upper end of the
      // [-1000, 1000] arbitrary differ by 1 ULP (e.g. 999.9999999999993
      // vs 999.9999999999994, ~1.13e-13 apart), linear interpolation
      // between them at the 25/50/75 percentile points produces deltas
      // below the ULP of the operands themselves. The rounding direction
      // for each percentile can disagree by a ULP, breaking q3 ≥ q1 by
      // an amount that is numerically meaningless. The 8 × EPSILON scale
      // factor is the conventional loose-but-tight tolerance for FP
      // comparisons; tight enough that an implementation bug producing
      // genuine non-monotonicity (off by 1 % of the spread or more)
      // still fails.
      const eps = Math.max(Math.abs(q.q1), Math.abs(q.q3)) * 8 * Number.EPSILON;
      return q.q1 <= q.med + eps && q.med <= q.q3 + eps;
    })
  );
});

test("quartiles min ≤ q1 and q3 ≤ max", () => {
  check(
    fc.property(arbNumericGroup, (group) => {
      const q = quartiles(group);
      if (!q || !Number.isFinite(q.q1) || !Number.isFinite(q.q3)) return true;
      const min = Math.min(...group);
      const max = Math.max(...group);
      return q.q1 >= min - 1e-9 && q.q3 <= max + 1e-9;
    })
  );
});

test("quartiles are invariant under input permutation", () => {
  // q1 / med / q3 depend on the *sorted* values, so any permutation
  // of the input should produce identical quartiles. A mutation that
  // sampled the unsorted array at indices ⌊n/4⌋ / ⌊n/2⌋ / ⌊3n/4⌋
  // (instead of sorting first) would satisfy the min/max bound test
  // above but fail this one.
  check(
    fc.property(arbNumericGroup, fc.integer({ min: 1, max: 1000 }), (group, seed) => {
      const a = quartiles(group);
      // Park-Miller LCG shuffle keyed off the fc-supplied seed so each
      // input gets a different but deterministic permutation.
      const shuffled = group.slice();
      let s = seed;
      for (let i = shuffled.length - 1; i > 0; i--) {
        s = (s * 16807) % 2147483647;
        const j = s % (i + 1);
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      const b = quartiles(shuffled);
      if (!a || !b) return a === b;
      const finite = (v) => Number.isFinite(v);
      if (!finite(a.q1) || !finite(a.med) || !finite(a.q3)) return true;
      if (!finite(b.q1) || !finite(b.med) || !finite(b.q3)) return true;
      return (
        Math.abs(a.q1 - b.q1) < 1e-9 &&
        Math.abs(a.med - b.med) < 1e-9 &&
        Math.abs(a.q3 - b.q3) < 1e-9
      );
    })
  );
});

test("computeStats: n equals input length, mean is finite", () => {
  check(
    fc.property(arbNumericGroup, (group) => {
      const s = computeStats(group);
      if (!s) return true;
      if (s.n !== group.length) return false;
      if (!Number.isFinite(s.mean)) return false;
      return true;
    })
  );
});

test("computeStats: sd is non-negative", () => {
  check(
    fc.property(arbNumericGroup, (group) => {
      const s = computeStats(group);
      if (!s || !Number.isFinite(s.sd)) return true;
      return s.sd >= 0;
    })
  );
});

test("computeStats: mean of constant group equals the constant", () => {
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 2, max: 20 }),
      (v, n) => {
        const arr = new Array(n).fill(v);
        const s = computeStats(arr);
        return Math.abs(s.mean - v) < 1e-9 && Math.abs(s.sd) < 1e-9;
      }
    )
  );
});

test("kde returns an array of {x, d} where finite densities are non-negative", () => {
  // kde's output shape is {x, d} — d is the kernel density estimate at
  // x. Empty input → empty array. When the input is at subnormal-scale
  // (|values| < ~1e-300), the bandwidth collapses to ~0 and the density
  // at sample points blows up to Infinity; the chart filters non-finite
  // d at draw time, so the property only constrains the *finite* tail
  // of the output: when d is finite, it must be ≥ 0. x is always
  // expected to be finite (it's just a sample-point grid).
  check(
    fc.property(arbNumericGroup, (group) => {
      const pts = kde(group);
      if (!Array.isArray(pts)) return false;
      for (const p of pts) {
        if (typeof p !== "object") return false;
        if (!Number.isFinite(p.x)) return false;
        if (Number.isFinite(p.d) && p.d < -1e-9) return false;
      }
      return true;
    })
  );
});

// ── selectTest + chosen test ───────────────────────────────────────────

suite("boxplot property — selectTest + chosen test");

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

// ── Test-statistic-level invariants ────────────────────────────────────
//
// Each chosen test's result has a `p` field. Across two-sample, k-group,
// parametric and rank-based tests the p value should be either NaN
// (degenerate) or a finite number in [0, 1 + ε]. The implementation can
// legitimately produce NaN at the boundary (e.g. zero-variance inputs)
// — assert finiteness conditionally.

const arbTwoGroups = fc.tuple(
  fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
    minLength: 2,
    maxLength: 30,
  }),
  fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
    minLength: 2,
    maxLength: 30,
  })
);

const arbKGroups = fc.array(
  fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
    minLength: 2,
    maxLength: 20,
  }),
  { minLength: 3, maxLength: 6 }
);

suite("boxplot property — tTest / mannWhitneyU");

test("Welch t-test p is null/NaN or in [0, 1]", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r = tTest(a, b, { equalVar: false });
      if (!r || r.p == null || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

test("Student t-test p is null/NaN or in [0, 1]", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r = tTest(a, b, { equalVar: true });
      if (!r || r.p == null || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

test("Mann–Whitney U p is null/NaN or in [0, 1]", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r = mannWhitneyU(a, b);
      if (!r || r.p == null || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

suite("boxplot property — ANOVA / KW");

test("oneWayANOVA p is null/NaN or in [0, 1]", () => {
  check(
    fc.property(arbKGroups, (groups) => {
      const r = oneWayANOVA(groups);
      if (!r || r.p == null || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

test("welchANOVA p is null/NaN or in [0, 1]", () => {
  check(
    fc.property(arbKGroups, (groups) => {
      const r = welchANOVA(groups);
      if (!r || r.p == null || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

test("kruskalWallis p is null/NaN or in [0, 1]", () => {
  check(
    fc.property(arbKGroups, (groups) => {
      const r = kruskalWallis(groups);
      if (!r || r.p == null || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

// ── Post-hoc + bracket layout ──────────────────────────────────────────

suite("boxplot property — post-hoc");

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

test("tukeyHSD pairs cover every i<j ordered pair exactly once", () => {
  // Deterministic fixture, not an fc property. Pair coverage is a
  // structural fact of the function — for k groups, tukeyHSD returns
  // k(k-1)/2 unique ordered (i, j) pairs with i < j and indices in
  // [0, k). That contract doesn't depend on the *values* in the
  // groups, only on k, so randomising the values via fast-check adds
  // no test bite and only multiplies the qtukey workload (200-step
  // bisection over a 48-node Gauss-Legendre quadrature of ptukey,
  // tens of ms per pair). Three previous attempts at tightening fc
  // bounds still tripped the 30 s timeout under Stryker's perTest
  // instrumentation; a single deterministic call lands in <100 ms.
  const groups = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
  ];
  const k = groups.length;
  const expected = (k * (k - 1)) / 2;
  const r = tukeyHSD(groups);
  if (!r || !Array.isArray(r.pairs)) {
    throw new Error("tukeyHSD must return a result with `pairs` array");
  }
  if (r.pairs.length !== expected) {
    throw new Error(`expected ${expected} pairs for k=${k}, got ${r.pairs.length}`);
  }
  const seen = new Set();
  for (const pr of r.pairs) {
    const key = `${pr.i},${pr.j}`;
    if (seen.has(key)) throw new Error(`duplicate pair (${pr.i}, ${pr.j})`);
    seen.add(key);
    if (!(pr.i < pr.j)) throw new Error(`pair must have i < j, got (${pr.i}, ${pr.j})`);
    if (pr.i < 0 || pr.j >= k) {
      throw new Error(`pair indices out of range: (${pr.i}, ${pr.j}), k=${k}`);
    }
  }
});

// ── BH adjust ──────────────────────────────────────────────────────────

suite("boxplot property — bhAdjust");

test("bhAdjust output length equals input length", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => bhAdjust(ps).length === ps.length
    )
  );
});

test("bhAdjust output values are finite ≥ 0", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => {
        const out = bhAdjust(ps);
        for (const p of out) {
          if (!Number.isFinite(p)) return false;
          if (p < -1e-9) return false;
        }
        return true;
      }
    )
  );
});

test("bhAdjust(p)[i] ≥ p[i] for every i (BH only inflates raw p)", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => {
        const adj = bhAdjust(ps);
        for (let i = 0; i < ps.length; i++) {
          if (adj[i] < ps[i] - 1e-9) return false;
        }
        return true;
      }
    )
  );
});

// ── assignBracketLevels ────────────────────────────────────────────────

suite("boxplot property — assignBracketLevels");

const arbPairs = fc
  .array(
    fc
      .tuple(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 8 }))
      .filter(([i, j]) => i !== j),
    { minLength: 1, maxLength: 20 }
  )
  .map((raw) => raw.map(([i, j]) => ({ i: Math.min(i, j), j: Math.max(i, j) })));

test("returns one entry per input pair", () => {
  check(fc.property(arbPairs, (pairs) => assignBracketLevels(pairs).length === pairs.length));
});

test("levels are non-negative integers", () => {
  check(
    fc.property(arbPairs, (pairs) => {
      const out = assignBracketLevels(pairs);
      for (const b of out) {
        if (!Number.isInteger(b._level) || b._level < 0) return false;
      }
      return true;
    })
  );
});

test("level-0 brackets do not overlap each other (interval packing)", () => {
  check(
    fc.property(arbPairs, (pairs) => {
      const out = assignBracketLevels(pairs);
      const lvl0 = out.filter((b) => b._level === 0);
      // Two intervals [i1, j1] and [i2, j2] overlap when i1 < j2 && i2 < j1.
      for (let a = 0; a < lvl0.length; a++) {
        for (let b = a + 1; b < lvl0.length; b++) {
          const A = lvl0[a];
          const B = lvl0[b];
          if (A.i < B.j && B.i < A.j) return false;
        }
      }
      return true;
    })
  );
});

// ── Boxplot-specific helpers ────────────────────────────────────────────

suite("boxplot property — formatBpStatShort / formatBpResultLine");

test("formatBpStatShort returns a string for any test name", () => {
  check(
    fc.property(
      fc.constantFrom(...KNOWN_TESTS, "unknown-test"),
      fc.option(
        fc.record({
          df: fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
          t: fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
          U: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          F: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          H: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          df1: fc.integer({ min: 1, max: 10 }),
          df2: fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        }),
        { nil: null }
      ),
      (testName, res) => typeof formatBpStatShort(testName, res) === "string"
    )
  );
});

test("formatBpStatShort returns '—' for null / error result", () => {
  check(
    fc.property(fc.constantFrom(...KNOWN_TESTS), (t) => {
      if (formatBpStatShort(t, null) !== "—") return false;
      if (formatBpStatShort(t, { error: "x" }) !== "—") return false;
      return true;
    })
  );
});

suite("boxplot property — summariseNormality / summariseEqualVariance");

test("summariseNormality returns 'yes' / 'no' / '—'", () => {
  check(
    fc.property(
      fc.array(fc.record({ normal: fc.option(fc.boolean(), { nil: null }) }), { maxLength: 8 }),
      (norm) => {
        const s = summariseNormality(norm);
        return s === "yes" || s === "no" || s === "—";
      }
    )
  );
});

test("summariseNormality returns 'no' if any group is non-normal", () => {
  check(
    fc.property(
      fc.array(fc.record({ normal: fc.option(fc.boolean(), { nil: null }) }), {
        minLength: 1,
        maxLength: 8,
      }),
      (norm) => {
        const hasFalse = norm.some((r) => r.normal === false);
        const s = summariseNormality(norm);
        if (hasFalse) return s === "no";
        return true;
      }
    )
  );
});

test("summariseEqualVariance returns 'yes' / 'no' / '—'", () => {
  check(
    fc.property(
      fc.option(
        fc.record({
          F: fc.option(fc.double({ noNaN: true, noDefaultInfinity: true }), { nil: null }),
          equalVar: fc.boolean(),
        }),
        { nil: null }
      ),
      (lev) => {
        const s = summariseEqualVariance(lev);
        return s === "yes" || s === "no" || s === "—";
      }
    )
  );
});

// ── computeBpAnnotationSpec ─────────────────────────────────────────────

suite("boxplot property — computeBpAnnotationSpec");

test("displayMode='none' returns null", () => {
  check(
    fc.property(
      fc.record({
        k: fc.integer({ min: 1, max: 5 }),
        names: fc.array(fc.string({ maxLength: 4 }), { minLength: 1, maxLength: 5 }),
        skip: fc.boolean(),
        testResult: fc.option(
          fc.record({ p: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }) }),
          { nil: null }
        ),
        postHocResult: fc.option(fc.record({ pairs: fc.constant([]) }), { nil: null }),
      }),
      fc.boolean(),
      (row, showNs) => computeBpAnnotationSpec(row, "none", showNs) === null
    )
  );
});

test("k < 2 returns null", () => {
  check(
    fc.property(fc.constantFrom("brackets", "cld"), fc.boolean(), (mode, showNs) => {
      const row = { k: 1, names: ["a"], testResult: null, postHocResult: null };
      return computeBpAnnotationSpec(row, mode, showNs) === null;
    })
  );
});

// ── statsSummaryHeight ─────────────────────────────────────────────────

suite("boxplot property — statsSummaryHeight");

test("non-string / null input returns 0", () => {
  check(
    fc.property(fc.oneof(fc.constant(null), fc.constant(undefined)), (s) => {
      return statsSummaryHeight(s) === 0;
    })
  );
});

test("multi-line summary height equals lineCount × STATS_LINE_H + 14 padding", () => {
  // Implementation: `lineCount × STATS_LINE_H + 14` (top + bottom pad).
  // The exact constants pin both the line height and the padding so a
  // future tweak surfaces here loud, not silently in the chart layout.
  check(
    fc.property(fc.integer({ min: 1, max: 6 }), (n) => {
      const summary = new Array(n).fill("line").join("\n");
      const h = statsSummaryHeight(summary);
      return h === n * 11 + 14;
    })
  );
});

// ── mergeSubgroupAnnotations ───────────────────────────────────────────

suite("boxplot property — mergeSubgroupAnnotations");

test("never throws on arbitrary subgroup metadata", () => {
  check(
    fc.property(
      fc.array(fc.record({ name: fc.string({ maxLength: 4 }) }), { maxLength: 5 }),
      fc.array(fc.record({ name: fc.string({ maxLength: 4 }) }), { maxLength: 10 }),
      fc.dictionary(
        fc.string({ maxLength: 4 }),
        fc.oneof(
          fc.record({
            kind: fc.constant("cld"),
            labels: fc.array(fc.string({ maxLength: 2 }), { maxLength: 5 }),
          }),
          fc.record({ kind: fc.constant("brackets"), pairs: fc.constant([]) })
        )
      ),
      (subgroups, flatGroups, perKeySpecs) => {
        mergeSubgroupAnnotations(subgroups, flatGroups, perKeySpecs);
        return true;
      }
    )
  );
});

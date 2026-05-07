// Regression tests for tools/shared-stats-registry.js — the single source
// of truth that every test/post-hoc dispatcher reads from. Pre-registry,
// the same identifier → (function, label, post-hoc, k=2 membership)
// mapping was duplicated across stats-dispatch.ts, shared-stats-tile.js,
// shared-r-export.js, and aequorin/reports.ts; a typo in any of those
// sites silently produced a no-op the suite never noticed.
//
// What this file pins down:
//   1. Registry keys exactly match the RecommendedTest / RecommendedPostHoc
//      unions documented in `types/globals.d.ts`. A new test/post-hoc must
//      be added in *both* places or the suite fails.
//   2. Every registry entry's `run(values)` returns the same numerical
//      result as the direct stats.js function call — proves the
//      `welchT → tTest({equalVar:false})` style indirection routes
//      correctly through the dispatcher path.
//   3. `STATS_TESTS_FOR_K2` / `STATS_TESTS_FOR_K` partition correctly on
//      arity (every entry classified, no missing or duplicate ids).
//   4. `postHoc` field on every test entry is either null or a key into
//      `STATS_POSTHOC_REGISTRY` — no orphaned references.
//   5. Labels are non-empty (catches a typo'd entry like `lebel: "..."`).

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  runTest,
  runPostHoc,
  postHocForTest,
  STATS_TEST_REGISTRY,
  STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K2,
  STATS_TESTS_FOR_K,
  tTest,
  mannWhitneyU,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  tukeyHSD,
  gamesHowell,
  dunnTest,
} = require("./helpers/stats-dispatch-loader");

// ── Fixtures ──────────────────────────────────────────────────────────
//
// Three small balanced groups. The exact values are arbitrary — the
// regression check is that `STATS_TEST_REGISTRY[id].run(values)` returns
// numerically identical results to the direct stats.js call. If a future
// edit silently swaps the wiring (welchT → equalVar:true, kruskalWallis
// → oneWayANOVA, etc.), the parity check fires.
const A = [5.1, 4.9, 5.0, 5.2, 5.1];
const B = [6.0, 6.1, 5.9, 6.2, 6.0];
const C = [7.0, 7.1, 6.9, 7.2, 7.0];

// Canonical union from types/globals.d.ts. If a new test ID is added to
// the union, this list must be updated *and* a registry entry written;
// the test below catches any drift in either direction.
const EXPECTED_TEST_IDS = [
  "studentT",
  "welchT",
  "mannWhitney",
  "oneWayANOVA",
  "welchANOVA",
  "kruskalWallis",
];
const EXPECTED_POSTHOC_IDS = ["tukeyHSD", "gamesHowell", "dunn"];

// Expected post-hoc routing — pre-registry this lived as a switch in
// stats-dispatch.ts:postHocForTest. Pinning it here means a future
// "let's swap kruskalWallis → tukeyHSD" can't slip through unnoticed.
const EXPECTED_POSTHOC_FOR_TEST = {
  studentT: null,
  welchT: null,
  mannWhitney: null,
  oneWayANOVA: "tukeyHSD",
  welchANOVA: "gamesHowell",
  kruskalWallis: "dunn",
};

// ── Suite 1 — registry shape ──────────────────────────────────────────

suite("stats-registry :: registry shape");

test("STATS_TEST_REGISTRY has exactly the expected test ids", () => {
  const got = Object.keys(STATS_TEST_REGISTRY).sort();
  const want = [...EXPECTED_TEST_IDS].sort();
  eq(JSON.stringify(got), JSON.stringify(want));
});

test("STATS_POSTHOC_REGISTRY has exactly the expected post-hoc ids", () => {
  const got = Object.keys(STATS_POSTHOC_REGISTRY).sort();
  const want = [...EXPECTED_POSTHOC_IDS].sort();
  eq(JSON.stringify(got), JSON.stringify(want));
});

test("every test entry has label / arity / postHoc / run fields", () => {
  for (const id of EXPECTED_TEST_IDS) {
    const e = STATS_TEST_REGISTRY[id];
    assert(e, `missing entry for ${id}`);
    assert(typeof e.label === "string" && e.label.length > 0, `${id} label`);
    assert(e.arity === 2 || e.arity === "k", `${id} arity must be 2 or "k"`);
    assert(e.postHoc === null || typeof e.postHoc === "string", `${id} postHoc`);
    assert(typeof e.run === "function", `${id} run is a function`);
  }
});

test("t-test entries carry a distinct shortLabel for tight UIs (lineplot)", () => {
  // Lineplot's per-x stats panel reads `shortLabel ?? label` and renders
  // each cell at ~80 px wide; "Student's t-test" overflows where
  // "Student's t" fits. If a future edit drops the shortLabel, the
  // lineplot UI would silently widen with no failing test — pin both
  // entries here so the abbreviation contract stays explicit.
  const st = STATS_TEST_REGISTRY.studentT;
  const wt = STATS_TEST_REGISTRY.welchT;
  assert(typeof st.shortLabel === "string" && st.shortLabel.length > 0, "studentT shortLabel");
  assert(typeof wt.shortLabel === "string" && wt.shortLabel.length > 0, "welchT shortLabel");
  assert(st.shortLabel !== st.label, "studentT shortLabel must differ from label");
  assert(wt.shortLabel !== wt.label, "welchT shortLabel must differ from label");
});

test("every post-hoc entry has label / run fields", () => {
  for (const id of EXPECTED_POSTHOC_IDS) {
    const e = STATS_POSTHOC_REGISTRY[id];
    assert(e, `missing entry for ${id}`);
    assert(typeof e.label === "string" && e.label.length > 0, `${id} label`);
    assert(typeof e.run === "function", `${id} run is a function`);
  }
});

test("every test entry's postHoc is null or a registered post-hoc id", () => {
  for (const id of EXPECTED_TEST_IDS) {
    const ph = STATS_TEST_REGISTRY[id].postHoc;
    if (ph !== null) {
      assert(
        STATS_POSTHOC_REGISTRY[ph],
        `${id}.postHoc = "${ph}" is not in STATS_POSTHOC_REGISTRY`
      );
    }
  }
});

// ── Suite 2 — arity partitioning ──────────────────────────────────────

suite("stats-registry :: arity partitions");

test("STATS_TESTS_FOR_K2 contains every arity:2 entry", () => {
  const fromRegistry = EXPECTED_TEST_IDS.filter((id) => STATS_TEST_REGISTRY[id].arity === 2);
  eq(JSON.stringify([...STATS_TESTS_FOR_K2].sort()), JSON.stringify(fromRegistry.sort()));
});

test("STATS_TESTS_FOR_K contains every arity:'k' entry", () => {
  const fromRegistry = EXPECTED_TEST_IDS.filter((id) => STATS_TEST_REGISTRY[id].arity === "k");
  eq(JSON.stringify([...STATS_TESTS_FOR_K].sort()), JSON.stringify(fromRegistry.sort()));
});

test("partitions are disjoint and cover every test id", () => {
  const all = [...STATS_TESTS_FOR_K2, ...STATS_TESTS_FOR_K].sort();
  const expected = [...EXPECTED_TEST_IDS].sort();
  eq(JSON.stringify(all), JSON.stringify(expected));
  // Disjointness: no id in both
  for (const id of STATS_TESTS_FOR_K2) {
    assert(!STATS_TESTS_FOR_K.includes(id), `${id} in both partitions`);
  }
});

// ── Suite 3 — registry routing parity ──────────────────────────────────
//
// The point of these tests: if anyone re-wires the registry (e.g. swaps
// `welchT` to call `tTest(..., {equalVar:true})` by mistake), the result
// objects will differ from the direct call and the test fires.
//
// Comparing entire result objects via JSON would over-assert (some
// fields are conditional). We pick the load-bearing numeric fields per
// test — the ones the StatsTile actually displays — and assert
// approximate equality.

suite("stats-registry :: routing parity vs direct stats.js calls");

const APPROX = 1e-12;

test("studentT routes to tTest({equalVar: true})", () => {
  const direct = tTest(A, B, { equalVar: true });
  const viaReg = STATS_TEST_REGISTRY.studentT.run([A, B]);
  approx(viaReg.t, direct.t, APPROX);
  approx(viaReg.df, direct.df, APPROX);
  approx(viaReg.p, direct.p, APPROX);
});

test("welchT routes to tTest({equalVar: false})", () => {
  const direct = tTest(A, B, { equalVar: false });
  const viaReg = STATS_TEST_REGISTRY.welchT.run([A, B]);
  approx(viaReg.t, direct.t, APPROX);
  approx(viaReg.df, direct.df, APPROX);
  approx(viaReg.p, direct.p, APPROX);
});

test("welchT and studentT genuinely differ (registry isn't aliasing them)", () => {
  // If a future edit accidentally collapsed welchT and studentT to the
  // same call, the routing-parity tests above would still pass because
  // they each compare to the matching direct call. This guards against
  // that specific failure mode by running on data with unequal variance
  // and asserting the two registry runs differ.
  const uneven = [1, 1, 1, 1, 1, 1, 100];
  const even = [2, 2, 2];
  const st = STATS_TEST_REGISTRY.studentT.run([uneven, even]);
  const wt = STATS_TEST_REGISTRY.welchT.run([uneven, even]);
  assert(st.df !== wt.df, "Student and Welch dfs must differ on unequal-var data");
});

test("mannWhitney routes to mannWhitneyU", () => {
  const direct = mannWhitneyU(A, B);
  const viaReg = STATS_TEST_REGISTRY.mannWhitney.run([A, B]);
  approx(viaReg.U, direct.U, APPROX);
  approx(viaReg.p, direct.p, APPROX);
});

test("oneWayANOVA routes to oneWayANOVA", () => {
  const direct = oneWayANOVA([A, B, C]);
  const viaReg = STATS_TEST_REGISTRY.oneWayANOVA.run([A, B, C]);
  approx(viaReg.F, direct.F, APPROX);
  approx(viaReg.p, direct.p, APPROX);
  eq(viaReg.df1, direct.df1);
  eq(viaReg.df2, direct.df2);
});

test("welchANOVA routes to welchANOVA", () => {
  const direct = welchANOVA([A, B, C]);
  const viaReg = STATS_TEST_REGISTRY.welchANOVA.run([A, B, C]);
  approx(viaReg.F, direct.F, APPROX);
  approx(viaReg.p, direct.p, APPROX);
});

test("kruskalWallis routes to kruskalWallis", () => {
  const direct = kruskalWallis([A, B, C]);
  const viaReg = STATS_TEST_REGISTRY.kruskalWallis.run([A, B, C]);
  approx(viaReg.H, direct.H, APPROX);
  approx(viaReg.p, direct.p, APPROX);
});

test("tukeyHSD routes to tukeyHSD", () => {
  const direct = tukeyHSD([A, B, C]);
  const viaReg = STATS_POSTHOC_REGISTRY.tukeyHSD.run([A, B, C]);
  eq(viaReg.pairs.length, direct.pairs.length);
  for (let i = 0; i < direct.pairs.length; i++) {
    approx(viaReg.pairs[i].p, direct.pairs[i].p, APPROX);
  }
});

test("gamesHowell routes to gamesHowell", () => {
  const direct = gamesHowell([A, B, C]);
  const viaReg = STATS_POSTHOC_REGISTRY.gamesHowell.run([A, B, C]);
  eq(viaReg.pairs.length, direct.pairs.length);
  for (let i = 0; i < direct.pairs.length; i++) {
    approx(viaReg.pairs[i].p, direct.pairs[i].p, APPROX);
  }
});

test("dunn routes to dunnTest", () => {
  const direct = dunnTest([A, B, C]);
  const viaReg = STATS_POSTHOC_REGISTRY.dunn.run([A, B, C]);
  eq(viaReg.pairs.length, direct.pairs.length);
  for (let i = 0; i < direct.pairs.length; i++) {
    approx(viaReg.pairs[i].p, direct.pairs[i].p, APPROX);
  }
});

// ── Suite 4 — post-hoc routing matches the prior switch ───────────────

suite("stats-registry :: postHocForTest table");

test("postHocForTest matches the canonical mapping for every test id", () => {
  for (const id of EXPECTED_TEST_IDS) {
    eq(postHocForTest(id), EXPECTED_POSTHOC_FOR_TEST[id]);
  }
});

test("registry's .postHoc field matches postHocForTest dispatcher", () => {
  for (const id of EXPECTED_TEST_IDS) {
    eq(STATS_TEST_REGISTRY[id].postHoc, postHocForTest(id));
  }
});

// ── Suite 5 — runTest dispatcher integrity ────────────────────────────
//
// Re-runs the whole parity check via the public `runTest` API so we
// catch a future regression where someone hooks runTest up to a
// different code path than the registry.

suite("stats-registry :: runTest goes through the registry");

test("runTest result equals registry.run result for every test id", () => {
  const inputs = {
    studentT: [A, B],
    welchT: [A, B],
    mannWhitney: [A, B],
    oneWayANOVA: [A, B, C],
    welchANOVA: [A, B, C],
    kruskalWallis: [A, B, C],
  };
  for (const id of EXPECTED_TEST_IDS) {
    const viaApi = runTest(id, inputs[id]);
    const viaReg = STATS_TEST_REGISTRY[id].run(inputs[id]);
    // p is the universal field — every test returns one. Comparing it
    // catches any silent re-routing without over-coupling the test to
    // each result shape.
    approx(viaApi.p, viaReg.p, APPROX);
  }
});

test("runPostHoc result equals registry.run result for every post-hoc id", () => {
  for (const id of EXPECTED_POSTHOC_IDS) {
    const viaApi = runPostHoc(id, [A, B, C]);
    const viaReg = STATS_POSTHOC_REGISTRY[id].run([A, B, C]);
    eq(viaApi.pairs.length, viaReg.pairs.length);
  }
});

summary();

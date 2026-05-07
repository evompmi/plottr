// shared-stats-registry.js — single source of truth for the inferential
// tests `selectTest()` can recommend, plus the post-hoc family that pairs
// with each k≥3 test.
//
// Why this exists. Pre-registry, the same test-id → (function, label,
// post-hoc, k=2 membership) mapping lived in 4+ places: the typed
// dispatcher in `_shell/stats-dispatch.ts`, the inline `_runTest` /
// `_runPostHoc` / `_postHocFor` helpers in `shared-stats-tile.js`, the
// `TEST_LABELS_AQ` / `POSTHOC_LABELS_AQ` / `TEST_OPTIONS_AQ_*` constants
// in `aequorin/reports.ts`, and the R-export switch in
// `shared-r-export.js`. Every site string-matched on identifiers like
// `"welchT"` independently — adding a new test meant editing 8+
// locations and was a typo away from a runtime no-op (the test suite
// did not catch dispatch mismatches before this round). The registry
// collapses dispatch + label lookup + post-hoc routing + arity
// classification into one declarative table.
//
// Naming asymmetry note. `selectTest()` returns `"welchT"` for k=2 even
// though no `welchT` function exists — it dispatches to
// `tTest(x, y, { equalVar: false })`. `"welchANOVA"` does match a
// function. The registry is the only place that reconciles the
// asymmetry; consumers don't need to know about it.
//
// Plain JS by the shared-bundle convention. Top-level declarations
// become globals via `tools/shared.bundle.js` (concatenated by
// `scripts/build-shared.js`). Order is significant — this file must
// load AFTER `stats.js` (depends on its function globals) and BEFORE
// `shared-r-export.js` and `shared-stats-tile.js` (which consume the
// registry).

// ── Test registry ──────────────────────────────────────────────────────
//
// Each entry's `run(values)` is invoked with the same `number[][]` shape
// the dispatcher receives. For arity-2 tests we destructure to two
// 1-D arrays inside `run`; for k-group tests we pass the array through.
// The dispatcher is therefore agnostic to arity — every entry exposes
// the same call signature.
const STATS_TEST_REGISTRY = {
  studentT: {
    label: "Student's t-test",
    // Shorter label for tight UIs (lineplot's per-x stats panel cells).
    // Most consumers want `label`; lineplot reads `shortLabel ?? label`.
    shortLabel: "Student's t",
    arity: 2,
    postHoc: null,
    run: function (values) {
      return tTest(values[0], values[1], { equalVar: true });
    },
  },
  welchT: {
    label: "Welch's t-test",
    shortLabel: "Welch's t",
    arity: 2,
    postHoc: null,
    run: function (values) {
      return tTest(values[0], values[1], { equalVar: false });
    },
  },
  mannWhitney: {
    label: "Mann-Whitney U",
    arity: 2,
    postHoc: null,
    run: function (values) {
      return mannWhitneyU(values[0], values[1]);
    },
  },
  oneWayANOVA: {
    label: "One-way ANOVA",
    arity: "k",
    postHoc: "tukeyHSD",
    run: function (values) {
      return oneWayANOVA(values);
    },
  },
  welchANOVA: {
    label: "Welch's ANOVA",
    arity: "k",
    postHoc: "gamesHowell",
    run: function (values) {
      return welchANOVA(values);
    },
  },
  kruskalWallis: {
    label: "Kruskal-Wallis",
    arity: "k",
    postHoc: "dunn",
    run: function (values) {
      return kruskalWallis(values);
    },
  },
};

// ── Post-hoc registry ──────────────────────────────────────────────────
//
// Mirrors the test registry's shape so the dispatcher can use the same
// `entry.run(values)` pattern for both. The label strings match what
// `STATS_LABELS` / `POSTHOC_LABELS` / `POSTHOC_LABELS_AQ` previously
// duplicated.
const STATS_POSTHOC_REGISTRY = {
  tukeyHSD: {
    label: "Tukey HSD",
    run: function (values) {
      return tukeyHSD(values);
    },
  },
  gamesHowell: {
    label: "Games-Howell",
    run: function (values) {
      return gamesHowell(values);
    },
  },
  dunn: {
    label: "Dunn (BH-adjusted)",
    run: function (values) {
      return dunnTest(values);
    },
  },
};

// ── Derived: test-id lists by group arity ──────────────────────────────
//
// Used by UI dropdowns that surface "what tests apply to two groups?"
// vs "what tests apply to k≥3 groups?". Computed from the registry so a
// new test entry with the right `arity` lights up the UI without a
// second edit site.
const STATS_TESTS_FOR_K2 = Object.keys(STATS_TEST_REGISTRY).filter(function (id) {
  return STATS_TEST_REGISTRY[id].arity === 2;
});
const STATS_TESTS_FOR_K = Object.keys(STATS_TEST_REGISTRY).filter(function (id) {
  return STATS_TEST_REGISTRY[id].arity === "k";
});

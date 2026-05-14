// Single source of truth for the inferential tests `selectTest()` can
// recommend, plus the post-hoc family that pairs with each k≥3 test.
//
// Pre-registry, the same test-id → (function, label, post-hoc, k=2
// membership) mapping lived in 4+ places (`_shell/stats-dispatch.ts`,
// `shared-stats-tile.js`, `aequorin/reports.ts`, the R-export switch in
// `shared-r-export.js`); every site string-matched on identifiers like
// `"welchT"` independently. The registry collapses dispatch + label
// lookup + post-hoc routing + arity classification into one declarative
// table.
//
// Naming asymmetry note: `selectTest()` returns `"welchT"` for k=2 even
// though no `welchT` function exists — it dispatches to
// `tTest(x, y, { equalVar: false })`. `"welchANOVA"` does match a
// function. The registry is the only place that reconciles the
// asymmetry; consumers don't need to know about it.

import { dunnTest, gamesHowell, tukeyHSD } from "../_core/stats/posthoc";
import { kruskalWallis, mannWhitneyU, oneWayANOVA, tTest, welchANOVA } from "../_core/stats/tests";

// `RecommendedTest`, `RecommendedPostHoc`, `TestArity`, `StatsTestEntry`,
// `StatsPostHocEntry` types stay declared in `types/globals.d.ts`
// (ambient). selectTest() in stats-posthoc.js (still plain-JS) uses
// them as ambient types; migrating the types out of globals.d.ts would
// break that file.

export const STATS_TEST_REGISTRY: Record<RecommendedTest, StatsTestEntry> = {
  studentT: {
    label: "Student's t-test",
    shortLabel: "Student's t",
    arity: 2,
    postHoc: null,
    run: (values) => tTest(values[0], values[1], { equalVar: true }),
  },
  welchT: {
    label: "Welch's t-test",
    shortLabel: "Welch's t",
    arity: 2,
    postHoc: null,
    run: (values) => tTest(values[0], values[1], { equalVar: false }),
  },
  mannWhitney: {
    label: "Mann-Whitney U",
    arity: 2,
    postHoc: null,
    run: (values) => mannWhitneyU(values[0], values[1]),
  },
  oneWayANOVA: {
    label: "One-way ANOVA",
    arity: "k",
    postHoc: "tukeyHSD",
    run: (values) => oneWayANOVA(values),
  },
  welchANOVA: {
    label: "Welch's ANOVA",
    arity: "k",
    postHoc: "gamesHowell",
    run: (values) => welchANOVA(values),
  },
  kruskalWallis: {
    label: "Kruskal-Wallis",
    arity: "k",
    postHoc: "dunn",
    run: (values) => kruskalWallis(values),
  },
};

export const STATS_POSTHOC_REGISTRY: Record<
  Exclude<RecommendedPostHoc, null>,
  StatsPostHocEntry
> = {
  tukeyHSD: {
    label: "Tukey HSD",
    run: (values) => tukeyHSD(values),
  },
  gamesHowell: {
    label: "Games-Howell",
    run: (values) => gamesHowell(values),
  },
  dunn: {
    label: "Dunn (BH-adjusted)",
    run: (values) => dunnTest(values),
  },
};

// Used by UI dropdowns that surface "what tests apply to two groups?"
// vs "what tests apply to k≥3 groups?". Computed from the registry so
// a new test entry with the right `arity` lights up the UI without a
// second edit site.
export const STATS_TESTS_FOR_K2: RecommendedTest[] = (
  Object.keys(STATS_TEST_REGISTRY) as RecommendedTest[]
).filter((id) => STATS_TEST_REGISTRY[id].arity === 2);
export const STATS_TESTS_FOR_K: RecommendedTest[] = (
  Object.keys(STATS_TEST_REGISTRY) as RecommendedTest[]
).filter((id) => STATS_TEST_REGISTRY[id].arity === "k");

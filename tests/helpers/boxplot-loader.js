// Loads the boxplot data pipeline — parser, per-group descriptive stats,
// the full `selectTest → test → post-hoc → bracket layout` stats chain,
// plus the boxplot-specific pure helpers (`tools/boxplot/helpers.ts`:
// test/post-hoc routers, result formatters, annotation spec,
// summary-text builders, sub-group annotation merge) — into a Node vm
// context for fuzzing / headless unit tests.
//
// Four `_shell/*` bundles are loaded sequentially: stats-registry →
// bracket-levels → power-from-data → StatsTile → helpers. Each is
// run via `runCjs` into the same context so cross-module name
// resolution lands on the same vm ctx. React is the minimal stub —
// StatsTile and BoxplotChart use React but we only pull pure helpers
// out, so the stub never gets invoked.

const vm = require("vm");
const { readStatsSource } = require("./stats-source");
const {
  builtins,
  bundleShell,
  makeDomStubs,
  MINIMAL_REACT,
  runCjs,
  readCoreSharedSource,
} = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const statsSrc = readStatsSource();

const registryCjs = bundleShell("_shell/stats-registry.ts");
const statsTileCjs = bundleShell("_shell/StatsTile.tsx");
const bracketLevelsCjs = bundleShell("_shell/bracket-levels.ts");
const powerFromDataCjs = bundleShell("_shell/power-from-data.ts");
const helpersCjs = bundleShell("boxplot/helpers.ts");

const ctx = {
  ...builtins(),
  ...makeDomStubs(),
  React: MINIMAL_REACT,
};
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);

const registry = runCjs(ctx, registryCjs);
ctx.STATS_TEST_REGISTRY = registry.STATS_TEST_REGISTRY;
ctx.STATS_POSTHOC_REGISTRY = registry.STATS_POSTHOC_REGISTRY;
ctx.STATS_TESTS_FOR_K2 = registry.STATS_TESTS_FOR_K2;
ctx.STATS_TESTS_FOR_K = registry.STATS_TESTS_FOR_K;

// `assignBracketLevels` and `computePowerFromData` were extracted from
// the StatsTile bundle into their own _shell modules in 2026-06; lift
// each onto ctx so helpers.ts (which uses both via the barrel) resolves
// them cleanly.
const bracketLevels = runCjs(ctx, bracketLevelsCjs);
ctx.assignBracketLevels = bracketLevels.assignBracketLevels;

const powerFromData = runCjs(ctx, powerFromDataCjs);
ctx.computePowerFromData = powerFromData.computePowerFromData;

// StatsTile bundle still loaded so its top-level evaluation stays
// representative of the production bundle (catches "module crashes at
// import time" regressions).
runCjs(ctx, statsTileCjs);

const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  quartiles: ctx.quartiles,
  computeStats: ctx.computeStats,
  kde: ctx.kde,
  computeGroupStats: ctx.computeGroupStats,
  selectTest: ctx.selectTest,
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  tukeyHSD: ctx.tukeyHSD,
  gamesHowell: ctx.gamesHowell,
  dunnTest: ctx.dunnTest,
  bhAdjust: ctx.bhAdjust,
  shapiroWilk: ctx.shapiroWilk,
  leveneTest: ctx.leveneTest,
  compactLetterDisplay: ctx.compactLetterDisplay,
  assignBracketLevels: ctx.assignBracketLevels,
  computePowerFromData: ctx.computePowerFromData,
  // Boxplot-specific pure helpers.
  formatBpStatShort: helpers.formatBpStatShort,
  formatBpResultLine: helpers.formatBpResultLine,
  computeBpAnnotationSpec: helpers.computeBpAnnotationSpec,
  summariseNormality: helpers.summariseNormality,
  summariseEqualVariance: helpers.summariseEqualVariance,
  computeBpSummaryText: helpers.computeBpSummaryText,
  mergeSubgroupAnnotations: helpers.mergeSubgroupAnnotations,
  statsSummaryHeight: helpers.statsSummaryHeight,
};

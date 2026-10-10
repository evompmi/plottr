// Loads the heatmap data pipeline (parseWideMatrix + clustering primitives
// from shared.js / stats.js) plus the tool-specific pure helpers
// (`tools/heatmap/helpers.ts` — normalizeMatrix, autoRange,
// buildDendroLayout, pruneDendroTree, fmtColorbarTick, finiteMean,
// finiteSD, detectRangeSkew + friends) into a Node vm context for fuzzing and unit tests.
// helpers.ts is a pure ES module with no React/DOM use, so we transform
// it to CommonJS with esbuild.

const vm = require("vm");
const { readStatsSource } = require("./stats-source");
const {
  builtins,
  bundleShell,
  makeDomStubs,
  runCjs,
  readCoreSharedSource,
} = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const statsSrc = readStatsSource();
const helpersCjs = bundleShell("heatmap/helpers.ts");

const ctx = { ...builtins(), ...makeDomStubs() };
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  pairwiseDistance: ctx.pairwiseDistance,
  hclust: ctx.hclust,
  kmeans: ctx.kmeans,
  finiteMean: helpers.finiteMean,
  finiteSD: helpers.finiteSD,
  normalizeMatrix: helpers.normalizeMatrix,
  autoRange: helpers.autoRange,
  buildDendroLayout: helpers.buildDendroLayout,
  pruneDendroTree: helpers.pruneDendroTree,
  fmtColorbarTick: helpers.fmtColorbarTick,
  sortedFiniteValues: helpers.sortedFiniteValues,
  quantileSorted: helpers.quantileSorted,
  detectRangeSkew: helpers.detectRangeSkew,
  countClipped: helpers.countClipped,
  SKEW_MIN_CELLS: helpers.SKEW_MIN_CELLS,
  SKEW_LO_Q: helpers.SKEW_LO_Q,
  SKEW_HI_Q: helpers.SKEW_HI_Q,
  SKEW_OCCUPIED_MAX: helpers.SKEW_OCCUPIED_MAX,
  SKEW_OUTLIER_FRAC_MAX: helpers.SKEW_OUTLIER_FRAC_MAX,
  SKEW_FENCE: helpers.SKEW_FENCE,
};

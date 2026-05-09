// Loads the boxplot data pipeline — parser, per-group descriptive stats, the
// full `selectTest → test → post-hoc → bracket layout` stats chain, plus the
// boxplot-specific pure helpers (tools/boxplot/helpers.ts: test/post-hoc
// routers, result formatters, annotation spec, summary-text builders,
// sub-group annotation merge) — into a Node vm context for fuzzing /
// headless unit tests. Same pattern as the other loaders; React is stubbed
// (only StatsTile and BoxplotChart use it, and we don't invoke either — we
// only pull pure helpers out).

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");
const { readStatsSource } = require("./stats-source");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = readStatsSource();

// Stats registry + stats-tile + r-export migrated from shared-*.js
// plain-JS files into _shell/ TypeScript modules in 2026-05's cluster-C
// migration. Each is bundled separately so its named exports can be
// lifted onto the vm ctx the same way the previous globals were.
const registryCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/stats-registry.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;
const statsTileCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/StatsTile.tsx")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  jsx: "transform",
  write: false,
}).outputFiles[0].text;
const bracketLevelsCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/bracket-levels.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;
const powerFromDataCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/power-from-data.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;

// boxplot/helpers.ts now imports from _shell/stats-registry,
// _shell/stats-tile, _shell/r-export — use bundle: true so esbuild
// inlines them.
const helpersCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "boxplot/helpers.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  jsx: "transform",
  write: false,
}).outputFiles[0].text;

const moduleObj = { exports: {} };
const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Number,
  String,
  Array,
  Object,
  Infinity,
  NaN,
  Set,
  Map,
  module: moduleObj,
  exports: moduleObj.exports,
  setTimeout: () => {},
  document: {
    createElement: () => ({}),
    body: { appendChild: () => {}, removeChild: () => {} },
  },
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
  // Minimal React stub — shared-stats-tile.js references React at module
  // scope inside component bodies, not at top level, so the file loads
  // cleanly without ever calling these.
  React: {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useId: () => ":r0:",
    createElement: () => null,
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);

// Bundle the registry first, copy its exports onto the vm ctx so the
// stats-tile bundle (which inlines its own copy of the registry but
// also references `assignBracketLevels` from itself) sees consistent
// state. Then bundle stats-tile and lift `assignBracketLevels` onto
// the ctx for the consumer code below.
const registryModule = { exports: {} };
ctx.module = registryModule;
ctx.exports = registryModule.exports;
vm.runInContext(registryCjs, ctx);
ctx.STATS_TEST_REGISTRY = registryModule.exports.STATS_TEST_REGISTRY;
ctx.STATS_POSTHOC_REGISTRY = registryModule.exports.STATS_POSTHOC_REGISTRY;
ctx.STATS_TESTS_FOR_K2 = registryModule.exports.STATS_TESTS_FOR_K2;
ctx.STATS_TESTS_FOR_K = registryModule.exports.STATS_TESTS_FOR_K;

// `assignBracketLevels` and `computePowerFromData` were extracted from
// the StatsTile bundle into their own _shell modules in 2026-06; bundle
// each separately and lift onto ctx so helpers.ts (which uses both via
// the barrel) resolves them cleanly.
const bracketLevelsModule = { exports: {} };
ctx.module = bracketLevelsModule;
ctx.exports = bracketLevelsModule.exports;
vm.runInContext(bracketLevelsCjs, ctx);
ctx.assignBracketLevels = bracketLevelsModule.exports.assignBracketLevels;

const powerFromDataModule = { exports: {} };
ctx.module = powerFromDataModule;
ctx.exports = powerFromDataModule.exports;
vm.runInContext(powerFromDataCjs, ctx);
ctx.computePowerFromData = powerFromDataModule.exports.computePowerFromData;

// StatsTile bundle still loaded so its top-level evaluation stays
// representative of the production bundle (catches "module crashes at
// import time" regressions); its exports overwrite the previous lifts
// without changing values.
const statsTileModule = { exports: {} };
ctx.module = statsTileModule;
ctx.exports = statsTileModule.exports;
vm.runInContext(statsTileCjs, ctx);

// helpers.ts bundle now lands the boxplot pure helpers.
ctx.module = moduleObj;
ctx.exports = moduleObj.exports;
vm.runInContext(helpersCjs, ctx);

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
  // Boxplot-specific pure helpers.
  formatBpStatShort: moduleObj.exports.formatBpStatShort,
  formatBpResultLine: moduleObj.exports.formatBpResultLine,
  computeBpAnnotationSpec: moduleObj.exports.computeBpAnnotationSpec,
  summariseNormality: moduleObj.exports.summariseNormality,
  summariseEqualVariance: moduleObj.exports.summariseEqualVariance,
  computeBpSummaryText: moduleObj.exports.computeBpSummaryText,
  mergeSubgroupAnnotations: moduleObj.exports.mergeSubgroupAnnotations,
  statsSummaryHeight: moduleObj.exports.statsSummaryHeight,
};

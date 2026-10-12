// Loads the Proportions pure helpers (`tools/proportions/helpers.ts`) and
// report builders (`tools/proportions/reports.ts`) as CommonJS, with the
// stats kernel they import bundled in. Pattern matches volcano-loader.js.

const vm = require("vm");
const { builtins, bundleShell, runCjs, readCoreSharedSource } = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
const helpers = runCjs(ctx, bundleShell("proportions/helpers.ts"));
const reports = runCjs(ctx, bundleShell("proportions/reports.ts"));

module.exports = {
  parseRaw: ctx.parseRaw,
  // proportions/helpers.ts
  parseCountsTable: helpers.parseCountsTable,
  defaultOrder: helpers.defaultOrder,
  applySelection: helpers.applySelection,
  collapseToFocus: helpers.collapseToFocus,
  groupSummaries: helpers.groupSummaries,
  dropEmptyCategories: helpers.dropEmptyCategories,
  analyseTable: helpers.analyseTable,
  bracketPairs: helpers.bracketPairs,
  RATIO_PRESETS: helpers.RATIO_PRESETS,
  parseRatio: helpers.parseRatio,
  gofPerGroup: helpers.gofPerGroup,
  stackSegments: helpers.stackSegments,
  mosaicSpans: helpers.mosaicSpans,
  formatPct: helpers.formatPct,
  resolveColors: helpers.resolveColors,
  // proportions/reports.ts
  buildProportionsCsv: reports.buildProportionsCsv,
  buildProportionsReport: reports.buildProportionsReport,
  buildProportionsRScript: reports.buildProportionsRScript,
};

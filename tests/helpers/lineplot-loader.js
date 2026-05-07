// Loads the lineplot pure helpers (tools/lineplot/helpers.ts) and their shared
// dependencies (tools/shared.js, tools/stats.js) into a Node vm context.
// helpers.ts is a pure-TS ES module that imports from ../_shell/stats-dispatch,
// so we bundle it (inlining the shared dispatcher) to CommonJS with esbuild
// and evaluate it in a vm context that already has the shared globals
// (sampleMean, sampleSD, tinv, bhAdjust, selectTest, tTest, …) available.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
// helpers.ts → ../_shell/stats-dispatch.ts → STATS_TEST_REGISTRY. Bundle
// the registry source into the same script as helpers so the dispatcher's
// free reference resolves at call time.
const registrySrc = fs.readFileSync(path.join(toolsDir, "shared-stats-registry.js"), "utf8");

const helpersCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "lineplot/helpers.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
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
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
// Concatenate registry + helpers into one script so helpers.ts's free
// reference to STATS_TEST_REGISTRY resolves at runtime — `const`
// bindings don't persist across separate runInContext calls.
vm.runInContext(registrySrc + "\n" + helpersCjs, ctx);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  sampleMean: ctx.sampleMean,
  sampleSD: ctx.sampleSD,
  tinv: ctx.tinv,
  bhAdjust: ctx.bhAdjust,
  selectTest: ctx.selectTest,
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  // Helpers now directly testable instead of mirrored in the fuzz script.
  buildLineD: moduleObj.exports.buildLineD,
  formatX: moduleObj.exports.formatX,
  computeSeries: moduleObj.exports.computeSeries,
  computePerXStats: moduleObj.exports.computePerXStats,
};

// Loads the aequorin pure helpers (tools/aequorin/helpers.ts) plus shared.js /
// stats.js into a Node vm context for fuzz / unit tests. helpers.ts is a pure
// ES module (calibration, condition detection, smoothing, time conversion,
// SVG path builders) with no React/DOM dependency, so we transform it to
// CommonJS with esbuild and evaluate it in a vm context that already has the
// shared globals (PALETTE, parseWideMatrix, …) available.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");

// `helpers.ts` imports from `_shell/chart-layout` (audit M7 refactor) so a
// plain `transformSync` leaves an unresolved `require("../_shell/...")` that
// blows up in the vm context. `buildSync` with `bundle: true` inlines the
// cross-module import the same way the production build does.
const helpersCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "aequorin/helpers.ts")],
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
vm.runInContext(helpersCjs, ctx);

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  calibrate: moduleObj.exports.calibrate,
  calibrateHill: moduleObj.exports.calibrateHill,
  calibrateGeneralized: moduleObj.exports.calibrateGeneralized,
  detectConditions: moduleObj.exports.detectConditions,
  smooth: moduleObj.exports.smooth,
  convertTime: moduleObj.exports.convertTime,
  buildAreaD: moduleObj.exports.buildAreaD,
  buildLineD: moduleObj.exports.buildLineD,
  DEFAULT_KR: moduleObj.exports.DEFAULT_KR,
  DEFAULT_KTR: moduleObj.exports.DEFAULT_KTR,
  DEFAULT_KD: moduleObj.exports.DEFAULT_KD,
  DEFAULT_HILL_N: moduleObj.exports.DEFAULT_HILL_N,
};

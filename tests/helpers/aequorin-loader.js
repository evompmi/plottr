// Loads the aequorin pure helpers (`tools/aequorin/helpers.ts`) on top
// of `shared.js` + the stats-* sources for fuzz / unit / property
// tests. helpers.ts has no React/DOM dependency — pure calibration,
// condition detection, smoothing, time conversion, SVG path math.
//
// `bundleShell` follows the helpers.ts → `_shell/chart-layout` /
// `_shell/discrete-palette` import chain so all the shared helpers
// land in one CJS output.

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { readStatsSource } = require("./stats-source");
const { TOOLS_DIR, builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const statsSrc = readStatsSource();
const helpersCjs = bundleShell("aequorin/helpers.ts");

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  calibrate: helpers.calibrate,
  calibrateHill: helpers.calibrateHill,
  calibrateGeneralized: helpers.calibrateGeneralized,
  detectConditions: helpers.detectConditions,
  smooth: helpers.smooth,
  convertTime: helpers.convertTime,
  buildAreaD: helpers.buildAreaD,
  buildLineD: helpers.buildLineD,
  computeAutoYRange: helpers.computeAutoYRange,
  DEFAULT_KR: helpers.DEFAULT_KR,
  DEFAULT_KTR: helpers.DEFAULT_KTR,
  DEFAULT_KD: helpers.DEFAULT_KD,
  DEFAULT_HILL_N: helpers.DEFAULT_HILL_N,
};

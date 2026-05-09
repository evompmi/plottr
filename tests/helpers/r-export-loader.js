// Loads tools/_shell/r-export.ts (compiled to CJS, with stats-registry.ts
// inlined by esbuild's bundle: true) on top of the shared bundle so the
// stats-* function globals (tTest, welchANOVA, …) are available when the
// registry's `run` closures fire. Module is pure string-building, so the
// sandbox is minimal.
//
// Pre-2026-05 cluster C migration the loader read shared-r-export.js
// directly; now r-export lives at tools/_shell/r-export.ts.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");
const { readStatsSource } = require("./stats-source");

const toolsDir = path.join(__dirname, "../../tools");
const statsSrc = readStatsSource();
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");

const rExportCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/r-export.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;

const moduleObj = { exports: {} };
const ctx = {
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  Date,
  console,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Infinity,
  NaN,
  Set,
  Map,
  module: moduleObj,
  exports: moduleObj.exports,
};

vm.createContext(ctx);
vm.runInContext(sharedSrc + "\n" + statsSrc, ctx);
vm.runInContext(rExportCjs, ctx);

module.exports = {
  buildRScript: moduleObj.exports.buildRScript,
  buildRScriptForPower: moduleObj.exports.buildRScriptForPower,
  sanitizeRString: moduleObj.exports.sanitizeRString,
  sanitizeRComment: moduleObj.exports.sanitizeRComment,
  formatRNumber: moduleObj.exports.formatRNumber,
  formatRVector: moduleObj.exports.formatRVector,
};

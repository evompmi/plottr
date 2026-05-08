// Loads tools/shared-r-export.js into a Node vm context and re-exports its
// globals for the test suite. The module is pure string-building (no React,
// no DOM), so the sandbox is minimal — just enough builtins to evaluate the
// file top-to-bottom.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { readStatsSource } = require("./stats-source");

const toolsDir = path.join(__dirname, "../../tools");
// shared-r-export now derives its label maps from STATS_TEST_REGISTRY /
// STATS_POSTHOC_REGISTRY (defined in tools/shared-stats-registry.js).
// Stats.js provides the test functions the registry's `run` closures
// reference. Load order: stats.js → registry → r-export.
const statsSrc = readStatsSource();
const registrySrc = fs.readFileSync(path.join(toolsDir, "shared-stats-registry.js"), "utf8");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const src = fs.readFileSync(path.join(toolsDir, "shared-r-export.js"), "utf8");

const ctx = {
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  Date,
  console,
  // shared.js + stats.js touch a few extras at top level
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Infinity,
  NaN,
  Set,
  Map,
};

vm.createContext(ctx);
// Concatenate so the const-declared registry binding is visible to the
// shared-r-export script's free references (cross-`runInContext` calls
// don't share lexical scope for `const`).
vm.runInContext(sharedSrc + "\n" + statsSrc + "\n" + registrySrc + "\n" + src, ctx);

module.exports = {
  buildRScript: ctx.buildRScript,
  buildRScriptForPower: ctx.buildRScriptForPower,
  sanitizeRString: ctx.sanitizeRString,
  sanitizeRComment: ctx.sanitizeRComment,
  formatRNumber: ctx.formatRNumber,
  formatRVector: ctx.formatRVector,
};

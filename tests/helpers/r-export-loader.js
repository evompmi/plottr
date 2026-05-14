// Loads `tools/_shell/r-export.ts` (with stats-registry.ts inlined by
// esbuild's bundle: true) on top of shared.js + the stats-*.js sources,
// so the registry's `run` closures resolve their `tTest` / `welchANOVA`
// / etc. references at runtime. Pure string-building module — no DOM
// needed beyond the JS built-ins.

const vm = require("vm");
const { readStatsSource } = require("./stats-source");
const { builtins, bundleShell, runCjs, readCoreSharedSource } = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const statsSrc = readStatsSource();
const rExportCjs = bundleShell("_shell/r-export.ts");

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc + "\n" + statsSrc, ctx);
const rExport = runCjs(ctx, rExportCjs);

module.exports = {
  buildRScript: rExport.buildRScript,
  buildRScriptForPower: rExport.buildRScriptForPower,
  sanitizeRString: rExport.sanitizeRString,
  sanitizeRComment: rExport.sanitizeRComment,
  formatRNumber: rExport.formatRNumber,
  formatRVector: rExport.formatRVector,
};

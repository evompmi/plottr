// Loads the heatmap data pipeline (parseWideMatrix + clustering primitives
// from shared.js / stats.js) plus the tool-specific pure helpers
// (`tools/heatmap/helpers.ts` — normalizeMatrix, autoRange,
// buildDendroLayout, pruneDendroTree, fmtColorbarTick, finiteMean,
// finiteSD) into a Node vm context for fuzzing and unit tests.
// helpers.ts is a pure ES module with no React/DOM use, so we transform
// it to CommonJS with esbuild.

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { readStatsSource } = require("./stats-source");
const { TOOLS_DIR, builtins, bundleShell, makeDomStubs, runCjs } = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const statsSrc = readStatsSource();
const helpersCjs = bundleShell("heatmap/helpers.ts", { transform: true });

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
};

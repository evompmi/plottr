// Loads the venn pure helpers (`tools/venn/helpers.ts` and its
// cohesion-split siblings under `tools/venn/*.ts`) and their shared
// dependencies (`tools/shared.js`, `tools/stats.js`) into a Node vm
// context. helpers.ts is a thin barrel that re-exports from
// constants.ts / set-math.ts / geometry.ts / areas.ts / layout.ts /
// centroids.ts — bundle: true inlines the sibling modules into a single
// CJS output the vm can run.

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { readStatsSource } = require("./stats-source");
const { TOOLS_DIR, builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const statsSrc = readStatsSource();
const helpersCjs = bundleShell("venn/helpers.ts");

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  parseRaw: ctx.parseRaw,
  parseSetData: ctx.parseSetData,
  computeIntersections: helpers.computeIntersections,
  circleOverlapArea: helpers.circleOverlapArea,
  solveDistance: helpers.solveDistance,
  circleIntersectionPoints: helpers.circleIntersectionPoints,
  buildRegionPaths: helpers.buildRegionPaths,
  computeAllRegionAreas: helpers.computeAllRegionAreas,
  tripleIntersectionArea: helpers.tripleIntersectionArea,
  detectLongFormat: helpers.detectLongFormat,
};

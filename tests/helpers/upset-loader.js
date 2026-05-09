// Loads the UpSet pure helpers (`tools/upset/helpers.ts`) and their
// shared dependencies (`tools/shared.js`) into a Node vm context.
// helpers.ts is a pure-TS ES module with no React/DOM use, so we
// transform it to CommonJS with esbuild and evaluate it in a vm context
// that already has the shared globals (svgSafeId, niceStep, parseSetData,
// parseLongFormatSets) available.

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { TOOLS_DIR, builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const helpersCjs = bundleShell("upset/helpers.ts", { transform: true });

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  parseRaw: ctx.parseRaw,
  parseSetData: ctx.parseSetData,
  parseLongFormatSets: ctx.parseLongFormatSets,
  computeMemberships: helpers.computeMemberships,
  enumerateIntersections: helpers.enumerateIntersections,
  sortIntersections: helpers.sortIntersections,
  truncateIntersections: helpers.truncateIntersections,
  intersectionLabel: helpers.intersectionLabel,
  intersectionShortLabel: helpers.intersectionShortLabel,
  intersectionFilenamePart: helpers.intersectionFilenamePart,
  buildBarTicks: helpers.buildBarTicks,
};

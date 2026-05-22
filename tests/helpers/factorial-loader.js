// Loads the factorial pure helpers (`tools/factorial/helpers.ts`) and the
// shared kernel (`tools/_core/shared.ts`, `tools/_core/stats/*.ts`) into a
// Node vm context. Mirrors the venn / boxplot loaders — bundles helpers.ts
// to CJS via esbuild, evaluates it under `vm.runInContext` with the
// kernel pre-loaded so callers can pull `parseRaw`, `twoWayANOVA`, etc.
// directly off the loader.

const vm = require("vm");
const { readStatsSource } = require("./stats-source");
const { builtins, bundleShell, runCjs, readCoreSharedSource } = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const statsSrc = readStatsSource();
const helpersCjs = bundleShell("factorial/helpers.ts");
const handoffCjs = bundleShell("factorial/handoff.ts");

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
const helpers = runCjs(ctx, helpersCjs);
const handoff = runCjs(ctx, handoffCjs);

module.exports = {
  // Kernel — surfaced for parse-pipeline property tests.
  parseRaw: ctx.parseRaw,
  autoDetectSep: ctx.autoDetectSep,
  fixDecimalCommas: ctx.fixDecimalCommas,
  isNumericValue: ctx.isNumericValue,
  toNumericValue: ctx.toNumericValue,
  twoWayANOVA: ctx.twoWayANOVA,
  shapiroWilk: ctx.shapiroWilk,
  leveneTest: ctx.leveneTest,
  // Factorial-specific pure helpers.
  summarizeDesign: helpers.summarizeDesign,
  validateDesign: helpers.validateDesign,
  FACTORIAL_ROLE_COLORS: helpers.FACTORIAL_ROLE_COLORS,
  // Handoff builder.
  buildHandoffPayload: handoff.buildHandoffPayload,
};

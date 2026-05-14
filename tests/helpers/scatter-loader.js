// Loads the scatter data pipeline for fuzz / unit / property / mutation
// tests.
//
// Hybrid pattern (vm + require):
//
//   1. shared.js + stats.js → loaded into a Node vm context. They use
//      script-mode top-level `const` / `function` declarations and are
//      consumed as globals across the codebase, so vm.runInContext is
//      the right harness — the alternative (rewrite as ES modules) is
//      out of scope for the test infra.
//
//   2. scatter/helpers.ts → compiled to CommonJS and `require()`d via
//      a stable temp path under `tests/.tmp/` (`requireViaTmpFile`).
//      vm.runInContext hides source from Stryker's per-test coverage
//      instrumentation, so mutants would be reported as no-coverage
//      and skipped. require()ing makes the file part of the module
//      dependency graph; coverage works.
//
// Safe for scatter specifically because its helpers.ts uses no free
// variables from shared.js / stats.js (only Math and Number built-ins).

const vm = require("vm");
const { readStatsSource } = require("./stats-source");
const {
  builtins,
  bundleShell,
  requireViaTmpFile,
  readCoreSharedSource,
} = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const statsSrc = readStatsSource();

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);

// `const` bindings inside vm.runInContext stay script-scoped (they
// don't become properties of the context object), so ctx.COLOR_PALETTES
// is undefined even though the declaration succeeded. Re-evaluate to
// pull the value out. Function declarations are fine via ctx.* because
// they're hoisted to the global object.
const COLOR_PALETTES = vm.runInContext("COLOR_PALETTES", ctx);

const scatterHelpers = requireViaTmpFile(
  "scatter-helpers",
  bundleShell("scatter/helpers.ts", { transform: true })
);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  interpolateColor: ctx.interpolateColor,
  COLOR_PALETTES,
  fmtTick: scatterHelpers.fmtTick,
  SHAPES: scatterHelpers.SHAPES,
  computeLinearRegression: scatterHelpers.computeLinearRegression,
};

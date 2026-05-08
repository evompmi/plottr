// Loads the scatter data pipeline for fuzz / unit / property tests.
//
// Two paths in this file, deliberately:
//
//   1. shared.js + stats.js → loaded into a Node vm context. They use
//      script-mode top-level `const` / `function` declarations and are
//      consumed as globals across the codebase, so vm.runInContext is
//      the right harness — the alternative (rewrite as ES modules) is
//      out of scope for the test infra.
//
//   2. scatter/helpers.ts → compiled to CommonJS and `require()`d via
//      a stable temp path under `tests/.tmp/`. Why not vm.runInContext
//      here too: Stryker's per-test coverage instrumentation injects
//      a `__stryker__` global to record which tests touch which lines,
//      and writes from inside a vm child context land on a different
//      `__stryker__` than the test runner sees. That makes the
//      property and unit tests look like they have zero coverage of
//      helpers.ts mutants, and Stryker skips them. Loading the
//      transformed source via Node's require() makes the file part
//      of the module dependency graph — Stryker can see the link and
//      coverage works.
//
//      This split is safe for scatter specifically because
//      scatter/helpers.ts uses no free variables from shared.js /
//      stats.js (only Math and Number built-ins). For other tools
//      whose helpers reference shared globals as free vars, the
//      vm-context path is still required for those globals to
//      resolve.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");

// ── Path 1: shared.js + stats.js via vm.runInContext ─────────────────────

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
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);

// `const` bindings inside vm.runInContext stay script-scoped (they
// don't become properties of the context object), so ctx.COLOR_PALETTES
// is `undefined` even though the declaration succeeded. Re-evaluate to
// pull the values out. Function declarations are fine via ctx.* because
// they're hoisted to the global object.
const COLOR_PALETTES = vm.runInContext("COLOR_PALETTES", ctx);

// ── Path 2: scatter/helpers.ts via require() (Stryker-visible) ───────────

const tmpDir = path.join(__dirname, "../.tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpHelpersFile = path.join(tmpDir, "scatter-helpers.cjs");

const helpersSrc = fs.readFileSync(path.join(toolsDir, "scatter/helpers.ts"), "utf8");
const helpersCjs = esbuild.transformSync(helpersSrc, {
  loader: "ts",
  format: "cjs",
}).code;
fs.writeFileSync(tmpHelpersFile, helpersCjs);

// Bust Node's require cache — Stryker mutates `tools/scatter/helpers.ts`
// on disk in its sandbox, so each test-runner cold-start should see a
// freshly-transformed copy.
delete require.cache[tmpHelpersFile];
const scatterHelpers = require(tmpHelpersFile);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  interpolateColor: ctx.interpolateColor,
  COLOR_PALETTES,
  // Scatter-specific pure helpers, exposed through Node's module graph
  // so Stryker's per-test coverage tracking can see them.
  fmtTick: scatterHelpers.fmtTick,
  SHAPES: scatterHelpers.SHAPES,
  computeLinearRegression: scatterHelpers.computeLinearRegression,
};

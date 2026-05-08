// Loads the lineplot pure helpers (tools/lineplot/helpers.ts) and their
// shared dependencies (tools/shared.js, tools/stats.js, the stats
// registry) for fuzz / unit / property / mutation tests.
//
// Hybrid pattern, deliberately:
//
//   1. shared.js + stats.js + shared-stats-registry.js → loaded into a
//      Node vm context. They use script-mode top-level `const` /
//      `function` declarations and are consumed as globals across the
//      codebase, so vm.runInContext is the right harness.
//
//   2. lineplot/helpers.ts → bundled to CommonJS with esbuild
//      (inlining `_shell/stats-dispatch.ts` and `_shell/chart-layout.ts`)
//      and `require()`d via a stable temp path under `tests/.tmp/`.
//      This makes the file part of Node's module dependency graph, so
//      Stryker's per-test coverage instrumentation can trace
//      property-test → helpers.ts links — without this, the
//      vm.runInContext path hides the link and Stryker reports the
//      property tests as having zero coverage of the mutated source.
//
//      Caveat — helpers.ts uses several shared-globals as *free
//      variables* (sampleMean / sampleSD / tinv / selectTest /
//      bhAdjust, plus STATS_TEST_REGISTRY consumed indirectly via the
//      bundled stats-dispatch). require()'d code runs in its own
//      module scope where those globals aren't visible. Bridge them
//      onto `globalThis` from the vm ctx before requiring, so the free
//      references resolve. Slightly leaky (the assignments persist for
//      the test process lifetime), but Plöttr's stats globals are
//      stable across loaders so cross-test interference is a non-issue.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");
const { readStatsSource } = require("./stats-source");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = readStatsSource();
const registrySrc = fs.readFileSync(path.join(toolsDir, "shared-stats-registry.js"), "utf8");

// ── Path 1: shared.js + stats.js + registry via vm.runInContext ────────

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
// Run registry in same call as a small forwarding suffix that copies
// its `const`-declared bindings (STATS_TEST_REGISTRY,
// STATS_POSTHOC_REGISTRY, …) onto `this` so subsequent context
// reads can pick them up via vm.runInContext("…", ctx).
vm.runInContext(
  registrySrc +
    "\nthis.STATS_TEST_REGISTRY = STATS_TEST_REGISTRY;" +
    "\nthis.STATS_POSTHOC_REGISTRY = STATS_POSTHOC_REGISTRY;",
  ctx
);

// ── Bridge globals from ctx onto globalThis ───────────────────────────
//
// The require()'d helpers below resolve free-variable references against
// the test process's global scope (`globalThis`), not against `ctx`.
// Copy the names helpers.ts and the bundled `_shell/stats-dispatch`
// reference at runtime.
const NEEDED_GLOBALS = [
  "sampleMean",
  "sampleSD",
  "tinv",
  "bhAdjust",
  "selectTest",
  "tTest",
  "mannWhitneyU",
  "oneWayANOVA",
  "welchANOVA",
  "kruskalWallis",
  "STATS_TEST_REGISTRY",
  "STATS_POSTHOC_REGISTRY",
  "tukeyHSD",
  "gamesHowell",
  "dunnTest",
];
for (const name of NEEDED_GLOBALS) {
  if (ctx[name] !== undefined) {
    globalThis[name] = ctx[name];
  }
}

// ── Path 2: lineplot/helpers.ts via require() (Stryker-visible) ───────

const tmpDir = path.join(__dirname, "../.tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const tmpHelpersFile = path.join(tmpDir, "lineplot-helpers.cjs");

const helpersCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "lineplot/helpers.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;
fs.writeFileSync(tmpHelpersFile, helpersCjs);

// Bust Node's require cache — Stryker mutates `tools/lineplot/helpers.ts`
// on disk in its sandbox, so each test-runner cold-start should see a
// freshly-transformed copy.
delete require.cache[tmpHelpersFile];
const lineplotHelpers = require(tmpHelpersFile);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  sampleMean: ctx.sampleMean,
  sampleSD: ctx.sampleSD,
  tinv: ctx.tinv,
  bhAdjust: ctx.bhAdjust,
  selectTest: ctx.selectTest,
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  // Lineplot-specific pure helpers, exposed through Node's module
  // graph so Stryker's per-test coverage tracking can see them.
  buildLineD: lineplotHelpers.buildLineD,
  formatX: lineplotHelpers.formatX,
  computeSeries: lineplotHelpers.computeSeries,
  computePerXStats: lineplotHelpers.computePerXStats,
};

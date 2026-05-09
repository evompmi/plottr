// Loads the lineplot pure helpers (`tools/lineplot/helpers.ts`) and
// their shared dependencies (`tools/shared.js`, `tools/stats.js`, the
// stats registry) for fuzz / unit / property / mutation tests.
//
// Hybrid pattern (vm + require + globalThis bridge):
//
//   1. shared.js + stats.js + _shell/stats-registry.ts → loaded into
//      a Node vm context. Plain-JS sources use script-mode top-level
//      declarations and are consumed as globals; the registry CJS
//      bundle threads its exports through a fresh `module.exports`
//      slot.
//
//   2. lineplot/helpers.ts → bundled (inlines `_shell/stats-dispatch.ts`
//      and `_shell/chart-layout.ts`) and `require()`d via a stable temp
//      path. `requireViaTmpFile` lets Stryker's per-test coverage
//      instrumentation see the mutated source — vm.runInContext would
//      hide it.
//
//   3. globalThis bridge — helpers.ts and the bundled stats-dispatch
//      reference shared globals (sampleMean / selectTest / bhAdjust /
//      STATS_TEST_REGISTRY / …) as *free variables*. require()'d code
//      resolves those against the test process's globalThis, not the
//      vm ctx, so we copy the names across before requiring. Slightly
//      leaky but Plöttr's stats globals are stable across loaders so
//      cross-test interference is a non-issue.

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { readStatsSource } = require("./stats-source");
const {
  TOOLS_DIR,
  builtins,
  bundleShell,
  requireViaTmpFile,
  runCjs,
} = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const statsSrc = readStatsSource();
const registryCjs = bundleShell("_shell/stats-registry.ts");

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
const registry = runCjs(ctx, registryCjs);

// Lift the registry exports onto ctx so the rest of the loader (and
// the globalThis bridge below) can pick them up by name.
ctx.STATS_TEST_REGISTRY = registry.STATS_TEST_REGISTRY;
ctx.STATS_POSTHOC_REGISTRY = registry.STATS_POSTHOC_REGISTRY;
ctx.STATS_TESTS_FOR_K2 = registry.STATS_TESTS_FOR_K2;
ctx.STATS_TESTS_FOR_K = registry.STATS_TESTS_FOR_K;

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

const lineplotHelpers = requireViaTmpFile("lineplot-helpers", bundleShell("lineplot/helpers.ts"));

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

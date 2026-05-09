// Loads `tools/_shell/stats-dispatch.ts` (with stats-registry.ts inlined
// by esbuild's bundle: true) on top of `shared.bundle.js`. The bundle
// supplies the stats-* function globals (tTest / welchANOVA / …) the
// registry's `run` closures call at runtime; the dispatcher exposes
// runTest / runPostHoc / postHocForTest. The registry is bundled a
// second time so tests that import STATS_TEST_REGISTRY etc. directly
// can read them off a known module.exports slot.

const vm = require("vm");
const {
  builtins,
  bundleShell,
  makeDomStubs,
  MINIMAL_REACT,
  readSharedBundleSrc,
  runCjs,
} = require("./_shell-test-utils");

const bundleSrc = readSharedBundleSrc();
const dispatchCjs = bundleShell("_shell/stats-dispatch.ts");
const registryCjs = bundleShell("_shell/stats-registry.ts");

const ctx = {
  ...builtins(),
  ...makeDomStubs(),
  React: MINIMAL_REACT,
};
vm.createContext(ctx);
vm.runInContext(bundleSrc, ctx);
const dispatch = runCjs(ctx, dispatchCjs);
const registry = runCjs(ctx, registryCjs);

module.exports = {
  runTest: dispatch.runTest,
  runPostHoc: dispatch.runPostHoc,
  postHocForTest: dispatch.postHocForTest,
  STATS_TEST_REGISTRY: registry.STATS_TEST_REGISTRY,
  STATS_POSTHOC_REGISTRY: registry.STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K2: registry.STATS_TESTS_FOR_K2,
  STATS_TESTS_FOR_K: registry.STATS_TESTS_FOR_K,
  // Stats-* function globals — declared in the bundle as `function X(...)
  // { ... }` so they live on the vm context object directly.
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  tukeyHSD: ctx.tukeyHSD,
  gamesHowell: ctx.gamesHowell,
  dunnTest: ctx.dunnTest,
};

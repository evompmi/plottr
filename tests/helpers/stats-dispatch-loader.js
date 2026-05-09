// Loads tools/_shell/stats-dispatch.ts (compiled to CJS, with its
// stats-registry.ts dependency inlined by esbuild) on top of the shared
// bundle. The bundle is what every browser tool loads at runtime, so
// reading the stats globals (tTest, welchANOVA, etc.) from it matches
// production exactly.
//
// As of the 2026-05 cluster-C migration, `STATS_TEST_REGISTRY` and
// friends live in `tools/_shell/stats-registry.ts` (typed module)
// rather than the shared bundle. esbuild.buildSync with `bundle: true`
// inlines the import so the dispatcher's `STATS_TEST_REGISTRY`
// reference resolves; the loader separately bundles stats-registry.ts
// again to expose the registry constants to test files that need
// direct access.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const bundlePath = path.join(toolsDir, "shared.bundle.js");
if (!fs.existsSync(bundlePath)) {
  throw new Error(
    "stats-dispatch-loader: tools/shared.bundle.js is missing. Run `npm run build:shared` (or any build / test) to generate it."
  );
}
const bundleSrc = fs.readFileSync(bundlePath, "utf8");

const dispatchCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/stats-dispatch.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;

// Stats-registry needs a separate bundle pass with its own module.exports
// slot so the loader can read STATS_TEST_REGISTRY / etc. as direct exports
// for tests that import them by name.
const registryCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/stats-registry.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;

// The bundle's theme code touches `document` / `window` / `localStorage`
// at top level; provide minimal stubs so vm.runInContext doesn't throw.
const moduleObj = { exports: {} };
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
  console,
  setTimeout: () => {},
  clearTimeout: () => {},
  module: moduleObj,
  exports: moduleObj.exports,
  document: {
    createElement: () => ({}),
    documentElement: {
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
    },
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: "visible",
  },
  window: {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  // The bundle pulls in shared-svg-legend, shared-color-input, etc. which
  // call React.createElement at module-load and inside helper closures.
  // Same minimal stub discrete-palette-loader uses.
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
  React: {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useId: () => ":r0:",
    createElement: () => null,
    memo: (fn) => fn,
    Component: class {
      constructor(props) {
        this.props = props;
        this.state = {};
      }
      setState() {}
    },
  },
};

vm.createContext(ctx);
// Load shared bundle first so stats-* globals (tTest, welchANOVA, …)
// attach to the vm context; the registry's bundled output picks them up
// at runtime via the `declare const tTest: …` ambient stubs.
vm.runInContext(bundleSrc, ctx);

vm.runInContext(dispatchCjs, ctx);
const dispatchExports = moduleObj.exports;

// Reset module.exports for the second bundle (registry).
moduleObj.exports = {};
ctx.exports = moduleObj.exports;
vm.runInContext(registryCjs, ctx);
const registryExports = moduleObj.exports;

module.exports = {
  runTest: dispatchExports.runTest,
  runPostHoc: dispatchExports.runPostHoc,
  postHocForTest: dispatchExports.postHocForTest,
  STATS_TEST_REGISTRY: registryExports.STATS_TEST_REGISTRY,
  STATS_POSTHOC_REGISTRY: registryExports.STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K2: registryExports.STATS_TESTS_FOR_K2,
  STATS_TESTS_FOR_K: registryExports.STATS_TESTS_FOR_K,
  // Direct stats.js function globals are on `ctx` because they're
  // declared with `function`, which (unlike `const`) attaches to the
  // global object.
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  tukeyHSD: ctx.tukeyHSD,
  gamesHowell: ctx.gamesHowell,
  dunnTest: ctx.dunnTest,
};

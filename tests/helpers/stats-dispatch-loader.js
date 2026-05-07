// Loads tools/_shell/stats-dispatch.ts (compiled to CJS) and the shared
// bundle into a single vm context. The bundle is what every browser tool
// loads at runtime, so reading the registry / stats globals from it
// matches production exactly.
//
// Why the bundle and not separate vm.runInContext calls per shared file:
// the registry uses `const STATS_TEST_REGISTRY = …`, and `const`
// bindings in vm scripts don't bleed across `runInContext` calls.
// Concatenating the registry + dispatcher into the same script
// execution (or using the bundle, which is already concatenated) is the
// only way the dispatcher can resolve `STATS_TEST_REGISTRY` as a free
// variable. Same constraint discrete-palette-loader.js handles.

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
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
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
// Concatenate bundle + dispatcher into one script so they share the
// same lexical scope; the dispatcher's free reference to
// STATS_TEST_REGISTRY then resolves to the const binding inside the
// bundle.
vm.runInContext(bundleSrc + "\n" + dispatchCjs, ctx);

// `const` bindings declared at the top of a vm-loaded script don't
// become properties of the context object — only `var` and `function`
// do. Use vm.runInContext("name", ctx) to read them out of the script's
// lexical scope. Same pattern as discrete-palette-loader.js.
module.exports = {
  runTest: moduleObj.exports.runTest,
  runPostHoc: moduleObj.exports.runPostHoc,
  postHocForTest: moduleObj.exports.postHocForTest,
  STATS_TEST_REGISTRY: vm.runInContext("STATS_TEST_REGISTRY", ctx),
  STATS_POSTHOC_REGISTRY: vm.runInContext("STATS_POSTHOC_REGISTRY", ctx),
  STATS_TESTS_FOR_K2: vm.runInContext("STATS_TESTS_FOR_K2", ctx),
  STATS_TESTS_FOR_K: vm.runInContext("STATS_TESTS_FOR_K", ctx),
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

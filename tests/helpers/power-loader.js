// Loads tools/power-app.tsx into a Node vm context and exposes the
// calculator's TESTS registry plus the helper effect-size converters
// (dFromMeans, fFromGroupMeans, wFromProportions). The distribution
// primitives that power-app references (normcdf, tcdf, fcdf,
// powerAnova, powerTwoSample, ncf_sf, etc.) come from
// tests/helpers/stats-loader.js — i.e. they're require()'d through
// Node's module graph, not vm-loaded inline.
//
// Why this layering matters for Stryker. The previous version of this
// loader concatenated stats.js text with the power-app bundle and ran
// the lot in a vm context. That works — but Stryker's per-test
// coverage instrumentation injects a `__stryker__` global into the
// mutated source to record which tests touch which lines, and writes
// from inside a vm child context land on a different `__stryker__`
// than the test runner. Result: every line that's only exercised by
// power.test.js / power.property.test.js (the entire non-central
// distribution family — ncchi2cdf, nctcdf, ncf_sf — plus every
// powerXxx function and its callees) showed as no-coverage in
// Stryker's report, even though the tests do exercise them. That
// hid ~120 mutants.
//
// By delegating stats.js to stats-loader (which require()'s a temp
// .cjs wrapper of stats.js, putting it in Node's module graph), every
// call from power-app's vm-IIFE into a stats function dispatches into
// instrumented code Stryker can see. Power-app itself is still
// vm-loaded — it's React TSX with its own scope and JSX usage, so
// keeping it in a vm sandbox is the cleanest fit, and there's nothing
// in tools/power-app.tsx that Stryker is mutating anyway (the
// `mutate:` scope is tools/stats.js).
//
// Why an esbuild bundle: power-app.tsx is React source — JSX, type
// annotations, and `import` statements that the vm can't evaluate
// natively. We compile to an IIFE in-memory and splice symbol-export
// assignments inside the IIFE so the closures land on the context.

const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const stats = require("./stats-loader.js");

const powerAppPath = path.join(__dirname, "../../tools/power-app.tsx");

const powerBuild = esbuild.buildSync({
  entryPoints: [powerAppPath],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "transform",
  minify: false,
  sourcemap: false,
  target: "es2022",
});

const powerRaw = powerBuild.outputFiles[0].text;
const closingIdx = powerRaw.lastIndexOf("})();");
const exportLine =
  "this.TESTS = TESTS; this.dFromMeans = dFromMeans; " +
  "this.fFromGroupMeans = fFromGroupMeans; this.wFromProportions = wFromProportions;";
const powerCode =
  closingIdx >= 0
    ? powerRaw.slice(0, closingIdx) + exportLine + powerRaw.slice(closingIdx)
    : powerRaw + "\n" + exportLine;

// Build the vm context. Stats primitives come from the require()'d
// stats-loader (Stryker-visible); React/DOM stubs and the handful of
// shared.js helpers power-app references come from inline minimums.
//
// `ctx` is set up as a plain object first, then `vm.createContext`
// promotes it to a contextified object the bundle can run in. Power-
// app.tsx's compiled IIFE references stats functions as free
// variables — when those names aren't declared inside the IIFE, they
// resolve through the vm context's prototype chain, finding the
// functions we put on `ctx` from the stats-loader. Critically, since
// those functions came from a require()'d module, calling them
// re-enters the (Stryker-instrumented) module — so coverage flows
// through.
const ctx = {
  // Stats primitives — see comment block above.
  ...stats,
  // Globals power-app's IIFE assumes are present.
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
  // Minimal React stubs — power-app.tsx references React at module
  // scope inside component bodies, not at top level, so the file
  // loads cleanly without ever calling these.
  React: {
    createElement: () => null,
    useState: () => [null, () => {}],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
    forwardRef: (fn) => fn,
  },
  ReactDOM: { render: () => {}, createRoot: () => ({ render: () => {} }) },
  document: { getElementById: () => ({}) },
  toolIcon: () => null,
  // shared.js helpers referenced by power-app — provide minimal
  // implementations; the property tests exercise the math, not these.
  makeTicks: (min, max, n) => {
    const step = (max - min) / n;
    const ticks = [];
    for (let i = 0; i <= n; i++) ticks.push(min + step * i);
    return ticks;
  },
  downloadSvg: () => {},
  PageHeader: () => null,
  computeLegendHeight: () => 0,
  ErrorBoundary: ({ children }) => children,
};

vm.createContext(ctx);
vm.runInContext(powerCode, ctx);

module.exports = {
  // Power calculator registry
  TESTS: ctx.TESTS,
  // Effect-size converters
  dFromMeans: ctx.dFromMeans,
  fFromGroupMeans: ctx.fFromGroupMeans,
  wFromProportions: ctx.wFromProportions,
  // Underlying stats primitives — useful for the property tests to
  // cross-check power against the cdf they're built on. These come
  // through stats-loader (require-based) so they're the same
  // instances Stryker has instrumented.
  normcdf: stats.normcdf,
  norminv: stats.norminv,
  tcdf: stats.tcdf,
  tinv: stats.tinv,
  fcdf: stats.fcdf,
  chi2cdf: stats.chi2cdf,
  chi2inv: stats.chi2inv,
  bisect: stats.bisect,
};

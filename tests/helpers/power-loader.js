// Loads tools/power-app.tsx into a Node vm context (with the
// distribution primitives from tools/stats.js pre-loaded) and exposes
// the calculator's TESTS registry plus the helper effect-size
// converters (dFromMeans, fFromGroupMeans, wFromProportions).
//
// Why an esbuild bundle: power-app.tsx is React source — JSX, type
// annotations, and `import` statements that the vm can't evaluate
// natively. We compile to an IIFE in-memory and splice symbol-export
// assignments inside the IIFE so the closures land on the context.
// Same trick `tests/power.test.js` has used inline since the SPA
// migration; lifted here so future stats / power property tests can
// reuse it.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const statsCode = fs.readFileSync(path.join(__dirname, "../../tools/stats.js"), "utf8");
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

const code = statsCode + "\n" + powerCode;

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
vm.runInContext(code, ctx);

module.exports = {
  // Power calculator registry
  TESTS: ctx.TESTS,
  // Effect-size converters
  dFromMeans: ctx.dFromMeans,
  fFromGroupMeans: ctx.fFromGroupMeans,
  wFromProportions: ctx.wFromProportions,
  // Underlying stats primitives — useful for the property tests to
  // cross-check power against the cdf they're built on.
  normcdf: ctx.normcdf,
  norminv: ctx.norminv,
  tcdf: ctx.tcdf,
  tinv: ctx.tinv,
  fcdf: ctx.fcdf,
  chi2cdf: ctx.chi2cdf,
  chi2inv: ctx.chi2inv,
  bisect: ctx.bisect,
};

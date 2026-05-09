// Loads the Volcano pure helpers (`tools/volcano/helpers.ts`) into a
// Node vm context. Pattern matches `tests/helpers/upset-loader.js`:
// transform the TS module to CommonJS via esbuild, then evaluate it in
// a vm context that already has the shared globals (parseRaw / parseData
// / scanForFormulaInjection) available — though the volcano helpers
// happen not to need any of them, we still load tools/shared.js for
// future-proofing.

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { TOOLS_DIR, builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const helpersCjs = bundleShell("volcano/helpers.ts", { transform: true });

const ctx = builtins();
vm.createContext(ctx);
// vm.runInContext puts top-level `const` / `let` declarations in the
// script's lexical scope, NOT on the context object. shared.js declares
// `COLOR_PALETTES` and `PALETTE` as `const`, so without an explicit
// re-bind they're unreachable from outside the script. The trailing
// assignments expose them on the context (this === global inside a vm
// script) so the tests can read them via `ctx.X`.
vm.runInContext(
  sharedSrc + "\nthis.COLOR_PALETTES = COLOR_PALETTES;\nthis.PALETTE = PALETTE;\n",
  ctx
);
const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  // shared.js re-exports kept for parity with sibling loaders
  parseRaw: ctx.parseRaw,
  parseData: ctx.parseData,
  // For test convenience — buildColorMap takes the interpolator + a
  // palette-stop array as args, and the chart caller pulls these from
  // the shared globals. We re-export the same globals here so tests
  // can pass them through without re-implementing the interpolation.
  interpolateColor: ctx.interpolateColor,
  COLOR_PALETTES: ctx.COLOR_PALETTES,
  PALETTE: ctx.PALETTE,
  // volcano/helpers.ts exports
  VOLCANO_DEFAULT_COLORS: helpers.VOLCANO_DEFAULT_COLORS,
  classifyPoint: helpers.classifyPoint,
  computePFloor: helpers.computePFloor,
  negLog10P: helpers.negLog10P,
  countClamped: helpers.countClamped,
  summarize: helpers.summarize,
  autoDetectColumns: helpers.autoDetectColumns,
  pickTopLabels: helpers.pickTopLabels,
  layoutLabels: helpers.layoutLabels,
  approxMonoCharWidth: helpers.approxMonoCharWidth,
  detectColorMapType: helpers.detectColorMapType,
  buildColorMap: helpers.buildColorMap,
  buildSizeMap: helpers.buildSizeMap,
  matchPointsByLabel: helpers.matchPointsByLabel,
  buildPoints: helpers.buildPoints,
  eligibleColumns: helpers.eligibleColumns,
};

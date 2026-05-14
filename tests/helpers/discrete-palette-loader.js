// Loads `tools/_shell/discrete-palette.ts` on top of the migrated
// `_core/shared.ts` (for `COLOR_PALETTES` / `interpolateColor` / `PALETTE`).
// Pre-migration this read the concatenated shared.bundle.js for its
// side-effecting top-level globals; the new TS module's trailing
// globalThis-shim block does the same thing under the same vm semantics.
//
// Hybrid pattern: shared.ts is run for its side-effecting globals; the typed
// discrete-palette module is run for its named exports.

const vm = require("vm");
const {
  builtins,
  bundleShell,
  makeDomStubs,
  MINIMAL_REACT,
  readCoreSharedSource,
  runCjs,
} = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const paletteCjs = bundleShell("_shell/discrete-palette.ts");

const ctx = {
  ...builtins(),
  ...makeDomStubs(),
  React: MINIMAL_REACT,
};
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
const palette = runCjs(ctx, paletteCjs);

module.exports = {
  // PALETTE is exported by `_core/shared.ts` and pushed onto globalThis by
  // its trailing shim, so reading the ctx property directly works now (no
  // more vm.runInContext bridge needed).
  PALETTE: ctx.PALETTE,
  DISCRETE_PALETTES: palette.DISCRETE_PALETTES,
  COLORBLIND_SAFE_PALETTES: palette.COLORBLIND_SAFE_PALETTES,
  resolveDiscretePalette: palette.resolveDiscretePalette,
  applyDiscretePalette: palette.applyDiscretePalette,
  buildGgplot2Hue: palette.buildGgplot2Hue,
  buildViridisDiscrete: palette.buildViridisDiscrete,
};

// Loads `tools/_shell/discrete-palette.ts` on top of `_core/shared.ts`
// (for `COLOR_PALETTES` / `interpolateColor` / `PALETTE`).
//
// Hybrid pattern: shared.ts is run for its globalThis-populating side
// effects so the discrete-palette module's `import { COLOR_PALETTES, … }`
// references resolve via the vm context; the discrete-palette bundle is
// then run for its own named exports.

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

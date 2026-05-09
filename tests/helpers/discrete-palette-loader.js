// Loads `tools/_shell/discrete-palette.ts` on top of `shared.bundle.js`
// (for `COLOR_PALETTES` / `interpolateColor` / `PALETTE` — still
// plain-JS globals from shared.js) so the test suite sees the same
// resolved palettes the browser does.
//
// Hybrid pattern: bundle is run for its side-effecting top-level globals;
// the typed module is run for its named exports.

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
const paletteCjs = bundleShell("_shell/discrete-palette.ts", { transform: true });

const ctx = {
  ...builtins(),
  ...makeDomStubs(),
  React: MINIMAL_REACT,
};
vm.createContext(ctx);
vm.runInContext(bundleSrc, ctx);
const palette = runCjs(ctx, paletteCjs);

module.exports = {
  // PALETTE is a `const` binding inside shared.js — not a context property.
  // Read it via vm.runInContext so the test suite can access it by name.
  PALETTE: vm.runInContext("PALETTE", ctx),
  DISCRETE_PALETTES: palette.DISCRETE_PALETTES,
  COLORBLIND_SAFE_PALETTES: palette.COLORBLIND_SAFE_PALETTES,
  resolveDiscretePalette: palette.resolveDiscretePalette,
  applyDiscretePalette: palette.applyDiscretePalette,
  buildGgplot2Hue: palette.buildGgplot2Hue,
  buildViridisDiscrete: palette.buildViridisDiscrete,
};

// Bundles the `_core/stats/*` barrel for the test loaders. Two output
// formats: IIFE for the `vm.runInContext`-based loaders (the synthetic
// `Object.assign(globalThis, __plottrStats)` footer spreads named
// exports onto the vm context's globalThis), and CJS for the
// Stryker-instrumented loaders that `require()` the result via a temp
// file (see `tests/helpers/stats-loader.js`).

const path = require("path");
const esbuild = require("esbuild");

const TOOLS_DIR = path.join(__dirname, "../../tools");
const STATS_ENTRY = path.join(TOOLS_DIR, "_core/stats/index.ts");

// IIFE bundle for vm.runInContext consumers. `globalName` collects the
// barrel's named exports into `__plottrStats`; the synthetic footer spreads
// them onto the vm context's globalThis so callers can do `ctx.tTest(...)`.
function readStatsSource() {
  const result = esbuild.buildSync({
    entryPoints: [STATS_ENTRY],
    bundle: true,
    format: "iife",
    globalName: "__plottrStats",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0].text + "\nObject.assign(globalThis, __plottrStats);\n";
}

// Bundled CommonJS source — preferred by Stryker-instrumented loaders that
// require() the result via a temp file (see `tests/helpers/stats-loader.js`).
function readStatsCjsSource() {
  const result = esbuild.buildSync({
    entryPoints: [STATS_ENTRY],
    bundle: true,
    format: "cjs",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0].text;
}

module.exports = { readStatsSource, readStatsCjsSource, STATS_ENTRY, TOOLS_DIR };

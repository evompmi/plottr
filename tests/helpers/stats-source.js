// Pointer to the migrated `_core/stats/*` TS modules used by the test loaders.
//
// Pre-migration this concatenated five `stats-*.js` files into a single source
// string the loaders evaluated via vm.runInContext. After the v1.6 migration
// every stats kernel lives as an ES module under `tools/_core/stats/`; the
// loader bundles the barrel module with esbuild and requires the resulting
// CommonJS file. Keeping this thin helper alive (with its old export name)
// minimises churn in the per-tool loaders that consume it.

const path = require("path");
const esbuild = require("esbuild");

const TOOLS_DIR = path.join(__dirname, "../../tools");
const STATS_ENTRY = path.join(TOOLS_DIR, "_core/stats/index.ts");

// Bundled IIFE source — when evaluated under vm.runInContext, the inline
// `globalThis.X = X` side-effects inside each `_core/stats/*` module land on
// the vm context's global object exactly the way the old script-scope source
// did. IIFE format keeps `module` / `exports` out of the picture so callers
// don't have to thread `runCjs` for the stats payload.
function readStatsSource() {
  const result = esbuild.buildSync({
    entryPoints: [STATS_ENTRY],
    bundle: true,
    format: "iife",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0].text;
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

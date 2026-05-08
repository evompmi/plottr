// Single source of truth for the list of `tools/stats-*.js` source files
// the per-tool / per-suite test loaders concatenate into a vm context (or
// require() via `stats-loader.js`'s temp-cjs trick). Each loader reads its
// stats source through `readStatsSource()` so this list is the only place
// the file inventory lives.
//
// Order matters: it mirrors the stats-*.js ordering in the `FILES` array
// in `scripts/build-shared.js` so the concatenated source has the same
// declaration order the browser bundle does.

const fs = require("fs");
const path = require("path");

const TOOLS_DIR = path.join(__dirname, "../../tools");

const STATS_FILES = [
  "stats-dist.js",
  "stats-tests.js",
  "stats-posthoc.js",
  "stats-cluster.js",
  "stats-msi.js",
];

function readStatsSource() {
  return STATS_FILES.map((name) => fs.readFileSync(path.join(TOOLS_DIR, name), "utf8")).join("\n");
}

module.exports = { readStatsSource, STATS_FILES };

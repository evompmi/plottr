// Loads the migrated `_core/stats/*` TS modules as a require()-able CommonJS
// module and exposes the statistical primitives (distributions, tests,
// descriptive helpers, effect sizes, post-hocs, p-value adjustments).
//
// Pre-migration this scanned the concatenated `stats-*.js` script-scope
// sources with a regex to auto-generate `module.exports.X = X` lines. The
// barrel-bundled output already carries proper CommonJS exports (esbuild
// emits `module.exports = { gammaln, tTest, … }` for the `export { … }`
// statements in `_core/stats/index.ts`), so the footer is gone.
//
// Why require() instead of vm.runInContext: Stryker's per-test coverage
// instrumentation injects a `__stryker__` global into mutated source to
// record which tests touch which lines. Writes from inside a vm child
// context land on a different `__stryker__` than the test runner sees,
// so property tests would look like they have zero coverage of the stats
// kernels and Stryker would skip them. require() makes the file part of
// Node's module dependency graph, which Stryker can trace.

const { readStatsCjsSource } = require("./stats-source");
const { requireViaTmpFile } = require("./_shell-test-utils");

const statsCjs = readStatsCjsSource();
const stats = requireViaTmpFile("stats", statsCjs);

// Mirror the require()'d module on a `ctx` property so legacy test
// code that reaches in via `loader.ctx.fooName` (the prior vm-context
// pattern) keeps working without a sweep through every reference.
module.exports = { ...stats, ctx: stats };

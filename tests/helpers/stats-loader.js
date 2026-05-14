// Loads `_core/stats/*` as a require()-able CommonJS module and exposes
// the statistical primitives (distributions, tests, descriptive helpers,
// effect sizes, post-hocs, p-value adjustments).
//
// require() rather than vm.runInContext so Stryker's per-test coverage
// instrumentation can trace the file. Stryker injects a `__stryker__`
// global into mutated source; writes from inside a vm child context land
// on a different `__stryker__` than the test runner sees, so the stats
// mutants would be reported as having zero test coverage and skipped.
// require() makes the file part of Node's module dependency graph, which
// Stryker traces.

const { readStatsCjsSource } = require("./stats-source");
const { requireViaTmpFile } = require("./_shell-test-utils");

const statsCjs = readStatsCjsSource();
const stats = requireViaTmpFile("stats", statsCjs);

// Mirror the module on a `ctx` property so tests that reach in via
// `loader.ctx.fooName` keep working alongside `loader.fooName`.
module.exports = { ...stats, ctx: stats };

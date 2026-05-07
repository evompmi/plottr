// Vitest config — runs the existing tests/*.test.js suite (per-tool
// unit tests + fast-check property tests) under Vitest. The bespoke
// `tests/harness.js` is a thin shim delegating `suite() / test() /
// assert() / eq() / approx() / throws() / summary()` to Vitest's own
// `test()` global, so the project keeps its testing vocabulary while
// gaining parallel file execution, watch mode, IDE integration,
// snapshot support, and proper diff output on failures.
//
// Out-of-scope for this config: tests/helpers/* (vm-context loaders
// for shared.js / per-tool helpers.ts and shared CSV arbitraries —
// imported by the test files but never themselves tests).

const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    // Make `test` / `expect` / `describe` available as globals so the
    // shim doesn't need to import them at every callsite. Test files
    // continue to import the harness via `require("./harness")`.
    globals: true,

    // Default to a Node environment — the project's test bodies operate
    // on plain JS values (parser output, stats results, helper returns)
    // and the bespoke `render-loader.js` already manages its own vm
    // context for component-tree smoke tests. happy-dom is installed
    // for future migration of `tests/components.test.js` to real React
    // + DOM, but the current suite doesn't need it.
    environment: "node",

    // Test discovery: every tests/*.test.js (no nesting). The harness
    // itself (`tests/harness.js`) and the per-tool / per-domain loaders
    // under `tests/helpers/` are explicitly not tests; the include
    // pattern + the default exclude list (node_modules, build/, dist/)
    // keep them out.
    include: ["tests/*.test.js"],
    exclude: ["node_modules/**", "tests/helpers/**", "tests/harness.js"],

    // Verbose reporter prints every test name as it runs, matching the
    // pre-Vitest `✓  <name>` cadence the contributor expectation has
    // built around.
    reporters: ["verbose"],

    // Per-test timeout. Vitest's default 5s is fine for the vast
    // majority of unit tests, but a handful of statistical
    // cross-validations exercise expensive pure-JS routines that
    // legitimately take a few seconds: the `multisetIntersectionPExact`
    // deep-tail check (k=5, p ≈ 1e-15) is ~3 s, and `qtukey` at small
    // df runs a doubling bracket-expansion plus 200-step bisection
    // where each iteration is a 48-node Gauss-Legendre integration of
    // ptukey. 30 s is comfortable headroom for the slow cases without
    // letting a genuinely-hung test bleed CI time forever.
    testTimeout: 30_000,

    // Pre-test hook: build-shared still runs via package.json's
    // `pretest` script (just like before), so by the time vitest
    // starts evaluating test files the `tools/shared.bundle.js`
    // they read through `vm.runInContext` is already up to date.
  },
});

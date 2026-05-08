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

    // Per-test timeout. Two regimes:
    //   - Regular `npm test`: 60 s is comfortable headroom for the
    //     handful of legitimately-slow statistical cross-validations
    //     (`multisetIntersectionPExact` k=5 deep-tail ~3 s; `qtukey`
    //     at small df runs a doubling bracket-expansion plus 200-step
    //     bisection over a 48-node Gauss-Legendre quadrature of
    //     ptukey). Short enough that a genuinely-hung test gets
    //     killed in a minute rather than bleeding CI time forever.
    //   - Under Stryker: bump to 300 s. Stryker's perTest-coverage
    //     instrumentation injects a per-line probe that, on the
    //     hottest stats inner loops (qtukey-at-df=1, cpsets deep
    //     tail), pushes per-test latency ~3000× — even tests that
    //     fit in 100 ms regular need minutes under instrumentation.
    //     Detected via `.stryker-tmp` in cwd (Stryker copies the repo
    //     to a sandbox under that path).
    testTimeout: process.cwd().includes(".stryker-tmp") ? 300_000 : 60_000,

    // Pre-test hook: build-shared still runs via package.json's
    // `pretest` script (just like before), so by the time vitest
    // starts evaluating test files the `tools/shared.bundle.js`
    // they read through `vm.runInContext` is already up to date.
  },
});

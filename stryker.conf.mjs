// Stryker mutation-testing config.
//
// Mutation testing is a meta-test of the test suite itself: Stryker
// mutates the source (flips comparators, deletes statements, swaps
// constants, …) and re-runs the relevant subset of `npm test`. A
// mutant that survives — i.e. all tests still pass with broken code
// — points at an invariant the suite doesn't actually constrain.
//
// Scope: per-tool helpers + tools/stats.js. Tool entry points (.tsx)
// and the SPA shell (`tools/_app/**`) are excluded — they're
// orchestration / React glue and the property tests cover the pure
// helpers, not the framework code.
//
// Run: `npm run mutation` (slow — 5–30 min per scope on this hardware).
// Reports land in `reports/mutation/mutation.html` (gitignored).

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Files Stryker mutates. Start narrow (volcano + stats) so the first
  // run completes in minutes; widen once the workflow is proven.
  mutate: [
    // Active scope. Mutation runs cover one helpers file at a time to
    // keep wall-clock manageable; results land in CHANGELOG and git
    // history, so the others can stay commented until they're up next.
    //
    // Already verified at 100% mutation score:
    //   - tools/volcano/helpers.ts  (996 mutants, 932 killed + 64 timed out)
    //
    // Active target:
    "tools/scatter/helpers.ts",
    //
    // Pending — uncomment one at a time and re-run:
    // "tools/volcano/helpers.ts",
    // "tools/stats.js",
    // "tools/heatmap/helpers.ts",
    // "tools/boxplot/helpers.ts",
    // "tools/aequorin/helpers.ts",
    // "tools/lineplot/helpers.ts",
    // "tools/upset/helpers.ts",
    // "tools/venn/**/*.ts",
  ],

  testRunner: "vitest",

  // The per-tool test loaders read source via `vm.runInContext` rather
  // than a static `require`, so Vitest's `--related` flag (which
  // Stryker enables by default) can't trace the dependency graph and
  // reports "no tests were found." Disabling `related` makes Stryker
  // hand the full test set to Vitest; the perTest-coverage analysis
  // below still scopes which tests run per mutant.
  vitest: { related: false },

  // Per-test coverage means each mutant only triggers the tests that
  // actually cover the mutated line — without it Stryker reruns the
  // full suite per mutant, which is roughly 100× slower at this size.
  //
  // For this to work with the per-tool test loaders, the loader must
  // load the mutated source through Node's module system (not via
  // `vm.runInContext`). Otherwise Stryker's coverage instrumentation
  // can't see the test → source link and reports the property tests
  // as "no coverage." See `tests/helpers/scatter-loader.js` for the
  // require()-based pattern; volcano's loader still uses
  // vm.runInContext only because volcano's helpers are also inlined
  // into the compiled SPA bundle and reachable via render-smoke tests.
  coverageAnalysis: "perTest",

  // Vitest's default timeout is 30s; mutations that hang typically
  // produce infinite loops in property tests, so cap them tighter.
  timeoutMS: 60000,
  // Stryker also waits an extra "net" multiplier of the typical
  // baseline; bump only if false-positive timeouts show up.

  // Reasonable parallelism for a workstation. Leave ~half of cores
  // free so the rest of the system stays responsive.
  concurrency: 4,

  // Skip static / type-only constructs that mutate trivially without
  // semantic change (e.g. mutating a string literal in a comment-like
  // export). Keeps the report focused on real logic.
  ignoreStatic: true,

  // Reporters: progress + clear-text for the terminal, html for a
  // browsable per-mutant report. The dashboard reporter is included by
  // default and would attempt to upload to stryker.dashboard.io;
  // omitting it keeps the run local-only.
  reporters: ["progress", "clear-text", "html"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },

  // Don't clutter the repo with the sandbox dir between runs.
  cleanTempDir: true,
};

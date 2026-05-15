// Stryker mutation-testing config.
//
// Mutation testing is a meta-test of the test suite itself: Stryker
// mutates the source (flips comparators, deletes statements, swaps
// constants, …) and re-runs the relevant subset of `npm test`. A
// mutant that survives — i.e. all tests still pass with broken code
// — points at an invariant the suite doesn't actually constrain.
//
// Scope: per-tool helpers + tools/stats-*.js. Tool entry points (.tsx)
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
    // Active scope. Mutation runs cover one file (or one small set) at a
    // time to keep wall-clock manageable; the others can stay commented
    // until they're up next.
    //
    // Already verified (pre-migration scores — re-baseline pending):
    //   - tools/volcano/helpers.ts   (100%, 996 mutants, 932 killed + 64 timed out)
    //   - tools/scatter/helpers.ts   (93.18% raw / 100% non-equivalent, 88 mutants)
    //   - tools/lineplot/helpers.ts  (79.20% raw / ~95% non-equivalent, 125 mutants)
    //   - tools/stats.js             (legacy — 66.87% raw / 68.98% covered, 3329
    //                                 mutants. Measured before the kernel was
    //                                 migrated to tools/_core/stats/*.ts; the
    //                                 _core/stats/*.ts entries below need a fresh
    //                                 baseline pass.)
    //
    // Active target. Swap for one of the pending entries below to measure
    // another module.
    //
    // IMPORTANT — false survivors before the 2026-05-15 loader fix.
    // The test loaders re-ran `esbuild.buildSync` on every test-file
    // evaluation; under Stryker that is one esbuild service spawn per
    // mutant, so a long run exhausted the OS process table, the esbuild
    // service died mid-run, the loaders' require() threw, the test files
    // registered zero tests, and every remaining mutant was scored as a
    // false "survived" (and the run exited with a `spawn pgrep EAGAIN`).
    // `tests/helpers/_shell-test-utils.js` now caches bundles on disk
    // under Stryker. The scores below for the larger files (dist.ts,
    // posthoc.ts — and possibly cluster.ts) were measured BEFORE the fix
    // and are understated; re-run them for accurate numbers.
    //
    // Verified post-migration:
    //   - format.ts  — 95.56% raw, 100% non-equivalent (45 mutants, 43
    //                  killed, 2 provably-equivalent residuals on the
    //                  `p == null` short-circuit).
    //   - msi.ts     — 72.20% raw, ~67 residuals largely equivalent
    //                  (saturation guards are optimisations; betai/DP
    //                  return the same values without them). Pre-fix.
    //   - cluster.ts — 68.82% raw, 139 residuals (pre-fix — re-measure).
    //   - dist.ts    — 63.08% raw / 67.37% covered (PRE-FIX, understated:
    //                  1208 mutants is well past the process-exhaustion
    //                  threshold — re-run for the true score).
    //   - posthoc.ts — 73.35% raw / 75.29% covered (PRE-FIX, likely
    //                  understated at 698 mutants — re-run).
    //   - tests.ts   — 87.83% raw / 88.42% covered, 1191 mutants (1025
    //                  killed + 21 timeout, 137 survived + 8 no-coverage).
    //                  ~2 min wall-clock. The pre-fix run scored a false
    //                  58.77% (347 false survivors from the esbuild
    //                  exhaustion above). After the loader fix the honest
    //                  baseline was 76.49%; correlation + stats mutation-
    //                  audit pins (error-message content, n-boundary
    //                  guards, selectCorrelation structure/narrative,
    //                  Spearman Fisher-z CI, ANOVA sums-of-squares) took
    //                  it to 87.83%. Residual ~137 are largely equivalent
    //                  (loop bounds whose inner loop cannot run, sign
    //                  flips under squaring, ±1-size "tie" groups that
    //                  contribute zero, dead [0,1] clamps) plus kendallTau
    //                  higher-order tie corrections that need R-verified
    //                  references for size-≥3 tie groups on both axes.
    "tools/_core/stats/tests.ts",
    //
    // Pending — uncomment one at a time and re-run:
    // "tools/_core/stats/format.ts",
    // "tools/_core/stats/msi.ts",
    // "tools/_core/stats/cluster.ts",
    // "tools/_core/stats/dist.ts",
    // "tools/_core/stats/posthoc.ts",
    // "tools/volcano/helpers.ts",
    // "tools/scatter/helpers.ts",
    // "tools/lineplot/helpers.ts",
    // "tools/heatmap/helpers.ts",
    // "tools/boxplot/helpers.ts",
    // "tools/aequorin/helpers.ts",
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

  // Stryker's default *dry run* budget (the initial baseline pass) is
  // 5 minutes. Under perTest coverage instrumentation the full suite
  // is noticeably slower than `npm test` alone — and on `tools/stats.js`
  // specifically, the R-cross-validation tests in `stats.test.js`
  // include some near-pathological inner numerical loops that bloat
  // by ~3000× under per-line probes. Bump to 30 min so the dry run
  // can finish even when those slow tests are included; per-test
  // outliers are skipped under Stryker via name-list in stats.test.js.
  dryRunTimeoutMinutes: 30,

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
  reporters: ["progress", "clear-text", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },

  // Don't clutter the repo with the sandbox dir between runs.
  cleanTempDir: true,
};

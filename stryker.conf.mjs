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
// Reports land in `reports/mutation/<target>.{html,json}` (gitignored):
// one report per mutated file, named after the active `mutate` entry, so
// measuring dist.ts then posthoc.ts keeps both reports instead of the
// second overwriting the first. See the `reportSlug` derivation below.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
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
    // Note — the 2026-05-15 loader fix. The test loaders used to re-run
    // `esbuild.buildSync` on every test-file evaluation; under Stryker
    // that is one esbuild service spawn per mutant. When the spawns come
    // fast enough they pile up before the OS reaps them, the process
    // table fills, the esbuild service dies mid-run, the loaders'
    // require() throws, the test files register zero tests, and every
    // remaining mutant is scored as a false "survived" (the run also
    // exits with `spawn pgrep EAGAIN`). It is rate-dependent, not purely
    // count-dependent: it bit `tests.ts` (1191 mutants, ~1.5 min run),
    // but re-running `dist.ts` and `posthoc.ts` post-fix reproduced
    // their pre-fix scores exactly — their slower per-mutant pace spread
    // the spawns out enough to avoid the pile-up. `_shell-test-utils.js`
    // now caches bundles on disk under Stryker, so any future run is
    // correct regardless of pace.
    //
    // Verified post-migration:
    //   - format.ts  — 95.56% raw, 100% non-equivalent (45 mutants, 43
    //                  killed, 2 provably-equivalent residuals on the
    //                  `p == null` short-circuit).
    //   - msi.ts     — 72.20% raw, ~67 residuals largely equivalent
    //                  (saturation guards are optimisations; betai/DP
    //                  return the same values without them).
    //   - cluster.ts — 87.97% raw, 449 mutants (376 killed + 19 timeout,
    //                  54 survived). 2026-05-15 re-run reproduced the
    //                  pre-fix 68.82%, then 9 kmeans + tree path pins
    //                  (multi-iteration loop, empty-cluster reseed,
    //                  default-option ternaries, maxIter cap, seed≤0
    //                  normalization, NaN-cell centroid mean) lifted it.
    //                  Residual 54 equivalent — loop bounds, strict-
    //                  binary-tree symmetry, new Array sizing, dead
    //                  branches — plus a few contrived-only.
    //   - dist.ts    — 62.83% raw / 67.11% covered, 1208 mutants (737
    //                  killed + 22 timeout, 372 survived + 77 no-cov).
    //                  Re-run 2026-05-15 post loader-fix; matches the
    //                  pre-fix 63.08% (0.25pt delta is timeout-flake
    //                  noise) — dist.ts was never affected by the bug.
    //                  Residual mostly chi2inv / tinv Newton internals
    //                  and Gauss-Legendre quadrature. ~23 min wall-clock.
    //   - posthoc.ts — 79.80% raw / 81.20% covered, 698 mutants (538
    //                  killed + 19 timeout, 129 survived + 12 no-cov).
    //                  2026-05-15 sweep: re-run reproduced the pre-fix
    //                  73.35%, then 11 post-hoc path pins (k<2 error +
    //                  k=2 boundary, tukeyHSD ANOVA-error + alpha,
    //                  gamesHowell zero-variance, Dunn tie correction,
    //                  CLD split structure, selectTest k-routing +
    //                  zero-variance group + SW narrative branches)
    //                  lifted it. Residual ~141 equivalent/contrived —
    //                  GL quadrature internals, qtukey bisection
    //                  tolerance, the df≤2 & k≥10 pathological-envelope
    //                  warning, absorption-self-correcting CLD splits.
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
    "tools/_core/stats/posthoc.ts",
    //
    // Pending — uncomment one at a time and re-run:
    // "tools/_core/stats/format.ts",
    // "tools/_core/stats/msi.ts",
    // "tools/_core/stats/cluster.ts",
    // "tools/_core/stats/tests.ts",
    // "tools/_core/stats/dist.ts",
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
  // omitting it keeps the run local-only. The html / json output
  // filenames are set per-target just below `export default` so each
  // mutated file gets its own report.
  reporters: ["progress", "clear-text", "html", "json"],

  // Don't clutter the repo with the sandbox dir between runs.
  cleanTempDir: true,
};

// Per-target report filenames. Stryker would otherwise overwrite a
// single `mutation.json` / `mutation.html` on every run, so a sweep that
// measures dist.ts and then posthoc.ts would lose the dist.ts report.
// Deriving the name from the active `mutate` entry keeps one report per
// file — `reports/mutation/core-stats-dist.json`, `…-posthoc.json`, … —
// so module scores stay comparable across a methodical sweep without
// re-running. A multi-target run (more than one entry uncommented)
// falls back to `multi`.
const reportSlug =
  config.mutate.length === 1
    ? config.mutate[0]
        .replace(/^tools\//, "")
        .replace(/\.[cm]?[jt]sx?$/, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
    : "multi";
config.htmlReporter = { fileName: `reports/mutation/${reportSlug}.html` };
config.jsonReporter = { fileName: `reports/mutation/${reportSlug}.json` };

export default config;

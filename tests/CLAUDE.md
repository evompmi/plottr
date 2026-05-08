# tests/ — Test runner, standards, helpers

Auto-loaded by Claude Code when work touches anything under `tests/`. Cross-cutting rules live in the repo-root `CLAUDE.md`; tool-architecture details live in `tools/CLAUDE.md`.

## Running tests

```bash
npm test            # full deterministic suite under Vitest (parallel by file)
npm run test:watch  # watch mode for local development
npm run test:coverage
npm run mutation    # Stryker mutation testing — measures whether the suite *catches* bugs, not just whether tests pass. See "Mutation testing" below.
```

The suite splits into four rough buckets:

- **Shared/foundation** — `shared`, `parsing`, `integration`, `components`, `prefs`, `r-export`, `stats`, `power`, `stats-dispatch`, `discrete-palette`, `handoff`.
- **Per-tool unit tests** — `aequorin`, `boxplot-helpers`, `boxplot-stats-reducer`, `heatmap`, `lineplot`, `scatter`, `upset`, `venn`, `volcano`.
- **Per-tool property tests** (`tests/<tool>.property.test.js`, fast-check) — `aequorin`, `boxplot`, `heatmap`, `lineplot`, `scatter`, `upset`, `venn`, `volcano`. See "Property-based tests" below.
- **Build / hygiene** — `anti-clickjack`, `vendor-sri`, `write-version`, `formula-injection`.

Each new plot tool adds a `tests/<tool>.test.js` covering its pure helpers and a `tests/<tool>.property.test.js` covering structural invariants (see below). New shared helpers go into the bucket that matches their domain — don't create a new file unless the domain is genuinely new.

**Test runner: Vitest 3.x with a thin compat shim.** The unit `tests/*.test.js` files keep the project's house vocabulary — `suite() / test() / assert() / eq() / approx() / throws() / summary()` — through `tests/harness.js`, which is now a ~50-line adapter that delegates to Vitest's `globalThis.test` (injected by `globals: true` in `vitest.config.js`). Test files were not rewritten; they still `require("./harness")` and look identical. The `*.property.test.js` files use the same `suite() / test()` shim from the harness for grouping but assert via `fc.assert(fc.property(...))` directly — fast-check throws on counterexample, Vitest surfaces it. What Vitest buys: parallel file execution (~12 s wall clock vs. ~3 min sequential), watch mode, IDE integration via Vitest's per-`test` discovery, snapshot testing, and proper diff output on failures. A future contributor who wants Vitest's full DSL can use `describe / it / expect` directly — they're global. Per-test timeout is 30 s in the config to accommodate the slow stats cross-validations (deep-tail `cpsets`, `qtukey` at small df).

**Component rendering: real React 18 + happy-dom.** The previous bespoke 354-line functional-React mock under `tests/helpers/render-loader.js` was retired alongside the Vitest migration. The helper is now ~140 lines that delegate to the real `react`, `react-dom/server`, and `react-dom/client` packages plus happy-dom. `tests/components.test.js` declares `// @vitest-environment happy-dom` at the top and exercises shared components + chart components from compiled tool .js files via `renderHtml(Component, props)` (synchronous static-HTML render) and `renderWithEffects(Component, props)` (mount through `react-dom/client.createRoot` + `act` for tests that depend on `useEffect` actually firing). Assertions read DOM / HTML directly — no more `el.type === "div"` or `JSON.stringify(el).indexOf("X")`. The shared bundle and tool .js files load via `vm.runInThisContext` so their script-mode top-level `function` / `var` declarations attach to globalThis where the test rig can grab them.

`npm test` is `vitest run`; Vitest's exit code propagates to CI / pre-commit / `&&`-style chains. There is no separate test-count badge or post-test bumper — the landing page no longer surfaces an internal-tests count, so there is nothing to keep in sync.

## Property-based tests (fast-check)

Every plot tool ships a `tests/<tool>.property.test.js` that drives its parse → compute pipeline through [fast-check](https://fast-check.dev/) properties. These run inside the regular Vitest suite — there is no separate `npm run fuzz:*` invocation, no standalone driver, no out-of-band cadence to remember. Coverage fires on every `npm test`.

Why fast-check replaced the prior bespoke fuzz harnesses (the eight `tests/fuzz/<tool>.fuzz.js` files retired in 2026-05-07):

- **Automatic shrinking.** On failure, fast-check converges on the smallest input that violates the property. The seeded fuzz harnesses reported only the seed; reproducing required manually bisecting.
- **Routine cadence.** Properties run on every `npm test` instead of being gated behind a separate command. Coverage cannot drift between release sweeps because there are no release sweeps.
- **Stronger invariants.** Properties like "summarize counts equal the result of classifying each point individually" or "circleOverlapArea is symmetric in r1/r2" are clumsy to express in the imperative fuzz-loop style.

**Inputs.** Shared CSV-shaped arbitraries live in `tests/helpers/csv-arbitraries.js` — they wrap the curated pathological-input corpus (`tests/helpers/csv-corpus.js`, originally the seeded `tests/fuzz/generators.js`) plus add fast-check-native structural arbitraries (`arbWideCsv`, `arbLongCsv`, `arbSetCsv`, `arbLongSetCsv`) that shrink properly. Per-tool property files import what they need from those plus build any tool-specific arbitraries inline (e.g. circle geometry, calibration parameters).

**Per-property runs.** Each file declares a `RUNS` constant near the top (typically 200–500) and asserts via a small `check = (prop) => fc.assert(prop, { numRuns: RUNS })` helper. Heavy properties (multi-restart label layout, post-hoc tests at k≥3, hclust × all-metrics × all-linkages combos) use a lower `RUNS_HEAVY` (~80) to keep file runtime under ~2 s.

**Subsume-then-delete rule.** When refactoring an invariant-coverage driver, the new file must cover every invariant the old one asserted before the old file is removed. The migration from fuzz harnesses to property tests followed this rule strictly — every fuzz-harness invariant has a corresponding property in the per-tool property file, plus extras (idempotency, boundary cases, sign-symmetry, etc.) that the imperative loop couldn't easily express.

**`tests/helpers/csv-corpus.js`** still exists and is still used: `arbCorpusCsv` in `csv-arbitraries.js` wraps it as a fast-check arbitrary so all property tests inherit the same pathological-input distribution the fuzz harnesses tested (BOM, CRLF, mixed delimiters, decimal commas, ragged rows, null bytes, unicode labels, NaN/Inf tokens, very long labels, trailing commas, …). Adding a new pathology category means appending to the `GENERATORS` array there; every property test that pulls from `arbAnyCsv` picks it up automatically.

## Mutation testing (Stryker)

Mutation testing is a meta-test of the test suite itself: Stryker mutates the source on disk (flips comparators, swaps constants, deletes statements, inverts conditionals, …) and re-runs `npm test` against each mutated version. A _killed_ mutant means at least one test failed on the broken code; a _surviving_ mutant points at an invariant the suite doesn't actually constrain.

```bash
npm run mutation    # runs Stryker against the files in stryker.conf.mjs
```

Files measured so far (run one at a time, scope toggled in `stryker.conf.mjs`):

| File                       | Mutants | Killed             | Survived           | Raw score  | Notes                                                                                      |
| -------------------------- | ------- | ------------------ | ------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| `tools/volcano/helpers.ts` | 996     | 932 + 64 timed out | 0                  | **100%**   | Coverage tracked through SPA-bundle render path.                                           |
| `tools/scatter/helpers.ts` | 88      | 82                 | 6 (all equivalent) | **93.18%** | Required loader refactor; remaining mutants are equivalent (no test can distinguish them). |

**Cost.** ~3 h on volcano (1214 LOC), ~1 min on scatter (63 LOC) — wall-clock scales roughly linearly with file size. Not a CI gate; run on demand when extending coverage or before a release.

**Configuration choices** (`stryker.conf.mjs`):

- `vitest: { related: false }` — Vitest's `--related` flag traces static `import` graphs, but the per-tool loaders read source via `vm.runInContext` (so the test files don't statically import the mutated `.ts`). With `related` left on, Stryker reports "no tests were found" and exits.
- `coverageAnalysis: "perTest"` — instruments the initial test run to record which tests cover which lines, then runs only the covering tests for each mutant. ~3-13 tests/mutant on average, vs ~1400 if disabled.
- `concurrency: 4` — reasonable parallelism without saturating the workstation.
- `timeoutMS: 60000` — many mutants produce infinite loops; the timeout catches them and counts the mutation as killed.
- `ignoreStatic: true` — skip mutations on static / type-only constructs that can't change semantic behaviour.

**Loader pattern matters.** Stryker's `perTest` coverage instrumentation injects a `__stryker__` global into mutated source to record which tests touch which lines. The vm.runInContext-based loaders give loaded code its own context, so `__stryker__` writes from inside the vm don't reach the test runner — and Stryker reports those tests as having zero coverage of the helpers, marking every mutant as "no coverage" and skipping them. Two ways to make a tool's helpers Stryker-visible:

1. **Reachable via the compiled SPA bundle** (what makes volcano work). The render-smoke tests in `tests/components.test.js` load `tools/_app/index.js` (the bundled SPA), which has helpers.ts inlined. Stryker can see that path because it's a normal Node import. Works whenever the chart actually exercises the helper at render time — volcano's chart uses pickTopLabels / layoutLabels / summarize / etc. on every render, so the entire helpers file is naturally covered.
2. **`require()`-based loader** (what fixed scatter). Refactor the per-tool loader to compile helpers.ts to a temp `.cjs` file and `require()` it instead of `vm.runInContext`. Makes the file part of Node's module graph; Stryker's coverage instrumentation traces the link. See `tests/helpers/scatter-loader.js` as the reference. Required when the tool's helpers aren't fully exercised by render tests — typically true for tools where some helpers only run under specific user-config (regression, calibration, threshold-driven label picking, …). Caveat: the refactor only works if the helpers don't reference `shared.js` / `stats.js` globals as free variables; if they do, those have to stay vm-loaded and the helpers split between vm and require paths.

**Equivalent mutants are the practical ceiling.** Stryker generates _syntactically-different_ mutations of the source. Some of them are _semantically identical_ — e.g. `if (t === 0) return "0"` mutated to `if (false) return "0"`, where the math fallback path also produces "0" for input 0; or `if (abs >= 100)` mutated to `if (abs > 100)` where both branches happen to render "100" at the boundary. No test can kill an equivalent mutant by definition; they show up as survivors but aren't real test gaps. Stryker has no built-in "is-equivalent" detector, so distinguishing equivalent from real survivors is a manual read of each diff. Scatter's 6 surviving mutants are all equivalent; the _non-equivalent mutation score_ is 100%.

**HTML report.** `reports/mutation/mutation.html` (gitignored). One row per source line, colour-coded by survived / killed / no-coverage. Drill into a survived mutant to see the diff and which tests covered it but didn't fail; this is the input you use to decide whether the survivor is a real gap (write a sharper property) or an equivalent mutant (note in commit and move on).

**Scope expansion path.** The `mutate:` array in `stryker.conf.mjs` is a single-target switch — uncomment one entry, comment the others, run, document. Already-validated entries listed in a comment block above the array. To expand to a new tool: (a) check that its helpers.ts doesn't reference shared globals as free vars; if it does, keep the vm.runInContext path and accept that Stryker will only see render-bundle coverage; (b) if it doesn't, refactor that tool's loader to the require()-based pattern (see `tests/helpers/scatter-loader.js`); (c) swap the active scope and run; (d) drive the score up by adding sharp boundary properties for each non-equivalent survivor; (e) document the final score and equivalent-mutant count in the table above + commit.

**When NOT to run mutation testing.** Day-to-day editing — the existing 1420-test suite catches most regressions in seconds, mutation testing is a quarterly exercise. Run it after a substantial test-suite expansion (to validate the new properties have bite), before a release (to confirm coverage didn't regress), or when investigating a class of bug the suite missed (to find the gap that let it through).

## Test standards (mandatory for new work)

New features that add user-visible behaviour or data-pipeline logic must ship with tests in the same PR/commit as the feature. The bar varies by what you touched:

- **New shared function** in `shared.js` / `stats.js` / any `shared-*.js` → export from the matching loader in `tests/helpers/` and add unit tests to the appropriate `tests/*.test.js` file (or create a new one if the domain is new).
- **New plot tool** → ships with (a) at least one dedicated `tests/<tool>.test.js` for non-trivial pure helpers (intersection / aggregation / layout math), and (b) a `tests/<tool>.property.test.js` covering structural invariants of the parse → compute pipeline using fast-check. Pattern-match an existing tool — `tests/volcano.property.test.js` is the canonical reference for pure-helper-style tests, `tests/upset.property.test.js` for parse-pipeline-style tests with two input formats. Both load the tool's pure helpers via a `tests/helpers/<tool>-loader.js` that transforms `tools/<tool>/helpers.ts` to CommonJS with `esbuild.transformSync` (or `buildSync` for multi-file barrels) and evaluates it under `vm.runInContext` with the shared globals pre-loaded. Every tool keeps its pure helpers in a dedicated `helpers.ts` sibling for exactly this reason. Reuse `tests/helpers/csv-arbitraries.js` for CSV-shaped inputs and add tool-specific arbitraries inline.
- **New pure helper inside a tool** → if it's non-trivial (any math, filtering, sorting, layout, label-disambiguation), put it in `tools/<tool>/helpers.ts` and export it from the loader above, then add unit tests. If it's already covered by the tool's property test, a property-only addition is acceptable — note this in the PR/commit message.
- **New chart component** → add a render-smoke assertion in `tests/components.test.js` (or the tool-specific property test) that builds with realistic inputs and confirms it doesn't throw.
- **Bug fix that wasn't caught by existing tests** → add a regression test reproducing the original failure before committing the fix. If the tool's property test could have caught it, extend that too — usually by adding a sharper invariant rather than a new arbitrary.

## Testing helpers

Test helpers in `tests/helpers/` load shared code into Node `vm` contexts with DOM stubs, plus expose the shared property-test arbitraries:

- **Generic shared loaders** load the `shared-*.js` bundle globals into a vm context: `shared-loader.js`, `parsing-fns.js`, `components-loader.js`, `prefs-loader.js`, `r-export-loader.js`, `stats-dispatch-loader.js`, `discrete-palette-loader.js`, `handoff-loader.js`.
- **`render-loader.js` (real React 18 + happy-dom).** Used only by `tests/components.test.js`, which declares the happy-dom Vitest environment at the top of the file. Exposes `buildContext()`, `loadTool(toolName)`, `renderHtml(Component, props)` (synchronous static-HTML via `react-dom/server`), and `renderWithEffects(Component, props)` (mount through `react-dom/client.createRoot` + `act` so `useEffect` / `useLayoutEffect` actually fire). Replaced the prior 354-line functional-React mock in 2026-05-05.
- **Per-tool loaders** transform `tools/<tool>/helpers.ts` to CommonJS (via `esbuild.transformSync`, or `buildSync` for barrels) and run it under `vm.runInContext` with the shared globals pre-loaded. One per plot tool: `aequorin-loader.js`, `boxplot-loader.js`, `boxplot-stats-reducer-loader.js`, `heatmap-loader.js`, `lineplot-loader.js`, `scatter-loader.js`, `upset-loader.js`, `venn-loader.js`, `volcano-loader.js`.
- **`csv-corpus.js`** — the curated pathological-input corpus (BOM, CRLF, mixed delimiters, decimal commas, ragged rows, null bytes, unicode labels, NaN/Inf tokens, very long labels, …). Originally `tests/fuzz/generators.js`; relocated here when the property suites took over coverage. Exports the `GENERATORS` array and a `makeRng` Park–Miller PRNG.
- **`csv-arbitraries.js`** — fast-check arbitraries for CSV-shaped inputs. Wraps `csv-corpus.js`'s `GENERATORS` as `arbCorpusCsv` (limited shrinking but full pathology coverage), plus structural arbitraries that shrink properly: `arbWideCsv`, `arbLongCsv`, `arbSetCsv`, `arbLongSetCsv`. The union `arbAnyCsv` is what most parse-resilience properties pull from.

When adding new functions to `shared.js`, `stats.js`, or any `shared-*.js` file, export them in the corresponding loader so the unit tests can see them. When adding a pure helper to `tools/<tool>/helpers.ts`, add it to the `module.exports` block at the bottom of the matching per-tool loader. When adding a new CSV pathology category, append a generator to `csv-corpus.js`'s `GENERATORS` array — every property test that pulls from `arbAnyCsv` picks it up automatically.

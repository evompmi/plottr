# tests/ — Test runner, standards, helpers

Auto-loaded by Claude Code when work touches anything under `tests/`. Cross-cutting rules live in the repo-root `CLAUDE.md`; tool-architecture details live in `tools/CLAUDE.md`.

## Running tests

```bash
npm test            # full deterministic suite under Vitest (parallel by file)
npm run test:watch  # watch mode for local development
npm run test:coverage
```

The suite splits into three rough buckets:

- **Shared/foundation** — `shared`, `parsing`, `integration`, `components`, `prefs`, `r-export`, `stats`, `power`, `stats-dispatch`, `discrete-palette`, `handoff`.
- **Per-tool** — `aequorin`, `boxplot-helpers`, `boxplot-stats-reducer`, `heatmap`, `lineplot`, `scatter`, `upset`, `venn`, `volcano`.
- **Build / hygiene** — `anti-clickjack`, `vendor-sri`, `write-version`, `formula-injection`.

Each new plot tool adds a `tests/<tool>.test.js` covering its pure helpers, plus a fuzz harness (see below). New shared helpers go into the bucket that matches their domain — don't create a new file unless the domain is genuinely new.

**Test runner: Vitest 3.x with a thin compat shim.** The 24 `tests/*.test.js` files keep the project's house vocabulary — `suite() / test() / assert() / eq() / approx() / throws() / summary()` — through `tests/harness.js`, which is now a ~50-line adapter that delegates to Vitest's `globalThis.test` (injected by `globals: true` in `vitest.config.js`). Test files were not rewritten; they still `require("./harness")` and look identical. What Vitest buys: parallel file execution (~12 s wall clock vs. ~3 min sequential), watch mode, IDE integration via Vitest's per-`test` discovery, snapshot testing, and proper diff output on failures. A future contributor who wants Vitest's full DSL can use `describe / it / expect` directly — they're global. Per-test timeout is 30 s in the config to accommodate the slow stats cross-validations (deep-tail `cpsets`, `qtukey` at small df).

**Component rendering: real React 18 + happy-dom.** The previous bespoke 354-line functional-React mock under `tests/helpers/render-loader.js` was retired alongside the Vitest migration. The helper is now ~140 lines that delegate to the real `react`, `react-dom/server`, and `react-dom/client` packages plus happy-dom. `tests/components.test.js` declares `// @vitest-environment happy-dom` at the top and exercises shared components + chart components from compiled tool .js files via `renderHtml(Component, props)` (synchronous static-HTML render) and `renderWithEffects(Component, props)` (mount through `react-dom/client.createRoot` + `act` for tests that depend on `useEffect` actually firing). Assertions read DOM / HTML directly — no more `el.type === "div"` or `JSON.stringify(el).indexOf("X")`. The shared bundle and tool .js files load via `vm.runInThisContext` so their script-mode top-level `function` / `var` declarations attach to globalThis where the test rig can grab them.

`npm test` is `vitest run`; Vitest's exit code propagates to CI / pre-commit / `&&`-style chains. There is no separate test-count badge or post-test bumper — the landing page no longer surfaces an internal-tests count, so there is nothing to keep in sync.

## Fuzz harnesses

Every plot tool has a paired fuzz harness under `tests/fuzz/<tool>.fuzz.js`, wired to `npm run fuzz:<tool>`. These feed the shared pathological-input corpus (`tests/fuzz/generators.js`) through each tool's parse → compute → render pipeline and assert structural invariants, not exact outputs. Run with `FUZZ_SEED=<n>` / `FUZZ_N=<n>` / `FUZZ_QUIET=1` env vars to vary seeds / iteration counts / output. Default cadence is 2 × 1000 iterations; 10k sweeps across seeds 1 / 42 / 999 are expected to report zero crashes before a release.

## Test standards (mandatory for new work)

New features that add user-visible behaviour or data-pipeline logic must ship with tests in the same PR/commit as the feature. The bar varies by what you touched:

- **New shared function** in `shared.js` / `stats.js` / any `shared-*.js` → export from the matching loader in `tests/helpers/` and add unit tests to the appropriate `tests/*.test.js` file (or create a new one if the domain is new).
- **New plot tool** → ships with (a) at least one dedicated `tests/<tool>.test.js` for any non-trivial pure helpers (intersection / aggregation / layout math), and (b) a `tests/fuzz/<tool>.fuzz.js` harness wired into `package.json` as `fuzz:<tool>`. Pattern the fuzz harness after `tests/fuzz/upset.fuzz.js` — load the tool's pure helpers via a `tests/helpers/<tool>-loader.js` that transforms `tools/<tool>/helpers.ts` to CommonJS with `esbuild.transformSync` (or `buildSync` for multi-file barrels) and evaluates it under `vm.runInContext` with the shared globals pre-loaded. Every tool keeps its pure helpers in a dedicated `helpers.ts` sibling for exactly this reason.
- **New pure helper inside a tool** → if it's non-trivial (any math, filtering, sorting, layout, label-disambiguation), put it in `tools/<tool>/helpers.ts` and export it from the loader above, then add unit tests. If it's already covered by the tool's fuzz invariants, a fuzz-only addition is acceptable — note this in the PR/commit message.
- **New chart component** → add a render-smoke assertion in `tests/components.test.js` (or the tool-specific fuzz harness) that builds with realistic inputs and confirms it doesn't throw.
- **Bug fix that wasn't caught by existing tests** → add a regression test reproducing the original failure before committing the fix. If a fuzz harness could have caught it, extend the fuzz invariants too.

## Testing helpers

Test helpers in `tests/helpers/` load shared code into Node `vm` contexts with DOM stubs. Two flavours:

- **Generic shared loaders** load the `shared-*.js` bundle globals into a vm context: `shared-loader.js`, `parsing-fns.js`, `components-loader.js`, `prefs-loader.js`, `r-export-loader.js`, `stats-dispatch-loader.js`, `discrete-palette-loader.js`, `handoff-loader.js`.
- **`render-loader.js` (real React 18 + happy-dom).** Used only by `tests/components.test.js`, which declares the happy-dom Vitest environment at the top of the file. Exposes `buildContext()`, `loadTool(toolName)`, `renderHtml(Component, props)` (synchronous static-HTML via `react-dom/server`), and `renderWithEffects(Component, props)` (mount through `react-dom/client.createRoot` + `act` so `useEffect` / `useLayoutEffect` actually fire). Replaced the prior 354-line functional-React mock in 2026-05-05.
- **Per-tool loaders** transform `tools/<tool>/helpers.ts` to CommonJS (via `esbuild.transformSync`, or `buildSync` for barrels) and run it under `vm.runInContext` with the shared globals pre-loaded. One per plot tool: `aequorin-loader.js`, `boxplot-loader.js`, `boxplot-stats-reducer-loader.js`, `heatmap-loader.js`, `lineplot-loader.js`, `scatter-loader.js`, `upset-loader.js`, `venn-loader.js`, `volcano-loader.js`.

When adding new functions to `shared.js`, `stats.js`, or any `shared-*.js` file, export them in the corresponding loader so the unit tests can see them. When adding a pure helper to `tools/<tool>/helpers.ts`, add it to the `module.exports` block at the bottom of the matching per-tool loader.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only data visualization toolbox for wet-lab scientists. No server, no build step, no tracking. Deployed as static files via GitHub Pages. All data stays in the user's browser.

Tech stack: React 18 (vendored in `/vendor/`) + esbuild (build-time TSX compilation). Tools render SVG charts from pasted CSV/TSV data.

## Running Tests

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

**Test runner: Vitest 3.x with a thin compat shim.** The 24 `tests/*.test.js` files keep the project's house vocabulary — `suite() / test() / assert() / eq() / approx() / throws() / summary()` — through `tests/harness.js`, which is now a ~50-line adapter that delegates to Vitest's `globalThis.test` (injected by `globals: true` in `vitest.config.js`). Test files were not rewritten; they still `require("./harness")` and look identical. What Vitest buys: parallel file execution (~12 s wall clock vs. ~3 min sequential), watch mode, IDE integration via Vitest's per-`test` discovery, snapshot testing, and proper diff output on failures. A future contributor who wants Vitest's full DSL can use `describe / it / expect` directly — they're global. Per-test timeout is 30 s in the config to accommodate the slow stats cross-validations (deep-tail `cpsets`, `qtukey` at small df). The bespoke functional-React mock in `tests/helpers/render-loader.js` (354 lines) is unchanged — converting `tests/components.test.js` to real React + happy-dom is a separate refactor not yet done.

`scripts/run-vitest.js` is the wrapper `npm test` invokes; it tees Vitest's stdout/stderr to `.test-output.log` so the `posttest` hook can read the canonical `Tests  N passed (N)` line and update the landing-page test-count badge. Vitest's exit code propagates unchanged.

### Fuzz harnesses

Every plot tool has a paired fuzz harness under `tests/fuzz/<tool>.fuzz.js`, wired to `npm run fuzz:<tool>`. These feed the shared pathological-input corpus (`tests/fuzz/generators.js`) through each tool's parse → compute → render pipeline and assert structural invariants, not exact outputs. Run with `FUZZ_SEED=<n>` / `FUZZ_N=<n>` / `FUZZ_QUIET=1` env vars to vary seeds / iteration counts / output. Default cadence is 2 × 1000 iterations; 10k sweeps across seeds 1 / 42 / 999 are expected to report zero crashes before a release.

### Test standards (mandatory for new work)

New features that add user-visible behaviour or data-pipeline logic must ship with tests in the same PR/commit as the feature. The bar varies by what you touched:

- **New shared function** in `shared.js` / `stats.js` / any `shared-*.js` → export from the matching loader in `tests/helpers/` and add unit tests to the appropriate `tests/*.test.js` file (or create a new one if the domain is new).
- **New plot tool** → ships with (a) at least one dedicated `tests/<tool>.test.js` for any non-trivial pure helpers (intersection / aggregation / layout math), and (b) a `tests/fuzz/<tool>.fuzz.js` harness wired into `package.json` as `fuzz:<tool>`. Pattern the fuzz harness after `tests/fuzz/upset.fuzz.js` — load the tool's pure helpers via a `tests/helpers/<tool>-loader.js` that transforms `tools/<tool>/helpers.ts` to CommonJS with `esbuild.transformSync` (or `buildSync` for multi-file barrels) and evaluates it under `vm.runInContext` with the shared globals pre-loaded. Every tool keeps its pure helpers in a dedicated `helpers.ts` sibling for exactly this reason.
- **New pure helper inside a tool** → if it's non-trivial (any math, filtering, sorting, layout, label-disambiguation), put it in `tools/<tool>/helpers.ts` and export it from the loader above, then add unit tests. If it's already covered by the tool's fuzz invariants, a fuzz-only addition is acceptable — note this in the PR/commit message.
- **New chart component** → add a render-smoke assertion in `tests/components.test.js` (or the tool-specific fuzz harness) that builds with realistic inputs and confirms it doesn't throw.
- **Bug fix that wasn't caught by existing tests** → add a regression test reproducing the original failure before committing the fix. If a fuzz harness could have caught it, extend the fuzz invariants too.

### Landing-page test counter

`index.html` renders an `N internal tests` badge in the trust-badge row and footer. **The badge is the project's single source of truth for the test count — README and other docs should not hard-code a number.** It is auto-bumped by `scripts/bump-test-count.js` (`posttest` hook in `package.json`), which reads the canonical `Tests  N passed (N)` line from Vitest's verbose-reporter output (captured in `.test-output.log` by `scripts/run-vitest.js`) and rewrites the two spots in `index.html`. CI's badge-verify step is the backstop and accepts both the Vitest line and the legacy pre-Vitest `X/X passed` per-suite format so a stale checkout mid-upgrade still gates correctly. Fuzz iterations do not count (they are randomised); only the deterministic `tests/*.test.js` cases do. The bump itself doesn't require a CHANGELOG entry — log only the _change that drove the new tests_.

## Architecture

### Tool structure

The repository ships **eight plot tools** (each in its own folder) and **two single-file calculators**, plus the landing page and the public benchmark report:

- `index.html` — landing page with tool grid; loads tools in iframes; prefetches vendor scripts with progress bar.
- `benchmark.html` — generated public report comparing R 4.5 reference values vs. `tools/stats.js` (regenerated by `npm run benchmark`).
- `privacy.html` — data-flow / trust page reachable from the privacy badge.

**Plot tools — folder-per-tool layout** (`tools/<tool>/index.tsx` is the bundled entry):

| Tool         | HTML                  | Source folder            | What it does                                                                                                          |
| ------------ | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| RLU timecourse / aequorin | `tools/aequorin.html` | `tools/aequorin/` | Luminescence time-course (mean ± SD, per-replicate integrals) with optional aequorin Ca²⁺ calibration.                |
| Group Plot   | `tools/boxplot.html`  | `tools/boxplot/`         | Box / violin / raincloud / bar with auto-selected test + post-hocs.                                                   |
| Line Plot    | `tools/lineplot.html` | `tools/lineplot/`        | Mean ± SEM / SD / 95 % CI per group across a shared x, with per-x significance markers.                               |
| Scatter      | `tools/scatter.html`  | `tools/scatter/`         | XY with colour / size / shape mapping, reference lines, optional linear regression.                                   |
| Heatmap      | `tools/heatmap.html`  | `tools/heatmap/`         | Matrix heatmap with hierarchical / k-means clustering, dendrograms, zoomed detail view.                               |
| Venn         | `tools/venn.html`     | `tools/venn/`            | 2–3 set area-proportional Venn with click-to-extract region members.                                                  |
| UpSet        | `tools/upset.html`    | `tools/upset/`           | 4+ set intersection plot with multi-set significance via `SuperExactTest`-style `cpsets`.                             |
| Volcano      | `tools/volcano.html`  | `tools/volcano/`         | log2FC vs −log10(p) for −omics hits; auto-detects DESeq2 / limma / edgeR column conventions.                          |

Each plot folder owns roughly:

- `index.tsx` — the bundled entry: imports the shell, mounts `App()`. **Should stay slim** — chart, controls, steps belong in their own files.
- `chart.tsx` — the SVG renderer (kept as `forwardRef`).
- `controls.tsx` — sidebar / tile components (per-tool).
- `steps.tsx` — UploadStep / ConfigureStep / FilterStep / OutputStep wrappers.
- `helpers.ts` — pure helpers (math / layout / label disambiguation). Imported by the tool's test loader (`tests/helpers/<tool>-loader.js`); a tool may also have a `helpers/` folder with multiple files re-exported through `helpers.ts` as a barrel (see `tools/venn/`).
- `plot-area.tsx` (where applicable) — composes chart + overlays + stats panels.
- `stats-panel.tsx` (where applicable) — the in-app statistics tile.
- `reports.ts` (where applicable) — R-script export builder for that tool.
- `howto.tsx` — the per-tool How-to content rendered through `_shell/HowTo.tsx`.

**Calculators — single-file layout** (no folder, no shell):

- `tools/molarity.tsx` → `tools/molarity.html` — molarity / dilution / ligation prep sheets. Self-contained; does not use the plot-tool scaffold.
- `tools/power.tsx` → `tools/power.html` — statistical power analysis (t / ANOVA / χ² / correlation). Single-file because it has no upload step / column-role flow.

Each tool HTML loads vendored React/ReactDOM and `shared.bundle.js` in `<head>`, then loads its compiled `.js` file (`tools/<tool>/index.js` for plot tools, `tools/molarity.js` / `tools/power.js` for calculators). Run `npm run build` to compile every entry. The full list of esbuild entry points lives in `package.json`'s `build` script — keep this section in sync with that list when you add a tool.

### Shared code
All shared browser globals are concatenated at build time into a single
`tools/shared.bundle.js` by `scripts/build-shared.js` (runs in `prebuild`,
`prewatch`, and `pretest`). Every HTML loads **one** `<script src="shared.bundle.js">`;
HTML files never list individual shared files. The canonical load order is the
`FILES` array at the top of `scripts/build-shared.js` — if you add a new shared
file, add it there, nowhere else.

Source files live side-by-side in `tools/` and stay the editable units:
- `tools/shared.js` — plain JS globals: color helpers, numeric detection, seeded random, axis tick generation, separator detection, CSV parsing, statistics, download helpers, `roleColors` (chrome styling lives in `tools/components.css` via `dv-*` classes; see the Theming section)
- Shared UI split into focused plain-JS files (all `React.createElement`, NOT JSX):
  - `tools/shared-color-input.js` — `normalizeHexColor`, `ColorInput`
  - `tools/shared-file-drop.js` — `FileDropZone`
  - `tools/shared-svg-legend.js` — `computeLegendHeight`, `renderSvgLegend`
  - `tools/shared-core.js` — `DataPreview`, `ErrorBoundary`
  - `tools/shared-ui.js` — `SliderControl`, `StepNavBar`, `CommaFixBanner`, `ParseErrorBanner`, `PageHeader`, `UploadPanel`, `ActionsPanel` (depends on `shared-file-drop.js`)
  - `tools/shared-prefs.js` — `loadAutoPrefs`, `saveAutoPrefs`, `exportPrefsFile`, `importPrefsFile`, `clearAutoPrefs`, `PrefsPanel` — persists per-tool plot render settings to `localStorage` and to a portable `.json` file (depends on `shared.js`)
  - `tools/shared-long-format.js` — `ColumnRoleEditor`, `FilterCheckboxPanel`, `RenameReorderPanel`, `StatsTable`, `GroupColorEditor`, `BaseStyleControls` (depends on `shared-color-input.js`)
  - `tools/shared-r-export.js` — R reproducibility-script builders used by the download tiles in each plot tool
  - `tools/shared-stats-tile.js` — `assignBracketLevels`, `StatsTile` (depends on `stats.js`)
  - `tools/theme.js` — theme toggle wiring + `ThemeToggle` React component (runs first so its `data-theme-toggle` listener is live before any tool mounts)
- `tools/stats.js` — plain JS statistical functions (loaded as `<script>` global):
  - **Distributions**: `normcdf`, `norminv`, `tcdf`, `tinv`, `fcdf`, `chi2cdf`, `chi2inv`, `nctcdf`, `ncf_sf`, `ncchi2cdf`
  - **Helpers**: `gammaln`, `betai`, `betacf`, `gammainc`, `gammainc_upper`, `bisect`
  - **Descriptive**: `sampleMean`, `sampleVariance`, `sampleSD`
  - **Tests**: `shapiroWilk`, `leveneTest`, `tTest`, `mannWhitneyU`, `oneWayANOVA`, `welchANOVA`, `kruskalWallis`
  - **Effect sizes**: `cohenD`, `hedgesG`, `rankBiserial`, `etaSquared`, `epsilonSquared`
  - **Post-hoc**: `ptukey`, `qtukey`, `tukeyHSD`, `gamesHowell`, `dunnTest`, `bhAdjust`, `compactLetterDisplay`
  - **Utilities**: `rankWithTies`, `selectTest`

### Shared code constraint
**All `tools/shared*.js` files, `theme.js`, and `stats.js` must remain plain JS** (`React.createElement`, not JSX). They are concatenated into `tools/shared.bundle.js` with no transform, so their top-level declarations are available as globals to the compiled tool `.js` files. If they used JSX, they would need their own build step and careful scoping.

**If you add a new shared file:** create it under `tools/`, add its filename to the `FILES` array in `scripts/build-shared.js` (in the correct load order), and run `npm run build:shared` (or any `npm run build` / `npm test` — both regenerate the bundle first). HTML files stay unchanged.

**If you edit an existing shared file:** run `npm run build:shared` (or leave `node scripts/build-shared.js --watch` running in a second terminal alongside `npm run watch`). `npm run build` / `npm test` regenerate it automatically via their `pre*` hooks.

The bundle is checked into git (same convention as the compiled tool `.js` files) so the static GitHub Pages deploy keeps working without a server-side build.

### Theming (light / dark)
Theme switching is driven by CSS custom properties on `:root`, toggled via a `data-theme="dark"` attribute on `<html>`. The full palette lives in `tools/theme.css` (source of truth for every variable). Theme state is persisted in `localStorage` under `dataviz-theme`; a no-FOUC inline `<script>` in every HTML `<head>` reads it synchronously before first paint. On the very first visit with no stored choice, the `prefers-color-scheme` media query decides. A `ThemeToggle` button lives in `PageHeader` (all tools) and on the landing page; `storage` events sync toggles across all open same-origin iframes for free.

**Rule for contributors: chrome colors use `var(--name)`, SVG colors stay as literals.** Every inline `style={{ … }}` on a React element that is *not* inside a chart component (`<svg>`, `<rect>`, `<path>`, `<text>`, etc.) must reference CSS variables so it themes correctly. Element fills, strokes, and text fills *inside* SVG must stay as hex literals so exported SVG/PNG charts render the same way on any reader — the plot card wrapping each chart is hard-coded to `var(--plot-card-bg)` which resolves to white in both themes, so charts always sit on a white canvas.

This rule is enforced by a custom ESLint rule (`plottr/no-chrome-hex-literal`, defined in `scripts/eslint-rules/no-chrome-hex-literal.js`) that fires on any inline `style={{ key: "#abc..." }}` JSX attribute outside an SVG subtree. SVG element ancestors (svg / g / rect / path / line / circle / ellipse / text / polyline / polygon / tspan / defs / linearGradient / radialGradient / stop / clipPath / mask / marker / use / image / foreignObject / pattern) are exempt — chart internals legitimately use hex literals. The rule only inspects inline object expressions; identifier refs (`style={someStyle}`) and spreads pass through unchecked.

Common variables: `--page-bg`, `--surface`, `--surface-subtle`, `--surface-sunken`, `--text`, `--text-muted`, `--text-faint`, `--border`, `--border-strong`, `--accent-primary`, `--accent-plot`, `--accent-download`, `--accent-dna`, `--on-accent`, `--plot-card-bg`, `--plot-card-border`, `--info-bg`/`--info-text`/`--info-border`, `--success-bg`/`--success-text`/`--success-border`, `--warning-bg`/`--warning-text`/`--warning-border`, `--danger-bg`/`--danger-text`/`--danger-border`, `--neutral-bg`/`--neutral-text`, `--subhead-bg`/`--subhead-text`. See `tools/theme.css` for the full list and the dark overrides.

### Data flow
File upload/paste -> `autoDetectSep` + `fixDecimalCommas` + `parseRaw` -> `DataPreview` table -> user assigns column roles -> `computeStats`/`quartiles` -> React SVG rendering -> SVG/CSV export

**Ingest size policy:** any new ingest surface (paste textarea, URL fetch, clipboard handler, …) must gate on `FILE_LIMIT_BYTES` (2 MB hard reject) and `FILE_WARN_BYTES` (1 MB warn) from `tools/shared-file-drop.js` and surface the same red-banner UX `FileDropZone` uses. Both names are script-scope globals via the shared bundle — don't redeclare a local 2-MB number.

### Per-tool palettes
`PALETTE` is defined in `shared.js` as the global default. Tools may override if needed.

### Tool-internal structure
Plot tools live as folders (`tools/<tool>/`); calculators live as single files (`tools/molarity.tsx`, `tools/power.tsx`). Inside a plot-tool folder the convention is:

1. **Chart component** in `chart.tsx` (e.g. `BoxplotChart`, `BarChart`, `ScatterChart`) — the SVG renderer, kept as `forwardRef`.
2. **Step sub-components** in `steps.tsx` — `UploadStep`, `ConfigureStep`, `FilterStep`, `OutputStep` etc.
3. **Sidebar / tile components** in `controls.tsx`.
4. **Pure helpers** (math / layout / label disambiguation) in `helpers.ts`. These are what the test loader picks up; if they get sprawling, split into a `helpers/` folder and re-export from `helpers.ts` as a barrel (see `tools/venn/`).
5. **App()** in `index.tsx` — orchestrator holding state and routing between steps. **Keep `index.tsx` slim**: `VIS_INIT_<TOOL>` at module scope, `App()`, and the `ReactDOM.createRoot` mount call. Tile / control / chart / step components belong in their own files.

### Shared plot-tool scaffold (`tools/_shell/`)
All eight plot tools (Aequorin, Boxplot, Lineplot, Scatter, Heatmap, Venn, UpSet, Volcano) use the shared scaffold under `tools/_shell/`. Unlike the plain-JS `shared-*.js` globals, these are TypeScript modules imported via `import { … } from "./_shell/…"` and resolved by esbuild when bundling each tool. The two calculators (`molarity.tsx`, `power.tsx`) intentionally do **not** use this scaffold — they have no upload step, no column roles, no step navigator, so the shell would be dead weight.

- `tools/_shell/usePlotToolState.ts` — `usePlotToolState<TVis>(toolKey, initialVis)` typed hook. Owns step state, upload fields (`fileName`, `parseError`, `sepOverride`, `commaFixed`, `commaFixCount`), and the `vis` reducer with auto-prefs persistence (`loadAutoPrefs` on init, `saveAutoPrefs` on change, `_reset` sentinel for reset-to-defaults).
- `tools/_shell/PlotToolShell.tsx` — outer page frame. Renders `PageHeader` (with `PrefsPanel` in the right slot), `StepNavBar`, `CommaFixBanner`, `ParseErrorBanner`, then delegates to `children`. Takes the hook's return as a `state` prop.
- `tools/_shell/ScrollablePlotCard.tsx` — horizontal-scroll affordances (edge fades + "Scroll for more →" pill driven by `ResizeObserver`). Used only by UpSet (`tools/upset/`); venn and heatmap intentionally don't wrap their plot cards (their charts auto-fit), so a plain `<div className="dv-panel dv-plot-card">` is correct there. Lift any new horizontally-scrolling tool into this component rather than re-deriving it.
- `tools/_shell/stats-dispatch.ts` — `runTest` / `runPostHoc` / `postHocForTest` dispatchers shared by boxplot, lineplot, and aequorin.
- `tools/_shell/chart-layout.ts` — `CHART_MARGIN` and `buildLineD` used by both lineplot and aequorin. Rule of thumb: once a pure typed helper becomes byte-identical across two tools, lift it here and re-export from each tool's `helpers.ts` barrel. `_shell/` is the canonical home for shared *typed* helpers; `shared-*.js` in `tools/` remains the home for shared *plain-JS* globals consumed by every HTML entrypoint.

**Standard wiring pattern** (every migrated tool follows this shape — start from `tools/upset/index.tsx` as the canonical reference):

```tsx
import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";

const { useState /* , useReducer, useMemo, ... */ } = React;

const VIS_INIT_<TOOL> = { /* persisted vis props */ };

function App() {
  const shell = usePlotToolState("<toolkey>", VIS_INIT_<TOOL>);
  const { step, setStep, fileName, setFileName, setParseError,
          sepOverride, setSepOverride, setCommaFixed, setCommaFixCount,
          vis, updVis } = shell;
  // tool-specific state (parsedRows, colRoles, filters, selection, …) stays local
  return (
    <PlotToolShell state={shell} toolName="…" title="…" subtitle="…"
                   visInit={VIS_INIT_<TOOL>} steps={[…]} canNavigate={…}>
      {/* step content */}
    </PlotToolShell>
  );
}
```

Key conventions:

- Hoist `VIS_INIT_<TOOL>` to **module scope** (not inside `App()`) so `usePlotToolState` can use it as both the reducer initial state and the `_reset` target.
- Tool-specific state (parsed rows, selection, tool-only reducers like boxplot's `statsUi` or heatmap's `cellBorder`) stays inline in `App()` — the scaffold intentionally does not become a kitchen sink.
- If a tool needs a dual-variant parse banner (e.g. aequorin's yellow "⚠️" warning vs. red error), keep `parseError` as **local** state and render the custom banner as `PlotToolShell` children; the shared `ParseErrorBanner` only renders the red error variant.

**esbuild flags matter.** The build command in `package.json` uses `--bundle --format=esm --minify-syntax --minify-whitespace --sourcemap`. `--bundle` inlines `_shell/*` imports so the tool loads from a classic `<script>` tag; `--format=esm` avoids IIFE wrapping (which would hide chart consts like `BoxplotChart` from render-smoke tests); `--minify-syntax --minify-whitespace` (not `--minify`) preserves top-level identifier names so the render harness can find them. Do not change these without also updating the render-smoke test harness.

**Test-loader pattern.** Per-tool test loaders (`tests/helpers/<tool>-loader.js`) transform `tools/<tool>/helpers.ts` to CommonJS with `esbuild.transformSync` (or `esbuild.buildSync` with `bundle: true` when the tool's `helpers.ts` is a barrel that re-exports from sibling files — see `tests/helpers/venn-loader.js`), then evaluate the result under `vm.runInContext` with the shared globals (`tools/shared.js`, sometimes `tools/stats.js`) pre-loaded into the context. Exports are read off a `module.exports` object threaded into the vm context via `ctx.module`. **If you add a new pure helper to a tool**, put it in `tools/<tool>/helpers.ts`, and add it to the `module.exports` block at the bottom of the matching loader — that's the only step; no slicing, no regex stripping.

**If you add a new plot tool**, start by copying the `tools/upset/` folder (or any other migrated plot tool) and adapting `chart.tsx` / `controls.tsx` / `steps.tsx` / `helpers.ts`. Do not re-derive the scaffold and do not stuff the whole tool into `index.tsx` — keep `index.tsx` to the `App()` orchestrator + module-scope `VIS_INIT_<TOOL>`.

### SVG export: named groups for Inkscape
Exported SVGs are routinely re-opened in Inkscape for touch-ups, so **every chart must wrap its elements in `<g id="...">` groups with human-readable ids**. When adding a new chart (or a new element to an existing chart), give the wrapping group a descriptive id so Inkscape users can select it by name from the Objects panel / XML editor.

Conventional ids already used across tools — reuse them for consistency:

- **Structure** — `background` (full SVG canvas rect, wrapped in a group), `plot-area-background` (inner rect inside the chart margins), `plot-frame` (border around the data area), `chart` (transformed wrapper holding the data + axes)
- **Axes** — `grid`, `axis-x`, `axis-y`, `x-axis-label`, `y-axis-label`
- **Data** — `data-points`, `groups`, `bars`, `traces`, `ribbons`, `set-circles`, `region-counts`, `power-curve`, `marker`, `error-bars`, `cells` (heatmap)
- **Overlays** — `regression-line`, `regression-stats`, `reference-line`, `reference-lines`, `reference-line-labels`, `selected-region`, `selection-mask` (heatmap)
- **Annotations** — `cld-annotations`, `significance-brackets`, `significance-stars`, `stats-summary`, `subgroup-separators`, `subgroup-labels`
- **Text** — `title`, `subtitle`, `legend`, `row-labels` (heatmap), `col-labels` (heatmap)
- **Heatmap-specific** — `col-dendrogram`, `row-dendrogram`, `col-cluster-strip`, `row-cluster-strip`, `colorbar`

For per-series / per-group elements, build individual ids with `svgSafeId(name)` (defined in `shared.js` and available as a global to all compiled tools): e.g. `set-${svgSafeId(setName)}`, `group-${svgSafeId(g.name)}`, `bar-${svgSafeId(prefix)}`, `trace-${svgSafeId(prefix)}`, `ribbon-${svgSafeId(prefix)}`, `points-${svgSafeId(name)}`, `errbars-${svgSafeId(name)}`, `cell-${svgSafeId(rowLabel)}-${svgSafeId(colLabel)}`. `svgSafeId` sanitizes arbitrary strings into valid SVG NCNames (letters/digits/hyphens/underscores/periods, no leading digit), so it's safe to pass raw user-entered labels.

## Testing helpers

Test helpers in `tests/helpers/` load shared code into Node `vm` contexts with DOM stubs. Two flavours:

- **Generic shared loaders** load the `shared-*.js` bundle globals into a vm context: `shared-loader.js`, `parsing-fns.js`, `components-loader.js`, `render-loader.js` (functional React mock for render-smoke), `prefs-loader.js`, `r-export-loader.js`, `stats-dispatch-loader.js`, `discrete-palette-loader.js`, `handoff-loader.js`.
- **Per-tool loaders** transform `tools/<tool>/helpers.ts` to CommonJS (via `esbuild.transformSync`, or `buildSync` for barrels) and run it under `vm.runInContext` with the shared globals pre-loaded. One per plot tool: `aequorin-loader.js`, `boxplot-loader.js`, `boxplot-stats-reducer-loader.js`, `heatmap-loader.js`, `lineplot-loader.js`, `scatter-loader.js`, `upset-loader.js`, `venn-loader.js`, `volcano-loader.js`.

When adding new functions to `shared.js`, `stats.js`, or any `shared-*.js` file, export them in the corresponding loader so the unit tests can see them. When adding a pure helper to `tools/<tool>/helpers.ts`, add it to the `module.exports` block at the bottom of the matching per-tool loader.

## Benchmark suite

```bash
npm run benchmark   # runs R reference suite then cross-validates against JS
```

`benchmark/run-r.R` — computes reference values in R 4.5 for distributions, tests, and post-hocs.
`benchmark/run.js` — Node script that loads `stats.js` and compares against the R output (`benchmark/results-r.json`). Any divergence > tolerance fails with a non-zero exit code.

## Code style & conventions

### JavaScript / TypeScript
- Use `const` / `let` — never `var`. The codebase is ES2022 throughout.
- Arrow functions preferred for callbacks; regular `function` declarations for named top-level functions.
- All `.tsx` and `.ts` files under `tools/` are type-checked with `strict: true` plus `noImplicitReturns` and `noFallthroughCasesInSwitch`. Add types where they add clarity; for sprawling step-component prop bags that just pass reducer-state slots through, an explicit `: any` annotation on the destructure is acceptable (matches what the tool .tsx files use today). For pure helpers (`_shell/**`, `<tool>/helpers.ts`, `venn/*.ts`, etc.), annotate every parameter and return type — that's where the math lives.
- Shared files (`shared.js`, `stats.js`, and all `shared-*.js`) are plain ES2022 script-scope JS. No `import`/`export` — names are globals by design.

### Formatting (Prettier, enforced in CI)
- Print width: 100 columns
- 2-space indentation
- Double quotes for strings
- Semicolons required
- Trailing commas in ES5 positions (arrays, objects, function params)
- Arrow function parentheses always (`(x) => …`)

### Linting (ESLint flat config, enforced in CI)
- `eslint.config.js` defines three environments:
  - **Node/CommonJS** — `eslint.config.js`, `scripts/**/*.js`, `benchmark/**/*.js`, `tests/**/*.js`
  - **Browser + shared globals** — `tools/*.tsx` (TypeScript parser, React plugin)
  - **Browser + shared globals** — `tools/*.js` (hand-written shared files; `no-unused-vars` and `no-redeclare` disabled because names are consumed as globals)
- Compiled outputs (`tools/boxplot.js`, etc.) are in the `ignores` list — never lint generated files.
- `@typescript-eslint/no-unused-vars` warns on unused vars/args in `.tsx` files; prefix with `_` to suppress.

### CI checks (GitHub Actions — `.github/workflows/test.yml`)
All of the following must pass before merging:
1. `npm run lint` — ESLint
2. `npm run format:check` — Prettier dry-run
3. `npm run typecheck` — `tsc --noEmit`
4. `npm test` — full deterministic suite (every `tests/*.test.js`)
5. `npm run build` — esbuild compilation

Run them locally in this order before committing to catch issues early.

## Development workflow

```bash
npm run build          # compile every entry in package.json → tools/<…>.js (one-shot)
npm run watch          # recompile on save (~5 ms)
npm test               # run every tests/*.test.js (24 deterministic suites)
npm run typecheck      # tsc --noEmit (TypeScript type checking, no emit)
npm run lint           # ESLint
npm run format:check   # Prettier dry-run (used in CI)
npm run format         # Prettier auto-fix
npm run benchmark      # R + JS cross-validation suite
```

Edit `.tsx` source files, run build (or use watch mode), reload in browser. The compiled `.js` files are checked into git for static deployment via GitHub Pages. Do **not** edit the `.js` files directly.

### Pre-commit hook

A native git hook at `scripts/hooks/pre-commit` rebuilds and re-stages any drifted compiled outputs (`tools/**/index.js`, `tools/*.js`, `tools/*.js.map`, `tools/shared.bundle.js`, `tools/version.js`) whenever staged changes touch source that affects the build: `tools/**/*.tsx`, `tools/<tool>/helpers.ts`, `tools/_shell/*`, `tools/shared*.js`, `tools/stats.js`, `tools/theme.js`, or the `scripts/build-*.js` themselves. This catches sourcemap drift at commit time instead of at CI/merge time (a real issue: `_shell/*` content is inlined into every plot tool's `.js.map` via `sourcesContent`, so a `_shell/*` edit invalidates all eight maps).

The hook installs automatically via `npm install` (`prepare` script runs `scripts/hooks/install.js`, which points `git config core.hooksPath` at `scripts/hooks/`). Bypass with `git commit --no-verify` if you genuinely need to commit without rebuilding.

## CHANGELOG.md

**Any user-visible change must be logged in `CHANGELOG.md` under `## [Unreleased]`** before the commit that ships it, using the Keep a Changelog sections (`Added` / `Changed` / `Fixed` / `Removed`). This applies to bug fixes, new features, UI tweaks, and behavior changes — not to internal refactors or test-only edits. Don't wait to be asked — update the changelog in the same commit as the code change.

**Length convention (introduced in 1.1.0).** A changelog entry is one or two short sentences:
the *what*, optionally a tiny piece of *why* if it isn't obvious from the title, and (where it
helps) a "regression: N tests" tag. Keep it under ~80 words. The full long-form context — root
cause, alternatives considered, file-by-file inventory, trade-offs — goes into a per-release
note under `docs/release-notes/<version>.md` linked from the version heading. The CHANGELOG is
the index, not the encyclopedia. Older entries (v1.0.x and earlier) intentionally retain their
long-form prose as historical record; the new convention applies prospectively.

When you cut a release, *before* renaming `## [Unreleased]` to the version heading, lift any
long-form prose that grew during the cycle into `docs/release-notes/v<version>.md` and shorten
the CHANGELOG bullets to point there. The release note is a normal markdown file with `##`
section headings (Added / Changed / Fixed map to `## ✨` / `## 🔧` / `## 🐛` or whatever fits
the contents) and is linked from each CHANGELOG bullet via `[`docs/release-notes/v1.x.y.md`](docs/release-notes/v1.x.y.md#anchor)`.

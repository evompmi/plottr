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

**Test runner: Vitest 3.x with a thin compat shim.** The 24 `tests/*.test.js` files keep the project's house vocabulary — `suite() / test() / assert() / eq() / approx() / throws() / summary()` — through `tests/harness.js`, which is now a ~50-line adapter that delegates to Vitest's `globalThis.test` (injected by `globals: true` in `vitest.config.js`). Test files were not rewritten; they still `require("./harness")` and look identical. What Vitest buys: parallel file execution (~12 s wall clock vs. ~3 min sequential), watch mode, IDE integration via Vitest's per-`test` discovery, snapshot testing, and proper diff output on failures. A future contributor who wants Vitest's full DSL can use `describe / it / expect` directly — they're global. Per-test timeout is 30 s in the config to accommodate the slow stats cross-validations (deep-tail `cpsets`, `qtukey` at small df).

**Component rendering: real React 18 + happy-dom.** The previous bespoke 354-line functional-React mock under `tests/helpers/render-loader.js` was retired alongside the Vitest migration. The helper is now ~140 lines that delegate to the real `react`, `react-dom/server`, and `react-dom/client` packages plus happy-dom. `tests/components.test.js` declares `// @vitest-environment happy-dom` at the top and exercises shared components + chart components from compiled tool .js files via `renderHtml(Component, props)` (synchronous static-HTML render) and `renderWithEffects(Component, props)` (mount through `react-dom/client.createRoot` + `act` for tests that depend on `useEffect` actually firing). Assertions read DOM / HTML directly — no more `el.type === "div"` or `JSON.stringify(el).indexOf("X")`. The shared bundle and tool .js files load via `vm.runInThisContext` so their script-mode top-level `function` / `var` declarations attach to globalThis where the test rig can grab them.

`npm test` is `vitest run`; Vitest's exit code propagates to CI / pre-commit / `&&`-style chains. There is no separate test-count badge or post-test bumper — the landing page no longer surfaces an internal-tests count, so there is nothing to keep in sync.

### Fuzz harnesses

Every plot tool has a paired fuzz harness under `tests/fuzz/<tool>.fuzz.js`, wired to `npm run fuzz:<tool>`. These feed the shared pathological-input corpus (`tests/fuzz/generators.js`) through each tool's parse → compute → render pipeline and assert structural invariants, not exact outputs. Run with `FUZZ_SEED=<n>` / `FUZZ_N=<n>` / `FUZZ_QUIET=1` env vars to vary seeds / iteration counts / output. Default cadence is 2 × 1000 iterations; 10k sweeps across seeds 1 / 42 / 999 are expected to report zero crashes before a release.

### Test standards (mandatory for new work)

New features that add user-visible behaviour or data-pipeline logic must ship with tests in the same PR/commit as the feature. The bar varies by what you touched:

- **New shared function** in `shared.js` / `stats.js` / any `shared-*.js` → export from the matching loader in `tests/helpers/` and add unit tests to the appropriate `tests/*.test.js` file (or create a new one if the domain is new).
- **New plot tool** → ships with (a) at least one dedicated `tests/<tool>.test.js` for any non-trivial pure helpers (intersection / aggregation / layout math), and (b) a `tests/fuzz/<tool>.fuzz.js` harness wired into `package.json` as `fuzz:<tool>`. Pattern the fuzz harness after `tests/fuzz/upset.fuzz.js` — load the tool's pure helpers via a `tests/helpers/<tool>-loader.js` that transforms `tools/<tool>/helpers.ts` to CommonJS with `esbuild.transformSync` (or `buildSync` for multi-file barrels) and evaluates it under `vm.runInContext` with the shared globals pre-loaded. Every tool keeps its pure helpers in a dedicated `helpers.ts` sibling for exactly this reason.
- **New pure helper inside a tool** → if it's non-trivial (any math, filtering, sorting, layout, label-disambiguation), put it in `tools/<tool>/helpers.ts` and export it from the loader above, then add unit tests. If it's already covered by the tool's fuzz invariants, a fuzz-only addition is acceptable — note this in the PR/commit message.
- **New chart component** → add a render-smoke assertion in `tests/components.test.js` (or the tool-specific fuzz harness) that builds with realistic inputs and confirms it doesn't throw.
- **Bug fix that wasn't caught by existing tests** → add a regression test reproducing the original failure before committing the fix. If a fuzz harness could have caught it, extend the fuzz invariants too.

## Architecture

### Tool structure

The repository ships **eight plot tools** (each in its own folder) and **two single-file calculators**, all served from a single hash-routed SPA. Pre-iframe→SPA migration each tool had its own `tools/<tool>.html` page that the landing page hid in 10 iframes; that shell is gone — there's now one `index.html`, one ReactDOM mount, one bundle.

- `index.html` — landing page **and** SPA entry. The static landing markup (tile grid, "How it works" pills, trust badges) is HTML; clicking a tile sets `location.hash = "#/<tool>"` and the SPA shell renders the matching tool component into `<div id="root">`. A short inline IIFE near the bottom toggles a `data-spa-route="active"` attribute on `<html>` whenever a route is present, and CSS hides the landing accordingly.
- `benchmark.html` — generated public report comparing R 4.5 reference values vs. `tools/stats.js` (regenerated by `npm run benchmark`). Independent page; not part of the SPA.
- `privacy.html` — data-flow / trust page reachable from the privacy badge. Independent page.

**SPA shell** lives under `tools/_app/`:

- `tools/_app/Router.tsx` — minimal hash router (`useSyncExternalStore` over `window.location.hash`). Exposes `useRoute()` (returns the current route key or null) and `navigate(key)` (updates the hash, fires the `hashchange` event the router listens for). Hand-rolled, ~30 lines — `react-router-dom` is overkill for 10 fixed routes and would violate the no-runtime-CDN-deps stance.
- `tools/_app/tool-registry.ts` — single source of truth for the 10 tool routes. Each entry: `{ key, label, iconSvg, Component }`. Imports `App` from each tool's `app.tsx` (via `import { App as <Tool>App } from "../<tool>/app"`).
- `tools/_app/App.tsx` — top-level switcher. Reads the route, renders either a "landing placeholder" (route is null — only ever shown if the static landing's CSS hide-rule fails) or a `ToolTopbar` + the tool component wrapped in the existing `ErrorBoundary` from `tools/shared-core.js`.
- `tools/_app/index.tsx` — single ReactDOM mount + registers `window.__plottrSpaNavigate = navigate` so `tools/shared-handoff.js` can switch tools in place when a cross-tool handoff fires.

**Plot tools — folder-per-tool layout** (`tools/<tool>/app.tsx` is the SPA-importable entry):

| Tool         | Source folder            | What it does                                                                                                          |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| RLU timecourse / aequorin | `tools/aequorin/` | Luminescence time-course (mean ± SD, per-replicate integrals) with optional aequorin Ca²⁺ calibration.                |
| Group Plot   | `tools/boxplot/`         | Box / violin / raincloud / bar with auto-selected test + post-hocs.                                                   |
| Line Plot    | `tools/lineplot/`        | Mean ± SEM / SD / 95 % CI per group across a shared x, with per-x significance markers.                               |
| Scatter      | `tools/scatter/`         | XY with colour / size / shape mapping, reference lines, optional linear regression.                                   |
| Heatmap      | `tools/heatmap/`         | Matrix heatmap with hierarchical / k-means clustering, dendrograms, zoomed detail view.                               |
| Venn         | `tools/venn/`            | 2–3 set area-proportional Venn with click-to-extract region members.                                                  |
| UpSet        | `tools/upset/`           | 4+ set intersection plot with multi-set significance via `SuperExactTest`-style `cpsets`.                             |
| Volcano      | `tools/volcano/`         | log2FC vs −log10(p) for −omics hits; auto-detects DESeq2 / limma / edgeR column conventions.                          |

Each plot folder owns roughly:

- `app.tsx` — exports `function App()`. Imported by `tools/_app/tool-registry.ts`. Pre-SPA this file was named `index.tsx` and ended with a `ReactDOM.createRoot(...).render(<App/>)` mount line; the iframe→SPA migration split off the mount into `index.tsx` (then deleted that wrapper entirely once the iframe shell went away).
- `chart.tsx` — the SVG renderer (kept as `forwardRef`).
- `controls.tsx` — sidebar / tile components (per-tool).
- `steps.tsx` — UploadStep / ConfigureStep / FilterStep / OutputStep wrappers.
- `helpers.ts` — pure helpers (math / layout / label disambiguation). Imported by the tool's test loader (`tests/helpers/<tool>-loader.js`); a tool may also have a `helpers/` folder with multiple files re-exported through `helpers.ts` as a barrel (see `tools/venn/`).
- `plot-area.tsx` (where applicable) — composes chart + overlays + stats panels.
- `stats-panel.tsx` (where applicable) — the in-app statistics tile.
- `reports.ts` (where applicable) — R-script export builder for that tool.
- `howto.tsx` — the per-tool How-to content rendered through `_shell/HowTo.tsx`.

**Calculators — flat layout** (no folder, no plot scaffold):

- `tools/molarity-app.tsx` — molarity / dilution / ligation prep sheets. Self-contained; does not use the plot-tool scaffold.
- `tools/power-app.tsx` — statistical power analysis (t / ANOVA / χ² / correlation). Self-contained because it has no upload step / column-role flow.

Both calculators export `function App()` exactly the way the plot tools' `app.tsx` files do; `tools/_app/tool-registry.ts` imports them via `import { App as PowerApp } from "../power-app"` etc.

**Build**: `npm run build` runs `esbuild tools/_app/index.tsx --bundle --format=esm --outfile=tools/_app/index.js …`. Single entry point, single output bundle (~580 KB minified). esbuild's `--bundle` flag inlines every tool's `app.tsx` (and the rest of `tools/_app/`) via static cross-file analysis. Pre-iframe→SPA there were 10 separate entry points producing 10 separate per-tool bundles; the migration collapsed them into one.

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
Theme switching is driven by CSS custom properties on `:root`, toggled via a `data-theme="dark"` attribute on `<html>`. The full palette lives in `tools/theme.css` (source of truth for every variable). Theme state is persisted in `localStorage` under `dataviz-theme`; a no-FOUC inline `<script>` in every HTML `<head>` reads it synchronously before first paint. On the very first visit with no stored choice, the `prefers-color-scheme` media query decides. A `ThemeToggle` button lives in `PageHeader` (every tool) and on the landing page; `BroadcastChannel` syncs toggles across all open same-origin tabs (with the `storage` event as a fallback for browsers / contexts that drop BroadcastChannel). Pre-iframe→SPA migration there was also a `postMessage` path that fanned theme changes from the landing page into every tool iframe — that codepath is gone with the iframe shell.

**Rule for contributors: chrome colors use `var(--name)`, SVG colors stay as literals.** Every inline `style={{ … }}` on a React element that is *not* inside a chart component (`<svg>`, `<rect>`, `<path>`, `<text>`, etc.) must reference CSS variables so it themes correctly. Element fills, strokes, and text fills *inside* SVG must stay as hex literals so exported SVG/PNG charts render the same way on any reader — the plot card wrapping each chart is hard-coded to `var(--plot-card-bg)` which resolves to white in both themes, so charts always sit on a white canvas.

This rule is enforced by a custom ESLint rule (`plottr/no-chrome-hex-literal`, defined in `scripts/eslint-rules/no-chrome-hex-literal.js`) that fires on any inline `style={{ key: "#abc..." }}` JSX attribute outside an SVG subtree. SVG element ancestors (svg / g / rect / path / line / circle / ellipse / text / polyline / polygon / tspan / defs / linearGradient / radialGradient / stop / clipPath / mask / marker / use / image / foreignObject / pattern) are exempt — chart internals legitimately use hex literals. The rule only inspects inline object expressions; identifier refs (`style={someStyle}`) and spreads pass through unchecked.

Common variables: `--page-bg`, `--surface`, `--surface-subtle`, `--surface-sunken`, `--text`, `--text-muted`, `--text-faint`, `--border`, `--border-strong`, `--accent-primary`, `--accent-plot`, `--accent-download`, `--accent-dna`, `--on-accent`, `--plot-card-bg`, `--plot-card-border`, `--info-bg`/`--info-text`/`--info-border`, `--success-bg`/`--success-text`/`--success-border`, `--warning-bg`/`--warning-text`/`--warning-border`, `--danger-bg`/`--danger-text`/`--danger-border`, `--neutral-bg`/`--neutral-text`, `--subhead-bg`/`--subhead-text`. See `tools/theme.css` for the full list and the dark overrides.

### Data flow
File upload/paste -> `autoDetectSep` + `fixDecimalCommas` + `parseRaw` -> `DataPreview` table -> user assigns column roles -> `computeStats`/`quartiles` -> React SVG rendering -> SVG/CSV export

**Ingest size policy:** any new ingest surface (paste textarea, URL fetch, clipboard handler, …) must gate on `FILE_LIMIT_BYTES` (2 MB hard reject) and `FILE_WARN_BYTES` (1 MB warn) from `tools/shared-file-drop.js` and surface the same red-banner UX `FileDropZone` uses. Both names are script-scope globals via the shared bundle — don't redeclare a local 2-MB number.

### Per-tool palettes
`PALETTE` is defined in `shared.js` as the global default. Tools may override if needed.

### Tool-internal structure
Plot tools live as folders (`tools/<tool>/`); calculators live as single files (`tools/molarity-app.tsx`, `tools/power-app.tsx`). Inside a plot-tool folder the convention is:

1. **Chart component** in `chart.tsx` (e.g. `BoxplotChart`, `BarChart`, `ScatterChart`) — the SVG renderer, kept as `forwardRef`.
2. **Step sub-components** in `steps.tsx` — `UploadStep`, `ConfigureStep`, `FilterStep`, `OutputStep` etc.
3. **Sidebar / tile components** in `controls.tsx`.
4. **Pure helpers** (math / layout / label disambiguation) in `helpers.ts`. These are what the test loader picks up; if they get sprawling, split into a `helpers/` folder and re-export from `helpers.ts` as a barrel (see `tools/venn/`).
5. **App()** in `app.tsx` — orchestrator holding state and routing between steps. **`app.tsx` exports `App` and does NOT call `ReactDOM.createRoot`** (the single mount lives in `tools/_app/index.tsx`). Keep `app.tsx` slim: module-scope `VIS_INIT_<TOOL>`, the `EXAMPLE_CSV` / `EXAMPLE_TSV` sample-data const (see below), `function App()`, and `export { App };`. Tile / control / chart / step components belong in their own files.

**Sample-data convention — "all-(C)" / inline at module scope.** Every plot tool's `app.tsx` exposes a "Try sample data" button. The dataset that powers it lives as a `const EXAMPLE_CSV = \`…\`;` (or `EXAMPLE_TSV` for tab-separated, or `(() => { … })()` if procedurally generated) at the **top of `app.tsx`**, immediately after the imports and before `App()`. The button's handler is a `useCallback` named `loadExample` that calls `setSepOverride(",")`, `setFileName("…")`, and `doParse(EXAMPLE_CSV, ",")`. This convention is non-negotiable and applies everywhere — `aequorin`, `boxplot`, `heatmap`, `lineplot`, `scatter`, `upset`, `venn`, `volcano`. Why it matters:

- **Grep-discoverable.** A new contributor finds every example dataset in the codebase with `grep -nE "^const EXAMPLE_(CSV|TSV)" tools/*/app.tsx`. Pre-consolidation, sample data lived in three different mechanisms (external `tools/<tool>_example.js` script with a `window` global, `shared.js`-level helper function, in-source IIFE) and the SPA migration silently broke six of them because the per-tool example scripts were no longer loaded.
- **Single failure mode.** Sample-data buttons either work (const is in scope) or compile-fail (typo in the const name). They cannot silently no-op.
- **No cross-cutting plumbing.** Sample data is a per-tool concern; it does not belong in `shared.js`, in a separate `_example.js` script tag, or in any `window`-global setup.

If a sample dataset is genuinely large or is shared across two tools, make the duplication explicit (literal copy in each `app.tsx`) rather than introducing a shared helper. The discoverability win beats the DRY win.

### Shared plot-tool scaffold (`tools/_shell/`)
All eight plot tools (Aequorin, Boxplot, Lineplot, Scatter, Heatmap, Venn, UpSet, Volcano) use the shared scaffold under `tools/_shell/`. Unlike the plain-JS `shared-*.js` globals, these are TypeScript modules imported via `import { … } from "./_shell/…"` and resolved by esbuild when bundling each tool. The two calculators (`molarity-app.tsx`, `power-app.tsx`) intentionally do **not** use this scaffold — they have no upload step, no column roles, no step navigator, so the shell would be dead weight.

- `tools/_shell/usePlotToolState.ts` — `usePlotToolState<TVis>(toolKey, initialVis)` typed hook. Owns step state, upload fields (`fileName`, `parseError`, `sepOverride`, `commaFixed`, `commaFixCount`), and the `vis` reducer with auto-prefs persistence (`loadAutoPrefs` on init, `saveAutoPrefs` on change, `_reset` sentinel for reset-to-defaults).
- `tools/_shell/PlotToolShell.tsx` — outer page frame. Renders `PageHeader` (with `PrefsPanel` in the right slot), `StepNavBar`, `CommaFixBanner`, `ParseErrorBanner`, then delegates to `children`. Takes the hook's return as a `state` prop.
- `tools/_shell/ScrollablePlotCard.tsx` — horizontal-scroll affordances (edge fades + "Scroll for more →" pill driven by `ResizeObserver`). Used only by UpSet (`tools/upset/`); venn and heatmap intentionally don't wrap their plot cards (their charts auto-fit), so a plain `<div className="dv-panel dv-plot-card">` is correct there. Lift any new horizontally-scrolling tool into this component rather than re-deriving it.
- `tools/_shell/stats-dispatch.ts` — `runTest` / `runPostHoc` / `postHocForTest` dispatchers shared by boxplot, lineplot, and aequorin.
- `tools/_shell/chart-layout.ts` — `CHART_MARGIN` and `buildLineD` used by both lineplot and aequorin. Rule of thumb: once a pure typed helper becomes byte-identical across two tools, lift it here and re-export from each tool's `helpers.ts` barrel. `_shell/` is the canonical home for shared *typed* helpers; `shared-*.js` in `tools/` remains the home for shared *plain-JS* globals consumed by every HTML entrypoint.

**Standard wiring pattern** (every migrated tool follows this shape — start from `tools/upset/app.tsx` as the canonical reference):

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

**If you add a new plot tool**, start by copying the `tools/upset/` folder (or any other migrated plot tool) and adapting `chart.tsx` / `controls.tsx` / `steps.tsx` / `helpers.ts`. Do not re-derive the scaffold and do not stuff the whole tool into `app.tsx` — keep `app.tsx` to the `App()` orchestrator, the module-scope `VIS_INIT_<TOOL>`, and the inline `EXAMPLE_CSV` / `EXAMPLE_TSV`. Then add the new tool to `tools/_app/tool-registry.ts` so the SPA picks up its `/#/<toolkey>` route.

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

- **Generic shared loaders** load the `shared-*.js` bundle globals into a vm context: `shared-loader.js`, `parsing-fns.js`, `components-loader.js`, `prefs-loader.js`, `r-export-loader.js`, `stats-dispatch-loader.js`, `discrete-palette-loader.js`, `handoff-loader.js`.
- **`render-loader.js` (real React 18 + happy-dom).** Used only by `tests/components.test.js`, which declares the happy-dom Vitest environment at the top of the file. Exposes `buildContext()`, `loadTool(toolName)`, `renderHtml(Component, props)` (synchronous static-HTML via `react-dom/server`), and `renderWithEffects(Component, props)` (mount through `react-dom/client.createRoot` + `act` so `useEffect` / `useLayoutEffect` actually fire). Replaced the prior 354-line functional-React mock in 2026-05-05.
- **Per-tool loaders** transform `tools/<tool>/helpers.ts` to CommonJS (via `esbuild.transformSync`, or `buildSync` for barrels) and run it under `vm.runInContext` with the shared globals pre-loaded. One per plot tool: `aequorin-loader.js`, `boxplot-loader.js`, `boxplot-stats-reducer-loader.js`, `heatmap-loader.js`, `lineplot-loader.js`, `scatter-loader.js`, `upset-loader.js`, `venn-loader.js`, `volcano-loader.js`.

When adding new functions to `shared.js`, `stats.js`, or any `shared-*.js` file, export them in the corresponding loader so the unit tests can see them. When adding a pure helper to `tools/<tool>/helpers.ts`, add it to the `module.exports` block at the bottom of the matching per-tool loader.

## Benchmark suite

```bash
npm run benchmark         # full chain: R + JS + R-script-runs-in-Rscript + SciPy
npm run benchmark:scipy   # SciPy cross-check only (regenerates fixture if python3+scipy on PATH)
```

**Two complementary benchmarks**, mirroring two different audiences:

- `benchmark/run-r.R` + `benchmark/run.js` — R 4.5 as the reference, on **real R built-in datasets** (iris, PlantGrowth, ToothGrowth, mtcars, ChickWeight, …). Public-facing trust artefact: results render as `benchmark.html` with per-category tables and red-on-fail rows. ~105 cases / ~303 numerical comparisons.
- `benchmark/run-scipy.py` + `benchmark/run-scipy.js` — SciPy as the reference, on **synthetic targeted grids** specifically aimed at the (df, λ) regimes the R benchmark only touches indirectly: `nctcdf` at deep δ, `ncf_sf` and `ncchi2cdf` at large λ across the 500-threshold normal-approx short-circuit, `qtukey` at extreme (p, k, df) corners including the documented "pathological" df=1 envelope. ~847 cases / ~1080 comparisons. Contributor-facing: a CI-side numerical sanity check whose audience is people changing `tools/stats.js`, not end users.

The SciPy benchmark uses a tighter classification than the R one because it deliberately probes the design envelope:
- **pass** — within tolerance.
- **deep-tail** — both values < 1e-13 (informational; below any user-facing precision).
- **underflow** — SciPy reports < 1e-13, JS underflows to 0. Plöttr's Gauss-Legendre window has a documented precision floor; SciPy uses series / asymptotic forms that survive deeper.
- **pathological** — `qtukey` at `df ≤ 2` with `p ≥ 0.95` and `k ≥ 10`. Source comment in `stats.js` explicitly calls these out as outside the implementation's design envelope.
- **fail** — real disagreement. Exits 1.

Both `run-r.R` and `run-scipy.py` pre-flight the relevant interpreter (Rscript / python3+scipy) and skip gracefully when missing. The checked-in `results-r.json` and `results-scipy.json` fixtures let the JS-side comparison run without either interpreter installed.

**Extending the SciPy suite.** New cases land as additional rows in `benchmark/run-scipy.py`'s grids, then `npm run benchmark:scipy` regenerates `benchmark/results-scipy.json` and the sidecar `benchmark/scipy-summary.json` (counts per regime, surfaced on `benchmark.html`). The five regime labels (`pass` / `deep-tail` / `underflow` / `pathological` / `fail`) are the only valid statuses; if a new case lands in `underflow` or `pathological`, prefer documenting it in the source comment of the affected function in `tools/stats.js` over loosening the tolerance. `fail` is exit-1 — it never gets reclassified into a softer bucket without a corresponding code change in `stats.js`.

## Statistical methodology

`tools/stats.js` ships **two** small but consequential default-policy decisions. Both are documented in the source comments of the affected function and both have benchmark coverage; the rule for contributors is "do not silently change them — they are user-facing methodological choices, not implementation details".

**Welch by default — `selectTest()` (`tools/stats.js` ~ line 1750).** Plöttr does not pre-screen with Shapiro-Wilk + Levene before picking between Student's t and Welch's t (or one-way ANOVA and Welch's ANOVA). It picks **Welch unconditionally**:

- `k = 2` independent groups → Welch's t (no post-hoc).
- `k ≥ 3` independent groups → Welch's ANOVA + Games-Howell post-hoc.
- Shapiro-Wilk + Levene are still computed and surfaced in the stats panel as **diagnostics**, with a `recommendation.suggestion` payload the user can click through to override (e.g. "your residuals look very non-normal — consider Mann-Whitney U / Kruskal-Wallis"). The default test stays Welch.

Why: the Rasch / Kubinger / Moder (2011) and Zimmerman (2004) results show that screening for equal variance with a pre-test inflates Type I error compared to using Welch's t unconditionally; Welch matches Student closely when variances are in fact equal, and behaves correctly when they are not. The original (pre-`v1.2.0`) policy of "Student's t when Levene passes, Welch's t when it fails" was a methodological bug, not just a stylistic choice.

If you change the default policy, you change the answer Plöttr gives users on the same data — that's a public-facing behavioural change and must land with: (a) a `CHANGELOG.md` entry under `Changed`, (b) a benchmark refresh confirming agreement with R / SciPy under the new defaults, and (c) a corresponding update to the recommendation `reason` text returned from `selectTest()` so the stats panel explains the new policy in plain English.

**`recommendation.suggestion` is a UI contract, not a free-form string.** `selectTest` returns a structured object `{ chosen, reason, suggestion?: { test, why } }`. The boxplot stats panel wires this into a "Switch to suggested test" button — adding new fields requires updating the consumer in `tools/boxplot/stats-panel.tsx`. Don't smuggle UX cues into the `reason` string.

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

# `tools/_shell/` — typed shared scaffold

Plöttr has two parallel "shared" worlds. They share the goal (don't
duplicate code) but differ on transform pipeline, scope, and consumer
contract. Picking the right one for a new shared helper is what this
README is for.

## TL;DR — which one do I use?

| If your helper…                                                     | Goes in                       | Examples                                                                 |
| ------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| is plain JS, no JSX, consumed by every plot tool's HTML             | **`tools/shared*.js`**        | `parseRaw`, `computeStats`, `ColorInput`, `applyDiscretePalette`         |
| is TypeScript, imports from sibling `_shell/` files, used in `.tsx` | **`tools/_shell/`**           | `usePlotToolState`, `PlotToolShell`, `chart-layout.ts`, `stats-dispatch` |
| is purely a tool-internal helper, no other tool needs it            | **`tools/<tool>/helpers.ts`** | per-tool math (`classifyPoint`, `computeIntersections`, …)               |

If two tools start needing the same `helpers.ts` symbol, **lift it
into `_shell/`** (precedent: `chart-layout.ts` was extracted from
`lineplot/helpers.ts` once `aequorin/helpers.ts` started needing
`buildLineD` and `MARGIN`).

## Why two worlds at all?

### `tools/shared*.js` — the plain-JS bundle

- **Transform**: none. `scripts/build-shared.js` concatenates the files
  in a fixed order into `tools/shared.bundle.js`.
- **Loaded by**: every `tools/<tool>.html` via a single `<script>` tag.
  Top-level declarations (function / `const` / `let`) become script-scope
  globals; tool `.tsx` files consume them ambient via
  `types/globals.d.ts`.
- **Constraint**: **no JSX, no TypeScript syntax** — `React.createElement`
  only. There's no transform step, so anything beyond ES2022 + plain JS
  would white-screen the browser.
- **Why it exists**: every HTML file (and every render-smoke test) needs
  a small, fast-to-load common surface (`parseData`, `ColorInput`,
  `loadAutoPrefs`, the discrete-palette catalogue, …) without paying
  the per-tool esbuild cost. The bundle is ~315 KB unminified, gzipped
  ~85 KB — cheap enough to ship to every page.
- **Add a file here when**: the helper is browser-runtime-only, you
  want it available to every HTML without ceremony, and React-typed
  imports aren't necessary.

Files: `tools/shared.js`, `tools/stats.js`, `tools/theme.js`, plus the
`tools/shared-*.js` family (color-input, discrete-palette, file-drop,
svg-legend, core, ui, prefs, long-format, r-export, stats-tile,
handoff). Order matters — see the `FILES` array in
`scripts/build-shared.js`.

### `tools/_shell/` — the typed scaffold

- **Transform**: bundled by **esbuild** as part of each tool's
  `tools/<tool>/index.tsx` build. Imports from sibling `_shell/`
  files are inlined into the tool's `index.js` output.
- **Loaded by**: only tool `.tsx` / `.ts` files via explicit
  `import` statements. _Not_ exposed as globals.
- **Constraint**: **TypeScript with full strict mode**. Pure helpers
  (`chart-layout.ts`, `stats-dispatch.ts`) are fully annotated; React
  components (`PlotToolShell.tsx`, `PlotSidebar.tsx`,
  `DownloadTiles.tsx`, `ScrollablePlotCard.tsx`,
  `chart-annotations.tsx`) ship typed props.
- **Why it exists**: cross-tool React composition + cross-tool typed
  helpers that benefit from import-graph clarity (esbuild knows
  exactly what each tool consumes; the bundle stays tight). The
  scaffold collapses what was previously 7+ near-identical orchestrator
  blocks into one shape.
- **Add a file here when**: the helper is consumed via `.tsx` `import`,
  benefits from full typing, and at least two tools need it (or are
  about to — `chart-layout.ts` was extracted exactly when `aequorin`
  started duplicating `lineplot`'s `MARGIN` + `buildLineD`).

## File-naming convention

- **`PascalCase.tsx`** — single React component (one named export plus,
  occasionally, tightly-paired helpers like `normalizeHexColor` next to
  `ColorInput`).
- **`kebab-case.ts`** — pure helpers, data, dispatchers, layout math.
- **`camelCase.ts`** — React hooks (`usePlotToolState`).

One thing per file is the rule. The 2026-06 split retired the older
"one file per migrated source" multi-component bundles (`ui.tsx`,
`long-format.tsx`, `core.tsx`, `stats-tile.tsx`,
`chart-annotations.tsx`) — every public export now has its own file.

## Public surface — `index.ts`

`tools/_shell/index.ts` is the barrel. Consumers outside `_shell/`
import from `"../_shell"` (or `"./_shell"` for files at `tools/`
root) — they pick exports by name and never reach into per-file paths.
Files _inside_ `_shell/` cross-reference each other with explicit
per-file paths so the dependency graph stays visible.

## Files (current contents)

### React components (`PascalCase.tsx`)

| File                         | Role                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `ActionsPanel.tsx`           | Plot-step actions tile: download chips + Start over.                                    |
| `BaseStyleControls.tsx`      | Background / grid on-off / grid colour controls.                                        |
| `CldLabels.tsx`              | Compact-letter-display annotation renderer.                                             |
| `ColorInput.tsx`             | Swatch + hex-text widget (`normalizeHexColor` lives alongside).                         |
| `ColumnRoleEditor.tsx`       | Column-role assignment for the long-format pipeline.                                    |
| `CommaFixBanner.tsx`         | Yellow status banner for decimal-comma auto-conversion.                                 |
| `DataPreview.tsx`            | Compact table preview for parsed CSV/TSV.                                               |
| `DiscretePaletteRow.tsx`     | Dropdown + swatch strip for picking a discrete palette.                                 |
| `DownloadTiles.tsx`          | `ActionsPanel` wrapper auto-building SVG / PNG callbacks.                               |
| `ErrorBoundary.tsx`          | Class-component error boundary used by the SPA shell.                                   |
| `FileDropZone.tsx`           | Drag/drop / click-to-browse upload widget; ingest-size constants alongside.             |
| `FilterCheckboxPanel.tsx`    | Per-column filter checkbox grid for the filter step.                                    |
| `FormulaInjectionBanner.tsx` | Yellow alert for cells that would trigger Excel formula evaluation.                     |
| `GroupColorEditor.tsx`       | Per-group colour editor list.                                                           |
| `HowTo.tsx`                  | Tool-specific "How to use" content renderer.                                            |
| `HowToCard.tsx`              | Collapsible header + body wrapper for `HowTo`.                                          |
| `NumberInput.tsx`            | Numeric input with hold-to-repeat ± buttons.                                            |
| `PageHeader.tsx`             | Top-of-tool header with icon + title + nav slots.                                       |
| `ParseErrorBanner.tsx`       | Red alert banner for parse-error strings.                                               |
| `PlotSidebar.tsx`            | Sticky right-rail wrapper for every plot tool's controls panel.                         |
| `PlotToolShell.tsx`          | Outer page frame — PageHeader + StepNavBar + banners, delegates to children.            |
| `PrefsPanel.tsx`             | Gear-menu UI on top of `prefs-store`.                                                   |
| `RenameReorderPanel.tsx`     | Per-column rename + drag-to-reorder list.                                               |
| `ScrollablePlotCard.tsx`     | Horizontal-scroll affordance (edge fades + "Scroll for more →" pill).                   |
| `SignificanceBrackets.tsx`   | Pair-wise significance-bracket renderer (vertical / horizontal).                        |
| `SliderControl.tsx`          | Labelled range slider (memo-wrapped).                                                   |
| `StatsTable.tsx`             | Summary stats table used in group-plot output steps.                                    |
| `StatsTile.tsx`              | Collapsible stats tile — assumption checks, test selection, post-hocs, annotation emit. |
| `StepNavBar.tsx`             | Horizontal stepper with circles + labels + connector line.                              |
| `UploadPanel.tsx`            | Separator selector + `FileDropZone` composition for the upload step.                    |

### Pure helpers / data / dispatchers (`kebab-case.ts`)

| File                  | Role                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `bracket-levels.ts`   | `assignBracketLevels` — greedy interval-packing for stacked significance brackets.              |
| `chart-layout.ts`     | `CHART_MARGIN` + `buildLineD` for line-plot / aequorin charts.                                  |
| `discrete-palette.ts` | Discrete palette catalogue + `resolveDiscretePalette` / `applyDiscretePalette` / hue+viridis.   |
| `handoff.ts`          | One-shot localStorage inter-tool hand-off (`setHandoff` / `consumeHandoff` / `navigateToTool`). |
| `power-from-data.ts`  | `computePowerFromData` — achieved power + n-needed dispatched per test family.                  |
| `prefs-store.ts`      | Per-tool plot-render-settings persistence (load/save/import/export/migrate/merge).              |
| `r-export.ts`         | `buildRScript` + `buildRScriptForPower` + R-string formatters.                                  |
| `scroll-helpers.ts`   | `scrollIntoViewWithinAncestor` + `scrollDisclosureIntoView`.                                    |
| `stats-dispatch.ts`   | `runTest` / `runPostHoc` / `postHocForTest` over the stats registry.                            |
| `stats-registry.ts`   | `STATS_TEST_REGISTRY` + `STATS_POSTHOC_REGISTRY` + arity arrays.                                |
| `svg-legend.ts`       | `computeLegendHeight` + `renderSvgLegend` for chart legend layout.                              |

### React hook (`camelCase.ts`)

| File                  | Role                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `usePlotToolState.ts` | Shared hook — step state, upload fields, vis reducer with auto-prefs persist. |

## Decision tree for adding a new shared helper

```
Is it consumed via `import` from a .tsx file?
├── No → it's a global, use `tools/shared-*.js`
│         (then add the global declaration to `types/globals.d.ts`
│          AND the filename to `scripts/build-shared.js` FILES list)
└── Yes
    │
    ├── Is it React/JSX/typed?
    │   └── Yes → `tools/_shell/`
    │
    └── Pure helper used by exactly one tool today?
        ├── Yes → `tools/<tool>/helpers.ts`
        │         (lift to `_shell/` later if a second tool needs it)
        └── No (≥ 2 tools) → `tools/_shell/`
```

## See also

- `CLAUDE.md` § "Shared code" — the canonical description of which
  helpers live in which file, and the load-order rationale for the
  `tools/shared*.js` bundle.
- `scripts/build-shared.js` — the `FILES` array is the single source
  of truth for plain-JS bundle ordering.
- `types/globals.d.ts` — the ambient declarations every plain-JS
  global needs to be visible to `.tsx` consumers.

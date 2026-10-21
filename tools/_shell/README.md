# `tools/_shell/` — typed shared scaffold

`_shell/` is the component tier of Plöttr's four-tier layout
(`docs/architecture.md` §3): typed React UI and helpers that two or more
tools share. It sits between the pure kernel and the tools:

| Tier            | Holds                                                                   | May import                    |
| --------------- | ----------------------------------------------------------------------- | ----------------------------- |
| `tools/_core/`  | Pure kernel: numerics, stats, CSV parsing, colour, export, theme, i18n  | `_core/` only                 |
| `tools/_shell/` | Shared React UI + typed helpers (this folder)                           | `_core/`, `_shell/`           |
| `tools/<tool>/` | One tool: `app.tsx`, `chart.tsx`, `steps.tsx`, `controls.tsx`, helpers… | `_core/`, `_shell/`, own tool |
| `tools/_app/`   | SPA shell: router, tool registry, app chrome                            | everything above              |

`npm run lint:boundaries` (dependency-cruiser) enforces the arrows: `_shell/`
never imports a tool or `_app/`. App-level chrome a shell component needs
(brand link, tool switcher, theme / language / feedback buttons) is handed
down through `AppChromeContext` (`AppBar.tsx`) instead.

## Which home for a new helper?

| If your helper…                                                       | Goes in                       |
| --------------------------------------------------------------------- | ----------------------------- |
| is pure (no React, no DOM chrome): maths, parsing, formatting, export | **`tools/_core/`**            |
| is React UI or a typed UI helper that at least two tools need         | **`tools/_shell/`**           |
| is used by one tool only                                              | **`tools/<tool>/helpers.ts`** |

If a second tool starts needing a `helpers.ts` symbol, **lift it into
`_shell/`** (precedent: `chart-layout.ts` was extracted from
`lineplot/helpers.ts` once `aequorin/helpers.ts` needed `buildLineD` and
`MARGIN`).

- **Transform**: esbuild compiles `_shell/` together with the SPA
  (`tools/_app/index.tsx`); code two or more lazy tool chunks share lands
  in a split `tools/_app/chunks/chunk-*.js`.
- **Loaded by**: `.tsx` / `.ts` files via `import` from `"../_shell"` —
  never as globals. (The only script-tag globals left are vendored React
  and `tools/shared.bundle.js`, the IIFE of `_core/theme.ts` + `_core/i18n.ts`
  that the static pages need before the SPA parses.)
- **Constraint**: TypeScript strict mode, `any`-free; every component ships
  typed props.

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

| File                         | Role                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `ActionsPanel.tsx`           | Plot-step downloads + Start over; hands them to the shell's header export bar.           |
| `AppBar.tsx`                 | Sticky top bar; `AppChromeContext` (brand, switcher, utilities from `_app`), `FileChip`. |
| `BaseStyleControls.tsx`      | Background / grid on-off / grid colour controls.                                         |
| `CldLabels.tsx`              | Compact-letter-display annotation renderer.                                              |
| `ColorInput.tsx`             | Swatch + hex-text widget (`normalizeHexColor` lives alongside).                          |
| `ColumnRoleEditor.tsx`       | Column-role assignment for the long-format pipeline.                                     |
| `CommaFixBanner.tsx`         | Yellow status banner for decimal-comma auto-conversion.                                  |
| `ControlTabs.tsx`            | Plot controls as remembered ARIA tabs; `ControlSection` flattens inside them.            |
| `ChartDataTable.tsx`         | Collapsible semantic data table under a chart, for keyboard and screen-reader users.     |
| `ControlSection.tsx`         | Titled group inside a `ControlTabs` tab (a folding card outside tabs).                   |
| `DatasheetIcon.tsx`          | Notepad icon on every upload step's sample-dataset banner.                               |
| `DetectedSeparatorBadge.tsx` | Inline reminder of the delimiter the auto-detector picked.                               |
| `PlotStyleIcons.tsx`         | Icon buttons for a chart's plot style (box / violin / bar …), selected = ink pill.       |
| `SegToggle.tsx`              | Accessible segmented toggle (`.dv-seg`); `OnOffToggle` alongside.                        |
| `DataPreview.tsx`            | Compact table preview for parsed CSV/TSV.                                                |
| `DiscretePaletteRow.tsx`     | Dropdown + swatch strip for picking a discrete palette.                                  |
| `DownloadTiles.tsx`          | `ActionsPanel` wrapper auto-building SVG / PNG callbacks.                                |
| `ErrorBoundary.tsx`          | Class-component error boundary used by the SPA shell.                                    |
| `FileDropZone.tsx`           | Drag/drop / click-to-browse upload widget; ingest-size constants alongside.              |
| `FormulaInjectionBanner.tsx` | Yellow alert for cells that would trigger Excel formula evaluation.                      |
| `GroupColorEditor.tsx`       | Per-group colour editor list.                                                            |
| `HowTo.tsx`                  | Tool-specific "How to use" content renderer.                                             |
| `HowToCard.tsx`              | Collapsible header + body wrapper for `HowTo`.                                           |
| `MethodsButton.tsx`          | "Methods" button + read-only popover with the methods-section paragraph and Copy.        |
| `NumberInput.tsx`            | Numeric input with hold-to-repeat ± buttons.                                             |
| `ParseErrorBanner.tsx`       | Red alert banner for parse-error strings.                                                |
| `PlotActionsBar.tsx`         | App-bar export bar: two-click Start over, a More menu (PNG, CSV, …), Download SVG.       |
| `PlotToolShell.tsx`          | Outer page frame — AppBar (steps, file chip, exports, prefs) + banners + children.       |
| `PrefsPanel.tsx`             | Gear-menu UI on top of `prefs-store`.                                                    |
| `ScrollablePlotCard.tsx`     | Horizontal-scroll affordance (edge fades + "Scroll for more →" pill).                    |
| `SignificanceBrackets.tsx`   | Pair-wise significance-bracket renderer (vertical / horizontal).                         |
| `SliderControl.tsx`          | Labelled range slider (memo-wrapped).                                                    |
| `StatsTable.tsx`             | Summary stats table used in group-plot output steps.                                     |
| `StatsTile.tsx`              | Stats engine UI — assumption checks, test selection, post-hocs, annotation emit.         |
| `StepNavBar.tsx`             | Inline step navigation for the app bar (check / current pill / number).                  |
| `UploadPanel.tsx`            | Separator selector + `FileDropZone` composition for the upload step.                     |
| `GroupTestSections.tsx`      | Inspector sections for a `selectTest` result (shared by Group Plot / Line Plot / RLU).   |
| `Inspector.tsx`              | Inspector vocabulary: compact tables, stars badge, assumption rows, set rows, exports.   |
| `WhyThisTest.tsx`            | Collapsed "Why this test?" disclosure under a stats panel's result line.                 |
| `ValueListPanel.tsx`         | Filter step: per-column keep / rename / ↑↓ order list (qPCR-style rows).                 |
| `WorkspaceLayout.tsx`        | Plot-step workspace: controls \| figure \| inspector (foldable); `InspectorSection`.     |

### Pure helpers / data / dispatchers (`kebab-case.ts`)

| File                       | Role                                                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bracket-levels.ts`        | `assignBracketLevels` — greedy interval-packing for stacked significance brackets.                                                                                                                                           |
| `chart-layout.ts`          | `CHART_MARGIN` + `buildLineD` for line-plot / aequorin charts.                                                                                                                                                               |
| `discrete-palette.ts`      | Discrete palette catalogue + `resolveDiscretePalette` / `applyDiscretePalette` / hue+viridis.                                                                                                                                |
| `handoff.ts`               | One-shot per-tab (sessionStorage) inter-tool hand-off (`setHandoff` / `consumeHandoff` / `navigateToTool`; destinations receive via `useHandoff`); only the target consumes a payload, which expires after `HANDOFF_TTL_MS`. |
| `long-format-detect.ts`    | Wide 2-set vs long (item, set) detection for set-membership inputs (Venn / UpSet).                                                                                                                                           |
| `round.ts`                 | Rounding helpers that keep auto-axis bounds and per-x readouts at a stable precision.                                                                                                                                        |
| `select-test-narrative.ts` | Localised rebuild of the `selectTest` / `selectCorrelation` recommendation narrative.                                                                                                                                        |
| `methods-text.ts`          | Methods-section paragraph builder (`buildGroupMethodsText`, `softwareSentence`, …).                                                                                                                                          |
| `plot-actions.ts`          | `PlotActionsContext` registry linking a tool's `ActionsPanel` to the header export bar.                                                                                                                                      |
| `power-from-data.ts`       | `computePowerFromData` — achieved power + n-needed dispatched per test family.                                                                                                                                               |
| `prefs-store.ts`           | Per-tool plot-render-settings persistence (load/save/import/export/migrate/merge).                                                                                                                                           |
| `r-export.ts`              | `buildRScript` + `buildRScriptForPower` + R-string formatters.                                                                                                                                                               |
| `scroll-helpers.ts`        | `scrollIntoViewWithinAncestor` + `scrollDisclosureIntoView`.                                                                                                                                                                 |
| `stats-dispatch.ts`        | `runTest` / `runPostHoc` / `postHocForTest` over the stats registry.                                                                                                                                                         |
| `stats-registry.ts`        | `STATS_TEST_REGISTRY` + `STATS_POSTHOC_REGISTRY` + arity arrays.                                                                                                                                                             |
| `svg-legend.ts`            | `computeLegendHeight` + `renderSvgLegend` for chart legend layout.                                                                                                                                                           |

### React hooks (`camelCase.ts`)

| File                  | Role                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `usePlotToolState.ts` | Shared hook — step state, upload fields, vis reducer with auto-prefs persist.                                      |
| `useHandoff.ts`       | Hand-off receiver: `useHandoff(tool, apply)` delivers payloads for `tool` at mount and when written while mounted. |
| `useExampleLink.ts`   | `useExampleLink(tool, load)` — opens a tool on its example from `#/<tool>?example` (the landing's link).           |
| `use-is-mobile.ts`    | Narrow-viewport detection for the calculators' phone layouts.                                                      |

## Decision tree for adding a new shared helper

```
Is it pure (no React, no chrome)?
├── Yes → `tools/_core/`
└── No (React / UI)
    │
    ├── Used by exactly one tool today?
    │   └── Yes → that tool's folder (`helpers.ts` or a component file);
    │             lift to `_shell/` when a second tool needs it
    └── No (≥ 2 tools) → `tools/_shell/` + export it from `index.ts`
```

## See also

- `docs/architecture.md` — module layering (§3), per-tool layout (§4) and
  the parse → render → export pipeline (§5).
- `tools/CLAUDE.md` — the conventions every `_shell/` component follows
  (theming tokens, the workspace layout, stats panels, export naming).

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

Files (current contents):

| File                     | Role                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `usePlotToolState.ts`    | The shared `usePlotToolState<TVis>` hook — step state, upload fields, vis reducer with auto-prefs persist. |
| `PlotToolShell.tsx`      | Outer page frame — PageHeader (with PrefsPanel), StepNavBar, banners, then delegates to children.          |
| `PlotSidebar.tsx`        | Sticky right-rail wrapper used by every plot tool's controls panel.                                        |
| `DownloadTiles.tsx`      | `ActionsPanel` wrapper for the per-tool download chips (SVG / PNG / CSV / R script / …).                   |
| `ScrollablePlotCard.tsx` | Horizontal-scroll affordance (edge fades + "Scroll for more →" pill, `ResizeObserver`-driven).             |
| `chart-layout.ts`        | `CHART_MARGIN` and `buildLineD` — used by `lineplot/` + `aequorin/` (see `helpers.ts` re-exports).         |
| `stats-dispatch.ts`      | `runTest` / `runPostHoc` / `postHocForTest` — shared by boxplot / lineplot / aequorin.                     |
| `chart-annotations.tsx`  | `SignificanceBrackets`, `CldLabels` — shared annotation renderers.                                         |

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

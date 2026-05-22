# Plöttr architecture

A walking tour of how the static-site SPA boots, lays out its modules, and
shuttles a CSV through the parse → render → export pipeline. Every diagram
is monospace ASCII so it reads cleanly in any markdown viewer (and in a
plain terminal).

If you only have time for one diagram, read **§3 Module layering** —
everything else falls out of the four-tier rule it states.

---

## 1. Deployment & top-level boot

```
                         GitHub Pages (static origin)
                                     │
                                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  /index.html         /benchmark.html        /privacy.html    │
   │  (landing + SPA)     (R/SciPy report)       (data policy)    │
   └──────────────────────────────────────────────────────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
       Browser parses HTML — three inline IIFEs run before paint:
            • anti-clickjack frame-buster
            • no-FOUC data-theme attribute (reads localStorage)
            • file:// detection banner
            │
            ▼
   <script src="tools/shared.bundle.js">      ◄── IIFE-bundled _core/theme.ts
            │                                     (getTheme / setTheme /
            ▼                                      toggleTheme / ThemeToggle
   <script type="module" src="tools/_app/index.js">  on globalThis)
            │
            ▼
   SPA mount: ReactDOM.createRoot(#root).render(<App/>)
```

Three independent HTML pages, all served as static files. Only
`index.html` boots the React SPA — the other two are isolated documents
that share `theme.css` and the bundled theme controls but nothing else.

---

## 2. SPA shell + lazy tool chunks

```
   tools/_app/
   │
   ├── index.tsx ───────────►  side-effect imports kernel:
   │                              import "../_core/stats";
   │                              import "../_core/shared";
   │                            then renders <App/> into #root
   │
   ├── Router.tsx  ─────────►  useSyncExternalStore(location.hash)
   │                              "#/boxplot" → "boxplot"
   │                              "" / "#" / "#/" → null (landing)
   │
   ├── tool-registry.ts ────►  TOOL_REGISTRY[]: each entry =
   │                              { key, label, iconSvg,
   │                                Component: React.lazy(() =>
   │                                  import("../<tool>/app")) }
   │                            One lazy chunk per tool.
   │
   └── App.tsx ─────────────►  reads route → finds registry entry
                                  → ToolTopbar (home, sibling tools,
                                                theme, feedback)
                                  → <Suspense fallback={Spinner}>
                                      <ErrorBoundary toolName>
                                        <Component/>
```

esbuild `--splitting --format=esm` realises the `React.lazy` calls as a
graph of split chunks under `tools/_app/chunks/`:

```
   tools/_app/index.js                  (entry: kernel + SPA shell)
        │
        ├─► chunks/app-XXXX.js               ◄── tools/boxplot/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/scatter/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/lineplot/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/aequorin/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/heatmap/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/venn/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/upset/app.tsx
        ├─► chunks/app-XXXX.js               ◄── tools/volcano/app.tsx
        ├─► chunks/power-app-XXXX.js         ◄── tools/power-app.tsx
        ├─► chunks/molarity-app-XXXX.js      ◄── tools/molarity-app.tsx
        └─► chunks/chunk-XXXX.js             ◄── shared dependency graph
                                                  (anything two or more
                                                   tools pull in)
```

A mobile visitor who only opens the molarity calculator pays for the
React vendor bundle + the SPA shell + the molarity chunk. They do not
download volcano, heatmap, or the stats kernel.

---

## 3. Module layering

```
   ┌──────────────────────────────────────────────────────────────┐
   │  tools/_app/        SPA shell (Router, App, tool-registry)   │
   │       ▲                                                       │
   │       │ imports                                               │
   │       │                                                       │
   │  tools/<tool>/      Plot tool (app.tsx, chart.tsx, steps.tsx, │
   │       ▲              controls.tsx, helpers.ts, plot-area.tsx, │
   │       │              reports.ts, howto.tsx, stats-panel.tsx)  │
   │       │ imports                                               │
   │       │                                                       │
   │  tools/_shell/      Component-tier scaffold (typed React UI): │
   │       ▲              PlotToolShell, usePlotToolState,         │
   │       │ imports      FileDropZone, ColumnRoleEditor,          │
   │       │              StatsTile, SignificanceBrackets,         │
   │       │              stats-dispatch, stats-registry,          │
   │       │              r-export, prefs-store, …                 │
   │       │                                                       │
   │  tools/_core/       Pure kernel (numerics, parsing, theme):   │
   │                      color, icons.tsx, numeric, scale, csv,   │
   │                      descriptive, svg-export, download, theme │
   │                      + stats/ (dist, tests, posthoc, cluster, │
   │                                msi, format, types)            │
   └──────────────────────────────────────────────────────────────┘

   Dependency rule: arrows point upward only.
   • `_core/*` has no imports from `_shell/` or `tools/<tool>/`.
   • `_shell/*` imports from `_core/*` but never from tools.
   • Tools import from both layers; never from `_app/`.
   • `_app/` imports the kernel (side-effect) and the registry's
     lazy refs to each tool's `App` component.
```

The rule is enforced mechanically by `dependency-cruiser`
(`.dependency-cruiser.cjs`) and gated in CI as the **Module layering**
step (`npm run lint:boundaries`). Any upward-only-arrow violation —
`_core/` importing from `_shell/`, `_shell/` reaching into a tool,
or a tool reaching into `_app/` — fails the build, as does any
circular import. The check covers the source graph under `tools/`;
tests deliberately reach across layers and are excluded.

---

## 4. Per-tool structure (canonical layout)

```
   tools/<tool>/
        ┌──────────────────────────────────────────────────────┐
        │ app.tsx          orchestrator: state, step routing    │
        │     │                                                 │
        │     ├─► steps.tsx          UploadStep / ConfigureStep │
        │     │       │                FilterStep / OutputStep  │
        │     │       │                                          │
        │     │       └─► PlotToolShell (_shell)                │
        │     │             • PageHeader + PrefsPanel slot      │
        │     │             • StepNavBar                        │
        │     │             • CommaFixBanner / ParseErrorBanner │
        │     │                                                 │
        │     ├─► plot-area.tsx      composes chart + sidebar + │
        │     │       │                stats panel + overlays   │
        │     │       │                                          │
        │     │       ├─► chart.tsx       SVG renderer          │
        │     │       │                    (forwardRef ref↦SVG) │
        │     │       │                                          │
        │     │       ├─► controls.tsx    sidebar tiles         │
        │     │       │                                          │
        │     │       └─► stats-panel.tsx inline stats tile     │
        │     │                                                 │
        │     ├─► helpers.ts         pure data + layout helpers │
        │     │                      (tested in isolation)      │
        │     │                                                 │
        │     ├─► reports.ts         R-script / TXT exports     │
        │     └─► howto.tsx          in-app "How to" content    │
        │                                                       │
        │ EXAMPLE_CSV / EXAMPLE_TSV   inline sample dataset     │
        │                             at module scope           │
        └──────────────────────────────────────────────────────┘

   Layout exceptions (stable, intentional):
     • tools/scatter/   — no controls.tsx; tiles live inside
                          plot-area.tsx
     • tools/upset/     — no plot-area.tsx; plot step lives in
                          steps.tsx (chart hosts intersection edits)
     • tools/volcano/   — no plot-area.tsx; plot step short enough
                          to live in steps.tsx
```

Calculators (`tools/molarity-app.tsx`, `tools/power-app.tsx`) are flat
single-file orchestrators — no upload step, no column roles, no plot
scaffold. They export `App` the same way plot tools do so the registry
picks them up through identical wiring.

---

## 5. Data flow inside a plot tool

```
   ┌─────────────────────────────────────────────────────────────┐
   │  User pastes / drops CSV / TSV / TXT  (or clicks "Sample")  │
   └─────────────────────────────────────────────────────────────┘
                                │
                                ▼
   FileDropZone (_shell)
        • gate FILE_LIMIT_BYTES (2 MB hard reject)
        • warn FILE_WARN_BYTES (1 MB)
                                │
                                ▼
   tool/app.tsx — doParse(text, sepOverride)
        │
        ├─► autoDetectSep()       _core/csv     pick \t / ; / , or whitespace
        │
        ├─► fixDecimalCommas()    _core/csv     "1,5" → "1.5" (per column)
        │
        └─► parseRaw()            _core/csv     tokenize (RFC 4180-ish),
                                                detect header row,
                                                scan for CSV-formula
                                                injection (=, +, -, @, …)
                                │
                                ▼
   DataPreview (_shell)
        • shows first 8–10 rows of the parsed grid
        • flags formula-injection warnings inline
                                │
                                ▼
   ConfigureStep — user assigns column roles:
        group / value / filter / ignore  (typed as ColumnRole)
                                │
                                ▼
   Tool-specific computation:
        • computeStats / quartiles / kde      from _core/descriptive
        • selectTest / tTest / oneWayANOVA    from _core/stats/{tests,posthoc}
        • hclust / kmeans / pairwiseDistance  from _core/stats/cluster
        • multisetIntersectionP / …           from _core/stats/msi
                                │
                                ▼
   chart.tsx renders SVG via React (forwardRef → useRef from app.tsx)
        │
        ├─► StatsTile (_shell)
        │       runTest / runPostHoc through _shell/stats-dispatch,
        │       emits an annotation spec (brackets / CLD labels) the
        │       chart consumes for the significance overlay
        │
        └─► DownloadTiles (_shell)
                ├─► downloadSvg(svgRef.current, "<stem>.svg")
                │       _core/download.ts → buildExportSvg (clone,
                │       strip styles, append "Plöttr v…" attribution
                │       band) → saveBlob (showSaveFilePicker or
                │       <a download> fallback)
                ├─► downloadPng(svgRef.current, "<stem>.png", 2)
                │       same export clone, rasterised at 2× DPR
                ├─► downloadCsv(headers, rows, "<stem>.csv")
                │       _core/csv.ts → buildCsvString (RFC 4180 +
                │       formula-injection cell prefix)
                └─► R-script via reports.ts (per-tool)
```

The `chart.tsx`'s SVG is the canonical export source. PNG rasterises
from a clone of that SVG, not from the live DOM, so toggling theme,
zooming the browser, or having extra screen DPI never changes a
downloaded image.

---

## 6. The shared kernel — `tools/_core/`

```
   _core/
   ├── color.ts            hexToRgb / rgbToHex / shadeColor /
   │                       getPointColors, PALETTE,
   │                       COLOR_PALETTES (viridis, plasma, …),
   │                       DIVERGING_PALETTES, interpolateColor,
   │                       roleColors
   │
   ├── icons.tsx           TOOL_ICONS catalogue + toolIcon helper
   │                       (returns ReactElement)
   │
   ├── numeric.ts          isNumericValue / toNumericValue
   │                       (Unicode-minus + NBSP-aware),
   │                       normalizeNumericString, seededRandom
   │
   ├── scale.ts            niceStep, makeTicks, makeLogTicks
   │
   ├── csv.ts              autoDetectSep, tokenizeDelimited,
   │                       fixDecimalCommas, parseRaw, parseData,
   │                       parseWideMatrix, wideToLong, reshapeWide,
   │                       parseSetData, parseLongFormatSets,
   │                       guessColumnType, detectWideFormat,
   │                       buildCsvString, scanForFormulaInjection
   │
   ├── descriptive.ts      computeStats, quartiles, kde,
   │                       computeGroupStats
   │
   ├── svg-export.ts       svgSafeId, register/unregister/build/
   │                       serialize/appendPlottrAttribution,
   │                       PLOTTR_ATTRIBUTION_PAD
   │
   ├── download.ts         saveBlob, downloadSvg / downloadPng /
   │                       downloadCsv / downloadText, fileBaseName,
   │                       flashSaved
   │
   ├── theme.ts            getTheme / setTheme / toggleTheme,
   │                       useThemeMode, ThemeToggle component
   │
   ├── shared.ts           barrel re-export of every sub-module
   │
   └── stats/
       ├── dist.ts         normcdf / norminv / gammaln / betai /
       │                   gammainc / tcdf / tinv / fcdf / chi2cdf /
       │                   chi2inv / nctcdf / ncf_sf / ncchi2cdf,
       │                   bisect, power[TwoSample|Paired|OneSample|
       │                   Anova|Correlation|Chi2], fFromGroupMeans
       │
       ├── tests.ts        sampleMean / sampleVariance / sampleSD,
       │                   rankWithTies, shapiroWilk, leveneTest,
       │                   tTest, mannWhitneyU, oneWayANOVA,
       │                   welchANOVA, kruskalWallis, cohenD,
       │                   hedgesG, rankBiserial, cohenDCI,
       │                   pearson/spearman/kendall correlations,
       │                   selectCorrelation, etaSquared, epsilonSquared
       │
       ├── posthoc.ts      _wprob / ptukey / qtukey,
       │                   tukeyHSD, gamesHowell, bhAdjust, dunnTest,
       │                   compactLetterDisplay, selectTest
       │
       ├── cluster.ts      pairwiseDistance, rowDistance, hclust,
       │                   dendrogramLayout, kmeans
       │
       ├── msi.ts          multisetIntersectionP[Exact|ExactLower|
       │                   Poisson], multisetIntersectionExpected,
       │                   multisetExclusive[P|Expected]
       │                   (SuperExactTest-style)
       │
       ├── format.ts       pStars, formatP
       │
       └── types.ts        TTestResult / ANOVAResult / TukeyPair /
                           HClustTreeNode / KMeansResult / …
                           plus RecommendedTest / SelectTestResult
```

Only one residual `globalThis` write lives inside `_core/`: the
`__plottrSvgMutators` WeakMap singleton in `svg-export.ts`. It exists
because two separately-bundled copies of the module (the SPA bundle
and per-tool test bundles) must share one registry — not as a legacy
compatibility shim, but for cross-bundle state correctness.

---

## 7. Theme system

```
   No-FOUC inline IIFE — runs synchronously in every HTML <head>,
   BEFORE the SPA module bundle parses:
   ┌──────────────────────────────────────────────────┐
   │ const t = localStorage.getItem("dataviz-theme"); │
   │ if (t === "dark" || t === "light") {             │
   │   document.documentElement                       │
   │     .setAttribute("data-theme", t);              │
   │ }                                                │
   └──────────────────────────────────────────────────┘
              │  (CSS in theme.css keys off [data-theme="dark"];
              │   first paint already shows the right theme)
              ▼
   <script src="tools/shared.bundle.js">
   = IIFE-bundled _core/theme.ts + synthetic footer
     Object.assign(globalThis, __plottrTheme)
              │
              ▼
   Side effects on script load:
     • BroadcastChannel("dataviz-theme") listener registered
     • window.addEventListener("storage", …) registered (fallback)
     • document.addEventListener("visibilitychange", …) registered
     • _applyThemeAttr(_readStoredTheme())   ← idempotent re-apply
              │
              ▼
   React widgets pull current theme via useThemeMode():
     • <ThemeToggle/>   button in PageHeader + landing
     • per-chart dark/light accent colours

   ┌──────────────────────────────────────────────────────────┐
   │ User toggles ─►  setTheme("dark"|"light")                │
   │                   ├─► localStorage.setItem(...)          │
   │                   ├─► document.documentElement           │
   │                   │     .setAttribute("data-theme", ...) │
   │                   ├─► BroadcastChannel.postMessage(...)  │
   │                   │     (fans out to every same-origin   │
   │                   │      tab; storage event as fallback) │
   │                   └─► CustomEvent("dataviz-theme-change")│
   │                         (in-page React listeners)        │
   └──────────────────────────────────────────────────────────┘
```

---

## 8. Cross-tool data handoff

```
   Source tool (e.g. RLU timecourse → Group Plot, Venn → UpSet)
            │
            │  setHandoff({ type: "dataviz-handoff",
            │               tool: "boxplot",
            │               csv: "...",
            │               sourceTool: "aequorin",
            │               fileName: "...", … })
            │     ◄── writes localStorage["dataviz-handoff"]
            │
            └─► navigateToTool("boxplot")
                   │
                   ├─► SPA path:
                   │      window.__plottrSpaNavigate("boxplot")
                   │      → Router updates location.hash
                   │      → React.lazy fetches the boxplot chunk
                   │
                   └─► Standalone fallback:
                          window.location.assign("boxplot.html")

   Destination tool mounts → consumeHandoff("boxplot")
                              ├─► reads localStorage["dataviz-handoff"]
                              ├─► CLEARS it first (one-shot, even on
                              │   parse failure)
                              ├─► hydrates upload-step state from the
                              │   payload's `csv` / `fileName`
                              └─► skips the manual upload step
```

**Same-tab keep-alive (SPA).** When UpSet was mounted earlier in this
session, its mount-time `consumeHandoff` already ran. The source tool
fires `window.dispatchEvent(new CustomEvent("plottr-handoff"))` after
writing the payload, and UpSet's live listener re-reads sessionStorage
without remounting. The legacy postMessage listener stays wired
defensively for external embeds.

---

## 9. Persistence (localStorage keys)

```
   ─────────────────────────────────────────────────────────────────
   dataviz-theme            "light" | "dark"   — picked theme; OS
                                                  preference wins when
                                                  the key is absent
   dataviz-prefs-<tool>     JSON: per-tool visual prefs
                            { tool, version: PREFS_SCHEMA_VERSION,
                              savedAt: ISO-8601,
                              settings: { ...vis } }
   dataviz-howto-<tool>     "open" | "collapsed"  — HowToCard state
   dataviz-handoff          transient cross-tool payload (one-shot;
                              consumed and cleared on next mount)
   dataviz-upset-handoff    sessionStorage; venn → upset handoff
                              (cleared on consume)
   ─────────────────────────────────────────────────────────────────

   Auto-prefs flow:

      app.tsx ─► usePlotToolState(toolKey, VIS_INIT)
                    │
                    ├─► loadAutoPrefs(toolKey, VIS_INIT)  on init
                    │     reads dataviz-prefs-<tool>, runs
                    │     migratePrefs() if version differs,
                    │     mergePrefsSettings() against VIS_INIT,
                    │     returns the merged `vis`
                    │
                    └─► saveAutoPrefs(toolKey, vis)  on every vis change
                          debounced (setTimeout) so slider drags don't
                          churn localStorage

   PrefsPanel (_shell) — explicit user actions:

      ── exportPrefsFile(tool, vis)    → downloadText("<tool>-settings.json")
      ── importPrefsFile(tool, file)   → mergePrefsSettings into vis
      ── clearAutoPrefs(tool)          → removeItem("dataviz-prefs-<tool>")
```

---

## 10. Test architecture

```
   ┌──────────────────────────────────────────────────────────────┐
   │ Vitest (parallel by file)                                     │
   │   • house vocabulary via tests/harness.js (suite / test /     │
   │     assert / eq / approx)                                     │
   │   • property tests via fast-check (per-tool *.property.test)  │
   │   • component tests via happy-dom + real React 18             │
   │   • per-test timeout 60 s (300 s under Stryker)               │
   └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ tests/helpers/                                                │
   │                                                               │
   │   _shell-test-utils.js     shared building blocks             │
   │     builtins()                  vm built-in globals           │
   │     makeDomStubs()              neutral browser stubs         │
   │     makeLocalStorage()          in-memory localStorage        │
   │     bundleShell("…")            esbuild → CJS for a _shell    │
   │     readCoreSharedSource()      IIFE bundle of _core/shared   │
   │                                 + synthetic Object.assign     │
   │                                 globalThis footer             │
   │     readSharedBundleSrc()       reads tools/shared.bundle.js  │
   │     runCjs(ctx, cjs)            run CJS bundle in vm context  │
   │     requireViaTmpFile()         Stryker-coverage-traced       │
   │                                 require via tests/.tmp/       │
   │                                                               │
   │   stats-source.js          readStatsSource() (IIFE) +         │
   │                            readStatsCjsSource() (CJS) for     │
   │                            _core/stats/*                      │
   │                                                               │
   │   <tool>-loader.js         per-tool harness:                  │
   │     1. vm.createContext(ctx) with builtins + DOM stubs       │
   │     2. vm.runInContext(coreShared, ctx)                      │
   │        → Object.assign(globalThis, __plottrShared)           │
   │     3. vm.runInContext(statsSrc, ctx)                        │
   │        → Object.assign(globalThis, __plottrStats)            │
   │     4. runCjs(ctx, _shell-bundle) for each _shell dep        │
   │     5. runCjs(ctx, tools/<tool>/helpers.ts bundle)           │
   │     6. exports = { parseRaw: ctx.parseRaw, …, helpers… }    │
   │                                                               │
   │   render-loader.js         real React 18 + happy-dom mount    │
   │     ensureSharedBundleLoaded()  one-time realm setup          │
   │     loadTool("boxplot")         esbuild app.tsx → IIFE        │
   │                                  → returns chart components   │
   │     renderHtml(C, p)            renderToStaticMarkup (sync)   │
   │     renderWithEffects(C, p)     createRoot + act + happy-dom  │
   │                                                               │
   │   csv-corpus.js + csv-arbitraries.js                         │
   │     pathological-input corpus (BOM, CRLF, mixed delimiters,   │
   │     decimal commas, ragged rows, null bytes, NaN/Inf, …) +    │
   │     fast-check arbitraries that wrap it (arbAnyCsv, arbWide,  │
   │     arbLong, arbSet, arbLongSet)                              │
   └──────────────────────────────────────────────────────────────┘

   Stryker mutation testing: vm.runInContext gives loaded code its
   own context, so __stryker__ writes from inside don't reach the
   runner — mutants show as no-coverage. requireViaTmpFile() (used
   by stats-loader.js, scatter-loader.js, lineplot-loader.js's
   helpers path) makes the file part of Node's module graph so
   Stryker's coverage instrumentation traces it.
```

---

## 11. Build pipeline

```
   ┌──────────────────── npm run build ──────────────────────────┐
   │                                                              │
   │  prebuild:                                                   │
   │    node scripts/write-version.js                             │
   │      reads the most recent ## [X.Y.Z] - DATE heading from    │
   │      CHANGELOG.md, writes tools/version.js                   │
   │                                                              │
   │    node scripts/build-shared.js                              │
   │      esbuild --bundle --format=iife --globalName=__plottrTheme│
   │              tools/_core/theme.ts                            │
   │      writes tools/shared.bundle.js (+ synthetic              │
   │      Object.assign(globalThis, __plottrTheme) footer)        │
   │                                                              │
   │    node scripts/vendor-sri.js                                │
   │      sha384-hashes vendor/react*.js                          │
   │      rewrites <script integrity=…> in index.html             │
   │                                                              │
   │  build:                                                      │
   │    esbuild tools/_app/index.tsx                              │
   │      --bundle --splitting --format=esm                       │
   │      --outdir=tools/_app                                     │
   │      --chunk-names=chunks/[name]-[hash]                      │
   │      --jsx=transform --minify-syntax --minify-whitespace     │
   │      --sourcemap                                             │
   │                                                              │
   │      → tools/_app/index.js                                   │
   │      → tools/_app/chunks/<name>-<hash>.js                    │
   │      → tools/_app/index.js.map + per-chunk .map              │
   └──────────────────────────────────────────────────────────────┘

   Compiled outputs are CHECKED INTO GIT so the static GitHub Pages
   deploy works without a server-side build. The pre-commit hook
   (scripts/hooks/pre-commit, installed by `npm install`) rebuilds
   and re-stages drifted compiled outputs whenever staged source
   files affect the build.
```

`npm run watch` runs `scripts/watch.js`, which wraps the esbuild call
in watch mode for ~5 ms incremental rebuilds.

---

## 12. End-to-end request: "I drop a CSV into Group Plot"

```
   ┌───────────────────────────────────────────────────────────────┐
   │  User drops cells.csv onto the boxplot tool's drop zone       │
   └───────────────────────────────────────────────────────────────┘
                              │
   FileDropZone reads file → handleFileLoad(text, name)
                              │
   tools/boxplot/app.tsx doParse(text, sepOverride)
        │
        ├─► autoDetectSep                _core/csv      → ","
        ├─► fixDecimalCommas             _core/csv      → no-op for ","
        ├─► parseRaw                     _core/csv      → headers, rows
        ├─► scanForFormulaInjection      _core/csv      → null (clean)
        │
        ▼
   setStep("configure") → ConfigureStep renders DataPreview
                              │
   User picks: group=Treatment, value=Yield, filter=Plate
                              │
   setStep("plot") → plot-area.tsx
                              │
        ┌─────────────────────┴───────────────────────┐
        ▼                                             ▼
   chart.tsx (BoxplotChart, forwardRef)         stats-panel.tsx
        │                                             │
        │ for each group:                             │ for each subgroup:
        │   quartiles(values)   _core/descriptive    │   selectTest(groups)
        │   kde(values, 60)     _core/descriptive    │     _core/stats/posthoc
        │                                             │   STATS_TEST_REGISTRY
        │ renders <svg>:                              │     [chosen].run()
        │   • box + whiskers                          │     _core/stats/tests
        │   • violin / raincloud path                 │   STATS_POSTHOC_REGISTRY
        │   • outlier dots                            │     [chosen].run()
        │   • jitter points                           │     _core/stats/posthoc
        │   • CLD letters / sig brackets              │   computePowerFromData
        │                                             │     _shell/power-from-data
        │ ◄────────── annotation spec ────────────────┤
        │            (i, j, p, label, _level)         │
        ▼                                             │
   DownloadTiles (_shell) ───────────────────────────┘
        │
        ├─► downloadSvg(svgRef.current, "cells_boxplot.svg")
        │      _core/download → _core/svg-export.buildExportSvg
        │      → strips inline styles, registers attribution band,
        │      → saveBlob (showSaveFilePicker / <a download> fallback)
        │
        ├─► downloadPng(svgRef.current, "cells_boxplot.png", 2)
        ├─► downloadCsv (per-group means / quartiles via reports.ts)
        └─► downloadText(buildRScript(...), "cells_boxplot.R")
              tools/boxplot/reports.ts → _shell/r-export.ts
              sanitizeRString / formatRNumber for safe inlining
```

Every arrow above is a real import chain — `_core` knows nothing about
the boxplot tool, `_shell` knows `_core`, and `tools/boxplot/` knows
both. The chart never reaches into the parser; the stats panel never
touches the chart's SVG; the kernel never calls a React hook. If a
future change wants to violate one of those rules, the module-graph
shape will fight it.

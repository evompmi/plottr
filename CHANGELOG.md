# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **HowTo tile content lifted out of every long file into a uniform
  shared component.** New `tools/_shell/HowTo.tsx` renders a fixed
  three-card layout (Purpose / Data layout / Display, plus optional
  Tips + capability pills) driven by a typed `HowToContent` object;
  per-tool prose lives in tiny `tools/<tool>/howto.tsx` constants.
  Each tool's `steps.tsx` (or `index.tsx` for volcano) drops from
  100–290 LoC of inline JSX to a single `<HowTo {...TOOL_HOWTO} />`
  call. Same time, eight tools rewritten to a consistent depth —
  user-language purpose, two sentences on data layout, two-three on
  display options, with tool-specific specifics (no more wall-of-
  text in one place + one-liner in another).
- **Downloads now prompt for a save location.** Every export
  (SVG / PNG / CSV / R script / TXT) tries the File System Access
  API (`window.showSaveFilePicker`) first so the user can pick a
  folder + filename. Supported in Chromium-based browsers (Chrome /
  Edge / Opera) on HTTPS / localhost. Firefox / Safari and any
  context that strips the API (sandboxed iframes, `file://`) fall
  back to the classic `<a download>` anchor click that drops the
  file in the browser's default Downloads folder. Cancelled picker
  is a silent no-op. New `saveBlob(blob, filename)` helper in
  `tools/shared.js` centralises the picker / fallback logic; all
  four download functions (`downloadSvg`, `downloadPng`,
  `downloadCsv`, `downloadText`) now delegate to it.

### Added

- **Playwright e2e suite (`e2e/`).** Golden-path flows in real
  Chromium, run via `npm run e2e`. Closes the "renders the wrong
  chart" gap the vm + functional-React-mock unit tests can't see —
  exactly the class of bug the v1.2.0 volcano colorNs glitch was.
  18 tests across 9 spec files covering every tool:
  - **Landing**: 10 tool tiles + theme-toggle flips `data-theme`.
  - **Boxplot**: load example → walk to plot → ≥ 2 boxes render.
  - **Scatter**: load Iris → ≥ 50 points render.
  - **Lineplot**: load example → ≥ 2 traces render.
  - **Venn**: load example → set circles render.
  - **UpSet**: load example → bars + matrix-dot circles render.
  - **Heatmap**: load example → walk to plot → ≥ 100 cells render.
  - **Aequorin**: auto-Y first-paint regression — at least one
    Y-tick reads above `VIS_INIT_AEQUORIN`'s 1.4 default.
  - **Volcano**: colorNs regression (default + Set1 + Set3 each
    assert ns fill stays `#999999`); search-by-name populates
    `<g id="top-n-labels">`.
  - **Calculators**: molarity + power smoke (page mounts, primary
    actions reachable).
  - **Cross-tool discrete-palette** wiring smoke for lineplot,
    venn, volcano (boxplot / aequorin / scatter palette flows are
    covered by their dedicated specs).
    Wall time: ~6 s for all 18 tests locally. Auto-spins a Python
    `http.server` on :8765 against the repo root (no Node server
    needed). New CI step `Run Playwright e2e` gates every PR;
    failures upload the HTML report + traces as a 7-day artefact
    for offline triage. `data-testid="load-example"` added to the
    shared UploadPanel button so e2e specs don't have to know each
    tool's per-dataset label string.

### Changed

- **Theme-var coverage retroactively audited.** Replaced the five
  remaining `rgba()` / `rgb()` literal sites in inline `style={{}}`
  attributes with new theme vars: heatmap selection-readout panel
  (`--shadow-md`), `_shell/ScrollablePlotCard` "scroll for more →"
  pill (`--shadow-sm`), aequorin sample-selection overlay
  (`--shadow-lg`), venn rename-input focus glow (`--focus-ring`).
  The two `linear-gradient(..., rgba(255,255,255,0))` fades on the
  scroll-card edges now use the `transparent` keyword for clarity —
  same visual result, no theme dependency.
- **`plottr/no-chrome-hex-literal` ESLint rule scope widened.** Now
  also catches named CSS colours (`white`, `black`, `slategray`, …;
  `transparent` and `currentColor` are allowed) and functional-notation
  literals (`rgba(...)`, `rgb(...)`, `hsl(...)`, `hsla(...)` — including
  ones buried inside multi-token `boxShadow` or `linear-gradient(...)`
  strings). Rule name kept stable for config compatibility; only the
  detection logic widened.
- **Volcano `chart.tsx` split.** 939 LoC monolith → 563 LoC slim
  orchestrator, 306 LoC `chart-layout.ts` (axis ranges, point
  classification, label layout, fill / radius resolvers — all pure,
  no React), 214 LoC `chart-legends.tsx` (color + size in-SVG
  legend renderers). Behaviour unchanged: 49 unit tests + 500-iter
  fuzz clean.
- **Type the React-tier prop bags across every plot tool.** `: any`
  destructures in each tool's `steps.tsx` / `controls.tsx` /
  `plot-area.tsx` replaced with explicit prop interfaces declared in
  the tool's `helpers.ts` (the type-canonical home — sidesteps the
  `index → steps → index` import cycle). Eight tools touched:
  lineplot / venn / upset / heatmap / scatter (UploadStep only) /
  aequorin / boxplot, plus matching `*Vis` and `UpdVis` types per tool.
  Latent bugs surfaced and fixed in passing: 4 `Map.get(...)` derefs
  without nullish guard in venn + upset CSV exporters; several
  `useState` hooks (heatmap clustering / distance / linkage,
  aequorin's `formula`, boxplot / upset `dataFormat` / `format`)
  narrowed from `string` to typed unions. The remaining `: any` in
  these files are inline callbacks over local example / illustration
  data (HowTo card example tables, anonymous option-array mappers) —
  not prop bags.

### Fixed

- **Aequorin auto-Y first-paint glitch.** The prior `useLayoutEffect`
  fix updated `vis.yMin/yMax` after the chart had already received
  the stale persisted values via props, so the first paint of the
  plot step still showed the old range and snapped one frame later.
  Two-part fix:
  - Compute the effective Y-range during render via an `effYRange`
    `useMemo` that reads directly from `calData` whenever
    `autoYRange` is on; `PlotPanel` consumes that, not
    `vis.yMin/yMax`. Stale frame eliminated.
  - Reset `autoYRange: true` on every fresh parse — the Y-min /
    Y-max inputs flip `autoYRange: false` when typed into, and that
    boolean was persisted to localStorage, so a later reload with a
    new dataset cropped to the previous session's manual Y bounds.

## [1.2.0] - 2026-05-04

> Long-form release notes — what shipped, why, and how — live in
> [`docs/release-notes/v1.2.0.md`](docs/release-notes/v1.2.0.md). The
> entries below are summary bullets that link there.

### Added

- **Volcano — search points by feature name.** Paste a comma- / newline-
  separated list (or type a single name) into the Labels tile to highlight
  matching points with rings + labels. Case-insensitive substring per
  token; live match-count + unmatched-token typo finder. Rides on the
  existing `manualSelection` infra. +15 unit tests. See
  [`docs/release-notes/v1.2.0.md#-volcano--search-points-by-feature-name`](docs/release-notes/v1.2.0.md#-volcano--search-points-by-feature-name).
- **Discrete-palette picker on every plot tool.** New shared
  `tools/shared-discrete-palette.js` ships an 11-palette catalogue
  (Okabe-Ito default, Tableau10, ColorBrewer Set1/Set2/Set3/Dark2/Paired/
  Pastel1/Pastel2, ggplot2-default `hue`, viridis-discrete). Every
  per-group/per-category sidebar gains a themed dropdown that overwrites
  group colours; default `okabe-ito` is byte-identical to the prior
  `PALETTE` so existing data reloads unchanged. +17 unit tests. See
  [`docs/release-notes/v1.2.0.md#-discrete-palette-picker--all-eight-plot-tools`](docs/release-notes/v1.2.0.md#-discrete-palette-picker--all-eight-plot-tools).
- **Custom ESLint rule `plottr/no-chrome-hex-literal`.** Fires on inline
  `style={{ key: "#abc..." }}` JSX outside an SVG subtree, enforcing the
  CSS-variable theme contract while leaving SVG chart hex literals
  exempt. See
  [`docs/release-notes/v1.2.0.md#-custom-eslint-rule--plottrno-chrome-hex-literal`](docs/release-notes/v1.2.0.md#-custom-eslint-rule--plottrno-chrome-hex-literal).
- **`eslint-plugin-react-hooks`** — both `rules-of-hooks` and
  `exhaustive-deps` enforced (the latter at error level after auditing
  57 outstanding warnings).

### Changed

- **Tool-split refactor — every plot tool in its own folder.** Venn /
  lineplot / scatter / upset joined the existing folder-shaped boxplot /
  aequorin / heatmap / volcano. esbuild entrypoints rewired to
  `tools/<tool>/index.tsx`; tsconfig include broadened. See
  [`docs/release-notes/v1.2.0.md#-tool-split-refactor--every-plot-tool-in-its-own-folder`](docs/release-notes/v1.2.0.md#-tool-split-refactor--every-plot-tool-in-its-own-folder).
- **TypeScript strictness — full `strict: true` across the tool
  surface.** Six-commit phased rollout (safe flags →
  `strictNullChecks` → pure-helper `noImplicitAny` → component-prop
  types → global `noImplicitAny` → `strict: true`). See
  [`docs/release-notes/v1.2.0.md#-typescript-strictness--full-strict-true-across-the-tool-surface`](docs/release-notes/v1.2.0.md#-typescript-strictness--full-strict-true-across-the-tool-surface).
- **`exhaustive-deps` promoted from warn to error.** Audited and fixed
  all 57 outstanding warnings; several latent bugs surfaced in passing
  (facet-ref staleness, two rules-of-hooks ordering bugs).
- **DownloadTiles abstraction.** Every tool's plot-area renders export
  chips through the shared `_shell/DownloadTiles.tsx` instead of
  re-deriving the layout.
- **Aequorin Configure step** — the calibration-formula and time-axis
  tiles now use the AesBox-style themed cards introduced in boxplot,
  volcano, and scatter so the visual language matches across every plot
  tool.

### Fixed

- **tsconfig include hole** — `tools/*.tsx` (single-star glob) silently
  skipped the new `tools/<tool>/index.tsx` files after the split,
  hiding three runtime crashes (scatter / lineplot / upset) from
  `tsc --noEmit`. Glob broadened to `tools/**/*.ts(x)`.
- **`PageHeader` icon prop in `power.tsx`**, missing
  `IntersectionStatsPanel` export in `upset/` — both latent, surfaced
  once the typecheck saw every file.
- **Perl-heredoc shell-escape bug** during the `noImplicitAny` migration
  silently rewrote ~24 sites with literal `$1: any, $2: any` instead of
  the captured parameter names; recovered by hand.
- **Aequorin plot page** — the **↗ Open in Boxplot** button now matches
  the height of the adjacent ⬇ CSV chip (previously ~4 px shorter due to
  `dv-btn-secondary`'s tighter vertical padding).

## [1.1.0] - 2026-05-03

> Long-form release notes — what shipped, why, and how — live in
> [`docs/release-notes/v1.1.0.md`](docs/release-notes/v1.1.0.md). The
> entries below are summary bullets that link there.

### Added

- **Volcano Plot — eighth plot tool, ships under `tools/volcano/`.**
  Three-class significance colouring, ±|log2FC| / −log10(p) reference
  lines, top-N labels with collision-avoid layout, click-to-label override,
  optional colour / size aesthetic mappings with in-SVG legends, p = 0
  clamping, ggplot2-style R export, classified CSV export. Auto-detects
  DESeq2 / limma / edgeR column conventions. 49 unit tests + 1k×3-seed
  fuzz harness. Bundled demo dataset (`tools/volcano_example.js`) ships a
  synthetic plant-transcriptomics output with FDR + base-mean columns to
  exercise the aesthetic mappings. See
  [`docs/release-notes/v1.1.0.md#-volcano-plot--eighth-plot-tool`](docs/release-notes/v1.1.0.md#-volcano-plot--eighth-plot-tool).
- **Anti-clickjacking frame-buster on every HTML (Tier A #3).**
  Inline `<style>` + `<script>` block hides each page until same-origin
  embed is verified; cross-origin frames get a static "Open in a top-level
  tab" link. Synced across the 10 HTML files via
  `scripts/anti-clickjack-sync.js`, gated by CI. 10 regression tests.
- **Subresource Integrity pinning for vendored React / ReactDOM (Tier B
  #4).** `scripts/vendor-sri.js` writes `integrity="sha384-…"` on every
  vendor `<script>` tag, idempotent, gated by `npm run lint:sri` + CI.
  9 regression tests.
- **CSV-export sanitiser + ingest formula-injection scanner + warning
  banner (Tier A #1 & #2).** Every export goes through `buildCsvString`
  with leading-trigger escape; every parse path runs
  `scanForFormulaInjection`; new `FormulaInjectionBanner` rendered by
  `PlotToolShell`. Numbers carved out of both layers via `isNumericValue`
  so negatives don't get corrupted. `sanitizeRString` /
  `sanitizeRComment` close the R-script comment escape. 27 regression
  tests.
- **RLU timecourse — "↗ Open in Boxplot" hand-off.** New
  `tools/shared-handoff.js` (`setHandoff` / `consumeHandoff`,
  one-shot localStorage round-trip) bundles per-replicate sums and skips
  Boxplot's configure step on arrival. Tool-agnostic shape — any tool can
  opt in. 8 regression tests.

### Changed

- **Privacy-page diagram surfaces the ingest scan + export sanitise
  guards inline.** Two green pills under the data-flow arrows on
  `privacy.html`, themed via `--success-*`. SVG `<desc>` updated for
  screen readers.
- **Landing page — plot tiles arranged 4×2 instead of 2×4.** Eight tools
  pushed the previous 2-column layout into a tall vertical column. New
  `.tiles-narrow` modifier keeps the calculators group 2-wide. Below
  700px both fall back to 2-up.
- **UpSet plot — Minimum / Maximum degree controls switched from sliders
  to `−` / `+` NumberInputs**, matching "Minimum intersection size".
  Cross-clamp preserved; saved prefs rehydrate unchanged.
- **`npm test` auto-bumps the landing-page test-count badge** via a new
  `posttest` hook. CI's badge-verify step stays as a backstop.
- **Pre-commit hook prints a recovery recipe** when stash-pop conflicts
  (`git checkout --theirs <file>` → `git add` → `git stash drop`),
  including the counter-intuitive `--theirs` / `--ours` orientation note.

### Fixed

- **`postMessage` cross-frame channels origin-pinned project-wide (Tier
  2 #3).** Receivers (`index.html:1048`, `theme.js:145`) check
  `e.origin === window.location.origin`; senders (`index.html:1134`,
  `venn.tsx:441/445`, `aequorin/plot-area.tsx:435`) target
  `window.location.origin` instead of `"*"`. `file://` deploys still
  work (`null` === `null`).
- **`scripts/write-version.js` reads the version from `CHANGELOG.md`
  instead of `git describe`,** closing the 1.0.5 deploy race where the
  tag hadn't reached GitHub by the time the workflow ran.
- **`parseLatestVersion` extracted as a pure helper and pinned by 8
  tests (Tier 1 #2).** Side effects gated behind
  `if (require.main === module)` so the regex contract has a unit-test
  footprint.
- **R-script export headers rebranded "Plöttr" (Tier 1 #1).** Six
  `# Dataviz Toolbox — …` literals in the R-script builders had drifted
  past the 1.0.4 brand rename. Regression test in `r-export.test.js`
  pins both invariants.

## [1.0.5] - 2026-05-02

> Long-form release notes: [`docs/release-notes/v1.0.5.md`](docs/release-notes/v1.0.5.md).

### Changed

- **Control-tile titles unified to the heatmap convention across every plot tool.** New `.dv-tile-title` class in `tools/components.css` (12 px uppercase semibold, 0.5 px letter-spacing, `--text-muted`) becomes the single source of truth; every per-tool `ControlSection` header and shared `ActionsPanel` "Actions" tile picks it up. Pure CSS-and-className refactor.
- **Suggested citation describes Plöttr as a toolbox "for wet-lab scientists" rather than "for plant scientists".** The product never had any plant-specific code paths beyond the optional aequorin calibration formula; the narrower phrasing undersold the audience.
- **Benchmark page — third-person voice, tighter lede, consistent disclosure chrome, expand/collapse-all toggle.** Switches first-person prose to third-person, adopts the canonical `.dv-disclosure` chevron from `tools/components.css`, and adds a sync'd Expand all / Collapse all button. Edits live in the generator so `npm run benchmark` reproduces the new copy verbatim.

### Fixed

- **RLU timecourse — Series / Layout toggles no longer collide with the Sample-selection pill on narrow columns.** New CSS container query on `.dv-aeq-chart-area`: under 620 px the toggles flip to a right-aligned vertical stack and drop their absolute positioning so they re-enter normal flow.
- **RLU timecourse — first-render auto-Y glitch eliminated; range computation extracted as a pure helper.** Switched the auto-rescale from `useEffect` to `useLayoutEffect` so the corrected range commits before paint. New `computeAutoYRange` helper with 8 tests in `tests/aequorin.test.js` (891 → 899).
- **Privacy page — "GitHub" link in the "Open to scrutiny" trust-card now follows site link conventions.** Was falling back to UA-default `#0000EE` blue; new `.trust-card a` rule restores `--accent-primary` + WCAG-AA contrast.
- **Landing page — accessibility, contrast and consistency pass.** Nine fixes: three WCAG-AA contrast failures, theme-toggle magic-number positioning, Title Case casing, em-dash bookends, screen-reader-friendly footer split, `:focus-visible` outline on `.tile`, dead `letter-spacing` removal.
- **Browser favicon now matches the brand mark.** Replaces the four-blue-dot abstract scatter with the Ansuz rune used in the landing header — one consistent identity.

## [1.0.4] - 2026-05-02

> Long-form release notes: [`docs/release-notes/v1.0.4.md`](docs/release-notes/v1.0.4.md).

### Added

- **License paperwork in place for Zenodo deposit.** Root `LICENSE` (MIT), `vendor/LICENSE-react.txt`, top-level `THIRD_PARTY.md` consolidating every algorithmic reference and attribution. README's `Citing` section gains a `License` sibling.

### Changed

- **`betacf`, `gammainc`, `gammainc_upper` swapped to Cephes-derived ports (public domain).** A licensed-source audit flagged the prior implementations as near-verbatim _Numerical Recipes in C_ ports — restrictive license, real legal risk for the Zenodo deposit. Replaced with ports of `incbcf` / `igam` / `igamc` from the Cephes Mathematical Library. Cross-validated: 299/303 benchmark comparisons pass, 0 fail; deep-tail drifts inside `P_LOG_TOL`.

### Fixed

- **Benchmark page: collapsible categories restored, "Toolbox" / "dataviz" labels renamed to "Plöttr".** Two drifts rooted in the same anti-pattern — earlier fixes landed on the rendered HTML and were reverted on the next `npm run benchmark`. Both now live in the generator (`benchmark/run.js`) so they survive regenerations.
- **README — benchmark count corrected (293 → 303) and `max |Δ|` clarified as absolute.** Frames the headline figure as the absolute max across all 303 comparisons; adds the test-statistics-only max for reviewers tracking W/t/F/H accuracy independent of p-value underflow.
- **RLU timecourse — X start / X end inputs now follow the Display unit.** The inputs skipped the row-index → display-unit conversion, so switching display unit left the typed range stuck on raw row indices. Inputs now apply `* timeStep * convertTime(base→display)` and labels carry the active unit.

## [1.0.3] - 2026-05-01

> Long-form release notes: [`docs/release-notes/v1.0.3.md`](docs/release-notes/v1.0.3.md).

### Added

- **Screenshots for UpSet and Heatmap.** README screenshot grid extended from 3 × 2 to 4 × 2; capture pipeline automated in `scripts/gen-screenshots.mjs` (selenium + Inkscape + Pillow, selenium kept out of `package.json` to keep `npm install` lean).
- **Privacy / data-flow page (`privacy.html`).** The "Data stays in your browser" trust badge now links somewhere. Inline-SVG schematic of the trust boundary plus three plain-language cards (Your data is safe / No monitoring / Open to scrutiny) and a `git clone` recipe for offline operation.

### Changed

- **Aequorin tool renamed to "RLU timecourse".** Foregrounds the broader use case over the niche Ca²⁺ calibration. Internal identifiers (`tools/aequorin/`, localStorage key `aequorin`, etc.) intentionally unchanged so saved auto-prefs survive.
- **In-app "How to use" panels resynced with current feature surface.** Drift audit across all seven tools — five had aged behind the implementation. Aequorin / Boxplot / Heatmap / Scatter / Venn panels updated; lineplot + upset were already accurate.

## [1.0.2] - 2026-05-01

> Long-form release notes: [`docs/release-notes/v1.0.2.md`](docs/release-notes/v1.0.2.md).

The audit-23 closeout release: every Tier 1–5 item lands plus a shared chart-annotations module, the boxplot Facet × Subgroup gate, and a "trust badges + how-it-works strip" landing-page lift.

### Added

- **Audit-23 Tier 4 — test coverage hardening.** Direct distribution-primitive symmetry / boundary tests (`normcdf`, `tcdf`, `fcdf`, `chi2cdf`, `norminv`, `tinv`); `ncf_sf` small-d2 coverage; new `benchmark/run-r-export.js` integration test that actually executes the user-facing R-script via `Rscript --vanilla` and asserts JS p ≈ R p (initial Δ = 3.76e-6 on the t-test block).
- **Landing page — trust badges near the tagline + "How it works" step strip under the tile grid.** Promotes the `N internal tests / cross-checks vs R 4.5` story to two trust pills under the tagline; new four-pill flow (Paste CSV → Assign roles → Tweak plot → Download SVG + R) below the grid.

### Changed

- **Significance brackets + CLD-letter labels lifted into a shared `_shell/chart-annotations.tsx`.** `<SignificanceBrackets>` + `<CldLabels>` collapse three near-duplicate renderers each across boxplot + aequorin. Aequorin adopts boxplot's stroke / font-size / colour as the source of truth.
- **Boxplot — Facet by + Subgroup by are no longer mutually exclusive.** Now that the stats panel is a single lean table, all four modes (flat / facet / subgroup / facet × subgroup) are selectable. Stats reducer collapsed to a single `cellAnnotations` / `cellSummaries` dict keyed by composite `${facet}::${subgroup}` strings; new `tests/boxplot-helpers.test.js` covers per-facet annotation merging.

### Fixed

- **Audit-23 Tier 5 — tooling robustness.** `formatP` non-finite contract pinned by 5 tests; `build-shared.js` now parses the concatenated bundle (`new Function(bundle)`) before atomically replacing it; pre-commit hook switches to stash-then-index-relative-diff so it can't silently re-stage drifted compiled outputs or overwrite a developer hot-patch.
- **Audit-23 Tier 3 — prefs schema-migration scaffold.** `migratePrefs(settings, fromVersion)` lands in `shared-prefs.js`; `loadAutoPrefs` threads parsed blobs through it. Pass-through today; future-version blobs reject so the load falls back to defaults. CSP + iframe sandbox attempts reverted (incompatible with `blob:` programmatic-click downloads).
- **Audit-23 Tier 2 reliability fixes.** `guessColumnType` no longer mis-classifies year / binary columns as `value` (≤ 12 distinct integers ⇒ `group`); scatter + lineplot visual prefs now round-trip through `vis` so they survive reloads; `wideToLong` and `reshapeWide` surface their silent-drop / silent-merge counts to the user.
- **Audit-23 Tier 1 quick fixes.** Boxplot `cellKey` switched to `JSON.stringify([facet, sg])` so labels containing `::` can't collide; UpSet handoff payloads gated on `FILE_LIMIT_BYTES` + path-separator-stripped `fileName`; `downloadCsv` headers now run through the same RFC 4180 escape as data cells (extracted as a pure `buildCsvString` for round-trip tests).
- **Scatter — visual prefs no longer wiped on every file parse.** Drops the `setPointColor("#648FFF")` etc. resets that audit-23 #1's first cleanup missed; only column-index slots + filter state reset on parse.

## [1.0.1] - 2026-04-23

> Long-form release notes: [`docs/release-notes/v1.0.1.md`](docs/release-notes/v1.0.1.md).

### Added

- **UpSet — full SuperExactTest-style multi-set intersection significance pipeline.** New `multisetIntersectionPExact` / `multisetIntersectionPPoisson` / `multisetIntersectionP` in `stats.js` (cross-validated against R's `SuperExactTest::cpsets`); UpSet wires them up as a click-to-compute side panel, then a sidebar batch-compute with progress bar, then on-plot stars / `p=…` markers, then green/red bar colouring with two-sided BH adjustment so depletion is no longer invisible. Universe-size override moves into the Statistics sidebar tile.
- **UpSet — dedicated "S#" set-id lane on the plot, mirroring "I#".** Compact `S1 ∩ S3 ∩ S5` form below the plot with full names on hover keeps high-degree intersections legible.
- **Lineplot — "None" option in the Error bars selector.** Fourth segmented option for clean mean-only curves; auto-axis treats "none" as zero.
- **Landing page — Ansuz rune (ᚨ) brandmark next to the title.** Inline SVG drawn from primitives so it themes via `currentColor` and renders identically across OSes.
- **CSV/TSV parser rewritten as an RFC 4180-style state machine.** New `tokenizeDelimited` handles quoted separators, embedded newlines, escaped `""`, BOM, CRLF/LF — every plot tool inherits the fix via `parseRaw` / `parseData`. 9 + 3 regression tests.
- **`fixDecimalCommas` rewritten as per-column detection.** US thousand separators (`1,000.50`) and label cells with commas (`E,coli`) no longer corrupted by the European-decimal-comma rewrite. 7 regression tests.
- **Fuzz harnesses now run in CI.** Default-cadence sweep on every PR, 10k × 3-seed release sweep weekly + manually triggerable.
- **CI guard for the landing-page test-count badge.** Drift between `npm test` total and the `index.html` badge fails loud.

### Changed

- **AesBox header bands desaturated — pale tint + deep text.** Replaces the saturated slate / emerald / purple fills with white text. New `--aes-*-header` / `--aes-*-header-text` CSS-var pair per role.
- **AesBox role-card pattern ported to lineplot + boxplot Configure steps.** Slate / emerald / purple cards for X / Y / Group by replace the plain `<label>` + `<select>` grid; column-role pickers unified to scatter's permanent "Variables" tile pattern across all three long-format tools.
- **Boxplot Configure step — full-per-column `ColumnRoleEditor` replaced with a compact "Other columns" panel.** Single filter checkbox per non-primary column; AesBox cards own the primary roles.
- **Boxplot column roles collapsed from five to four.** The "text" role merged into "filter" — `filter` and `text` were near-synonyms with no downstream payoff for the distinction.
- **Boxplot Filter step — live delta in the preview title + 300 ms flash on the preview card.** Title reads `Preview · 856 of 1024 rows · 168 filtered out`; numeric value-column tile no longer renders its dead placeholder.
- **Sidebar `ControlSection` default-open states standardised: exactly one section open per tool.** Picked the "workflow root" section per tool; everything else closed.
- **UI consistency sweep across the plot suite.** Lineplot picks up `BaseStyleControls` (gains background + grid colour pickers); boxplot/aequorin error-bars switch to `.dv-seg`; title / subtitle / axis-label inputs standardised; UpSet's title/subtitle move to a new "Labels" section.
- **Boxplot — Y-scale picker swapped from a dropdown to a 4-button segmented (Linear / Log₁₀ / Log₂ / Ln).** Exposes every choice without a click + re-click.
- **Boxplot — "Bar outline" toggle swapped from checkbox to segmented Off / On.** Last `<input type="checkbox">` in the style section gone.
- **Heatmap + Venn — step 2 conditionally renamed "Import check".** "Configure" is misleading where the step is just a parsed-matrix preview; Venn keeps "Configure" once 4+ sets fire the real picker flow.
- **Heatmap — per-axis "Show dendrogram" toggles for hierarchical clustering.** Independent row + column toggles; reserved margin collapses when off; detail (zoomed) view respects the same prefs.
- **Power tool — result number traffic-lighted when solving for power.** ≥ 80 % default, 60–80 % amber, < 60 % red. Theme-aware vars.
- **Power tool — mobile single-column layout.** Test → Solve-for → Effect size → Parameters → Result; chart card hidden below 900 px. Test-question banner orders correctly per viewport.
- **Landing page — tool topbar on mobile shows only the theme toggle + the cross-link between calculators.** Plot-tool icons hidden on phones (1100 px desktop floor).
- **Landing page — mobile phones see the calculators only, with a short note explaining why.** Plot tile group hidden ≤ 900 px; banner pinned to 314 px so it lines up with the tile grid above.
- **Lineplot — Grid off by default, significance-stars toggle moved to the below-plot stats tile.** Aligns with the rest of the suite; mirrors boxplot's stats-panel "Display on plot" convention.
- **UpSet — "Minimum intersection size" control swapped from a fixed 0–20 slider to a `NumberInput`.** Tiny uploads no longer waste 85 % of slider travel; large datasets no longer cap at 20. Auto-clamp on dataset swap.
- **UpSet — intersection-id labels and significance markers always render rotated -90°.** Vestigial `shouldRotateColumnIds` heuristic removed.
- **UpSet — upload-step "How to use" refreshed to cover the full feature set.** Three Controls bullets + new Statistics card with 5 bullets.
- **UpSet — statistics controls extracted into their own collapsible "Statistics" sidebar tile.** Display tile keeps only chrome + visual controls.
- **UpSet — intersection-statistics BH family no longer depends on display filters.** Display filters become purely visual; the family is fixed by the active set selection. Tests every intersection once and caches.
- **Benchmark — Tukey HSD / Games-Howell rows past R's `ptukey` floor rendered as "R-floor" (amber), not as failures.** Three-way verification (R / scipy / 20M-sample MC) confirms JS continues correctly past the cancellation point.
- **Statistical benchmark compares deep-tail p-values in log space and cross-validates against `PMCMRplus`.** Hybrid tolerance: absolute Δ ≤ 5e-3 above p = 0.01, `|log(p_R) − log(p_JS)| ≤ log(1.1)` below. Games-Howell + Dunn-BH "R references" replaced with the canonical PMCMRplus implementations.
- **Test render-mock — `useEffect` / `useLayoutEffect` now actually run, plus `createContext` / `useContext` scaffolding.** Old mock silently passed every render-smoke test that contained an effect.
- **CLAUDE.md — test-loader section updated to match the current `esbuild + vm` pattern.** Stale slice-and-regex prose retired.

### Fixed

- **Group / category colour choices now round-trip through Save / Load prefs and the auto-persist slot.** Per-group colour maps moved into `vis` (lineplot's `groupColors`, boxplot's `boxplotColors` / `categoryColors`); existing prefs machinery covers them unchanged.
- **Heatmap — cell-value tooltip tracks the cursor correctly in dark mode and keeps working when the zoomed detail plot is open.** `position: fixed` re-rooted by `filter: brightness(0.85)` on `.dv-plot-card`; switched to `position: absolute` against the chart wrapper.
- **Heatmap — detail (zoomed) plot now shows the crosshair cursor like the main plot.** Cursor was keyed off `interactive`; tooltip still fires there so the cursor should still signal "pointing at a cell".
- **Heatmap — CSV-export ref moved out of the render body into a `useEffect`.** Closes a render-purity violation that Strict Mode would expose.
- **Below-plot download buttons now stay right-anchored under flex wrap across all tools.** `marginLeft: "auto"` (+ `flexShrink: 0`) added everywhere the chip wraps to its own line.
- **UpSet — intersection-size labels rotate -90° + the bar area reserves headroom for stacked rotated labels.** Dynamic `labelHeadroom` from `topAxisMax` + widest sig-marker token prevents clipping above the plot.
- **UpSet — handoff `postMessage` listener now rejects cross-origin messages.** Closes an injection surface even though nothing leaves the browser.
- **Stats — deep-tail p-values no longer underflow to 0.** New `normsf(x)` (A&S polynomial below |x|=7, asymptotic series above) plus log-space final exponentiation in `betai` / `gammainc`, plus `tcdf_upper` / `fcdf_upper` / `betai_upper` upper-tail helpers wired into every test that subtracted near-1 floats.
- **Stats — Tukey HSD / Games-Howell p-values now tail-accurate.** New `_wprob_upper(w, k)` + `ptukey_upper(q, k, df)` using a non-cancelling identity; results stay accurate to ~1e-300.
- **Stats — `_wprob_upper` now adapts its integration window to the peak at u = −w/2.** Fixed `[-8, 8]` GL window missed the peak entirely for `w > ~16`; now centres the 48-node rule on the peak.
- **Numeric detection — Unicode minus / dashes / non-breaking spaces accepted, `1e999` / leading-zero IDs rejected.** New `normalizeNumericString` + `toNumericValue`; `isNumericValue` adds a leading-zero reject and a `Number.isFinite` guard. 8 regression tests.
- **Venn long-format detection — stricter heuristic.** Four combined signals replace the prior `>= 4 rows + 2 distinct + at-least-one-repeat` rule that false-positived on dup wide files and false-negatived on 3-row long-format. New `tests/venn.test.js`.
- **`autoDetectSep` — quote-aware, consistency-ranked separator detection.** TSVs whose headers had commas in free text no longer flip to comma-detection; CV per line ranks candidates so noise separators lose to real delimiters.
- **Aequorin — auto-rescaling Y-axis no longer silently overrides a manually set range.** New `autoYRange: true` pref + `Auto` button next to `Y min` / `Y max`. Manual edits flip auto-Y off.
- **Aequorin — calibration defaults now carry provenance + snapshot regression tests.** Allen & Blinks 1978 / Knight 1991 / Plieth 2006 citations in code; 4 regression tests pin the constants and per-formula outputs.
- **Aequorin — local parse-message state renamed `parseMessage`.** Distinct name surfaces any future misroute through the shell's red-only `parseError` API as a linter error rather than a silent UX bug.
- **Boxplot — facet / subgroup mode transitions clear the keyed annotation & summary dicts.** Closes a memory accumulator; reducer extracted into a sibling for unit-test coverage.
- **FileDropZone — file-read errors surface to the UI; `Reading file…` state shown during the async read.** `reader.onerror` was never wired.
- **Shared `_shell/chart-layout.ts` lifts `buildLineD` + `CHART_MARGIN` out of per-tool helpers.** Re-exported from each tool's `helpers.ts` barrel for back-compat.
- **Fuzz harnesses for scatter and lineplot now use the real helpers.** Eliminates drift between fuzz-mirrored math and production.
- **Dev `npm run watch` rebuilds `shared.bundle.js` on shared-file edits.** New `scripts/watch.js` wrapper supervises esbuild + the shared-bundle watcher.

## [1.0.0] - 2026-04-22

> Long-form release notes: [`docs/release-notes/v1.0.0.md`](docs/release-notes/v1.0.0.md).

First release under the Plöttr name. Supersedes the `dataviz` lineage (v0.4.0 – v0.10.0 below). No code regressions — the `1.0.0` bump marks the rename and stable public surface.

### Added

- **UpSet plot — On/Off toggles to hide intersection-size and set-size bar labels.** Cosmetic option for posters / slides where the numbers on top of bars are noise. Threaded through `VIS_INIT_UPSET` so auto-prefs persist; defaults to On.

### Changed

- **Project renamed from `dataviz` to `Plöttr`.** New brand, new repo (`evompmi/plottr`), new live URL. Every `localStorage` key and cross-tab event name kept on the legacy `dataviz-…` prefix so existing users' theme + per-tool auto-prefs survive the move.
- **Step nav redesigned as a classic horizontal stepper.** 36-px numbered circles connected by a progress line replace the pill-style buttons + chevron separators. Past steps show an SVG checkmark, current shows its number on the active fill, reachable-but-unvisited use a moss outline.
- **Moss accent propagated from the stepper to download chips and stats greens.** New `--step-ready` family (with `-bg` / `-border` siblings) retargets `.dv-btn-dl` and stats-panel "significant / achieved" accents away from the generic `--success-*` family.
- **UpSet Configure step — intersection-cutoff Min/Max use the canonical `−`/`+` stepper.** Replaces the bare `<input type="number">` so the chrome matches every other numeric input.
- **Venn → UpSet handoff now preserves the long-format signal.** Hand-off payload's `format` field follows `isLongFormat`, so UpSet's existing long-format branch fires correctly.
- **UpSet Configure step — "Sets to include" checkboxes themed to the CTA accent.** Closes a drift from the browser-default blue accent.
- **Venn upload — long-format CSVs are now detected and pivoted instead of silently parsed as 2-set wide.** Detection: 2 columns + ≥ 4 non-empty rows in column 2 with at least one repeat. Pivots via `parseLongFormatSets` so the 4+ sets UpSet nudge fires correctly.
- **Venn upload step — UpSet nudge is now persistent, promoted to a pill CTA, set-picker checkboxes themed.** Banner copy tightened to state the structural limit; CTA moved to its own `--cta-primary-bg` pill; dismiss button removed (the limitation is structural, not preference).
- **Venn Configure step — set-picker tile now leads, data preview trails.** Matches the upset / boxplot / aequorin reorder so the decision tile sits above the already-seen preview.

### Removed

- **Plot-tool page-header subtitles removed.** Every tool's one-line subtitle under the title duplicated the landing-page tile description; dropped from `PageHeader` and the seven plot-tool call sites.
- **Heatmap detail view — "Cluster n° X (rows/cols)" pill removed.** The highlighted main-plot selection conveys the same info; export filenames still carry the `_clusterN` suffix.
- **HowToCard disclosure chevron enlarged.** The 14-px `›` glyph replaced with a 22×22 SVG chevron, matching the stepper's SVG checkmark.

## [0.10.0] - 2026-04-22

> Long-form release notes: [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

### Changed

- **Step nav — chevron between each step button signals when the next step becomes reachable.** A `❯` glyph between buttons turns green (`--step-ready`) only when pointing forward to a reachable-but-unvisited step; reachable buttons gain a green halo. Past chevrons stay neutral so the "this way forward" cue is unambiguous.
- **All plot tools — page header compacted: step buttons inline next to the tool name.** `PageHeader` gains a `middle` slot so the row reads `[icon + title] | [step buttons] | [PrefsPanel]` with bar separators, reclaiming ~60 px of vertical space above step content.
- **All plot tools — "Visual plot settings" button now only appears on the Plot step.** Hidden during Upload / Configure / Filter / Output where there's nothing plot-related to save.
- **All plot tools — 120 ms opacity fade on step transitions.** New `StepFade` wrapper smooths the swap; respects `prefers-reduced-motion: reduce`.
- **Upload step — separator-gate caption "Required before loading a file" removed.** The disabled drop-zone placeholder already conveyed the same gate.
- **Upload step — M-tier polish pass (collapsible "How to use" card, pill-chip example button).** Tallest block on step 1 collapses behind a new shared `HowToCard` primitive with `localStorage`-persisted state. Example-data link restyled as a `dv-btn dv-btn-secondary` pill with a "Try sample data:" prefix.
- **Upload step — S-tier polish pass (microcopy, accessibility, token hygiene).** Eleven small fixes from the upload-page UI audit: terser microcopy, real `<label>` bindings, keyboard-reachable `FileDropZone`, decorative emojis aria-hidden, status / alert roles on banners, new `--accent-primary-weak` token so drag-over backgrounds stay visible in dark mode.
- **UpSet + Boxplot — Configure step reordered so the data preview is the last tile.** Matches Aequorin's pattern; the user's eye lands on the decision tile instead of on rows already seen during upload.

### Removed

- **All plot tools — bottom-of-step "Next →" / "← Back" navigation buttons removed.** Top-nav chevron + green-outline cue makes them redundant. 11 buttons removed across the seven tools; UpSet's degree-cutoff state lifted to App so the top-nav commit path honours pending edits. Two error-recovery / mode-switch buttons retained.

## [0.9.1] - 2026-04-21

> Long-form release notes: [`docs/release-notes/v0.9.1.md`](docs/release-notes/v0.9.1.md).

### Changed

- **Internal — shared `_shell/PlotSidebar.tsx` component replaces seven copies of the sidebar frame.** All seven plot tools rendered the same sidebar wrapper inline; lifted into a `_shell` component with `sticky` / `width` props so heatmap's variant is expressible without duplication.
- **Internal — Heatmap `.tsx` folder-split into six sibling modules.** Last of the "three biggest tools" the architectural review flagged. Same cohesion-keyed pattern as boxplot / aequorin; no user-visible change.
- **Internal — Aequorin `.tsx` folder-split into seven sibling modules.** Second-largest tool file split into `chart` / `stats-panel` / `reports` / `plot-area` / `steps` / `controls` / `index` siblings. Completes the per-tool folder-split for the three biggest tools.

### Added

- **Internal — dedicated unit-test files for scatter, heatmap, aequorin, and lineplot pure helpers.** Four tools had only fuzz coverage on their `helpers.ts`, where sign-flips or off-by-ones could pass unchanged. Added 74 new numerical-correctness tests (676 → 750).

## [0.9.0] - 2026-04-21

> Long-form release notes: [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

### Added

- **Heatmap tool — new browser-only matrix visualisation.** Hierarchical clustering on rows / columns (Euclidean / Manhattan / 1 − Pearson × average / complete / single linkage) and k-means (Lloyd / k-means++ with deterministic seeds, 2 ≤ k ≤ 20). Twelve palettes (viridis / plasma / magma / inferno / cividis / RdBu / bwr / RdYlBu / reds / blues / greens / spectral) with invert toggle. Normalisation modes (none / Z by row / Z by col / log₂(x+1)) auto-suggest the RdBu diverging palette when active. Interactive selection (drag / dendrogram-click / k-means-band-click) drives a linked detail panel with pruned dendrogram + cluster-strip carry-over. CSV / SVG / PNG / runnable `pheatmap` R-script export with cluster-id columns and `_clusterN` filename suffixes. Ships with a deterministic 500-gene × 6-sample example.
- **UpSet plot tool — new browser-only set-intersection visualisation for 4+ sets.** Top intersection-size bar chart + matrix + left set-size bars; sort modes (size / degree / set-order); filters (min intersection size, min/max degree window); selection → item list panel; per-region + bulk "All regions" CSV downloads with stable `I#` filename ids; on-plot column-id lane + legend; horizontal scrollability affordances (edge fades + "Scroll for more →" pill). Venn → UpSet hand-off via `postMessage` so a 4+ sets dataset arrives pre-loaded.
- **Persisted visual prefs across every plot tool.** Auto-persist to `localStorage` (debounced) plus a portable `<tool>-settings.json` Save / Load file with tool-name validation, defensive type checks, and unknown-key drop. Plot/axis labels excluded from auto-persist (dataset-specific) but round-trip through Save / Load. Controls collapsed behind a single gear-icon popover in `PageHeader` with `aria-haspopup="menu"`, outside-click + `Escape` close.
- **Shared `_shell/` plot-tool scaffold.** `usePlotToolState.ts` + `PlotToolShell.tsx` + `ScrollablePlotCard.tsx` lift ~22% boilerplate (step state, upload/parse fields, `vis` reducer with auto-prefs persistence, page-frame chrome) out of every plot tool.
- **Pre-commit hook rebuilds + re-stages drifted compiled outputs.** Native git hook (no husky) installed via `prepare`; bypass with `--no-verify`.
- **Per-tool fuzz harnesses for boxplot / scatter / aequorin / lineplot / venn (heatmap + upset already had them).** Each one feeds the shared pathological-input corpus through the tool's full pure-function pipeline and asserts shape invariants. Wired into `package.json` as `fuzz:<tool>`; default 2 × 1000 iterations; configurable via `FUZZ_SEED` / `FUZZ_N` / `FUZZ_QUIET`.
- **Cell-tooltip + interactive selection + linked detail panel for the heatmap.** Brush / dendrogram / k-means-band click; spotlight-mask highlight (no SVG strokes); side-by-side main + detail tile + full-width selection-data preview; pruned-subtree dendrogram + k-means-strip carry-over to the detail.
- **Heatmap k-means + cluster-id labels + cluster-keyed downloads.** `Cluster n° N` halo labels on the main + detail plots; cluster-keyed `_clusterN` SVG / PNG / CSV filenames; main-CSV gains a `cluster` column when row k-means is active.
- **Heatmap UI polish.** "Drag to zoom" hint, sidebar tiles collapsible, k-means k & seed `NumberInput`s span full tile width, three-state cluster-mode control, deterministic 500-gene example, dendrogram stroke-width preset for the detail tile, "show row / column names" toggles, k-means inter-cluster gap, palette invert + caching fix, plot-tile header reorganisation.
- **Venn — circle outline toggle, one-click "Regions" download, 4+ column picker.** Outline On/Off in Display sidebar; `⬇ Regions` emits one CSV per non-empty region (staggered firing); files with > 3 columns now accepted with a Configure-step picker.
- **UpSet UX polish.** Configure-step cutoff gate (> 8 sets), pre-plot degree-window cutoff, "Clear selection" plot-tile button, sidebar tiles collapsible, monochrome plot + sidebar simplification, dataset-adaptive `min size` ceiling, axis ticks evenly spaced + ≥ data max.
- **Multi-set intersection significance test (SuperExactTest-style).** Phase 1 lands `multisetIntersectionPExact` / `multisetIntersectionPPoisson` / `multisetIntersectionP` in `stats.js` cross-validated against R's `SuperExactTest::cpsets`; Phase 2 wires it up in UpSet as click-to-compute, then sidebar batch-compute, then on-plot stars / `p=…` markers, then green / red bar colouring with two-sided BH adjustment so depletion is no longer invisible.
- **Benchmark — clustering primitives cross-validated against R.** `pairwiseDistance` (Euclidean / Manhattan / 1 − Pearson) and `hclust` merge-heights (5 distance × linkage combos) on a fixed-seed 100 × 15 Gaussian matrix; comparison done on sorted vectors so tie-handling differences don't spuriously fail.
- **Actions panel — every download chip carries a descriptive `title` tooltip.**

### Changed

- **Boxplot, aequorin, heatmap, venn `.tsx` folder-splits.** Helpers extracted to `tools/<tool>/helpers.ts` (and for boxplot, full folder-split into 7 cohesion-keyed sibling modules); test loaders rewritten to read `helpers.ts` via esbuild CJS transform — no more brittle slice-cutoff. Venn helpers split a second time in v0.9.0 into six cohesion-keyed modules. Lineplot / scatter / upset helpers extracted in the same pattern.
- **Per-tool stats-routing duplication consolidated to `tools/_shell/stats-dispatch.ts`.** Boxplot / lineplot / aequorin had near-identical copies that were starting to drift; now one shared TypeScript module with 20 dispatcher tests.
- **Shared browser scripts concatenated into a single `tools/shared.bundle.js`.** Every tool HTML now loads exactly one `<script>`; canonical load order lives in the `FILES` array of `scripts/build-shared.js`. `prebuild` / `prewatch` / `pretest` keep it fresh.
- **Primary chrome accent retuned to slate-700 / slate-500-600-700 (light / dark) — near-greyscale, editorial.** Functional tokens (chart palettes, DNA / molarity purple, warning amber, plot teal, success / danger families, size / shape selectors) deliberately untouched. Dark-mode accents now consistently equal or dimmer than light.
- **Disclosure indicator redesigned: neutral circle, crisp SVG chevron via `mask-image`.** `--neutral-bg` / `--neutral-text`, 200ms `cubic-bezier(0.4, 0, 0.2, 1)` rotate.
- **Sidebar disclosure auto-scroll unified into `scrollDisclosureIntoView` (works in scroll-container _and_ page-scroll layouts).** 40 px trailing clearance so the next header sits comfortably inside the viewport. Covers boxplot / lineplot / aequorin / scatter / heatmap.
- **Render-perf — three memoization wins.** Boxplot KDE caching (per-render `WeakMap` keyed on the group's `allValues` reference) so violin / raincloud render once per data shape; heatmap cells `useMemo` so a 100 × 100 grid re-renders only when data / geometry / colour scale change; `React.memo` on `SliderControl` with a comparator that ignores the inline-arrow `onChange` prop.
- **UpSet sidebar / plot-frame polish.** Sidebar tiles collapsible, filter slider labels spelled in full, set-size axis tick gap nudged, "Set size" caption gap nudged, set-size axis line + tick marks added, left margin bumped so labels don't clip, horizontal-scroll wide plots, monochrome plot, dropped top-panel gridlines, dropped the floating top panel border.
- **Heatmap layout polish.** Plot-tile headers reorganised; redundant "Detail — N rows × M cols" caption dropped; default "Detail" title fallback dropped; redundant detail-tile "Clear" button dropped; main + zoomed detail plot now sit side-by-side with the selection-data preview spanning full width beneath; pruned hierarchical dendrograms carry over to the detail; k-means cluster colour strip carries over to the detail.
- **Heatmap k-means k ceiling raised 10 → 20.**
- **Scatter sidebar — collapsible tiles, "Reference line" renamed + repositioned, filename header dropped.**
- **Settings gear button bumped to 40 × 40 px** so it matches the theme toggle.
- **Aequorin chrome retunes.** Sample-selection pill amber softened to a warning-bg wash; Pool-by-name / Individual selector promoted out of the popover into a top-right `SERIES` pill matching `LAYOUT`; Series pill switched from DNA purple to the shared slate accent; Σ Baseline-corrected toggle aligned to the slate accent.
- **Venn → UpSet nudge now hands the current dataset off** instead of opening UpSet on stale data.
- **`ColorInput` no longer auto-expands typed `#abc` to `#aabbcc` mid-keystroke.**
- **SVG export — id grouping consistency pass across all plot tools.** Scatter background promoted to a `<g>`; heatmap subtitle pulled out of `<g id="title">` into its own sibling; CLAUDE.md's "Conventional ids" list extended.
- **`--on-accent-muted` theme variable** deduplicates the white-at-75% used in five "How to use" subtitle lines.
- **Stats-tile checkboxes use the slate `accentColor`** matching the rest of the chrome.
- **Lineplot Configure-step `Plot →` button moved to the bottom of the panel and uses `dv-btn-primary`** (was top-right teal `dv-btn-plot`); Boxplot Filter / Output step nav buttons aligned to the same convention.
- **Landing page Plots row regrouped by chart family.** X-vs-Y / group plots first, then set-membership tools, then heatmap.

### Fixed

- **UpSet — column-id rotation threshold is now width-aware** (`shouldRotateColumnIds(nCols, colW, idFontSize)`), not a magic `nCols > 10` cutoff.
- **UpSet — column identifiers tilt 90° once horizontal labels collide.**
- **Venn + UpSet — top "Plot" nav tab now respects pending set selection in Configure step.** Both tools' `navigateStep` wrapper commits `pendingSelection` before calling `setStep`; `canNavigate` gates on the pending set while in Configure.
- **UpSet — bulk downloads now track the rendered plot 1:1.** Re-pointed at `truncatedIntersections` so `⬇ All regions` / `⬇ Table` / `⬇ Items` honour the same sort + filters the chart uses.
- **UpSet — many SVG / layout fixes.** Y-axis label no longer collides with tick numbers at max font size; matrix zebra stripes shrink with filters; set names no longer collide with set-size bars at max font size; matrix click-capture rect no longer renders as a black block in some viewers; horizontal-scroll fade overlays dim with the plot card in dark mode; bars reach full panel length at the max value.
- **Heatmap clustering — `hclust` no longer drops leaves when the distance matrix is all-NaN.** Force-merges the two lowest-index active clusters at a sentinel height so the returned tree always covers every leaf.
- **Heatmap — detail (zoomed) plot respects the column k-means inter-cluster gap and lines up with the main plot.** New `colGapStartPx` / `rowGapStartPx` props + authoritative `basePlotW` / `basePlotH`.
- **Heatmap SVG export — exported files no longer render as a solid black canvas in Inkscape.** Switched every `fill="transparent"` to `fill="none" pointerEvents="all"`; `serializeSvgForExport` strips root `<svg>` inline `style` and the redundant `shape-rendering="crispEdges"` on the cells group.
- **Scatter regression — R² no longer silently reports 1.0 when Y has zero variance.** Returns `NaN`, formatted as "undefined".
- **Scatter — reference-line color picker no longer shows a broken `var(--danger-text)` value.** Replaced with the hex literal `#dc2626`.
- **Aequorin — error banner colours theme correctly in dark mode.** Hardcoded hex tokens swapped for `--warning-text` / `--danger-text`.
- **Aequorin — duplicate legend removed** from the combined trace plot (HTML legend leftover from before the SVG legend was wired up).
- **Group Plot — composition-pies header uses `--accent-warning`** instead of an off-palette burnt orange.
- **Group Plot — no longer renders garbled overlays after toggling a condition back on.** React keys now combine positional index + group name across every chart-level element so siblings are unique even when display labels collide.
- **Power Analysis curve fills the plot card** with `height: 100%` + `preserveAspectRatio="xMidYMid meet"`.
- **Venn diagram no longer collides with title and legend.** `fitCirclesToViewport` uses asymmetric reserves (`marginTop ≥ 40`, `marginBottom ≥ legendRows × 22 + 20`).
- **Landing page now scrolls when the tile grid exceeds the viewport.** Body relaxed to `min-height: 100vh`.
- **Dark-mode stats-table row highlight now clearly visible.** `--row-hover-bg` brightened to `#3d52a8`.
- **Venn intersection table — selected row + hover state aligned with the shared stats-table pattern.**
- **Removed unused `puppeteer-core` devDependency.** Drops 75 packages from `node_modules`.

### Removed

- **UpSet — dropped the "Top N" slider.** Min size + Min degree already express the two filters that actually matter, and the slider's interaction with sort mode was confusing.
- **UpSet — dropped the faint border around the top intersection-size panel.**
- **Venn — redundant "← Configure" back-button removed from the Plot step.** Step nav handles it.

## [0.8.0] - 2026-04-18

> Long-form release notes: [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

### Added

- **Line Plot tool — new profile plot for long-format `(x, y, group)` data.** Mean ± error per group at each shared x; per-x test routing with BH adjustment across the x-axis; aggregate ↓ TXT / ↓ R; row-expand-to-detail with per-x test override and power analysis.
- **Dark mode** across the landing page and every tool. Sun/moon toggle, follows `prefers-color-scheme` on first visit, persists in `localStorage`, syncs across iframes. Plot cards stay white so exports render identically in any reader.
- **Horizontal orientation for Group Plot.** Flips all four plot styles to groups-on-y; annotations, grids, and pies rotate to match.
- **Subgroup-by for Group Plot.** Dashed dividers + independent stats per subgroup. Mutually exclusive with faceting (relaxed in v1.0.2).
- **R-script export from the Statistics tile and from the Power Analysis result card.** Closes the no-reproducibility-trail gap called out in the README.
- **Component CSS classes (`tools/components.css`)** — `dv-panel`, `dv-input`, `dv-label`, `dv-select`, `dv-btn-*`, `dv-num` with proper `:hover` / `:focus-visible` / `:disabled` states. Plus `−`/`+` numeric steppers replacing native browser arrows.
- **Logarithmic value axis for Group Plot.** Linear / Log₁₀ / Log₂ / Ln. Visual-only; stats run on raw data; zero/negative clamped with a warning.
- **Named SVG group ids for Inkscape.** Chart exports wrap elements in `<g id="…">` groups (`background`, `grid`, `axis-x`, `data-points`, `legend`, `cld-annotations`, …).
- **Export filenames carry the uploaded file's name.** `analysis1.csv` → `analysis1_groupplot.svg`. Faceted exports append the facet category.
- **Group Plot bar charts gain "None" + 95% CI error-bar options.** SEM / SD / 95% CI / None matching Aequorin; CI uses `tinv(0.975, n−1) · SEM`. Surfaces SEM + 95% CI columns in stats tables, TXT exports, and R-script descriptive blocks.
- **Error-bar type called out in the on-plot stats summary for barplots.**
- **Group Plot configure step requires group + value columns.** Filter & Rename disabled with a warning banner when either role is missing.
- **Bar outline controls** unified across Group Plot bar style and Aequorin inset barplot.

### Changed

- **Group Plot + Aequorin stats panels redesigned as a single unified summary table.** One row per facet / subgroup / aequorin set; expand inline for Groups / Assumptions / Test / Post-hoc / Power; aggregate ↓ TXT / ↓ R replace the old per-tile pairs. Per-row test override + "Use recommendation" affordance.
- **"Print summary below plot" is now a lean four-line recap.** Normality / Equal variance / Test / Post-hoc — full detail moves to the ↓ TXT / ↓ R downloads.
- **Per-facet / per-subgroup / per-x stats downloads split into separate files.** `<stem>_<slug>_stats.txt` / `.R` per set when more than one is eligible; staggered firing.
- **Stats-panel row hover uses a navy tint.** New `--row-hover-bg` token (light + dark) replacing the near-identical `--surface-sunken`.
- **Group Plot stats panel preferences persist across flat / subgroup / facet switches.** Lifted to App so panel re-mounts don't reset Display on plot / Show ns / Print summary toggles.
- **Subgroup summary below plot left-aligned under each subgroup band.** `textAnchor="start"` per subgroup so wide summaries don't overflow into neighbours.
- **Aequorin plot-page control panel restructured.** Axes / Labels / Style / Summary barplot regrouping; collapsible sections; X/Y inputs paired; debug column-grouping block removed.
- **Plot tools reflow on narrow viewports.** Dropped the `min-width: 1100px` floor from boxplot / aequorin / scatter / venn (later put back in v0.10.0 for plot tools — now a desktop-first design rule).
- **Toolbar icon buttons 32 × 32 → 40 × 40 px** with clearer focus rings; topbar height 46 → 50 px; landing page follows `prefers-color-scheme` on first visit.
- **Bar chart merged into `BoxplotChart`** — the standalone `BarChart` (~400 lines) becomes a `plotStyle === "bar"` branch sharing legend, annotation, and facet pipelines.
- Plus: scatter regression Label-position mini icons, segmented-toggle migration across scatter / venn / aequorin / power / molarity, `.dv-seg` / `.dv-seg-btn` extraction in `components.css`, lineplot axis-input rounding (2 decimals, step 0.1), internal stats-state cleanup (`statsUi` reducer), `renderSubgroupSummaries` extraction, aequorin setter-pattern simplification.

### Fixed

- **Bar-chart whisker overrun and missing end-caps under clipping.** Auto-y no longer extends to negative whiskers; whiskers clip to `[yMin, yMax]` in data-space and drop the end-cap on a clipped end (matplotlib `coord_cartesian` convention).
- **Boxplot stats-panel race conditions across flat / subgroup / facet mode switches.** Stable `key`s on each call site force fresh mounts; toggle-off paths now wipe every key in the keyed dicts; `App`-level `useEffect` reset of summaries on column change is removed (turned out to be unnecessary and was racing against `onSummaryForKey`).
- **`tinv` rewritten** — closed forms for df ≤ 2, Newton-Raphson + Cornish-Fisher seeding for df ≥ 3. Matches R's `qt()` to machine precision; the old pure-bisection `[-50, 50]` bracket silently clamped at extreme quantiles.
- **Zero-variance guards across stats** — `tTest`, `tukeyHSD`, `gamesHowell`, `oneWayANOVA`, `welchANOVA`, `leveneTest`, `cohenD`, `hedgesG` now return a populated `error` field instead of silently emitting NaN/Infinity.
- **`hedgesG` exact gamma-ratio bias correction.** Replaces the asymptotic shortcut; matches R's `effectsize::hedges_g()` at small n.
- **`sampleVariance` → Welford one-pass; `chi2inv` → Newton-Raphson** with Wilson-Hilferty seeding.
- **`compactLetterDisplay` and `kruskalWallis` degenerate-input guards.** CLD skips NaN pairs; KW all-tied case returns NaN + error instead of misleading `H = 0, p = 1`.
- **Root-finder bracket expansion in `bisect`, `qtukey`, `powerAnova`.** Fixed brackets were silently clamping to stale endpoints.
- Plus: dark-mode Σ Baseline pill dimmed, aequorin Y auto-rescale rounded to 2 decimals, scatter regression default uses a hex literal (CSS vars leaked into SVG), aequorin inset CLD-letter wiring fix, Group Plot enforces one `value` column, dark-mode chrome dim fixes across molarity / disclosure / Σ pills / `.dv-btn-primary` / power / aequorin Combined-Faceted toggle.

## [0.7.1] - 2026-04-13

> Long-form release notes: [`docs/release-notes/v0.7.1.md`](docs/release-notes/v0.7.1.md).

### Fixed

- **StatsTile test assertions** updated from `el.type === "div"` to `"Fragment"` after the component switched to returning a fragment.
- **Prettier formatting** reformatted files flagged by `format:check` in CI.

## [0.7.0] - 2026-04-13

> Long-form release notes: [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md).

### Added

- **Bar gap control in Group Plot bar style** and bar-width + gap controls in the Aequorin inset barplot.
- **Show ns toggle for bracket annotations.** Hides non-significant brackets when on-plot brackets are selected.

### Changed

- **StatsTile split into two tiles.** "Statistics display" (non-collapsible) for on-plot controls; "Statistics summary" (collapsible) for assumptions / test / post-hoc / power / TXT report.
- **Stats-summary SVG print is now opt-in.** Separate "Print summary below plot" checkbox, unchecked by default, so post-hoc tables don't eat plot space.
- **Dark-mode chrome themed.** Plot cards dim via `filter: brightness(0.85)` (render-only); scatter selectors, "How to use" tiles, and the step-nav active pill gain dedicated CSS variables.
- **Tool top bar redesigned as an icon strip** (theme-toggle │ home │ other tools); current tool's icon omitted as the you-are-here marker.
- **Unified download chip style** (single green `⬇ SVG / PNG / CSV / TXT`) and prominent accent disclosure indicator across all tools.
- **Plot-page control panels share a 279 px width.** Group Plot, Aequorin, Scatter, Power normalised to one number.
- **Plot frame exported as four named lines** so sides can be deleted individually in Inkscape.
- **Venn layout refinement.** Iterative circle-position refinement + a Readability slider that blends strict proportionality and balanced layout.
- **Group Plot stats run per facet.** Each facet gets its own `StatsTile`, annotations, and TXT download. Stats files renamed for context (`groupplot_<category>_stats.txt`).
- **Group Plot rename panel — every group/filter column is reorderable.** Drag handles + per-column orderings preserved when a column becomes primary group or facet.
- **Group Plot enforces a single `group` column.** Selecting `group` demotes the previous holder to `filter`.
- **Aequorin inset barplot tile** gains a three-state model (hidden / expanded / minimised); per-replicate table moves to its own collapsible tile; Combined/Faceted toggle sits as a quiet segmented toggle.
- Plus: scatter grid off by default; "Show ns" off by default; power tool no longer rearranges on narrow viewports; landing-page theme toggle aligned with the rightmost tile; inward-whisker math fix.

### Removed

- **"← Calibration" back button** above Aequorin's plot area (redundant with step navigation).
- **Duplicate theme toggle** inside tool `PageHeader`s — top-bar toggle is the single source of truth.

### Fixed

- **Aequorin plot tiles stayed bright white in dark mode.** Outer `ChartTile` / `IntegralTile` now use themed `--surface` / `--border-strong`.
- **Aequorin Combined/Faceted toggle not responding to clicks.** Sticky Sample-selection row was eating clicks; added `width: fit-content`.
- **Aequorin condition rename lag + stale chart.** Split heavy numeric memos from label merges so edits skip the full recompute; added `label` to the `series` memo dep signature.
- **Group Plot facet re-render storm.** Extracted a memoised `FacetTrio` so each facet only re-renders on its own input changes.
- **Group Plot facet radio buttons flickered across facets.** Per-facet `StatsTile`s shared a hardcoded `name`; now generated via `React.useId()`.
- **Venn exports rendered as black blobs in Inkscape.** Click-hit circles used `fill="transparent"` (HTML/CSS-only). Swapped to `fill="none" pointer-events="all"`.
- Plus: aequorin sample-selector empty-state, Venn region click target, on-plot annotation ink, bar-style "Color by" point colours, benchmark page theme sync, power-tool premature horizontal scrollbar, top-bar theme toggle iframe sync via `postMessage`, dark-mode nested-`.dv-plot-card` over-dim.

## [0.6.0] - 2026-04-12

> Long-form release notes: [`docs/release-notes/v0.6.0.md`](docs/release-notes/v0.6.0.md).

### Added

- **`tools/stats.js`** — new plain-JS module: distributions, descriptive helpers, normality / equal-variance tests, two-sample and k-sample tests, effect sizes, post-hocs, CLD, and `selectTest` for auto-picking. Benchmarked against R at ±5×10⁻³.
- **`StatsTile` in boxplot and aequorin** — assumption checks → recommended test → post-hocs → on-plot CLD / brackets → embedded summary block in exports. Hidden for k < 2 or faceted views.
- **Statistical benchmark vs R.** `benchmark/run-r.R` + `benchmark/run.js` produce `benchmark.html`; 285 comparisons, max |Δ| ≈ 8.2×10⁻⁷.
- **Landing page benchmark link.** Replaces the Twain quote with a live test count.
- **Load example dataset links** in bargraph + boxplot upload panels (seeded Arabidopsis 3 × 3 × 8 long format) and aequorin (CO7 elicitor time-course).
- **Aequorin jitter points** — optional jittered overlay on the integral barplot.

### Changed

- **StatsTile gains a Power analysis section.** Observed effect size, achieved power at α = 0.05, and required n to reach 80 %. Rank tests estimated from parametric analogs, flagged as approximations.
- **StatsTile gains a "Download report" button** — plain-text TXT export with descriptives, assumptions, chosen test, post-hoc pairs.
- **Stats summary embedded in SVG.** Grey monospace block below the legend, included in SVG/PNG exports.
- **Aequorin plot page restructured.** Collapsible time-course tile + single Integral tile with a Raw / Baseline-corrected toggle and per-replicate CSV. Replaces the dual-barplot layout.
- **Merged bargraph into Group Plot.** Box / violin / raincloud / bar picked from one dropdown; `bargraph.html` becomes a redirect shim.
- **Tool pages have `min-width: 1100px`.** Narrow viewports get a horizontal scrollbar instead of broken layout.
- **Calculator tool mobile-friendly.** Removes the 1100 px floor and stacks vertically below 600 px.
- **Power primitives moved into `stats.js`.** Single home for all numeric code.
- Plus: StatsTile assumption captions clarified, bargraph CSV/style polish, power table shows α = 0.05 / 0.01 / 0.001, brackets show all pairs with non-significant labelled "ns".

### Removed

- **Bargraph remnants.** `bargraph.tsx`, `bargraph.html`, the `bargraph` icon, `?style=bar` URL handling. Merge into Group Plot complete.

### Fixed

- **Power tool ANOVA n-solver jumped to 100000 for large effect sizes at k ≥ 6.** Root cause: `ncf_sf` truncating its Poisson mixture at a fixed ±500-step window. Widens to ±8σ with early exit and a normal-approx short-circuit for λ > 1000.
- **`gammainc` silently wrong at large `a`.** Series loop's fixed 200-iter cap insufficient at a ≈ 10000. Scaled the cap with √a; propagated into `chi2cdf` and large-df F-tails.
- **`ncchi2cdf` truncated Poisson mixture.** Same fix as `ncf_sf`.
- Plus: missing `BracketPair.pAdj` type, unused `maxW` / `insetStrokeColors`, missing filter-panel checkboxes for numeric `filter` / `text` columns, calculator mobile scrolling.

## [0.5.1] - 2026-04-11

> Long-form release notes: [`docs/release-notes/v0.5.1.md`](docs/release-notes/v0.5.1.md).

### Added

- **Landing page shows real git version.** Derived from `git describe --tags` via a build-time script writing `tools/version.js`.

### Fixed

- **`kde()` mean-in-reduce bug.** Precompute the mean before the variance reduce; bandwidth selection was O(n²) and violin/raincloud on ~10k points hung for seconds. Output unchanged.

## [0.5.0] - 2026-04-11

> Long-form release notes: [`docs/release-notes/v0.5.0.md`](docs/release-notes/v0.5.0.md).

### Added

- **Source maps** alongside compiled `tools/*.js` for debuggable stack traces.
- **`CHANGELOG.md`** following Keep a Changelog.
- **Error boundary around every tool's root `<App />`.** Readable fallback with copyable technical details and a reload button, replacing the blank-screen crash mode.

### Changed

- **CI and deploy run on Node.js 22.** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` opt-in ahead of GitHub's June 2026 Node 20 deprecation.
- **`ColorInput` accepts 3-digit hex.** `#abc` → `#aabbcc`, normalised to lowercase 6-digit.
- **README trimmed** to a single overview table; per-tool walkthroughs live in each tool's How-to panel.

## [0.4.0] - 2026-04-11

> Long-form release notes: [`docs/release-notes/v0.4.0.md`](docs/release-notes/v0.4.0.md).

First tracked release. Baseline of features shipped to GitHub Pages prior to the introduction of this changelog.

### Added

- **Six browser-only tools.** Aequorin, Boxplot, Bargraph, Scatter, Venn, plus the Molarity and Power calculators.
- **Landing page + iframe-loaded tools.** Vendor prefetch progress bar; SVG / PNG / CSV export everywhere.
- **Shared scaffolding.** `tools/shared.js` utilities, plain-JS React components, CSV/TSV parsing with auto-separator + decimal-comma fix.
- **CI + tooling baseline.** TypeScript typecheck, ESLint + Prettier, GitHub Actions workflow, custom test harness, minified esbuild bundles.

[Unreleased]: https://github.com/evompmi/plottr/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/evompmi/plottr/compare/v1.0.5...v1.1.0
[1.0.0]: https://github.com/evompmi/plottr/compare/v0.10.0...v1.0.0
[0.7.1]: https://github.com/evompmi/dataviz/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/evompmi/dataviz/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/evompmi/dataviz/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/evompmi/dataviz/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/evompmi/dataviz/compare/v0.4.0...v0.5.0

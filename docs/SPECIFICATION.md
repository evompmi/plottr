# Plöttr — Specification

A human-readable overview of what Plöttr is and the standards it is held to.
Developer terms are glossed in parentheses on first use so the document reads
without a programming background.

## 1. Purpose & Principles

- A browser-only data-visualization and statistics toolbox for wet-lab
  scientists — students and researchers who are not programmers.
- **Zero infrastructure:** no server, no build step at run time, no account, no
  tracking. Deployed as _static files_ (plain files a host serves unchanged,
  with no per-visitor computation) via GitHub Pages.
- **Data never leaves the browser.** All parsing, computation, and drawing
  happen _client-side_ (inside the user's own browser, not on a remote
  computer); nothing is transmitted.
- **Honest by design:** the statistical methodology and its validation are
  documented and defensible, not hidden behind a polished surface.
- Licensed **MIT** (a permissive open-source licence).

## 2. Product Surface

Ten tools served from a single _SPA_ (single-page application — the whole app
loads once and swaps views in the browser, with no full-page reloads), navigated
by the part of the address after `#`:

- **Eight plot tools:** Group Plot (box / violin / raincloud / bar), Scatter,
  Line Plot, RLU timecourse, Heatmap, Venn, UpSet, Volcano.
- **Two calculators:** statistical Power analysis, Molarity / dilution.
- Each plot tool: paste or upload data → assign each column a role → configure →
  live figure → export. Calculators are self-contained (no upload step).
- **Cross-tool hand-off:** a source tool can send its data into a destination
  tool (e.g. RLU → Group Plot), carrying the data plus an optional axis-label.

## 3. Statistics & Numerical Methodology

- **Welch by default, unconditionally.** Two groups → Welch's _t_-test; three or
  more → Welch ANOVA + Games-Howell. Plöttr does not pre-screen variance to pick
  a test (doing so inflates false-positive rates). Shapiro-Wilk and Levene are
  computed and shown as _diagnostics_ with a click-through suggestion, never as
  gatekeepers.
- **Test inventory:** Student / Welch _t_, Mann-Whitney U, one-way / Welch
  ANOVA, Kruskal-Wallis; post-hoc tests Tukey HSD, Games-Howell, Dunn (BH);
  correlations Pearson / Spearman / Kendall; effect sizes Cohen's d / d_av,
  Hedges' g, η² / ε², rank-biserial — with confidence intervals.
- **Validation:** every statistical routine is checked numerically against
  **R 4.5** (the standard statistics language; 524 comparisons on real datasets)
  and **SciPy** (Python's scientific library; 1083 comparisons on targeted
  grids), with results published to a public `benchmark.html` page.
- **Agreement tolerances are calibrated to the measured agreement, not round
  numbers** (|Δ| = the absolute difference from the reference value): statistics
  and point estimates ≤ 1e-7; noncentral-_t_ effect-size confidence intervals ≤
  1e-5; studentized-range intervals (Tukey bounds) ≤ 1e-3; p-values ≤ 1e-5 above
  0.01, and compared as a ratio (within ±10%) below 0.01.
- Changing any default-policy decision is a user-facing change and requires a
  changelog entry, a re-run of the validation, and updated explanatory text.

## 4. User Interface & Experience

- Figures are **SVG** (Scalable Vector Graphics — a resolution-independent figure
  format that stays sharp at any size). Colours and text _inside_ a figure are
  written as fixed values (e.g. colour codes like `#1a2b3c`) so an exported file
  looks identical when opened outside a browser.
- **Theming:** light / dark mode, remembered between visits, applied before the
  first paint to avoid a wrong-theme flash, and kept in sync across open tabs.
- **Export** groups figure elements under readable names so figures re-open
  cleanly in Inkscape (a free vector-graphics editor) for touch-ups.
- **Screen scope:** the calculators work on phones; the plot tools are
  desktop-first by design (they need a wide canvas) and are hidden on narrow
  screens.

## 5. Data Handling & Privacy

- Accepts **CSV / TSV** (comma- or tab-separated text — what spreadsheets
  export) with automatic separator detection, decimal-comma repair (for European
  number formats), header detection, and wide↔long table reshaping.
- **Size policy:** any place data can be brought in warns at 1 MB and refuses
  above 2 MB, with the same clear red banner everywhere.
- **Formula-injection scan:** parsed cells are checked for content crafted to run
  as a command if the file is later opened in a spreadsheet.
- The only thing stored on the user's machine is a small amount of preference
  data (theme, language) and a transient payload used for cross-tool hand-off.

## 6. TypeScript & Code Standards

(TypeScript = JavaScript with a type checker that catches whole classes of
mistakes before the code ever runs.)

- Written in modern JavaScript (2022 edition) with **strict type checking** on
  (compiler settings that reject loose or ambiguous code).
- **No escape hatches:** the user-facing code never uses `any` (TypeScript's
  "turn off checking here" type) and carries none of the comment directives that
  silence the type checker. A small, named set of deliberate type conversions is
  the only exception.
- Every component declares the typed list of inputs it accepts; shared types live
  in predictable places.
- **Automatic formatting and linting** are enforced (Prettier = a formatter that
  standardizes layout; ESLint = a checker that flags style and error patterns),
  including project-specific rules (e.g. that figure colours stay fixed values
  and chrome colours use themeable variables).

## 7. Architecture (how the code is organized)

- A small shell holds a _router_ (the part that decides which tool to show) and
  loads each tool's code **only when opened**, not all ten up front.
- **Four-tier layering, automatically enforced:** a pure computation core →
  shared UI building blocks → the individual tools → the shell. Lower layers may
  never depend on higher ones, and circular dependencies are forbidden — checked
  on every change by a dependency analyzer.
- The computation core has no hidden global side effects, so the same code
  behaves identically wherever it runs.
- Each tool follows the same folder layout (orchestrator, chart, controls,
  steps, helpers), with a few documented, intentional exceptions.

## 8. Build & Tooling

- **esbuild** (the compiler that turns the source into what browsers run) and
  **TypeScript 6**. The build splits output so each tool downloads separately.
- The compiled output is committed alongside the source so the static site
  deploys with no server build; an automatic pre-save check rebuilds anything
  that drifted.
- The displayed version number is generated from the top of the changelog (this
  avoids a race with the deploy).

## 9. Testing & Quality Assurance

- **Unit tests** (Vitest): 43 files, **1834 tests**, run against a lightweight
  in-memory browser stand-in.
- **Property-based tests** (14 suites): instead of a few fixed examples, these
  throw many randomized inputs at the code to surface edge cases.
- **Numerical cross-validation:** the R and SciPy benchmark suites above.
- **End-to-end tests** (Playwright): drive a real browser through the app like a
  user, click by click (11 scenarios).
- **Mutation testing** (Stryker): deliberately introduces bugs to confirm the
  tests actually catch them — the statistics core is swept to its practical
  ceiling.
- **Continuous-integration gates** (automated checks that must all pass before
  any change is accepted): linting, formatting, type checking, the
  layering-boundary check, a tamper-check on bundled files, the full test suite,
  the build, a check that the committed compiled output matches the source, and
  the end-to-end tests.

## 10. Security & Supply Chain

- **No third-party code runs at load time.** React (the UI library) is copied
  into the project and **integrity-pinned** (a cryptographic checksum that
  guarantees the file wasn't altered); fonts are self-hosted, with nothing
  fetched from external hosts (CDNs).
- A **Content-Security-Policy** (a browser rule limiting what the page may load
  or execute) is set on every page.
- No analytics, no usage tracking, no outbound requests at run time.

## 11. Internationalization & Accessibility

- Full **English / French** support, loaded per tool, remembered between visits,
  and synced across tabs.
- **Accessibility:** ARIA markup (extra labels that let screen readers describe
  the interface), focus handling on dialogs, and respect for the system
  "reduce motion" setting.

## 12. Versioning & Release

- **Semantic versioning** (numbers as major.minor.patch) with named releases.
  Any user-visible change is recorded in the changelog before it ships.
- Releasing: expand the long-form notes, date the version, rebuild, commit, mark
  the version (an annotated _tag_ in version control), push, and publish the
  release.

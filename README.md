# Plöttr — A browser-only data-analysis toolbox

Static web app for common plot-and-test workflows. No server, no tracking, no data leaving the browser.

**Live:** [evompmi.github.io/plottr](https://evompmi.github.io/plottr) · **Source:** [github.com/evompmi/plottr](https://github.com/evompmi/plottr)

Originally built for the "Evolution of plant-microbes interactions" team members at Toulouse Plant Sciences (University of Toulouse, France). Released publicly for anyone with similar needs.

## Design goals

- **Zero infrastructure.** Static HTML/CSS/JS. Runs from GitHub Pages, any static host, or directly off the filesystem.
- **Privacy by construction.** All parsing and computation happens in-browser. Works offline once loaded.
- **Paste-and-plot.** Each tool auto-detects separators (`,` / `\t`) and decimal convention (`,` / `.`), then walks through column roles → filter → plot → export.
- **Publication-ready output.** SVG (named `<g>` groups for Inkscape/Illustrator), PNG (2×), CSV of processed data.
- **Honest statistics.** Welch's t / Welch ANOVA + Games-Howell are the default picks (Rasch et al. 2011; Zimmerman 2004 — pre-screening with Shapiro-Wilk to choose between parametric and non-parametric is a known anti-pattern). Shapiro-Wilk and Levene are still computed and shown as diagnostics in the decision trace; the trace explains _why_ Welch is the default and how to override per-test.

## Tools

| Tool               | Purpose                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RLU timecourse** | Luminescence time-course with mean ± SD, per-replicate integrals, inline stats, and optional aequorin Ca²⁺ calibration (Allen & Blinks / Hill / Generalised).                                                                                                                                    |
| **Group Plot**     | Box / violin / raincloud / bar with Welch t / Welch ANOVA + Games-Howell as the default pick (override to Student / one-way ANOVA / Mann–Whitney / Kruskal–Wallis from the stats panel).                                                                                                         |
| **Line Plot**      | Mean ± SEM / SD / 95 % CI per group across a shared x, with per-x significance markers.                                                                                                                                                                                                          |
| **Scatter Plot**   | XY with colour / size / shape mapping, reference lines, and optional linear regression overlay.                                                                                                                                                                                                  |
| **Heatmap**        | Matrix heatmap with row / column clustering (hierarchical, k-means), dendrograms, and zoomed detail view.                                                                                                                                                                                        |
| **Venn Diagram**   | 2–3 set area-proportional Venn with click-to-extract region members.                                                                                                                                                                                                                             |
| **UpSet Plot**     | 4+ set intersection plot — top bar chart, matrix of participation dots, per-set totals. Click a column to inspect its items.                                                                                                                                                                     |
| **Volcano Plot**   | log₂FC vs −log₁₀(p) for −omics hits with three-class significance colouring, top-N labels with collision avoidance, click-to-label, search-by-name, optional colour / size aesthetic mappings, classified CSV + ggplot2 R-script export. Auto-detects DESeq2 / limma / edgeR column conventions. |
| **Power Analysis** | A-priori and post-hoc power for t (indep / paired / one-sample), one-way ANOVA, χ², correlation.                                                                                                                                                                                                 |
| **Calculator**     | Molarity, dilution (C₁V₁ = C₂V₂), ligation ratio, batch prep sheets.                                                                                                                                                                                                                             |

Each tool has an in-app **How to** panel.

## Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/aequorin.png?v=2" alt="RLU timecourse with aequorin Ca²⁺ calibration">
      <br><sub><b>RLU timecourse</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/boxplot.png?v=2" alt="Group plot with significance brackets">
      <br><sub><b>Group Plot</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/lineplot.png?v=2" alt="Line plot">
      <br><sub><b>Line Plot</b></sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/screenshot.png?v=2" alt="Scatter plot">
      <br><sub><b>Scatter Plot</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/venn.png?v=2" alt="Venn diagram">
      <br><sub><b>Venn Diagram</b></sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/upset.png?v=2" alt="UpSet plot">
      <br><sub><b>UpSet Plot</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/heatmap.png?v=2" alt="Heatmap with row + column dendrograms">
      <br><sub><b>Heatmap</b></sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/power.png?v=2" alt="Power analysis">
      <br><sub><b>Power Analysis</b></sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="docs/screenshots/volcano.png?v=2" alt="Volcano plot — log2 fold change vs −log10(p)">
      <br><sub><b>Volcano Plot</b></sub>
    </td>
  </tr>
</table>

## Statistical validation

All numerics (`tools/stats-*.js`) are cross-validated against **two independent references**:

- **R 4.5** on real built-in datasets (`iris`, `PlantGrowth`, `ToothGrowth`, `mtcars`, …). Current run: **303 comparisons, 0 failures**, plus 4 R-floor rows where R's `ptukey` saturates at ~2.2 × 10⁻¹⁵ and Plöttr's `ptukey_upper` continues the true tail past it (cross-checked against SciPy and Monte Carlo). Reproducible via `npm run benchmark`. Results render as a public page at `benchmark.html` — failing rows would be shown in red, not hidden.
- **SciPy 1.17** on synthetic targeted grids over the (df, λ) regimes the R bank only touches indirectly: `nctcdf` at deep δ, `ncf_sf` / `ncchi2cdf` at large λ across the noncentral normal-approx threshold, `qtukey` at extreme corners. **1,083 comparisons, 0 failures**, with 92 deep-tail / underflow rows (both values < 10⁻¹³, informational) and 1 pathological annotation (`qtukey` at df = 1, documented as outside the design envelope in `tools/stats-posthoc.js`). Reproducible via `npm run benchmark:scipy`.

On top of that, a deterministic test suite of **1,471 tests** (Vitest 3, CI-gated on every commit alongside ESLint, Prettier, `tsc --noEmit`, and `npm run build`) spanning unit, integration, render-smoke (real React 18 + happy-dom), and per-tool property suites (fast-check, with automatic shrinking on failure). A Playwright e2e suite (`npm run e2e`) covers paste → configure → plot golden paths per tool. Mutation testing is wired up via Stryker (`npm run mutation`) for on-demand meta-tests of whether the suite _catches_ bugs, not just whether tests pass — see [`docs/testing-2026-05-08.md`](docs/testing-2026-05-08.md).

Covers: Shapiro–Wilk, Brown–Forsythe Levene, Student / Welch t, Mann–Whitney U, one-way ANOVA, Welch ANOVA, Kruskal–Wallis, Tukey HSD (studentised range), Games–Howell, Dunn + Benjamini–Hochberg, Cohen's _d_, Hedges' _g_, η², ε², compact letter display.

## Scope and limitations

Numerics are trustworthy, but the design covers a slice of real workflows.

**Fits best:** one-way group comparisons with a defensible test pick; quick exploratory plotting from pasted CSV/TSV; privacy-sensitive data; publication-ready SVG; a-priori power analysis; reproducibility via the one-click **⬇ R** script export (Group Plot / RLU timecourse / Power Analysis emit a runnable R script that embeds the data inline and reproduces the exact tests); niche aequorin Ca²⁺ calibration not first-class anywhere else.

**You will outgrow it for:** repeated-measures / mixed models, factorial designs (no two-way ANOVA, no interactions, no ANCOVA), Dunnett's test, multiple / logistic / non-linear regression, survival / ROC / time-to-event, large datasets (browser-only, millions of rows won't work), headless batch processing. The auto-pick defaults to Welch's t / Welch ANOVA so it doesn't gate on Shapiro-Wilk; per-group SW at α = 0.05 still inflates the family-wise diagnostic flag rate at large _k_ (~23 % at k = 5 even with everything genuinely normal), but that flag is now a non-parametric _suggestion_ in the trace, not a routing decision. Tunable via `alphaNormality`.

Use as a supplement to R / Prism / SPSS, not a replacement.

## Installation

For casual use, visit [evompmi.github.io/plottr](https://evompmi.github.io/plottr).

To run offline or modify the source:

```bash
git clone https://github.com/evompmi/plottr.git
cd plottr
# Open index.html in any modern browser — no server required.
```

## Development

Node.js ≥ 20 for the tooling (not for running the app):

```bash
npm install
npm run build       # compile tools/*.tsx → tools/*.js
npm run watch       # recompile on save
npm test            # full deterministic suite (1,471 tests, Vitest 3)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run benchmark   # R + SciPy cross-validation (R 4.5, SciPy 1.17)
npm run e2e         # Playwright e2e suite
npm run mutation    # Stryker mutation testing (on demand)
```

Architecture, shared-code constraints, and conventions for adding tools are in [`CLAUDE.md`](CLAUDE.md). Versioned changes are tracked in [`CHANGELOG.md`](CHANGELOG.md); per-release long-form notes live under [`docs/release-notes/`](docs/release-notes/).

## Technical stack

React 18 (vendored under `vendor/`, no CDN) + esbuild (TSX → JS, ~5 ms incremental) + custom SVG rendering (no charting library) + in-house stats cross-validated against R 4.5 + SciPy 1.17. Tests via Vitest 3 with a thin compat shim that preserves the project's house vocabulary. Hosted on GitHub Pages as a single-page app (hash-routed; one esbuild entry point).

No runtime dependencies from external CDNs — `vendor/` ships React + ReactDOM so a cloned copy works without network access.

## Citing

If you use Plöttr in published research, cite the repository. Suggested citation:

> Plöttr — a browser-only data-analysis toolbox for wet-lab scientists. EVO team, LRSV Toulouse. <https://github.com/evompmi/plottr>

## License

Plöttr is released under the [MIT License](LICENSE). Vendored copies of React + ReactDOM (`vendor/`) keep their upstream MIT license — see [`vendor/LICENSE-react.txt`](vendor/LICENSE-react.txt). Continued-fraction primitives (`betacf`, `gammainc`, `gammainc_upper` in `tools/stats-dist.js`) are ported from the public-domain [Cephes Mathematical Library](https://www.netlib.org/cephes/). All algorithmic references and third-party attributions are consolidated in [`THIRD_PARTY.md`](THIRD_PARTY.md).

## Acknowledgements

Implementation assisted by Anthropic's Claude via Claude Code, under human direction. Statistical outputs are cross-validated against R 4.5 to keep accountability checkable rather than nominal.

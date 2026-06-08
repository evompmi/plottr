# Plöttr — A browser-only data-analysis toolbox

[![DOI](https://zenodo.org/badge/1217835975.svg)](https://doi.org/10.5281/zenodo.20245057)

Static web app for common plot-and-test workflows. No server, no tracking, no data leaving the browser.

**Live:** [evompmi.github.io/plottr](https://evompmi.github.io/plottr) · **Source:** [github.com/evompmi/plottr](https://github.com/evompmi/plottr)

Originally built for the "Evolution of plant-microbes interactions" team members at Toulouse Plant Sciences (University of Toulouse, France). Released publicly for anyone with similar needs.

## Design goals

- **Zero infrastructure.** Static HTML/CSS/JS. Runs from GitHub Pages or any static-file server (`python3 -m http.server`, `npx serve`, nginx, …) — no backend.
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

All numerics (`tools/_core/stats/*.ts`) are cross-validated against **two independent references**:

- **R 4.5** on real built-in datasets (`iris`, `PlantGrowth`, `ToothGrowth`, `mtcars`, …). Current run: **529 comparisons, 0 failures**, plus 5 boundary-regime rows where R and Plöttr both saturate at different ends of the precision floor — 4 cases where R's `ptukey` cancels to ~2.2 × 10⁻¹⁵ while Plöttr's `ptukey_upper` continues the true tail past it (cross-checked against SciPy and Monte Carlo), plus 1 Spearman case on exactly-monotonic ranks where Plöttr returns the honest `p = 0` and R's S-statistic path emits a fake-tail artefact via log-scale `pt()`. Reproducible via `npm run benchmark`. Results render as a public page at `benchmark.html` — failing rows would be shown in red, not hidden.
- **SciPy 1.17** on synthetic targeted grids over the (df, λ) regimes the R bank only touches indirectly: `nctcdf` at deep δ, `ncf_sf` / `ncchi2cdf` at large λ across the noncentral normal-approx threshold, `qtukey` at extreme corners. **1,083 comparisons, 0 failures**, with 92 deep-tail / underflow rows (both values < 10⁻¹³, informational) and 1 pathological annotation (`qtukey` at df = 1, documented as outside the design envelope in `tools/_core/stats/posthoc.ts`). Reproducible via `npm run benchmark:scipy`.

On top of that, a deterministic test suite of **1,800+ tests** (Vitest 4, CI-gated on every commit alongside ESLint, Prettier, `tsc --noEmit`, and `npm run build`) spanning unit, integration, render-smoke (real React 18 + happy-dom), and per-tool property suites (fast-check, with automatic shrinking on failure). A Playwright e2e suite (`npm run e2e`) covers paste → configure → plot golden paths per tool. Mutation testing is wired up via Stryker (`npm run mutation`) for on-demand meta-tests of whether the suite _catches_ bugs, not just whether tests pass.

Covers: Shapiro–Wilk, Brown–Forsythe Levene, Student / Welch t, Mann–Whitney U, one-way ANOVA, Welch ANOVA, Kruskal–Wallis, Pearson r / Spearman ρ / Kendall τ-b correlations, Tukey HSD (studentised range), Games–Howell, Dunn + Benjamini–Hochberg, Cohen's _d_ (with 95 % CI), Hedges' _g_, η², ε², compact letter display.

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
python3 -m http.server     # or `npx serve` — any static-file server works
# Then open http://localhost:8000 in any modern browser.
```

(Direct `file://` no longer works as of v1.3.0: the SPA shell loads `tools/_app/index.js` as a JavaScript module, and browsers block module loading from `file://` origins.)

## Development

Node.js ≥ 20 for the tooling (not for running the app):

```bash
npm install
npm run build       # compile tools/*.tsx → tools/*.js
npm run watch       # recompile on save
npm test            # full deterministic suite (Vitest 4)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run benchmark   # R + SciPy cross-validation (R 4.5, SciPy 1.17)
npm run e2e         # Playwright e2e suite
npm run mutation    # Stryker mutation testing (on demand)
```

Architecture, shared-code constraints, and conventions for adding tools are in [`CLAUDE.md`](CLAUDE.md). Versioned changes are tracked in [`CHANGELOG.md`](CHANGELOG.md); per-release long-form notes live under [`docs/release-notes/`](docs/release-notes/).

## Technical stack

React 18 (vendored under `vendor/`, no CDN) + esbuild (TSX → JS, ~5 ms incremental) + custom SVG rendering (no charting library) + in-house stats cross-validated against R 4.5 + SciPy 1.17. Plot tools share a typed TypeScript scaffold under `tools/_shell/` (step navigator, upload + paste handlers, style-prefs persistence, stats dispatch); each tool's `App` ships as a lazy chunk, so the SPA only downloads the route you visit. Tests via Vitest 4 with a thin compat shim that preserves the project's house vocabulary. Hosted on GitHub Pages as a single-page app (hash-routed; one esbuild entry plus per-tool code-split chunks).

No runtime dependencies from external CDNs — `vendor/` ships React + ReactDOM so a cloned copy works without network access.

## Citing

If you use Plöttr in published research, please cite the repository. Suggested citation:

> Plöttr — a browser-only data-analysis toolbox for wet-lab scientists. <https://github.com/evompmi/plottr>. M. Mbengue, Laboratoire de Recherche en Sciences Végétales (LRSV), Université de Toulouse, CNRS, UPS, Toulouse INP, Castanet-Tolosan, France.

## License

Plöttr is released under the [MIT License](LICENSE). Vendored copies of React + ReactDOM (`vendor/`) keep their upstream MIT license — see [`vendor/LICENSE-react.txt`](vendor/LICENSE-react.txt). Continued-fraction primitives (`betacf`, `gammainc`, `gammainc_upper` in `tools/_core/stats/dist.ts`) are ported from the public-domain [Cephes Mathematical Library](https://www.netlib.org/cephes/). All algorithmic references and third-party attributions are consolidated in [`THIRD_PARTY.md`](THIRD_PARTY.md).

## AI Usage

Plöttr was built collaboratively with Anthropic's Claude (Anthropic Claude Opus 4.8 [Large language model]. https://claude.ai) under researcher direction. The bulk of the JavaScript, tests, and documentation is Claude-written; the researcher specifies needs, reviews proposals, picks scope, sets methodology, and approves every commit before it lands. Architectural conventions are encoded in folder-level `CLAUDE.md` files so the workflow is reproducible.

**What is independently verified.** Every statistical function is cross-validated against R 4.5.3 and SciPy 1.17.1 on each `npm run benchmark`. Mutation testing (`npm run mutation`, Stryker) probes whether the test suite catches regressions. These checks exist precisely because the implementation is AI-generated.

**What is _not_ independently verified** and rests on researcher review alone: UI / UX choices, accessibility labels, the in-app How-to panels and the chart aesthetics. Bug reports there are especially welcome — the "Send feedback" button in every tool opens a mailto draft.

## References

Plöttr's statistical, numerical, and visualisation methods are independent implementations of published algorithms and methodology. Listed below is every research reference behind the codebase — swept from the source comments and verified against the publishers (Crossref, PubMed, journal pages). Code provenance and licensing for vendored and ported code (React, the Cephes ports, the colour palettes) is detailed separately in [`THIRD_PARTY.md`](THIRD_PARTY.md).

A few entries are books or pre-DOI papers with no DOI; those carry an archival or publisher link where one exists, or none at all.

### Statistical tests and post-hoc procedures

- Welch, B. L. (1947). The generalization of "Student's" problem when several different population variances are involved. _Biometrika_ 34(1–2), 28–35. https://doi.org/10.1093/biomet/34.1-2.28
- Satterthwaite, F. E. (1946). An approximate distribution of estimates of variance components. _Biometrics Bulletin_ 2(6), 110–114. https://doi.org/10.2307/3002019
- Levene, H. (1960). Robust tests for equality of variances. In I. Olkin et al. (Eds.), _Contributions to Probability and Statistics: Essays in Honor of Harold Hotelling_ (pp. 278–292). Stanford University Press. https://archive.org/details/contributionstop0000unse_d2c5
- Brown, M. B., & Forsythe, A. B. (1974). Robust tests for the equality of variances. _Journal of the American Statistical Association_ 69(346), 364–367. https://doi.org/10.1080/01621459.1974.10482955
- Royston, P. (1992). Approximating the Shapiro-Wilk W-test for non-normality. _Statistics and Computing_ 2(3), 117–119. https://doi.org/10.1007/BF01891203
- Royston, P. (1995). Remark AS R94: A remark on Algorithm AS 181: The W-test for normality. _Journal of the Royal Statistical Society, Series C (Applied Statistics)_ 44(4), 547–551. https://doi.org/10.2307/2986146
- Blom, G. (1958). _Statistical Estimates and Transformed Beta-Variables_. Almqvist & Wiksell / John Wiley & Sons. (Monograph; no DOI.)
- Lehmann, E. L. (1975). _Nonparametrics: Statistical Methods Based on Ranks_. Holden-Day. https://archive.org/details/nonparametricsst0000lehm
- Siegel, S., & Castellan, N. J. (1988). _Nonparametric Statistics for the Behavioral Sciences_ (2nd ed.). McGraw-Hill. (Textbook; no DOI.)
- Dunn, O. J. (1964). Multiple comparisons using rank sums. _Technometrics_ 6(3), 241–252. https://doi.org/10.1080/00401706.1964.10490181
- Day, R. W., & Quinn, G. P. (1989). Comparisons of treatments after an analysis of variance in ecology. _Ecological Monographs_ 59(4), 433–463. https://doi.org/10.2307/1943075
- Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. _Journal of the Royal Statistical Society, Series B (Methodological)_ 57(1), 289–300. https://doi.org/10.1111/j.2517-6161.1995.tb02031.x
- Piepho, H.-P. (2004). An algorithm for a letter-based representation of all-pairwise comparisons. _Journal of Computational and Graphical Statistics_ 13(2), 456–466. https://doi.org/10.1198/1061860043515
- Kerby, D. S. (2014). The simple difference formula: an approach to teaching nonparametric correlation. _Comprehensive Psychology_ 3, Article 11.IT.3.1. https://doi.org/10.2466/11.IT.3.1

### Effect sizes

- Cohen, J. (1988). _Statistical Power Analysis for the Behavioral Sciences_ (2nd ed.). Lawrence Erlbaum Associates. (2013 Routledge reissue: https://doi.org/10.4324/9780203771587)
- Hedges, L. V. (1981). Distribution theory for Glass's estimator of effect size and related estimators. _Journal of Educational Statistics_ 6(2), 107–128. https://doi.org/10.3102/10769986006002107
- Cumming, G., & Finch, S. (2001). A primer on the understanding, use, and calculation of confidence intervals that are based on central and noncentral distributions. _Educational and Psychological Measurement_ 61(4), 532–574. https://doi.org/10.1177/0013164401614002
- Lakens, D. (2013). Calculating and reporting effect sizes to facilitate cumulative science: a practical primer for t-tests and ANOVAs. _Frontiers in Psychology_ 4, Article 863. https://doi.org/10.3389/fpsyg.2013.00863
- Tomczak, M., & Tomczak, E. (2014). The need to report effect size estimates revisited. An overview of some recommended measures of effect size. _Trends in Sport Sciences_ 21(1), 19–25. (No DOI; published by AWF Poznań.)

### Test-selection methodology

- Hoenig, J. M., & Heisey, D. M. (2001). The abuse of power: the pervasive fallacy of power calculations for data analysis. _The American Statistician_ 55(1), 19–24. https://doi.org/10.1198/000313001300339897
- Zimmerman, D. W. (2004). A note on preliminary tests of equality of variances. _British Journal of Mathematical and Statistical Psychology_ 57(1), 173–181. https://doi.org/10.1348/000711004849222
- Schucany, W. R., & Ng, H. K. T. (2006). Preliminary goodness-of-fit tests for normality do not validate the one-sample Student t. _Communications in Statistics – Theory and Methods_ 35(12), 2275–2286. https://doi.org/10.1080/03610920600853308
- Rasch, D., Kubinger, K. D., & Moder, K. (2011). The two-sample t test: pre-testing its assumptions does not pay off. _Statistical Papers_ 52(1), 219–231. https://doi.org/10.1007/s00362-009-0224-x
- Delacre, M., Leys, C., Mora, Y. L., & Lakens, D. (2019). Taking parametric assumptions seriously: arguments for the use of Welch's F-test instead of the classical F-test in one-way ANOVA. _International Review of Social Psychology_ 32(1), Article 13. https://doi.org/10.5334/irsp.198

### Numerical methods and special functions

- Wilson, E. B., & Hilferty, M. M. (1931). The distribution of chi-square. _Proceedings of the National Academy of Sciences_ 17(12), 684–688. https://doi.org/10.1073/pnas.17.12.684
- Cornish, E. A., & Fisher, R. A. (1938). Moments and cumulants in the specification of distributions. _Revue de l'Institut International de Statistique_ 5(4), 307–320. https://doi.org/10.2307/1400905
- Abramowitz, M., & Stegun, I. A. (Eds.) (1964). _Handbook of Mathematical Functions with Formulas, Graphs, and Mathematical Tables_. National Bureau of Standards, Applied Mathematics Series 55. https://www.nist.gov/mathematics-statistics/handbook-mathematical-functions-abramowitz-and-stegun
- Lanczos, C. (1964). A precision approximation of the gamma function. _Journal of the Society for Industrial and Applied Mathematics, Series B: Numerical Analysis_ 1(1), 86–96. https://doi.org/10.1137/0701008
- Welford, B. P. (1962). Note on a method for calculating corrected sums of squares and products. _Technometrics_ 4(3), 419–420. https://doi.org/10.1080/00401706.1962.10490022
- Park, S. K., & Miller, K. W. (1988). Random number generators: good ones are hard to find. _Communications of the ACM_ 31(10), 1192–1201. https://doi.org/10.1145/63039.63042
- Godfrey, P. (2001). A note on the computation of the convergent Lanczos complex Gamma approximation. Unpublished technical note. https://www.numericana.com/answer/info/godfrey.htm
- Acklam, P. J. An algorithm for computing the inverse normal cumulative distribution function. Undated web note; the original site (`home.online.no/~pjacklam`) is offline and archived via the Internet Archive Wayback Machine.

### Clustering

- Lance, G. N., & Williams, W. T. (1967). A general theory of classificatory sorting strategies: 1. Hierarchical systems. _The Computer Journal_ 9(4), 373–380. https://doi.org/10.1093/comjnl/9.4.373
- Lloyd, S. P. (1982). Least squares quantization in PCM. _IEEE Transactions on Information Theory_ 28(2), 129–137. https://doi.org/10.1109/TIT.1982.1056489
- Arthur, D., & Vassilvitskii, S. (2007). k-means++: the advantages of careful seeding. _Proceedings of the 18th Annual ACM-SIAM Symposium on Discrete Algorithms (SODA '07)_, 1027–1035. https://dl.acm.org/doi/10.5555/1283383.1283494

### Set statistics

- Wang, M., Zhao, Y., & Zhang, B. (2015). Efficient test and visualization of multi-set intersections. _Scientific Reports_ 5, Article 16923. https://doi.org/10.1038/srep16923

### Visualisation

- Heckbert, P. S. (1990). Nice numbers for graph labels. In A. S. Glassner (Ed.), _Graphics Gems_ (pp. 61–63). Academic Press. https://publications.ri.cmu.edu/nice-numbers-for-graph-labels/
- Silverman, B. W. (1986). _Density Estimation for Statistics and Data Analysis_. Chapman & Hall. (2018 CRC Press reprint: https://doi.org/10.1201/9781315140919)
- Wong, B. (2011). Points of view: color blindness. _Nature Methods_ 8(6), 441. https://doi.org/10.1038/nmeth.1618
- Nuñez, J. R., Anderton, C. R., & Renslow, R. S. (2018). Optimizing colormaps with consideration for color vision deficiency to enable accurate interpretation of scientific data. _PLOS ONE_ 13(7), e0199239. https://doi.org/10.1371/journal.pone.0199239

### Aequorin calcium calibration

- Allen, D. G., & Blinks, J. R. (1978). Calcium transients in aequorin-injected frog cardiac muscle. _Nature_ 273(5663), 509–513. https://doi.org/10.1038/273509a0
- Knight, M. R., Campbell, A. K., Smith, S. M., & Trewavas, A. J. (1991). Transgenic plant aequorin reports the effects of touch and cold-shock and elicitors on cytoplasmic calcium. _Nature_ 352(6335), 524–526. https://doi.org/10.1038/352524a0
- Plieth, C. (2006). Aequorin as a reporter gene. _Methods in Molecular Biology_ 323, 307–327. https://doi.org/10.1385/1-59745-003-0:307

### Datasets

- Anderson, E. (1935). The irises of the Gaspé Peninsula. _Bulletin of the American Iris Society_ 59, 2–5. (No DOI.)
- Fisher, R. A. (1936). The use of multiple measurements in taxonomic problems. _Annals of Eugenics_ 7(2), 179–188. https://doi.org/10.1111/j.1469-1809.1936.tb02137.x

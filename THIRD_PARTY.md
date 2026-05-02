# Third-party code and algorithmic references

Plöttr's own code is MIT (see [LICENSE](LICENSE)). This file lists everything
**else** — vendored third-party code, ports of public-domain implementations,
and the algorithmic references behind the statistical computations. Each
entry names what's used, where it's used, and the licensing posture.

The intent is one-stop transparency: a Zenodo or peer reviewer should be able
to read this page and verify that nothing in the repo is an unattributed copy
of licensed code. Inline citations exist throughout `tools/stats.js` and
`tools/shared.js` — this file consolidates them.

## Vendored binaries

| Component   | Path                                                                       | License    | Notes                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| React 18    | [`vendor/react.production.min.js`](vendor/react.production.min.js)         | MIT (Meta) | Unmodified production bundle. `@license` header retained inline. Standalone MIT text in [`vendor/LICENSE-react.txt`](vendor/LICENSE-react.txt). |
| ReactDOM 18 | [`vendor/react-dom.production.min.js`](vendor/react-dom.production.min.js) | MIT (Meta) | Same as above.                                                                                                                                  |

Both are vendored so a cloned copy works without network access — Plöttr is
designed to run from any static host (or directly off the filesystem) with no
runtime CDN dependency.

## Ports with public-domain provenance

| Component                                                                  | Where             | Source                                                                                                                                                | Provenance                                                                                         |
| -------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `betacf` (continued fraction for the regularized incomplete beta)          | `tools/stats.js`  | Cephes Mathematical Library, `incbet.c` (`incbcf` form), Stephen L. Moshier, "Cephes Math Library Release 2.8" (2000), https://www.netlib.org/cephes/ | Public domain (author dedication).                                                                 |
| `gammainc` (regularized lower incomplete gamma — series form)              | `tools/stats.js`  | Cephes Mathematical Library, `igam.c`                                                                                                                 | Public domain (author dedication).                                                                 |
| `gammainc_upper` (regularized upper incomplete gamma — continued fraction) | `tools/stats.js`  | Cephes Mathematical Library, `igam.c` (`igamc` form)                                                                                                  | Public domain (author dedication).                                                                 |
| `seededRandom` (Park-Miller minimal-standard LCG)                          | `tools/shared.js` | S. K. Park & K. W. Miller, "Random number generators: Good ones are hard to find" (CACM, 1988); algorithm originated with D. H. Lehmer, 1951.         | Public-domain algorithm; constants 16807 / 2147483647 are the algorithm.                           |
| `gammaln` Lanczos coefficients (g = 7)                                     | `tools/stats.js`  | Paul Godfrey, "A note on the computation of the convergent Lanczos complex Gamma approximation" (2001)                                                | Coefficients are public-domain in spirit; widely circulated as the standard g = 7 reference table. |

The Cephes ports use a three-term recurrence (`pkm/qkm` with periodic
big/biginv rescaling). Plöttr-specific polish — log-space final
exponentiation in `gammainc` / `gammainc_upper`, and a √a-scaled iteration
cap so `chi2cdf` and `ptukey` stay accurate at huge df — is layered on top of
the Cephes recurrence. Constants (`CEPHES_BIG = 2^52`, `CEPHES_BIGINV =
2^-52`, `CEPHES_MACHEP = 1.11e-16`) match Cephes' `incbet.c` / `igam.c`
literally. See `tools/stats.js` lines ~169–305 for the attribution block.

## Algorithmic references (algorithm-only — no code copied)

These are textbook statistical algorithms with attribution to their
publication. Algorithms themselves are not copyrightable; we cite to give a
reviewer or downstream user a path to the canonical description without
having to reverse-engineer the implementation. All implementations below are
independently coded.

### Distribution functions

- **`normcdf` / `normsf`** — Abramowitz & Stegun, _Handbook of Mathematical
  Functions_, §26.2.17 (1964). U.S. government publication; public domain.
  Coefficients (`0.2316419`, `0.31938153`, `−0.356563782`, …) are the
  standard A&S table.
- **`norminv`** — Peter J. Acklam, "An algorithm for computing the inverse
  normal cumulative distribution function" (2003). Acklam explicitly waived
  restrictions ("freely usable for any purpose").
- **Studentized-range distribution (`ptukey`, `qtukey`, `_wprob_upper`)** —
  independently derived 48-node Gauss-Legendre quadrature on
  `y = log(s)`, with bracketing from `chi2inv(1e-10, df)` /
  `chi2inv(1−1e-10, df)`. Does **not** derive from R's GPL `ptukey.c` (which
  uses Gauss-Hermite tables from AS 190, Copenhaver & Holland 1988); the
  algebraic factorisation `a^(k−1) − b^(k−1) = (a−b)·Σ a^(k−2−j)·b^j` for
  the upper tail is documented in the source comments at
  `tools/stats.js` ~line 1244.
- **Noncentral t / F / χ² (`nctcdf`, `ncf_sf`, `ncchi2cdf`)** — textbook
  Poisson-mixture and chi²-mixture forms, mode-centred enumeration. The
  closed-form normal-approximation short-circuit (`if halfLam > 500 && d2 >
4`) for `ncf_sf` is Plöttr-specific polish.
- **`gammaln`** — Lanczos (1964) approximation with g = 7 coefficients
  (Godfrey 2001 reference table). The decimal expansions are widely circulated.

### Statistical tests

- **Shapiro–Wilk normality test** — Royston, "A remark on Algorithm AS 181:
  the W test for normality" (Applied Statistics 44(4), 1995), with AS R94
  polynomial approximations for the tail. Implementation re-derives the
  Royston coefficients analytically; the AS R94 Fortran (StatLib, "may be
  used freely for non-commercial purposes") is **not** the source.
  Expected values of normal order statistics use Blom's approximation
  (Blom 1958).
- **Mann–Whitney U** — tie correction follows E. L. Lehmann,
  _Nonparametrics_ (1975).
- **Kruskal–Wallis** — tie correction follows S. Siegel & N. J. Castellan,
  _Nonparametric Statistics for the Behavioral Sciences_ (2nd ed., 1988).
  Effect-size formulas (η², ε²) follow Tomczak & Tomczak, "The need to
  report effect size estimates revisited" (2014).
- **Tukey HSD** — studentized-range survival via the in-house `ptukey_upper`
  (see Distribution functions above).
- **Games–Howell** — formulas from Day & Quinn, "Comparisons of treatments
  after an analysis of variance in ecology" (Ecological Monographs 59(4),
  1989).
- **Dunn's test (Bonferroni / BH-adjusted)** — original formula from
  O. J. Dunn, "Multiple comparisons using rank sums" (Technometrics 6(3),
  1964); tie correction following Siegel & Castellan (above).
- **Benjamini–Hochberg FDR control** — Benjamini & Hochberg, "Controlling
  the false discovery rate" (JRSS-B 57(1), 1995). Trivial 8-line
  implementation.
- **Compact letter display** — Piepho, "An algorithm for a letter-based
  representation of all-pairwise comparisons" (Journal of Computational
  and Graphical Statistics 13(2), 2004).
- **Rank-biserial correlation** — D. Kerby, "The simple difference formula:
  An approach to teaching nonparametric correlation" (Comprehensive
  Psychology 3(1), 2014).
- **Cohen's d / Hedges' g** — standard formulas from J. Cohen, _Statistical
  Power Analysis_ (2nd ed., 1988); Hedges' bias-correction factor from
  L. V. Hedges, "Distribution theory for Glass's estimator of effect size"
  (Journal of Educational Statistics 6(2), 1981).

### Set-theoretic and combinatorial

- **Multi-set intersection enrichment / depletion** — N. Wang, J. Zhao &
  S. Bhattacharya, "Efficient test and visualization of multi-set
  intersections" (Scientific Reports, 2015) — the algorithmic basis for
  the `SuperExactTest` R package. Implementation is independently derived
  from the iterated-hypergeometric description; no R code is copied.

### Graphics / chart helpers

- **Kernel density estimate** — Gaussian kernel + Silverman's rule-of-thumb
  bandwidth (B. W. Silverman, _Density Estimation for Statistics and Data
  Analysis_, 1986). Independent implementation; does not derive from
  scipy's `gaussian_kde` or d3's `bin`.
- **`makeTicks` / `makeLogTicks` "nice numbers" tick rounding** — Heckbert,
  "Nice numbers for graph labels", _Graphics Gems I_ (Academic Press, 1990).
  Algorithm only — implementation does not derive from d3-scale's `ticks()`.
- **Hierarchical clustering (`hclust`)** — naive O(n³) Lance–Williams update
  (Lance & Williams, "A general theory of classificatory sorting strategies",
  Computer Journal 9(4), 1967) with UPGMA / single / complete linkages.
  Does **not** derive from scipy's `_hierarchy.pyx` (NN-chain compression)
  or `ml-hclust` (priority-queue NN-chain).
- **k-means / k-means++** — Lloyd 1982 / Arthur & Vassilvitskii, "k-means++:
  the advantages of careful seeding" (SODA, 2007). Algorithm only.

### Color and palettes

- **Okabe–Ito qualitative palette** — Wong, "Color blindness", _Nature
  Methods_ 8 (2011). The eight-colour set was designed for accessibility to
  colour-vision-deficient readers and is widely shared in the scientific
  community; we use it as the default qualitative palette throughout Plöttr.
- **Sequential and diverging palettes** — viridis / plasma / magma / inferno
  derived from the Matplotlib palettes (released CC0 / public domain by
  their authors Stéfan van der Walt & Nathaniel Smith); cividis from
  Nuñez, Anderton & Renslow, "An optimized colormap for the scientific
  community" (PLoS ONE 13(6), 2018).

### CSV parsing

- **`tokenizeDelimited`, `parseRaw`** — hand-written RFC 4180 state
  machine. Independent implementation; does not derive from `csv-parse`,
  `papaparse`, or any other open-source CSV library.

## Datasets

Built-in R datasets (`iris`, `PlantGrowth`, `ToothGrowth`, `mtcars`, etc.)
are referenced by the benchmark suite at `benchmark/run-r.R` for
cross-validation. The benchmark loads them from R at runtime — values are
**not** redistributed in this repository. The values themselves are facts
(e.g. iris is Anderson 1935 / Fisher 1936) and not copyrightable.

The single bundled dataset is `tools/iris_example.js`, which ships the
classic 150-row iris flower measurements verbatim — public domain
(Anderson 1935; Fisher 1936). The header of that file cites both papers.

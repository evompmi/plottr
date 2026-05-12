# benchmark/ — R + SciPy cross-validation suite

Auto-loaded by Claude Code when work touches anything under `benchmark/`. Methodology rules for `tools/stats-*.js` defaults (Welch-by-default, set in `selectTest()` in `tools/stats-posthoc.js`) live in `tools/CLAUDE.md` under "Statistical methodology".

## Commands

```bash
npm run benchmark         # full chain: R + JS + R-script-runs-in-Rscript + SciPy
npm run benchmark:scipy   # SciPy cross-check only (regenerates fixture if python3+scipy on PATH)
```

## Two complementary benchmarks

Mirroring two different audiences:

- `benchmark/run-r.R` + `benchmark/run.js` — R 4.5 as the reference, on **real R built-in datasets** (iris, PlantGrowth, ToothGrowth, mtcars, ChickWeight, …). Public-facing trust artefact: results render as `benchmark.html` with per-category tables and red-on-fail rows. ~105 cases / ~303 numerical comparisons.
- `benchmark/run-scipy.py` + `benchmark/run-scipy.js` — SciPy as the reference, on **synthetic targeted grids** specifically aimed at the (df, λ) regimes the R benchmark only touches indirectly: `nctcdf` at deep δ, `ncf_sf` and `ncchi2cdf` at large λ across the 500-threshold normal-approx short-circuit, `qtukey` at extreme (p, k, df) corners including the documented "pathological" df=1 envelope. ~847 cases / ~1,083 comparisons. Contributor-facing: a CI-side numerical sanity check whose audience is people changing the carved `tools/stats-*.js` files, not end users.

The SciPy benchmark uses a tighter classification than the R one because it deliberately probes the design envelope:

- **pass** — within tolerance.
- **deep-tail** — both values < 1e-13 (informational; below any user-facing precision).
- **underflow** — SciPy reports < 1e-13, JS underflows to 0. Plöttr's Gauss-Legendre window has a documented precision floor; SciPy uses series / asymptotic forms that survive deeper.
- **pathological** — `qtukey` at `df ≤ 2` with `p ≥ 0.95` and `k ≥ 10`. Source comment in `tools/stats-posthoc.js` explicitly calls these out as outside the implementation's design envelope.
- **fail** — real disagreement. Exits 1.

Both `run-r.R` and `run-scipy.py` pre-flight the relevant interpreter (Rscript / python3+scipy) and skip gracefully when missing. The checked-in `results-r.json` and `results-scipy.json` fixtures let the JS-side comparison run without either interpreter installed.

## Extending the SciPy suite

New cases land as additional rows in `benchmark/run-scipy.py`'s grids, then `npm run benchmark:scipy` regenerates `benchmark/results-scipy.json` and the sidecar `benchmark/scipy-summary.json` (counts per regime, surfaced on `benchmark.html`). The five regime labels (`pass` / `deep-tail` / `underflow` / `pathological` / `fail`) are the only valid statuses; if a new case lands in `underflow` or `pathological`, prefer documenting it in the source comment of the affected function in the relevant `tools/stats-*.js` file (`stats-dist.js` for distributions, `stats-posthoc.js` for `qtukey`) over loosening the tolerance. `fail` is exit-1 — it never gets reclassified into a softer bucket without a corresponding code change in the stats source.

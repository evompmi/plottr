#!/usr/bin/env python3
# benchmark/run-scipy.py — generate a SciPy reference for the noncentral
# distributions and `qtukey` over targeted (df, λ) regimes that the
# existing R benchmark only exercises indirectly via test outputs on
# iris-grade data.
#
# The 1.2.0_harsh_review.md §1.2 / point 8 critique:
#
#   `tools/stats.js` puts the most engineered numerical hardening into
#   `nctcdf`, `ncf_sf`, `ncchi2cdf`, `qtukey` (Poisson-mixture mode-
#   centred enumeration, large-λ normal-approx short-circuit, peak-
#   following Gauss-Legendre window for `_wprob_upper`, doubling-
#   bracket expansion in qtukey). The R benchmark probes them only via
#   `tukeyHSD()` / `aov()` on iris / PlantGrowth / chickwts — none of
#   which exercise δ > 50 in nctcdf or λ > 500 in ncf_sf / ncchi2cdf
#   or qtukey at small df.
#
# This script asks SciPy directly across a small but **targeted** grid
# (~700 cases for the four noncentral / studentized-range checks, plus
# ~300 central-distribution sanity cases for completeness) and writes
# the reference values to `benchmark/results-scipy.json`. Same shape as
# `benchmark/results-r.json` so `benchmark/run-scipy.js` can consume it
# the same way `benchmark/run.js` consumes the R output.
#
# Why native SciPy and not Pyodide:
#   - Pyodide (browser-Python in WASM) is the in-browser alternative.
#     For benchmark cross-validation we want the canonical reference
#     implementation; native SciPy is more authoritative (Pyodide's
#     SciPy build has known caveats around float precision in some
#     special-function paths) and avoids a ~50 MB devDep.
#   - `Rscript` is already required for the R benchmark; requiring
#     `python3` + `scipy` is a smaller incremental ask. Both are
#     pre-flighted in the JS runners with a graceful skip when missing.

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import numpy as np
    from scipy.stats import nct, ncf, ncx2, t as t_dist, f as f_dist, chi2, norm
    from scipy.stats import studentized_range
except ImportError as e:
    sys.stderr.write(f"benchmark/run-scipy.py: missing dependency — {e}\n")
    sys.stderr.write(
        "Install with `pip install scipy` (>= 1.7) or `python3 -m pip install scipy`.\n"
    )
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "benchmark" / "results-scipy.json"

# ── Result accumulator ───────────────────────────────────────────────────
results: list[dict] = []


def add_case(category: str, label: str, inputs: dict, py_result: dict) -> None:
    # Strict JSON has no NaN / Infinity literals — Node's JSON.parse
    # rejects them. Skip any case where SciPy returns NaN: those are
    # regimes where SciPy itself can't compute the value, so there's
    # no reference to compare against. (`stats.js` returning NaN in
    # the same regime is the right behaviour; we just don't have a
    # check to make.)
    for v in py_result.values():
        if isinstance(v, float) and not np.isfinite(v):
            return
    results.append(
        {
            "category": category,
            "label": label,
            "n": 0,  # not meaningful for these primitive checks; kept for parity with results-r.json
            "inputs": inputs,
            "scipy": py_result,
        }
    )


def _fmt_num(x: float) -> str:
    """Stable-formatted number for case labels (no trailing zeros, no NaN)."""
    if not np.isfinite(x):
        return str(x)
    if x == int(x):
        return str(int(x))
    return f"{x:g}"


# ── 1. nctcdf — noncentral t CDF ─────────────────────────────────────────
# `tools/stats.js` implements this via Gauss-Legendre quadrature over a
# substituted u = √s integral; it has a known numerical pitfall at small
# ν combined with large |t| where the quadrature window can leak nodes
# into the tail. The grid below probes that envelope deliberately.

NCT_DFS = [1, 5, 30, 100, 1000]
NCT_DELTAS = [0.0, 1.0, 5.0, 50.0, 500.0]
NCT_TS = [-5.0, -1.0, 0.0, 1.0, 5.0, 10.0, 50.0]

for df in NCT_DFS:
    for delta in NCT_DELTAS:
        for t_val in NCT_TS:
            cdf = float(nct.cdf(t_val, df, delta))
            sf = float(nct.sf(t_val, df, delta))
            add_case(
                "nctcdf",
                f"t={_fmt_num(t_val)} df={df} delta={_fmt_num(delta)}",
                {"t": t_val, "df": df, "delta": delta},
                {"cdf": cdf, "sf": sf},
            )

# ── 2. ncf_sf — noncentral F survival ─────────────────────────────────────
# Plöttr's `ncf_sf` Poisson-mixture sums around the mode and short-
# circuits to a normal approximation when λ/2 > 500. This grid spans
# both sides of that switch + small / large d2 (the variance formula's
# d2 > 4 guard fires here).

NCF_D1 = [1, 3, 10, 50]
NCF_D2 = [5, 30, 200, 1000]
NCF_LAMBDAS = [0.0, 1.0, 50.0, 5000.0]
NCF_FS = [0.5, 2.0, 10.0, 50.0]

for d1 in NCF_D1:
    for d2 in NCF_D2:
        for lam in NCF_LAMBDAS:
            for f_val in NCF_FS:
                # SciPy quirk at the central limit: `ncf.sf(f, d1, d2, 0)`
                # returns `-(1 - cdf)` (sign flipped) for some d1/d2 combos
                # — the noncentral parameterisation hits a numerical
                # discontinuity at nc=0 where the Poisson-mixture sum
                # collapses to the j=0 term. The true survival function
                # at nc=0 is the central F survival, so call that
                # directly instead of going through `ncf` for the λ=0
                # rows. (Plöttr's `ncf_sf(f, d1, d2, 0)` short-circuits
                # to `fcdf_upper(f, d1, d2)` for the same reason —
                # documented in stats.js.)
                if lam == 0:
                    from scipy.stats import f as central_f
                    sf = float(central_f.sf(f_val, d1, d2))
                else:
                    sf = float(ncf.sf(f_val, d1, d2, lam))
                add_case(
                    "ncf_sf",
                    f"f={_fmt_num(f_val)} d1={d1} d2={d2} lambda={_fmt_num(lam)}",
                    {"f": f_val, "d1": d1, "d2": d2, "lambda": lam},
                    {"sf": sf},
                )

# ── 3. ncchi2cdf — noncentral chi² CDF ────────────────────────────────────
# Same Poisson-mixture shape as ncf_sf; the large-λ short-circuit
# threshold and the ±8σ scan window are explicitly targeted by the
# small-x / large-λ corner of this grid.

NCCHI2_KS = [1, 5, 30, 100]
NCCHI2_LAMBDAS = [0.0, 1.0, 50.0, 5000.0]
NCCHI2_XS = [0.1, 1.0, 10.0, 50.0, 200.0, 1000.0]

for k in NCCHI2_KS:
    for lam in NCCHI2_LAMBDAS:
        for x_val in NCCHI2_XS:
            cdf = float(ncx2.cdf(x_val, k, lam))
            add_case(
                "ncchi2cdf",
                f"x={_fmt_num(x_val)} k={k} lambda={_fmt_num(lam)}",
                {"x": x_val, "k": k, "lambda": lam},
                {"cdf": cdf},
            )

# ── 4. qtukey — studentized-range quantile ────────────────────────────────
# Plöttr's `qtukey` does a doubling-bracket expansion + 200-step
# bisection on `ptukey`. The pathological case the source comment
# explicitly names — k = 50, df = 1, p = 0.999 — sits inside this grid.
# `studentized_range.ppf(p, k, df)` is the SciPy 1.7+ canonical entry
# point; older SciPy used `_wstat`/`_wprob` directly.

QTUKEY_PS = [0.5, 0.9, 0.95, 0.99, 0.999]
QTUKEY_KS = [2, 3, 5, 10, 30, 50]
QTUKEY_DFS = [1, 5, 30, 100, 1000]

for p in QTUKEY_PS:
    for k in QTUKEY_KS:
        for df in QTUKEY_DFS:
            try:
                q = float(studentized_range.ppf(p, k, df))
                if not np.isfinite(q):
                    # SciPy returns NaN for some pathological (p, k, df) combos.
                    continue
                add_case(
                    "qtukey",
                    f"p={p} k={k} df={df}",
                    {"p": p, "k": k, "df": df},
                    {"q": q},
                )
            except Exception:
                # Skip cases SciPy refuses; Plöttr's qtukey returns NaN there too.
                continue

# ── 5. Central distributions — secondary cross-check ─────────────────────
# Cheap to add and useful coverage. The R benchmark also touches these
# indirectly, but cross-checking against SciPy gives a second
# authoritative source for the exact values stats.js produces.

# norminv — points spanning [1e-12, 1 - 1e-12]
for p in [
    1e-12,
    1e-9,
    1e-6,
    1e-3,
    0.025,
    0.1,
    0.5,
    0.9,
    0.975,
    1 - 1e-3,
    1 - 1e-6,
    1 - 1e-9,
    1 - 1e-12,
]:
    val = float(norm.ppf(p))
    add_case("norminv", f"p={p}", {"p": p}, {"q": val})

# tinv — across df ∈ {1, 5, 30, 1000} × p tail points
for df in [1, 5, 30, 1000]:
    for p in [
        1e-9,
        1e-6,
        1e-3,
        0.025,
        0.5,
        0.975,
        1 - 1e-3,
        1 - 1e-6,
        1 - 1e-9,
    ]:
        val = float(t_dist.ppf(p, df))
        add_case("tinv", f"p={p} df={df}", {"p": p, "df": df}, {"q": val})

# fcdf / fcdf_upper — across (d1, d2, F) corners
for d1 in [1, 3, 10, 50]:
    for d2 in [5, 30, 200, 1000]:
        for f_val in [0.1, 1.0, 5.0, 50.0]:
            cdf = float(f_dist.cdf(f_val, d1, d2))
            sf = float(f_dist.sf(f_val, d1, d2))
            add_case(
                "fcdf",
                f"f={_fmt_num(f_val)} d1={d1} d2={d2}",
                {"f": f_val, "d1": d1, "d2": d2},
                {"cdf": cdf, "sf": sf},
            )

# chi2cdf / chi2inv — across df + tail-targeted
for k in [1, 3, 10, 50, 200]:
    for x_val in [0.01, 0.1, 1.0, 5.0, 25.0, 100.0]:
        cdf = float(chi2.cdf(x_val, k))
        add_case(
            "chi2cdf",
            f"x={_fmt_num(x_val)} k={k}",
            {"x": x_val, "k": k},
            {"cdf": cdf},
        )
    for p in [1e-9, 1e-3, 0.5, 0.95, 1 - 1e-3, 1 - 1e-9]:
        try:
            val = float(chi2.ppf(p, k))
            add_case(
                "chi2inv",
                f"p={p} k={k}",
                {"p": p, "k": k},
                {"q": val},
            )
        except Exception:
            continue

# ── Write out ────────────────────────────────────────────────────────────
import scipy

out = {
    "meta": {
        "scipy_version": scipy.__version__,
        "python_version": sys.version.split()[0],
        "n_tests": len(results),
    },
    "tests": results,
}
OUT_PATH.write_text(json.dumps(out, indent=2))
print(f"wrote {len(results)} test specs to benchmark/{OUT_PATH.name}")

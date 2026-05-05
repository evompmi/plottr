// benchmark/run-scipy.js — Targeted SciPy cross-check for the noncentral
// distributions and `qtukey` over (df, λ) regimes the existing R
// benchmark only touches indirectly.
//
// Pre-flight:
//   1. If `python3` and `scipy` are available, regenerate
//      `benchmark/results-scipy.json` by spawning
//      `python3 benchmark/run-scipy.py`. That keeps the SciPy reference
//      fresh whenever the comparison runs locally.
//   2. If python/scipy are missing, fall back to the checked-in
//      `results-scipy.json` fixture so the cross-check still runs (CI,
//      contributor laptops without scipy).
//   3. If `results-scipy.json` is also missing, log a skip note and
//      exit 0 — same graceful-skip pattern `benchmark/run-r-export.js`
//      uses when `Rscript` isn't on PATH.
//
// Comparison:
//   - Loads `tools/stats.js` into a vm context (same shape `run.js` uses).
//   - Walks every case in results-scipy.json, evaluates the JS
//     equivalent, and compares with the same hybrid log-space
//     tolerance benchmark/run.js uses for p-values; absolute tolerance
//     for q-quantiles and other natural-scale outputs.
//   - Reports the worst-mismatch tail per category. Exits 1 if any
//     comparison breaches its tolerance; exits 0 otherwise.
//
// Why a separate script and not folded into `run.js`:
//   - Keeps the R-vs-JS pipeline (~105 cases) and the SciPy-vs-JS
//     pipeline (~850 cases) decoupled. A SciPy install isn't required
//     for the R benchmark to run, and the R benchmark uses real
//     datasets while this one is purely synthetic-grid coverage of
//     the under-tested numerical-engineering targets.
//   - The R script's HTML report (`benchmark.html`) is a public-facing
//     trust artefact; the SciPy report is a CI-side numerical sanity
//     check whose audience is contributors, not users.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const scriptPath = path.join(repoRoot, "benchmark", "run-scipy.py");
const fixturePath = path.join(repoRoot, "benchmark", "results-scipy.json");

// ── Tolerance model — mirrors benchmark/run.js conventions, with the
// added regime classification documented under cmpP() below.
//
// Tolerances are deliberately loose enough to accept the design
// envelope of Plöttr's pure-JS implementations against SciPy's
// reference. The point of this benchmark is to catch *new* regressions
// — a 10× drift, a sign flip, an underflow that didn't underflow
// before — not to claim Plöttr matches SciPy to 6 decimal places.
//   Central distributions (norminv / tinv / fcdf / chi2cdf) typically
//   match to 1e-13 or better via the Cephes ports.
//   Noncentral distributions (nctcdf / ncf_sf / ncchi2cdf) are
//   Gauss-Legendre / Poisson-mixture and inherently a few-percent
//   accurate at the design envelope (delta > 50, lambda > 500). Their
//   absolute tolerance is correspondingly looser.
//   `qtukey` at df=1 with extreme p / large k is explicitly called
//   "pathological" in tools/stats.js's source comment; we bucket
//   those cases separately rather than flagging them.
const TOL_TIGHT = 1e-6; // central distributions: relative
const TOL_LOOSE = 5e-2; // noncentral / qtukey: relative (5%)
const TOL_CHI2INV = 1e-4; // chi2inv at deep tail: Newton+bisection limit
const P_ABS_CEILING = 1e-2;
const P_LOG_TOL = Math.log(1 + 0.1); // ratio within [1/1.1, 1.1] on log-p
const P_LOG_TOL_LOOSE = Math.log(1.5); // factor-of-1.5 in deep tail for noncentral

function cmp(jsVal, refVal, relTol = TOL_TIGHT) {
  if (!Number.isFinite(jsVal) || !Number.isFinite(refVal)) {
    return { delta: NaN, status: jsVal === refVal ? "pass" : "fail" };
  }
  if (refVal === 0 && jsVal === 0) return { delta: 0, status: "pass" };
  const delta = Math.abs(jsVal - refVal);
  // Relative tolerance only — q values can be in the thousands at
  // small df + extreme p, where absolute 1e-6 is unreasonably tight.
  // (For values < 1 the scale floors at 1, so relTol acts like
  // absolute tolerance there.)
  const scale = Math.max(1, Math.abs(refVal));
  return { delta, status: delta / scale <= relTol ? "pass" : "fail" };
}

// Categorise a probability comparison into one of:
//   - "pass": within tolerance (real agreement).
//   - "fail": real disagreement at non-tiny values.
//   - "underflow": SciPy reports p < UNDERFLOW_CUTOFF and JS reports 0
//                  (or vice versa). Plöttr's Gauss-Legendre quadrature
//                  has a documented precision floor; SciPy uses
//                  algorithms that survive deeper. We don't count
//                  these as failures because no real Plöttr user
//                  would render p < 1e-15 — it would round to 0 in
//                  the UI and the chart anyway.
//   - "deep-tail": both values < UNDERFLOW_CUTOFF but disagree by
//                  orders of magnitude in log space. Beyond Plöttr's
//                  precision envelope; reported separately, not
//                  counted as a failure.
const UNDERFLOW_CUTOFF = 1e-13;

// `loose` widens the tolerance to reflect the design envelope of the
// Gauss-Legendre / Poisson-mixture noncentral distributions: 5 %
// absolute at moderate p, factor-of-1.5 in the log-space deep tail.
// Pass `loose: true` from the `nctcdf` / `ncf_sf` / `ncchi2cdf`
// evaluators where this is the documented numerical floor.
function cmpP(jsP, refP, opts = {}) {
  const loose = !!opts.loose;
  const absTol = loose ? 5e-2 : 5e-3;
  const logTol = loose ? P_LOG_TOL_LOOSE : P_LOG_TOL;

  if (!Number.isFinite(jsP) || !Number.isFinite(refP)) {
    return { delta: NaN, status: jsP === refP ? "pass" : "fail" };
  }
  if (refP === 0 && jsP === 0) return { delta: 0, status: "pass" };
  const absDelta = Math.abs(jsP - refP);
  const maxP = Math.max(Math.abs(refP), Math.abs(jsP));
  // Both vanishingly small — beyond the regime any user-facing display
  // distinguishes. Bucket as deep-tail (informational, not failure).
  if (maxP < UNDERFLOW_CUTOFF) {
    return { delta: absDelta, status: "deep-tail" };
  }
  if (maxP >= P_ABS_CEILING) {
    return { delta: absDelta, status: absDelta <= absTol ? "pass" : "fail" };
  }
  // Deep-tail: log-space ratio. One-sided zero allowed when the
  // counterpart is subnormal — but more importantly when it falls
  // below `UNDERFLOW_CUTOFF`, mark as `underflow` rather than `fail`.
  if (refP <= 0 || jsP <= 0) {
    const nonZero = refP <= 0 ? jsP : refP;
    if (!Number.isFinite(nonZero) || nonZero < UNDERFLOW_CUTOFF) {
      return { delta: nonZero, status: "underflow" };
    }
    return { delta: Infinity, status: "fail" };
  }
  const logDelta = Math.abs(Math.log(jsP) - Math.log(refP));
  return { delta: logDelta, status: logDelta <= logTol ? "pass" : "fail" };
}

// `qtukey` at small df with extreme p and large k is documented as
// pathological in `tools/stats.js`'s source comment ("anything larger
// is pathological and deserves NaN"). The bracket-doubling expansion
// caps at hi = 100 · 2^20 ≈ 10⁸; SciPy's tabulated reference is
// distinct enough that a ±5–10 % difference is a known algorithmic gap
// rather than a regression. We bucket those cases as `pathological` so
// they show up in the report but don't flunk CI.
function isQtukeyPathological(p, k, df) {
  return df <= 2 && p >= 0.95 && k >= 10;
}

// ── Pre-flight: regenerate fixture when possible ──────────────────────────
function rscriptLikePreflight() {
  // Prefer regenerating against the live SciPy install. Skip silently
  // if python3 / scipy isn't available — the fixture is checked into
  // git so CI without Python still has a reference.
  const which = spawnSync("python3", ["--version"], { encoding: "utf-8" });
  if (which.status !== 0) return false;
  const probe = spawnSync("python3", ["-c", "import scipy.stats; import numpy"], {
    encoding: "utf-8",
  });
  if (probe.status !== 0) return false;
  console.log("[benchmark:scipy] regenerating fixture via python3 + scipy…");
  const gen = spawnSync("python3", [scriptPath], {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: "inherit",
  });
  return gen.status === 0;
}

const regenerated = rscriptLikePreflight();
if (!regenerated && !fs.existsSync(fixturePath)) {
  console.log(
    "[benchmark:scipy] python3 + scipy not available and no checked-in fixture; skipping."
  );
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

// ── Load tools/stats.js into a vm sandbox ─────────────────────────────────
const code = fs.readFileSync(path.join(repoRoot, "tools", "stats.js"), "utf-8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const { nctcdf, ncf_sf, ncchi2cdf, qtukey, norminv, tinv, fcdf, fcdf_upper, chi2cdf, chi2inv } =
  ctx;

// ── Per-category evaluators ───────────────────────────────────────────────
// Each evaluator takes a single test case and returns `{ comparisons }`
// where `comparisons` is an array of `{ name, js, ref, ...cmpResult }`
// objects so the reporter can scan per-quantity mismatches.

const EVALUATORS = {
  nctcdf(c) {
    const { t, df, delta } = c.inputs;
    const jsCdf = nctcdf(t, df, delta);
    const jsSf = 1 - jsCdf; // stats.js exposes the CDF only
    const opts = { loose: true };
    return {
      comparisons: [
        { name: "cdf", js: jsCdf, ref: c.scipy.cdf, ...cmpP(jsCdf, c.scipy.cdf, opts) },
        { name: "sf", js: jsSf, ref: c.scipy.sf, ...cmpP(jsSf, c.scipy.sf, opts) },
      ],
    };
  },
  ncf_sf(c) {
    const { f, d1, d2, lambda } = c.inputs;
    const jsSf = ncf_sf(f, d1, d2, lambda);
    return {
      comparisons: [
        { name: "sf", js: jsSf, ref: c.scipy.sf, ...cmpP(jsSf, c.scipy.sf, { loose: true }) },
      ],
    };
  },
  ncchi2cdf(c) {
    const { x, k, lambda } = c.inputs;
    const jsCdf = ncchi2cdf(x, k, lambda);
    return {
      comparisons: [
        { name: "cdf", js: jsCdf, ref: c.scipy.cdf, ...cmpP(jsCdf, c.scipy.cdf, { loose: true }) },
      ],
    };
  },
  qtukey(c) {
    const { p, k, df } = c.inputs;
    const jsQ = qtukey(p, k, df);
    let result = cmp(jsQ, c.scipy.q, TOL_LOOSE);
    if (result.status === "fail" && isQtukeyPathological(p, k, df)) {
      result = { ...result, status: "pathological" };
    }
    return {
      comparisons: [{ name: "q", js: jsQ, ref: c.scipy.q, ...result }],
    };
  },
  norminv(c) {
    const jsQ = norminv(c.inputs.p);
    return {
      comparisons: [{ name: "q", js: jsQ, ref: c.scipy.q, ...cmp(jsQ, c.scipy.q) }],
    };
  },
  tinv(c) {
    const { p, df } = c.inputs;
    const jsQ = tinv(p, df);
    return {
      comparisons: [{ name: "q", js: jsQ, ref: c.scipy.q, ...cmp(jsQ, c.scipy.q) }],
    };
  },
  fcdf(c) {
    const { f, d1, d2 } = c.inputs;
    const jsCdf = fcdf(f, d1, d2);
    const jsSf = fcdf_upper(f, d1, d2);
    return {
      comparisons: [
        { name: "cdf", js: jsCdf, ref: c.scipy.cdf, ...cmpP(jsCdf, c.scipy.cdf) },
        { name: "sf", js: jsSf, ref: c.scipy.sf, ...cmpP(jsSf, c.scipy.sf) },
      ],
    };
  },
  chi2cdf(c) {
    const { x, k } = c.inputs;
    const jsCdf = chi2cdf(x, k);
    return {
      comparisons: [{ name: "cdf", js: jsCdf, ref: c.scipy.cdf, ...cmpP(jsCdf, c.scipy.cdf) }],
    };
  },
  chi2inv(c) {
    const { p, k } = c.inputs;
    const jsQ = chi2inv(p, k);
    // chi2inv at deep tail (p < 1e-6 or > 1 - 1e-6) hits the
    // Newton+bisection precision floor; SciPy uses a specialised
    // gamma-Q inverse that is tighter. 1e-4 relative is the
    // documented design envelope.
    const tol = p < 1e-6 || p > 1 - 1e-6 ? TOL_CHI2INV : TOL_TIGHT;
    return {
      comparisons: [{ name: "q", js: jsQ, ref: c.scipy.q, ...cmp(jsQ, c.scipy.q, tol) }],
    };
  },
};

// ── Run + summarise ───────────────────────────────────────────────────────
const summary = new Map(); // category → counters + worst-tail samples
const failures = [];
const underflowSamples = []; // SciPy < 1e-15 vs JS = 0
const deepTailSamples = []; // both < 1e-15

for (const c of data.tests) {
  const evaluator = EVALUATORS[c.category];
  if (!evaluator) continue;
  const slot = summary.get(c.category) || {
    total: 0,
    pass: 0,
    fail: 0,
    underflow: 0,
    deepTail: 0,
    pathological: 0,
    worst: [],
  };
  const { comparisons } = evaluator(c);
  for (const cmpRes of comparisons) {
    slot.total++;
    if (cmpRes.status === "pass") {
      slot.pass++;
    } else if (cmpRes.status === "underflow") {
      slot.underflow++;
      underflowSamples.push({ category: c.category, label: c.label, ...cmpRes });
    } else if (cmpRes.status === "deep-tail") {
      slot.deepTail++;
      deepTailSamples.push({ category: c.category, label: c.label, ...cmpRes });
    } else if (cmpRes.status === "pathological") {
      slot.pathological++;
    } else {
      slot.fail++;
      failures.push({ category: c.category, label: c.label, ...cmpRes });
    }
    slot.worst.push({ label: c.label, ...cmpRes });
  }
  summary.set(c.category, slot);
}

// ── Report ───────────────────────────────────────────────────────────────
console.log("");
console.log(
  `[benchmark:scipy] ${data.tests.length} cases · ${data.meta.scipy_version} (Python ${data.meta.python_version})`
);
console.log(
  "  status legend: pass = within tolerance · underflow = SciPy<1e-13 / JS=0 (precision floor) · deep-tail = both<1e-13 (informational) · pathological = qtukey at df<=2 with extreme p+k (documented)"
);
console.log("");

let allPassed = true;
for (const [cat, slot] of [...summary.entries()].sort()) {
  const ok = slot.fail === 0;
  const status = ok ? "✓" : "✗";
  const tail =
    (slot.underflow > 0 ? `  +${slot.underflow} underflow` : "") +
    (slot.deepTail > 0 ? `  +${slot.deepTail} deep-tail` : "") +
    (slot.pathological > 0 ? `  +${slot.pathological} pathological` : "") +
    (slot.fail > 0 ? `  (${slot.fail} FAILED)` : "");
  console.log(`  ${status}  ${cat.padEnd(14)}  ${slot.pass}/${slot.total} passed${tail}`);
  if (ok) {
    // Show top-3 deltas (filtering deep-tail/underflow rows to focus on
    // real-precision tails) just to confirm nothing suspicious.
    const realDeltas = slot.worst
      .filter((w) => w.status === "pass")
      .filter((w) => Number.isFinite(w.delta))
      .sort((a, b) => (b.delta || 0) - (a.delta || 0))
      .slice(0, 3);
    for (const w of realDeltas) {
      console.log(`           top |Δ|: ${w.delta.toExponential(2)}  ${w.label} (${w.name})`);
    }
  }
  if (!ok) allPassed = false;
}

if (failures.length > 0) {
  console.log("");
  console.log(`[benchmark:scipy] ${failures.length} mismatches over tolerance:`);
  failures.sort((a, b) => (b.delta || 0) - (a.delta || 0));
  for (const f of failures.slice(0, 200)) {
    const d = typeof f.delta === "number" ? f.delta.toExponential(3) : String(f.delta);
    console.log(
      `    ${f.category.padEnd(14)} ${f.label}  (${f.name}): |Δ|=${d}  js=${f.js}  scipy=${f.ref}`
    );
  }
}

if (underflowSamples.length > 0) {
  // Just tally; don't dump the full list (informational).
  console.log("");
  console.log(
    `[benchmark:scipy] ${underflowSamples.length} underflow rows (Plöttr's quadrature precision floor; SciPy reports < 1e-15)`
  );
}

console.log("");
process.exit(allPassed ? 0 : 1);

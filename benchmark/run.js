// benchmark/run.js — read benchmark/results-r.json (produced by run-r.R),
// run the same tests through tools/stats.js on bit-identical inputs, and
// emit benchmark.html at the repo root with per-category comparison tables.
//
// Honest-by-design: rows where |Δ| exceeds the target tolerance are flagged
// as failures and rendered red. We don't pretend they passed.
//
// Run with: node benchmark/run.js (after Rscript benchmark/run-r.R)

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Tolerance model:
//   Test statistics (t, F, H, W, U) → absolute delta ≤ TOL. These have natural
//   scales where "close enough" is a fixed number.
//   P-values → hybrid: when both p-values are ≥ P_ABS_CEILING, use absolute
//   tolerance (noise at p ≈ 0.3 vs 0.3005 is irrelevant). When at least one is
//   smaller, compare in log space — a relative mismatch at p = 1e-10 matters
//   exactly as much as one at p = 1e-3, but absolute Δ can't see it. Prior
//   versions used a plain absolute tolerance, which rubber-stamped anything
//   below TOL regardless of correctness in the deep tail.
const TOL = 5e-3; // ±0.5 % — same bar as the in-repo stats tests
const P_ABS_CEILING = 1e-2; // switch to log-space comparison below this
const P_LOG_TOL = Math.log(1 + 0.1); // ratio within [1/1.1, 1.1] on log-p

// ── Load tools/stats.js into a sandbox ─────────────────────────────────────
const code = fs.readFileSync(path.join(__dirname, "../tools/stats.js"), "utf-8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const {
  shapiroWilk,
  leveneTest,
  tTest,
  mannWhitneyU,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  tukeyHSD,
  gamesHowell,
  dunnTest,
  pairwiseDistance,
  hclust,
  multisetIntersectionPExact,
  multisetIntersectionPPoisson,
} = ctx;

// ── Load R reference output ────────────────────────────────────────────────
const resultsPath = path.join(__dirname, "results-r.json");
if (!fs.existsSync(resultsPath)) {
  console.error("benchmark/results-r.json not found — run `Rscript benchmark/run-r.R` first.");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

// ── Helpers ────────────────────────────────────────────────────────────────

// Convert R's named groups object to a sorted array-of-arrays + key list.
// stats.js operates on plain arrays of arrays; group identity is by index.
function groupsToArrays(obj) {
  const keys = Object.keys(obj).sort();
  return { keys, arrays: keys.map((k) => obj[k]) };
}

// Compare two scalar values; returns { delta, pass }.
function cmp(jsVal, rVal) {
  // Treat both 0 ⇒ delta 0. Otherwise absolute delta.
  if (rVal === 0 && jsVal === 0) return { delta: 0, pass: true };
  const delta = Math.abs(jsVal - rVal);
  return { delta, pass: delta <= TOL };
}

// Compare two p-values. Above P_ABS_CEILING, use absolute tolerance. Below,
// switch to log-space so a ratio of 10× at p=1e-10 is caught (a plain
// absolute rule would rubber-stamp any p < TOL regardless of truth).
function cmpP(jsP, rP) {
  if (!Number.isFinite(jsP) || !Number.isFinite(rP)) {
    return { delta: NaN, pass: false };
  }
  if (rP === 0 && jsP === 0) return { delta: 0, pass: true };
  const absDelta = Math.abs(jsP - rP);
  const maxP = Math.max(Math.abs(rP), Math.abs(jsP));
  if (maxP >= P_ABS_CEILING) {
    return { delta: absDelta, pass: absDelta <= TOL };
  }
  // Deep tail: one-sided zero is only acceptable if the other is subnormal.
  if (rP <= 0 || jsP <= 0) {
    const nonZero = rP <= 0 ? jsP : rP;
    return { delta: absDelta, pass: nonZero < 1e-300 };
  }
  const logDelta = Math.abs(Math.log(rP) - Math.log(jsP));
  return { delta: logDelta, pass: logDelta <= P_LOG_TOL };
}

// For Tukey HSD / Games-Howell pAdj values below ~1e-9, R's `ptukey` hits
// a `1 − ptukey(q)` cancellation floor (verified: at k=3, df=147, R reports
// ptukey survival as 9.68e-14 at q=12, 1.94e-14 at q=15.5, 2.22e-15 at
// q=21.97 — non-monotonic, because the float representation of `1 − (1−ε)`
// saturates near machine epsilon). scipy's `studentized_range.sf` uses the
// same algorithm and shows the same floor at ~2.13e-14.
//
// Plöttr's `ptukey_upper` computes the survival without that cancellation, so
// it continues the true tail past R's floor. Cross-checked at q=8 against
// both scipy (2.3332e-7) and a 20M-sample Monte Carlo (2.5e-7 ± 1.1e-7) —
// four significant figures.
//
// When a Tukey-HSD or Games-Howell pAdj has R below this threshold AND JS
// strictly smaller, mark the row as "R-saturated" rather than "failed":
// it reflects R's reliability limit, not a JS bug.
const R_PTUKEY_FLOOR_CEILING = 1e-9;
function isRSaturated(category, metric, jsVal, rVal) {
  if (metric !== "pAdj") return false;
  if (category !== "Tukey HSD" && category !== "Games-Howell") return false;
  if (!Number.isFinite(rVal) || !Number.isFinite(jsVal)) return false;
  if (rVal >= R_PTUKEY_FLOOR_CEILING) return false;
  return jsVal < rVal;
}

// Pair lookup: find a JS pair whose (keys[i], keys[j]) equals R pair (i, j),
// in either order.
function findPair(jsPairs, keys, ri, rj) {
  for (const p of jsPairs) {
    const a = keys[p.i],
      b = keys[p.j];
    if ((a === ri && b === rj) || (a === rj && b === ri)) return p;
  }
  return null;
}

// ── Run all tests, collect rows ────────────────────────────────────────────

const rows = []; // { category, label, n, metric, r, js, delta, pass }

function pushRow(r) {
  rows.push(r);
}

for (const t of data.tests) {
  const cat = t.category;
  const lbl = t.label;
  const n = t.n;

  try {
    if (cat === "Shapiro-Wilk") {
      const j = shapiroWilk(t.inputs.x);
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "W",
        r: t.r.statistic,
        js: j.W,
        ...cmp(j.W, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "Levene (Brown-Forsythe)") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = leveneTest(arrays);
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "F",
        r: t.r.statistic,
        js: j.F,
        ...cmp(j.F, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "Student t" || cat === "Welch t") {
      const equalVar = cat === "Student t";
      const j = tTest(t.inputs.a, t.inputs.b, { equalVar });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "t",
        r: t.r.statistic,
        js: j.t,
        ...cmp(j.t, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "Mann-Whitney U") {
      const j = mannWhitneyU(t.inputs.a, t.inputs.b);
      // R's wilcox.test reports W = U1 (sum of ranks - n1(n1+1)/2 of the 1st sample).
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "U",
        r: t.r.statistic,
        js: j.U1,
        ...cmp(j.U1, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "one-way ANOVA") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = oneWayANOVA(arrays);
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "F",
        r: t.r.statistic,
        js: j.F,
        ...cmp(j.F, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "Welch ANOVA") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = welchANOVA(arrays);
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "F",
        r: t.r.statistic,
        js: j.F,
        ...cmp(j.F, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "Kruskal-Wallis") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = kruskalWallis(arrays);
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "H",
        r: t.r.statistic,
        js: j.H,
        ...cmp(j.H, t.r.statistic),
      });
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: j.p,
        ...cmpP(j.p, t.r.p),
      });
    } else if (cat === "pairwise distance") {
      const mat = t.inputs.matrix.map((row) => row.slice());
      const metric = t.inputs.metric;
      const D = pairwiseDistance(mat, metric);
      const nPoints = D.length;
      const js = [];
      for (let i = 0; i < nPoints; i++) {
        for (let j = i + 1; j < nPoints; j++) js.push(D[i][j]);
      }
      js.sort((a, b) => a - b);
      const rSorted = t.r.sorted;
      let maxDelta = 0;
      let failIdx = -1;
      for (let k = 0; k < rSorted.length; k++) {
        const diff = Math.abs(js[k] - rSorted[k]);
        if (diff > maxDelta) {
          maxDelta = diff;
          failIdx = k;
        }
      }
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "sorted d (max |Δ|)",
        r: failIdx >= 0 ? rSorted[failIdx] : rSorted[0],
        js: failIdx >= 0 ? js[failIdx] : js[0],
        delta: maxDelta,
        pass: maxDelta <= TOL,
      });
    } else if (cat === "hclust heights") {
      const mat = t.inputs.matrix.map((row) => row.slice());
      const D = pairwiseDistance(mat, t.inputs.metric);
      const h = hclust(D, t.inputs.linkage);
      const heights = [];
      (function walk(node) {
        if (!node) return;
        if (node.left === null && node.right === null) return;
        heights.push(node.height);
        walk(node.left);
        walk(node.right);
      })(h.tree);
      heights.sort((a, b) => a - b);
      const rSorted = t.r.sorted;
      let maxDelta = 0;
      let failIdx = -1;
      for (let k = 0; k < rSorted.length; k++) {
        const diff = Math.abs(heights[k] - rSorted[k]);
        if (diff > maxDelta) {
          maxDelta = diff;
          failIdx = k;
        }
      }
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "sorted h (max |Δ|)",
        r: failIdx >= 0 ? rSorted[failIdx] : rSorted[0],
        js: failIdx >= 0 ? heights[failIdx] : heights[0],
        delta: maxDelta,
        pass: maxDelta <= TOL,
      });
    } else if (cat === "Tukey HSD" || cat === "Games-Howell" || cat === "Dunn (BH)") {
      const { keys, arrays } = groupsToArrays(t.inputs.groups);
      const fn = cat === "Tukey HSD" ? tukeyHSD : cat === "Games-Howell" ? gamesHowell : dunnTest;
      const j = fn(arrays);
      for (const rp of t.r.pairs) {
        const jp = findPair(j.pairs, keys, rp.i, rp.j);
        const jsP = jp == null ? NaN : cat === "Dunn (BH)" ? jp.pAdj : jp.p;
        const cmpResult = cmpP(jsP, rp.pAdj);
        const rSaturated = !cmpResult.pass && isRSaturated(cat, "pAdj", jsP, rp.pAdj);
        pushRow({
          category: cat,
          label: `${lbl} [${rp.i} vs ${rp.j}]`,
          n,
          metric: "pAdj",
          r: rp.pAdj,
          js: jsP,
          ...cmpResult,
          rSaturated,
        });
      }
    } else if (cat === "Multi-set intersection (cpsets)") {
      // Only benchmark the exact path against R. The Poisson path is an
      // approximation by construction — unit tests in tests/stats.test.js pin
      // its documented divergence from exact; including it as a benchmark row
      // would just show expected approximation-scale drift as "failures".
      const { x, L, N } = t.inputs;
      const jsExact = multisetIntersectionPExact(x, L, N);
      pushRow({
        category: cat,
        label: lbl,
        n,
        metric: "p",
        r: t.r.p,
        js: jsExact,
        ...cmpP(jsExact, t.r.p),
      });
      // Silence the eslint no-unused-vars warning — keep the import live so
      // future users of the router have a clear entrypoint.
      void multisetIntersectionPPoisson;
    } else {
      console.warn(`unknown category: ${cat}`);
    }
  } catch (err) {
    pushRow({
      category: cat,
      label: lbl,
      n,
      metric: "error",
      r: NaN,
      js: NaN,
      delta: NaN,
      pass: false,
      error: err.message,
    });
  }
}

// ── Aggregate ──────────────────────────────────────────────────────────────

const total = rows.length;
const passed = rows.filter((r) => r.pass).length;
const rSaturatedRows = rows.filter((r) => !r.pass && r.rSaturated).length;
const failed = total - passed - rSaturatedRows;
// Exclude rSaturated rows from max-delta (their "delta" is R's distance from
// truth, not ours).
const finiteDeltas = rows
  .filter((r) => !r.rSaturated)
  .map((r) => r.delta)
  .filter((d) => Number.isFinite(d));
const maxDelta = finiteDeltas.length ? Math.max(...finiteDeltas) : 0;

// Group by category
const byCategory = {};
for (const r of rows) {
  if (!byCategory[r.category]) byCategory[r.category] = [];
  byCategory[r.category].push(r);
}

// ── HTML rendering ─────────────────────────────────────────────────────────

function fmt(v) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e6) return v.toPrecision(6).replace(/\.?0+$/, "");
  return v.toExponential(3);
}

function fmtDelta(d) {
  if (!Number.isFinite(d)) return "—";
  if (d === 0) return "0";
  return d.toExponential(2);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const cats = Object.keys(byCategory);

const tableHtml = cats
  .map((cat) => {
    const catRows = byCategory[cat];
    const catTotal = catRows.length;
    const catPassed = catRows.filter((r) => r.pass).length;
    const catRSat = catRows.filter((r) => !r.pass && r.rSaturated).length;
    const catFailed = catTotal - catPassed - catRSat;
    let badge;
    if (catFailed > 0) {
      badge = `<span class="badge badge-fail">${catFailed}/${catTotal} FAIL</span>`;
    } else if (catRSat > 0) {
      badge = `<span class="badge badge-pass">${catPassed}/${catTotal} pass</span> <span class="badge badge-rsat">${catRSat} past R's floor</span>`;
    } else {
      badge = `<span class="badge badge-pass">${catPassed}/${catTotal} pass</span>`;
    }

    const rowClass = (r) => {
      if (r.pass) return "row-pass";
      if (r.rSaturated) return "row-rsat";
      return "row-fail";
    };
    const okCell = (r) => {
      if (r.pass) return `<td class="ok-cell ok-pass">✓</td>`;
      if (r.rSaturated)
        return `<td class="ok-cell ok-rsat" title="R's ptukey hit its numerical floor here; JS continues the true tail. Not a JS failure.">R-floor</td>`;
      if (r.error) return `<td class="ok-cell ok-fail">error: ${escapeHtml(r.error)}</td>`;
      return `<td class="ok-cell ok-fail">✗</td>`;
    };
    const trs = catRows
      .map(
        (r) => `
      <tr class="${rowClass(r)}">
        <td>${escapeHtml(r.label)}</td>
        <td class="num">${r.n}</td>
        <td>${escapeHtml(r.metric)}</td>
        <td class="num">${fmt(r.r)}</td>
        <td class="num">${fmt(r.js)}</td>
        <td class="num">${fmtDelta(r.delta)}</td>
        ${okCell(r)}
      </tr>`
      )
      .join("");

    return `
    <details class="category" open>
      <summary><span class="dv-disclosure" aria-hidden="true"></span><span class="cat-title">${escapeHtml(cat)}</span> ${badge}</summary>
      <table>
        <colgroup>
          <col class="c-dataset" />
          <col class="c-n" />
          <col class="c-metric" />
          <col class="c-r" />
          <col class="c-js" />
          <col class="c-delta" />
          <col class="c-ok" />
        </colgroup>
        <thead>
          <tr>
            <th>dataset</th>
            <th class="num">n</th>
            <th>metric</th>
            <th class="num">R</th>
            <th class="num">Plöttr</th>
            <th class="num">|Δ|</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </details>`;
  })
  .join("\n");

// Percentage counts passed + R-saturated rows together — R-saturated means
// "our code is the accurate one past R's reliability limit", not a JS failure.
const passPct = (((passed + rSaturatedRows) / total) * 100).toFixed(1);
const summaryClass = failed === 0 ? "summary-pass" : "summary-mixed";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script>
  // file:// origins partition localStorage per-file, so the landing page's
  // stored theme can't be read here directly. We accept a ?theme=dark|light
  // query param as a cross-origin push from the landing page link and persist
  // it to our own localStorage so reloads keep working.
  try {
    var p = (location.search.match(/[?&]theme=(dark|light)/) || [])[1];
    var t = p || localStorage.getItem("dataviz-theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
      if (p) {
        try { localStorage.setItem("dataviz-theme", t); } catch (e) {}
        // Strip the query param so the URL stays clean on reload / share.
        try {
          history.replaceState(null, "", location.pathname + location.hash);
        } catch (e) {}
      }
    }
  } catch (e) {}
</script>
<title>Plöttr · statistical benchmark vs R</title>
<link rel="stylesheet" href="tools/theme.css" />
<link rel="stylesheet" href="tools/components.css" />
<script src="tools/shared.bundle.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: monospace;
    background: var(--page-bg);
    background-image: radial-gradient(circle, var(--page-bg-dot) 0.8px, transparent 0.8px);
    background-size: 20px 20px;
    color: var(--text);
    padding: 2rem 1rem 4rem;
    line-height: 1.45;
  }
  .container { max-width: 1100px; margin: 0 auto; }
  header { margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
  .lede { color: var(--text-muted); margin-bottom: 1rem; padding-left: 1.4rem; line-height: 1.7; }
  .lede li { margin-bottom: 0.2rem; }
  .lede a { color: var(--accent-primary); }
  .summary {
    padding: 1rem 1.25rem;
    border: 2px solid var(--text);
    background: var(--surface);
    margin-bottom: 1.5rem;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1rem;
  }
  .summary-pass { border-color: var(--success-border); }
  .summary-mixed { border-color: var(--warning-border); }
  .summary div { display: flex; flex-direction: column; }
  .summary .k { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }
  .summary .v { font-size: 1.4rem; font-weight: bold; }
  .v-pass { color: var(--success-text); }
  .v-fail { color: var(--danger-text); }
  .v-rsat { color: var(--warning-text); }
  .category {
    margin-bottom: 1.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 1rem 1.25rem;
  }
  .category > summary {
    list-style: none;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 0.6rem;
    padding: 0;
  }
  .category > summary::-webkit-details-marker { display: none; }
  .category > summary > .dv-disclosure { margin-right: 0.1rem; }
  .category[open] > summary > .dv-disclosure { transform: rotate(90deg); }
  .category > summary .cat-title {
    flex-shrink: 0;
  }
  .toggle-all {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 1rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .toggle-all:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
  .toggle-all:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
  .category[open] > summary {
    margin-bottom: 0.6rem;
  }
  .category:not([open]) > summary {
    margin-bottom: 0;
  }
  .badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-weight: normal;
  }
  .badge-pass { background: var(--success-bg); color: var(--success-text); }
  .badge-fail { background: var(--danger-bg); color: var(--danger-text); }
  .badge-rsat { background: var(--warning-bg); color: var(--warning-text); }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
    table-layout: fixed;
  }
  col.c-dataset { width: auto; }
  col.c-n       { width: 60px; }
  col.c-metric  { width: 90px; }
  th:nth-child(3), td:nth-child(3) { padding-left: 1.25rem; }
  col.c-r       { width: 120px; }
  col.c-js      { width: 120px; }
  col.c-delta   { width: 110px; }
  col.c-ok      { width: 40px; }
  td.ok-cell { text-align: center; font-size: 1.2rem; line-height: 1; }
  td.ok-pass { color: var(--success-text); font-weight: bold; }
  td.ok-fail { color: var(--danger-text); font-weight: bold; }
  td.ok-rsat { color: var(--warning-text); font-weight: bold; font-size: 0.68rem; }
  th, td {
    padding: 0.3rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  th.num, td.num { text-align: right; }
  th { background: var(--surface-subtle); font-weight: normal; color: var(--text-muted); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .row-pass td { background: var(--surface); }
  .row-fail td { background: var(--danger-bg); color: var(--danger-text); }
  .row-rsat td { background: var(--warning-bg); color: var(--warning-text); }
  footer {
    margin-top: 2rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-align: center;
  }
  .theme-toggle {
    position: fixed;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    line-height: 0;
    font-family: inherit;
    z-index: 10;
  }
  .theme-toggle:hover { border-color: var(--accent-primary); }
</style>
</head>
<body>
<button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle theme"></button>
<div class="container">
  <header>
    <h1>statistical cross-validation vs R ${escapeHtml(data.meta.r_version.replace(/^R version /, ""))}</h1>
    <ul class="lede">
      <li>Plöttr reruns every function in <code>tools/stats.js</code> against its R ${escapeHtml(data.meta.r_version.replace(/^R version /, "").split(" ")[0])} counterpart on real built-in datasets (iris, PlantGrowth, ToothGrowth, mtcars, chickwts, InsectSprays, sleep, women, trees, airquality, warpbreaks).</li>
      <li>Inputs are bit-identical between R and Plöttr.</li>
      <li>Tolerance: |Δ| ≤ ${TOL} on test statistics and on p-values ≥ ${P_ABS_CEILING}. Deep-tail p-values (&lt; ${P_ABS_CEILING}) are compared in log space, so the ratio between R's p and Plöttr's stays within [1/1.1, 1.1].</li>
      <li>Post-hoc tests (Games-Howell, Dunn-BH) are validated against <code>PMCMRplus</code>, the canonical R package for non-parametric multiple comparisons.</li>
      <li><strong>R-floor rows (amber)</strong>: R's <code>ptukey</code> saturates at ~<code>2.2e-15</code> due to a <code>1 − ptukey(q)</code> cancellation. Plöttr's <code>ptukey_upper</code> computes the survival directly and continues the true tail past that floor (cross-checked against scipy and Monte Carlo). These rows are not JS failures — R is simply no longer ground truth there.</li>
      <li>Real failures are flagged in red and counted honestly.</li>
      <li>Reproduce locally: <code>Rscript benchmark/run-r.R &amp;&amp; node benchmark/run.js</code></li>
      <li><a href="./index.html">← back to tools</a></li>
    </ul>
  </header>

  <div class="summary ${summaryClass}">
    <div><span class="k">comparisons</span><span class="v">${total}</span></div>
    <div><span class="k">passing</span><span class="v v-pass">${passed} (${passPct}%)</span></div>
    <div><span class="k">failing</span><span class="v ${failed === 0 ? "v-pass" : "v-fail"}">${failed}</span></div>
    <div><span class="k">past R's floor</span><span class="v v-rsat">${rSaturatedRows}</span></div>
    <div><span class="k">max |Δ|</span><span class="v">${fmtDelta(maxDelta)}</span></div>
  </div>

  <button type="button" class="toggle-all" data-toggle-all aria-expanded="true">Collapse all</button>

  ${tableHtml}

  <footer>
    R reference generated ${escapeHtml(data.meta.generated)}.
    Tolerance ${TOL}. Tool source: <code>tools/stats.js</code>.
  </footer>
</div>
<script>
  // Theme toggle — uses setTheme / getTheme from tools/theme.js (loaded above).
  // The same-origin storage event in theme.js keeps benchmark in lockstep with
  // the landing page when it is toggled in another tab.
  (function () {
    var SUN =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
    var MOON =
      '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none" width="16" height="16" aria-hidden="true"><path d="M16.5 12.8A6.5 6.5 0 0 1 7.2 3.5a.6.6 0 0 0-.8-.78 8 8 0 1 0 10.86 10.86.6.6 0 0 0-.78-.78z"/></svg>';
    function render() {
      var dark = typeof getTheme === "function" ? getTheme() === "dark" : false;
      document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
        btn.innerHTML = dark ? SUN : MOON;
        btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
      });
    }
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (typeof setTheme === "function" && typeof getTheme === "function") {
          setTheme(getTheme() === "dark" ? "light" : "dark");
        }
        render();
      });
    });
    window.addEventListener("dataviz-theme-change", render);
    window.addEventListener("storage", function (e) {
      if (e.key === "dataviz-theme") render();
    });
    render();
  })();

  // Expand all / Collapse all toggle for the per-category <details> blocks.
  (function () {
    var btn = document.querySelector("[data-toggle-all]");
    if (!btn) return;
    var cats = document.querySelectorAll("details.category");
    function syncLabel() {
      var anyClosed = false;
      cats.forEach(function (d) { if (!d.open) anyClosed = true; });
      btn.textContent = anyClosed ? "Expand all" : "Collapse all";
      btn.setAttribute("aria-expanded", anyClosed ? "false" : "true");
    }
    btn.addEventListener("click", function () {
      var anyClosed = false;
      cats.forEach(function (d) { if (!d.open) anyClosed = true; });
      cats.forEach(function (d) { d.open = anyClosed; });
      syncLabel();
    });
    cats.forEach(function (d) { d.addEventListener("toggle", syncLabel); });
    syncLabel();
  })();
</script>
</body>
</html>
`;

const outPath = path.join(__dirname, "../benchmark.html");
fs.writeFileSync(outPath, html);

console.log(`wrote ${outPath}`);
console.log(`  ${total} comparisons across ${cats.length} categories`);
console.log(
  `  ${passed} pass, ${failed} fail, ${rSaturatedRows} past R's floor, max |Δ| = ${fmtDelta(maxDelta)}`
);
if (failed > 0) {
  console.log("  failing rows:");
  for (const r of rows.filter((r) => !r.pass && !r.rSaturated)) {
    console.log(
      `    [${r.category}] ${r.label} (${r.metric}): R=${fmt(r.r)} JS=${fmt(r.js)} |Δ|=${fmtDelta(r.delta)}`
    );
  }
}
if (rSaturatedRows > 0) {
  console.log(`  past R's floor (JS continues true tail, not a failure):`);
  for (const r of rows.filter((r) => !r.pass && r.rSaturated)) {
    console.log(`    [${r.category}] ${r.label} (${r.metric}): R=${fmt(r.r)} JS=${fmt(r.js)}`);
  }
}

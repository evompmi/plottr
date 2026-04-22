// Fuzz test for the lineplot data pipeline.
//
// Feeds thousands of plausibly-broken CSV/TSV strings through
//   parseRaw → computeSeries → computePerXStats (→ selectTest → chosen test → bhAdjust)
// and fails if any stage throws. Oracle: "no uncaught exception" plus a
// handful of shape invariants (per-x groups array length, pAdj either null
// or in [0,1]).
//
// Audit M8: the two helpers used to be hand-mirrored in this file — a real
// bug risk since the lineplot tool could drift from the fuzz oracle without
// anything noticing. Now uses the actual `computeSeries` /
// `computePerXStats` from `tools/lineplot/helpers.ts` via the loader.
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseRaw,
  isNumericValue,
  computeSeries,
  computePerXStats,
} = require("../helpers/lineplot-loader");
const { GENERATORS, makeRng } = require("./generators");

const SEED = parseInt(process.env.FUZZ_SEED || "1", 10);
const N = parseInt(process.env.FUZZ_N || "1000", 10);
const QUIET = !!process.env.FUZZ_QUIET;

const failures = [];

function truncate(text, max = 200) {
  if (text.length <= max) return text;
  return text.slice(0, max) + `… (${text.length - max} more chars)`;
}

function recordFailure(seed, iter, genLabel, stage, err, text) {
  failures.push({
    seed,
    iter,
    gen: genLabel,
    stage,
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : "",
    excerpt: truncate(text),
  });
}

// Build the `data` matrix lineplot feeds into computeSeries: a numeric
// matrix with null for non-numeric / missing cells. Mirror of what the
// tool does between parse and compute.
function coerceNumericMatrix(rows, nCols) {
  return rows.map((row) => {
    const out = new Array(nCols).fill(null);
    for (let c = 0; c < nCols && c < row.length; c++) {
      const v = row[c];
      if (v === "" || v == null) continue;
      if (!isNumericValue(v)) continue;
      const n = Number(v);
      if (Number.isFinite(n)) out[c] = n;
    }
    return out;
  });
}

const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];
// Empty group-color overrides — the tool's per-group colour-picker output.
// An empty object means `computeSeries` falls back to the palette rotation.
const NO_GROUP_COLORS = {};

function runOne(seed, iter, genFn) {
  const rng = makeRng(seed);
  const { label, text } = genFn(rng);

  // Stage 1: parser.
  let parsed;
  try {
    parsed = parseRaw(text);
  } catch (err) {
    recordFailure(seed, iter, label, "parseRaw", err, text);
    return;
  }
  if (!parsed || !Array.isArray(parsed.rows) || !Array.isArray(parsed.headers)) {
    recordFailure(
      seed,
      iter,
      label,
      "parseRaw",
      new Error("parseRaw returned malformed result"),
      text
    );
    return;
  }
  const { headers, rows } = parsed;
  const nCols = headers.length;
  if (nCols < 2 || rows.length < 1) return;

  const pickerRng = makeRng((seed ^ 0x7331) >>> 0 || 1);
  const xCol = Math.floor(pickerRng() * nCols);
  const yCol = Math.floor(pickerRng() * nCols);
  // Coin-flip: either a real group column or null (single "all" group).
  const groupCol = pickerRng() < 0.5 ? null : Math.floor(pickerRng() * nCols);

  // Stage 2: coerce + computeSeries.
  const data = coerceNumericMatrix(rows, nCols);
  let series;
  try {
    series = computeSeries(data, rows, xCol, yCol, groupCol, NO_GROUP_COLORS, PALETTE);
  } catch (err) {
    recordFailure(seed, iter, label, "computeSeries", err, text);
    return;
  }
  if (!Array.isArray(series)) {
    recordFailure(
      seed,
      iter,
      label,
      "computeSeries",
      new Error("computeSeries did not return an array"),
      text
    );
    return;
  }
  for (const s of series) {
    for (const p of s.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.mean)) {
        recordFailure(
          seed,
          iter,
          label,
          "computeSeries",
          new Error(`series point has non-finite x/mean: x=${p.x} mean=${p.mean}`),
          text
        );
        break;
      }
    }
  }

  // Stage 3: per-x stats.
  let perX;
  try {
    perX = computePerXStats(series);
  } catch (err) {
    recordFailure(seed, iter, label, "computePerXStats", err, text);
    return;
  }
  if (!Array.isArray(perX)) {
    recordFailure(
      seed,
      iter,
      label,
      "computePerXStats",
      new Error("computePerXStats did not return an array"),
      text
    );
    return;
  }
  for (const r of perX) {
    if (r.pAdj != null && !(Number.isFinite(r.pAdj) && r.pAdj >= 0 && r.pAdj <= 1 + 1e-9)) {
      recordFailure(
        seed,
        iter,
        label,
        "computePerXStats",
        new Error(`pAdj out of [0,1]: ${r.pAdj}`),
        text
      );
      break;
    }
  }
}

function main() {
  console.log(`\n── lineplot fuzz — seed=${SEED} n=${N} ──`);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const iterSeed = (SEED * 2654435761 + i) >>> 0 || 1;
    const genPickerRng = makeRng(iterSeed);
    const g = GENERATORS[Math.floor(genPickerRng() * GENERATORS.length)];
    runOne(iterSeed, i, g);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} iter • ${failures.length} failures\r`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const byStage = {};
  for (const f of failures) byStage[f.stage] = (byStage[f.stage] || 0) + 1;

  console.log(`\n  ${N - failures.length}/${N} iterations clean · ${dt}s`);
  if (failures.length === 0) {
    console.log("  no crashes.\n");
    return;
  }

  console.log(`\n  ${failures.length} failure(s):`);
  for (const [stage, count] of Object.entries(byStage)) {
    console.log(`    ${count.toString().padStart(4)} × ${stage}`);
  }
  const maxDetail = Math.min(failures.length, 5);
  console.log(`\n  first ${maxDetail} repro(s):`);
  for (let i = 0; i < maxDetail; i++) {
    const f = failures[i];
    console.log(`\n  [${i + 1}] seed=${f.seed} iter=${f.iter} gen=${f.gen} stage=${f.stage}`);
    console.log(`      ${f.message}`);
    if (f.stack) {
      console.log(
        f.stack
          .split("\n")
          .map((l) => "      " + l)
          .join("\n")
      );
    }
    console.log(`      input: ${JSON.stringify(f.excerpt)}`);
  }
  console.log();
  process.exit(1);
}

main();

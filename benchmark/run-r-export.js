// benchmark/run-r-export.js — closes audit-23 finding #6.
//
// The Plöttr stats panel's "⬇ R" button generates an R script the user can
// re-run in RStudio to reproduce the JS computation. tests/r-export.test.js
// only checks the script is *parseable* (formatting, escaping, vector
// shape). Until this file existed, nothing actually executed the script in
// real R and verified that the p-values it produces match what JS reported.
// A typo like `var.equal = TRU` (missing E) would pass every formatting test
// and silently fail in real R, breaking the marketed reproducibility claim.
//
// What this does:
//   1. Pick a fixed two-group dataset with known JS results.
//   2. Build the R script via the same `buildRScript` the user clicks.
//   3. Write to a temp file, run via `Rscript`, capture stdout.
//   4. Parse the t.test() block for `p-value = <X>`.
//   5. Assert |JS_p - R_p| within tolerance.
//
// Gated behind `npm run benchmark` so CI without R installed still passes.
// Exits 0 on success, 1 on tolerance breach. If Rscript isn't on PATH, this
// script logs a skip note and exits 0 — matching the behaviour of the
// existing benchmark/run.js when results-r.json is regenerated.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

// ── Pre-flight: is Rscript available? ──────────────────────────────────────
function rscriptAvailable() {
  try {
    execFileSync("Rscript", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
if (!rscriptAvailable()) {
  console.log("[run-r-export] Rscript not found on PATH — skipping R-export integration test.");
  process.exit(0);
}

// ── Load Plöttr's stats engine + R-script builder into a vm context ───────
const ctx = {
  Math,
  Number,
  String,
  Array,
  Object,
  Boolean,
  Set,
  Map,
  Date,
  JSON,
  Infinity,
  NaN,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  console,
};
vm.createContext(ctx);
const TOOLS = path.join(__dirname, "../tools");
vm.runInContext(fs.readFileSync(path.join(TOOLS, "stats.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(TOOLS, "shared-r-export.js"), "utf8"), ctx);

const { tTest, buildRScript } = ctx;

// ── Fixed two-group dataset with a tractable Student t result ──────────────
// Mean diff = 2, equal n=5 per group, equal variance — Student-t exact and
// well within R's printed precision. Independent of any other Plöttr state.
const NAMES = ["ctrl", "treat"];
const VALUES = [
  [1, 2, 3, 4, 5],
  [3, 4, 5, 6, 7],
];

const jsResult = tTest(VALUES[0], VALUES[1], { equalVar: true });
if (!jsResult || jsResult.error) {
  console.error("[run-r-export] tTest produced no JS result:", jsResult);
  process.exit(1);
}
const jsP = jsResult.p;

// ── Build the R script using the same builder the user clicks ─────────────
const rScript = buildRScript({
  names: NAMES,
  values: VALUES,
  chosenTest: "studentT",
  postHocName: null,
  recommendation: null,
  dataNote: "audit-23 #6 R-export integration test",
});

if (!rScript || typeof rScript !== "string" || !rScript.trim()) {
  console.error("[run-r-export] buildRScript returned an empty script.");
  process.exit(1);
}

// ── Drop to disk + execute Rscript ─────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plottr-r-export-"));
const scriptPath = path.join(tmp, "export.R");
fs.writeFileSync(scriptPath, rScript);

const run = spawnSync("Rscript", ["--vanilla", scriptPath], {
  encoding: "utf8",
  // The descriptive script also prints Shapiro / Levene; we only parse the
  // t.test block. Allow stderr to pass through silently — install warnings
  // for `car` etc. should not fail the test.
});
fs.rmSync(tmp, { recursive: true, force: true });

if (run.status !== 0) {
  console.error("[run-r-export] Rscript exited with non-zero status:", run.status);
  console.error("STDOUT:\n", run.stdout);
  console.error("STDERR:\n", run.stderr);
  process.exit(1);
}

// ── Parse the t.test block for `p-value = <X>` ────────────────────────────
// R prints the test name on its own line ("Two Sample t-test") then a few
// lines of metadata, including `t = -2.83, df = 8, p-value = 0.02212`. The
// generated script may also print Shapiro and Levene which include their
// own p-values; the t-test's p is anchored by the immediately-preceding
// "Two Sample t-test" header so we find it by scanning forward from there.
const lines = run.stdout.split("\n");
let tBlockStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (/Two Sample t-test/i.test(lines[i])) {
    tBlockStart = i;
    break;
  }
}
if (tBlockStart < 0) {
  console.error("[run-r-export] couldn't find the t-test block in R output.");
  console.error("STDOUT:\n", run.stdout);
  process.exit(1);
}

let rP = null;
const rangeEnd = Math.min(tBlockStart + 6, lines.length);
for (let i = tBlockStart; i < rangeEnd; i++) {
  const m = lines[i].match(/p-value\s*[<=]\s*([0-9.eE+-]+)/);
  if (m) {
    rP = parseFloat(m[1]);
    break;
  }
}
if (rP === null || !Number.isFinite(rP)) {
  console.error("[run-r-export] couldn't parse a p-value out of the t-test block.");
  console.error("STDOUT:\n", run.stdout);
  process.exit(1);
}

// ── Compare ────────────────────────────────────────────────────────────────
// R's `t.test` print rounds p to 4 significant figures (`p-value = 0.02212`).
// JS keeps full double precision. Tolerance accounts for the printed
// rounding plus any deep-tail divergence.
const TOL_ABS = 1e-3;
const TOL_REL = 1e-2;
const absDelta = Math.abs(jsP - rP);
const relDelta = absDelta / Math.max(jsP, rP);
const passed = absDelta <= TOL_ABS || relDelta <= TOL_REL;

const summary = [
  "[run-r-export] R-export integration test",
  `  dataset:    ${NAMES.join(" vs ")} (n=${VALUES[0].length} each)`,
  `  test:       Student's t-test (equal variance)`,
  `  JS p-value: ${jsP.toFixed(8)}`,
  `  R  p-value: ${rP.toFixed(8)}`,
  `  |Δ|:        ${absDelta.toExponential(2)} (abs) / ${relDelta.toExponential(2)} (rel)`,
  `  tolerance:  ${TOL_ABS} (abs) or ${TOL_REL} (rel)`,
  `  result:     ${passed ? "✓ PASS" : "✗ FAIL"}`,
];
console.log(summary.join("\n"));
process.exit(passed ? 0 : 1);

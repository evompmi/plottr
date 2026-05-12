// One-off performance spike. Boots a local static-file server, drives
// Chromium through each plot tool's example dataset (plus a few
// synthetic-large datasets for the suspect tools), times each phase,
// and writes a markdown report under `docs/`.
//
// Run: `node scripts/perf-spike.mjs`. Requires `python3` on PATH for
// the local file server (mirrors the e2e suite's setup).
//
// What we measure per tool (wall clock from Playwright's perspective):
//   1. navigate   — page.goto(url) → load event
//   2. ingest+render — from "load-example".click() to the chart's
//      data-layer selector becoming visible (the user-perceived
//      first-paint of the chart for the example dataset)
//
// For volcano / scatter / heatmap we additionally paste a synthetic
// large dataset (transcriptomics-scale 20k points, 5k points,
// 1000×30 matrix) through the paste textarea and time render again.
//
// The spike is not a benchmark — numbers are single-run, with the
// usual cold-cache + JIT-warmup noise. Anything within 2× of another
// measurement should be treated as a tie; differences of 10× or more
// are the only signals to act on.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 8766;
const BASE = `http://localhost:${PORT}`;
const REPORT = "docs/perf-spike-2026-05-12.md";

// ── Synthetic CSV generators (deterministic via Park-Miller LCG) ──────

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function csv(rows) {
  return rows.map((r) => r.join(",")).join("\n");
}

function genVolcano(n) {
  const r = rng(42);
  const rows = [["gene", "log2FoldChange", "pvalue"]];
  for (let i = 0; i < n; i++) {
    const lfc = (r() - 0.5) * 8;
    const p = Math.pow(10, -r() * 10);
    rows.push([`g${i}`, lfc.toFixed(3), p.toExponential(3)]);
  }
  return csv(rows);
}

function genScatter(n) {
  const r = rng(43);
  const rows = [["x", "y"]];
  for (let i = 0; i < n; i++) {
    const x = r() * 100;
    const y = x * 0.5 + 10 + (r() - 0.5) * 20;
    rows.push([x.toFixed(3), y.toFixed(3)]);
  }
  return csv(rows);
}

function genHeatmap(nRows, nCols) {
  const r = rng(44);
  const header = ["gene"];
  for (let c = 0; c < nCols; c++) header.push(`s${c}`);
  const rows = [header];
  for (let i = 0; i < nRows; i++) {
    const row = [`g${i}`];
    for (let c = 0; c < nCols; c++) row.push(((r() - 0.5) * 4).toFixed(3));
    rows.push(row);
  }
  return csv(rows);
}

// ── Server lifecycle ──────────────────────────────────────────────────

async function startServer() {
  const proc = spawn("python3", ["-m", "http.server", String(PORT)], {
    stdio: "ignore",
    cwd: process.cwd(),
  });
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/index.html`);
      if (r.ok) return proc;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error("http.server failed to start on " + PORT);
}

// ── Per-tool example-load timing ──────────────────────────────────────

const TOOLS = [
  { slug: "boxplot", chart: "svg g#groups > g", needsStepPlot: true },
  { slug: "scatter", chart: "svg g#data-points circle", needsStepPlot: true },
  { slug: "venn", chart: 'svg g[id^="set-circles"] circle', needsStepPlot: true },
  { slug: "upset", chart: "svg g#intersection-bars rect, svg g#bars rect", needsStepPlot: true },
  { slug: "lineplot", chart: "svg g#traces path", needsStepPlot: true },
  { slug: "aequorin", chart: "svg g#axis-y", needsStepPlot: true },
  { slug: "heatmap", chart: "svg g#cells image", needsStepPlot: true },
  { slug: "volcano", chart: "svg g#data-points circle", needsStepPlot: true },
  // Calculators: no upload step. Scope the h1 selector to `#root` —
  // an unscoped `h1` lookup hits the (hidden) file:// warning banner
  // and the (hidden) landing-page h1 first.
  { slug: "power", chart: "#root h1", needsStepPlot: false, calc: true },
  { slug: "molarity", chart: "#root h1", needsStepPlot: false, calc: true },
];

async function timeExample(page, tool) {
  const t0 = Date.now();
  await page.goto(`${BASE}/index.html#/${tool.slug}`, { waitUntil: "load" });
  const tNav = Date.now() - t0;

  if (tool.calc) {
    // Calculators render immediately on route. Time from goto to the
    // first .dv-panel becoming visible.
    const t1 = Date.now();
    await page.locator(tool.chart).first().waitFor({ timeout: 10000 });
    return { tNav, tIngestRender: Date.now() - t1, totalLoad: null };
  }

  const exampleBtn = page.getByTestId("load-example");
  await exampleBtn.waitFor({ state: "visible", timeout: 10000 });
  const t1 = Date.now();
  await exampleBtn.click();
  if (tool.needsStepPlot) {
    const stepPlot = page.getByTestId("step-plot");
    await stepPlot.waitFor({ state: "visible", timeout: 10000 });
    await stepPlot.click();
  }
  await page.locator(tool.chart).first().waitFor({ timeout: 30000 });
  const tIngestRender = Date.now() - t1;
  return { tNav, tIngestRender, totalLoad: tNav + tIngestRender };
}

// ── Synthetic-paste timing for the three suspect tools ────────────────

async function timePaste(page, slug, payload, chartSelector, label) {
  await page.goto(`${BASE}/index.html#/${slug}`, { waitUntil: "load" });
  const textarea = page.getByLabel("Paste tabular data");
  await textarea.waitFor({ state: "visible", timeout: 10000 });
  const t0 = Date.now();
  // Playwright's `textarea.fill()` serializes through CDP per-character
  // and times out at ~30 s for ~MB-scale strings. Use page.evaluate to
  // set the value directly and dispatch the React-friendly input event
  // so the controlled component picks it up.
  await page.evaluate(
    // The callback executes inside the browser page, so `document` /
    // `window` are real — the Node-environment ESLint config doesn't
    // know that.
    /* eslint-disable no-undef */
    ({ payload }) => {
      const ta = document.querySelector('textarea[aria-label="Paste tabular data"]');
      if (!ta) throw new Error("textarea not found");
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setter.call(ta, payload);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    },
    /* eslint-enable no-undef */
    { payload }
  );
  const tFill = Date.now() - t0;

  const t1 = Date.now();
  await page.getByTestId("paste-parse").click();
  const stepPlot = page.getByTestId("step-plot");
  await stepPlot.waitFor({ state: "visible", timeout: 30000 });
  await stepPlot.click();
  await page.locator(chartSelector).first().waitFor({ timeout: 60000 });
  const tParseRender = Date.now() - t1;
  return { label, payloadKB: (payload.length / 1024).toFixed(1), tFill, tParseRender };
}

// ── Markdown report writer ────────────────────────────────────────────

function row(cols) {
  return "| " + cols.join(" | ") + " |";
}
function fmt(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function buildReport(baselines, stress) {
  const lines = [];
  lines.push("# Performance spike — 2026-05-12");
  lines.push("");
  lines.push(
    "One-off Playwright-driven timing pass. Each tool's example dataset was loaded through the same flow an end user follows (navigate → click _Try this example_ → step to plot → wait for chart). Numbers are wall-clock from Playwright, single run on the dev machine; treat anything inside 2× as a tie."
  );
  lines.push("");
  lines.push(
    "Generator: `scripts/perf-spike.mjs`. Reproducible with `node scripts/perf-spike.mjs`."
  );
  lines.push("");

  lines.push("## Baselines — example dataset per tool");
  lines.push("");
  lines.push(row(["Tool", "Navigate", "Ingest + render", "Total"]));
  lines.push(row(["---", "---", "---", "---"]));
  for (const b of baselines) {
    lines.push(
      row([
        `\`${b.slug}\``,
        fmt(b.tNav),
        fmt(b.tIngestRender),
        b.totalLoad == null ? "—" : fmt(b.totalLoad),
      ])
    );
  }
  lines.push("");
  lines.push(
    "_Navigate_ is `page.goto` → load event (cold cache the first time, primed for subsequent tools as the SPA chunk for `_shell` is shared). _Ingest + render_ is from clicking the example button to the chart's data layer being visible in the DOM."
  );
  lines.push("");

  lines.push("## Stress tests — synthetic large-N for the suspect tools");
  lines.push("");
  lines.push(row(["Tool", "Payload", "Size", "Textarea fill", "Parse + render"]));
  lines.push(row(["---", "---", "---", "---", "---"]));
  for (const s of stress) {
    lines.push(
      row([`\`${s.slug}\``, s.label, `${s.payloadKB} KB`, fmt(s.tFill), fmt(s.tParseRender)])
    );
  }
  lines.push("");
  lines.push(
    "_Textarea fill_ is Playwright's synchronous string assignment to the paste field — mostly a measure of CDP throughput. _Parse + render_ is the interesting number: `Parse pasted data` click → chart visible."
  );
  lines.push("");

  lines.push("## Reading guide");
  lines.push("");
  lines.push(
    "- Compare _Parse + render_ at large N to the matching _Ingest + render_ baseline above. The ratio tells you how the tool scales: ~constant means a fixed overhead, ~linear means the render is on the critical path."
  );
  lines.push(
    "- Heatmap's example is already 500 rows × 6 columns; the stress test bumps to 1,000 × 30 (~5× cells). Volcano example is ~200 points; the stress test is 20,000 (transcriptomics-scale). Scatter example is Iris (150 rows); stress is 5,000."
  );
  lines.push(
    "- A tool that scales faster than linearly on the stress test points at an O(n²)-or-worse hot spot worth chasing. A tool that's already a multi-second baseline is a different signal — even the default user feels it."
  );
  return lines.join("\n") + "\n";
}

// ── Main ──────────────────────────────────────────────────────────────

// Fresh context per tool — the SPA's tab-style keep-alive (v1.3.0)
// keeps every visited tool mounted (display: none), so reusing one
// page across tools makes `getByTestId("load-example")` match every
// previously-visited tool's hidden mount. A new context wipes the
// in-memory DOM so each tool's measurement is clean.
async function withFreshContext(browser, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", () => {});
  page.on("pageerror", (err) => process.stderr.write("[pageerror] " + err.message + "\n"));
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  const baselines = [];
  for (const tool of TOOLS) {
    process.stderr.write(`[baseline] ${tool.slug} ...`);
    try {
      const t = await withFreshContext(browser, (page) => timeExample(page, tool));
      baselines.push({ slug: tool.slug, ...t });
      process.stderr.write(` nav=${t.tNav}ms ingest+render=${t.tIngestRender}ms\n`);
    } catch (e) {
      process.stderr.write(` FAILED: ${e.message.split("\n")[0]}\n`);
      baselines.push({ slug: tool.slug, tNav: null, tIngestRender: null, totalLoad: null });
    }
  }

  const stress = [];
  const stressCases = [
    {
      slug: "volcano",
      label: "20,000 points",
      payload: () => genVolcano(20000),
      chart: "svg g#data-points circle",
    },
    {
      slug: "scatter",
      label: "5,000 points",
      payload: () => genScatter(5000),
      chart: "svg g#data-points circle",
    },
    {
      slug: "heatmap",
      label: "1,000 rows × 30 cols",
      payload: () => genHeatmap(1000, 30),
      chart: "svg g#cells image",
    },
  ];
  for (const c of stressCases) {
    process.stderr.write(`[stress] ${c.slug} (${c.label}) ...`);
    try {
      const t = await withFreshContext(browser, (page) =>
        timePaste(page, c.slug, c.payload(), c.chart, c.label)
      );
      stress.push({ slug: c.slug, ...t });
      process.stderr.write(` fill=${t.tFill}ms render=${t.tParseRender}ms\n`);
    } catch (e) {
      process.stderr.write(` FAILED: ${e.message.split("\n")[0]}\n`);
      stress.push({
        slug: c.slug,
        label: c.label,
        payloadKB: "?",
        tFill: null,
        tParseRender: null,
      });
    }
  }

  await browser.close();
  server.kill("SIGTERM");

  writeFileSync(REPORT, buildReport(baselines, stress));
  process.stderr.write(`\nReport written to ${REPORT}\n`);
}

main().catch((e) => {
  process.stderr.write("FATAL: " + e.stack + "\n");
  process.exit(1);
});

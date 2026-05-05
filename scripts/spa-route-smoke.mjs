// scripts/spa-route-smoke.mjs — phase-3 smoke test. Walks every
// SPA route (`/spa.html#/<tool>` for the 10 tools registered in
// tools/_app/tool-registry.ts) and verifies the page mounts a
// non-empty React tree without console errors.
//
// Standalone, not part of the normal `npm test` chain — Playwright
// is already in devDeps for the e2e suite, so we ride on that.
//
// Run: `node scripts/spa-route-smoke.mjs`. Requires
// `npx playwright install chromium` to have been run once.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PORT = 8767;
const BASE = `http://localhost:${PORT}`;
const ROUTES = [
  "boxplot",
  "scatter",
  "venn",
  "upset",
  "lineplot",
  "aequorin",
  "heatmap",
  "volcano",
  "power",
  "molarity",
];

function startServer() {
  const p = spawn("python3", ["-m", "http.server", String(PORT)], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    detached: false,
  });
  return p;
}

async function main() {
  const server = startServer();
  await new Promise((r) => setTimeout(r, 800));

  let browser;
  let failed = 0;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const url = `${BASE}/index.html#/${route}`;
      const consoleErrors = [];
      page.on("pageerror", (err) => consoleErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const rootInner = await page.locator("#root").innerHTML();
      const ok = rootInner.length > 100;
      const status = ok && consoleErrors.length === 0 ? "✓" : "✗";
      const sizeKb = (rootInner.length / 1024).toFixed(1);
      console.log(
        `  ${status}  /#/${route.padEnd(10)}  root=${sizeKb} KB  errors=${consoleErrors.length}`
      );
      if (consoleErrors.length > 0) {
        console.log("       first error:", consoleErrors[0].slice(0, 200));
      }
      if (!ok || consoleErrors.length > 0) failed++;
      page.removeAllListeners("pageerror");
      page.removeAllListeners("console");
    }
  } finally {
    if (browser) await browser.close();
    if (!server.killed) server.kill("SIGTERM");
  }
  console.log("");
  console.log(failed === 0 ? "all routes OK" : `${failed} route(s) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// scripts/gen-ui-screenshots.mjs — Playwright capture of the interface
// screenshots in the README: the landing page and the Group Plot workspace.
// (The other images in docs/screenshots/ are exported figures, not the UI.)
//
// Output: docs/screenshots/landing.png and docs/screenshots/workspace.png,
// a 1440 × 900 viewport at 2× DPI, light theme, English.
//
// Run with: `node scripts/gen-ui-screenshots.mjs` from the repo root after
// `npm run build`. Requires `npx playwright install chromium` once.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PORT = 8767;
const BASE = `http://localhost:${PORT}`;
const OUT = join(REPO_ROOT, "docs/screenshots");

function startServer() {
  return spawn("python3", ["-m", "http.server", String(PORT)], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "ignore", "ignore"],
  });
}

async function main() {
  const server = startServer();
  await new Promise((r) => setTimeout(r, 800));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    // Same starting point for everyone: light theme, English, the Group Plot
    // statistics column open.
    await context.addInitScript(() => {
      localStorage.setItem("dataviz-theme", "light");
      localStorage.setItem("plottr-lang", "en");
      localStorage.setItem("plottr-inspector-boxplot", "open");
      localStorage.removeItem("plottr-tab-boxplot");
    });
    const page = await context.newPage();

    await page.goto(`${BASE}/index.html`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForTimeout(800); // hero entrance animation
    await page.screenshot({ path: join(OUT, "landing.png") });
    console.log("[ui] landing.png");

    await page.goto(`${BASE}/index.html#/boxplot?example`);
    await page.locator("svg g#groups > g").first().waitFor();
    await page
      .locator(".dv-workspace-toolbar")
      .getByRole("button", { name: "Letters", exact: true })
      .click();
    await page.locator("svg g#cld-annotations text").first().waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, "workspace.png") });
    console.log("[ui] workspace.png");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

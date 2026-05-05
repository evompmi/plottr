// scripts/gen-volcano-screenshot.mjs — Playwright-based screenshot
// capture for `docs/screenshots/volcano.png`.
//
// The existing `scripts/gen-screenshots.mjs` requires Selenium +
// geckodriver + Inkscape + Pillow, all of which are happy on the
// Ubuntu CI box but awkward to set up on a contributor laptop.
// Plöttr already has Playwright in devDeps for the e2e suite, and
// Playwright is cross-platform with zero extra system deps once
// `npx playwright install chromium` has run, so this one-off
// volcano capture rides on it. Inkscape is replaced by Playwright's
// own headless Chromium rasterisation — the chart SVG is rendered
// at 2× DPI for retina sharpness, then composited centred on a
// 1648×1250 white canvas via PIL (same final dimensions as the
// existing screenshots in docs/screenshots/).
//
// Output: docs/screenshots/volcano.png at 1648×1250.
//
// Run with: `node scripts/gen-volcano-screenshot.mjs`. Requires
// `npx playwright install chromium` to have been run once and
// `python3 -c "from PIL import Image"` to succeed.

import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PORT = 8766;
const BASE = `http://localhost:${PORT}`;
const OUT = join(REPO_ROOT, "docs/screenshots");
const WIDTH = 1648;
const HEIGHT = 1250;

function startServer() {
  console.log(`[server] starting python3 http.server on :${PORT}`);
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
  try {
    browser = await chromium.launch({ headless: true });
    // 2× DPI keeps the rasterised text + lines crisp at the 1648×1250
    // canvas size — matches the look of the existing Inkscape-rendered
    // screenshots without the Inkscape dependency.
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    console.log(`[volcano] navigating to ${BASE}/tools/volcano.html`);
    await page.goto(`${BASE}/tools/volcano.html`);

    // Same pattern the e2e suite uses (`e2e/volcano.spec.ts` →
    // `loadVolcanoExample`): click the "Try sample data" button which
    // every tool's UploadPanel exposes via `data-testid="load-example"`.
    const exampleBtn = page.getByTestId("load-example");
    await exampleBtn.waitFor({ state: "visible", timeout: 15_000 });
    await exampleBtn.click();

    // Advance to the Plot step. StepNavBar buttons are labelled
    // "Step N of M: Plot" — matching `Plot$` picks the right one.
    const plotStep = page.getByRole("button", { name: /Plot$/ }).first();
    await plotStep.waitFor({ state: "visible" });
    await plotStep.click();

    // Wait for the chart to render (ns points populate last).
    const nsPoints = page.locator("g#points-ns circle").first();
    await nsPoints.waitFor({ state: "visible", timeout: 15_000 });

    // Give labels / animations one more frame to settle.
    await page.waitForTimeout(800);

    // Pick the largest SVG on the page — the chart canvas, not the
    // tiny brand icon. Same heuristic the existing Selenium script
    // uses for upset / heatmap. The arrow body runs in the browser
    // context (Playwright evaluates it inside the page's realm) so
    // `document` is the page's DOM document, not Node's globalThis;
    // disable `no-undef` for the function body so ESLint's
    // node-context globals don't trip over the cross-realm access.
    /* eslint-disable no-undef */
    const chartHandle = await page.evaluateHandle(() => {
      const svgs = Array.from(document.querySelectorAll("svg"));
      let best = null;
      let bestArea = 0;
      for (const s of svgs) {
        const r = s.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) {
          best = s;
          bestArea = area;
        }
      }
      return best;
    });
    /* eslint-enable no-undef */
    if (!chartHandle) throw new Error("[volcano] no SVG found on plot page");

    mkdirSync(OUT, { recursive: true });
    const innerPath = join(OUT, "_tmp_volcano_inner.png");
    const pngPath = join(OUT, "volcano.png");

    // Capture just the SVG element. With deviceScaleFactor=2 the PNG
    // comes back at 2× the CSS-pixel size, which keeps text + lines
    // sharp when downscaled into the final canvas.
    await chartHandle.asElement().screenshot({ path: innerPath, omitBackground: false });
    console.log(`[volcano] chart screenshot saved`);

    // Composite onto a 1648×1250 white canvas with proportional
    // shrink-to-fit + 80 px margin, exactly the way the existing
    // gen-screenshots.mjs Inkscape pipeline frames upset + heatmap.
    const MARGIN_X = 80;
    const MARGIN_Y = 80;
    const MAX_W = WIDTH - 2 * MARGIN_X;
    const MAX_H = HEIGHT - 2 * MARGIN_Y;
    execSync(
      `python3 -c "
from PIL import Image
inner = Image.open('${innerPath}').convert('RGBA')
# Shrink-to-fit the inner inside MAX_W × MAX_H, preserving aspect.
ratio = min(${MAX_W} / inner.width, ${MAX_H} / inner.height)
if ratio < 1.0:
    new_w = int(inner.width * ratio)
    new_h = int(inner.height * ratio)
    inner = inner.resize((new_w, new_h), Image.LANCZOS)
canvas = Image.new('RGBA', (${WIDTH}, ${HEIGHT}), (255, 255, 255, 255))
x = (${WIDTH} - inner.width) // 2
y = (${HEIGHT} - inner.height) // 2
canvas.paste(inner, (x, y), inner)
canvas.convert('RGB').save('${pngPath}', 'PNG', optimize=True)
"`,
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    execSync(`rm "${innerPath}"`);
    console.log(`[volcano] composited → ${pngPath} (${WIDTH}×${HEIGHT})`);
  } finally {
    if (browser) await browser.close();
    if (!server.killed) server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

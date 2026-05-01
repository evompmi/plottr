// Regenerate docs/screenshots/upset.png and docs/screenshots/heatmap.png
// from the live tool. Other tools' screenshots in that folder were captured
// manually by clicking ⬇ PNG in-app; this script automates the same path
// for upset + heatmap because they didn't have screenshots yet.
//
// Requirements (not auto-installed, deliberately):
//   - Node ≥ 18
//   - System Firefox + geckodriver (Ubuntu: snap firefox + `apt install firefox-geckodriver` is the tested combo)
//   - `inkscape` on PATH (for SVG → PNG)
//   - `selenium-webdriver` available — install with `npm install --no-save selenium-webdriver`
//     (kept out of package.json so a normal `npm install` stays lean)
//
// Run: `node scripts/gen-screenshots.mjs` from the repo root. The script
// spawns its own static HTTP server on port 8765 and tears it down on exit.
// Output: 1648 × 1250 PNGs, matching the existing screenshot dimensions.

import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const OUT = join(REPO_ROOT, "docs/screenshots");
const WIDTH = 1648;
const HEIGHT = 1250;

// Snap Firefox wrapper isn't an ELF, so geckodriver can't spawn it through
// /usr/bin/firefox. Point at the real binary inside the snap squashfs.
const FIREFOX_BIN_CANDIDATES = [
  "/snap/firefox/current/usr/lib/firefox/firefox",
  "/usr/lib/firefox/firefox",
  "/usr/lib/firefox-esr/firefox-esr",
];

function findFirefox() {
  for (const p of FIREFOX_BIN_CANDIDATES) if (existsSync(p)) return p;
  throw new Error(
    "No Firefox binary found. Tried: " + FIREFOX_BIN_CANDIDATES.join(", "),
  );
}

async function captureToolSvg(driver, url, label, customFilePath) {
  console.log(`[${label}] navigating to ${url}`);
  await driver.get(url);

  await driver.wait(
    until.elementLocated(By.xpath("//*[contains(text(), 'Try sample data')]")),
    15000,
  );

  if (customFilePath) {
    // Bypass the bundled example and feed a screenshot-friendly CSV
    // (default heatmap example is 500 genes — intrinsically portrait,
    // doesn't fit landscape canvas). Strategy:
    //   1. Set the separator on the React-controlled <select> so
    //      UploadPanel renders FileDropZone.
    //   2. Read CSV bytes here, push them into the page as a Blob, and
    //      synthesise a `change` event on the file input — bypasses
    //      geckodriver's flaky `sendKeys` for file uploads in headless mode.
    console.log(`[${label}] injecting ${customFilePath}`);
    const fs = await import("node:fs");
    const csvText = fs.readFileSync(customFilePath, "utf8");

    await driver.executeScript(`
      const sel = document.getElementById('dv-separator-select');
      if (!sel) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, ',');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await driver.sleep(500);
    await driver.executeScript(
      `
      const csv = arguments[0];
      const filename = arguments[1];
      const input = document.querySelector('input[type="file"]');
      if (!input) throw new Error('file input not found after setting separator');
      const file = new File([csv], filename, { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    `,
      csvText,
      "heatmap-screenshot.csv",
    );
  } else {
    const loadBtn = await driver.findElement(
      By.xpath("//*[contains(text(), 'Try sample data')]/following-sibling::button"),
    );
    console.log(`[${label}] clicking Load example`);
    await driver.executeScript("arguments[0].click()", loadBtn);
  }
  await driver.sleep(1200);

  // StepNavBar renders each step circle as a clickable element. The visible
  // text "Plot" is on a leaf node; walk up to a cursor:pointer ancestor.
  const plotClickJs = `
    const candidates = [...document.querySelectorAll('*')].filter(el => {
      const t = (el.textContent || '').trim();
      return t === 'Plot' && el.children.length === 0;
    });
    if (!candidates.length) return false;
    let target = candidates[0];
    for (let i = 0; i < 8 && target; i++) {
      const cs = getComputedStyle(target).cursor;
      if (cs === 'pointer') break;
      target = target.parentElement;
    }
    if (!target) return false;
    target.click();
    return true;
  `;
  let advanced = false;
  for (let i = 0; i < 6 && !advanced; i++) {
    advanced = await driver.executeScript(plotClickJs);
    if (!advanced) await driver.sleep(500);
  }
  if (!advanced) console.warn(`[${label}] could not click Plot step`);
  await driver.sleep(2000);

  const svgHtml = await driver.executeScript(`
    const svgs = Array.from(document.querySelectorAll('svg'));
    let best = null, bestArea = 0;
    for (const s of svgs) {
      const r = s.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = s; bestArea = area; }
    }
    if (!best) return null;
    const xmlns = 'http://www.w3.org/2000/svg';
    const xlink = 'http://www.w3.org/1999/xlink';
    const clone = best.cloneNode(true);
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', xmlns);
    if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', xlink);
    return new XMLSerializer().serializeToString(clone);
  `);
  if (!svgHtml) throw new Error(`[${label}] no SVG found on plot page`);
  const svgPath = join(OUT, `_tmp_${label}.svg`);
  writeFileSync(svgPath, svgHtml);
  console.log(`[${label}] SVG saved (${svgHtml.length} bytes)`);
  return svgPath;
}

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
  // Allow the server a moment to bind before the first request.
  await new Promise((r) => setTimeout(r, 800));

  const opts = new firefox.Options();
  opts.addArguments("-headless");
  opts.addArguments("-width", String(WIDTH));
  opts.addArguments("-height", String(HEIGHT));
  opts.setBinary(findFirefox());

  let driver;
  try {
    driver = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).build();
    await driver.manage().window().setRect({ width: WIDTH, height: HEIGHT });

    // Synthesize a smaller heatmap CSV so the chart's natural aspect ratio
    // fits the landscape screenshot canvas. The bundled example uses 500
    // genes which renders portrait. 60 genes × 6 samples × 5 patterns gives
    // a ~1:1 chart that scales nicely.
    const heatmapCsvPath = "/tmp/heatmap-screenshot.csv";
    const seed = (function () {
      let s = 42;
      return function () {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const patterns = [
      { ctrl: [0.6, 1.4], stress: [3.8, 5.6], noise: 0.35 },
      { ctrl: [0.8, 1.6], stress: [2.2, 3.4], noise: 0.3 },
      { ctrl: [0.7, 1.5], stress: [1.8, 2.6], noise: 0.25 },
      { ctrl: [3.2, 4.8], stress: [0.6, 1.4], noise: 0.35 },
      { ctrl: [0.8, 2.4], stress: [0.8, 2.4], noise: 0.3 },
    ];
    const perPattern = 12;
    const lines = ["gene,Control1,Control2,Control3,Stress1,Stress2,Stress3"];
    let geneIdx = 0;
    for (const p of patterns) {
      for (let i = 0; i < perPattern; i++) {
        geneIdx++;
        const cb = p.ctrl[0] + seed() * (p.ctrl[1] - p.ctrl[0]);
        const sb = p.stress[0] + seed() * (p.stress[1] - p.stress[0]);
        const cols = [];
        for (let j = 0; j < 3; j++) cols.push((cb + (seed() - 0.5) * 2 * p.noise).toFixed(2));
        for (let j = 0; j < 3; j++) cols.push((sb + (seed() - 0.5) * 2 * p.noise).toFixed(2));
        lines.push([`gene${String(geneIdx).padStart(3, "0")}`, ...cols].join(","));
      }
    }
    writeFileSync(heatmapCsvPath, lines.join("\n"));

    const targets = [
      ["upset", `${BASE}/tools/upset.html`, null],
      ["heatmap", `${BASE}/tools/heatmap.html`, heatmapCsvPath],
    ];
    const svgPaths = [];
    for (const [label, url, customFile] of targets) {
      svgPaths.push([label, await captureToolSvg(driver, url, label, customFile)]);
    }
    // Two-step render: (1) Inkscape renders the SVG at its natural aspect
    // ratio scaled to fit within the canvas with margin; (2) Pillow pastes
    // the result centered on a WIDTH × HEIGHT white canvas. Forcing both
    // dimensions on Inkscape would stretch the chart — the deformed look
    // the user reported. Existing screenshots in docs/screenshots/ all show
    // the chart centered on whitespace, not edge-to-edge.
    const MARGIN_X = 80;
    const MARGIN_Y = 80;
    const MAX_W = WIDTH - 2 * MARGIN_X;
    const MAX_H = HEIGHT - 2 * MARGIN_Y;
    for (const [label, svgPath] of svgPaths) {
      const pngPath = join(OUT, `${label}.png`);
      const innerPath = join(OUT, `_tmp_${label}_inner.png`);
      // First pass: render at MAX_W width with natural height — this is the
      // SVG's intrinsic aspect ratio.
      execSync(
        `inkscape --export-type=png --export-filename="${innerPath}" --export-width=${MAX_W} --export-background=white --export-background-opacity=1 "${svgPath}"`,
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      // If the result is too tall, re-render constrained on height instead.
      const dims = execSync(`python3 -c "from PIL import Image; im = Image.open('${innerPath}'); print(im.width, im.height)"`)
        .toString()
        .trim()
        .split(" ")
        .map(Number);
      if (dims[1] > MAX_H) {
        execSync(
          `inkscape --export-type=png --export-filename="${innerPath}" --export-height=${MAX_H} --export-background=white --export-background-opacity=1 "${svgPath}"`,
          { stdio: ["ignore", "ignore", "inherit"] },
        );
      }
      // Composite the natural-aspect inner PNG onto a white canvas at the
      // target dimensions, centred.
      execSync(
        `python3 -c "
from PIL import Image
inner = Image.open('${innerPath}').convert('RGBA')
canvas = Image.new('RGBA', (${WIDTH}, ${HEIGHT}), (255, 255, 255, 255))
x = (${WIDTH} - inner.width) // 2
y = (${HEIGHT} - inner.height) // 2
canvas.paste(inner, (x, y), inner)
canvas.convert('RGB').save('${pngPath}', 'PNG', optimize=True)
"`,
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      execSync(`rm "${svgPath}" "${innerPath}"`);
      console.log(`[${label}] composited → ${pngPath} (${WIDTH}×${HEIGHT}, natural aspect preserved)`);
    }
    console.log("done — both PNGs at 1648×1250 in docs/screenshots/");
  } finally {
    if (driver) await driver.quit();
    if (!server.killed) server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

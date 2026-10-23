// Exported SVGs are reopened in Inkscape, where the Objects panel lists
// elements by id. Every drawn element of every tool's exported figure must
// therefore sit inside a named `<g id="…">` (see "SVG export: named groups"
// in tools/CLAUDE.md), and ids must be unique — Inkscape silently renames
// duplicates, so a second `significance-brackets` would lose its name.
//
// Each test loads the tool's example, downloads "Download SVG" and checks
// the file itself, so export-time additions (attribution) are covered too.

/* global DOMParser -- used inside page.evaluate, which runs in the browser */

import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "fs";

const TOOLS = [
  "aequorin",
  "boxplot",
  "lineplot",
  "scatter",
  "heatmap",
  "venn",
  "upset",
  "volcano",
  "proportions",
  "qpcr",
];

interface GroupReport {
  unnamed: string[];
  duplicateIds: string[];
  topLevel: string[];
}

async function exportSvg(page: Page, tool: string): Promise<string> {
  // Fall back to a plain download instead of Chromium's save-file picker.
  await page.addInitScript(() => {
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined;
  });
  await page.goto(`/index.html#/${tool}`);
  await page.getByTestId("load-example").first().click();
  const plotStep = page.getByTestId("step-plot");
  if (await plotStep.count()) await plotStep.click();
  const button = page.getByRole("button", { name: /Download SVG/ });
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return readFileSync((await download.path())!, "utf8");
}

test.describe("SVG export keeps every element in a named group", () => {
  for (const tool of TOOLS) {
    test(tool, async ({ page }) => {
      const svgText = await exportSvg(page, tool);
      const report = await page.evaluate((text: string): GroupReport => {
        const DRAWN = ["rect", "path", "line", "circle", "ellipse", "text", "polyline", "polygon"];
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const svg = doc.documentElement;
        const unnamed: string[] = [];
        for (const el of Array.from(svg.querySelectorAll(DRAWN.concat("image").join(",")))) {
          if (el.closest("defs, clipPath, mask, marker, pattern")) continue;
          let p = el.parentElement;
          while (p && p !== svg && !(p.tagName === "g" && p.id)) p = p.parentElement;
          if (!p || p === svg) unnamed.push(el.tagName + " " + (el.textContent || "").slice(0, 30));
        }
        const seen = new Map<string, number>();
        for (const el of Array.from(svg.querySelectorAll("[id]"))) {
          seen.set(el.id, (seen.get(el.id) || 0) + 1);
        }
        const topLevel = Array.from(svg.children)
          .filter((c) => !(c.tagName === "g" && c.id))
          .filter((c) => !["defs", "title", "desc", "style", "metadata"].includes(c.tagName))
          .map((c) => c.tagName + (c.id ? "#" + c.id : ""));
        return {
          unnamed,
          duplicateIds: [...seen].filter(([, n]) => n > 1).map(([id]) => id),
          topLevel,
        };
      }, svgText);
      expect(report.unnamed, "drawn elements outside a named <g>").toEqual([]);
      expect(report.duplicateIds, "ids used more than once").toEqual([]);
      expect(report.topLevel, "top-level children that are not named groups").toEqual([]);
    });
  }
});

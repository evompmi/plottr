// "Methods" button on every tool that runs statistics or clustering: opens a
// read-only paragraph describing what ran, ending with the Plöttr version and
// the equivalent R calls.

import { test, expect, type Page } from "@playwright/test";

async function openPlot(page: Page, tool: string) {
  await page.goto("/index.html#/" + tool);
  await page.getByTestId("load-example").click();
  const plotStep = page.getByTestId("step-plot");
  if (await plotStep.isVisible()) await plotStep.click();
}

async function methodsText(page: Page): Promise<string> {
  await page.getByTestId("methods-button").first().click();
  const text = page.getByTestId("methods-text");
  await expect(text).toBeVisible();
  return (await text.textContent()) || "";
}

const CASES: Array<{ tool: string; expects: RegExp[]; prepare?: (page: Page) => Promise<void> }> = [
  {
    tool: "boxplot",
    expects: [/were compared with Welch's one-way ANOVA, followed by the Games-Howell test/],
  },
  {
    tool: "lineplot",
    expects: [/within each value of “time”/, /Benjamini-Hochberg procedure/],
  },
  {
    tool: "qpcr",
    expects: [/^Relative expression was calculated with the 2\^−ΔΔCt method/, /reference genes/],
  },
  { tool: "scatter", expects: [/Pearson's product-moment correlation/, /cor\.test\(x, y/] },
  { tool: "proportions", expects: [/Pearson's χ² test/, /Holm method/] },
  { tool: "heatmap", expects: [/hierarchical clustering \(average linkage\)/, /hclust\(/] },
  {
    tool: "aequorin",
    prepare: async (page) => {
      await page.getByRole("tab", { name: "Σ barplot" }).click();
      await page
        .getByTitle("Barplot of the sum (Σ) of plotted values per condition")
        .getByRole("button", { name: "On", exact: true })
        .click();
    },
    expects: [/per-replicate sums of the signal/],
  },
  {
    tool: "upset",
    prepare: async (page) => {
      // Wait for the plot step to settle, or the section click is lost to a remount.
      const bar = page.locator('svg g[id^="intersection-bar-"][role="button"]').first();
      await expect(bar).toBeVisible();
      await page.getByRole("tab", { name: "Statistics", exact: true }).click();
      await page.getByRole("button", { name: /Compute stats/ }).click();
      await bar.click();
    },
    expects: [/Binomial\(N, p\)/, /Benjamini-Hochberg/],
  },
];

for (const c of CASES) {
  test(`methods text: ${c.tool}`, async ({ page }) => {
    await openPlot(page, c.tool);
    if (c.prepare) await c.prepare(page);
    const text = await methodsText(page);
    for (const re of c.expects) expect(text).toMatch(re);
    expect(text).toMatch(/Analyses were performed with Plöttr v\d/);
    // Read-only: no editable control in the popover.
    await expect(page.getByTestId("methods-popover").locator("textarea, input")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("methods-popover")).toHaveCount(0);
  });
}

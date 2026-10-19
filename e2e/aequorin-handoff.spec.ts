// RLU timecourse → Group Plot hand-off: the Σ barplot's per-replicate sums
// open in Group Plot on the plot step, with the source-supplied "A.U.C."
// y-axis label instead of the auto-derived column name.

import { test, expect } from "@playwright/test";

test("Σ barplot opens in Group Plot with the A.U.C. label", async ({ page }) => {
  await page.goto("/index.html#/aequorin");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();
  // Σ barplot is off by default; its Off/On toggle sits in the tile header.
  await page
    .getByTitle(/Barplot of the sum/)
    .getByRole("button", { name: "On", exact: true })
    .click();
  await page.getByRole("button", { name: "↗ Open in Boxplot" }).click();
  await expect(page).toHaveURL(/#\/boxplot/);
  await expect(page.locator("svg g#groups").first()).toBeVisible();
  await expect(page.locator("svg g#y-axis-label").first()).toHaveText("A.U.C.");
});

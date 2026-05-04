// Heatmap golden path. The example is a synthetic 500-gene × 6-sample
// matrix with five latent expression patterns; loading it goes
// straight to the plot view with hierarchical clustering applied to
// both axes by default.

import { test, expect } from "@playwright/test";

test("heatmap: load example → cells render", async ({ page }) => {
  await page.goto("/tools/heatmap.html");
  await page.getByTestId("load-example").click();

  // Heatmap routes to "Step 2 of 3: Import check" by default — walk
  // to plot step.
  await page.getByRole("button", { name: /Plot$/ }).first().click();

  // Cells are rendered inside `<g id="cells">` with one `<rect>` per
  // (row, col) — 500 × 6 = 3000. We assert at least 100 to keep the
  // test resilient to future tweaks to the example dataset.
  const cells = page.locator("svg g#cells rect");
  await expect(cells.first()).toBeVisible();
  expect(await cells.count()).toBeGreaterThan(100);
});

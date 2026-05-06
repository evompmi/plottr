// Heatmap golden path. The example is a synthetic 500-gene × 6-sample
// matrix with five latent expression patterns; loading it goes
// straight to the plot view with hierarchical clustering applied to
// both axes by default.

import { test, expect } from "@playwright/test";

test("heatmap: load example → cells render", async ({ page }) => {
  await page.goto("/index.html#/heatmap");
  await page.getByTestId("load-example").click();

  // Heatmap routes to "Step 2 of 3: Import check" by default — walk
  // to plot step.
  await page.getByTestId("step-plot").click();

  // Cells rasterize to an off-screen canvas and ship as a single
  // PNG-encoded <image> inside <g id="cells">. A non-empty data URL
  // in the image's href is proof the canvas paint actually ran.
  const cellsImage = page.locator("svg g#cells image");
  await expect(cellsImage).toBeVisible();
  const href = await cellsImage.getAttribute("href");
  expect(href).toMatch(/^data:image\/png;base64,/);
});

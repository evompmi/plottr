// Heatmap golden path. The example is a synthetic 500-gene × 6-sample
// matrix with five latent expression patterns (plus three outlier spikes
// that exercise the colour-scale skew alert); loading it goes
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

// The sample carries three "saturated well" spikes (≈ 36–52 over a bulk
// below ~6) precisely so the outlier-skew alert is demonstrable: it must
// fire on load, and clipping must clear it and mark the colourbar.
test("heatmap: sample data triggers the outlier-skew alert; clipping clears it", async ({
  page,
}) => {
  await page.goto("/index.html#/heatmap");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  // The Colour scale section starts collapsed, so only the compact strip
  // above the plot is mounted on load.
  const alerts = page.getByTestId("heatmap-skew-alert");
  await expect(alerts).toHaveCount(1);
  await expect(alerts).toContainText("3 of 3000 cells (0.1%) stretch the colour scale");

  const topTick = page.locator("svg g#colorbar text").first();
  await expect(topTick).toHaveText("52.4");

  await alerts.getByRole("button", { name: "Clip to 2nd–98th percentile" }).click();
  await expect(alerts).toHaveCount(0);
  await expect(topTick).toHaveText(/^≥ /);
});

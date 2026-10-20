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
// fire on load, and excluding the outliers must clip exactly those 3 cells.
test("heatmap: sample data triggers the outlier alert; excluding clips only the spikes", async ({
  page,
}) => {
  await page.goto("/index.html#/heatmap");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  // One alert, above the plot.
  const alerts = page.getByTestId("heatmap-skew-alert");
  await expect(alerts).toHaveCount(1);
  await expect(alerts.first()).toContainText("3 of 3000 cells (0.1%) stretch the colour scale");

  const topTick = page.locator("svg g#colorbar text").first();
  await expect(topTick).toHaveText("52.4");
  // The legend histogram ships with the colourbar by default.
  await expect(page.locator("svg g#colorbar-histogram rect").first()).toBeAttached();

  await alerts
    .first()
    .getByRole("button", { name: "Exclude 3 outliers from the colour scale" })
    .click();
  await expect(alerts).toHaveCount(0);
  // Only the three spikes saturate; every ordinary cell keeps its colour.
  await expect(topTick).toHaveText(/^≥ \d+\.\d \(n=3\)$/);
  await page.getByRole("tab", { name: "Colours" }).click();
  await expect(page.getByRole("button", { name: "Outliers", pressed: true })).toBeVisible();
});

test("heatmap: range histogram — drag the Max handle, then a percentile preset", async ({
  page,
}) => {
  await page.goto("/index.html#/heatmap");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();
  await page.getByRole("tab", { name: "Colours" }).click();

  const handle = page.getByTestId("heatmap-range-hi");
  const before = Number(await handle.getAttribute("aria-valuenow"));
  const track = page.getByRole("group", { name: /Distribution of cell values/ });
  // hover() scrolls the handle into view — measure only after that settles.
  await handle.hover();
  await page.waitForTimeout(300);
  await handle.hover();
  const box = (await track.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await handle.getAttribute("aria-valuenow")))
    .toBeLessThan(before);
  await expect(page.locator("svg g#colorbar text").first()).toHaveText(/^≥ /);

  await page.getByRole("button", { name: "5–95 %" }).click();
  await expect(page.getByRole("button", { name: "5–95 %", pressed: true })).toBeVisible();
  await expect(page.getByTestId("heatmap-range-clipped")).toContainText("clipped");
});

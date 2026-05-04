// Aequorin golden-path + the auto-Y first-paint regression that
// motivated extracting `effYRange` to render-time. The chart no longer
// reads stale `vis.yMin/yMax` from auto-prefs on the first paint of the
// plot step.

import { test, expect } from "@playwright/test";

test("aequorin example loads + paints with non-default Y range", async ({ page }) => {
  await page.goto("/tools/aequorin.html");

  const exampleBtn = page.getByTestId("load-example");
  await expect(exampleBtn).toBeVisible();
  await exampleBtn.click();

  // StepNavBar buttons read "Step N of M: <name>" — match by trailing
  // word so we don't have to re-type the M for each tool.
  await page.getByRole("button", { name: /Plot$/ }).first().click();

  // The chart's main SVG should be visible. Find the y-axis tick text
  // — at least one tick must read a non-default value, confirming the
  // chart sized to the actual data and not to VIS_INIT_AEQUORIN's
  // (0.1, 1.4) defaults.
  await expect(page.locator("svg g#axis-y").first()).toBeVisible();

  // Read every y-tick label's text. The example dataset is a
  // synthetic Ca²⁺ trace with values up into the µM range — at least
  // one tick label should be ≥ 1 (the y-axis default range is
  // 0.1..1.4, so any tick at ≥ 2 is proof the chart sized to data).
  const tickTexts = await page.locator("svg g#axis-y text").allTextContents();
  expect(tickTexts.length).toBeGreaterThan(0);
  const numericTicks = tickTexts
    .map((t) => parseFloat(t.replace(",", ".")))
    .filter((n) => !Number.isNaN(n));
  // The example dataset is calibrated raw — values should produce at
  // least one tick > 1.4 (the VIS_INIT default upper bound). If the
  // chart paint uses stale defaults this assertion fails.
  const hasAboveDefault = numericTicks.some((n) => n > 1.4);
  expect(hasAboveDefault).toBe(true);
});

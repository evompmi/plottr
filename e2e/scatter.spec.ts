// Scatter golden path. The Iris example loads, auto-detects numeric
// columns, and renders the chart. We walk to the plot step and assert
// the data-points layer populates.

import { test, expect } from "@playwright/test";

test("scatter: load Iris example → chart renders points", async ({ page }) => {
  await page.goto("/tools/scatter.html");
  await page.getByTestId("load-example").click();

  // Walk to plot step (Step N: Plot).
  await page.getByRole("button", { name: /Plot$/ }).first().click();

  // Scatter renders one <circle> per row (or whatever shape the user
  // picked) inside `<g id="data-points">`. The Iris dataset has 150
  // rows; we assert at least 50 rendered (lenient enough that a future
  // sub-sample still passes, strict enough to catch "rendered nothing").
  const points = page.locator('svg g#data-points circle, svg g#data-points path[d^="M"]');
  await expect(points.first()).toBeVisible();
  expect(await points.count()).toBeGreaterThan(50);
});

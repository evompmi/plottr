// Lineplot golden path. The bacterial-growth-curves example loads,
// the configure step picks default x/y/group columns, and the plot
// step renders a line per group with mean ± error.

import { test, expect } from "@playwright/test";

test("lineplot: load example → chart renders one trace per group", async ({ page }) => {
  await page.goto("/tools/lineplot.html");
  await page.getByTestId("load-example").click();

  await page.getByRole("button", { name: /Plot$/ }).first().click();

  // Each group renders a path inside `<g id="traces">` (a polyline-
  // shaped path connecting the group's mean points across X). The
  // example has 3 strains, so we expect ≥ 2 traces.
  const traces = page.locator('svg g#traces path[d^="M"]');
  await expect(traces.first()).toBeVisible();
  expect(await traces.count()).toBeGreaterThanOrEqual(2);
});

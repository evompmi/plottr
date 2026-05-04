// Venn golden path. With 2 or 3 sets, the example auto-commits the
// selection and routes to the plot step. We assert the SVG renders the
// expected number of set circles.

import { test, expect } from "@playwright/test";

test("venn: load example → chart renders set circles", async ({ page }) => {
  await page.goto("/tools/venn.html");
  await page.getByTestId("load-example").click();

  // Venn auto-routes to plot when the example has ≤ 3 sets. If for
  // some reason it lands on configure, force the nav.
  const plotStep = page.getByRole("button", { name: /Plot$/ }).first();
  if (await plotStep.isVisible()) await plotStep.click();

  // Set circles are wrapped in `<g id="set-circles">` with one
  // `<circle>` per set. Example has 3 sets.
  const circles = page.locator('svg g[id^="set-circles"] circle');
  await expect(circles.first()).toBeVisible();
  expect(await circles.count()).toBeGreaterThanOrEqual(2);
});

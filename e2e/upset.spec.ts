// UpSet golden path. The example loads in long format and renders the
// intersection-bar + dot-matrix combo. We assert at least one bar +
// one dot in the matrix.

import { test, expect } from "@playwright/test";

test("upset: load example → chart renders bars + matrix dots", async ({ page }) => {
  await page.goto("/tools/upset.html");
  await page.getByTestId("load-example").click();

  // upset's example may land on "configure" if more than 3 sets are
  // detected; commit to the plot step explicitly.
  const plotStep = page.getByRole("button", { name: /Plot$/ }).first();
  if (await plotStep.isVisible()) await plotStep.click();

  // Bars + matrix-dot circles are the two distinguishing layers. Both
  // must populate for the chart to be useful.
  const bars = page.locator("svg g#intersection-bars rect");
  await expect(bars.first()).toBeVisible();
  expect(await bars.count()).toBeGreaterThanOrEqual(1);

  const dots = page.locator("svg circle");
  expect(await dots.count()).toBeGreaterThan(0);
});

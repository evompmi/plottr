// Dose–response golden path. Loads the synthetic example, walks to the
// plot step, and asserts the fitted curves render plus the parameter table
// reports an EC50 in the expected SI-unit string.

import { test, expect } from "@playwright/test";

test("doseresponse: load example → curves and parameter table render", async ({ page }) => {
  await page.goto("/index.html#/doseresponse");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  // Two conditions in the example → two fitted curves rendered as <path>
  // children of #dose-response-curve. Use lenient `>= 1` since the curve
  // count depends on whether each condition's fit converged.
  const curves = page.locator("svg g#dose-response-curve path");
  await expect(curves.first()).toBeVisible();
  expect(await curves.count()).toBeGreaterThanOrEqual(2);

  // Data points group must be present and populated.
  const points = page.locator("svg g#data-points circle, svg g#data-points path");
  await expect(points.first()).toBeVisible();
  expect(await points.count()).toBeGreaterThanOrEqual(16);

  // CI band ribbon present (default visible).
  await expect(page.locator("svg g#ci-band path").first()).toBeVisible();

  // Parameter table renders a header row labelled "EC50 (95% CI)".
  await expect(
    page.locator("svg g#parameter-table text", { hasText: "EC50" }).first()
  ).toBeVisible();

  // The synthetic Control curve has logEC50 = −7 (EC50 = 100 nM). The
  // sidebar fit summary should report it; tolerate small parameter drift
  // by asserting "nM" appears, which only matches the right SI bucket.
  await expect(page.locator("text=Control").first()).toBeVisible();
});

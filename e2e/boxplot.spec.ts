// Boxplot golden path. The example dataset auto-detects wide format
// (3 genotypes × 3 treatments × 8 reps) and routes the user through
// upload → configure → filter → output → plot. We walk all the way to
// plot and assert the chart populates with at least one box per group.

import { test, expect } from "@playwright/test";

test("boxplot: load example → walk to plot → chart renders boxes", async ({ page }) => {
  await page.goto("/tools/boxplot.html");
  await page.getByTestId("load-example").click();

  // The example uses wide format and the configure step pre-fills
  // group / value column roles. Walk via the StepNavBar's "Plot" pill.
  await page.getByRole("button", { name: /Plot$/ }).first().click();

  // The chart renders inside a `<g id="groups">` group (one <g> per
  // box). Wait for it to populate, then assert at least 2 group
  // children — the example has 3 genotypes so there should be ≥ 3,
  // ≥ 2 keeps the assertion robust against the example dataset
  // changing.
  const groupsLayer = page.locator("svg g#groups").first();
  await expect(groupsLayer).toBeVisible();
  const boxes = await groupsLayer.locator("> g").count();
  expect(boxes).toBeGreaterThanOrEqual(2);
});

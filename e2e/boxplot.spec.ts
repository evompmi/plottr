// Boxplot golden path. The example dataset auto-detects wide format
// (3 genotypes × 3 treatments × 8 reps) and routes the user through
// upload → configure → filter → output → plot. We walk all the way to
// plot and assert the chart populates with at least one box per group.

import { test, expect } from "@playwright/test";

test("boxplot: load example → walk to plot → chart renders boxes", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();

  // The example uses wide format and the configure step pre-fills
  // group / value column roles. Walk via the StepNavBar's "Plot" pill.
  await page.getByTestId("step-plot").click();

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

test("boxplot: square corners + custom outline restyle box and median", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  const firstBox = page.locator("svg g#groups > g").first();
  const rect = firstBox.locator('rect[stroke-width="1.5"]');
  const median = firstBox.locator('line[stroke-width="2.5"]');
  await expect(rect).toHaveAttribute("rx", "2");
  const groupColor = await rect.getAttribute("fill");
  await expect(rect).toHaveAttribute("stroke", groupColor ?? "");

  await page.getByRole("button", { name: "Square" }).click();
  await page.getByRole("button", { name: "Custom" }).click();

  await expect(rect).toHaveAttribute("rx", "0");
  await expect(rect).toHaveAttribute("stroke", "#000000");
  await expect(median).toHaveAttribute("stroke", "#000000");
  await expect(rect).toHaveAttribute("fill", groupColor ?? "");
});

test("boxplot: outlier marks can be turned off while points are shown", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  const marks = page.locator('svg g#groups circle[fill="#000"]');
  const points = page.locator('svg g#groups circle:not([fill="#000"])');
  await expect(marks.first()).toBeVisible();
  const pointCount = await points.count();

  await page.getByRole("button", { name: "Data points" }).click();
  await page
    .getByRole("group", { name: "Mark outliers in black" })
    .getByRole("button", { name: "Off" })
    .click();

  await expect(marks).toHaveCount(0);
  await expect(points).toHaveCount(pointCount);
});

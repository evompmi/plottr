// Aequorin golden-path + the auto-Y first-paint regression that
// motivated extracting `effYRange` to render-time. The chart no longer
// reads stale `vis.yMin/yMax` from auto-prefs on the first paint of the
// plot step.

import { test, expect } from "@playwright/test";

test("aequorin example loads + paints with non-default Y range", async ({ page }) => {
  await page.goto("/index.html#/aequorin");

  const exampleBtn = page.getByTestId("load-example");
  await expect(exampleBtn).toBeVisible();
  await exampleBtn.click();

  // StepNavBar pills carry `data-testid="step-<key>"` so we can target
  // them precisely. Pre-SPA, an aria-label regex worked; post-SPA the
  // topbar's tool-icon buttons (e.g. "Group Plot", "Volcano Plot")
  // also matched and stole the click.
  await page.getByTestId("step-plot").click();

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

test("Σ sums CSV sits in the More menu while the barplot is on", async ({ page }) => {
  // Fall back to a plain download instead of Chromium's save-file picker.
  await page.addInitScript(() => {
    (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined;
  });
  await page.goto("/index.html#/aequorin");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  const more = page.getByRole("toolbar").getByRole("button", { name: "More ▾" });
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Σ sums CSV" })).toHaveCount(0);
  await more.click();

  await page.getByRole("tab", { name: "Σ barplot" }).click();
  await page
    .locator(".dv-workspace-controls")
    .getByRole("button", { name: "On", exact: true })
    .click();
  await more.click();
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Σ sums CSV" }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe("rlu_timecourse_example_corrected_sums.csv");
  const fs = await import("node:fs");
  const text = fs.readFileSync((await dl.path()) as string, "utf8");
  expect(text.split(/\r?\n/)[0]).toBe('"Condition","Replicate","Corrected Sum"');
});

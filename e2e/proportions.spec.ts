// Proportions golden path: sample data → plot with Wilson CIs and pairwise
// brackets → stacked / mosaic charts → test override → goodness of fit on
// the F2 segregation example.

import { test, expect, Page } from "@playwright/test";

async function loadColonisation(page: Page) {
  await page.goto("/index.html#/proportions");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();
  await expect(page.locator("g#bars rect").first()).toBeVisible();
  await openStatistics(page);
}

// The statistics column starts folded into a rail.
async function openStatistics(page: Page) {
  await page.getByRole("button", { name: "Show Statistics" }).click();
}

test("colonisation example: bars, CI whiskers, brackets, χ² chosen", async ({ page }) => {
  await loadColonisation(page);
  await expect(page.locator("g#bars rect")).toHaveCount(4);
  await expect(page.locator("g#ci-whiskers > g")).toHaveCount(4);
  await expect(page.locator("g#n-labels text").first()).toHaveText("41/48");
  // WT and complemented line each differ from both mutants.
  await expect(page.locator("g#significance-brackets > g")).toHaveCount(4);
  await expect(page.getByTestId("proportions-omnibus")).toContainText("Pearson χ²(3) = 94.537");
  await expect(page.getByTestId("proportions-pairs").locator("tbody tr")).toHaveCount(6);
  // R / report downloads live in the statistics column's exports.
  await expect(
    page.getByTestId("proportions-stats").getByRole("heading", { name: "Statistics" })
  ).toBeVisible();
  await expect(page.getByTestId("proportions-dl-txt")).toBeVisible();
  await expect(page.getByTestId("proportions-dl-r")).toBeVisible();
  // Display on plot (toolbar above the chart): letters replace brackets, Off removes both.
  const stats = page.getByTestId("proportions-display");
  await stats.getByRole("button", { name: "Letters", exact: true }).click();
  await expect(page.locator("g#significance-brackets")).toHaveCount(0);
  await expect(page.locator("g#cld-annotations text")).toHaveText(["a", "b", "b", "a"]);
  await stats.getByRole("button", { name: "Off", exact: true }).click();
  await expect(page.locator("g#cld-annotations")).toHaveCount(0);
  await stats.getByRole("button", { name: "Brackets", exact: true }).click();
  await page.getByTestId("proportions-show-ns").check();
  await expect(page.locator("g#significance-brackets > g")).toHaveCount(6);
});

test("per-group bar colours and per-outcome segment colours are editable", async ({ page }) => {
  await loadColonisation(page);
  await page.getByRole("tab", { name: "Colours" }).click();
  const list = page.getByTestId("proportions-color-list");
  await expect(list.locator("> div")).toHaveCount(4);
  const hex = page.getByLabel("dmi3-1, hex value", { exact: true });
  await hex.fill("#123456");
  await hex.press("Enter");
  await expect(page.locator("g#bars rect").nth(1)).toHaveAttribute("fill", "#123456");
  // Other bars keep their palette colours.
  await expect(page.locator("g#bars rect").nth(0)).not.toHaveAttribute("fill", "#123456");
  // Stacked: the list switches to the outcomes.
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("button", { name: "Stacked", exact: true }).click();
  await page.getByRole("tab", { name: "Colours" }).click();
  await expect(list.locator("> div")).toHaveCount(2);
  const cat = page.getByLabel("Not colonised, hex value", { exact: true });
  await cat.fill("#abcdef");
  await cat.press("Enter");
  await expect(page.locator("g#legend-Not-colonised rect")).toHaveAttribute("fill", "#abcdef");
});

test("chart types and test override", async ({ page }) => {
  await loadColonisation(page);
  await page.getByRole("button", { name: "Stacked", exact: true }).click();
  await expect(page.locator("g#segments > g")).toHaveCount(4);
  await expect(page.locator("g#legend > g")).toHaveCount(2);
  await page.getByRole("button", { name: "Mosaic", exact: true }).click();
  await expect(page.locator("g#segments > g")).toHaveCount(4);
  await page.getByRole("button", { name: "Fisher", exact: true }).click();
  await expect(page.getByTestId("proportions-omnibus")).toContainText("Fisher's exact test (4×2)");
  await expect(page.getByTestId("proportions-override-note")).toContainText(
    "You picked Fisher's exact test where χ² would also be valid"
  );
});

test("F2 example: stacked by default, 9:3:3:1 goodness of fit per family", async ({ page }) => {
  await page.goto("/index.html#/proportions");
  await page.getByTestId("load-example-f2").click();
  await page.getByTestId("step-plot").click();
  await expect(page.locator("g#segments > g")).toHaveCount(3);
  await openStatistics(page);
  const gof = page.getByTestId("proportions-gof");
  await expect(page.getByTestId("proportions-gof-ratio")).toHaveValue("9:3:3:1");
  await expect(gof.locator("tbody tr")).toHaveCount(3);
  // Mendel's counts fit 9:3:3:1 (χ² fallback: too many outcomes to enumerate).
  await expect(gof.locator("tbody tr").first()).toContainText("0.9254");
  await page.getByTestId("proportions-gof-ratio").fill("9:3");
  await expect(gof).toContainText("Enter 4 positive numbers");
});

test("control group: each group vs the control only, brackets, no letters", async ({ page }) => {
  await loadColonisation(page);
  const stats = page.getByTestId("proportions-display");
  await stats.getByRole("button", { name: "Letters", exact: true }).click();
  await page.getByTestId("proportions-control").selectOption({ label: "vs A17 (WT) (control)" });
  const rows = page.getByTestId("proportions-pairs").locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator("td").first()).toHaveText("dmi3-1 vs A17 (WT)");
  // Letters need every pair: the option disappears and brackets take over.
  await expect(stats.getByRole("button", { name: "Letters", exact: true })).toHaveCount(0);
  await expect(page.locator("g#cld-annotations")).toHaveCount(0);
  // Both mutants differ from WT; the complemented line does not.
  await expect(page.locator("g#significance-brackets > g")).toHaveCount(2);
  await page.getByTestId("proportions-control").selectOption({ label: "All pairs" });
  await expect(rows).toHaveCount(6);
});

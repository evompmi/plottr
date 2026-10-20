// Group Plot → Proportions hand-off: the composition pies' counts (observations
// of each colour-by class per group) open as a counts table in Proportions,
// one table per facet, groups labelled facet.group.

import { test, expect, Page } from "@playwright/test";

// 2 genotypes × 2 days; phenotype classes per plant. Day1: WT 3 tall / 1
// short, mut 1 tall / 3 short. Day2: WT 2 / 2, mut 0 / 4.
const CSV = `Genotype,Phenotype,Day,Length
WT,tall,Day1,10
WT,tall,Day1,11
WT,tall,Day1,12
WT,short,Day1,5
mut,tall,Day1,9
mut,short,Day1,4
mut,short,Day1,5
mut,short,Day1,6
WT,tall,Day2,10
WT,tall,Day2,12
WT,short,Day2,6
WT,short,Day2,5
mut,short,Day2,4
mut,short,Day2,3
mut,short,Day2,5
mut,short,Day2,4
`;

async function plotWithPies(page: Page) {
  await page.goto("/index.html#/boxplot");
  await page.getByRole("textbox", { name: /paste/i }).fill(CSV);
  await page.getByTestId("paste-parse").click();
  await page.getByTestId("step-plot").click();
  await expect(page.locator("svg g#groups").first()).toBeVisible();
  await page.getByRole("button", { name: "Data points" }).click();
  const colorBy = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Phenotype" }) });
  await colorBy.first().selectOption({ label: "Phenotype" });
  await page
    .getByRole("group", { name: "Composition pies" })
    .getByRole("button", { name: "On" })
    .click();
}

test("composition pies open in Proportions as a counts table", async ({ page }) => {
  await plotWithPies(page);
  const send = page.getByTestId("comp-to-proportions");
  await expect(send).toHaveCount(1);
  await send.click();
  await expect(page).toHaveURL(/#\/proportions/);
  await expect(page.getByTestId("composition-origin")).toContainText("Phenotype");
  // Two classes → proportion chart, focus = first class ("short").
  await expect(page.locator("g#n-labels text")).toHaveText(["3/8", "7/8"]);
});

test("facets: one export per facet, groups labelled facet.group", async ({ page }) => {
  await plotWithPies(page);
  await page.getByRole("button", { name: "Split by" }).click();
  const facetBy = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Day" }) });
  // Colour by, Facet by, Subgroup by all list "Day"; Facet by is the second.
  await facetBy.nth(1).selectOption({ label: "Day" });
  const send = page.getByTestId("comp-to-proportions");
  await expect(send).toHaveText(["↗ Day1 in Proportions", "↗ Day2 in Proportions"]);
  await send.nth(1).click();
  await expect(page.getByTestId("composition-origin")).toContainText("Day2");
  await expect(page.locator("g#n-labels text")).toHaveText(["2/4", "4/4"]);
  await expect(page.locator("svg").getByText("Day2.WT", { exact: true })).toBeVisible();
  await expect(page.locator("svg").getByText("Day2.mut", { exact: true })).toBeVisible();
});

test("subgroups: one table, groups labelled subgroup.group", async ({ page }) => {
  await plotWithPies(page);
  await page.getByRole("button", { name: "Split by" }).click();
  const subgroupBy = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Day" }) });
  await subgroupBy.nth(2).selectOption({ label: "Day" });
  const send = page.getByTestId("comp-to-proportions");
  await expect(send).toHaveText(["↗ Open in Proportions"]);
  await send.click();
  await expect(page.locator("g#n-labels text")).toHaveText(["1/4", "3/4", "2/4", "4/4"]);
  for (const label of ["Day1.WT", "Day1.mut", "Day2.WT", "Day2.mut"]) {
    await expect(page.locator("svg").getByText(label, { exact: true })).toBeVisible();
  }
});

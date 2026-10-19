// Venn → UpSet hand-off: with 4+ sets Venn nudges to UpSet, and "Open in
// UpSet →" replaces whatever UpSet had loaded with Venn's dataset.

import { test, expect, Page } from "@playwright/test";

// Wide format, four sets. Items unique to one set: A has a1, B b1, C c1,
// D d1; "shared" is in all four.
const CSV = `SetA,SetB,SetC,SetD
shared,shared,shared,shared
a1,b1,c1,d1
`;

async function openFromVenn(page: Page) {
  await page.goto("/index.html#/venn");
  await page.getByRole("textbox", { name: /paste/i }).fill(CSV);
  await page.getByTestId("paste-parse").click();
  await page.getByText("Open in UpSet →").click();
  await expect(page).toHaveURL(/#\/upset/);
}

async function expectVennData(page: Page) {
  // Data lands on the configure step (4 sets, all selected). Venn stays
  // mounted under keep-alive, so target UpSet's visible step pill.
  await expect(page.getByText("4 selected")).toBeVisible();
  await page.locator('[data-testid="step-plot"]:visible').click();
  for (const name of ["SetA", "SetB", "SetC", "SetD"]) {
    await expect(page.locator("svg").getByText(name, { exact: true }).first()).toBeVisible();
  }
  // Four single-set intersections plus the all-four one.
  await expect(page.locator("svg g#intersection-bars rect")).toHaveCount(5);
}

test("Venn opens its dataset in UpSet", async ({ page }) => {
  await openFromVenn(page);
  await expectVennData(page);
});

test("Venn replaces the dataset of an UpSet already open in the session", async ({ page }) => {
  await page.goto("/index.html#/upset");
  await page.getByTestId("load-example").click();
  await openFromVenn(page);
  await expectVennData(page);
});

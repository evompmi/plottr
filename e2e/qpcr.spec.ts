// qPCR golden path: sample → configure (references and calibrator
// auto-picked, QC shown) → plot (log2 fold change, brackets from ΔCt tests)
// → y-scale / letters → standard-curve efficiencies → "Send ΔCt to Group
// Plot" lands in Group Plot with the same groups.

import { test, expect, Page } from "@playwright/test";

async function loadExample(page: Page) {
  await page.goto("/index.html#/qpcr");
  await page.getByTestId("load-example").click();
  await expect(page.getByTestId("qpcr-gene-table")).toBeVisible();
}

test("configure: references, calibrator and QC are detected", async ({ page }) => {
  await loadExample(page);
  await expect(page.getByTestId("qpcr-role-ACT2")).toHaveValue("ref");
  await expect(page.getByTestId("qpcr-role-UBQ10")).toHaveValue("ref");
  await expect(page.getByTestId("qpcr-role-RD29A")).toHaveValue("target");
  await expect(page.getByTestId("qpcr-control")).toHaveValue("Control");
  const qc = page.getByTestId("qpcr-qc");
  await expect(qc).toContainText("1 well has no Ct");
  await expect(qc).toContainText("Salt / 2 / WRKY33");
  await expect(qc).toContainText("geNorm M");
});

test("plot: one facet per target, tests on ΔCt, y-scale and letters", async ({ page }) => {
  await loadExample(page);
  await page.getByTestId("step-plot").click();
  await expect(page.locator("g#facet-RD29A")).toBeVisible();
  await expect(page.locator("g#facet-WRKY33")).toBeVisible();
  await expect(page.getByTestId("qpcr-why-dct")).toContainText(
    "Do not run t-tests or ANOVA on 2^−ΔΔCt values."
  );
  await expect(page.getByTestId("qpcr-result-RD29A")).toContainText("Welch's ANOVA on ΔCt");
  await expect(page.locator("g#facet-RD29A g#significance-brackets > g")).not.toHaveCount(0);
  await page.getByRole("button", { name: "−ΔΔCt", exact: true }).click();
  await expect(page.locator("g#facet-RD29A")).toContainText("−ΔΔCt");
  await page
    .getByTestId("qpcr-stats")
    .getByRole("button", { name: "Letters", exact: true })
    .click();
  await expect(page.locator("g#facet-RD29A g#cld-annotations text")).toHaveCount(3);
});

test("standard curve: efficiencies applied to the gene table", async ({ page }) => {
  await loadExample(page);
  await page.getByTestId("qpcr-stdcurve").locator("summary").click();
  await page
    .getByTestId("qpcr-std-input")
    .fill("Gene,Quantity,Ct\nRD29A,1,20\nRD29A,0.1,23.5\nRD29A,0.01,27\nRD29A,0.001,30.5\n");
  await page.getByTestId("qpcr-std-apply").click();
  // slope −3.5 → E = 10^(1/3.5) = 1.9307 → 93.1 %
  await expect(page.getByTestId("qpcr-eff-RD29A")).toHaveValue("93.1 %");
});

test("Send ΔCt of all genes → Group Plot faceted by gene", async ({ page }) => {
  await loadExample(page);
  await page.getByTestId("step-plot").click();
  await page.getByTestId("qpcr-send").click();
  await expect(page).toHaveURL(/#\/boxplot/);
  // One facet chart per target gene, each with the qPCR groups and the ΔCt label.
  for (const gene of ["RD29A", "WRKY33"]) {
    const chart = page.locator("svg").filter({ hasText: gene }).filter({ hasText: "ΔCt" }).first();
    await expect(chart).toBeVisible();
    for (const g of ["Control", "Drought", "Salt"]) await expect(chart).toContainText(g);
  }
});

test("Send ΔCt of all genes → Group Plot with gene subgroups", async ({ page }) => {
  await loadExample(page);
  await page.getByTestId("step-plot").click();
  await page
    .getByTestId("qpcr-stats")
    .getByRole("button", { name: "Gene = subgroups", exact: true })
    .click();
  await page.getByTestId("qpcr-send").click();
  await expect(page).toHaveURL(/#\/boxplot/);
  const chart = page
    .locator("svg")
    .filter({ hasText: "RD29A" })
    .filter({ hasText: "WRKY33" })
    .first();
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("Drought");
});

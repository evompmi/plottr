// qPCR golden path: sample → configure (references and calibrator
// auto-picked, QC shown) → plot (log2 fold change, brackets from ΔCt tests)
// → y-scale / letters → standard-curve efficiencies → display options.

import { test, expect, Locator, Page } from "@playwright/test";

// Drag `handle` with the mouse so the pointer ends `dy` px below where it
// started (several moves so the list sees the pointer travel).
async function dragBy(page: Page, handle: Locator, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 8 });
  await page.mouse.up();
}

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
  // The statistics column starts folded into a rail.
  await page.getByRole("button", { name: "Show Statistics" }).click();
  await expect(page.locator("g#facet-RD29A")).toBeVisible();
  await expect(page.locator("g#facet-WRKY33")).toBeVisible();
  // The ΔCt rationale is collapsed until asked for.
  const whyDct = page.getByTestId("qpcr-why-dct");
  const dontTest = whyDct.getByText("Do not run t-tests or ANOVA on 2^−ΔΔCt values.");
  await expect(dontTest).toBeHidden();
  await whyDct.getByText("Why the tests use ΔCt").click();
  await expect(dontTest).toBeVisible();
  await expect(page.getByTestId("qpcr-result-RD29A")).toContainText("Welch's ANOVA on ΔCt");
  // One collapsible block per gene: the first is open, the others start closed.
  const wrky = page.getByTestId("qpcr-gene-WRKY33").getByRole("button", { name: "WRKY33" });
  await expect(wrky).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("qpcr-result-WRKY33")).toHaveCount(0);
  await wrky.click();
  await expect(page.getByTestId("qpcr-result-WRKY33")).toBeVisible();
  await expect(page.locator("g#facet-RD29A g#significance-brackets-RD29A > g")).not.toHaveCount(0);
  await page.getByRole("button", { name: "−ΔΔCt", exact: true }).click();
  await expect(page.locator("g#facet-RD29A")).toContainText("−ΔΔCt");
  await page
    .getByTestId("qpcr-display")
    .getByRole("button", { name: "Letters", exact: true })
    .click();
  await expect(page.locator("g#facet-RD29A g#cld-annotations-RD29A text")).toHaveCount(3);
});

test("no calibrator: 2^−ΔCt relative to the reference genes; SEM error bars", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("button", { name: "Reference genes only", exact: true }).click();
  await expect(page.getByTestId("qpcr-control")).toHaveCount(0);
  await expect(page.getByTestId("qpcr-norm-refs-note")).toBeVisible();
  await page.getByTestId("step-plot").click();
  const facet = page.locator("g#facet-RD29A");
  await expect(facet).toContainText("Relative expression (log₂ scale)");
  await expect(page.locator("#reference-line-RD29A")).toHaveCount(0);
  await expect(page.getByTestId("qpcr-gene-RD29A")).toContainText("2^−ΔCt [95 % CI]");
  await expect(page.getByTestId("qpcr-result-RD29A")).toContainText("Welch's ANOVA on ΔCt");
  await page.getByRole("button", { name: "SEM", exact: true }).click();
  await expect(page.locator("g#error-bars-RD29A > g")).toHaveCount(3);
  await page.getByRole("button", { name: "None", exact: true }).click();
  await expect(page.locator("g#error-bars-RD29A")).toHaveCount(0);
});

test("calibrator column hidden: vs-control stars, letters unavailable", async ({ page }) => {
  await loadExample(page);
  await page.getByTestId("step-plot").click();
  await page
    .getByRole("group", { name: "Calibrator column" })
    .getByRole("button", { name: "Off", exact: true })
    .click();
  const xAxis = page.locator("g#axis-x-RD29A");
  await expect(xAxis).not.toContainText("Control");
  await expect(xAxis).toContainText("Drought");
  await expect(page.locator("g#vs-control-RD29A text")).toHaveCount(2);
  await expect(page.locator("#reference-line-RD29A")).toHaveCount(1);
  await expect(page.locator("g#footnote")).toContainText("vs Control (not shown)");
  await expect(
    page.getByTestId("qpcr-display").getByRole("button", { name: "Letters", exact: true })
  ).toHaveCount(0);
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

test("display options: boxes, horizontal, fixed axis range and title", async ({ page }) => {
  await loadExample(page);
  await page.getByTestId("step-plot").click();
  await page.getByRole("button", { name: "Boxes", exact: true }).click();
  await expect(page.locator("g#bars-RD29A > g")).toHaveCount(3);
  await expect(page.locator("g#error-bars-RD29A")).toHaveCount(0);
  await page.getByRole("button", { name: "Horizontal", exact: true }).click();
  await expect(page.locator("g#axis-x-RD29A text[text-anchor=end]")).toHaveCount(3);
  await page.getByRole("tab", { name: "Axes" }).click();
  await page.getByTestId("qpcr-ymin").fill("0.5");
  await page.getByTestId("qpcr-ymax").fill("64");
  await page.getByTestId("qpcr-ylabel").fill("Relative level");
  for (const gene of ["RD29A", "WRKY33"]) {
    const axis = page.locator(`g#axis-y-${gene}`);
    await expect(axis).toContainText("64");
    await expect(axis).toContainText("Relative level");
  }
  await page.getByTestId("qpcr-ymin").fill("-1");
  await expect(page.getByText("Ignored: a log₂ axis needs numbers above 0.")).toBeVisible();
  await expect(page.getByTestId("qpcr-send")).toHaveCount(0);
});

test("configure: group order reorders by drag and drop", async ({ page }) => {
  await loadExample(page);
  const list = page
    .locator("ul")
    .filter({ has: page.getByRole("checkbox", { name: "Include Control" }) });
  const order = () =>
    list.locator("li").evaluateAll((lis) => lis.map((li) => li.textContent?.replace(/↑↓$/, "")));
  const before = await order();
  expect(before[0]).toBe("Control");
  const rowH = (await list.locator("li").first().boundingBox())!.height;
  await dragBy(page, list.getByTestId("drag-handle").first(), rowH * (before.length - 0.8));
  expect(await order()).toEqual([...before.slice(1), "Control"]);
});

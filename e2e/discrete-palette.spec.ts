// Discrete-palette picker — cross-tool smoke that the dropdown is
// wired up. Limited to tools where "load example → click Plot step"
// reaches the plot view directly (lineplot / venn / volcano); boxplot,
// aequorin, and scatter have multi-step configure flows or require a
// colour-column mapping before the palette appears, so they're covered
// by their dedicated per-tool specs instead.

import { test, expect, Page } from "@playwright/test";

// Per-tool config: which collapsible section header to click open
// before the palette dropdown is mounted. Volcano renders its
// ControlSection children conditionally (`{open && <children/>}`), so
// the select isn't in the DOM until the section is opened.
const TOOLS: Array<{ tool: string; section: RegExp }> = [
  { tool: "lineplot", section: /^Groups$/ },
  { tool: "venn", section: /^Sets$/ },
  { tool: "volcano", section: /^Colors$/ },
];

async function loadExampleAndOpenPlot(page: Page) {
  const exampleBtn = page.getByTestId("load-example");
  await expect(exampleBtn).toBeVisible();
  await exampleBtn.click();
  // StepNavBar buttons read "Step N of M: <name>" — match by trailing
  // word so we work across all tools (different M values, different
  // step counts).
  const plotStep = page.getByRole("button", { name: /Plot$/ }).first();
  if (await plotStep.isVisible()) await plotStep.click();
}

for (const { tool, section } of TOOLS) {
  test(`${tool}: discrete-palette dropdown is wired up`, async ({ page }) => {
    await page.goto(`/tools/${tool}.html`);
    await loadExampleAndOpenPlot(page);

    // Open the section that hosts the palette select. Some sections
    // are open by default (boxplot's "Conditions"), so the click is
    // a no-op in that case but it doesn't hurt.
    const sectionHeader = page.getByRole("button", { name: section }).first();
    if (await sectionHeader.isVisible()) await sectionHeader.click();

    // Every tool's palette picker is a <select> whose options include
    // the canonical "okabe-ito" key. We assert at least one is now
    // visible, then exercise it by picking a different palette — the
    // selectOption call would throw if the wiring is broken.
    const paletteSelect = page.locator('select:has(option[value="okabe-ito"])').first();
    await expect(paletteSelect).toBeVisible();
    await paletteSelect.selectOption("dark2");
    await page.waitForTimeout(50);
  });
}

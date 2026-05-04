// Volcano golden-path + the colorNs-glitch regression that motivated
// adding Playwright in the first place.
//
// History: in v1.2.0 a brief intermediate build mapped the picked
// discrete palette's last hex into colorUp / colorDown / colorNs (so
// non-significant points got coloured pastel-purple under Set3, etc.).
// The fix pinned colorNs to VOLCANO_DEFAULT_COLORS.ns and added a
// useEffect that re-pins on every palette change to self-heal stale
// localStorage. The regression was only caught by the user reloading,
// picking the same palette twice, and noticing the chart still showed
// pastel ns. Exactly the class of "renders the wrong chart" bug the
// vm + functional-React-mock unit tests can't catch.
//
// These tests load the bundled volcano demo, pick a palette, and assert
// the rendered DOM (ns class fill, up class fill, the "Not significant"
// per-row ColorInput chip) matches expectations.

import { test, expect, Page } from "@playwright/test";

// Load the bundled demo dataset and step through to the plot view.
// Returns the page positioned at step "plot" with calData rendered.
async function loadVolcanoExample(page: Page) {
  await page.goto("/tools/volcano.html");
  // Every tool's load-example button shares `data-testid="load-example"`
  // (added in shared-ui.js — UploadPanel renders all of them).
  const exampleBtn = page.getByTestId("load-example");
  await expect(exampleBtn).toBeVisible();
  await exampleBtn.click();
  // StepNavBar buttons are labelled "Step N of M: <name>". A regex
  // ending with the step name matches them all without re-typing each
  // tool's M (3 here, 4 / 5 elsewhere).
  await page.getByRole("button", { name: /Plot$/ }).first().click();
  // Wait for `g#points-ns` etc. to populate so subsequent colour
  // assertions hit a non-empty chart.
  await expect(page.locator("g#points-ns circle").first()).toBeVisible();
}

test.describe("volcano — colorNs stays neutral grey across palette picks", () => {
  // VOLCANO_DEFAULT_COLORS.ns from helpers.ts. Hard-coded here so the
  // test would fail loudly if anyone tries to "fix" the regression by
  // changing the default colour — we want a separate, intentional
  // change.
  const NS_GREY = "#999999";

  test("default palette: ns class is grey", async ({ page }) => {
    await loadVolcanoExample(page);
    const nsCircle = page.locator("g#points-ns circle").first();
    await expect(nsCircle).toBeVisible();
    const fill = await nsCircle.getAttribute("fill");
    expect(fill?.toLowerCase()).toBe(NS_GREY);
  });

  test("after picking Set1: ns class is STILL grey (the regression)", async ({ page }) => {
    await loadVolcanoExample(page);

    // The Colors tile lives in the right sidebar. Open it.
    const colorsHeader = page.getByRole("button", { name: /^Colors$/ });
    if (await colorsHeader.isVisible()) await colorsHeader.click();

    // Pick "set1" via the discrete-palette dropdown. There are two
    // <select> tags rendered by DiscretePaletteSelect (one per
    // Color-tile, one for each independent palette dropdown that
    // applies); volcano has only one — for the up/down/ns slot
    // mapping. `option:has-text` finds the right entry.
    const paletteSelect = page.locator('select:has(option[value="okabe-ito"])').first();
    await paletteSelect.selectOption("set1");

    // After the dispatch + re-render, ns must be grey regardless of
    // the picked palette (per the fix in helpers/index.tsx).
    const nsCircle = page.locator("g#points-ns circle").first();
    const fill = await nsCircle.getAttribute("fill");
    expect(fill?.toLowerCase()).toBe(NS_GREY);

    // Up class should now be Set1[0] = #E41A1C.
    const upCircle = page.locator("g#points-up circle").first();
    const upFill = await upCircle.getAttribute("fill");
    expect(upFill?.toLowerCase()).toBe("#e41a1c");
  });

  test("after picking pastel3: ns is STILL grey (worst-case for the bug)", async ({ page }) => {
    // Set3 was the canonical reproducer — its [last] hex is pastel
    // purple, so a stale colorNs would show as visibly purple in
    // the chart. If this passes, the self-healing useEffect is
    // doing its job.
    await loadVolcanoExample(page);
    const colorsHeader = page.getByRole("button", { name: /^Colors$/ });
    if (await colorsHeader.isVisible()) await colorsHeader.click();
    const paletteSelect = page.locator('select:has(option[value="okabe-ito"])').first();
    await paletteSelect.selectOption("set3");
    const nsCircle = page.locator("g#points-ns circle").first();
    const fill = await nsCircle.getAttribute("fill");
    expect(fill?.toLowerCase()).toBe(NS_GREY);
  });
});

test.describe("volcano — search-by-name highlights matched points", () => {
  test("typing a label prefix + Enter labels matching points", async ({ page }) => {
    await loadVolcanoExample(page);

    // The Labels tile sidebar — open it if collapsed.
    const labelsHeader = page.getByRole("button", { name: /^Labels$/ });
    if (await labelsHeader.isVisible()) await labelsHeader.click();

    const searchBox = page.getByPlaceholder(/gene name|paste a list/i);
    await expect(searchBox).toBeVisible();

    // Type a token that's certainly going to match in the bundled
    // demo: "AT" — Arabidopsis gene-name prefix used heavily in the
    // synthetic transcriptomics dataset.
    await searchBox.fill("AT");
    // Live preview should report at least one match.
    await expect(page.locator("text=/\\d+ match/i").first()).toBeVisible();
    // Submit. Add button is right next to the search input.
    const addBtn = page.getByRole("button", { name: /^Add$/ });
    await addBtn.click();

    // After submit, the chart should now contain at least one
    // <text> node inside the top-n-labels group — visible labels
    // for the matched points.
    await expect(page.locator("g#top-n-labels text").first()).toBeVisible();
  });
});

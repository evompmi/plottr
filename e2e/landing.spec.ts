// Landing-page smoke. Every plot-tool tile is a link the user clicks
// to enter a tool. If any HTML / vendor / shared-bundle path goes
// missing — say, a deploy strips a file — this test catches it before
// the user does.

import { test, expect } from "@playwright/test";

test("landing page renders all ten tool tiles", async ({ page }) => {
  await page.goto("/index.html");

  // The landing header must say "Plöttr" — flushing out the case where
  // the page loaded but bundle loading failed.
  await expect(page).toHaveTitle(/Pl[oö]ttr/);

  // The "N internal tests" badge — present if the page rendered + the
  // bundle init ran. The number is auto-bumped by `posttest`; we only
  // check the badge exists, not its value.
  await expect(page.locator("text=/\\d+\\s+internal tests/i")).toBeVisible();

  // Each tool tile is a <button class="tile" data-tool="<tool>"> with
  // an icon + label inside; opening a tool swaps a hidden iframe in
  // (see index.html). We assert all ten tile buttons exist.
  const tools = [
    "boxplot",
    "scatter",
    "lineplot",
    "venn",
    "upset",
    "heatmap",
    "aequorin",
    "volcano",
    "molarity",
    "power",
  ];
  for (const t of tools) {
    const tile = page.locator(`button.tile[data-tool="${t}"]`);
    await expect(tile).toBeVisible();
  }
});

test("theme toggle flips data-theme attribute", async ({ page }) => {
  await page.goto("/index.html");

  const html = page.locator("html");
  // Start state: prefers-color-scheme: light is the Playwright default,
  // so the page should NOT have data-theme="dark" until the user clicks.
  // (The first-visit no-FOUC inline script sets it from localStorage or
  // the media query — neither of which will produce dark in our config.)
  const before = await html.getAttribute("data-theme");
  expect(before === null || before === "light").toBeTruthy();

  // The toggle button is rendered by the shared `ThemeToggle` component
  // — every page exposes it via `data-theme-toggle`.
  await page.locator("[data-theme-toggle]").first().click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  // Click again — back to light.
  await page.locator("[data-theme-toggle]").first().click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

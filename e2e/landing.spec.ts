// Landing page smoke: the page and bundles load, every tool is one click
// away, the theme toggle works, and "Try it on example data" lands on
// Group Plot's plot step with the example loaded.

import { test, expect } from "@playwright/test";

const TOOLS = [
  "boxplot",
  "proportions",
  "qpcr",
  "scatter",
  "lineplot",
  "aequorin",
  "venn",
  "upset",
  "heatmap",
  "volcano",
  "power",
  "molarity",
];

test("landing page links all twelve tools", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/Pl[oö]ttr/);
  // Copy swapped in by applyStaticI18n → the shared bundle ran.
  await expect(
    page.getByRole("heading", { level: 2, name: "Start from your question" })
  ).toBeVisible();
  for (const t of TOOLS) {
    await expect(page.locator(`a[data-tool="${t}"]`)).toBeVisible();
  }
  await page.locator('a[data-tool="scatter"]').click();
  await expect(page).toHaveURL(/#\/scatter$/);
  await expect(page.getByTestId("load-example").first()).toBeVisible();
});

test("theme toggle flips data-theme attribute", async ({ page }) => {
  await page.goto("/index.html");
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  expect(before === null || before === "light").toBeTruthy();
  await page.locator("[data-theme-toggle]").first().click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.locator("[data-theme-toggle]").first().click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("Try it on example data opens Group Plot's plot with the example", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("link", { name: "Try it on example data" }).click();
  await expect(page).toHaveURL(/#\/boxplot$/);
  await expect(page.locator("svg g#groups > g")).toHaveCount(3);
  await expect(page.locator('[data-testid="step-plot"][aria-current="step"]')).toBeVisible();
});

test("French copy follows the language toggle", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("[data-lang-toggle]").first().click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Partez de votre question" })
  ).toBeVisible();
  await expect(page.locator(".lp-sheet img")).toHaveAttribute("alt", /Boîtes à moustaches/);
});

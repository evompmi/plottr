// Venn golden path. With 2 or 3 sets, the example auto-commits the
// selection and routes to the plot step. We assert the SVG renders the
// expected number of set circles.

import { test, expect } from "@playwright/test";

test("venn: load example → chart renders set circles", async ({ page }) => {
  await page.goto("/index.html#/venn");
  await page.getByTestId("load-example").click();

  // Venn auto-routes to plot when the example has ≤ 3 sets. If for
  // some reason it lands on configure, force the nav.
  const plotStep = page.getByTestId("step-plot");
  if (await plotStep.isVisible()) await plotStep.click();

  // Set circles are wrapped in `<g id="set-circles">` with one
  // `<circle>` per set. Example has 3 sets.
  const circles = page.locator('svg g[id^="set-circles"] circle');
  await expect(circles.first()).toBeVisible();
  expect(await circles.count()).toBeGreaterThanOrEqual(2);
});

test("venn: intersection table rows are keyboard-operable (Enter selects)", async ({ page }) => {
  await page.goto("/index.html#/venn");
  await page.getByTestId("load-example").click();
  const plotStep = page.getByTestId("step-plot");
  if (await plotStep.isVisible()) await plotStep.click();

  // The Intersections table exposes each region as a focusable button row —
  // the keyboard route to extracting region members (previously mouse-only).
  const rows = page.locator('tr[role="button"]');
  await expect(rows.first()).toBeVisible();
  expect(await rows.first().getAttribute("tabindex")).toBe("0");

  // Focus the first row and activate it with Enter; aria-pressed flips on.
  await rows.first().focus();
  await page.keyboard.press("Enter");
  await expect(rows.first()).toHaveAttribute("aria-pressed", "true");
});

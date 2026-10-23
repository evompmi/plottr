// Boxplot golden path. The example dataset auto-detects wide format
// (3 genotypes × 3 treatments × 8 reps) and routes the user through
// upload → configure → filter → plot. We walk all the way to
// plot and assert the chart populates with at least one box per group.

import { test, expect } from "@playwright/test";

test("boxplot: load example → walk to plot → chart renders boxes", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();

  // The example uses wide format and the configure step pre-fills
  // group / value column roles. Walk via the StepNavBar's "Plot" pill.
  await page.getByTestId("step-plot").click();

  // The chart renders inside a `<g id="groups">` group (one <g> per
  // box). Wait for it to populate, then assert at least 2 group
  // children — the example has 3 genotypes so there should be ≥ 3,
  // ≥ 2 keeps the assertion robust against the example dataset
  // changing.
  const groupsLayer = page.locator("svg g#groups").first();
  await expect(groupsLayer).toBeVisible();
  const boxes = await groupsLayer.locator("> g").count();
  expect(boxes).toBeGreaterThanOrEqual(2);
});

test("boxplot: square corners + custom outline restyle box and median", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  const firstBox = page.locator("svg g#groups > g").first();
  const rect = firstBox.locator('rect[stroke-width="1.5"]');
  const median = firstBox.locator('line[stroke-width="2.5"]');
  await expect(rect).toHaveAttribute("rx", "2");
  const groupColor = await rect.getAttribute("fill");
  await expect(rect).toHaveAttribute("stroke", groupColor ?? "");

  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByRole("button", { name: "Square" }).click();
  await page.getByRole("button", { name: "Custom" }).click();

  await expect(rect).toHaveAttribute("rx", "0");
  await expect(rect).toHaveAttribute("stroke", "#000000");
  await expect(median).toHaveAttribute("stroke", "#000000");
  await expect(rect).toHaveAttribute("fill", groupColor ?? "");
});

test("boxplot: outlier marks can be turned off while points are shown", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  const marks = page.locator('svg g#groups circle[fill="#000"]');
  const points = page.locator('svg g#groups circle:not([fill="#000"])');
  await expect(marks.first()).toBeVisible();
  const pointCount = await points.count();

  await page.getByRole("tab", { name: "Style" }).click();
  await page
    .getByRole("group", { name: "Mark outliers in black" })
    .getByRole("button", { name: "Off" })
    .click();

  await expect(marks).toHaveCount(0);
  await expect(points).toHaveCount(pointCount);
});

test("boxplot: filter step keeps, renames and orders groups in one list", async ({ page }) => {
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-filter").click();

  const genotype = page.getByRole("region", { name: "Genotype" });
  const rowOrder = () =>
    genotype
      .getByRole("textbox")
      .evaluateAll((els) => els.map((e) => (e as { value: string }).value));

  // Unticking keeps the row in its slot.
  await genotype.getByRole("checkbox", { name: "Keep abi4" }).uncheck();
  expect(await rowOrder()).toEqual(["WT", "abi4", "oxSOS1"]);
  await genotype.getByRole("button", { name: "Move oxSOS1 up" }).click();
  expect(await rowOrder()).toEqual(["WT", "oxSOS1", "abi4"]);
  // Renaming after a reorder keeps the slot too.
  await genotype.getByRole("textbox", { name: "Rename WT" }).fill("Col0");
  await expect(genotype).toContainText("was WT");
  expect(await rowOrder()).toEqual(["Col0", "oxSOS1", "abi4"]);
  await genotype.getByRole("button", { name: "Move oxSOS1 up" }).click();

  await page.getByTestId("step-plot").click();
  const ids = await page
    .locator("svg g#groups > g")
    .evaluateAll((gs) => gs.map((g) => g.getAttribute("id")));
  expect(ids).toEqual(["group-oxSOS1", "group-Col0"]);
});

test("boxplot: statistics column opens on demand; marks work while it is closed", async ({
  page,
}) => {
  await page.goto("/index.html#/boxplot");
  await page.evaluate(() => localStorage.removeItem("plottr-inspector-boxplot"));
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();

  const inspector = page.getByRole("complementary", { name: "Statistics" });
  const show = page.getByRole("button", { name: "Show Statistics" });
  await expect(inspector).toBeHidden();
  await expect(show).toHaveAttribute("aria-expanded", "false");

  // Letters come from the (hidden) stats panel.
  await page.getByRole("button", { name: "Letters", exact: true }).click();
  await expect(page.locator("svg g#cld-annotations text")).toHaveCount(3);

  await show.click();
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Welch's ANOVA");
  const hide = inspector.getByRole("button", { name: "Hide" });
  await expect(hide).toBeFocused();

  // Remembered across a reload.
  await page.reload();
  await page.getByTestId("load-example").click();
  await page.getByTestId("step-plot").click();
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Hide" }).click();
  await expect(inspector).toBeHidden();
  await expect(show).toBeFocused();
});

test("data CSVs sit in the More menu: long is one file, wide one per facet × subgroup", async ({
  page,
}) => {
  // Plain downloads instead of Chromium's save-file / folder pickers.
  await page.addInitScript(() => {
    const g = globalThis as { showSaveFilePicker?: unknown; showDirectoryPicker?: unknown };
    g.showSaveFilePicker = undefined;
    g.showDirectoryPicker = undefined;
  });
  await page.goto("/index.html#/boxplot");
  await page.getByTestId("load-example").click();
  await expect(page.getByTestId("step-output")).toHaveCount(0);
  await page.getByTestId("step-plot").click();

  const more = page.getByRole("toolbar").getByRole("button", { name: "More ▾" });
  const fs = await import("node:fs");
  const read = async (dl: import("@playwright/test").Download) =>
    fs
      .readFileSync((await dl.path()) as string, "utf8")
      .split(/\r?\n/)
      .filter((r) => r !== "");
  const collect = async (item: string, count: number) => {
    const downloads: import("@playwright/test").Download[] = [];
    const onDownload = (d: import("@playwright/test").Download) => downloads.push(d);
    page.on("download", onDownload);
    // The menu stays open after a download (it flashes "Saved").
    if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await expect.poll(() => downloads.length).toBe(count);
    page.off("download", onDownload);
    return downloads;
  };
  const names = (dls: import("@playwright/test").Download[]) =>
    dls.map((d) => d.suggestedFilename()).sort();

  // No split: one long file with every observation, one wide file.
  const [long] = await collect("Long CSV", 1);
  expect(long.suggestedFilename()).toBe("example_plant_growth_long.csv");
  const longRows = await read(long);
  expect(longRows[0]).toBe('"Genotype","Treatment","Replicate","Biomass_mg"');
  expect(longRows.length).toBe(1 + 72);
  const [wide] = await collect("Wide CSV", 1);
  expect(wide.suggestedFilename()).toBe("example_plant_growth_wide.csv");
  expect((await read(wide))[0]).toBe('"WT","abi4","oxSOS1"');

  // Facet by Treatment: long stays one file (the Treatment column is kept);
  // wide splits into one file per facet.
  await page.getByRole("tab", { name: "Facets" }).click();
  await page.getByLabel("Facet by").selectOption({ label: "Treatment" });
  const [facetLong] = await collect("Long CSV", 1);
  expect((await read(facetLong)).length).toBe(1 + 72);
  const facets = await collect("Wide CSV", 3);
  expect(names(facets)).toEqual([
    "example_plant_growth_control_wide.csv",
    "example_plant_growth_drought_wide.csv",
    "example_plant_growth_salt_wide.csv",
  ]);
  for (const d of facets) {
    const rows = await read(d);
    expect(rows[0]).toBe('"WT","abi4","oxSOS1"');
    expect(rows.length).toBe(1 + 8);
  }

  // Facet by Treatment × subgroup by Replicate: one wide file per
  // combination (3 × 8 = 24), which arrive as one zip.
  await page.getByLabel("Subgroup by").selectOption({ label: "Replicate" });
  const [zip] = await collect("Wide CSV", 1);
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  const zipText = fs.readFileSync((await zip.path()) as string, "latin1");
  expect(zipText).toContain("example_plant_growth_control_1_wide.csv");
  expect(zipText).toContain("example_plant_growth_salt_8_wide.csv");
});

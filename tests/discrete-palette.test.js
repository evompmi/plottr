// Unit tests for tools/shared-discrete-palette.js — the discrete palette
// catalogue + helpers used by every plot tool's per-group colour seed.

const { suite, test, assert, eq, summary } = require("./harness");
const {
  PALETTE,
  DISCRETE_PALETTES,
  COLORBLIND_SAFE_PALETTES,
  resolveDiscretePalette,
  applyDiscretePalette,
  buildGgplot2Hue,
  buildViridisDiscrete,
} = require("./helpers/discrete-palette-loader");

const HEX_RX = /^#[0-9a-fA-F]{6}$/;

suite("discrete-palette — catalogue shape");

test("DISCRETE_PALETTES exposes the 11 expected keys", () => {
  const expected = [
    "okabe-ito",
    "tab10",
    "set1",
    "set2",
    "set3",
    "dark2",
    "paired",
    "pastel1",
    "pastel2",
    "ggplot2-hue",
    "viridis-d",
  ];
  eq(Object.keys(DISCRETE_PALETTES).sort(), expected.slice().sort());
});

test("every fixed palette is a non-empty array of valid hex strings", () => {
  Object.entries(DISCRETE_PALETTES).forEach(([key, arr]) => {
    if (key === "ggplot2-hue" || key === "viridis-d") return; // sentinel
    assert(Array.isArray(arr), `${key} should be an array`);
    assert(arr.length > 0, `${key} should be non-empty`);
    arr.forEach((c, i) => {
      assert(HEX_RX.test(c), `${key}[${i}] = ${c} is not #rrggbb`);
    });
  });
});

test("ggplot2-hue and viridis-d are runtime sentinels", () => {
  eq(DISCRETE_PALETTES["ggplot2-hue"], ["*"]);
  eq(DISCRETE_PALETTES["viridis-d"], ["*"]);
});

test("okabe-ito is byte-identical to the global PALETTE (regression guard)", () => {
  eq(DISCRETE_PALETTES["okabe-ito"], Array.from(PALETTE));
});

test("COLORBLIND_SAFE_PALETTES marks the four conservative-safe entries", () => {
  const safe = Array.from(COLORBLIND_SAFE_PALETTES).sort();
  eq(safe, ["dark2", "okabe-ito", "paired", "viridis-d"]);
});

suite("discrete-palette — resolveDiscretePalette");

test("returns hexes recycled modulo for fixed palettes when n > palette.length", () => {
  const out = resolveDiscretePalette("set1", 13);
  eq(out.length, 13);
  eq(out[0], DISCRETE_PALETTES.set1[0]);
  eq(out[9], DISCRETE_PALETTES.set1[9 % DISCRETE_PALETTES.set1.length]);
  eq(out[12], DISCRETE_PALETTES.set1[12 % DISCRETE_PALETTES.set1.length]);
});

test("returns exactly n hexes for ggplot2-hue at any size", () => {
  const out = buildGgplot2Hue(5);
  eq(out.length, 5);
  out.forEach((c, i) => assert(HEX_RX.test(c), `ggplot2-hue[${i}] = ${c} is not #rrggbb`));
  // 5 distinct hues
  const uniq = new Set(out);
  eq(uniq.size, 5);
});

test("returns exactly n hexes for viridis-d at any size", () => {
  const out = buildViridisDiscrete(7);
  eq(out.length, 7);
  out.forEach((c, i) => assert(HEX_RX.test(c), `viridis-d[${i}] = ${c} is not #rrggbb`));
  const uniq = new Set(out);
  eq(uniq.size, 7);
});

test("unknown palette name falls back to okabe-ito", () => {
  const out = resolveDiscretePalette("does-not-exist", 4);
  eq(out, DISCRETE_PALETTES["okabe-ito"].slice(0, 4));
});

test("zero or negative n still returns at least one colour for fixed palettes", () => {
  const out = resolveDiscretePalette("dark2", 0);
  // n is clamped to 1; output may be 1-element from dark2[0]
  assert(out.length >= 1, "expected at least one colour");
});

suite("discrete-palette — applyDiscretePalette");

test("returns a record keyed by name with palette colours in order", () => {
  const out = applyDiscretePalette("set1", ["A", "B", "C"]);
  eq(out, {
    A: DISCRETE_PALETTES.set1[0],
    B: DISCRETE_PALETTES.set1[1],
    C: DISCRETE_PALETTES.set1[2],
  });
});

test("recycles modulo for more names than palette colours", () => {
  // dark2 has 8 colours; ask for 10
  const names = Array.from({ length: 10 }, (_, i) => "g" + i);
  const out = applyDiscretePalette("dark2", names);
  eq(Object.keys(out).length, 10);
  eq(out["g0"], DISCRETE_PALETTES.dark2[0]);
  eq(out["g8"], DISCRETE_PALETTES.dark2[0]);
  eq(out["g9"], DISCRETE_PALETTES.dark2[1]);
});

test("ggplot2-hue produces n distinct colours for n names", () => {
  const out = applyDiscretePalette("ggplot2-hue", ["a", "b", "c", "d"]);
  eq(Object.keys(out).length, 4);
  const colors = Object.values(out);
  eq(new Set(colors).size, 4);
});

test("empty names array returns empty record", () => {
  eq(applyDiscretePalette("set1", []), {});
});

test("non-array names input is treated as empty", () => {
  eq(applyDiscretePalette("set1", null), {});
  eq(applyDiscretePalette("set1", undefined), {});
});

suite("discrete-palette — boxplot integration smoke");

test("picking set1 produces set1[0] for the first group", () => {
  // Mirrors the per-tool `applyColors` lambda shape: build the resolved
  // record and read the value at the first group's name.
  const groupNames = ["control", "treated", "ko"];
  const colors = applyDiscretePalette("set1", groupNames);
  eq(colors["control"], DISCRETE_PALETTES.set1[0]);
  eq(colors["treated"], DISCRETE_PALETTES.set1[1]);
  eq(colors["ko"], DISCRETE_PALETTES.set1[2]);
});

test("picking okabe-ito reproduces the legacy default exactly", () => {
  const groupNames = ["A", "B", "C", "D"];
  const colors = applyDiscretePalette("okabe-ito", groupNames);
  eq(colors["A"], PALETTE[0]);
  eq(colors["B"], PALETTE[1]);
  eq(colors["C"], PALETTE[2]);
  eq(colors["D"], PALETTE[3]);
});

summary();

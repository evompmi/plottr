// Boxplot helpers — covers `mergeSubgroupAnnotations` under the composite-key
// extraction pattern that `tools/boxplot/index.tsx` uses to render
// facet × subgroup mode (one merged annotation spec per facet, with offset
// indices). The pure helper itself is mode-agnostic; this test pins the
// glue that converts a single flat `cellAnnotations` dict (keyed by
// `${facet}::${subgroup}`) into the per-key spec map the helper consumes.
//
// Also covers `computeChartMargins` (tools/boxplot/layout.ts) — specifically
// the left-margin reservation for rotated x-labels.

const { suite, test, assert, eq, summary } = require("./harness");
const { mergeSubgroupAnnotations, computeChartMargins } = require("./helpers/boxplot-loader");

const cellKey = (f, s) => `${f}::${s}`;

function pickPerSubgroupSpecs(facetCat, subgroups, cellAnnotations) {
  const out = {};
  for (const sg of subgroups) {
    out[sg.name] = cellAnnotations[cellKey(facetCat, sg.name)] || null;
  }
  return out;
}

suite("mergeSubgroupAnnotations — composite-key extraction (facet × subgroup)");

test("per-facet call merges only that facet's specs and preserves offsets", () => {
  // Two facets ("Day1", "Day2"), each with two subgroups ("Wet", "Dry"),
  // each subgroup with two groups. flatGroups laid out as Wet(g0,g1) | Dry(g2,g3).
  const subgroups = [
    { name: "Wet", startIndex: 0, count: 2 },
    { name: "Dry", startIndex: 2, count: 2 },
  ];
  const flatGroups = [{ name: "ctrl" }, { name: "trt" }, { name: "ctrl" }, { name: "trt" }];
  const cellAnnotations = {
    [cellKey("Day1", "Wet")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.01, label: "**" }],
      groupNames: ["ctrl", "trt"],
    },
    [cellKey("Day1", "Dry")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.04, label: "*" }],
      groupNames: ["ctrl", "trt"],
    },
    // A spec for the OTHER facet must not leak into Day1's merge.
    [cellKey("Day2", "Wet")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.001, label: "***" }],
      groupNames: ["ctrl", "trt"],
    },
  };

  const day1 = mergeSubgroupAnnotations(
    subgroups,
    flatGroups,
    pickPerSubgroupSpecs("Day1", subgroups, cellAnnotations)
  );
  assert(day1, "Day1 merge must return a spec");
  eq(day1.kind, "brackets");
  eq(day1.pairs.length, 2);
  // Wet bracket: original i=0,j=1, startIndex=0 → still 0,1
  eq(day1.pairs[0].i, 0);
  eq(day1.pairs[0].j, 1);
  // Dry bracket: original i=0,j=1, startIndex=2 → 2,3
  eq(day1.pairs[1].i, 2);
  eq(day1.pairs[1].j, 3);
  // Day2's spec must not appear: only two pairs total (one per Day1 sg).
  // (already asserted above via length === 2)
});

test("Day2's merge picks up only Day2 specs", () => {
  const subgroups = [
    { name: "Wet", startIndex: 0, count: 2 },
    { name: "Dry", startIndex: 2, count: 2 },
  ];
  const flatGroups = [{ name: "a" }, { name: "b" }, { name: "a" }, { name: "b" }];
  const cellAnnotations = {
    [cellKey("Day1", "Wet")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.5, label: "ns" }],
      groupNames: ["a", "b"],
    },
    [cellKey("Day2", "Dry")]: {
      kind: "cld",
      labels: ["a", "b"],
      groupNames: ["a", "b"],
    },
  };
  const day2 = mergeSubgroupAnnotations(
    subgroups,
    flatGroups,
    pickPerSubgroupSpecs("Day2", subgroups, cellAnnotations)
  );
  assert(day2, "Day2 merge must return a spec");
  eq(day2.kind, "cld");
  // CLD labels for Dry land at startIndex=2,3 ; Wet stays null.
  eq(day2.labels[0], null);
  eq(day2.labels[1], null);
  eq(day2.labels[2], "a");
  eq(day2.labels[3], "b");
});

test("returns null when no spec exists for any subgroup of the requested facet", () => {
  const subgroups = [
    { name: "Wet", startIndex: 0, count: 1 },
    { name: "Dry", startIndex: 1, count: 1 },
  ];
  const flatGroups = [{ name: "a" }, { name: "a" }];
  const cellAnnotations = {
    [cellKey("OtherFacet", "Wet")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.01 }],
    },
  };
  const merged = mergeSubgroupAnnotations(
    subgroups,
    flatGroups,
    pickPerSubgroupSpecs("Day1", subgroups, cellAnnotations)
  );
  eq(merged, null);
});

test("subgroup-only mode (empty facet key) extracts via cellKey('', sgName)", () => {
  // Validates the panel-key convention used by index.tsx for subgroup-only:
  // facetCat is "" and the dict keys look like "::Wet" / "::Dry".
  const subgroups = [
    { name: "Wet", startIndex: 0, count: 2 },
    { name: "Dry", startIndex: 2, count: 2 },
  ];
  const flatGroups = [{ name: "a" }, { name: "b" }, { name: "a" }, { name: "b" }];
  const cellAnnotations = {
    [cellKey("", "Wet")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.02, label: "*" }],
      groupNames: ["a", "b"],
    },
    [cellKey("", "Dry")]: {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p: 0.03, label: "*" }],
      groupNames: ["a", "b"],
    },
  };
  const merged = mergeSubgroupAnnotations(
    subgroups,
    flatGroups,
    pickPerSubgroupSpecs("", subgroups, cellAnnotations)
  );
  assert(merged, "subgroup-only merge must return a spec");
  eq(merged.kind, "brackets");
  eq(merged.pairs.length, 2);
  eq(merged.pairs[1].i, 2); // Dry offset
  eq(merged.pairs[1].j, 3);
});

// ── computeChartMargins — rotated-label left margin ─────────────────────────
//
// Regression: vertical-mode rotated x-labels are anchored "end" at their
// tick and tilt down-left, so a long category label overhangs the gutter.
// `leftM` was hard-coded to 62 px, so the leftmost label clipped off the
// SVG's left edge. The fix reserves the label's horizontal extent
// (labelWidth · cos angle) — the mirror of the vertical extent `botM`
// already reserves for the same labels.

suite("computeChartMargins — rotated-label left margin");

(function () {
  const longGroups = [
    { name: "Wild-type baseline (uninduced, 0 h)" },
    { name: "Knockout + rescue construct (induced, 24 h)" },
  ];
  const shortGroups = [{ name: "Ctrl" }, { name: "Test" }];
  const base = { horizontal: false, plotStyle: "bar", showCompPie: false, colorByCol: -1 };

  test("long labels + rotation grow the left margin past the 62 px floor", () => {
    const { M } = computeChartMargins({ ...base, groups: longGroups, xLabelAngle: 30 });
    assert(M.left > 62, `expected left margin > 62 for long rotated labels, got ${M.left}`);
  });

  test("long labels without rotation keep the 62 px floor", () => {
    const { M } = computeChartMargins({ ...base, groups: longGroups, xLabelAngle: 0 });
    eq(M.left, 62);
  });

  test("short labels + rotation keep the 62 px floor", () => {
    const { M } = computeChartMargins({ ...base, groups: shortGroups, xLabelAngle: 45 });
    eq(M.left, 62);
  });

  test("steeper rotation reserves less left margin (cos shrinks with angle)", () => {
    const shallow = computeChartMargins({ ...base, groups: longGroups, xLabelAngle: 30 }).M.left;
    const steep = computeChartMargins({ ...base, groups: longGroups, xLabelAngle: 60 }).M.left;
    assert(
      steep > 62 && steep < shallow,
      `expected 62 < steep(60°) < shallow(30°), got steep=${steep} shallow=${shallow}`
    );
  });
})();

summary();

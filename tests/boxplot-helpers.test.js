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
const {
  mergeSubgroupAnnotations,
  computeChartMargins,
  computeBpAnnotationSpec,
  compositionLabel,
  buildCompositionTable,
  isCompositionTestable,
  compositionTableCsv,
} = require("./helpers/boxplot-loader");
const { parseRaw: parseRawP, parseCountsTable } = require("./helpers/proportions-loader");

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

// ── computeBpAnnotationSpec — displayed-group index alignment ────────────────
//
// Regression: when a displayed condition has < 2 values it is dropped from
// testing, so `names` / post-hoc pair indices live in a dense "valid-group"
// index space. The chart positions annotations across *all* displayed groups
// via `axisCoord(i)`, so a dropped group in the middle used to shift every
// letter / bracket one box to the left. `displayNames` + `groupIndexMap`
// project the annotation back onto the displayed ordering, with `null` for the
// untested slots.

suite("computeBpAnnotationSpec — displayed-group index alignment");

const cldRow = (extra) => ({
  k: 3,
  names: ["A", "B", "C"],
  testResult: null,
  postHocResult: {
    pairs: [
      { i: 0, j: 1, p: 0.001, pAdj: 0.001 },
      { i: 0, j: 2, p: 0.001, pAdj: 0.001 },
      { i: 1, j: 2, p: 0.8, pAdj: 0.8 },
    ],
  },
  ...extra,
});

test("CLD labels scatter onto displayed slots, null for the untested group", () => {
  // Displayed order: A, <empty>, B, C — the empty group (index 1) has no data.
  const identity = computeBpAnnotationSpec(cldRow({}), "cld", false);
  eq(identity.kind, "cld");
  eq(identity.labels.length, 3); // valid-group space when no map supplied

  const mapped = computeBpAnnotationSpec(
    cldRow({ displayNames: ["A", "empty", "B", "C"], groupIndexMap: [0, 2, 3] }),
    "cld",
    false
  );
  eq(mapped.kind, "cld");
  eq(mapped.labels.length, 4); // one entry per displayed group
  eq(mapped.labels[1], null); // the untested middle group carries no letter
  // Each valid-group letter lands on its displayed slot, unchanged in value.
  eq(mapped.labels[0], identity.labels[0]);
  eq(mapped.labels[2], identity.labels[1]);
  eq(mapped.labels[3], identity.labels[2]);
});

test("k=2 bracket spans the two tested boxes across an untested middle group", () => {
  const spec = computeBpAnnotationSpec(
    {
      k: 2,
      names: ["A", "B"],
      testResult: { p: 0.01 },
      displayNames: ["A", "empty", "B"],
      groupIndexMap: [0, 2],
    },
    "brackets",
    true
  );
  eq(spec.kind, "brackets");
  eq(spec.pairs.length, 1);
  eq(spec.pairs[0].i, 0);
  eq(spec.pairs[0].j, 2); // not 1 — the empty group sits between the two tested boxes
});

test("k>=3 bracket indices remap into displayed-group space", () => {
  const spec = computeBpAnnotationSpec(
    cldRow({ displayNames: ["A", "empty", "B", "C"], groupIndexMap: [0, 2, 3] }),
    "brackets",
    true
  );
  eq(spec.kind, "brackets");
  // showNs=true keeps all three pairs (0-1, 0-2, 1-2 in valid space), each
  // remapped into displayed-group indices (0-2, 0-3, 2-3).
  const asKeys = spec.pairs.map((pr) => `${pr.i}-${pr.j}`).sort();
  eq(asKeys.join(","), "0-2,0-3,2-3");
});

test("no index map (nothing dropped) is unchanged identity behaviour", () => {
  const spec = computeBpAnnotationSpec(cldRow({}), "brackets", true);
  eq(spec.kind, "brackets");
  const asKeys = spec.pairs.map((pr) => `${pr.i}-${pr.j}`).sort();
  eq(asKeys.join(","), "0-1,0-2,1-2");
});

suite("buildCompositionTable — composition pies → Proportions counts table");

const src = (category, n) => ({ category, values: Array.from({ length: n }, (_, i) => i) });

test("counts are the pie slice sizes, in colour-by order", () => {
  const t = buildCompositionTable(
    [
      { labelParts: ["WT"], sources: [src("dead", 3), src("alive", 7)] },
      { labelParts: ["mut"], sources: [src("alive", 2)] },
    ],
    ["alive", "dead"],
    ["Genotype"],
    null
  );
  eq(t.header, "Genotype");
  eq(JSON.stringify(t.groups), JSON.stringify(["WT", "mut"]));
  eq(JSON.stringify(t.categories), JSON.stringify(["alive", "dead"]));
  eq(
    JSON.stringify(t.counts),
    JSON.stringify([
      [7, 3],
      [2, 0],
    ])
  );
  eq(t.facet, null);
});

test("classes absent from every group are dropped", () => {
  const t = buildCompositionTable(
    [
      { labelParts: ["A"], sources: [src("x", 1), src("z", 4)] },
      { labelParts: ["B"], sources: [src("z", 2)] },
    ],
    ["x", "y", "z"],
    ["G"],
    null
  );
  eq(JSON.stringify(t.categories), JSON.stringify(["x", "z"]));
  eq(
    JSON.stringify(t.counts),
    JSON.stringify([
      [1, 4],
      [0, 2],
    ])
  );
});

test("labels and header join facet.subgroup.group, skipping empty parts", () => {
  eq(compositionLabel(["Day1", "Wet", "WT"]), "Day1.Wet.WT");
  eq(compositionLabel(["", "WT"]), "WT");
  const t = buildCompositionTable(
    [{ labelParts: ["Day1", "Wet", "WT"], sources: [src("a", 1)] }],
    ["a"],
    ["Day", "Watering", "Genotype"],
    "Day1"
  );
  eq(t.groups[0], "Day1.Wet.WT");
  eq(t.header, "Day.Watering.Genotype");
  eq(t.facet, "Day1");
});

test("duplicate labels stay separate rows with a numbered suffix", () => {
  const t = buildCompositionTable(
    [
      { labelParts: ["ctrl"], sources: [src("a", 1)] },
      { labelParts: ["ctrl"], sources: [src("a", 2)] },
      { labelParts: ["ctrl"], sources: [src("a", 3)] },
    ],
    ["a"],
    ["G"],
    null
  );
  eq(JSON.stringify(t.groups), JSON.stringify(["ctrl", "ctrl (2)", "ctrl (3)"]));
});

test("a suffix never collides with a group already named like one", () => {
  const t = buildCompositionTable(
    [
      { labelParts: ["ctrl"], sources: [src("a", 1)] },
      { labelParts: ["ctrl (2)"], sources: [src("a", 1)] },
      { labelParts: ["ctrl"], sources: [src("a", 1)] },
    ],
    ["a"],
    ["G"],
    null
  );
  eq(JSON.stringify(t.groups), JSON.stringify(["ctrl", "ctrl (2)", "ctrl (3)"]));
});

test("isCompositionTestable needs two groups and two classes", () => {
  const two = buildCompositionTable(
    [
      { labelParts: ["A"], sources: [src("x", 1), src("y", 1)] },
      { labelParts: ["B"], sources: [src("x", 1)] },
    ],
    ["x", "y"],
    ["G"],
    null
  );
  eq(isCompositionTestable(two), true);
  const oneClass = buildCompositionTable(
    [
      { labelParts: ["A"], sources: [src("x", 1)] },
      { labelParts: ["B"], sources: [src("x", 5)] },
    ],
    ["x", "y"],
    ["G"],
    null
  );
  eq(isCompositionTestable(oneClass), false);
  const oneGroup = buildCompositionTable(
    [{ labelParts: ["A"], sources: [src("x", 1), src("y", 2)] }],
    ["x", "y"],
    ["G"],
    null
  );
  eq(isCompositionTestable(oneGroup), false);
});

test("CSV parses back in Proportions to the same table, commas and quotes included", () => {
  const t = buildCompositionTable(
    [
      { labelParts: ["Day 1", 'line "a", T2'], sources: [src("dead, late", 3), src("alive", 7)] },
      { labelParts: ["Day 1", "WT"], sources: [src("alive", 9)] },
    ],
    ["alive", "dead, late"],
    ["Day", "Line"],
    "Day 1"
  );
  const res = parseCountsTable(parseRawP(compositionTableCsv(t), ","));
  eq(res.error, null);
  eq(JSON.stringify(res.table.groups), JSON.stringify(['Day 1.line "a", T2', "Day 1.WT"]));
  eq(JSON.stringify(res.table.categories), JSON.stringify(["alive", "dead, late"]));
  eq(
    JSON.stringify(res.table.counts),
    JSON.stringify([
      [7, 3],
      [9, 0],
    ])
  );
});

summary();

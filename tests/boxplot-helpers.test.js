// Boxplot helpers — covers `mergeSubgroupAnnotations` under the composite-key
// extraction pattern that `tools/boxplot/app.tsx` uses to render
// facet × subgroup mode (one merged annotation spec per facet, with offset
// indices). The pure helper itself is mode-agnostic; this test pins the
// glue that converts a single flat `cellAnnotations` dict (keyed by
// `cellKey(facet, subgroup)`) into the per-key spec map the helper consumes.
//
// Also covers `computeChartMargins` (tools/boxplot/layout.ts) — specifically
// the left-margin reservation for rotated x-labels — and App's data
// derivations (tools/boxplot/derive.ts): category ordering, group building
// for the flat plot and facet / subgroup cells, stats-panel sets and cell
// keys, and the composition-pie counts tables.

const { suite, test, assert, eq, summary } = require("./harness");
const {
  mergeSubgroupAnnotations,
  computeChartMargins,
  computeBpAnnotationSpec,
  compositionLabel,
  buildCompositionTable,
  isCompositionTestable,
  compositionTableCsv,
  firstSeenOrder,
  mergeStoredOrder,
  renameInOrder,
  buildGroups,
  splitBySubgroup,
  splitRowsForExport,
  cellKey,
  FLAT_KEY,
  statsPanelModeOf,
  buildStatsPanelSets,
  buildCompositionTables,
  quartiles,
  computeStats,
} = require("./helpers/boxplot-loader");
const { parseRaw: parseRawP, parseCountsTable } = require("./helpers/proportions-loader");

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
  // Validates the panel-key convention App uses for subgroup-only:
  // facetCat is "", so the dict keys are cellKey("", "Wet") / cellKey("", "Dry").
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

// ── App data derivations (derive.ts) ──────────────────────────────────────

// Columns: Genotype, Phenotype, Day, Length.
const ROWS = [
  ["WT", "tall", "Day1", "10"],
  ["WT", "short", "Day1", "5"],
  ["mut", "short", "Day1", "4"],
  ["mut", "tall", "Day2", "9"],
  ["WT", "tall", "Day2", "12"],
  ["mut", "short", "Day2", ""],
  ["mut", "short", "Day2", "n/a"],
  ["WT", "short"],
];
const SPEC = {
  groupCol: 0,
  valueCol: 3,
  colorByCol: -1,
  colorByCategories: [],
  order: ["WT", "mut"],
  disabled: {},
  colors: {},
  palette: "okabe-ito",
};
const summarise = (groups) =>
  groups.map((g) => ({
    name: g.name,
    sources: g.sources.map((s) => [s.colIndex, s.category, s.values]),
  }));

suite("firstSeenOrder / mergeStoredOrder");

test("firstSeenOrder lists unique values in first-seen order", () => {
  eq(firstSeenOrder(ROWS.slice(0, -1), 2), ["Day1", "Day2"]);
  eq(firstSeenOrder(ROWS, 0), ["WT", "mut"]);
  eq(firstSeenOrder([], 0), []);
});

test("mergeStoredOrder: no stored order keeps the natural order", () => {
  eq(mergeStoredOrder(["a", "b"], undefined), ["a", "b"]);
  eq(mergeStoredOrder(["a", "b"], []), ["a", "b"]);
});

test("mergeStoredOrder drops vanished values and appends new ones", () => {
  eq(mergeStoredOrder(["a", "b", "c", "d"], ["c", "gone", "a"]), ["c", "a", "b", "d"]);
});

test("mergeStoredOrder keeps a dropped value's slot out of the plot order", () => {
  // The stored order covers every value; the plot order is the kept subset.
  eq(mergeStoredOrder(["a", "c"], ["c", "b", "a"]), ["c", "a"]);
});

suite("renameInOrder");

test("no stored order or no change → unchanged", () => {
  eq(renameInOrder(undefined, "WT", "Col-0", false), undefined);
  const stored = ["b", "WT"];
  eq(renameInOrder(stored, "WT", "WT", false) === stored, true);
  eq(renameInOrder(stored, "gone", "x", false) === stored, true);
});

test("a renamed value keeps its slot", () => {
  eq(renameInOrder(["b", "WT", "c"], "WT", "Col-0", false), ["b", "Col-0", "c"]);
});

test("old label still used by another value → new label goes right after it", () => {
  eq(renameInOrder(["WT", "c"], "WT", "WT-2", true), ["WT", "WT-2", "c"]);
});

test("renaming onto an existing label merges into that slot", () => {
  eq(renameInOrder(["c", "WT", "Col-0"], "WT", "Col-0", false), ["c", "Col-0"]);
  eq(renameInOrder(["c", "WT", "Col-0"], "WT", "Col-0", true), ["c", "WT", "Col-0"]);
});

suite("buildGroups");

test("no group or value column → no groups", () => {
  eq(buildGroups(ROWS, { ...SPEC, groupCol: -1 }), []);
  eq(buildGroups(ROWS, { ...SPEC, valueCol: -1 }), []);
});

test("skips empty, non-numeric and short rows; follows the given order", () => {
  eq(summarise(buildGroups(ROWS, SPEC)), [
    { name: "WT", sources: [[0, "_all", [10, 5, 12]]] },
    { name: "mut", sources: [[0, "_all", [4, 9]]] },
  ]);
  eq(
    buildGroups(ROWS, { ...SPEC, order: ["mut", "WT"] }).map((g) => g.name),
    ["mut", "WT"]
  );
});

test("groups missing from the order or disabled are dropped", () => {
  eq(
    buildGroups(ROWS, { ...SPEC, order: ["mut"] }).map((g) => g.name),
    ["mut"]
  );
  eq(
    buildGroups(ROWS, { ...SPEC, disabled: { WT: true } }).map((g) => g.name),
    ["mut"]
  );
});

test("Color-by splits sources in category order; a missing cell becomes '?'", () => {
  const rows = [...ROWS, ["mut", "", "Day3", "7"]];
  const spec = { ...SPEC, colorByCol: 1, colorByCategories: ["?", "short", "tall"] };
  eq(summarise(buildGroups(rows, spec)), [
    {
      name: "WT",
      sources: [
        [0, "short", [5]],
        [1, "tall", [10, 12]],
      ],
    },
    {
      name: "mut",
      sources: [
        [0, "?", [7]],
        [1, "short", [4]],
        [2, "tall", [9]],
      ],
    },
  ]);
});

test("stats combine quartiles and descriptive stats of all values", () => {
  const [wt] = buildGroups(ROWS, SPEC);
  eq(wt.allValues, [10, 5, 12]);
  eq(wt.stats, { ...quartiles([10, 5, 12]), ...computeStats([10, 5, 12]) });
});

test("colour precedence: override, then user colour, then palette", () => {
  const base = buildGroups(ROWS, SPEC);
  assert(/^#[0-9a-f]{6}$/i.test(base[0].color) && base[0].color !== base[1].color);
  const user = buildGroups(ROWS, { ...SPEC, colors: { WT: "#111111" } });
  eq([user[0].color, user[1].color], ["#111111", base[1].color]);
  const over = buildGroups(ROWS, {
    ...SPEC,
    colors: { WT: "#111111" },
    colorOverrides: { WT: "#222222" },
  });
  eq(over[0].color, "#222222");
});

test("palette colours are assigned by position among the kept groups", () => {
  const all = buildGroups(ROWS, SPEC);
  const onlyMut = buildGroups(ROWS, { ...SPEC, disabled: { WT: true } });
  eq(onlyMut[0].color, all[0].color);
});

suite("splitBySubgroup");

test("bands follow the subgroup order, skip empty subgroups, index contiguously", () => {
  const build = (rows) => buildGroups(rows, SPEC);
  const out = splitBySubgroup(ROWS, 2, ["Day2", "Day9", "Day1"], build);
  eq(out.subgroups, [
    { name: "Day2", startIndex: 0, count: 2 },
    { name: "Day1", startIndex: 2, count: 2 },
  ]);
  eq(
    out.flatGroups.map((g) => [g.name, g.allValues]),
    [
      ["WT", [12]],
      ["mut", [9]],
      ["WT", [10, 5]],
      ["mut", [4]],
    ]
  );
});

suite("splitRowsForExport");

test("no split → one part with every row", () => {
  const parts = splitRowsForExport(ROWS, []);
  eq(parts.length, 1);
  eq(parts[0].labels, []);
  eq(parts[0].rows === ROWS, true);
});

test("one split → one part per value in the given order, empty values skipped", () => {
  eq(splitRowsForExport(ROWS, [{ col: 2, order: ["Day2", "Day9", "Day1"] }]), [
    {
      labels: ["Day2"],
      rows: [
        ["mut", "tall", "Day2", "9"],
        ["WT", "tall", "Day2", "12"],
        ["mut", "short", "Day2", ""],
        ["mut", "short", "Day2", "n/a"],
      ],
    },
    {
      labels: ["Day1"],
      rows: [
        ["WT", "tall", "Day1", "10"],
        ["WT", "short", "Day1", "5"],
        ["mut", "short", "Day1", "4"],
      ],
    },
  ]);
});

test("two splits → facet × subgroup combinations, facet-major, empty ones skipped", () => {
  const parts = splitRowsForExport(ROWS, [
    { col: 2, order: ["Day1", "Day2"] },
    { col: 1, order: ["tall", "short"] },
  ]);
  eq(
    parts.map((p) => [p.labels, p.rows.length]),
    [
      [["Day1", "tall"], 1],
      [["Day1", "short"], 2],
      [["Day2", "tall"], 2],
      [["Day2", "short"], 2],
    ]
  );
});

test("values missing from the order are left out", () => {
  eq(
    splitRowsForExport(ROWS, [{ col: 1, order: ["tall"] }]).map((p) => p.rows.length),
    [3]
  );
});

suite("cellKey / statsPanelModeOf");

test("cellKey keeps facet and subgroup apart even when labels contain '::'", () => {
  assert(cellKey("S3::pGFP", "") !== cellKey("S3", "pGFP"));
  assert(cellKey("", "") !== FLAT_KEY);
});

test("statsPanelModeOf covers the four layouts", () => {
  eq(statsPanelModeOf(-1, -1), "flat");
  eq(statsPanelModeOf(2, -1), "facet");
  eq(statsPanelModeOf(-1, 2), "subgroup");
  eq(statsPanelModeOf(2, 1), "facetSubgroup");
});

suite("buildStatsPanelSets");

const g = (name, values) => ({ name, sources: [], allValues: values, stats: null, color: "#000" });
const RENAMES = { WT: "Col-0" };

test("flat: one set of the displayed groups, none below two groups", () => {
  eq(buildStatsPanelSets("flat", [g("A", [1]), g("B", [2])], [], null, RENAMES), [
    {
      key: FLAT_KEY,
      name: "",
      groups: [
        { name: "A", values: [1] },
        { name: "B", values: [2] },
      ],
    },
  ]);
  eq(buildStatsPanelSets("flat", [g("A", [1])], [], null, RENAMES), []);
});

test("facet: one renamed set per facet with at least two groups", () => {
  const facets = [
    { category: "Day1", groups: [g("WT", [1]), g("mut", [2])], subgroups: null, flatGroups: null },
    { category: "Day2", groups: [g("WT", [3])], subgroups: null, flatGroups: null },
  ];
  eq(buildStatsPanelSets("facet", [], facets, null, RENAMES), [
    {
      key: cellKey("Day1", ""),
      name: "Day1",
      groups: [
        { name: "Col-0", values: [1] },
        { name: "mut", values: [2] },
      ],
    },
  ]);
});

test("subgroup: one set per band with at least two groups", () => {
  const sd = {
    subgroups: [
      { name: "Wet", startIndex: 0, count: 2 },
      { name: "Dry", startIndex: 2, count: 1 },
    ],
    flatGroups: [g("WT", [1]), g("mut", [2]), g("WT", [3])],
  };
  eq(buildStatsPanelSets("subgroup", [], [], sd, RENAMES), [
    {
      key: cellKey("", "Wet"),
      name: "Wet",
      groups: [
        { name: "Col-0", values: [1] },
        { name: "mut", values: [2] },
      ],
    },
  ]);
  eq(buildStatsPanelSets("subgroup", [], [], null, RENAMES), []);
});

test("facet × subgroup: one set per testable (facet, band) cell", () => {
  const facets = [
    {
      category: "Day1",
      groups: [],
      subgroups: [
        { name: "Wet", startIndex: 0, count: 1 },
        { name: "Dry", startIndex: 1, count: 2 },
      ],
      flatGroups: [g("WT", [1]), g("WT", [2]), g("mut", [3])],
    },
    { category: "Day2", groups: [], subgroups: null, flatGroups: null },
  ];
  eq(buildStatsPanelSets("facetSubgroup", [], facets, null, RENAMES), [
    {
      key: cellKey("Day1", "Dry"),
      name: "Day1 — Dry",
      groups: [
        { name: "Col-0", values: [2] },
        { name: "mut", values: [3] },
      ],
    },
  ]);
});

suite("buildCompositionTables");

const pieSources = (pairs) =>
  pairs.map(([category, n], colIndex) => ({ colIndex, category, values: Array(n).fill(1) }));
const pg = (name, pairs) => ({ ...g(name, []), sources: pieSources(pairs) });
const COMP = {
  colNames: ["Genotype", "Phenotype", "Day", "Length", "Soil"],
  groupCol: 0,
  facetByCol: -1,
  subgroupByCol: -1,
  colorByCategories: ["short", "tall"],
  facetedData: [],
  subgroupedData: null,
  displayGroups: [],
  renames: RENAMES,
};

test("flat: one table of the displayed groups, labels used as given", () => {
  const out = buildCompositionTables({
    ...COMP,
    displayGroups: [
      pg("Col-0", [
        ["tall", 3],
        ["short", 1],
      ]),
      pg("mut", [["short", 2]]),
    ],
  });
  eq(out.length, 1);
  eq([out[0].facet, out[0].header, out[0].groups], [null, "Genotype", ["Col-0", "mut"]]);
  eq(out[0].categories, ["short", "tall"]);
  eq(out[0].counts, [
    [1, 3],
    [2, 0],
  ]);
});

test("subgroup: one table, groups labelled subgroup.group with renames", () => {
  const out = buildCompositionTables({
    ...COMP,
    subgroupByCol: 4,
    subgroupedData: {
      subgroups: [
        { name: "Wet", startIndex: 0, count: 1 },
        { name: "Dry", startIndex: 1, count: 1 },
      ],
      flatGroups: [pg("WT", [["tall", 1]]), pg("WT", [["short", 2]])],
    },
  });
  eq(out.length, 1);
  eq([out[0].header, out[0].groups], ["Soil.Genotype", ["Wet.Col-0", "Dry.Col-0"]]);
});

test("facet: one table per non-empty facet, groups labelled facet.subgroup.group", () => {
  const out = buildCompositionTables({
    ...COMP,
    facetByCol: 2,
    subgroupByCol: 4,
    facetedData: [
      {
        category: "Day1",
        groups: [pg("WT", [["tall", 1]]), pg("mut", [["short", 1]])],
        subgroups: [{ name: "Wet", startIndex: 0, count: 2 }],
        flatGroups: null,
      },
      { category: "Day2", groups: [], subgroups: null, flatGroups: null },
    ],
  });
  eq(out.length, 1);
  eq(
    [out[0].facet, out[0].header, out[0].groups],
    ["Day1", "Day.Soil.Genotype", ["Day1.Wet.Col-0", "Day1.Wet.mut"]]
  );
});

summary();

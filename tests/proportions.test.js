// Proportions tool — pure helpers and report builders
// (tools/proportions/helpers.ts, reports.ts).

const { suite, test, assert, eq, approx, summary } = require("./harness");
const L = require("./helpers/proportions-loader");

const parse = (csv) => L.parseCountsTable(L.parseRaw(csv));
const COLON = `Genotype,Colonised,Not colonised
A17 (WT),41,7
dmi3-1,3,43
ram1-1,9,41
dmi3-1 + DMI3,37,10
`;
const F2 = `Family,RY,RG,WY,WG
Mendel,315,108,101,32
F2,141,44,52,13
F3,98,37,22,19
`;

suite("parseCountsTable");

test("reads a counts table", () => {
  const r = parse(COLON);
  eq(r.error, null);
  eq(r.table.groups.join("|"), "A17 (WT)|dmi3-1|ram1-1|dmi3-1 + DMI3");
  eq(r.table.categories.join("|"), "Colonised|Not colonised");
  eq(JSON.stringify(r.table.counts), "[[41,7],[3,43],[9,41],[37,10]]");
  eq(r.blankCells, 0);
});

test("blank cells read as 0 and counted", () => {
  const r = parse("G,a,b\nx,3,\ny,,4\n");
  eq(JSON.stringify(r.table.counts), "[[3,0],[0,4]]");
  eq(r.blankCells, 2);
});

test("errors carry the offending cell", () => {
  eq(parse("G,a\nx,1\ny,2\n").error.kind, "tooFewColumns");
  eq(parse("G,a,b\nx,1,2\n").error.kind, "tooFewRows");
  const pct = parse("G,a,b\nx,41.5,7\ny,1,2\n").error;
  eq(pct.kind, "notCount");
  eq(pct.group, "x");
  eq(pct.category, "a");
  eq(pct.value, "41.5");
  eq(parse("G,a,b\nx,-1,7\ny,1,2\n").error.kind, "notCount");
  eq(parse("G,a,b\nx,abc,7\ny,1,2\n").error.kind, "notCount");
  const dup = parse("G,a,b\nx,1,7\nx,1,2\n").error;
  eq(dup.kind, "duplicateGroup");
  eq(dup.group, "x");
});

suite("one row per observation");

const rawOf = (csv) => L.parseRaw(csv);

test("rows are tallied per group × outcome, in order of first appearance", () => {
  const raw = rawOf(
    "Plant,Genotype,Status\n1,WT,yes\n2,WT,no\n3,mut,no\n4,WT,yes\n5,mut,no\n6,mut,yes\n"
  );
  const r = L.countLongTable(raw, { group: 1, category: 2, count: null });
  eq(r.table.groups.join(), "WT,mut");
  eq(r.table.categories.join(), "yes,no");
  eq(JSON.stringify(r.table.counts), "[[2,1],[1,2]]");
  eq(r.skipped, 0);
});

test("a count column is summed; bad rows are left out and counted, blank lines ignored", () => {
  const raw = rawOf(
    "Genotype,Status,n\nWT,yes,41\nWT,no,7\nmut,yes,3\nmut,no,40\nmut,no,3\n,no,5\nWT,,2\nWT,yes,2.5\nWT,yes,-1\n\n"
  );
  const r = L.countLongTable(raw, { group: 0, category: 1, count: 2 });
  eq(JSON.stringify(r.table.counts), "[[41,7],[3,43]]");
  eq(r.skipped, 4, "blank group, blank outcome, 2.5 and −1");
});

test("tallying the rows of a counts table gives the same table back", () => {
  const t = parse(COLON).table;
  const lines = ["id,group,outcome"];
  let id = 0;
  t.groups.forEach((g, i) =>
    t.categories.forEach((c, j) => {
      for (let k = 0; k < t.counts[i][j]; k++) lines.push(`${++id},${g},${c}`);
    })
  );
  const r = L.countLongTable(rawOf(lines.join("\n")), { group: 1, category: 2, count: null });
  eq(JSON.stringify(r.table), JSON.stringify(t));
});

test("guessLongRoles: ID column skipped, outcome = last text column, count column by header", () => {
  const plants = rawOf(
    "Plant,Genotype,Replicate,Status\n1,WT,1,yes\n2,WT,2,no\n3,mut,1,no\n4,mut,2,yes\n5,WT,1,yes\n6,mut,2,no\n"
  );
  eq(JSON.stringify(L.guessLongRoles(plants)), '{"group":1,"category":3,"count":null}');
  const tidy = rawOf("Genotype,Status,n\nWT,yes,41\nWT,no,7\nmut,yes,3\nmut,no,43\n");
  eq(JSON.stringify(L.guessLongRoles(tidy)), '{"group":0,"category":1,"count":2}');
  // A count-like header with non-count values is not a count column.
  const pct = rawOf("Genotype,Status,n\nWT,yes,4.5\nWT,no,7\nmut,yes,3\nmut,no,43\n");
  eq(L.guessLongRoles(pct).count, null);
  // Two text columns: the later one is taken as the outcome (Configure can swap
  // them); a column with a distinct value per row is neither.
  const swapped = rawOf("Status,Genotype,Weight\nyes,WT,1.2\nno,WT,1.4\nno,mut,0.9\nyes,mut,1.1\n");
  eq(JSON.stringify(L.guessLongRoles(swapped)), '{"group":0,"category":1,"count":null}');
  // Nothing repeats: fall back to the first two columns.
  eq(
    JSON.stringify(L.guessLongRoles(rawOf("a,b\n1,2\n3,4\n"))),
    '{"group":0,"category":1,"count":null}'
  );
});

test("canReadLong: two columns and a non-blank row", () => {
  eq(L.canReadLong(rawOf("Genotype,Status\nWT,yes\n")), true);
  eq(L.canReadLong(rawOf("Genotype\nWT\nmut\n")), false);
  eq(L.canReadLong({ headers: ["a", "b"], rows: [["", " "]] }), false);
});

suite("applySelection / collapseToFocus");

test("order and inclusion follow the order lists; empty groups dropped", () => {
  const t = parse("G,a,b,c\nx,1,0,2\ny,0,5,0\nz,3,4,5\n").table;
  const groups = [
    { name: "z", include: true },
    { name: "y", include: true },
    { name: "x", include: false },
  ];
  const cats = [
    { name: "c", include: true },
    { name: "a", include: true },
    { name: "b", include: false },
  ];
  const s = L.applySelection(t, groups, cats);
  eq(s.table.groups.join("|"), "z");
  eq(s.table.categories.join("|"), "c|a");
  eq(JSON.stringify(s.table.counts), "[[5,3]]");
  eq(s.droppedGroups.join("|"), "y");
});

test("focus vs. rest; with two categories the other keeps its name", () => {
  const t = parse(F2).table;
  const c = L.collapseToFocus(t, 2, "Other");
  eq(c.categories.join("|"), "WY|Other");
  eq(JSON.stringify(c.counts), "[[101,455],[52,198],[22,154]]");
  const two = L.collapseToFocus(parse(COLON).table, 1, "Other");
  eq(two.categories.join("|"), "Not colonised|Colonised");
  eq(JSON.stringify(two.counts[0]), "[7,41]");
});

suite("groupSummaries");

test("n, proportions and Wilson CIs per category", () => {
  const s = L.groupSummaries(parse(COLON).table);
  eq(s[0].n, 48);
  approx(s[0].props[0].p, 41 / 48, 1e-15);
  approx(s[0].props[0].lower, 0.728328234752537, 1e-13);
  approx(s[0].props[0].upper, 0.927517506733963, 1e-13);
});

suite("analyseTable");

test("4×2 colonisation: χ² chosen, pairwise Holm, CLD", () => {
  const a = L.analyseTable(parse(COLON).table, "auto", "holm");
  eq(a.error, null);
  eq(a.test, "chi2");
  eq(a.selection.reason, "cochranOk");
  approx(a.p, 2.32217354512001e-20, 1e-30);
  eq(a.pairs.length, 6);
  // WT ≈ complemented; both mutants differ from them but not from each other
  eq(a.cld.join("|"), "a|b|b|a");
});

test("override forces Fisher; 2×2 gets an odds ratio", () => {
  const t = {
    groups: ["a", "b"],
    categories: ["y", "n"],
    counts: [
      [10, 3],
      [2, 15],
    ],
  };
  const a = L.analyseTable(t, "auto", "holm");
  eq(a.test, "fisher");
  eq(a.selection.reason, "twoByTwo");
  approx(a.p, 0.000536724119143437, 1e-15);
  eq(a.pairs.length, 0);
  eq(a.cld.join(""), "");
  eq(L.analyseTable(t, "chi2", "holm").test, "chi2");
});

suite("proportionsSummaryText");

// Stub translator: the key, then its variables — pins which lines are built
// and with what, independent of the catalog wording.
const trStub = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const SUMMARY_VIS = {
  showSummary: true,
  chartType: "proportion",
  showCI: true,
  adjustMethod: "holm",
};

test("all pairs: test, comparisons, correction, Wilson CI", () => {
  const a = L.analyseTable(parse(COLON).table, "auto", "holm");
  eq(
    L.proportionsSummaryText(a, SUMMARY_VIS, trStub),
    [
      'proportions.summary.test{"test":"proportions.summary.chi2"}',
      "proportions.summary.pairsAll",
      "proportions.summary.holm",
      "proportions.summary.ci",
    ].join("\n")
  );
});

test("each group vs a control names the control; BH; no CI line off the proportion chart", () => {
  const t = parse(COLON).table;
  const a = L.analyseTable(t, "auto", "bh", t.groups[2]);
  eq(a.control, 2);
  const vis = { ...SUMMARY_VIS, adjustMethod: "bh", chartType: "stacked" };
  eq(
    L.proportionsSummaryText(a, vis, trStub),
    [
      'proportions.summary.test{"test":"proportions.summary.chi2"}',
      `proportions.summary.pairsControl{"group":"${t.groups[2]}"}`,
      "proportions.summary.bh",
    ].join("\n")
  );
  eq(
    L.proportionsSummaryText(a, { ...SUMMARY_VIS, showCI: false }, trStub).split("\n").length,
    3,
    "CI hidden → no error-bar line"
  );
});

test("two groups: test only (no pairwise step); hidden or untestable → null", () => {
  const t = {
    groups: ["a", "b"],
    categories: ["y", "n"],
    counts: [
      [10, 3],
      [2, 15],
    ],
  };
  const a = L.analyseTable(t, "auto", "holm");
  eq(
    L.proportionsSummaryText(a, SUMMARY_VIS, trStub),
    'proportions.summary.test{"test":"proportions.summary.fisher"}\nproportions.summary.ci'
  );
  eq(L.proportionsSummaryText(a, { ...SUMMARY_VIS, showSummary: false }, trStub), null);
  const tiny = L.analyseTable(
    { groups: ["a"], categories: ["y", "n"], counts: [[1, 2]] },
    "auto",
    "holm"
  );
  eq(tiny.error, "tooSmall");
  eq(L.proportionsSummaryText(tiny, SUMMARY_VIS, trStub), null);
});

test("all-zero categories are dropped before testing", () => {
  const t = {
    groups: ["a", "b"],
    categories: ["y", "n", "z"],
    counts: [
      [10, 3, 0],
      [2, 15, 0],
    ],
  };
  const a = L.analyseTable(t, "auto", "holm");
  eq(a.table.categories.join("|"), "y|n");
  eq(a.test, "fisher");
});

test("fewer than 2 informative categories → tooSmall", () => {
  const t = {
    groups: ["a", "b"],
    categories: ["y", "n"],
    counts: [
      [10, 0],
      [2, 0],
    ],
  };
  const a = L.analyseTable(t, "auto", "holm");
  eq(a.error, "tooSmall");
  eq(L.bracketPairs(a, true).length, 0);
});

test("control group: k − 1 Fisher tests vs the control, Holm over k − 1, no letters", () => {
  const t = parse(COLON).table;
  const a = L.analyseTable(t, "auto", "holm", "ram1-1");
  eq(a.control, 2);
  eq(a.pairs.map((p) => `${p.i}-${p.j}`).join(","), "0-2,1-2,2-3");
  // R: p.adjust(c(fisher(ram1 vs A17), fisher(ram1 vs dmi3), fisher(ram1 vs comp)), "holm")
  approx(a.pairs[0].pAdj, 2.388511e-11, 1e-16);
  approx(a.pairs[1].pAdj, 1.245414e-1, 1e-6);
  approx(a.pairs[2].pAdj, 2.875004e-9, 1e-14);
  eq(a.cld.join(""), "");
  // The omnibus test is unchanged by the comparison design.
  approx(a.p, L.analyseTable(t, "auto", "holm").p, 0);
});

test("control not among the analysed groups, or only two groups → all pairs", () => {
  const t = parse(COLON).table;
  const gone = L.analyseTable(t, "auto", "holm", "dropped");
  eq(gone.control, null);
  eq(gone.pairs.length, 6);
  eq(gone.cld.join("|"), "a|b|b|a");
  const two = {
    groups: ["a", "b"],
    categories: ["y", "n"],
    counts: [
      [10, 3],
      [2, 15],
    ],
  };
  const a2 = L.analyseTable(two, "auto", "holm", "a");
  eq(a2.control, null);
  eq(a2.pairs.length, 0);
});

suite("bracketPairs");

test("two groups: the omnibus test is the single bracket", () => {
  const t = {
    groups: ["a", "b"],
    categories: ["y", "n"],
    counts: [
      [10, 3],
      [2, 15],
    ],
  };
  const b = L.bracketPairs(L.analyseTable(t, "auto", "holm"), false);
  eq(JSON.stringify(b), '[{"i":0,"j":1,"label":"***"}]');
  const ns = {
    groups: ["a", "b"],
    categories: ["y", "n"],
    counts: [
      [5, 5],
      [6, 4],
    ],
  };
  eq(L.bracketPairs(L.analyseTable(ns, "auto", "holm"), false).length, 0);
  eq(L.bracketPairs(L.analyseTable(ns, "auto", "holm"), true)[0].label, "ns");
});

test("k ≥ 3: significant adjusted pairs only, unless showNs", () => {
  const a = L.analyseTable(parse(COLON).table, "auto", "holm");
  const sig = L.bracketPairs(a, false);
  eq(sig.map((b) => `${b.i}-${b.j}:${b.label}`).join(","), "0-1:****,0-2:****,1-3:****,2-3:****");
  eq(L.bracketPairs(a, true).length, 6);
});

test("control: brackets only from the control", () => {
  const a = L.analyseTable(parse(COLON).table, "auto", "holm", "A17 (WT)");
  eq(
    L.bracketPairs(a, true)
      .map((b) => `${b.i}-${b.j}:${b.label}`)
      .join(","),
    "0-1:****,0-2:****,0-3:ns"
  );
});

suite("parseRatio / gofPerGroup");

test("parses separators, rejects bad input", () => {
  eq(JSON.stringify(L.parseRatio("9:3:3:1", 4)), "[9,3,3,1]");
  eq(JSON.stringify(L.parseRatio(" 3 / 1 ", 2)), "[3,1]");
  eq(JSON.stringify(L.parseRatio("1, 2, 1", 3)), "[1,2,1]");
  eq(L.parseRatio("3:1", 3), null);
  eq(L.parseRatio("3:0", 2), null);
  eq(L.parseRatio("3:x", 2), null);
  eq(L.parseRatio("", 2), null);
  for (const p of L.RATIO_PRESETS) assert(L.parseRatio(p.ratio, p.k), p.ratio);
});

test("per-group GOF with Holm across groups", () => {
  const g = L.gofPerGroup(parse(F2).table, [9, 3, 3, 1]);
  eq(g.map((r) => r.result.method).join(","), "chi2,chi2,exact");
  eq(g[0].result.fallback, true);
  approx(g[0].result.p, 0.925425895103616, 1e-13);
  approx(g[2].result.p, 0.0208630959252767, 1e-13);
  // R: p.adjust(c(0.9254259, 0.7581253, 0.0208631), "holm")
  approx(g[2].pAdj, 0.0625892877758, 1e-12);
  eq(g[0].pAdj, 1);
});

suite("chart geometry");

test("stackSegments cumulates from the first category", () => {
  const s = L.stackSegments([1, 3, 0, 4]);
  eq(JSON.stringify(s.map((x) => [x.y0, x.y1])), "[[0,0.125],[0.125,0.5],[0.5,0.5],[0.5,1]]");
  eq(JSON.stringify(L.stackSegments([0, 0]).map((x) => x.y1)), "[0,0]");
});

test("mosaicSpans: widths ∝ totals, gaps between", () => {
  const sp = L.mosaicSpans([10, 30], 106, 6);
  eq(JSON.stringify(sp), "[[0,25],[31,106]]");
});

test("nLabelAngle: shallowest collision-free tilt for the n labels", () => {
  const w = [40, 40];
  eq(L.nLabelAngle(w, [0, 100], 13), 0, "room to spare → horizontal");
  eq(L.nLabelAngle(w, [0, 44], 13), 0, "exactly w + pad apart → still horizontal");
  eq(L.nLabelAngle(w, [0, 40], 13), -30, "−30° clears horizontally (34.6 + 4 ≤ 40)");
  eq(L.nLabelAngle(w, [0, 20], 13), -45, "−45° lines 14.1 apart ≥ 13");
  eq(L.nLabelAngle(w, [0, 10], 13), -90, "vertical: 4 px pad ≤ 10");
  eq(L.nLabelAngle(w, [0, 3], 13), -90, "nothing fits → vertical fallback");
  eq(L.nLabelAngle([40, 40, 40], [0, 100, 120], 13), -45, "one tight mosaic pair tilts all");
  eq(L.nLabelAngle([500], [10], 13), 0, "single group never tilts");
  eq(L.nLabelAngle([], [], 13), 0);
});

test("pieSlices: clockwise angles from 12 o'clock, first category first", () => {
  const s = L.pieSlices([1, 3, 0, 4]);
  const q = Math.PI / 4;
  eq(
    JSON.stringify(s.map((x) => [x.category, x.count, x.frac])),
    "[[0,1,0.125],[1,3,0.375],[2,0,0],[3,4,0.5]]"
  );
  approx(s[0].a0, 0, 1e-15);
  approx(s[0].a1, q, 1e-15);
  approx(s[1].a1, 4 * q, 1e-15);
  eq(s[2].a0, s[2].a1, "empty category: zero-width slice");
  approx(s[3].a1, 2 * Math.PI, 1e-15);
  eq(L.pieSlices([0, 0]).length, 0, "empty group: no slices");
});

test("piesInOneRow: marks only when the pies fit one row", () => {
  eq(L.piesInOneRow(4, 4), true);
  eq(L.piesInOneRow(4, 9), true);
  eq(L.piesInOneRow(4, 3), false);
  eq(L.piesInOneRow(1, 0), true);
});

test("pieGrid: columns clamped to 1…k, rows to fit, radius from the cell width", () => {
  const gap = L.PIE_GAP;
  eq(
    JSON.stringify(L.pieGrid(5, 3, 480)),
    JSON.stringify({ cols: 3, rows: 2, cellW: 160, r: (160 - gap) / 2 })
  );
  eq(L.pieGrid(4, 10, 400).cols, 4, "no more columns than groups");
  eq(L.pieGrid(4, 10, 400).rows, 1);
  eq(L.pieGrid(4, 0, 400).cols, 1, "at least one per row");
  eq(L.pieGrid(4, 0, 400).rows, 4);
  eq(L.pieGrid(7, 2.6, 300).cols, 3, "rounded");
  eq(L.pieGrid(2, 1, 10).r, 2.5, "cell narrower than the gap: a quarter of the cell");
});

test("resolveColors: palette by position, overrides by name", () => {
  const pal = ["#aa0000", "#00aa00"];
  eq(L.resolveColors(["a", "b", "c"], pal, {}).join(","), "#aa0000,#00aa00,#aa0000");
  eq(L.resolveColors(["a", "b"], pal, { b: "#123456", z: "#ffffff" }).join(","), "#aa0000,#123456");
  eq(L.resolveColors([], pal, {}).length, 0);
});

test("formatPct", () => {
  eq(L.formatPct(0.8541666), "85.4 %");
  eq(L.formatPct(NaN), "—");
});

suite("reports");

test("CSV is long format with Wilson bounds", () => {
  const t = parse(COLON).table;
  const { headers, rows } = L.buildProportionsCsv(L.groupSummaries(t), t.categories);
  eq(headers.join(","), "group,category,count,n,proportion,wilson_lower,wilson_upper");
  eq(rows.length, 8);
  eq(rows[1].slice(0, 4).join("|"), "A17 (WT)|Not colonised|7|48");
});

test("text report names the test, effect size and pairwise method", () => {
  const t = parse(COLON).table;
  const a = L.analyseTable(t, "auto", "bh");
  const txt = L.buildProportionsReport({
    fileName: "x.csv",
    chartType: "stacked",
    focusLabel: null,
    analysis: a,
    summaries: L.groupSummaries(t),
    displayedCategories: t.categories,
    adjust: "bh",
    ratio: [3, 1],
    generatedAt: "T",
  });
  assert(txt.includes("Pearson χ² test of independence: χ²(3) = 94.5366, p = 2.3e-20"), txt);
  assert(txt.includes("Cramér's V = 0.7035"));
  assert(txt.includes("Pairwise Fisher's exact tests (Benjamini–Hochberg adjusted)"));
  assert(txt.includes("A17 (WT): exact, p = 0.1316"));
  assert(txt.includes("doi:10.1214/ss/1009213286"));
});

test("control: report and R script compare each group with the control only", () => {
  const t = parse(COLON).table;
  const a = L.analyseTable(t, "auto", "holm", "ram1-1");
  const txt = L.buildProportionsReport({
    fileName: "x.csv",
    chartType: "stacked",
    focusLabel: null,
    analysis: a,
    summaries: L.groupSummaries(t),
    displayedCategories: t.categories,
    adjust: "holm",
    ratio: null,
    generatedAt: "T",
  });
  assert(
    txt.includes("Fisher's exact tests vs. control ram1-1 (Holm adjusted over 3 comparisons)"),
    txt
  );
  assert(txt.includes("  A17 (WT) vs ram1-1: p = "), txt);
  assert(txt.includes("  dmi3-1 + DMI3 vs ram1-1: p = "), txt);
  assert(!txt.includes("A17 (WT) vs dmi3-1"), "no other pairs");
  const r = L.buildProportionsRScript({
    analysis: a,
    displayed: t,
    chartType: "stacked",
    adjust: "holm",
    ratio: null,
    colors: ["#E69F00", "#56B4E9"],
    groupColors: [],
    outlineWidth: 1,
    xLabelAngle: 0,
    plotTitle: "",
    generatedAt: "T",
  });
  assert(r.includes('control <- "ram1-1"'));
  assert(r.includes("others <- setdiff(rownames(counts), control)"));
  assert(r.includes('p.adjust(p_raw, method = "holm")'));
  assert(!r.includes("combn"), "no all-pairs block");
});

test("R script: sanitised names, chosen test, pairwise + GOF blocks", () => {
  const t = {
    groups: ['evil"); system("x', "b"],
    categories: ["y", "n"],
    counts: [
      [10, 3],
      [2, 15],
    ],
  };
  const a = L.analyseTable(t, "auto", "holm");
  const r = L.buildProportionsRScript({
    analysis: a,
    displayed: t,
    chartType: "proportion",
    adjust: "holm",
    ratio: [3, 1],
    colors: [],
    groupColors: ["#111111", "#222222"],
    outlineWidth: 2.13,
    xLabelAngle: -45,
    plotTitle: "",
    generatedAt: "T",
  });
  assert(r.includes('"evil\\"); system(\\"x"'), "group name escaped");
  assert(r.includes("\nfisher_exact(counts)\n"), "omnibus through the workspace-safe helper");
  assert(r.includes("fisher_exact <- function(tab) {"));
  assert(r.includes("# DIFFERENCE WITH PLÖTTR: on larger tables R's fisher.test() can stop with"));
  assert(r.includes("ratio <- c(3, 1)"));
  assert(r.includes('p_holm = p.adjust(gof[, "p"], "holm")'));
  assert(!r.includes("combn"), "no pairwise block for two groups");
  assert(r.includes('group_pal <- c("#111111", "#222222")'), "per-group bar colours");
  assert(r.includes("scale_fill_manual(values = group_pal)"));
  assert(
    r.includes('geom_col(colour = "black", linewidth = 1, width = 0.6'),
    "outline → linewidth"
  );
  assert(
    r.includes("theme(axis.text.x = element_text(angle = 45, hjust = 1, vjust = 1))"),
    "tilted labels"
  );
  const big = parse(COLON).table;
  const r2 = L.buildProportionsRScript({
    analysis: L.analyseTable(big, "auto", "bh"),
    displayed: big,
    chartType: "mosaic",
    adjust: "bh",
    ratio: null,
    colors: ["#E69F00", "#56B4E9"],
    groupColors: [],
    outlineWidth: 0,
    xLabelAngle: 0,
    plotTitle: "T",
    generatedAt: "T",
  });
  assert(r2.includes("chisq.test(counts, correct = FALSE)"));
  assert(r2.includes('p.adjust(p_raw, method = "BH")'));
  assert(r2.includes("geom_rect"));
  assert(r2.includes('            colour = "white") +'), "no outline → white separators");
  assert(!r2.includes("ratio <-"));
  assert(!r2.includes("axis.text.x"), "no tilt at 0°");
  const r3 = L.buildProportionsRScript({
    analysis: L.analyseTable(big, "auto", "holm"),
    displayed: big,
    chartType: "pie",
    adjust: "holm",
    ratio: null,
    colors: ["#E69F00", "#56B4E9"],
    groupColors: [],
    outlineWidth: 0,
    xLabelAngle: -45,
    piesPerRow: 99,
    plotTitle: "",
    generatedAt: "T",
  });
  assert(r3.includes('coord_polar(theta = "y", start = 0, direction = 1)'), "pies");
  assert(r3.includes(`facet_wrap(~ group, ncol = ${big.groups.length})`), "ncol clamped to k");
  assert(
    r3.includes('geom_col(position = position_stack(reverse = TRUE), colour = "white", width = 1)')
  );
  assert(r3.includes("theme_void()"));
  assert(!r3.includes("axis.text.x"), "no label tilt on pies");
});

test("effectiveAnnotation: letters fall back to brackets with < 3 groups or a control", () => {
  eq(L.effectiveAnnotation("cld", 3, null), "cld");
  eq(L.effectiveAnnotation("cld", 2, null), "brackets");
  eq(L.effectiveAnnotation("cld", 4, 0), "brackets");
  eq(L.effectiveAnnotation("brackets", 2, null), "brackets");
  eq(L.effectiveAnnotation("none", 4, 0), "none");
});

test("R script: pies on one row carry the brackets / letters", () => {
  const t = {
    groups: ["WT", "m1", "m2", "m3"],
    categories: ["A", "B", "C"],
    counts: [
      [20, 2, 2],
      [4, 15, 5],
      [5, 14, 0],
      [20, 0, 0],
    ],
  };
  const an = L.analyseTable(t, "auto", "holm");
  const base = {
    analysis: an,
    displayed: t,
    chartType: "pie",
    adjust: "holm",
    ratio: null,
    colors: ["#E69F00", "#56B4E9", "#009E73"],
    groupColors: [],
    outlineWidth: 0,
    xLabelAngle: 0,
    plotTitle: "",
    generatedAt: "T",
  };
  const brackets = [
    { i: 0, j: 1, label: "****" },
    { i: 2, j: 3, label: "**" },
    { i: 0, j: 2, label: "*" },
  ];
  const rb = L.buildProportionsRScript({
    ...base,
    piesPerRow: 4,
    annotation: "brackets",
    brackets,
  });
  assert(!rb.includes("coord_polar"), "polygons, not facets");
  assert(rb.includes('geom_polygon(colour = "white")'));
  assert(rb.includes('coord_equal(clip = "off") + theme_void()'));
  assert(rb.includes("whole <- counts[i, s] == n[[i]]"), "full disc has no seam");
  assert(rb.includes("  from = c(1, 3, 1),"), rb);
  assert(rb.includes("  to = c(2, 4, 3),"));
  assert(rb.includes("  level = c(0, 0, 1),"));
  assert(rb.includes('  label = c("****", "**", "*")'));
  assert(!rb.includes("cld <-"));

  eq(an.cld.join(","), "a,b,b,a");
  const rc = L.buildProportionsRScript({ ...base, piesPerRow: 4, annotation: "cld", brackets });
  assert(rc.includes('cld <- c("a", "b", "b", "a")'), rc);
  assert(rc.includes("label = cld"));
  assert(!rc.includes("brackets <- data.frame"));

  // Two rows, marks off, or nothing to draw → plain facets, no marks.
  for (const extra of [
    { piesPerRow: 3, annotation: "brackets", brackets },
    { piesPerRow: 4, annotation: "none", brackets },
    { piesPerRow: 4, annotation: "brackets", brackets: [] },
    { piesPerRow: 4 },
  ]) {
    const r = L.buildProportionsRScript({ ...base, ...extra });
    assert(r.includes("facet_wrap(~ group"), JSON.stringify(extra));
    assert(!r.includes("brackets <-") && !r.includes("cld <-"), JSON.stringify(extra));
  }
});

test("R script: Fisher calls survive R's workspace limit and flag the differences", () => {
  const mk = (counts) => ({
    groups: counts.map((_, i) => "g" + i),
    categories: counts[0].map((_, j) => "c" + j),
    counts,
  });
  const args = (t, an) => ({
    analysis: an,
    displayed: t,
    chartType: "stacked",
    adjust: "holm",
    ratio: null,
    colors: [],
    groupColors: [],
    outlineWidth: 0,
    xLabelAngle: 0,
    piesPerRow: 4,
    plotTitle: "",
    generatedAt: "T",
  });
  // Exact in the app; R's default workspace (2e5) fails on this table.
  const t = mk([
    [40, 5, 5],
    [10, 30, 10],
    [12, 28, 0],
    [50, 0, 0],
  ]);
  const an = L.analyseTable(t, "fisher", "holm");
  eq(an.fisher.method, "exact");
  const r = L.buildProportionsRScript(args(t, an));
  assert(r.includes("  for (ws in c(2e5, 2e6, 2e7, 1e8)) {"), "retries with more workspace");
  assert(
    r.includes("  res <- fisher.test(tab, simulate.p.value = TRUE, B = 20000)"),
    "last resort"
  );
  assert(r.includes("which may differ slightly from the app's exact p"), "says so when it happens");
  assert(r.includes("\nfisher_exact(counts)\n"));
  eq(r.split("if (ncol(sub) < 2) 1 else fisher_exact(sub)$p.value").length, 2, "pairs via helper");
  assert(!/fisher\.test\((counts|sub)\)/.test(r), "no bare fisher.test call left");
  // Too large for the app's enumeration: Monte-Carlo in both, flagged.
  const h = mk([
    [140, 25, 15, 3],
    [60, 130, 40, 2],
    [52, 98, 0, 7],
    [150, 3, 30, 0],
    [80, 80, 80, 1],
  ]);
  const ah = L.analyseTable(h, "fisher", "holm");
  eq(ah.fisher.method, "monteCarlo");
  const rh = L.buildProportionsRScript(args(h, ah));
  assert(rh.includes("fisher.test(counts, simulate.p.value = TRUE, B = 20000)"));
  assert(rh.includes("# DIFFERENCE WITH PLÖTTR: R draws its own random tables, so this p differs"));
  assert(!rh.includes("\nfisher_exact(counts)\n"), "omnibus stays simulated");
  assert(rh.includes("fisher_exact <- function(tab) {"), "helper still there for the pairs");
  // χ² with two groups: no Fisher at all, no helper.
  const c = mk([
    [30, 30, 30],
    [20, 40, 30],
  ]);
  const rc = L.buildProportionsRScript(args(c, L.analyseTable(c, "chi2", "holm")));
  assert(!rc.includes("fisher_exact"), "no helper when unused");
});

summary();

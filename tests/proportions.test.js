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
    plotTitle: "",
    generatedAt: "T",
  });
  assert(r.includes('"evil\\"); system(\\"x"'), "group name escaped");
  assert(r.includes("fisher.test(counts)"));
  assert(r.includes("ratio <- c(3, 1)"));
  assert(r.includes('p_holm = p.adjust(gof[, "p"], "holm")'));
  assert(!r.includes("combn"), "no pairwise block for two groups");
  assert(r.includes('group_pal <- c("#111111", "#222222")'), "per-group bar colours");
  assert(r.includes("scale_fill_manual(values = group_pal)"));
  assert(
    r.includes('geom_col(colour = "black", linewidth = 1, width = 0.6'),
    "outline → linewidth"
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
    plotTitle: "T",
    generatedAt: "T",
  });
  assert(r2.includes("chisq.test(counts, correct = FALSE)"));
  assert(r2.includes('p.adjust(p_raw, method = "BH")'));
  assert(r2.includes("geom_rect"));
  assert(r2.includes('            colour = "white") +'), "no outline → white separators");
  assert(!r2.includes("ratio <-"));
});

summary();

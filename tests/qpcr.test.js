// qPCR tool — pure helpers and report builders (tools/qpcr/helpers.ts,
// reports.ts). Reference values: R 4.5 on the same fixture — aggregate()
// for technical-replicate means, ΔCt from log2-weighted Ct with the
// geometric mean of the references, t.test / oneway.test (Welch), qt() for
// the CIs, lm(Ct ~ log10(qty)) for the standard curve.

const { suite, test, assert, eq, summary } = require("./harness");
const L = require("./helpers/qpcr-loader");
const { pStars } = require("./helpers/stats-loader");

function rel(actual, expected, tol, msg) {
  const err = expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);
  if (!(err <= tol)) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${expected}, got ${actual} (rel err ${err})`);
  }
}
const near = (a, b, tol, msg) => {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg ? msg + ": " : ""}expected ${b}, got ${a}`);
};

// 3 groups × 3 biological × 2 technical replicates; one undetermined well.
const FIXTURE = `Sample,Group,Gene,Ct
1,Mock,ACT2,18.10
1,Mock,ACT2,18.30
1,Mock,UBQ10,20.00
1,Mock,UBQ10,20.20
1,Mock,PR1,27.40
1,Mock,PR1,27.60
2,Mock,ACT2,18.60
2,Mock,ACT2,18.40
2,Mock,UBQ10,20.50
2,Mock,UBQ10,20.30
2,Mock,PR1,28.30
2,Mock,PR1,28.10
3,Mock,ACT2,17.90
3,Mock,ACT2,18.00
3,Mock,UBQ10,19.80
3,Mock,UBQ10,19.90
3,Mock,PR1,27.00
3,Mock,PR1,Undetermined
1,SA,ACT2,18.20
1,SA,ACT2,18.40
1,SA,UBQ10,20.10
1,SA,UBQ10,20.30
1,SA,PR1,22.10
1,SA,PR1,22.30
2,SA,ACT2,18.50
2,SA,ACT2,18.70
2,SA,UBQ10,20.40
2,SA,UBQ10,20.60
2,SA,PR1,23.00
2,SA,PR1,22.80
3,SA,ACT2,18.00
3,SA,ACT2,18.20
3,SA,UBQ10,20.00
3,SA,UBQ10,20.20
3,SA,PR1,21.60
3,SA,PR1,21.90
1,JA,ACT2,18.30
1,JA,ACT2,18.40
1,JA,UBQ10,20.20
1,JA,UBQ10,20.30
1,JA,PR1,26.50
1,JA,PR1,26.70
2,JA,ACT2,18.80
2,JA,ACT2,18.70
2,JA,UBQ10,20.70
2,JA,UBQ10,20.60
2,JA,PR1,27.60
2,JA,PR1,27.40
3,JA,ACT2,18.10
3,JA,ACT2,18.00
3,JA,UBQ10,20.00
3,JA,UBQ10,19.90
3,JA,PR1,26.20
3,JA,PR1,26.40
`;

function load(csv = FIXTURE) {
  const raw = L.parseRaw(csv);
  const guess = L.detectLayout(raw.headers, raw.rows);
  return { raw, guess, parsed: L.parseLong(raw.rows, guess.long) };
}
const GROUPS = ["Mock", "SA", "JA"];
const cfgFor = (eff) => ({
  refs: ["ACT2", "UBQ10"],
  targets: ["PR1"],
  eff,
  normalize: "control",
  control: "Mock",
  groupOrder: GROUPS,
});

suite("parsing");

test("long layout detected; wells, genes, groups, undetermined counted", () => {
  const { guess, parsed } = load();
  eq(guess.layout, "long");
  eq(JSON.stringify(guess.long), '{"sample":0,"group":1,"gene":2,"ct":3}');
  eq(parsed.error, null);
  eq(parsed.data.wells.length, 54);
  eq(parsed.data.genes.join(), "ACT2,UBQ10,PR1");
  eq(parsed.data.groups.join(), "Mock,SA,JA");
  eq(parsed.data.missingCt, 1);
});

test("wide layout: one Ct column per gene", () => {
  const raw = L.parseRaw("Plant,Treatment,ACT2,PR1\nA,Mock,18.2,27.5\nB,SA,18.3,22.2\n");
  const guess = L.detectLayout(raw.headers, raw.rows);
  eq(guess.layout, "wide");
  eq(JSON.stringify(guess.wide), '{"sample":0,"group":1,"genes":[2,3]}');
  const p = L.parseWide(raw.headers, raw.rows, guess.wide);
  eq(p.data.wells.length, 4);
  eq(JSON.stringify(p.data.wells[1]), '{"sample":"A","group":"Mock","gene":"PR1","ct":27.5}');
});

test("Ct tokens: undetermined / NA / blank / >40 / dash are missing", () => {
  for (const s of ["Undetermined", "NA", "n/a", "", "-", ">40", "No Ct", "nd"])
    eq(L.parseCt(s), null, s);
  eq(L.parseCt("23.45"), 23.45);
  eq(L.parseCt(" 19 "), 19);
  eq(L.parseCt("0"), null);
});

test("errors: missing role, fewer than two genes, empty", () => {
  eq(
    L.parseLong([["1", "A", "G", "20"]], { sample: 0, group: 1, gene: -1, ct: 3 }).error.role,
    "gene"
  );
  eq(
    L.parseLong([["1", "A", "G", "20"]], { sample: 0, group: 1, gene: 2, ct: 3 }).error.kind,
    "noGenes"
  );
  eq(L.parseLong([], { sample: 0, group: 1, gene: 2, ct: 3 }).error.kind, "empty");
});

suite("technical replicates");

test("mean / SD / n per sample × gene; missing wells excluded; noisy flag", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  eq(samples.length, 9);
  const m3 = samples.find((s) => s.group === "Mock" && s.sample === "3");
  eq(m3.ct.PR1.mean, 27);
  eq(m3.ct.PR1.n, 1);
  eq(m3.ct.PR1.nMissing, 1);
  assert(Number.isNaN(m3.ct.PR1.sd));
  rel(m3.ct.ACT2.mean, 17.95, 1e-14);
  rel(m3.ct.ACT2.sd, Math.sqrt(0.005), 1e-12);
  const wells = load().parsed.data.wells;
  eq(L.noisyTechReps(wells).length, 0);
  // R: sum(aggregate(Ct ~ Group + Sample + Gene, w, sd)$Ct > 0.1, na.rm = TRUE)
  eq(L.noisyTechReps(wells, 0.1).length, 18);
});

test("same sample id in different groups = different biological samples", () => {
  const s = L.aggregateTechReps([
    { sample: "1", group: "A", gene: "G", ct: 20 },
    { sample: "1", group: "B", gene: "G", ct: 22 },
  ]);
  eq(s.length, 2);
});

suite("ΔCt / −ΔΔCt vs R");

const R_E2 = {
  dct: [8.35, 8.75, 8.1, 2.95, 3.35, 2.65, 7.3, 7.8, 7.3],
  ci: {
    Mock: [-0.814479016535155, 0.814479016535155],
    SA: [4.54426617315316, 6.28906716018018],
    JA: [0.216224545041755, 1.65044212162491],
  },
  vs: {
    SA: [5.41666666666667, 4.64508126698624, 6.18825206634709],
    JA: [0.933333333333334, 0.228628149498305, 1.63803851716836],
  },
  welch: [186.306257577715, 0.000118438698979675],
  M: 0.0333333333333334,
};
const R_PFAFFL = {
  dct: [
    6.50309878770512, 6.85462396815169, 6.287327755546, 1.49641039850954, 1.8479355789561,
    1.22677583720558, 5.52136210473312, 5.95919569804333, 5.54023669170904,
  ],
  ci: {
    Mock: [-0.711314144750752, 0.711314144750752],
    SA: [4.25088804992527, 5.79839774789578],
    JA: [0.259891410043789, 1.48961260123442],
  },
  vs: {
    SA: [5.02464289891053, 4.34453809055476, 5.7047477072663],
    JA: [0.874752005639104, 0.26299509833589, 1.48650891294232],
  },
  welch: [205.81383317013, 9.91632131038673e-5],
  M: 0.032479922271559,
};

for (const [label, eff, R] of [
  ["2^−ΔΔCt (all E = 2)", { ACT2: 2, UBQ10: 2, PR1: 2 }, R_E2],
  ["Pfaffl (E = 1.95 / 2.02 / 1.9)", { ACT2: 1.95, UBQ10: 2.02, PR1: 1.9 }, R_PFAFFL],
]) {
  test(`${label}: per-sample ΔCt, group CIs, Welch CI vs control, Welch ANOVA, geNorm M`, () => {
    const samples = L.aggregateTechReps(load().parsed.data.wells);
    const g = L.computeGene(samples, cfgFor(eff), "PR1");
    eq(g.groups.join(), "Mock,SA,JA");
    eq(g.dropped.length, 0);
    const byKey = new Map(g.rows.map((r) => [r.group + r.sample, r]));
    let k = 0;
    for (const grp of GROUPS)
      for (const s of ["1", "2", "3"]) rel(byKey.get(grp + s).dCt, R.dct[k++], 1e-13, grp + s);
    // calibrator: control mean −ΔΔCt is 0 → geometric-mean fold change 1
    near(g.summaries[0].meanL, 0, 1e-12);
    for (const s of g.summaries) {
      near(s.lo, R.ci[s.group][0], 1e-12, s.group + " lo");
      near(s.hi, R.ci[s.group][1], 1e-12, s.group + " hi");
    }
    for (const v of g.vsControl) {
      rel(v.log2fc, R.vs[v.group][0], 1e-12, v.group);
      rel(v.lo, R.vs[v.group][1], 1e-12, v.group + " lo");
      rel(v.hi, R.vs[v.group][2], 1e-12, v.group + " hi");
    }
    const st = L.runGeneStats(g, null);
    eq(st.chosenTest, "welchANOVA");
    rel(st.testResult.F, R.welch[0], 1e-11);
    rel(st.testResult.p, R.welch[1], 1e-9);
    eq(st.postHocName, "gamesHowell");
    rel(L.genormM(samples, ["ACT2", "UBQ10"], eff).ACT2, R.M, 1e-12);
  });
}

test("single reference: ratio equals Pfaffl's E_T^ΔCt_T / E_R^ΔCt_R", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const eff = { ACT2: 1.95, PR1: 1.9 };
  const g = L.computeGene(samples, { ...cfgFor(eff), refs: ["ACT2"] }, "PR1");
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mock = samples.filter((s) => s.group === "Mock");
  const s = samples.find((x) => x.group === "SA" && x.sample === "2");
  const pfaffl =
    Math.pow(1.9, mean(mock.map((m) => m.ct.PR1.mean)) - s.ct.PR1.mean) /
    Math.pow(1.95, mean(mock.map((m) => m.ct.ACT2.mean)) - s.ct.ACT2.mean);
  const ours = Math.pow(2, g.rows.find((r) => r.group === "SA" && r.sample === "2").L);
  rel(ours, pfaffl, 1e-12);
});

test("missing reference or target → sample dropped and listed", () => {
  const wells = load().parsed.data.wells.filter(
    (w) => !(w.group === "JA" && w.sample === "2" && w.gene === "UBQ10")
  );
  const g = L.computeGene(L.aggregateTechReps(wells), cfgFor({}), "PR1");
  eq(JSON.stringify(g.dropped), '[{"sample":"2","group":"JA"}]');
  eq(g.summaries[2].n, 2);
});

test("no control samples → controlMissing, fold changes NaN", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const g = L.computeGene(samples, { ...cfgFor({}), control: "Nope" }, "PR1");
  eq(g.controlMissing, true);
  assert(g.rows.every((r) => Number.isNaN(r.L)));
});

test("no calibrator (reference genes only): L = −ΔCt, CIs keep their width, no vs-control", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const cfg = { ...cfgFor({ ACT2: 2, UBQ10: 2, PR1: 2 }), normalize: "refs", control: "" };
  const g = L.computeGene(samples, cfg, "PR1");
  eq(g.calibrator, 0);
  eq(g.controlMissing, false);
  eq(g.vsControl.length, 0);
  let k = 0;
  for (const grp of GROUPS)
    for (const s of ["1", "2", "3"]) {
      const r = g.rows.find((x) => x.group === grp && x.sample === s);
      rel(r.L, -R_E2.dct[k++], 1e-13, grp + s);
    }
  // Mock mean ΔCt = 8.4 (R); CI half-width unchanged from the calibrated case.
  near(g.summaries[0].meanL, -8.4, 1e-12);
  near(g.summaries[0].lo, -8.4 + R_E2.ci.Mock[0], 1e-12);
  near(g.summaries[0].hi, -8.4 + R_E2.ci.Mock[1], 1e-12);
  const st = L.runGeneStats(g, null);
  rel(st.testResult.F, R_E2.welch[0], 1e-11);
  rel(st.testResult.p, R_E2.welch[1], 1e-9);
});

test("errorBounds: mean ± SD, ± SEM, 95 % CI on the log2 scale; none / n < 2 → null", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const g = L.computeGene(samples, cfgFor({ ACT2: 2, UBQ10: 2, PR1: 2 }), "PR1");
  const mock = g.summaries[0]; // ΔCt 8.35, 8.75, 8.1 → SD = √0.1075
  const sd = Math.sqrt(0.1075);
  const sdB = L.errorBounds(mock, "sd");
  near(sdB.lo, -sd, 1e-12);
  near(sdB.hi, sd, 1e-12);
  const semB = L.errorBounds(mock, "sem");
  near(semB.lo, -sd / Math.sqrt(3), 1e-12);
  near(semB.hi, sd / Math.sqrt(3), 1e-12);
  const ciB = L.errorBounds(mock, "ci95");
  near(ciB.lo, R_E2.ci.Mock[0], 1e-12);
  near(ciB.hi, R_E2.ci.Mock[1], 1e-12);
  eq(L.errorBounds(mock, "none"), null);
  eq(L.errorBounds({ ...mock, n: 1, sdDCt: NaN }, "sem"), null);
});

suite("efficiency & standard curve");

test("parseEfficiency: percent or factor, rejects nonsense", () => {
  eq(L.parseEfficiency("1.95"), 1.95);
  eq(L.parseEfficiency("95 %"), 1.95);
  eq(L.parseEfficiency("95"), 1.95);
  eq(L.parseEfficiency("100%"), 2);
  eq(L.parseEfficiency("2"), 2);
  eq(L.parseEfficiency("1,9"), 1.9);
  eq(L.parseEfficiency("1"), null);
  eq(L.parseEfficiency("250"), null);
  eq(L.parseEfficiency("abc"), null);
  rel(L.efficiencyPercent(1.95), 95, 1e-12);
});

test("standard curve vs lm(Ct ~ log10(qty))", () => {
  const raw = L.parseRaw(
    "Gene,Quantity,Ct\nA,1,17.9\nA,0.1,21.3\nA,0.01,24.7\nA,0.001,28.15\nA,1,18.05\nA,0.1,21.4\nA,0.01,24.9\nA,0.001,28.3\nB,1,20\nB,0.1,21\n"
  );
  const curves = L.standardCurves(L.parseStandardCurve(raw.headers, raw.rows));
  eq(curves.length, 1); // B has only 2 points
  const c = curves[0];
  rel(c.slope, -3.42, 1e-13);
  rel(c.intercept, 17.9575, 1e-13);
  rel(c.r2, 0.999574836290607, 1e-12);
  rel(c.E, 1.96063910687446, 1e-12);
  eq(c.effOutOfRange, false);
  eq(c.lowR2, false);
  const bad = L.standardCurves([
    { gene: "X", quantity: 1, ct: 20 },
    { gene: "X", quantity: 0.1, ct: 22.5 },
    { gene: "X", quantity: 0.01, ct: 25.5 },
  ])[0];
  eq(bad.effOutOfRange, true); // slope −2.75 → E ≈ 131 %
});

suite("statistics wiring");

test("override respected only when valid for k; annotation projection", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const g = L.computeGene(samples, cfgFor({}), "PR1");
  eq(L.runGeneStats(g, "kruskalWallis").chosenTest, "kruskalWallis");
  eq(L.runGeneStats(g, "welchT").chosenTest, "welchANOVA");
  const st = L.runGeneStats(g, null);
  const br = L.geneAnnotation(g, st, "brackets", false);
  assert(br.brackets.length >= 2, "significant pairs");
  assert(br.brackets.every((b) => b.i < 3 && b.j < 3));
  const cld = L.geneAnnotation(g, st, "cld", false);
  eq(cld.cld.length, 3);
  assert(cld.cld[0] !== cld.cld[1], "Mock and SA differ");
  eq(L.geneAnnotation(g, st, "none", true).brackets.length, 0);
});

test("hidden calibrator: its pairs become vs-control stars, other brackets re-indexed", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const g = L.computeGene(samples, cfgFor({}), "PR1");
  const st = L.runGeneStats(g, null);
  const v = L.visibleGene(g, "Mock");
  eq(v.groups.join(), "SA,JA");
  eq(v.summaries.map((s) => s.group).join(), "SA,JA");
  eq(v.rows.length, 6);
  assert(L.visibleGene(g, null) === g && L.visibleGene(g, "Nope") === g);
  // Games-Howell pairs (adjusted p) by group name, straight from the stats.
  const pOf = (a, b) => {
    const pr = st.postHocResult.pairs.find(
      (x) =>
        [g.groups[st.tested[x.i]], g.groups[st.tested[x.j]]].sort().join() === [a, b].sort().join()
    );
    return pr.pAdj != null ? pr.pAdj : pr.p;
  };
  const all = L.geneAnnotation(g, st, "brackets", true, "Mock");
  eq(all.vsControl.join(), [pStars(pOf("Mock", "SA")), pStars(pOf("Mock", "JA"))].join());
  eq(
    JSON.stringify(all.brackets),
    JSON.stringify([{ i: 0, j: 1, label: pStars(pOf("SA", "JA")) }])
  );
  eq(all.cld.join(), ",");
  // Letters can't show vs-control comparisons → same layout as brackets.
  eq(JSON.stringify(L.geneAnnotation(g, st, "cld", true, "Mock")), JSON.stringify(all));
  // showNs off drops non-significant entries from both kinds.
  const sig = L.geneAnnotation(g, st, "brackets", false, "Mock");
  sig.vsControl.forEach((c, i) => eq(c, all.vsControl[i] === "ns" ? "" : all.vsControl[i]));
  eq(L.geneAnnotation(g, st, "none", true, "Mock").vsControl.join(), ",");
  // Two groups: the single test becomes one star above the treated group.
  const two = L.computeGene(samples, { ...cfgFor({}), groupOrder: ["Mock", "SA"] }, "PR1");
  const st2 = L.runGeneStats(two, null);
  const a2 = L.geneAnnotation(two, st2, "brackets", false, "Mock");
  eq(a2.brackets.length, 0);
  eq(a2.vsControl.join(), pStars(st2.testResult.p));
  // No calibrator hidden → previous behaviour, vsControl empty.
  eq(L.geneAnnotation(g, st, "brackets", true).vsControl.join(), ",,");
});

test("ΔCt and −ΔΔCt give identical p-values (shift + sign)", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const g = L.computeGene(samples, cfgFor({}), "PR1");
  const neg = {
    ...g,
    dCtByGroup: g.groups.map((grp) => g.rows.filter((r) => r.group === grp).map((r) => r.L)),
  };
  rel(L.runGeneStats(neg, null).testResult.p, L.runGeneStats(g, null).testResult.p, 1e-9);
});

test("formatResultLine matches Group Plot's format", () => {
  eq(L.formatResultLine("welchT", { t: 2.5, df: 7.123, p: 0.04 }), "t(7.12) = 2.500,  p = 0.0400");
  eq(
    L.formatResultLine("welchANOVA", { F: 12, df1: 2, df2: 5.5, p: 0.01 }),
    "F(2, 5.50) = 12.000,  p = 0.0100"
  );
  eq(L.formatResultLine(null, null), "—");
});

suite("axis bounds, auto-config, exports");

test("parseAxisBound: axis-label units → plotted axis value", () => {
  eq(L.parseAxisBound("0.25", "log2"), -2);
  eq(L.parseAxisBound("64", "log2"), 6);
  eq(L.parseAxisBound("0", "log2"), null, "log2 needs > 0");
  eq(L.parseAxisBound("-1", "log2"), null);
  eq(L.parseAxisBound("-1", "ddct"), -1);
  eq(L.parseAxisBound("2,5", "linear"), 2.5);
  eq(L.parseAxisBound(" ", "linear"), null);
  eq(L.parseAxisBound("abc", "ddct"), null);
});

test("guessRefs / guessControl", () => {
  eq(L.guessRefs(["PR1", "ACT2", "UBQ10", "WRKY33"]).join(), "ACT2,UBQ10");
  eq(L.guessRefs(["GeneA", "GeneB"]).join(), "GeneA");
  eq(L.guessControl(["Drought", "Mock", "Salt"]), "Mock");
  eq(L.guessControl(["B", "C"]), "B");
});

test("report and R script carry method, citations, and ΔCt-based tests", () => {
  const { parsed } = load();
  const samples = L.aggregateTechReps(parsed.data.wells);
  const cfg = cfgFor({ ACT2: 1.95, UBQ10: 2.02, PR1: 1.9 });
  const genes = [L.computeGene(samples, cfg, "PR1")];
  const stats = genes.map((g) => L.runGeneStats(g, null));
  const txt = L.buildQpcrReport({
    fileName: "f.csv",
    cfg,
    genes,
    stats,
    missingCt: 1,
    noisy: [],
    genorm: { ACT2: 0.0325, UBQ10: 0.0325 },
    generatedAt: "T",
  });
  assert(txt.includes("Pfaffl 2001, doi:10.1093/nar/29.9.e45"));
  assert(txt.includes("geometric mean (Vandesompele et al. 2002"));
  assert(txt.includes("Statistical tests were run on ΔCt"));
  assert(txt.includes("Test on ΔCt: Welch's ANOVA"));
  const r = L.buildQpcrRScript({ wells: parsed.data.wells, cfg, genes, stats, generatedAt: "T" });
  assert(r.includes('eff <- c("ACT2" = 1.95, "UBQ10" = 2.02, "PR1" = 1.9)'));
  assert(r.includes("q_ref <- rowMeans(do.call(cbind, lapply(refs, q)))"));
  assert(r.includes("df$value <- df$dct  # tests run on ΔCt"));
  assert(r.includes("print(oneway.test(value ~ group, data = df, var.equal = FALSE))"));
  assert(r.includes("rstatix::games_howell_test(df, value ~ group)"));
  assert(r.includes("NA"), "undetermined well exported as NA");
});

test("CSV rows: per sample Ct, ΔCt, −ΔΔCt, fold change", () => {
  const samples = L.aggregateTechReps(load().parsed.data.wells);
  const g = L.computeGene(samples, cfgFor({}), "PR1");
  const { headers, rows } = L.sampleRowsForCsv([g], "control");
  eq(
    headers.join(),
    "gene,group,sample,ct_target,ct_reference_mean,delta_ct,neg_delta_delta_ct,fold_change"
  );
  eq(rows.length, 9);
  rel(rows[3][7], Math.pow(2, 5.45), 1e-12);
});

test("no calibrator: CSV columns, report and R script describe 2^−ΔCt", () => {
  const { parsed } = load();
  const samples = L.aggregateTechReps(parsed.data.wells);
  const cfg = { ...cfgFor({ ACT2: 2, UBQ10: 2, PR1: 2 }), normalize: "refs", control: "" };
  const genes = [L.computeGene(samples, cfg, "PR1")];
  const stats = genes.map((g) => L.runGeneStats(g, null));
  const { headers, rows } = L.sampleRowsForCsv(genes, "refs");
  eq(
    headers.join(),
    "gene,group,sample,ct_target,ct_reference_mean,delta_ct,neg_delta_ct,relative_expression"
  );
  rel(rows[3][7], Math.pow(2, -2.95), 1e-12);
  const txt = L.buildQpcrReport({
    fileName: "f.csv",
    cfg,
    genes,
    stats,
    missingCt: 1,
    noisy: [],
    genorm: {},
    generatedAt: "T",
  });
  assert(txt.includes("Schmittgen & Livak 2008, doi:10.1038/nprot.2008.73"));
  assert(txt.includes("Calibrator: none (normalised to the reference gene(s) only)."));
  assert(txt.includes("  Mock: n = 3, ΔCt = 8.400 ± 0.328 (SD), 2^−ΔCt = 0.002960 [95 % CI "));
  assert(!txt.includes("fold change vs"));
  const r = L.buildQpcrRScript({ wells: parsed.data.wells, cfg, genes, stats, generatedAt: "T" });
  assert(!r.includes("control <-"));
  assert(!r.includes("calibrator <-"));
  assert(r.includes("df$rel_expr <- 2^-df$dct"));
});

suite("technical replicates — excluding flagged sets");

test("outlierIndex: well farthest from the median, none when ambiguous or < 3", () => {
  eq(L.outlierIndex([23.1, 23.2, 24.5]), 2);
  eq(L.outlierIndex([24.5, 23.1, 23.2]), 0);
  eq(L.outlierIndex([20.0, 21.0, 22.0]), -1); // symmetric: no single outlier
  eq(L.outlierIndex([20.0, 20.9]), -1);
  eq(L.outlierIndex([20.0, 20.1, 20.2, 25.0]), 3); // even n: median 20.15
  eq(L.outlierIndex([20.0, 20.0, 20.0]), -1);
});

// Mock/1 ACT2 triplicate with one aberrant well; SA/2 PR1 duplicate far apart.
function noisyFixture() {
  const csv = FIXTURE.replace(
    "1,Mock,ACT2,18.30\n",
    "1,Mock,ACT2,18.30\n1,Mock,ACT2,19.97\n"
  ).replace("2,SA,PR1,22.80", "2,SA,PR1,24.20");
  return load(csv).parsed.data.wells;
}

test("noisyTechReps lists each flagged set with its Cts, well indices and outlier", () => {
  const wells = noisyFixture();
  const noisy = L.noisyTechReps(wells);
  eq(
    noisy.map((n) => L.techRepKey(n).split("\u0000").join("/")),
    ["Mock/1/ACT2", "SA/2/PR1"]
  );
  const [act, pr] = noisy;
  eq(act.cts, [18.1, 18.3, 19.97]);
  eq(
    act.wellIdx.map((i) => wells[i].ct),
    [18.1, 18.3, 19.97]
  );
  eq(act.outlier, 2);
  // R: sd(c(18.10, 18.30, 19.97))
  rel(act.sd, Math.sqrt(1.0543), 1e-12);
  eq(pr.cts, [23.0, 24.2]);
  eq(pr.outlier, -1); // two wells: no way to tell which one is off
});

test("noisyTechReps ignores undetermined wells and single-value sets", () => {
  const wells = [
    { sample: "1", group: "A", gene: "G", ct: 20 },
    { sample: "1", group: "A", gene: "G", ct: null },
    { sample: "1", group: "A", gene: "H", ct: 20 },
    { sample: "1", group: "A", gene: "H", ct: null },
    { sample: "1", group: "A", gene: "H", ct: 23 },
  ];
  const noisy = L.noisyTechReps(wells);
  eq(noisy.length, 1);
  eq(noisy[0].gene, "H");
  eq(noisy[0].wellIdx, [2, 4]);
});

test("excludedWells / exclusionCounts follow the per-set choice", () => {
  const wells = noisyFixture();
  const noisy = L.noisyTechReps(wells);
  const [act, pr] = noisy;
  const k = (n) => L.techRepKey(n);
  eq([...L.excludedWells(noisy, {})], []);
  eq([...L.excludedWells(noisy, { [k(act)]: "keep" })], []);
  eq([...L.excludedWells(noisy, { [k(act)]: "dropOutlier" })], [act.wellIdx[2]]);
  eq(
    [...L.excludedWells(noisy, { [k(act)]: "dropSet" })].sort((a, b) => a - b),
    act.wellIdx
  );
  // No clear outlier in a duplicate: "dropOutlier" keeps both wells.
  eq([...L.excludedWells(noisy, { [k(pr)]: "dropOutlier" })], []);
  eq(L.exclusionCounts(noisy, { [k(act)]: "dropOutlier", [k(pr)]: "dropSet" }), {
    wells: 1,
    sets: 1,
  });
  eq(L.exclusionCounts(noisy, { [k(pr)]: "dropOutlier" }), { wells: 0, sets: 0 });
});

test("dropping wells changes the analysis: outlier → new mean, set → sample dropped", () => {
  const wells = noisyFixture();
  const noisy = L.noisyTechReps(wells);
  const [act, pr] = noisy;
  const run = (actions) => {
    const out = L.excludedWells(noisy, actions);
    const kept = wells.filter((_, i) => !out.has(i));
    const samples = L.aggregateTechReps(kept);
    return { samples, gene: L.computeGene(samples, cfgFor({}), "PR1") };
  };
  const keep = run({});
  const m1 = (r) => r.samples.find((x) => x.group === "Mock" && x.sample === "1");
  rel(m1(keep).ct.ACT2.mean, (18.1 + 18.3 + 19.97) / 3, 1e-12);
  const outl = run({ [L.techRepKey(act)]: "dropOutlier" });
  rel(m1(outl).ct.ACT2.mean, 18.2, 1e-12);
  eq(m1(outl).ct.ACT2.n, 2);
  // A reference set dropped: the sample has no ACT2 and leaves every target.
  const refSet = run({ [L.techRepKey(act)]: "dropSet" });
  eq(refSet.gene.dropped, [{ sample: "1", group: "Mock" }]);
  eq(refSet.gene.rows.length, 8);
  // A target set dropped: only that target loses the sample.
  const tSet = run({ [L.techRepKey(pr)]: "dropSet" });
  eq(tSet.gene.dropped, [{ sample: "2", group: "SA" }]);
});

test("report names each flagged set's decision; R script notes excluded wells", () => {
  const wells = noisyFixture();
  const noisy = L.noisyTechReps(wells);
  const [act, pr] = noisy;
  const repActions = { [L.techRepKey(act)]: "dropOutlier", [L.techRepKey(pr)]: "keep" };
  const out = L.excludedWells(noisy, repActions);
  const kept = wells.filter((_, i) => !out.has(i));
  const cfg = cfgFor({});
  const genes = [L.computeGene(L.aggregateTechReps(kept), cfg, "PR1")];
  const stats = genes.map((g) => L.runGeneStats(g, null));
  const txt = L.buildQpcrReport({
    fileName: "f.csv",
    cfg,
    genes,
    stats,
    missingCt: 1,
    noisy,
    repActions,
    genorm: {},
    generatedAt: "T",
  });
  assert(txt.includes("Technical replicates with SD > 0.5 cycles: 2"), txt);
  assert(
    txt.includes(
      `  Mock / 1 / ACT2: SD = ${act.sd.toFixed(2)} (Ct 18.10, 18.30, 19.97) — outlier well excluded (Ct 19.97)`
    ),
    txt
  );
  assert(txt.includes(`  SA / 2 / PR1: SD = ${pr.sd.toFixed(2)} (Ct 23.00, 24.20) — kept`), txt);
  const r = L.buildQpcrRScript({
    wells: kept,
    excludedWells: 1,
    cfg,
    genes,
    stats,
    generatedAt: "T",
  });
  assert(r.includes("# 1 well excluded in Plöttr's technical-replicate check is not listed."), r);
  assert(!r.includes("19.97"), "excluded well not in the R data");
  const r0 = L.buildQpcrRScript({ wells, cfg, genes, stats, generatedAt: "T" });
  assert(!r0.includes("technical-replicate check"));
});

suite("qpcr — Excel template");

const en = require("esbuild").buildSync({
  entryPoints: [require("path").join(__dirname, "../tools/qpcr/i18n/en.ts")],
  bundle: true,
  format: "cjs",
  write: false,
}).outputFiles[0].text;
const EN = (() => {
  const m = { exports: {} };
  new Function("module", "exports", en)(m, m.exports);
  return m.exports.default;
})();
const trEn = (k) => {
  if (!(k in EN)) throw new Error(`missing key ${k}`);
  return EN[k];
};

// What Excel puts on the clipboard: tab-separated, CRLF, numbers in the
// user's locale (decimal comma in French Excel).
function asClipboard(rows, decimalComma) {
  return rows
    .map((r) =>
      r
        .map((v) => (typeof v === "number" && decimalComma ? String(v).replace(".", ",") : v))
        .join("\t")
    )
    .join("\r\n");
}

function runPipeline(text) {
  const sep = L.autoDetectSep(text, "");
  const dc = L.fixDecimalCommas(text, sep);
  const raw = L.parseRaw(dc.text, sep);
  const guess = L.detectLayout(raw.headers, raw.rows);
  return { sep, raw, guess, parsed: L.parseLong(raw.rows, guess.long) };
}

for (const decimalComma of [false, true]) {
  test(`example sheet pasted from Excel parses as long layout (decimal ${decimalComma ? "comma" : "point"})`, () => {
    const rows = [L.TEMPLATE_HEADERS, ...L.templateExampleRows()];
    const { sep, guess, parsed } = runPipeline(asClipboard(rows, decimalComma));
    eq(sep, "\t");
    eq(guess.layout, "long");
    eq(guess.long, { sample: 0, group: 1, gene: 2, ct: 3 });
    eq(parsed.error, null);
    eq(parsed.data.wells.length, 36);
    eq(parsed.data.genes, ["ACT2", "RD29A"]);
    eq(parsed.data.groups, ["Control", "Drought"]);
    eq(parsed.data.missingCt, 1);
    // 2 groups × 3 biological samples, technical triplicates averaged.
    const samples = L.aggregateTechReps(parsed.data.wells);
    eq(samples.length, 6);
    const c1 = samples.find((x) => x.group === "Control" && x.sample === "1");
    near(c1.ct.ACT2.mean, 18.52, 1e-9, "Control/1 ACT2 mean");
    near(c1.ct.RD29A.mean, 27.1, 1e-9, "Control/1 RD29A mean");
    const c3 = samples.find((x) => x.group === "Control" && x.sample === "3");
    eq(c3.ct.RD29A.n, 2);
    eq(c3.ct.RD29A.nMissing, 1);
    eq(L.noisyTechReps(samples).length, 0);
  });
}

test("Data sheet holds only the headers the tool auto-detects", () => {
  const [legend, data, example] = L.buildQpcrTemplateSheets(trEn);
  eq(data.rows, [["Sample", "Group", "Gene", "Ct"]]);
  eq(example.rows[0], data.rows[0]);
  eq(L.detectLayout(data.rows[0], []).long, { sample: 0, group: 1, gene: 2, ct: 3 });
  eq([legend.name, data.name, example.name], ["How to fill", "Data", "Example"]);
  // Every column the Data sheet asks for is explained in the legend.
  const legendCols = legend.rows.map((r) => r[0]);
  for (const h of data.rows[0]) assert(legendCols.includes(h), `legend lacks ${h}`);
});

test("legend uses every template string and its styled rows are section headers", () => {
  const used = new Set();
  const [legend] = L.buildQpcrTemplateSheets((k) => {
    used.add(k);
    return trEn(k);
  });
  const tplKeys = Object.keys(EN).filter((k) => k.startsWith("qpcr.tpl."));
  const unusedInSheets = tplKeys.filter((k) => !used.has(k));
  // The upload-step strings live in the UI, not in the workbook.
  eq(unusedInSheets.sort(), ["qpcr.tpl.button", "qpcr.tpl.cta", "qpcr.tpl.filename"]);
  for (const [r, style] of Object.entries(legend.rowStyles)) {
    if (style === "header") eq(legend.rows[r].length, 3, `header row ${r} spans 3 cells`);
  }
  eq(legend.rows[7], ["Column", "What to enter", "Example"]);
});

summary();

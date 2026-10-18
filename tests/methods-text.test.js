// Methods-section paragraph builder (tools/_shell/methods-text.ts): the
// sentences describe exactly what ran (test, exactness, post-hoc, BH across
// sets, sample sizes, display), close with the version + URL + R calls, and
// the R calls are the same one-liners the R-script export uses.

const { suite, test, assert, eq } = require("./harness");
const m = require("./helpers/methods-text-loader");

const TESTS = ["studentT", "welchT", "mannWhitney", "oneWayANOVA", "welchANOVA", "kruskalWallis"];
const POSTHOC = { oneWayANOVA: "tukeyHSD", welchANOVA: "gamesHowell", kruskalWallis: "dunn" };

suite("methods text — single analysis (English)");

test("Welch ANOVA + Games-Howell, default policy, display and software", () => {
  m.setLang("en");
  const text = m.buildGroupMethodsText({
    sets: [{ test: "welchANOVA", postHoc: "gamesHowell", ns: [24, 24, 24] }],
    display: m.methodsDisplay("sem"),
  });
  eq(
    text,
    "The 3 groups (n = 24 per group) were compared with Welch's one-way ANOVA, followed by " +
      "the Games-Howell test for pairwise comparisons. Welch's tests were used by default " +
      "because they do not assume equal variances; normality (Shapiro-Wilk test) and equality " +
      "of variances (median-centred Levene test) were checked as diagnostics only. P < 0.05 " +
      "was considered significant. Data are shown as mean ± SEM. Analyses were performed " +
      "with Plöttr v9.9.9 (https://evompmi.github.io/plottr); equivalent R calls: " +
      "oneway.test(value ~ group, data = df, var.equal = FALSE); " +
      "rstatix::games_howell_test(df, value ~ group)."
  );
});

test("Mann-Whitney states whether p is exact", () => {
  m.setLang("en");
  const exact = m.buildGroupMethodsText({
    sets: [{ test: "mannWhitney", exact: true, postHoc: null, ns: [5, 6] }],
  });
  assert(exact.startsWith("The two groups (n = 5–6 per group) were compared with a two-sided"));
  assert(exact.includes("Mann-Whitney U test (exact p-values)"), exact);
  const approx = m.buildGroupMethodsText({
    sets: [{ test: "mannWhitney", exact: false, postHoc: null, ns: [60, 60] }],
  });
  assert(approx.includes("(normal approximation with continuity correction)"), approx);
});

test("a user override drops the default-policy sentence", () => {
  m.setLang("en");
  const text = m.buildGroupMethodsText({
    sets: [{ test: "welchT", postHoc: null, ns: [8, 8] }],
    overridden: true,
  });
  assert(!text.includes("used by default"), text);
  assert(text.includes("were assessed."), text);
});

test("values note, tool sentences and no display", () => {
  m.setLang("en");
  const text = m.buildGroupMethodsText({
    sets: [{ test: "studentT", postHoc: null, ns: [4, 4] }],
    valueNote: "ΔCt values",
    extra: ["Extra sentence."],
  });
  assert(text.startsWith("The values analysed were ΔCt values. The two groups"), text);
  assert(text.includes("Extra sentence. Analyses were performed"), text);
  assert(!text.includes("Data are shown as"), text);
});

suite("methods text — several analyses");

test("same test everywhere, BH across x values", () => {
  m.setLang("en");
  const sets = ["0", "1", "2"].map((x) => ({
    name: x,
    test: "welchT",
    postHoc: null,
    ns: [3, 4],
  }));
  const text = m.buildGroupMethodsText({
    sets,
    setLabel: "Time (h)",
    setKind: "x",
    adjustAcrossSets: "bh",
  });
  assert(
    text.startsWith(
      "Groups were compared within each value of “Time (h)” (3 analyses) with a two-sided " +
        "Welch's t-test. Group sizes were n = 3–4. P-values were adjusted across the 3 " +
        "analyses with the Benjamini-Hochberg procedure."
    ),
    text
  );
});

test("different tests are listed with the sets they apply to", () => {
  m.setLang("en");
  const text = m.buildGroupMethodsText({
    sets: [
      { name: "WT", test: "welchT", postHoc: null, ns: [5, 5] },
      { name: "abi4", test: "mannWhitney", exact: true, postHoc: null, ns: [5, 5] },
      { name: "oxSOS1", test: "welchT", postHoc: null, ns: [5, 5] },
    ],
    setLabel: "Genotype",
    setKind: "level",
  });
  assert(
    text.includes(
      "Groups were compared within each level of “Genotype”: a two-sided Welch's t-test for " +
        "WT and oxSOS1; a two-sided Mann-Whitney U test (exact p-values) for abi4."
    ),
    text
  );
  assert(text.includes("t.test(value ~ group, data = df, var.equal = FALSE)"), text);
  assert(text.includes("wilcox.test(value ~ group, data = df)"), text);
});

test("sets with fewer than two groups are left out; none left → empty", () => {
  m.setLang("en");
  eq(m.buildGroupMethodsText({ sets: [{ test: "welchT", postHoc: null, ns: [5] }] }), "");
});

suite("methods text — R calls match the R-script export");

test("every test and post-hoc cites the export's one-liner", () => {
  m.setLang("en");
  for (const t of TESTS) {
    const k = POSTHOC[t] ? 3 : 2;
    const text = m.buildGroupMethodsText({
      sets: [{ test: t, exact: true, postHoc: POSTHOC[t] || null, ns: Array(k).fill(6) }],
    });
    assert(text.includes(m.rTestCall(t)), `${t}: ${text}`);
    if (POSTHOC[t]) assert(text.includes(m.rPostHocCall(POSTHOC[t])), `${t} post-hoc`);
  }
});

suite("methods text — French");

test("French sentences, French list punctuation, no unfilled placeholders", () => {
  m.setLang("fr");
  const text = m.buildGroupMethodsText({
    sets: [
      { name: "A", test: "welchT", postHoc: null, ns: [5, 6] },
      { name: "B", test: "mannWhitney", exact: false, postHoc: null, ns: [4, 4] },
    ],
    setLabel: "Génotype",
    setKind: "level",
    display: m.methodsDisplay("box"),
  });
  assert(
    text.startsWith("Les groupes ont été comparés au sein de chaque modalité de « Génotype » :")
  );
  assert(text.includes("pour A ; un test U de Mann-Whitney"), text);
  assert(text.includes("Le seuil de significativité était p < 0,05."), text);
  assert(text.includes(" ; appels R équivalents : "), text);
  m.setLang("en");
});

test("every combination fills its placeholders in both languages", () => {
  for (const lang of ["en", "fr"]) {
    m.setLang(lang);
    for (const t of TESTS) {
      for (const multi of [false, true]) {
        const sets = (multi ? ["a", "b"] : ["a"]).map((name) => ({
          name,
          test: t,
          exact: name === "a",
          postHoc: POSTHOC[t] || null,
          ns: POSTHOC[t] ? [3, 4, 5] : [3, 4],
        }));
        const text = m.buildGroupMethodsText({
          sets,
          setLabel: multi ? "Lot" : undefined,
          adjustAcrossSets: multi ? "bh" : null,
          display: m.methodsDisplay("ci95"),
        });
        assert(text.length > 0 && !/[{}]/.test(text), `${lang} ${t} ${multi}: ${text}`);
      }
    }
  }
  m.setLang("en");
});

suite("methods text — helpers");

test("nRange, joinList, softwareSentence without calls", () => {
  m.setLang("en");
  eq(m.nRange([5, 5, 5]), "n = 5");
  eq(m.nRange([7, 3, 5]), "n = 3–7");
  eq(m.nRange([]), "");
  eq(m.joinList(["a", "b", "c"]), "a, b, and c");
  m.setLang("fr");
  eq(m.joinList(["a", "b", "c"]), "a, b et c");
  m.setLang("en");
  eq(
    m.softwareSentence([]),
    "Analyses were performed with Plöttr v9.9.9 (https://evompmi.github.io/plottr)."
  );
});

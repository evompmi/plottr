// Unit tests for the lineplot pure helpers (tools/lineplot/helpers.ts).
// Covers rounding utilities, SVG path builder, x formatting, and the core
// computeSeries / computePerXStats pipeline that drives the profile plot and
// its per-x significance brackets. The fuzz harness only asserts structural
// invariants (no crashes, finite outputs); these tests pin down the exact
// numeric / grouping behaviour against hand-crafted fixtures.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  buildLineD,
  formatX,
  computeSeries,
  computePerXStats,
  lineDashArray,
  lineplotSummaryText,
  withPower,
} = require("./helpers/lineplot-loader");

// ── buildLineD ──────────────────────────────────────────────────────────────

suite("buildLineD");

test("emits M-then-L coordinates with 2-decimal rounding", () => {
  eq(
    buildLineD([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
      { x: 4, y: 5 },
    ]),
    "M0.00,1.00L2.00,3.00L4.00,5.00"
  );
});

test("skips points whose y is null / missing", () => {
  eq(
    buildLineD([
      { x: 0, y: 1 },
      { x: 1, y: null },
      { x: 2, y: 3 },
    ]),
    "M0.00,1.00L2.00,3.00"
  );
});

test("returns empty string when fewer than 2 valid points", () => {
  eq(buildLineD([]), "");
  eq(buildLineD([{ x: 0, y: 1 }]), "");
  eq(
    buildLineD([
      { x: 0, y: null },
      { x: 1, y: null },
    ]),
    ""
  );
});

// ── formatX ────────────────────────────────────────────────────────────────

suite("formatX");

test("integers render without a decimal tail", () => {
  eq(formatX(0), "0");
  eq(formatX(42), "42");
  eq(formatX(-7), "-7");
});

test("non-integer values round to 4 decimals", () => {
  eq(formatX(1.23456789), "1.2346");
  eq(formatX(0.1), "0.1");
});

test("null / NaN / Infinity fall through to String(x)", () => {
  eq(formatX(null), "null");
  eq(formatX(NaN), "NaN");
  eq(formatX(Infinity), "Infinity");
});

// ── computeSeries ──────────────────────────────────────────────────────────

suite("computeSeries");

test("pools repeat (x, group) pairs into mean + SD + SEM summaries", () => {
  // Two groups, each with two replicates at two x points.
  const data = [
    { x: 1, y: 10 },
    { x: 1, y: 12 },
    { x: 2, y: 20 },
    { x: 2, y: 22 },
    { x: 1, y: 5 },
    { x: 1, y: 7 },
    { x: 2, y: 15 },
    { x: 2, y: 17 },
  ];
  const raw = [
    { g: "A" },
    { g: "A" },
    { g: "A" },
    { g: "A" },
    { g: "B" },
    { g: "B" },
    { g: "B" },
    { g: "B" },
  ];
  const series = computeSeries(data, raw, "x", "y", "g", {}, ["#000", "#111"]);
  eq(series.length, 2);
  // First-seen group order preserved.
  eq(series[0].name, "A");
  eq(series[1].name, "B");
  // Per-x stats: mean of [10,12] = 11, SD = sqrt(2), SEM = SD/sqrt(2) = 1.
  const aAtX1 = series[0].points.find((p) => p.x === 1);
  eq(aAtX1.n, 2);
  approx(aAtX1.mean, 11, 1e-12);
  approx(aAtX1.sd, Math.sqrt(2), 1e-12);
  approx(aAtX1.sem, 1, 1e-12);
});

test("x points are sorted ascending within each group", () => {
  const data = [
    { x: 3, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 3 },
  ];
  const raw = [{ g: "S" }, { g: "S" }, { g: "S" }];
  const [series] = computeSeries(data, raw, "x", "y", "g", {}, ["#000"]);
  eq(
    series.points.map((p) => p.x),
    [1, 2, 3]
  );
});

test("skips rows where x or y is null / NaN", () => {
  const data = [
    { x: 1, y: 2 },
    { x: null, y: 5 },
    { x: 2, y: NaN },
    { x: 3, y: 7 },
  ];
  const raw = data.map(() => ({ g: "S" }));
  const [series] = computeSeries(data, raw, "x", "y", "g", {}, ["#000"]);
  eq(
    series.points.map((p) => p.x),
    [1, 3]
  );
});

test("groupCol=null collapses all rows into a single '(all)' series", () => {
  const data = [
    { x: 1, y: 10 },
    { x: 2, y: 20 },
  ];
  const raw = [{}, {}];
  const series = computeSeries(data, raw, "x", "y", null, {}, ["#000"]);
  eq(series.length, 1);
  eq(series[0].name, "(all)");
});

test("groupColors override wins over palette cycling", () => {
  const data = [{ x: 1, y: 1 }];
  const raw = [{ g: "A" }];
  const [series] = computeSeries(data, raw, "x", "y", "g", { A: "#abcdef" }, ["#000"]);
  eq(series.color, "#abcdef");
});

// ── per-group line style / point shape ──────────────────────────────────────

test("defaults to solid line + filled circle when no style maps are given", () => {
  const data = [{ x: 1, y: 1 }];
  const raw = [{ g: "A" }];
  const [series] = computeSeries(data, raw, "x", "y", "g", {}, ["#000"]);
  eq(series.lineStyle, "solid");
  eq(series.pointShape, "circle");
  eq(series.pointFilled, true);
});

test("per-group line style / point shape / filled overrides are picked up by name", () => {
  const data = [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
  ];
  const raw = [{ g: "A" }, { g: "B" }];
  const series = computeSeries(
    data,
    raw,
    "x",
    "y",
    "g",
    {},
    ["#000"],
    { A: "dashed", B: "dotted" },
    { A: "square", B: "diamond" },
    { A: false }
  );
  const a = series.find((s) => s.name === "A");
  const b = series.find((s) => s.name === "B");
  eq(a.lineStyle, "dashed");
  eq(a.pointShape, "square");
  eq(a.pointFilled, false);
  eq(b.lineStyle, "dotted");
  eq(b.pointShape, "diamond");
  eq(b.pointFilled, true); // untouched by the groupPointFilled map → default filled
});

// ── lineDashArray ────────────────────────────────────────────────────────────

suite("lineDashArray");

test("solid style has no dash array", () => {
  eq(lineDashArray("solid", 1.5), undefined);
});

test("dashed / dotted scale proportionally with stroke width", () => {
  eq(lineDashArray("dashed", 2), "8,5");
  eq(lineDashArray("dotted", 2), "2,4");
});

// ── lineplotSummaryText ─────────────────────────────────────────────────────

suite("lineplotSummaryText");

const trStub = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const label = (id) => `<${id}>`;

test("lists the distinct tests, the BH step across x and the error bars", () => {
  const rows = [
    { x: 0, chosenTest: "welchANOVA" },
    { x: 2, chosenTest: "welchANOVA" },
    { x: 4, chosenTest: "kruskalWallis" },
    { x: 6, chosenTest: null },
  ];
  eq(
    lineplotSummaryText(rows, "sem", true, trStub, label),
    [
      'lineplot.summary.test{"tests":"<welchANOVA>, <kruskalWallis>"}',
      "lineplot.summary.bh",
      'lineplot.summary.errorBars{"bar":"SEM"}',
    ].join("\n")
  );
  eq(
    lineplotSummaryText(rows, "ci95", true, trStub, label).split("\n")[2],
    'lineplot.summary.errorBars{"bar":"95% CI"}'
  );
  eq(lineplotSummaryText(rows, "none", true, trStub, label).split("\n").length, 2, "no bars line");
});

test("one x: no BH line; hidden or nothing tested → null", () => {
  eq(
    lineplotSummaryText([{ x: 0, chosenTest: "welchT" }], "sd", true, trStub, label),
    'lineplot.summary.test{"tests":"<welchT>"}\nlineplot.summary.errorBars{"bar":"SD"}'
  );
  eq(lineplotSummaryText([{ x: 0, chosenTest: "welchT" }], "sd", false, trStub, label), null);
  eq(lineplotSummaryText([{ x: 0, chosenTest: null }], "sd", true, trStub, label), null);
  eq(lineplotSummaryText([], "sd", true, trStub, label), null);
});

// ── computePerXStats ───────────────────────────────────────────────────────

suite("computePerXStats");

test("emits one row per x that is shared by ≥2 groups with n ≥ 2 each", () => {
  const series = [
    {
      name: "A",
      points: [
        { x: 1, values: [1, 2, 3], n: 3, mean: 2, sd: 1, sem: 0.577, ci95: 0 },
        { x: 2, values: [10], n: 1, mean: 10, sd: 0, sem: 0, ci95: 0 }, // n<2, excluded
      ],
    },
    {
      name: "B",
      points: [
        { x: 1, values: [4, 5, 6], n: 3, mean: 5, sd: 1, sem: 0.577, ci95: 0 },
        { x: 2, values: [20, 21], n: 2, mean: 20.5, sd: 0.707, sem: 0.5, ci95: 0 }, // solo at x=2
      ],
    },
  ];
  const rows = computePerXStats(series);
  eq(rows.length, 1, "only x=1 has ≥2 groups with n≥2");
  eq(rows[0].x, 1);
  eq(rows[0].names, ["A", "B"]);
  assert(rows[0].chosenTest, "a test should have been routed");
  assert(rows[0].result, "result should be populated");
});

test("BH-adjusts p-values across eligible x points", () => {
  const mkPoints = (x, arr) => ({
    x,
    values: arr,
    n: arr.length,
    mean: arr.reduce((a, b) => a + b, 0) / arr.length,
    sd: 1,
    sem: 0.1,
    ci95: 0,
  });
  const series = [
    { name: "A", points: [mkPoints(1, [1, 2, 3]), mkPoints(2, [1, 2, 3])] },
    { name: "B", points: [mkPoints(1, [4, 5, 6]), mkPoints(2, [100, 101, 102])] },
  ];
  const rows = computePerXStats(series);
  eq(rows.length, 2);
  // Both rows should carry an adjusted p; neither should be null.
  assert(rows[0].pAdj != null);
  assert(rows[1].pAdj != null);
  // BH-adjusted p is always ≥ raw p.
  assert(rows[0].pAdj >= rows[0].result.p - 1e-12);
  assert(rows[1].pAdj >= rows[1].result.p - 1e-12);
});

test("x values that never appear in ≥2 groups produce no rows", () => {
  const series = [
    {
      name: "A",
      points: [{ x: 1, values: [1, 2], n: 2, mean: 1.5, sd: 0.5, sem: 0.3, ci95: 0 }],
    },
    {
      name: "B",
      points: [{ x: 2, values: [4, 5], n: 2, mean: 4.5, sd: 0.5, sem: 0.3, ci95: 0 }],
    },
  ];
  eq(computePerXStats(series), []);
});

suite("lineplot — withPower (replication planning added on demand)");

// The per-x panel no longer computes replication planning for every x up
// front; the text report adds it per row with withPower. It must carry the
// same planning the panel shows for that row.
const statsRow = (chosenTest, values) => ({
  x: 4,
  names: values.map((_, i) => `G${i + 1}`),
  values,
  rec: null,
  chosenTest,
  result: null,
  postHocName: null,
  postHocResult: null,
  pAdj: 0.01,
});

test("two groups: Cohen's d planning with three α rows, row fields kept", () => {
  const row = statsRow("welchT", [
    [0.55, 0.58, 0.61, 0.57],
    [0.42, 0.39, 0.45, 0.4],
  ]);
  const out = withPower(row);
  assert(out.powerResult, "expected replication planning");
  eq(out.powerResult.effectLabel, "Cohen's d (unpooled SD)");
  eq(
    out.powerResult.rows.map((r) => r.alpha),
    [0.05, 0.01, 0.001]
  );
  for (const r of out.powerResult.rows) assert(Number.isInteger(r.nForTarget), `α=${r.alpha}`);
  eq(out.x, 4);
  eq(out.pAdj, 0.01);
  assert(out.values === row.values, "values passed through");
});

test("three groups: Cohen's f planning", () => {
  const out = withPower(
    statsRow("welchANOVA", [
      [1, 2, 3],
      [2, 3, 4],
      [5, 6, 7],
    ])
  );
  eq(out.powerResult.effectLabel, "Cohen's f");
});

test("no chosen test → no planning", () => {
  eq(
    withPower(
      statsRow(null, [
        [1, 2],
        [3, 4],
      ])
    ).powerResult,
    null
  );
});

summary();

// @vitest-environment happy-dom
//
// Visual-regression snapshots for the SVG chart components.
//
// The render-smoke tests in components.test.js confirm a chart renders
// without throwing and produces elements. They do NOT check that the
// chart looks right — a regression that misplaces an axis label, clips
// the plot area, shifts every point, or picks the wrong colour passes
// them. This file closes that gap: it snapshots the full SVG string, so
// any geometry / label / colour / layout change surfaces as a diff.
//
// Why this is sound:
//   - The charts are a pure function of their props — no Date, no
//     unseeded Math.random (point jitter uses a seeded RNG). Verified:
//     repeated renders are byte-identical.
//   - `normalizeSvg` rounds every coordinate to 2 decimal places. The
//     layout is plain +/-/*//sqrt arithmetic (IEEE-754 bit-identical
//     across platforms), so this is mainly for readable baselines and
//     as insurance; 0.01px is far below any real visual regression.
//
// IMPORTANT: when a snapshot legitimately changes, the new baseline must
// be *eyeball-reviewed* before `--update` — an un-reviewed snapshot is
// theatre. The Day-1 baselines here were each reviewed on creation.

const { suite, test, summary } = require("./harness");
const { loadTool, renderHtml } = require("./helpers/render-loader");

// Round every decimal literal in the SVG to 2 places.
function normalizeSvg(html) {
  return html.replace(/-?\d+\.\d+/g, (m) => Number(m).toFixed(2));
}

// ── Boxplot (bar mode) ──────────────────────────────────────────────────────

suite("chart snapshots — boxplot");

(function () {
  const BoxplotChart = loadTool("boxplot").exports.BoxplotChart;
  const groups = [
    {
      name: "Control",
      color: "#648FFF",
      displayName: "Control",
      stats: { n: 5, mean: 5.4, sd: 1.14, sem: 0.51, min: 4, max: 7, median: 5 },
      allValues: [4, 5, 5, 6, 7],
      sources: [{ colIndex: 0, values: [4, 5, 5, 6, 7] }],
    },
    {
      name: "Treatment",
      color: "#DC267F",
      displayName: "Treatment",
      stats: { n: 5, mean: 8.2, sd: 1.3, sem: 0.58, min: 7, max: 9, median: 8 },
      allValues: [7, 8, 8, 9, 9],
      sources: [{ colIndex: 0, values: [7, 8, 8, 9, 9] }],
    },
  ];

  test("bar mode — 2 groups, jittered points, grid, SEM bars", () => {
    expect(
      normalizeSvg(
        renderHtml(BoxplotChart, {
          groups,
          plotStyle: "bar",
          yLabel: "Value",
          plotTitle: "Bar Test",
          plotBg: "#fff",
          showGrid: true,
          gridColor: "#eee",
          boxWidth: 60,
          pointSize: 3,
          showPoints: true,
          jitterWidth: 0.3,
          pointOpacity: 0.6,
          xLabelAngle: 0,
          errorType: "sem",
          barOpacity: 0.8,
          categoryColors: {},
          colorByCol: -1,
          errStrokeWidth: 1.5,
          showBarOutline: false,
          barOutlineWidth: 1,
          svgLegend: [],
        })
      )
    ).toMatchSnapshot();
  });

  test("bar mode — no points, SD bars, outline, rotated x-labels", () => {
    expect(
      normalizeSvg(
        renderHtml(BoxplotChart, {
          groups,
          plotStyle: "bar",
          yLabel: "Value",
          plotTitle: "",
          plotBg: "#f8f8fa",
          showGrid: false,
          gridColor: "#ccc",
          boxWidth: 80,
          pointSize: 3,
          showPoints: false,
          jitterWidth: 0,
          pointOpacity: 0.6,
          xLabelAngle: 30,
          errorType: "sd",
          barOpacity: 1,
          categoryColors: {},
          colorByCol: -1,
          errStrokeWidth: 2,
          showBarOutline: true,
          barOutlineWidth: 1.5,
          svgLegend: [],
        })
      )
    ).toMatchSnapshot();
  });
})();

// ── Scatter ─────────────────────────────────────────────────────────────────

suite("chart snapshots — scatter");

(function () {
  const ScatterChart = loadTool("scatter").exports.ScatterChart;
  // ScatterChart indexes each row by column number (`row[xCol]`), so `data`
  // must be parsed rows (arrays), not {x,y} objects — the latter renders
  // zero points (a fixture bug components.test.js's scatter suite shares).
  const data = [
    [1, 2, "A"],
    [3, 4, "B"],
    [5, 6, "A"],
    [7, 8, "B"],
  ];
  const rawData = [
    ["1", "2", "A"],
    ["3", "4", "B"],
    ["5", "6", "A"],
    ["7", "8", "B"],
  ];
  const base = {
    data,
    rawData,
    xCol: 0,
    yCol: 1,
    xMin: 0,
    xMax: 10,
    yMin: 0,
    yMax: 10,
    xLabel: "X",
    yLabel: "Y",
    plotBg: "#fff",
    gridColor: "#eee",
    refLines: [],
    pointColor: "#648FFF",
    colorMapType: "discrete",
    colorMapPalette: "viridis",
    colorMapRange: [0, 1],
    sizeMapCol: -1,
    sizeMapType: "discrete",
    sizeMapMin: 3,
    sizeMapMax: 10,
    sizeMapDiscrete: {},
    sizeMapRange: [0, 1],
    shapeMapCol: -1,
    shapeMapDiscrete: {},
    svgLegend: [],
  };

  test("plain XY — grid, single colour", () => {
    expect(
      normalizeSvg(
        renderHtml(ScatterChart, {
          ...base,
          title: "Scatter Test",
          showGrid: true,
          pointSize: 4,
          pointOpacity: 0.7,
          strokeColor: "#333",
          strokeWidth: 0.5,
          colorMapCol: -1,
          colorMapDiscrete: {},
        })
      )
    ).toMatchSnapshot();
  });

  test("discrete colour mapping by category column", () => {
    expect(
      normalizeSvg(
        renderHtml(ScatterChart, {
          ...base,
          title: "",
          showGrid: false,
          pointSize: 5,
          pointOpacity: 0.8,
          strokeColor: "none",
          strokeWidth: 0,
          colorMapCol: 2,
          colorMapDiscrete: { A: "#648FFF", B: "#DC267F" },
        })
      )
    ).toMatchSnapshot();
  });
})();

// ── Aequorin (luminescence time-course) ─────────────────────────────────────

suite("chart snapshots — aequorin");

(function () {
  const Chart = loadTool("aequorin").exports.Chart;
  // AequorinChart reads `s.prefix` for the trace id / aria-label; a series
  // with only `name` renders `aria-label="Trace: undefined"` (another
  // fixture bug components.test.js's aequorin suite shares).
  const series = [
    {
      name: "WT",
      prefix: "WT",
      color: "#648FFF",
      rows: [
        { t: 0, mean: 100, sd: 10 },
        { t: 1, mean: 200, sd: 20 },
        { t: 2, mean: 150, sd: 15 },
      ],
    },
    {
      name: "Mutant",
      prefix: "Mutant",
      color: "#DC267F",
      rows: [
        { t: 0, mean: 80, sd: 10 },
        { t: 1, mean: 120, sd: 20 },
        { t: 2, mean: 90, sd: 15 },
      ],
    },
  ];

  test("two series — mean line + SD ribbon, grid", () => {
    expect(
      normalizeSvg(
        renderHtml(Chart, {
          series,
          xStart: 0,
          xEnd: 2,
          yMin: 0,
          yMax: 250,
          vbW: 700,
          vbH: 450,
          xLabel: "Time (s)",
          yLabel: "Luminescence (RLU)",
          plotBg: "#fff",
          showGrid: true,
          lineWidth: 2,
          ribbonOpacity: 0.2,
          gridColor: "#eee",
          svgLegend: [],
          plotTitle: "Ca2+ Response",
          plotSubtitle: "",
        })
      )
    ).toMatchSnapshot();
  });
})();

// ── Line plot (mean ± error across a shared x) ──────────────────────────────

suite("chart snapshots — lineplot");

(function () {
  const Chart = loadTool("lineplot").exports.Chart;
  const series = [
    {
      name: "WT",
      color: "#648FFF",
      points: [
        { x: 0, values: [0.05, 0.06, 0.05], n: 3, mean: 0.053, sd: 0.006, sem: 0.003, ci95: 0.014 },
        { x: 2, values: [0.18, 0.21, 0.19], n: 3, mean: 0.193, sd: 0.015, sem: 0.009, ci95: 0.038 },
        { x: 4, values: [0.55, 0.58, 0.61], n: 3, mean: 0.58, sd: 0.03, sem: 0.017, ci95: 0.075 },
      ],
    },
    {
      name: "mutant_A",
      color: "#DC267F",
      points: [
        { x: 0, values: [0.05, 0.06, 0.05], n: 3, mean: 0.053, sd: 0.006, sem: 0.003, ci95: 0.014 },
        { x: 2, values: [0.15, 0.17, 0.16], n: 3, mean: 0.16, sd: 0.01, sem: 0.006, ci95: 0.025 },
        { x: 4, values: [0.42, 0.39, 0.45], n: 3, mean: 0.42, sd: 0.03, sem: 0.017, ci95: 0.075 },
      ],
    },
  ];

  test("two growth curves — SEM bars, legend, grid", () => {
    expect(
      normalizeSvg(
        renderHtml(Chart, {
          series,
          perXStats: [],
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 0.7,
          vbW: 700,
          vbH: 440,
          xLabel: "Time (h)",
          yLabel: "OD600",
          plotTitle: "Growth curves",
          plotSubtitle: "",
          plotBg: "#ffffff",
          showGrid: true,
          gridColor: "#e0e0e0",
          lineWidth: 1.5,
          pointRadius: 3.5,
          errorStrokeWidth: 1,
          errorCapWidth: 6,
          errorType: "sem",
          svgLegend: [{ items: series.map((s) => ({ label: s.name, color: s.color })) }],
          showStars: true,
        })
      )
    ).toMatchSnapshot();
  });
})();

summary();

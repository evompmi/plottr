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

// ── Boxplot edge cases ──────────────────────────────────────────────────────
//
// The four inputs most likely to break boxplot layout silently: a lone
// group, a crowded x-axis, over-long category labels, and a value range
// small enough to push the y-axis ticks into scientific notation.
//
// NaN / Inf values are deliberately NOT covered here. The parse +
// computeStats pipeline strips non-finite values before they ever reach a
// group's `allValues`, so a NaN fixture would snapshot an input the chart
// tier never receives — and `Math.min(...allV)` in computeYDomain would
// poison the whole domain to NaN. That guard belongs in a computeYDomain
// unit test, not a visual baseline.

suite("chart snapshots — boxplot edge cases");

(function () {
  const BoxplotChart = loadTool("boxplot").exports.BoxplotChart;

  // Build a group from a plain list of values — stats are derived so each
  // fixture stays readable (a name + a few numbers) and self-consistent.
  function groupOf(name, color, values) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    const sorted = [...values].sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    return {
      name,
      color,
      displayName: name,
      stats: { n, mean, sd, sem: sd / Math.sqrt(n), min: sorted[0], max: sorted[n - 1], median },
      allValues: values,
      sources: [{ colIndex: 0, values }],
    };
  }

  const PAL8 = [
    "#648FFF",
    "#785EF0",
    "#DC267F",
    "#FE6100",
    "#FFB000",
    "#1A9850",
    "#0072B2",
    "#999999",
  ];

  // Bar-mode prop bag shared by every edge-case render; `groups`,
  // `plotTitle` and `xLabelAngle` are supplied per test.
  const barBase = {
    plotStyle: "bar",
    yLabel: "Value",
    plotBg: "#fff",
    showGrid: true,
    gridColor: "#eee",
    boxWidth: 60,
    pointSize: 3,
    showPoints: true,
    jitterWidth: 0.3,
    pointOpacity: 0.6,
    errorType: "sem",
    barOpacity: 0.8,
    categoryColors: {},
    colorByCol: -1,
    errStrokeWidth: 1.5,
    showBarOutline: false,
    barOutlineWidth: 1,
    svgLegend: [],
  };

  test("single group — one bar, axis still well-formed", () => {
    expect(
      normalizeSvg(
        renderHtml(BoxplotChart, {
          ...barBase,
          groups: [groupOf("Solo", PAL8[0], [4, 6, 6, 8])],
          plotTitle: "One Group",
          xLabelAngle: 0,
        })
      )
    ).toMatchSnapshot();
  });

  test("eight groups — crowded x-axis, 45° labels", () => {
    const groups = PAL8.map((c, i) =>
      groupOf(`Cond ${String.fromCharCode(65 + i)}`, c, [i + 2, i + 4, i + 3, i + 5])
    );
    expect(
      normalizeSvg(
        renderHtml(BoxplotChart, {
          ...barBase,
          groups,
          plotTitle: "Eight Conditions",
          xLabelAngle: 45,
        })
      )
    ).toMatchSnapshot();
  });

  test("very long category labels — 30° rotation", () => {
    expect(
      normalizeSvg(
        renderHtml(BoxplotChart, {
          ...barBase,
          groups: [
            groupOf("Wild-type baseline (uninduced, 0 h)", PAL8[0], [3, 4, 4, 5]),
            groupOf("Knockout + rescue construct (induced, 24 h)", PAL8[2], [7, 8, 9, 8]),
          ],
          plotTitle: "Long Labels",
          xLabelAngle: 30,
        })
      )
    ).toMatchSnapshot();
  });

  test("tiny value range — scientific-notation y-ticks", () => {
    expect(
      normalizeSvg(
        renderHtml(BoxplotChart, {
          ...barBase,
          groups: [
            groupOf("Trace A", PAL8[0], [0.0001, 0.00012, 0.00011, 0.00013]),
            groupOf("Trace B", PAL8[2], [0.00028, 0.00031, 0.00029, 0.00033]),
          ],
          plotTitle: "Tiny Range",
          xLabelAngle: 0,
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

  // ── edge cases ────────────────────────────────────────────────────────────

  test("edge — horizontal + vertical reference lines with labels", () => {
    expect(
      normalizeSvg(
        renderHtml(ScatterChart, {
          ...base,
          title: "Reference Lines",
          showGrid: true,
          pointSize: 4,
          pointOpacity: 0.7,
          strokeColor: "#333",
          strokeWidth: 0.5,
          colorMapCol: -1,
          colorMapDiscrete: {},
          refLines: [
            {
              id: "h1",
              dir: "h",
              value: 5,
              color: "#444",
              dashed: true,
              label: "y = 5",
              labelSide: "right",
            },
            {
              id: "v1",
              dir: "v",
              value: 4,
              color: "#888",
              dashed: false,
              label: "x = 4",
              labelSide: "top",
            },
            // value 99 is past yMax (10): the chart drops both line and label.
            { id: "off", dir: "h", value: 99, color: "#444", label: "off-scale" },
          ],
        })
      )
    ).toMatchSnapshot();
  });

  test("edge — discrete size + shape mapping by category column", () => {
    expect(
      normalizeSvg(
        renderHtml(ScatterChart, {
          ...base,
          title: "Size + Shape Map",
          showGrid: false,
          pointSize: 4,
          pointOpacity: 0.8,
          strokeColor: "#333",
          strokeWidth: 0.4,
          colorMapCol: -1,
          colorMapDiscrete: {},
          sizeMapCol: 2,
          sizeMapType: "discrete",
          sizeMapDiscrete: { A: 5, B: 11 },
          shapeMapCol: 2,
          shapeMapDiscrete: { A: "square", B: "triangle" },
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

  // ── edge cases ────────────────────────────────────────────────────────────

  const aqBase = {
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
    plotSubtitle: "",
  };

  test("edge — single series", () => {
    expect(
      normalizeSvg(renderHtml(Chart, { ...aqBase, series: [series[0]], plotTitle: "Single Trace" }))
    ).toMatchSnapshot();
  });

  test("edge — six series — legend + colour cycle", () => {
    // A single-timepoint series is intentionally NOT covered: aequorin
    // draws lines + ribbons only (no point markers) and buildLineD /
    // buildAreaD need >= 2 points, so a 1-row series renders an empty
    // data area — nothing for a visual snapshot to guard.
    const many = ["#648FFF", "#785EF0", "#DC267F", "#FE6100", "#FFB000", "#1A9850"].map(
      (color, i) => ({
        name: `Clone ${i + 1}`,
        prefix: `Clone ${i + 1}`,
        color,
        rows: [
          { t: 0, mean: 60 + i * 10, sd: 8 },
          { t: 1, mean: 120 + i * 18, sd: 14 },
          { t: 2, mean: 90 + i * 12, sd: 10 },
        ],
      })
    );
    expect(
      normalizeSvg(
        renderHtml(Chart, {
          ...aqBase,
          series: many,
          plotTitle: "Six Clones",
          svgLegend: [{ items: many.map((s) => ({ label: s.name, color: s.color })) }],
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

  // ── edge cases ────────────────────────────────────────────────────────────

  const lpBase = {
    xMin: 0,
    xMax: 4,
    yMin: 0,
    yMax: 0.7,
    vbW: 700,
    vbH: 440,
    xLabel: "Time (h)",
    yLabel: "OD600",
    plotSubtitle: "",
    plotBg: "#ffffff",
    showGrid: true,
    gridColor: "#e0e0e0",
    lineWidth: 1.5,
    pointRadius: 3.5,
    errorStrokeWidth: 1,
    errorCapWidth: 6,
    errorType: "sem",
  };

  test("edge — single series", () => {
    expect(
      normalizeSvg(
        renderHtml(Chart, {
          ...lpBase,
          series: [series[0]],
          perXStats: [],
          plotTitle: "Single Series",
          svgLegend: [{ items: [{ label: series[0].name, color: series[0].color }] }],
          showStars: false,
        })
      )
    ).toMatchSnapshot();
  });

  test("edge — significance stars across x", () => {
    expect(
      normalizeSvg(
        renderHtml(Chart, {
          ...lpBase,
          series,
          // pStars: 0.008 → "**" renders; 0.3 → "ns" is skipped; null → skipped.
          perXStats: [
            { x: 0, pAdj: null },
            { x: 2, pAdj: 0.008 },
            { x: 4, pAdj: 0.3 },
          ],
          plotTitle: "With Stars",
          svgLegend: [{ items: series.map((s) => ({ label: s.name, color: s.color })) }],
          showStars: true,
        })
      )
    ).toMatchSnapshot();
  });
})();

summary();

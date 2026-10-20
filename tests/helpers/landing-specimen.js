// The landing page's hero "specimen": Group Plot's own example dataset
// (`EXAMPLE_CSV` in tools/boxplot/app.tsx) run through the real statistics
// and drawn by the real `BoxplotChart`, plus the numbers printed beside it
// and the benchmark comparison count. `tests/landing.test.js` checks the
// committed copies against this; `UPDATE_LANDING=1` rewrites them.

const fs = require("fs");
const path = require("path");
const { loadTool, renderHtml } = require("./render-loader");
const bp = require("./boxplot-loader");

const ROOT = path.join(__dirname, "../..");
const SPECIMEN_SVG = path.join(ROOT, "tools/landing-specimen.svg");

// Group Plot's defaults (VIS_INIT_BOXPLOT) — what a user sees after
// "Try sample data" → Plot, with significance brackets switched on.
const VIS = {
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  boxFillOpacity: 0.15,
  boxWidth: 70,
  boxGap: 0,
  pointSize: 2.5,
  showPoints: true,
  jitterWidth: 0.6,
  pointOpacity: 0.6,
  xLabelAngle: 0,
  tickFontSize: 11,
};
const OKABE_ITO = ["#E69F00", "#56B4E9", "#009E73"];

const fmtP = (p) => bp.formatBpResultLine("welchT", { t: 0, df: 1, p }).split("p = ")[1];

function buildSpecimen() {
  const tool = loadTool("boxplot").exports;
  const parsed = bp.parseRaw(tool.EXAMPLE_CSV);
  const header = parsed.headers;
  const gCol = header.indexOf("Genotype");
  const vCol = header.indexOf("Biomass_mg");
  const order = bp.firstSeenOrder(parsed.rows, gCol);
  const colors = Object.fromEntries(order.map((g, i) => [g, OKABE_ITO[i]]));
  const groups = bp.buildGroups(parsed.rows, {
    groupCol: gCol,
    valueCol: vCol,
    colorByCol: -1,
    colorByCategories: [],
    order,
    disabled: {},
    colors,
    palette: "okabe-ito",
  });
  const names = groups.map((g) => g.name);
  const values = groups.map((g) => g.allValues);
  const rec = bp.selectTest(values);
  const test = rec.recommendation.test;
  const testFn = { welchANOVA: bp.welchANOVA, oneWayANOVA: bp.oneWayANOVA }[test];
  const postFn = { gamesHowell: bp.gamesHowell, tukeyHSD: bp.tukeyHSD }[rec.recommendation.postHoc];
  if (!testFn || !postFn) throw new Error(`landing specimen: unexpected test ${test}`);
  const testResult = testFn(values);
  const postHocResult = postFn(values);
  const annotations = bp.computeBpAnnotationSpec(
    { k: names.length, names, testResult, postHocResult },
    "brackets",
    false
  );
  const svg = renderHtml(tool.BoxplotChart, {
    ...VIS,
    groups,
    yLabel: header[vCol],
    plotTitle: "",
    yMin: null,
    yMax: null,
    yScale: "linear",
    categoryColors: {},
    colorByCol: -1,
    svgLegend: null,
    showCompPie: false,
    plotStyle: "box",
    annotations,
    statsSummary: null,
    barOpacity: 0.25,
    errorType: "sem",
    errStrokeWidth: 1.2,
    showBarOutline: false,
    barOutlineWidth: 1.5,
    barOutlineColor: "#333333",
    horizontal: false,
  });
  const pairs = postHocResult.pairs
    .map((pr) => ({ a: names[pr.i], b: names[pr.j], p: pr.pAdj != null ? pr.pAdj : pr.p }))
    .filter((pr) => pr.p < 0.05)
    .sort((x, y) => x.p - y.p);
  return {
    svg: svg + "\n",
    stats: {
      // "F(2, 45.51) = 37.326" and "p = 2.5e-10", exactly as Group Plot prints them.
      statistic: bp.formatBpStatShort(test, testResult),
      p: `p = ${fmtP(testResult.p)}`,
      pairs: pairs.map((pr) => `${pr.a} vs ${pr.b} · ${fmtP(pr.p)}`),
    },
  };
}

// Total comparisons on the public benchmark page: the R and SciPy panels'
// "comparisons" figures, summed.
function benchmarkComparisons() {
  const html = fs.readFileSync(path.join(ROOT, "benchmark.html"), "utf8");
  const counts = [
    ...html.matchAll(/<span class="k">comparisons<\/span><span class="v">([\d,]+)<\/span>/g),
  ].map((m) => Number(m[1].replace(/,/g, "")));
  if (counts.length !== 2) throw new Error(`expected 2 benchmark panels, found ${counts.length}`);
  return counts[0] + counts[1];
}

module.exports = { buildSpecimen, benchmarkComparisons, SPECIMEN_SVG };

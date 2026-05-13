// @vitest-environment happy-dom
//
// Component render-smoke tests — verify every React component can be
// rendered with minimal valid props and produces non-empty markup
// without throwing.
//
// Migrated from a bespoke functional-React mock (the old
// `tests/helpers/render-loader.js` was 354 lines of hand-rolled
// `createElement` / hook simulators that returned `{type, props,
// children}` element-tree objects) to **real React 18 + happy-dom**
// in 2026-05-05. The shared bundle (`tools/shared.bundle.js`) and the
// compiled tool .js files now load against the actual `react` and
// `react-dom/server` packages; assertions read DOM / HTML directly
// instead of reverse-engineering element-tree shapes.
//
// Assertion idiom:
//   - `renderHtml(Component, props)` returns the static HTML string.
//   - For tag / structure checks, parse the HTML into a happy-dom
//     element via `rootEl(html)` and ask the DOM directly.
//   - `renderHtml` returning `""` is the new "component returned null".
//
// `renderWithEffects` (uses react-dom/client + happy-dom + act) is
// reserved for the small block of tests at the bottom that exercise
// useEffect / useLayoutEffect / context — `renderToStaticMarkup` does
// not run effects.

const { suite, test, assert, eq, summary } = require("./harness");
const {
  buildContext,
  loadTool,
  renderHtml,
  renderWithEffects,
  React,
} = require("./helpers/render-loader");

// ── Local helpers ──────────────────────────────────────────────────────

// Parse an HTML string and return the first element. happy-dom is
// available because of the per-file `// @vitest-environment happy-dom`
// pragma at the top.
function rootEl(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.firstElementChild;
}

// Count immediate children of the root element.
function rootChildCount(html) {
  const root = rootEl(html);
  return root ? root.children.length : 0;
}

// Total tag-open count — quick proxy for "the tree is non-trivial",
// replaces the old `countElements(el) > N` assertion.
function tagCount(html) {
  return (html.match(/<[a-zA-Z]/g) || []).length;
}

// Boot the shared bundle once; every shared-component test reuses the
// same `sc` reference.
const { ctx: sc } = buildContext();
const noop = function () {};

// ════════════════════════════════════════════════════════════════════════════
//  shared-components.js
// ════════════════════════════════════════════════════════════════════════════

suite("DataPreview");

test("renders table with headers and rows", function () {
  const html = renderHtml(sc.DataPreview, {
    headers: ["Name", "Value"],
    rows: [
      ["A", "1"],
      ["B", "2"],
      ["C", "3"],
    ],
  });
  const root = rootEl(html);
  assert(root, "should render");
  assert(root.tagName === "DIV", "root should be a div");
  assert(tagCount(html) > 5, "should produce multiple elements");
});

test("renders with maxRows limiting output", function () {
  var rows = [];
  for (var i = 0; i < 20; i++) rows.push(["r" + i, String(i)]);
  const html = renderHtml(sc.DataPreview, { headers: ["A", "B"], rows: rows, maxRows: 3 });
  assert(html.length > 0, "should render");
});

suite("SliderControl");

test("renders slider with label and value", function () {
  const html = renderHtml(sc.SliderControl, {
    label: "Opacity",
    value: 50,
    min: 0,
    max: 100,
    step: 1,
    onChange: noop,
  });
  const root = rootEl(html);
  assert(root, "should render");
  assert(root.tagName === "DIV", "root should be a div");
});

suite("StepNavBar");

test("renders step buttons", function () {
  const html = renderHtml(sc.StepNavBar, {
    steps: ["Upload", "Configure", "Plot"],
    currentStep: "Upload",
    onStepChange: noop,
  });
  // One per-step wrapper <div> per step at the root level.
  assert(rootChildCount(html) === 3, "should have 3 per-step wrappers");
});

suite("CommaFixBanner");

test("returns null when commaFixed is false", function () {
  const html = renderHtml(sc.CommaFixBanner, { commaFixed: false, commaFixCount: 0 });
  eq(html, "");
});

test("renders banner when commaFixed is true", function () {
  const html = renderHtml(sc.CommaFixBanner, { commaFixed: true, commaFixCount: 5 });
  assert(html.length > 0, "should render");
});

suite("ParseErrorBanner");

test("returns null when no error", function () {
  const html = renderHtml(sc.ParseErrorBanner, { error: null });
  eq(html, "");
});

test("renders banner with error message", function () {
  const html = renderHtml(sc.ParseErrorBanner, { error: "Bad CSV" });
  assert(html.length > 0, "should render");
  assert(html.includes("Bad CSV"), "banner should include the error message");
});

suite("PageHeader");

test("renders header with title", function () {
  const html = renderHtml(sc.PageHeader, { toolName: "boxplot", title: "Boxplot Tool" });
  assert(html.length > 0, "should render");
  assert(html.includes("Boxplot Tool"), "should include the title text");
});

test("renders header with right-slot content", function () {
  // PageHeader exposes `middle` and `right` slots for inline children
  // (theme toggle, prefs button, …) — there is no `subtitle` prop. The
  // pre-Vitest mock's element-tree happened to include the unused
  // `subtitle` string in its serialized form, so the legacy assertion
  // matched on a value the component never rendered. Assert on a real
  // slot instead — the right slot is the canonical home for the
  // ThemeToggle / PrefsPanel buttons every tool surfaces.
  const html = renderHtml(sc.PageHeader, {
    toolName: "scatter",
    title: "Scatter",
    right: React.createElement("button", null, "extras"),
  });
  assert(html.includes("Scatter"), "should render the title");
  assert(html.includes("extras"), "right-slot content should render");
  assert(tagCount(html) > 3, "right slot should add elements");
});

suite("UploadPanel");

test("renders with no separator selected (disabled state)", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
  });
  assert(html.length > 0, "should render");
  assert(
    html.indexOf("Pick a column separator") !== -1,
    "legacy path should still gate the drop zone"
  );
});

test("renders with separator selected (enabled state)", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: ",",
    onSepChange: noop,
    onFileLoad: noop,
  });
  assert(html.length > 0, "should render");
});

test("autoDetect mode hides the gate and offers an Override disclosure", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
    autoDetect: true,
  });
  assert(
    html.indexOf("Pick a column separator") === -1,
    "the legacy 🚫 gate must not render under autoDetect"
  );
  assert(html.indexOf("auto-detects") !== -1, "should explain auto-detect to the user");
  assert(html.indexOf("Override") !== -1, "should expose an override affordance");
});

test("autoDetect disclosure is closed on mount when sepOverride is empty", function () {
  // Regression: previously, `loadExample` / cross-tool handoff set
  // sepOverride to a literal value (',' or '\t') even though autoDetect
  // mode doesn't need it; navigating back to upload then remounted
  // AutoDetectUploadPanel and the `useState(sepOverride !== "")`
  // initializer popped the Override disclosure open with that value
  // forced. With sepOverride empty the disclosure must stay collapsed.
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
    autoDetect: true,
  });
  assert(
    html.indexOf("Force separator") === -1,
    "Force separator picker should not render until the disclosure is opened"
  );
});

test("autoDetect disclosure starts open only when sepOverride is user-set", function () {
  // The flip side of the regression check above: when the user *has*
  // explicitly picked an override (or a returning visitor's sepOverride
  // is persisted as e.g. ';'), the disclosure should restore that state
  // on mount so they can see what's active.
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: ";",
    onSepChange: noop,
    onFileLoad: noop,
    autoDetect: true,
  });
  assert(
    html.indexOf("Force separator") !== -1,
    "Force separator picker should render when sepOverride was user-set"
  );
});

test("autoDetect + onTextPaste renders Drop and Paste side-by-side", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
    onTextPaste: noop,
    autoDetect: true,
  });
  assert(html.indexOf("Drop a file") !== -1, "drop card should render");
  assert(html.indexOf("Paste data") !== -1, "paste card should render");
  assert(html.indexOf("Parse pasted data") !== -1, "paste submit button should render");
  assert(
    html.indexOf("Excel") !== -1 && html.indexOf("Sheets") !== -1,
    "placeholder should call out Excel / Sheets as the common paste sources"
  );
});

test("autoDetect without onTextPaste renders only the Drop card", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
    autoDetect: true,
  });
  assert(html.indexOf("Drop a file") !== -1, "drop card should still render");
  assert(html.indexOf("Paste data") === -1, "paste card must be absent without onTextPaste");
});

test("autoDetect + exampleSummary renders the prominent sample banner", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
    autoDetect: true,
    onLoadExample: noop,
    exampleSummary: {
      icon: "🌱",
      title: "Plant biomass under drought & salt",
      subtitle: "3 genotypes × 3 treatments × 8 replicates · 72 rows",
      buttonLabel: "Plot this example →",
    },
  });
  assert(html.indexOf("sample-promo") !== -1, "banner test-id should be present");
  assert(
    html.indexOf("Plant biomass under drought") !== -1,
    "banner should render the structured title"
  );
  assert(html.indexOf("3 genotypes") !== -1, "banner should render the structured subtitle");
  assert(html.indexOf("Plot this example") !== -1, "banner should use the custom button label");
  // Should NOT render a redundant bottom 'Try sample data:' affordance.
  assert(
    html.indexOf("Try sample data:") === -1,
    "buried bottom-of-card affordance must not coexist with the banner"
  );
});

test("autoDetect promotes the sample CTA when only the legacy exampleLabel is provided", function () {
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
    autoDetect: true,
    onLoadExample: noop,
    exampleLabel: "Generic legacy label string",
  });
  assert(html.indexOf("sample-promo") !== -1, "fallback banner should still render");
  assert(
    html.indexOf("Try a sample dataset") !== -1,
    "fallback title should be used when exampleSummary is absent"
  );
  assert(
    html.indexOf("Generic legacy label string") !== -1,
    "legacy exampleLabel string should surface as the subtitle"
  );
});

test("legacy (non-autoDetect) mode keeps the buried sample button", function () {
  // Sanity check that the 7 other tools' existing behaviour is untouched.
  const html = renderHtml(sc.UploadPanel, {
    sepOverride: ",",
    onSepChange: noop,
    onFileLoad: noop,
    onLoadExample: noop,
    exampleLabel: "Load example →",
  });
  assert(html.indexOf("sample-promo") === -1, "legacy mode must not surface the new banner");
  assert(
    html.indexOf("Try sample data:") !== -1,
    "legacy mode keeps the original caption + button affordance"
  );
});

suite("DatasheetIcon");

test("renders an SVG at the given size with the dog-ear path", function () {
  const html = renderHtml(sc.DatasheetIcon, { size: 36 });
  assert(html.indexOf("<svg") !== -1, "should render an SVG element");
  assert(html.indexOf('width="36"') !== -1, "should honor size prop on width");
  assert(html.indexOf('height="36"') !== -1, "should honor size prop on height");
  // The dog-ear corner path is the visual hook that says "this is paper,
  // not a generic rectangle" — assert it survives any future refactor.
  assert(html.indexOf("M29 6 L29 14 L37 14") !== -1, "should draw the dog-ear fold path");
});

test("defaults to a 36 px box when size is omitted", function () {
  const html = renderHtml(sc.DatasheetIcon, {});
  assert(html.indexOf('width="36"') !== -1, "default width should be 36");
});

suite("DetectedSeparatorBadge");

test("renders nothing when sep is empty", function () {
  const html = renderHtml(sc.DetectedSeparatorBadge, { sep: "" });
  eq(html, "");
});

test("labels each known separator with a human-readable word", function () {
  const cases = {
    ",": "comma",
    ";": "semicolon",
    "\t": "tab",
    " ": "space",
  };
  for (const sep of Object.keys(cases)) {
    const html = renderHtml(sc.DetectedSeparatorBadge, { sep });
    assert(
      html.indexOf("detected:") !== -1,
      `should render the 'detected:' prefix for ${JSON.stringify(sep)}`
    );
    assert(
      html.indexOf(cases[sep]) !== -1,
      `should label ${JSON.stringify(sep)} as '${cases[sep]}'`
    );
  }
});

test("falls back to 'whitespace' for unrecognised separators", function () {
  const html = renderHtml(sc.DetectedSeparatorBadge, { sep: "|" });
  assert(html.indexOf("whitespace") !== -1, "unknown sep should fall back to whitespace label");
});

suite("ActionsPanel");

test("renders with download and reset", function () {
  const html = renderHtml(sc.ActionsPanel, { onDownloadSvg: noop, onReset: noop });
  assert(html.length > 0, "should render");
});

test("renders with extra downloads", function () {
  const html = renderHtml(sc.ActionsPanel, {
    onDownloadSvg: noop,
    onDownloadPng: noop,
    onReset: noop,
    extraDownloads: [{ label: "CSV", onClick: noop }],
  });
  assert(html.includes("CSV"), "should label the extra download");
});

suite("ColumnRoleEditor");

test("renders column role dropdowns", function () {
  const html = renderHtml(sc.ColumnRoleEditor, {
    headers: ["Group", "Value", "Filter"],
    rows: [
      ["A", "1", "x"],
      ["B", "2", "y"],
    ],
    colRoles: ["group", "value", "filter"],
    colNames: ["Group", "Value", "Filter"],
    onRoleChange: noop,
    onNameChange: noop,
  });
  assert(html.length > 0, "should render");
});

suite("FilterCheckboxPanel");

test("renders filter checkboxes", function () {
  const html = renderHtml(sc.FilterCheckboxPanel, {
    headers: ["Grp", "Val"],
    colNames: ["Grp", "Val"],
    colRoles: ["group", "value"],
    filters: {
      0: { unique: ["A", "B"], included: new Set(["A", "B"]) },
      1: { unique: ["1", "2"], included: new Set(["1", "2"]) },
    },
    filteredCount: 2,
    totalCount: 2,
    onToggle: noop,
    onToggleAll: noop,
  });
  assert(html.length > 0, "should render");
});

suite("RenameReorderPanel");

test("renders rename inputs and drag handles", function () {
  const html = renderHtml(sc.RenameReorderPanel, {
    headers: ["Grp", "Facet"],
    colNames: ["Group", "Facet"],
    colRoles: ["group", "filter"],
    filters: {
      0: { unique: ["A", "B"], included: new Set(["A", "B"]) },
      1: { unique: ["X", "Y"], included: new Set(["X", "Y"]) },
    },
    valueRenames: {},
    orderableCols: {
      0: { order: ["A", "B"], onReorder: noop },
      1: { order: ["X", "Y"], onReorder: noop },
    },
    applyRename: function (i, v) {
      return v;
    },
    onRenameVal: noop,
    dragState: null,
    onDragStart: noop,
    onDragEnd: noop,
  });
  assert(html.length > 0, "should render");
});

suite("StatsTable");

test("returns null for empty stats", function () {
  const html = renderHtml(sc.StatsTable, { stats: [], groupLabel: "Treatment" });
  eq(html, "");
});

test("renders table with stats rows", function () {
  const html = renderHtml(sc.StatsTable, {
    stats: [
      { name: "Control", n: 10, mean: 5.5, median: 5.0, sd: 1.2, sem: 0.38, min: 3, max: 8 },
      { name: "Treatment", n: 10, mean: 7.2, median: 7.0, sd: 1.5, sem: 0.47, min: 4, max: 10 },
    ],
    groupLabel: "Condition",
  });
  assert(html.length > 0, "should render");
  assert(tagCount(html) > 10, "table should have many elements");
  assert(html.includes("Control"), "should include first row name");
  assert(html.includes("Treatment"), "should include second row name");
});

suite("GroupColorEditor");

test("renders color pickers per group", function () {
  const html = renderHtml(sc.GroupColorEditor, {
    groups: [
      { name: "A", color: "#648FFF", stats: { n: 5 } },
      { name: "B", color: "#DC267F", stats: { n: 3 } },
    ],
    onColorChange: noop,
  });
  assert(rootChildCount(html) === 2, "should have 2 group rows");
});

suite("BaseStyleControls");

test("renders background and grid controls", function () {
  const html = renderHtml(sc.BaseStyleControls, {
    plotBg: "#ffffff",
    onPlotBgChange: noop,
    showGrid: true,
    onShowGridChange: noop,
    gridColor: "#e0e0e0",
    onGridColorChange: noop,
  });
  // bg + grid toggle + grid color
  assert(rootChildCount(html) === 3, "bg + grid toggle + grid color");
});

test("hides grid color when grid is off", function () {
  const html = renderHtml(sc.BaseStyleControls, {
    plotBg: "#ffffff",
    onPlotBgChange: noop,
    showGrid: false,
    onShowGridChange: noop,
    gridColor: "#e0e0e0",
    onGridColorChange: noop,
  });
  // only bg + grid toggle
  assert(rootChildCount(html) === 2, "only bg + grid toggle");
});

suite("ColorInput");

test("renders color picker and text input", function () {
  const html = renderHtml(sc.ColorInput, { value: "#648FFF", onChange: noop });
  // color input + text input
  const root = rootEl(html);
  const inputs = root ? root.querySelectorAll("input") : [];
  assert(inputs.length === 2, "color input + text input");
});

suite("FileDropZone");

test("renders drop zone", function () {
  const html = renderHtml(sc.FileDropZone, { onFileLoad: noop });
  assert(html.length > 0, "should render");
});

// ════════════════════════════════════════════════════════════════════════════
//  Chart components (compiled tool .js files)
// ════════════════════════════════════════════════════════════════════════════

// ── BoxplotChart ────────────────────────────────────────────────────────────

suite("BoxplotChart");

(function () {
  const tool = loadTool("boxplot");
  const BoxplotChart = tool.exports.BoxplotChart;

  const sampleGroups = [
    {
      name: "Control",
      color: "#648FFF",
      allValues: [3, 5, 7, 9, 11],
      stats: { q1: 4, med: 7, q3: 10, wLo: 3, wHi: 11 },
      sources: [{ colIndex: 0, values: [3, 5, 7, 9, 11], category: null }],
    },
    {
      name: "Treatment",
      color: "#DC267F",
      allValues: [6, 8, 10, 12, 14],
      stats: { q1: 7, med: 10, q3: 13, wLo: 6, wHi: 14 },
      sources: [{ colIndex: 0, values: [6, 8, 10, 12, 14], category: null }],
    },
  ];

  test("renders SVG with valid groups", function () {
    const html = renderHtml(BoxplotChart, {
      groups: sampleGroups,
      yLabel: "Value",
      plotTitle: "Test",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      boxWidth: 60,
      boxFillOpacity: 0.3,
      pointSize: 3,
      showPoints: true,
      jitterWidth: 0.4,
      pointOpacity: 0.6,
      xLabelAngle: 0,
      categoryColors: {},
      colorByCol: -1,
      boxGap: 0,
      svgLegend: [],
      showCompPie: false,
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
    assert(tagCount(html) > 10, "should produce a complex tree");
  });

  test("returns null for empty groups", function () {
    const html = renderHtml(BoxplotChart, {
      groups: [{ name: "Empty", color: "#648FFF", allValues: [], stats: null, sources: [] }],
      yLabel: "Y",
      plotTitle: "",
      plotBg: "#fff",
      showGrid: false,
      gridColor: "#eee",
      boxWidth: 60,
      boxFillOpacity: 0.3,
      pointSize: 3,
      showPoints: false,
      jitterWidth: 0,
      pointOpacity: 0.6,
      xLabelAngle: 0,
      categoryColors: {},
      colorByCol: -1,
      boxGap: 0,
      svgLegend: [],
      showCompPie: false,
    });
    eq(html, "", "empty data should return null");
  });

  test("renders with points hidden", function () {
    const html = renderHtml(BoxplotChart, {
      groups: sampleGroups,
      yLabel: "Value",
      plotTitle: "",
      plotBg: "#fff",
      showGrid: false,
      gridColor: "#eee",
      boxWidth: 80,
      boxFillOpacity: 0.5,
      pointSize: 3,
      showPoints: false,
      jitterWidth: 0,
      pointOpacity: 0.6,
      xLabelAngle: 45,
      categoryColors: {},
      colorByCol: -1,
      boxGap: 10,
      svgLegend: [],
      showCompPie: false,
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
  });
})();

// ── BoxplotChart (bar mode) ─────────────────────────────────────────────────

suite("BoxplotChart (bar mode)");

(function () {
  const tool = loadTool("boxplot");
  const BoxplotChart = tool.exports.BoxplotChart;

  const sampleGroups = [
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

  test("renders SVG bar chart via plotStyle='bar'", function () {
    const html = renderHtml(BoxplotChart, {
      groups: sampleGroups,
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
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
    assert(tagCount(html) > 10, "should produce many elements");
  });

  test("renders with no points and SD error bars", function () {
    const html = renderHtml(BoxplotChart, {
      groups: sampleGroups,
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
    });
    assert(html.length > 0, "should render");
  });
})();

// ── ScatterChart ────────────────────────────────────────────────────────────

suite("ScatterChart");

(function () {
  const tool = loadTool("scatter");
  const ScatterChart = tool.exports.ScatterChart;

  const sampleData = [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
    { x: 5, y: 6 },
    { x: 7, y: 8 },
  ];
  const rawData = [
    ["1", "2", "A"],
    ["3", "4", "B"],
    ["5", "6", "A"],
    ["7", "8", "B"],
  ];

  test("renders SVG scatter plot", function () {
    const html = renderHtml(ScatterChart, {
      data: sampleData,
      rawData: rawData,
      xCol: 0,
      yCol: 1,
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xLabel: "X",
      yLabel: "Y",
      title: "Scatter Test",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      refLines: [],
      pointColor: "#648FFF",
      pointSize: 4,
      pointOpacity: 0.7,
      strokeColor: "#333",
      strokeWidth: 0.5,
      colorMapCol: -1,
      colorMapType: "discrete",
      colorMapPalette: "viridis",
      colorMapDiscrete: {},
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
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
    assert(tagCount(html) > 5, "should have points and axes");
  });

  test("renders with color mapping", function () {
    const html = renderHtml(ScatterChart, {
      data: sampleData,
      rawData: rawData,
      xCol: 0,
      yCol: 1,
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xLabel: "X",
      yLabel: "Y",
      title: "",
      plotBg: "#fff",
      showGrid: false,
      gridColor: "#eee",
      refLines: [],
      pointColor: "#648FFF",
      pointSize: 5,
      pointOpacity: 0.8,
      strokeColor: "none",
      strokeWidth: 0,
      colorMapCol: 2,
      colorMapType: "discrete",
      colorMapPalette: "viridis",
      colorMapDiscrete: { A: "#648FFF", B: "#DC267F" },
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
    });
    assert(html.length > 0, "should render");
  });

  test("renders empty data without crashing", function () {
    const html = renderHtml(ScatterChart, {
      data: [],
      rawData: [],
      xCol: 0,
      yCol: 1,
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xLabel: "X",
      yLabel: "Y",
      title: "",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      refLines: [],
      pointColor: "#648FFF",
      pointSize: 4,
      pointOpacity: 0.7,
      strokeColor: "#333",
      strokeWidth: 0.5,
      colorMapCol: -1,
      colorMapType: "discrete",
      colorMapPalette: "viridis",
      colorMapDiscrete: {},
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
    });
    assert(html.length > 0, "should render even with no data");
  });
})();

// ── Aequorin Chart ──────────────────────────────────────────────────────────

suite("AequorinChart");

(function () {
  const tool = loadTool("aequorin");
  const Chart = tool.exports.Chart;

  const sampleSeries = [
    {
      name: "WT",
      color: "#648FFF",
      rows: [
        { t: 0, mean: 100, sd: 10 },
        { t: 1, mean: 200, sd: 20 },
        { t: 2, mean: 150, sd: 15 },
      ],
    },
    {
      name: "Mutant",
      color: "#DC267F",
      rows: [
        { t: 0, mean: 80, sd: 10 },
        { t: 1, mean: 120, sd: 20 },
        { t: 2, mean: 90, sd: 15 },
      ],
    },
  ];

  test("renders SVG line chart", function () {
    const html = renderHtml(Chart, {
      series: sampleSeries,
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
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
    assert(tagCount(html) > 10, "should produce a complex tree");
  });

  test("renders with empty series", function () {
    const html = renderHtml(Chart, {
      series: [],
      xStart: 0,
      xEnd: 10,
      yMin: 0,
      yMax: 100,
      vbW: 700,
      vbH: 450,
      xLabel: "X",
      yLabel: "Y",
      plotBg: "#fff",
      showGrid: false,
      lineWidth: 2,
      ribbonOpacity: 0.2,
      gridColor: "#eee",
      svgLegend: [],
      plotTitle: "",
      plotSubtitle: "",
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
  });
})();

// ── Line Plot Chart ─────────────────────────────────────────────────────────

suite("LineChart");

(function () {
  const tool = loadTool("lineplot");
  const Chart = tool.exports.Chart;

  const sampleSeries = [
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

  test("renders SVG line chart", function () {
    const html = renderHtml(Chart, {
      series: sampleSeries,
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
      svgLegend: [{ items: sampleSeries.map((s) => ({ label: s.name, color: s.color })) }],
      showStars: true,
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
    assert(tagCount(html) > 10, "should produce a complex tree");
  });

  test("renders with empty series", function () {
    const html = renderHtml(Chart, {
      series: [],
      perXStats: [],
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 1,
      vbW: 700,
      vbH: 440,
      xLabel: "X",
      yLabel: "Y",
      plotTitle: "",
      plotSubtitle: "",
      plotBg: "#ffffff",
      showGrid: false,
      gridColor: "#e0e0e0",
      lineWidth: 1.5,
      pointRadius: 3.5,
      errorStrokeWidth: 1,
      errorCapWidth: 6,
      errorType: "sem",
      svgLegend: [],
      showStars: false,
    });
    assert(html.startsWith("<svg"), "root should be an SVG");
  });
})();

// ════════════════════════════════════════════════════════════════════════════
//  StatsTile
// ════════════════════════════════════════════════════════════════════════════

suite("StatsTile");

test("renders null when fewer than 2 valid groups", function () {
  const html = renderHtml(sc.StatsTile, {
    groups: [{ name: "only", values: [1, 2, 3, 4, 5] }],
    onAnnotationsChange: noop,
  });
  assert(html === "", "k<2 should return null");
});

test("collapsed header-only render when defaultOpen is false", function () {
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "A", values: [1, 2, 3, 4, 5, 6, 7, 8] },
      { name: "B", values: [2, 3, 4, 5, 6, 7, 8, 9] },
    ],
    onAnnotationsChange: noop,
  });
  // StatsTile returns a Fragment of two tiles (display + summary). With
  // renderToStaticMarkup the Fragment lays its children out in sequence
  // so the rendered HTML covers both tiles' content even when the inner
  // disclosure is collapsed.
  assert(html.length > 0, "should render");
  assert(html.includes("Display"), "display tile present");
});

test("open render on k=2 shows assumption + test sections", function () {
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "A", values: [4.9, 5.1, 5.0, 5.2, 4.8, 5.1, 4.9, 5.0, 5.2, 4.9] },
      { name: "B", values: [5.9, 6.1, 6.0, 6.2, 5.8, 6.1, 5.9, 6.0, 6.2, 5.9] },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(html.length > 0, "should render");
  assert(tagCount(html) > 30, "open tile should produce many elements");
  assert(html.includes("Assumptions"), "should include the Assumptions subhead");
  assert(html.includes("Test"), "should include the Test subhead");
});

test("sub-options are disabled when 'Display on plot' is off (k=2)", function () {
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "A", values: [1, 2, 3, 4, 5, 6, 7, 8] },
      { name: "B", values: [2, 3, 4, 5, 6, 7, 8, 9] },
    ],
    onAnnotationsChange: noop,
    onStatsSummaryChange: noop,
  });
  assert(
    html.indexOf("Print summary below plot") >= 0,
    "display-tile should expose 'Print summary below plot'"
  );
  assert(html.indexOf("Display on plot") >= 0, "display-tile should expose 'Display on plot'");
  assert(html.indexOf("Show ns") >= 0, "display-tile should always render 'Show ns'");
  // Default showOnPlot=false, so both "Print summary below plot" and "Show ns"
  // must be disabled (no style radios for k=2).
  const notAllowedCount = (html.match(/not-allowed/g) || []).length;
  assert(notAllowedCount === 2, "expected 2 disabled controls for k=2, got " + notAllowedCount);
});

test("Show ns + Style radios + Print summary all disabled when display is off (k>2)", function () {
  // k=3 → default annotKind is 'cld'. With showOnPlot=false by default,
  // every sub-option of "Display on plot" should be disabled: Print summary,
  // both Style radios, and Show ns (which is also independently disabled in CLD).
  const pgCtrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
  const pgTrt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
  const pgTrt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "ctrl", values: pgCtrl },
      { name: "trt1", values: pgTrt1 },
      { name: "trt2", values: pgTrt2 },
    ],
    onAnnotationsChange: noop,
  });
  assert(html.indexOf("Show ns") >= 0, "display-tile should always render 'Show ns'");
  assert(html.indexOf("Letters") >= 0, "Style toggle should render 'Letters' for k>2");
  assert(html.indexOf("Brackets") >= 0, "Style toggle should render 'Brackets' for k>2");
  // 4 disabled controls: Print summary + Letters button + Brackets button + Show ns.
  const notAllowedCount = (html.match(/not-allowed/g) || []).length;
  assert(notAllowedCount === 4, "expected 4 disabled controls for k>2, got " + notAllowedCount);
});

test("open render on k=3 shows post-hoc table", function () {
  const pgCtrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
  const pgTrt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
  const pgTrt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "ctrl", values: pgCtrl },
      { name: "trt1", values: pgTrt1 },
      { name: "trt2", values: pgTrt2 },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(html.length > 0, "should render");
  // PlantGrowth → k=3, so rendered tree should contain 3 post-hoc rows.
  assert(html.indexOf("Post-hoc") >= 0, "should include Post-hoc heading");
  assert(html.indexOf("ctrl vs trt1") >= 0, "should list ctrl vs trt1 pair");
  assert(html.indexOf("ctrl vs trt2") >= 0, "should list ctrl vs trt2 pair");
  assert(html.indexOf("trt1 vs trt2") >= 0, "should list trt1 vs trt2 pair");
});

test("non-normal data — suggestion pill + Use suggestion button render (k=2)", function () {
  // Heavy-skewed data → selectTest (Welch by default) attaches a
  // `suggestion` field naming Mann-Whitney. The tile must surface it.
  const skewedA = [0.1, 0.2, 0.3, 0.4, 0.5, 0.8, 1.5, 3.0, 6.0, 12.0, 25.0];
  const skewedB = [0.2, 0.3, 0.4, 0.6, 0.9, 1.2, 2.0, 4.0, 8.0, 15.0, 30.0];
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "A", values: skewedA },
      { name: "B", values: skewedB },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(html.indexOf("Suggested alternative") >= 0, "should render the Suggestion banner");
  assert(html.indexOf("Use suggestion") >= 0, "should render the Use-suggestion button");
  assert(html.indexOf("Mann-Whitney U") >= 0, "should name Mann-Whitney as the suggested test");
});

test("non-normal data — suggestion pill names Kruskal-Wallis (k=3)", function () {
  // Three groups with one extreme outlier each → SW flags non-normal in
  // every group; selectTest still recommends Welch ANOVA but adds a
  // Kruskal-Wallis suggestion.
  const skA = [1, 1, 1, 1, 1, 1, 1, 1, 1, 20];
  const skB = [2, 2, 2, 2, 2, 2, 2, 2, 2, 25];
  const skC = [3, 3, 3, 3, 3, 3, 3, 3, 3, 30];
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "A", values: skA },
      { name: "B", values: skB },
      { name: "C", values: skC },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(html.indexOf("Suggested alternative") >= 0, "should render the Suggestion banner");
  assert(html.indexOf("Kruskal-Wallis") >= 0, "should name Kruskal-Wallis as the suggested test");
});

test("normal data — no suggestion banner (k=2)", function () {
  const normA = [4.9, 5.1, 5.0, 5.2, 4.8, 5.1, 4.9, 5.0, 5.2, 4.9];
  const normB = [5.9, 6.1, 6.0, 6.2, 5.8, 6.1, 5.9, 6.0, 6.2, 5.9];
  const html = renderHtml(sc.StatsTile, {
    groups: [
      { name: "A", values: normA },
      { name: "B", values: normB },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(
    html.indexOf("Suggested alternative") === -1,
    "should not render the Suggestion banner on normal data"
  );
});

// ════════════════════════════════════════════════════════════════════════════
//  assignBracketLevels — stacking layout for overlapping significance pairs
// ════════════════════════════════════════════════════════════════════════════

suite("assignBracketLevels");

test("non-overlapping pairs share level 0", function () {
  const out = sc.assignBracketLevels([
    { i: 0, j: 1 },
    { i: 2, j: 3 },
  ]);
  eq(out[0]._level, 0);
  eq(out[1]._level, 0);
});

test("overlapping pairs stack to higher levels", function () {
  const out = sc.assignBracketLevels([
    { i: 0, j: 2 },
    { i: 1, j: 3 },
  ]);
  // Both span across the middle so one must sit above the other.
  const levels = [out[0]._level, out[1]._level].sort();
  eq(levels[0], 0);
  eq(levels[1], 1);
});

test("preserves original pair order", function () {
  const out = sc.assignBracketLevels([
    { i: 0, j: 1, label: "a" },
    { i: 2, j: 3, label: "b" },
    { i: 0, j: 3, label: "c" },
  ]);
  eq(out[0].label, "a");
  eq(out[1].label, "b");
  eq(out[2].label, "c");
});

// ════════════════════════════════════════════════════════════════════════════
//  Effect / context smoke tests — exercised against real React via
//  `renderWithEffects`. The previous bespoke mock had its own queue
//  for useEffect / useLayoutEffect; under real React 18 + happy-dom we
//  just mount the component and let `act()` flush effects.
// ════════════════════════════════════════════════════════════════════════════

suite("Real React: useEffect runs after mount");

test("useEffect callback is invoked after render", function () {
  let effectRan = false;
  function Subscriber() {
    React.useEffect(function () {
      effectRan = true;
    }, []);
    return React.createElement("div", null);
  }
  renderWithEffects(Subscriber, {});
  assert(effectRan, "useEffect body must execute after mount");
});

test("useLayoutEffect runs alongside useEffect", function () {
  const sequence = [];
  function C() {
    React.useEffect(function () {
      sequence.push("effect");
    });
    React.useLayoutEffect(function () {
      sequence.push("layout");
    });
    return React.createElement("div", null);
  }
  renderWithEffects(C, {});
  assert(sequence.includes("effect"), "useEffect ran");
  assert(sequence.includes("layout"), "useLayoutEffect ran");
});

test("useEffect can attach to `document` without crashing happy-dom", function () {
  // Mirrors the real-world pattern that PrefsPanel and theme.js rely on —
  // a global `mousedown` / `keydown` listener attached from an effect.
  // happy-dom must accept addEventListener / removeEventListener.
  function DocListener() {
    React.useEffect(function () {
      const handler = function () {};
      document.addEventListener("mousedown", handler);
      return function () {
        document.removeEventListener("mousedown", handler);
      };
    }, []);
    return React.createElement("div", null);
  }
  let thrown = null;
  try {
    renderWithEffects(DocListener, {});
  } catch (err) {
    thrown = err;
  }
  assert(thrown == null, "effect using document.addEventListener must not throw");
});

suite("Real React: createContext / useContext");

test("createContext returns a context object with Provider and Consumer", function () {
  const Ctx = React.createContext("default-value");
  assert(Ctx.Provider != null, "Provider exists");
  assert(Ctx.Consumer != null, "Consumer exists");
});

test("useContext returns the default value when no Provider is mounted", function () {
  let captured = null;
  const Theme = React.createContext("light");
  function Reader() {
    captured = React.useContext(Theme);
    return React.createElement("span", null, captured);
  }
  renderWithEffects(Reader, {});
  assert(captured === "light", "useContext returns default outside any Provider");
});

// ── VolcanoChart raster / vector mode ──────────────────────────────────────
//
// The volcano data layer rasterises to an off-screen canvas above
// POINT_RASTERIZE_THRESHOLD = 1000 points to keep the live DOM small at
// transcriptomics scale. SVG downloads stay vector-perfect: the chart
// registers an SVG export mutator that swaps the raster <image> for
// vector <circle>s in the export clone. Both paths exercised below.

// ── HeatmapChart raster (live) ↔ vector / high-density raster (export) ────
//
// Heatmap cells always rasterise on screen (per-cell <rect> scaled past
// ~20k cells in browsers). The export mutator branches by total cell
// count: ≤ CELL_VECTOR_EXPORT_LIMIT (2,000) becomes vector <rect>s for
// infinitely-scalable journal SVGs; above stays raster but at the
// higher EXPORT density (~4× DPR) so PNGs still survive print zoom.

suite("HeatmapChart (raster ↔ vector / high-density export)");

(function () {
  const tool = loadTool("heatmap");
  const HeatmapChart = tool.exports.HeatmapChart;

  // Canvas stubs are installed once at the top of the volcano suite
  // (HTMLCanvasElement.prototype is a single realm-level object — both
  // suites share it). The shared stub covers fillRect / strokeRect /
  // setTransform / etc., enough for both the volcano and heatmap paint
  // paths under happy-dom.

  // Build a small matrix of the requested dimensions. Values are
  // deterministic and span the [0, 1] range so the palette mapping
  // produces real colour strings.
  function buildMatrix(rows, cols) {
    const m = new Array(rows);
    for (let r = 0; r < rows; r++) {
      m[r] = new Array(cols);
      for (let c = 0; c < cols; c++) {
        m[r][c] = ((r * cols + c) % 100) / 100;
      }
    }
    return m;
  }

  function baseProps(rows, cols) {
    return {
      rowLabels: Array.from({ length: rows }, (_, i) => "r" + i),
      colLabels: Array.from({ length: cols }, (_, i) => "c" + i),
      matrix: buildMatrix(rows, cols),
      rowOrder: Array.from({ length: rows }, (_, i) => i),
      colOrder: Array.from({ length: cols }, (_, i) => i),
      rowCluster: null,
      colCluster: null,
      vmin: 0,
      vmax: 1,
      palette: "viridis",
      cellBorder: { on: false, color: "#000000", width: 0.5 },
      showRowLabels: true,
      showColLabels: true,
      showRowDendrogram: false,
      showColDendrogram: false,
    };
  }

  test("≤ 2,000 cells: export mutator replaces <image> with one <rect> per cell", function () {
    const props = baseProps(20, 20); // 400 cells, under the limit
    const { container } = renderWithEffects(HeatmapChart, props);
    const svg = container.querySelector("svg");
    assert(svg != null, "svg mounted");
    // Live DOM: rasterised <image> (heatmap always rasterises live).
    const liveImage = svg.querySelector("#cells image");
    assert(liveImage != null, "live <image> present");

    const clone = globalThis.buildExportSvg(svg);
    const cloneCells = clone.querySelector("#cells");
    assert(cloneCells != null, "cells group preserved in export clone");
    assert(
      cloneCells.querySelector("image") == null,
      "raster <image> removed for sub-threshold vector export"
    );
    const rects = cloneCells.querySelectorAll("rect");
    eq(rects.length, 400);
    // Live SVG stays rasterised — mutator only mutates the clone.
    assert(svg.querySelector("#cells image") != null, "live <image> untouched");
  });

  test("> 2,000 cells: export mutator keeps <image> (raster path, no vector rects)", function () {
    const props = baseProps(60, 60); // 3,600 cells, above the limit
    const { container } = renderWithEffects(HeatmapChart, props);
    const svg = container.querySelector("svg");
    const liveImage = svg.querySelector("#cells image");
    assert(liveImage != null, "live <image> present");

    const clone = globalThis.buildExportSvg(svg);
    const cloneCells = clone.querySelector("#cells");
    const cloneImage = cloneCells.querySelector(":scope > image");
    assert(cloneImage != null, "export keeps an <image> above the vector limit");
    eq(cloneCells.querySelectorAll("rect").length, 0);
    // The mutator runs `image.setAttribute("href", ...)` from a freshly
    // painted canvas at EXPORT density. happy-dom's stub returns a
    // fixed dataURL marker so both the live and export hrefs are
    // strings; in a real browser the export href would encode a
    // higher-DPR raster of the same cells.
    eq(typeof cloneImage.getAttribute("href"), "string");
    assert(
      cloneImage.getAttribute("href").startsWith("data:image/png"),
      "export image href is a PNG data URL"
    );
  });

  test("borders ON: vector path emits stroke attributes per cell", function () {
    const props = {
      ...baseProps(10, 10),
      cellBorder: { on: true, color: "#222222", width: 1 },
    };
    const { container } = renderWithEffects(HeatmapChart, props);
    const svg = container.querySelector("svg");
    const clone = globalThis.buildExportSvg(svg);
    const rects = clone.querySelectorAll("#cells rect");
    assert(rects.length === 100, "100 vector rects (10×10)");
    const first = rects[0];
    eq(first.getAttribute("stroke"), "#222222");
    eq(first.getAttribute("stroke-width"), "1");
  });

  // Strict SVG-1.1 renderers (Inkscape ≤ 0.92, macOS Preview / Quick
  // Look, several image-library pipelines) only accept SVG-spec paint
  // values in `fill` / `stroke`: a hex / named colour, `none`, or a
  // `url(#...)` paint server. CSS keywords like `transparent`, an
  // unset attribute (defaults to `black`), or a `var(--…)` reference
  // (no CSS context outside the browser) all render as solid black —
  // which historically painted a giant black overlay over volcano
  // exports above the rasterise threshold (commit 894911c).
  //
  // The property below is the standing contract for every export
  // clone: every `<rect>` must carry a paint Inkscape can parse. The
  // test sweeps the four heatmap configurations that exercise the
  // distinct rect-producing code paths.
  function isInkscapeSafePaint(value) {
    if (value == null) return false;
    const v = String(value).trim();
    if (v === "none") return true;
    // Hex literal — short (#rgb) or long (#rrggbb / #rrggbbaa).
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(v)) return true;
    // url(#id) paint-server reference.
    if (/^url\(#[^)]+\)$/.test(v)) return true;
    return false;
  }

  function auditRects(clone, label) {
    const offenders = [];
    clone.querySelectorAll("rect").forEach((r) => {
      const fill = r.getAttribute("fill");
      const stroke = r.getAttribute("stroke");
      // Fill MUST be set and Inkscape-safe (a missing fill defaults to
      // black in SVG, which is exactly the regression we're guarding
      // against). Stroke is optional — only audited when present.
      if (!isInkscapeSafePaint(fill)) {
        offenders.push(
          `fill=${JSON.stringify(fill)} on rect at (${r.getAttribute("x")},${r.getAttribute("y")})`
        );
      }
      if (stroke != null && stroke !== "" && !isInkscapeSafePaint(stroke)) {
        offenders.push(
          `stroke=${JSON.stringify(stroke)} on rect at (${r.getAttribute("x")},${r.getAttribute("y")})`
        );
      }
    });
    if (offenders.length > 0) {
      throw new Error(
        `${label}: ${offenders.length} Inkscape-unsafe rect(s):\n  ${offenders.join("\n  ")}`
      );
    }
  }

  test("Inkscape audit: every export rect has a spec-valid paint (vector path)", function () {
    // Small heatmap with NaN cells (exercises NAN_FILL) and clustering
    // OFF — runs the vector-export path.
    const matrix = buildMatrix(15, 15);
    matrix[3][7] = NaN;
    matrix[10][2] = NaN;
    const props = {
      ...baseProps(15, 15),
      matrix,
      cellBorder: { on: true, color: "#333333", width: 0.5 },
    };
    const { container } = renderWithEffects(HeatmapChart, props);
    const svg = container.querySelector("svg");
    const clone = globalThis.buildExportSvg(svg);
    auditRects(clone, "vector path");
    // Sanity: NaN cells got the NAN_FILL hex (#e0e0e0).
    const rects = Array.from(clone.querySelectorAll("#cells rect"));
    const greyCount = rects.filter((r) => r.getAttribute("fill") === "#e0e0e0").length;
    eq(greyCount, 2);
  });

  test("Inkscape audit: every export rect has a spec-valid paint (raster path, > 2k cells)", function () {
    const props = baseProps(60, 60); // 3,600 cells — raster path
    const { container } = renderWithEffects(HeatmapChart, props);
    const svg = container.querySelector("svg");
    const clone = globalThis.buildExportSvg(svg);
    auditRects(clone, "raster path");
  });
})();

suite("VolcanoChart (raster ↔ vector export)");

(function () {
  const tool = loadTool("volcano");
  const VolcanoChart = tool.exports.VolcanoChart;

  // happy-dom's canvas stub returns an empty string from toDataURL,
  // which would skip the live <image> render (it's gated on a truthy
  // href). Stub a stable fake dataURL so the rasterise path is fully
  // exercised. The byte content doesn't matter — we only assert on
  // the <image> element's presence + the export-clone substitution.
  const origCanvasGetContext = HTMLCanvasElement.prototype.getContext;
  const origCanvasToDataURL = HTMLCanvasElement.prototype.toDataURL;
  // Union of the canvas 2D methods volcano + heatmap painting touch —
  // both suites share the same realm's HTMLCanvasElement.prototype so
  // whoever installs last wins; keep the API surface complete.
  const stubCtx = {
    setTransform() {},
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    fillRect() {},
    strokeRect() {},
    set globalAlpha(_v) {},
    set fillStyle(_v) {},
    set strokeStyle(_v) {},
    set lineWidth(_v) {},
  };
  HTMLCanvasElement.prototype.getContext = function () {
    return stubCtx;
  };
  HTMLCanvasElement.prototype.toDataURL = function () {
    return "data:image/png;base64,iVBORw0KGgo=";
  };
  // Restore after the suite — best-effort, the cache won't reuse the
  // canvas across files.
  void origCanvasGetContext;
  void origCanvasToDataURL;

  const baseProps = {
    pFloor: 1e-300,
    fcCutoff: 1,
    pCutoff: 0.05,
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    xLabel: "log2 fold change",
    yLabel: "-log10 p",
    title: "Volcano Test",
    subtitle: "",
    colors: { up: "#dc2626", down: "#2563eb", ns: "#9ca3af" },
    pointRadius: 3,
    pointAlpha: 0.7,
    showRefLines: true,
    showLabels: false,
    topNUp: 0,
    topNDown: 0,
    labelFontSize: 10,
    showAxes: true,
    plotBg: "#fff",
  };

  // Synthetic point cloud — count controls whether raster / vector path
  // is exercised. Mix of up/down/ns by spread on log2fc + p.
  function buildPoints(n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      // Spread log2fc in [-3, 3] and p in (0, 1] deterministically.
      const t = i / Math.max(1, n - 1);
      out[i] = {
        idx: i,
        log2fc: -3 + 6 * t,
        p: 0.001 + (1 - 0.001) * (1 - Math.abs(2 * t - 1)),
        label: null,
      };
    }
    return out;
  }

  test("below threshold: data-points contains vector circles (live + export)", function () {
    const points = buildPoints(200);
    const html = renderHtml(VolcanoChart, { ...baseProps, points });
    // Vector path: each point becomes a <circle> in the live DOM.
    const circles = (html.match(/<circle\b/g) || []).length;
    assert(circles >= 200, `expected ≥ 200 <circle>, got ${circles}`);
    assert(!html.includes("<image"), "no <image> tag in vector path");
  });

  test("above threshold: live DOM uses <image>, export clone has vector circles", function () {
    const points = buildPoints(1500);
    const { container } = renderWithEffects(VolcanoChart, { ...baseProps, points });
    const svg = container.querySelector("svg");
    assert(svg != null, "svg mounted");
    const dataPoints = svg.querySelector("#data-points");
    assert(dataPoints != null, "data-points group present");
    const liveImage = dataPoints.querySelector("image");
    assert(liveImage != null, "live raster <image> present above threshold");
    // The per-class groups are empty placeholders in raster mode.
    const liveCircles = dataPoints.querySelectorAll("circle");
    eq(liveCircles.length, 0);

    // Now run the export path. The chart registered an export mutator
    // in useEffect; buildExportSvg should swap the <image> for vector
    // <circle> elements built from the same render snapshot.
    const clone = globalThis.buildExportSvg(svg);
    const cloneDataPoints = clone.querySelector("#data-points");
    assert(cloneDataPoints != null, "clone preserves data-points group");
    assert(
      cloneDataPoints.querySelector("image") == null,
      "raster <image> removed from export clone"
    );
    const cloneCircles = cloneDataPoints.querySelectorAll("circle");
    assert(
      cloneCircles.length >= 1500,
      `expected ≥ 1500 <circle> in export clone, got ${cloneCircles.length}`
    );
    // Each significance class produces its own <g id="points-*">.
    assert(cloneDataPoints.querySelector("#points-ns") != null, "ns group rebuilt");
    assert(cloneDataPoints.querySelector("#points-up") != null, "up group rebuilt");
    assert(cloneDataPoints.querySelector("#points-down") != null, "down group rebuilt");
    // Live DOM stays rasterised — mutator only runs on the clone.
    assert(svg.querySelector("#data-points image") != null, "live <image> untouched");
  });

  // Same Inkscape-safety contract as the heatmap audit above — every
  // <rect> the export emits must carry an SVG-spec paint. Volcano has
  // the historical `fill="transparent"` regression (commit 894911c)
  // that motivated this whole property; pin it.
  function isInkscapeSafePaint(value) {
    if (value == null) return false;
    const v = String(value).trim();
    if (v === "none") return true;
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(v)) return true;
    if (/^url\(#[^)]+\)$/.test(v)) return true;
    return false;
  }
  function auditRects(clone, label) {
    const offenders = [];
    clone.querySelectorAll("rect").forEach((r) => {
      const fill = r.getAttribute("fill");
      const stroke = r.getAttribute("stroke");
      if (!isInkscapeSafePaint(fill)) {
        offenders.push(`fill=${JSON.stringify(fill)} on rect`);
      }
      if (stroke != null && stroke !== "" && !isInkscapeSafePaint(stroke)) {
        offenders.push(`stroke=${JSON.stringify(stroke)} on rect`);
      }
    });
    if (offenders.length > 0) {
      throw new Error(
        `${label}: ${offenders.length} Inkscape-unsafe rect(s):\n  ${offenders.join("\n  ")}`
      );
    }
  }

  test("Inkscape audit: every export rect has a spec-valid paint (raster path)", function () {
    const points = buildPoints(1500);
    const { container } = renderWithEffects(VolcanoChart, { ...baseProps, points });
    const svg = container.querySelector("svg");
    const clone = globalThis.buildExportSvg(svg);
    auditRects(clone, "volcano raster path");
  });

  test("Inkscape audit: every export rect has a spec-valid paint (vector path)", function () {
    const points = buildPoints(200);
    const { container } = renderWithEffects(VolcanoChart, { ...baseProps, points });
    const svg = container.querySelector("svg");
    const clone = globalThis.buildExportSvg(svg);
    auditRects(clone, "volcano vector path");
  });

  test("raster→vector transition unregisters the mutator on the live svg", function () {
    const points = buildPoints(1500);
    const { container, root } = renderWithEffects(VolcanoChart, { ...baseProps, points });
    const svg = container.querySelector("svg");
    // Above threshold, mutator should be registered → export clone is
    // mutated.
    let exported = globalThis.buildExportSvg(svg);
    assert(exported.querySelector("#data-points image") == null, "mutator active above threshold");

    // Re-render with fewer points (below threshold).
    React.act(() => {
      root.render(React.createElement(VolcanoChart, { ...baseProps, points: buildPoints(100) }));
    });
    const svg2 = container.querySelector("svg");
    assert(svg2.querySelector("#data-points image") == null, "live SVG vector below threshold");
    // The mutator effect cleanup ran → buildExportSvg now produces a
    // plain clone (no mutation). The clone's data-points layer should
    // already be vector because the live DOM is vector.
    exported = globalThis.buildExportSvg(svg2);
    assert(exported.querySelector("#data-points image") == null, "clone stays vector");
    assert(
      exported.querySelectorAll("#data-points circle").length > 0,
      "vector circles preserved in clone"
    );
  });
})();

summary();

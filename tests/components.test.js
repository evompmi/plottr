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

const { suite, test, assert, eq, approx, summary } = require("./harness");
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

suite("ChartDataTable");

test("renders a semantic table with scoped headers and values", function () {
  const html = renderHtml(sc.ChartDataTable, {
    summaryLabel: "Show values as table",
    caption: "Heatmap values",
    columnHeaders: ["Row", "S1", "S2"],
    rows: [
      { header: "TP53", cells: ["2.13", "-0.88"] },
      { header: "EGFR", cells: ["-1.04", "1.77"] },
    ],
    note: null,
  });
  assert(html.includes("<table"), "should render a table");
  assert(html.includes('scope="col"'), "column headers should carry scope=col");
  assert(html.includes('scope="row"'), "row headers should carry scope=row");
  assert(html.includes("TP53"), "should include a row header value");
  assert(html.includes("2.13"), "should include a data-cell value");
  assert(html.includes("Show values as table"), "should include the summary label");
});

test("shows a truncation note when provided", function () {
  const html = renderHtml(sc.ChartDataTable, {
    summaryLabel: "Show",
    caption: "cap",
    columnHeaders: ["A"],
    rows: [{ cells: ["1"] }],
    note: "Showing the first 1 of 999 rows.",
  });
  assert(html.includes("Showing the first 1 of 999 rows."), "truncation note should render");
  assert(html.includes('role="note"'), "note should have role=note");
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

  // ScatterChart indexes each row by column number (`row[xCol]`), so `data`
  // must be parsed rows (arrays), not {x,y} objects — the latter renders zero
  // points, which still passes a render-without-throwing assertion.
  const sampleData = [
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

  // AequorinChart reads `s.prefix` for the trace id / aria-label; a series
  // with only `name` renders `aria-label="Trace: undefined"`.
  const sampleSeries = [
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

  test("brush-enabled render exposes the crosshair affordance", function () {
    // When an onBrush handler is supplied (the main combined chart), the root
    // svg gains the crosshair cursor; without it (faceted mini-charts) the
    // render stays exactly as before. We can't drive the drag itself here —
    // it depends on getBoundingClientRect, which happy-dom stubs to zeros —
    // so this just pins that the affordance is wired to the prop.
    const base = {
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
    };
    const withBrush = renderHtml(Chart, { ...base, onBrush: () => {} });
    assert(withBrush.includes("crosshair"), "brush-enabled svg should carry the crosshair cursor");
    const withoutBrush = renderHtml(Chart, base);
    assert(
      !withoutBrush.includes("crosshair"),
      "non-interactive svg should not carry the crosshair cursor"
    );
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
      lineStyle: "solid",
      pointShape: "circle",
      pointFilled: true,
      points: [
        { x: 0, values: [0.05, 0.06, 0.05], n: 3, mean: 0.053, sd: 0.006, sem: 0.003, ci95: 0.014 },
        { x: 2, values: [0.18, 0.21, 0.19], n: 3, mean: 0.193, sd: 0.015, sem: 0.009, ci95: 0.038 },
        { x: 4, values: [0.55, 0.58, 0.61], n: 3, mean: 0.58, sd: 0.03, sem: 0.017, ci95: 0.075 },
      ],
    },
    {
      name: "mutant_A",
      color: "#DC267F",
      lineStyle: "dashed",
      pointShape: "triangle",
      pointFilled: false,
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
    // mutant_A is dashed + open triangle points; WT is solid + filled circle —
    // both must be reflected in the actual SVG output, not just accepted as
    // props (regression for the line-style / point-shape feature).
    assert(html.includes('id="trace-mutant_A"'), "mutant_A trace should render");
    const mutantTraceStart = html.indexOf('id="trace-mutant_A"');
    const mutantTraceTag = html.slice(mutantTraceStart - 40, mutantTraceStart + 200);
    assert(
      /stroke-dasharray/.test(mutantTraceTag),
      "dashed series should carry a stroke-dasharray attribute"
    );
    assert(html.includes('id="trace-WT"'), "WT trace should render");
    const wtTraceStart = html.indexOf('id="trace-WT"');
    const wtTraceTag = html.slice(wtTraceStart - 40, wtTraceStart + 200);
    assert(
      !/stroke-dasharray/.test(wtTraceTag),
      "solid series should not carry a stroke-dasharray attribute"
    );
    assert(html.includes("<polygon"), "triangle point shape should render as a polygon");
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

  // ── Outlier-skew: honest colourbar + alert + R export ────────────────

  function colorbarTicks(container) {
    return Array.from(container.querySelectorAll("#colorbar text")).map((t) => t.textContent);
  }

  test("colourbar ticks carry no ≥ / ≤ when the range covers every cell", function () {
    const { container } = renderWithEffects(HeatmapChart, baseProps(10, 10));
    eq(colorbarTicks(container), ["1.0", "0.50", "0"]);
  });

  test("colourbar marks a clipped scale with ≥ max / ≤ min + counts (survives export)", function () {
    // Cells are 0.00 … 0.99: 49 lie above 0.5, 10 below 0.1.
    const props = { ...baseProps(10, 10), vmin: 0.1, vmax: 0.5 };
    const { container } = renderWithEffects(HeatmapChart, props);
    const expected = ["≥ 0.50 (n=49)", "0.30", "≤ 0.10 (n=10)"];
    eq(colorbarTicks(container), expected);
    const clone = globalThis.buildExportSvg(container.querySelector("svg"));
    eq(
      Array.from(clone.querySelectorAll("#colorbar text")).map((t) => t.textContent),
      expected
    );
  });

  test("legend histogram draws beside the colourbar and survives export", function () {
    const props = { ...baseProps(10, 10), showLegendHistogram: true };
    const { container } = renderWithEffects(HeatmapChart, props);
    const bars = container.querySelectorAll("#colorbar-histogram rect");
    assert(bars.length >= 8, "one rect per non-empty bin");
    for (const r of bars) eq(r.getAttribute("fill"), "#9a9a9a");
    // Uniform 0–0.99 data → every band holds cells; the longest bar is full width.
    const widths = Array.from(bars).map((r) => Number(r.getAttribute("width")));
    eq(Math.max(...widths), 22);
    const clone = globalThis.buildExportSvg(container.querySelector("svg"));
    eq(clone.querySelectorAll("#colorbar-histogram rect").length, bars.length);
    // Tick labels move right past the histogram (bar 12 + gap 2 + hist 22 + 4).
    const bar = container.querySelector("#colorbar > rect");
    const tick = container.querySelector("#colorbar text");
    eq(Number(tick.getAttribute("x")) - Number(bar.getAttribute("x")), 40);
  });

  test("diverging palette, lopsided range: neutral colour at 0 and a 0 tick", function () {
    const props = {
      ...baseProps(10, 10),
      matrix: baseProps(10, 10).matrix.map((r) => r.map((v) => v * 10 - 2)), // −2 … 7.9
      vmin: -2,
      vmax: 8,
      palette: "rdbu",
    };
    const { container } = renderWithEffects(HeatmapChart, props);
    eq(colorbarTicks(container), ["8.0", "0", "-2.0"]);
    // The 0 tick sits 20 % up the bar (2 of the 10 units lie below 0).
    const bar = container.querySelector("#colorbar > rect");
    const zeroTick = container.querySelectorAll("#colorbar text")[1];
    const barY = Number(bar.getAttribute("y"));
    const barH = Number(bar.getAttribute("height"));
    approx(Number(zeroTick.getAttribute("y")) - 3, barY + barH * 0.8, 1e-9);
    // Gradient: an explicit palette-midpoint stop placed at 0's height.
    const offsets = Array.from(container.querySelectorAll("#colorbar stop")).map((st) =>
      st.getAttribute("offset")
    );
    assert(offsets.indexOf("20.00%") !== -1, "neutral stop at 20 %: " + offsets.join(","));
  });

  test("legend histogram carries a caption saying what the bars are, with a scale", function () {
    // Every cell in one colour band → the longest bar holds all 100 cells.
    const props = {
      ...baseProps(10, 10),
      matrix: baseProps(10, 10).matrix.map((r) => r.map(() => 0.5)),
      showLegendHistogram: true,
    };
    const { container } = renderWithEffects(HeatmapChart, props);
    const lines = Array.from(container.querySelectorAll("#colorbar-histogram-caption text")).map(
      (t) => t.textContent
    );
    eq(lines, ["Grey bars = cells", "per colour band", "(longest: 100)"]);
    // Caption sits below the bar, and the viewBox grows to fit it.
    const bar = container.querySelector("#colorbar > rect");
    const barBottom = Number(bar.getAttribute("y")) + Number(bar.getAttribute("height"));
    const capYs = Array.from(container.querySelectorAll("#colorbar-histogram-caption text")).map(
      (t) => Number(t.getAttribute("y"))
    );
    assert(capYs[0] > barBottom + 14, "caption clears the bottom tick label");
    const vbH = Number(container.querySelector("svg").getAttribute("viewBox").split(" ")[3]);
    assert(capYs[2] < vbH, "caption inside the viewBox");
    // And it ships with the export.
    const clone = globalThis.buildExportSvg(container.querySelector("svg"));
    eq(clone.querySelectorAll("#colorbar-histogram-caption text").length, 3);
  });

  test("legend histogram is absent when switched off", function () {
    const { container } = renderWithEffects(HeatmapChart, baseProps(10, 10));
    eq(container.querySelector("#colorbar-histogram"), null);
    eq(container.querySelector("#colorbar-histogram-caption"), null);
    const bar = container.querySelector("#colorbar > rect");
    const tick = container.querySelector("#colorbar text");
    eq(Number(tick.getAttribute("x")) - Number(bar.getAttribute("x")), 16);
  });

  test("colourbar only flags clipping among the displayed rows (detail view)", function () {
    // Row 0 holds 0.00–0.09: nothing above 0.5, nothing below 0.
    const props = { ...baseProps(10, 10), vmax: 0.5, rowOrder: [0] };
    const { container } = renderWithEffects(HeatmapChart, props);
    eq(colorbarTicks(container), ["0.50", "0.25", "0"]);
  });

  const SKEW = {
    nOutliers: 3,
    nTotal: 3000,
    occupied: 0.112,
    suggestedMin: 0.62,
    suggestedMax: 5.31,
  };

  test("SkewAlert (sidebar) explains the skew, offers the clip, and notes the legend", function () {
    const html = renderHtml(tool.exports.SkewAlert, { skew: SKEW, onApply: noop });
    assert(
      html.indexOf(
        "3 of 3000 cells (0.1%) stretch the colour scale — the other values use only 11% of it."
      ) !== -1,
      "warning text with counts + percentages"
    );
    assert(html.indexOf("Exclude 3 outliers from the colour scale") !== -1, "exclude button");
    assert(html.indexOf("≥ / ≤") !== -1, "legend note in the full variant");
  });

  test("SkewAlert singular wording and compact variant without the legend note", function () {
    const html = renderHtml(tool.exports.SkewAlert, {
      skew: { ...SKEW, nOutliers: 1 },
      onApply: noop,
      compact: true,
    });
    assert(html.indexOf("1 of 3000 cells (0.0%) stretches") !== -1, "singular verb");
    assert(html.indexOf("Exclude 1 outlier from the colour scale") !== -1, "singular button");
    assert(html.indexOf("≥ / ≤") === -1, "compact variant omits the legend note");
  });

  test("SkewAlert's button applies the suggested range", function () {
    let clicks = 0;
    const { container, root } = renderWithEffects(tool.exports.SkewAlert, {
      skew: SKEW,
      onApply: () => clicks++,
    });
    React.act(() => container.querySelector("button").click());
    eq(clicks, 1);
    // Unmount so the useT language subscription can't fire outside act()
    // when later suites flip the language.
    React.act(() => root.unmount());
  });

  const rOpts = {
    rawMatrix: {
      rowLabels: ["a", "b"],
      colLabels: ["x", "y"],
      matrix: [
        [1, 2],
        [3, 40],
      ],
    },
    normalization: "none",
    rowMode: "hierarchical",
    colMode: "hierarchical",
    rowK: 3,
    colK: 3,
    kmeansSeed: 1,
    distanceMetric: "correlation",
    linkageMethod: "average",
    palette: "viridis",
    invertPalette: false,
    vmin: 1,
    vmax: 5,
    plotTitle: "",
    cellBorder: { on: false, color: "#ffffff", width: 0.5 },
  };

  // ── RangeHistogram (sidebar) ─────────────────────────────────────────

  const RangeHistogram = tool.exports.RangeHistogram;
  const seq = (lo, n) => Array.from({ length: n }, (_, i) => lo + i);

  function mountHist(extra) {
    const calls = [];
    const props = {
      sortedValues: seq(0, 100).concat([1000]),
      vmin: 0,
      vmax: 1000,
      palette: "viridis",
      invertPalette: false,
      symmetricAxis: false,
      onChange: (lo, hi) => calls.push([lo, hi]),
      ...extra,
    };
    const r = renderWithEffects(RangeHistogram, props);
    return { ...r, calls, unmount: () => React.act(() => r.root.unmount()) };
  }

  test("RangeHistogram: outlier stub, two sliders, nothing clipped at full range", function () {
    const { container, unmount } = mountHist();
    const sliders = container.querySelectorAll('[role="slider"]');
    eq(sliders.length, 2);
    eq(sliders[0].getAttribute("aria-valuenow"), "0");
    eq(sliders[1].getAttribute("aria-valuenow"), "1000");
    eq(sliders[0].style.left, "0.000%");
    eq(sliders[1].style.left, "100.000%");
    // The stub carries the 1-cell outlier count and the broken-axis glyph.
    assert(container.textContent.indexOf("⫽") !== -1, "broken-axis glyph");
    eq(container.querySelector('[data-testid="heatmap-range-clipped"]').textContent, "");
    unmount();
  });

  test("RangeHistogram: clipped counts on each side", function () {
    const { container, unmount } = mountHist({ vmin: 5, vmax: 95 });
    eq(
      container.querySelector('[data-testid="heatmap-range-clipped"]').textContent,
      "‹ 5 clipped5 clipped ›"
    );
    unmount();
  });

  test("RangeHistogram: keyboard nudges a handle by 1 % (Shift: 10 %) of the main span", function () {
    const { container, calls, unmount } = mountHist();
    const [lo, hi] = container.querySelectorAll('[role="slider"]');
    const key = (el, k, shiftKey) =>
      React.act(() => {
        el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
      });
    key(hi, "ArrowLeft", false); // main span 0–99 → step 0.99
    key(lo, "ArrowRight", true); // step 9.9
    eq(calls, [
      [0, 999],
      [9.9, 1000],
    ]);
    unmount();
  });

  test("RangeHistogram: handles stay independent on diverging data", function () {
    const { container, calls, unmount } = mountHist({
      sortedValues: [-500].concat(seq(-49, 100)),
      vmin: -500,
      vmax: 500,
      palette: "rdbu",
      symmetricAxis: true,
    });
    const hi = container.querySelectorAll('[role="slider"]')[1];
    React.act(() => {
      hi.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    // Main span −49…50 → step 0.99; Min is untouched.
    eq(calls, [[-500, 499]]);
    unmount();
  });

  test("RangeHistogram: dragging moves the nearer handle and commits on release", function () {
    const { container, calls, unmount } = mountHist();
    const track = container.querySelector('[role="group"]');
    // happy-dom lays out nothing (width 0 → treated as 1 px), so clientX is
    // the track fraction directly. 0.45 of the track = 49.5 in the main zone
    // (which spans 0 → 0.9; the outlier stub takes the last 10 %).
    const ptr = (type, clientX) =>
      React.act(() => {
        track.dispatchEvent(
          new window.PointerEvent(type, { clientX, button: 0, pointerId: 1, bubbles: true })
        );
      });
    ptr("pointerdown", 0.45);
    ptr("pointerup", 0.45);
    eq(calls[calls.length - 1], [49.5, 1000]);
    unmount();
  });

  test("R export clusters on the unclipped matrix, then clips to the colour range", function () {
    const script = tool.exports.buildHeatmapRScript(rOpts);
    const at = (needle) => {
      const i = script.indexOf(needle);
      assert(i !== -1, "R script contains: " + needle);
      return i;
    };
    const dist = at("hc_dist <- function(x) as.dist(1 - cor(t(x)))");
    const rowTree = at('row_tree <- hclust(hc_dist(mat), method = "average")');
    const colTree = at('col_tree <- hclust(hc_dist(t(mat)), method = "average")');
    const clip = at("mat_plot <- pmin(pmax(mat, 1), 5)");
    assert(dist < rowTree && rowTree < colTree && colTree < clip, "trees built before clipping");
    at("  mat_plot,");
    at("  cluster_rows = row_tree,");
    at("  cluster_cols = col_tree,");
  });

  test("R export without hierarchical clustering skips the trees but still clips", function () {
    const script = tool.exports.buildHeatmapRScript({
      ...rOpts,
      rowMode: "none",
      colMode: "none",
      distanceMetric: "manhattan",
    });
    assert(script.indexOf("hc_dist") === -1, "no distance helper");
    assert(script.indexOf("mat_plot <- pmin(pmax(mat, 1), 5)") !== -1, "still clips");
    assert(script.indexOf("  cluster_rows = FALSE,") !== -1, "rows unclustered");
    assert(script.indexOf("  cluster_cols = FALSE,") !== -1, "cols unclustered");
  });

  test("R export pins the neutral colour to 0 for diverging palettes", function () {
    const two = tool.exports.buildHeatmapRScript({ ...rOpts, palette: "rdbu", vmin: -2, vmax: 5 });
    for (const line of [
      "breaks <- seq(-2, 5, length.out = 101)",
      "mids <- (head(breaks, -1) + tail(breaks, -1)) / 2",
      "neg <- min(breaks[1], 0); pos <- max(breaks[101], 0)",
      "pal_t <- ifelse(mids < 0, 0.5 * (1 - mids / neg), 0.5 + 0.5 * mids / pos)",
      "heat_colors <- rgb(colorRamp(palette_stops)(pal_t), maxColorValue = 255)",
    ]) {
      assert(two.indexOf(line) !== -1, "R script contains: " + line);
    }
    assert(two.indexOf("heat_colors <- rgb(") > two.indexOf("breaks <- seq("), "after breaks");
    // Sequential palette → the plain ramp, no centring.
    const seqR = tool.exports.buildHeatmapRScript({ ...rOpts, vmin: -2, vmax: 5 });
    assert(seqR.indexOf("pal_t") === -1, "viridis is not centred");
  });

  test("diverging palette with Min = 0: the 0 cell keeps the neutral colour (regression)", function () {
    const m = [[-2, -1, 0, 1, 2, 4, 8]];
    const props = {
      ...baseProps(1, 7),
      matrix: m,
      palette: "rdbu",
      vmin: 0,
      vmax: 8,
    };
    const { container } = renderWithEffects(HeatmapChart, props);
    const clone = globalThis.buildExportSvg(container.querySelector("svg"));
    const fills = Array.from(clone.querySelectorAll("#cells rect")).map((r) =>
      r.getAttribute("fill")
    );
    // rdbu's neutral stop is #f7f7f7; negatives clip to Min's (neutral) colour.
    eq(fills, ["#f7f7f7", "#f7f7f7", "#f7f7f7", "#e9f0f4", "#dbeaf2", "#9cc7e0", "#2166ac"]);
  });

  test("R export maps non-correlation metrics onto dist()", function () {
    const script = tool.exports.buildHeatmapRScript({ ...rOpts, distanceMetric: "manhattan" });
    assert(
      script.indexOf('hc_dist <- function(x) dist(x, method = "manhattan")') !== -1,
      "manhattan via dist()"
    );
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
    tickFontSize: 11,
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

// ════════════════════════════════════════════════════════════════════════════
//  applyStaticI18n — static-page copy swap (landing / privacy)
// ════════════════════════════════════════════════════════════════════════════
//
// applyStaticI18n is the primitive the landing + privacy pages' inline
// scripts call to localize their data-i18n* markup. It is DOM-driven (not a
// pure function), so it's covered here under happy-dom rather than in the vm
// i18n-loader. Exercises all four attribute channels — including the SVG
// nodes + aria-label path added for the privacy data-flow diagram.

suite("applyStaticI18n — static-page copy swap");

(function () {
  // Register a throwaway namespace so the assertions don't depend on the
  // real landing / privacy catalogs.
  globalThis.registerCatalog("t18ntest", "en", {
    "t18ntest.text": "Hello",
    "t18ntest.html": "Bold <b>here</b>",
    "t18ntest.title": "Tooltip text",
    "t18ntest.aria": "Accessible name",
    "t18ntest.svg": "Diagram label",
  });
  globalThis.registerCatalog("t18ntest", "fr", {
    "t18ntest.text": "Bonjour",
    "t18ntest.html": "Gras <b>ici</b>",
    "t18ntest.title": "Texte d’infobulle",
    "t18ntest.aria": "Nom accessible",
    "t18ntest.svg": "Étiquette du schéma",
  });

  test("swaps textContent / innerHTML / title / aria-label, incl. SVG nodes", function () {
    globalThis.setLang("en");
    const host = document.createElement("div");
    host.innerHTML =
      '<span data-i18n="t18ntest.text">placeholder</span>' +
      '<p data-i18n-html="t18ntest.html">placeholder</p>' +
      '<a data-i18n-title="t18ntest.title" title="placeholder">x</a>' +
      '<svg data-i18n-aria="t18ntest.aria" aria-label="placeholder">' +
      '<text data-i18n="t18ntest.svg">placeholder</text></svg>';
    document.body.appendChild(host);

    globalThis.applyStaticI18n(host);
    eq(host.querySelector("[data-i18n='t18ntest.text']").textContent, "Hello");
    eq(host.querySelector("[data-i18n-html]").innerHTML, "Bold <b>here</b>");
    eq(host.querySelector("[data-i18n-title]").getAttribute("title"), "Tooltip text");
    eq(host.querySelector("[data-i18n-aria]").getAttribute("aria-label"), "Accessible name");
    eq(host.querySelector("text").textContent, "Diagram label");

    // Re-apply after a language switch — every channel updates in place.
    globalThis.setLang("fr");
    globalThis.applyStaticI18n(host);
    eq(host.querySelector("[data-i18n='t18ntest.text']").textContent, "Bonjour");
    eq(host.querySelector("[data-i18n-html]").innerHTML, "Gras <b>ici</b>");
    eq(host.querySelector("[data-i18n-title]").getAttribute("title"), "Texte d’infobulle");
    eq(host.querySelector("[data-i18n-aria]").getAttribute("aria-label"), "Nom accessible");
    eq(host.querySelector("text").textContent, "Étiquette du schéma");

    document.body.removeChild(host);
    globalThis.setLang("en");
  });
})();

suite("ProportionsChart + stats panels");

(function () {
  const tool = loadTool("proportions");
  const { ProportionsChart, StatsPanel, GofPanel } = tool.exports;
  const P = require("./helpers/proportions-loader");
  const table = {
    groups: ["WT", "mut-1", "mut-2", "comp"],
    categories: ["Colonised", "Not colonised"],
    counts: [
      [41, 7],
      [3, 43],
      [9, 41],
      [37, 10],
    ],
  };
  const analysis = P.analyseTable(table, "auto", "holm");
  const summaries = P.groupSummaries(table);
  const base = {
    table,
    chartType: "proportion",
    summaries,
    brackets: P.bracketPairs(analysis, false),
    cld: analysis.cld,
    annotation: "brackets",
    colors: ["#E69F00", "#56B4E9"],
    groupColors: ["#111111", "#222222", "#333333", "#444444"],
    showCI: true,
    showN: true,
    segmentLabels: "percent",
    barWidthFrac: 0.6,
    barOutline: true,
    barOutlineWidth: 1,
    xLabelAngle: 0,
    plotWidth: 480,
    plotHeight: 340,
    tickFontSize: 12,
    title: "",
    yLabel: "",
    plotBg: "#ffffff",
    showGrid: false,
    gridColor: "#e0e0e0",
  };
  const vis = {
    chartType: "proportion",
    showCI: true,
    showN: true,
    annotation: "brackets",
    showNsBrackets: false,
    segmentLabels: "percent",
    discretePalette: "okabe-ito",
    barWidthFrac: 0.6,
    barOutline: true,
    barOutlineWidth: 1,
    xLabelAngle: 0,
    plotWidth: 480,
    plotHeight: 340,
    tickFontSize: 12,
    plotTitle: "",
    yLabel: "",
    plotBg: "#ffffff",
    showGrid: false,
    gridColor: "#e0e0e0",
    testChoice: "auto",
    adjustMethod: "holm",
  };

  test("proportion chart: one bar + CI whisker + n label per group, brackets for sig pairs", () => {
    const html = renderHtml(ProportionsChart, base);
    eq((html.match(/<rect id="bar-/g) || []).length, 4);
    eq(
      [...html.matchAll(/<rect id="bar-[^"]*"[^>]*fill="(#[0-9a-f]{6})"/g)]
        .map((m) => m[1])
        .join(","),
      "#111111,#222222,#333333,#444444"
    );
    const ci = html.match(/<g id="ci-whiskers">(.*?)<\/g><g id="axis-y">/s);
    assert(ci, "ci group present");
    eq((ci[1].match(/<line/g) || []).length, 12);
    assert(html.includes(">41/48<") && html.includes(">3/46<"), "n labels");
    assert(html.includes('id="significance-brackets"'));
    eq((html.match(/>\*\*\*\*</g) || []).length, 4);
    assert(html.includes("% Colonised"), "auto y label");
    assert(!html.includes('id="legend"'), "no legend for the proportion chart");
  });

  test("group-label angle: horizontal at 0°, tilted + end-anchored otherwise, margins grow", () => {
    const flat = renderHtml(ProportionsChart, base);
    assert(/<g id="axis-x">.*?text-anchor="middle"[^>]*>WT</s.test(flat), "horizontal");
    assert(
      !/<g id="axis-x">[^]*?rotate\(/.test(flat.match(/<g id="axis-x">.*?<\/g>/s)[0]),
      "no rotation"
    );
    const tilted = renderHtml(ProportionsChart, { ...base, xLabelAngle: -45 });
    const axis = tilted.match(/<g id="axis-x">.*?<\/g>/s)[0];
    eq((axis.match(/transform="rotate\(-45,/g) || []).length, 4);
    assert(/text-anchor="end"[^>]*transform="rotate\(-45,/.test(axis));
    const vb = (h) =>
      h
        .match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
        .slice(1)
        .map(Number);
    assert(vb(tilted)[1] > vb(flat)[1], "taller bottom margin for tilted labels");
    const vertical = renderHtml(ProportionsChart, {
      ...base,
      chartType: "mosaic",
      xLabelAngle: -90,
    });
    eq((vertical.match(/transform="rotate\(-90,(?!12,)/g) || []).length, 4);
  });

  test("bar outline: black at the chosen width, or none", () => {
    const strokes = (h) =>
      [...h.matchAll(/<rect id="bar-[^"]*"[^>]*stroke="([^"]*)" stroke-width="([^"]*)"/g)].map(
        (m) => `${m[1]}/${m[2]}`
      );
    eq(
      strokes(renderHtml(ProportionsChart, { ...base, barOutlineWidth: 2.5 })).join(","),
      "#000000/2.5,#000000/2.5,#000000/2.5,#000000/2.5"
    );
    eq(strokes(renderHtml(ProportionsChart, { ...base, barOutline: false }))[0], "none/0");
    // Stacked: black segment borders when on, thin white separators when off.
    const on = renderHtml(ProportionsChart, { ...base, chartType: "stacked", barOutlineWidth: 3 });
    assert(
      /<g id="group-WT"><g><rect[^>]*stroke="#000000" stroke-width="3"/.test(on),
      "stacked outline"
    );
    const off = renderHtml(ProportionsChart, { ...base, chartType: "stacked", barOutline: false });
    assert(
      /<g id="group-WT"><g><rect[^>]*stroke="#ffffff" stroke-width="0.8"/.test(off),
      "white separators"
    );
  });

  test("CI and n labels can be switched off; CLD letters replace brackets", () => {
    const html = renderHtml(ProportionsChart, {
      ...base,
      showCI: false,
      showN: false,
      annotation: "cld",
    });
    assert(!html.includes('id="ci-whiskers"'));
    assert(!html.includes('id="n-labels"'));
    assert(!html.includes('id="significance-brackets"'));
    assert(html.includes('id="cld-annotations"'));
    eq((html.match(/<g id="cld-annotations">.*?<\/g>/s)[0].match(/<text/g) || []).length, 4);
  });

  test("stacked chart: one segment per category, % labels, legend", () => {
    const html = renderHtml(ProportionsChart, { ...base, chartType: "stacked" });
    assert(html.includes('id="segments"'));
    eq((html.match(/<g id="group-/g) || []).length, 4);
    assert(html.includes(">85 %<") && html.includes(">15 %<"), "percent labels");
    assert(html.includes('id="legend-Colonised"'));
    assert(html.includes("% of observations"));
    const counts = renderHtml(ProportionsChart, {
      ...base,
      chartType: "stacked",
      segmentLabels: "count",
    });
    assert(counts.includes(">41<") && counts.includes(">43<"), "count labels");
  });

  test("mosaic chart: column widths proportional to n", () => {
    const html = renderHtml(ProportionsChart, { ...base, chartType: "mosaic", showN: false });
    const widths = [
      ...html.matchAll(/<g id="group-[^"]*"><g><rect x="[^"]*" y="[^"]*" width="([^"]*)"/g),
    ].map((m) => Number(m[1]));
    eq(widths.length, 4);
    const usable = 480 - 6 * 3;
    [48, 46, 50, 47].forEach((n, i) => approx(widths[i], (usable * n) / 191, 1e-9));
  });

  test("StatsPanel: summary with Wilson CIs, χ² line, pairwise Holm table", () => {
    const html = renderHtml(StatsPanel, {
      analysis,
      categories: table.categories,
      summaries,
      focusLabel: null,
      vis,
      updVis: noop,
    });
    assert(html.includes("41 · 85.4 % [72.8 %, 92.8 %]"), "Wilson summary cell");
    assert(/<h3[^>]*>Statistics<\/h3>/.test(html), "Statistics title");
    const header = html.slice(0, html.indexOf("Display on plot"));
    assert(
      header.includes('data-testid="proportions-dl-txt"') && header.includes(">⬇ TXT<"),
      "TXT in header"
    );
    assert(
      header.includes('data-testid="proportions-dl-r"') && header.includes(">⬇ R<"),
      "R in header"
    );
    assert(html.includes("Cochran"), "selection reason");
    assert(html.includes("Pearson χ²(3) = 94.537, p = 2.3e-20"));
    assert(html.includes("Cramér&#x27;s V = 0.704 · N = 191"));
    assert(html.includes('data-testid="proportions-pairs"'));
    assert(html.includes("p (Holm)"));
    assert(html.includes("+6.14"), "standardised residual");
  });

  test("StatsPanel: Display on plot offers Off / Letters / Brackets (letters only for ≥ 3 groups)", () => {
    const html = renderHtml(StatsPanel, {
      analysis,
      categories: table.categories,
      summaries,
      focusLabel: null,
      vis,
      updVis: noop,
    });
    assert(html.includes("Display on plot"));
    const seg = html.match(/aria-label="Display on plot"[^>]*>(.*?)<\/div>/s)[1];
    eq(
      [...seg.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]).join("|"),
      "Off|Letters|Brackets"
    );
    assert(/aria-pressed="true"[^>]*>Brackets</.test(seg), "brackets active");
    assert(!/disabled=""[^>]*data-testid="proportions-show-ns"/.test(html), "show ns enabled");
    const cldHtml = renderHtml(StatsPanel, {
      analysis,
      categories: table.categories,
      summaries,
      focusLabel: null,
      vis: { ...vis, annotation: "cld" },
      updVis: noop,
    });
    assert(/aria-pressed="true"[^>]*>Letters</.test(cldHtml), "letters active");
    assert(
      /disabled=""[^>]*data-testid="proportions-show-ns"/.test(cldHtml),
      "show ns disabled with letters"
    );
    const t2 = {
      groups: ["a", "b"],
      categories: ["y", "n"],
      counts: [
        [10, 3],
        [2, 15],
      ],
    };
    const two = renderHtml(StatsPanel, {
      analysis: P.analyseTable(t2, "auto", "holm"),
      categories: t2.categories,
      summaries: P.groupSummaries(t2),
      focusLabel: null,
      vis: { ...vis, annotation: "cld" },
      updVis: noop,
    });
    const seg2 = two.match(/aria-label="Display on plot"[^>]*>(.*?)<\/div>/s)[1];
    assert(!seg2.includes("Letters"), "no letters for two groups");
    assert(/aria-pressed="true"[^>]*>Brackets</.test(seg2), "falls back to brackets");
  });

  test("StatsPanel explainers: why this test (with this table's numbers) and why Holm / BH", () => {
    const props = {
      analysis,
      categories: table.categories,
      summaries,
      focusLabel: null,
      vis,
      updVis: noop,
      onDownloadReport: noop,
      onDownloadR: noop,
    };
    const html = renderHtml(StatsPanel, props);
    const why = html.match(/data-testid="proportions-test-reason">(.*?)<\/div><\/div>/s)[1];
    assert(why.includes("Why this test?"));
    assert(why.includes("smallest expected count is 21.68 and 0 of 8 cells are below 5"), why);
    assert(why.includes("meets Cochran"));
    assert(!html.includes('data-testid="proportions-override-note"'));
    const adj = html.match(/data-testid="proportions-adjust-explainer">(.*?)<\/div><p/s)[1];
    assert(adj.includes("6 pairs are compared"), adj);
    assert(adj.includes("could reach about 26 %"), "1 − 0.95⁶ ≈ 26 %");
    assert(adj.indexOf("Holm</strong> (selected)") < adj.indexOf("Benjamini–Hochberg</strong>"));
    const bh = renderHtml(StatsPanel, { ...props, vis: { ...vis, adjustMethod: "bh" } });
    const adjBh = bh.match(/data-testid="proportions-adjust-explainer">(.*?)<\/div><p/s)[1];
    assert(
      adjBh.indexOf("Benjamini–Hochberg</strong> (selected)") < adjBh.indexOf("Holm</strong>")
    );
    // Override to Fisher where χ² was fine → reassuring note.
    const toFisher = renderHtml(StatsPanel, { ...props, vis: { ...vis, testChoice: "fisher" } });
    assert(/proportions-override-note"[^>]*>You picked Fisher/.test(toFisher));
  });

  test("StatsPanel explainers: small expected counts → Fisher, and a χ² override is flagged", () => {
    const small = {
      groups: ["a", "b", "c"],
      categories: ["x", "y", "z"],
      counts: [
        [5, 3, 1],
        [2, 6, 2],
        [1, 2, 7],
      ],
    };
    const props = (choice) => ({
      analysis: P.analyseTable(small, choice, "holm"),
      categories: small.categories,
      summaries: P.groupSummaries(small),
      focusLabel: null,
      vis: { ...vis, testChoice: choice },
      updVis: noop,
      onDownloadReport: noop,
      onDownloadR: noop,
    });
    const auto = renderHtml(StatsPanel, props("auto"));
    assert(auto.includes("smallest expected count is 2.48 and 9 of 9 cells are below 5"));
    assert(auto.includes("breaks Cochran"));
    const chi = renderHtml(StatsPanel, props("chi2"));
    const note = chi.match(/data-testid="proportions-override-note">(.*?)<\/div>/s)[1];
    assert(note.includes("9 of 9 expected counts are below 5") && note.includes("caution"), note);
    assert(
      /color:var\(--warning-text\)[^>]*data-testid="proportions-override-note"/.test(chi),
      "warning colour"
    );
  });

  test("StatsPanel: 2×2 shows Fisher with the conditional-MLE odds ratio", () => {
    const t2 = {
      groups: ["a", "b"],
      categories: ["y", "n"],
      counts: [
        [10, 3],
        [2, 15],
      ],
    };
    const a2 = P.analyseTable(t2, "auto", "holm");
    const html = renderHtml(StatsPanel, {
      analysis: a2,
      categories: t2.categories,
      summaries: P.groupSummaries(t2),
      focusLabel: null,
      vis,
      updVis: noop,
    });
    assert(html.includes("Fisher&#x27;s exact test (2×2): p = 5.37e-4"));
    assert(html.includes("= 21.3, 95 % CI [2.75, 301]"));
    assert(!html.includes('data-testid="proportions-pairs"'));
  });

  test("GofPanel: invalid ratio warns, valid ratio tabulates per group", () => {
    const bad = renderHtml(GofPanel, { table, ratioText: "3:1:1", setRatioText: noop });
    assert(bad.includes("Enter 2 positive numbers"));
    const ok = renderHtml(GofPanel, { table, ratioText: "3:1", setRatioText: noop });
    assert(ok.includes("36.0 : 12.0"), "expected counts for WT");
    assert(ok.includes(">exact<"));
    assert(ok.includes(">0.1316<"), "WT exact binomial p");
  });
})();

suite("QpcrChart + QpcrStatsPanel");

(function () {
  const tool = loadTool("qpcr");
  const { QpcrChart, QpcrStatsPanel, ShapeFillTile } = tool.exports;
  const Q = require("./helpers/qpcr-loader");
  const raw = Q.parseRaw(`Sample,Group,Gene,Ct
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
`);
  const parsed = Q.parseLong(raw.rows, Q.detectLayout(raw.headers, raw.rows).long);
  const samples = Q.aggregateTechReps(parsed.data.wells);
  const cfg = {
    refs: ["ACT2", "UBQ10"],
    targets: ["PR1"],
    eff: {},
    normalize: "control",
    control: "Mock",
    groupOrder: ["Mock", "SA", "JA"],
  };
  const genes = [Q.computeGene(samples, cfg, "PR1")];
  const stats = genes.map((g) => Q.runGeneStats(g, null));
  const vis = {
    yScale: "log2",
    chartStyle: "bar",
    showPoints: true,
    errorBar: "ci95",
    showCalibrator: true,
    annotation: "brackets",
    showNs: false,
    discretePalette: "okabe-ito",
    barOutline: true,
    barOutlineWidth: 1,
    barWidthFrac: 0.6,
    facetWidth: 260,
    facetHeight: 260,
    facetCols: 3,
    xLabelAngle: 0,
    tickFontSize: 12,
    plotTitle: "",
    plotBg: "#ffffff",
    showGrid: false,
    gridColor: "#e0e0e0",
    horizontal: false,
    pointSize: 2.6,
    jitterWidth: 0.45,
    fillOpacity: 1,
    yMin: "",
    yMax: "",
    yLabel: "",
  };
  const chartProps = (over = {}) => {
    const v = { ...vis, ...over };
    return {
      genes,
      annotations: genes.map((g, i) =>
        Q.geneAnnotation(g, stats[i], v.annotation, v.showNs, v.showCalibrator ? null : "Mock")
      ),
      colors: ["#111111", "#222222", "#333333"],
      groupOrder: cfg.groupOrder,
      normalize: "control",
      control: "Mock",
      yScale: v.yScale,
      chartStyle: v.chartStyle,
      showPoints: v.showPoints,
      errorBar: v.errorBar,
      showCalibrator: v.showCalibrator,
      horizontal: v.horizontal,
      pointSize: v.pointSize,
      jitterWidth: v.jitterWidth,
      fillOpacity: v.fillOpacity,
      yMin: v.yMin,
      yMax: v.yMax,
      yLabel: v.yLabel,
      barOutline: v.barOutline,
      barOutlineWidth: v.barOutlineWidth,
      barWidthFrac: v.barWidthFrac,
      facetWidth: v.facetWidth,
      facetHeight: v.facetHeight,
      facetCols: v.facetCols,
      xLabelAngle: v.xLabelAngle,
      tickFontSize: v.tickFontSize,
      title: v.plotTitle,
      plotBg: v.plotBg,
      showGrid: v.showGrid,
      gridColor: v.gridColor,
    };
  };

  test("chart: one facet per target, bars per group in group colours, points, error bars, brackets", () => {
    const html = renderHtml(QpcrChart, chartProps());
    assert(html.includes('id="facet-PR1"'));
    const bars = [...html.matchAll(/<g id="bars-PR1">(.*?)<\/g>/gs)][0][1];
    eq(
      [...bars.matchAll(/fill="(#\d{6})"/g)].map((m) => m[1]).join(","),
      "#111111,#222222,#333333"
    );
    eq((html.match(/<g id="points-PR1">.*?<\/g>/s)[0].match(/<circle/g) || []).length, 9);
    eq((html.match(/<g id="error-bars-PR1">.*?<\/g><\/g>/s)[0].match(/<g>/g) || []).length, 3);
    assert(html.includes('id="significance-brackets"'));
    assert(html.includes("Fold change (log₂ scale)"));
    // log2 axis: a fold-change tick at every doubling, aligned so FC = 1 is a tick
    const axis = html.slice(
      html.indexOf('<g id="axis-y-PR1">'),
      html.indexOf('<g id="axis-x-PR1">')
    );
    const labels = [...axis.matchAll(/>([^<>]+)<\/text>/g)].map((m) => m[1]);
    eq(labels.join(","), "0.5,1,2,4,8,16,32,64,Fold change (log₂ scale)");
    assert(html.includes('stroke-dasharray="4,3"'), "reference line at FC = 1");
  });

  test("chart: y-scale switch (linear FC / −ΔΔCt), dots, letters", () => {
    const lin = renderHtml(QpcrChart, chartProps({ yScale: "linear" }));
    assert(lin.includes(">Fold change<"));
    assert(lin.includes(">0<"), "linear axis starts at 0");
    // Linear axis: bars rise from 0 (not from FC = 1), so every bar's bottom
    // edge is on the x axis; the dashed FC = 1 line stays above it.
    const axisY = Number(lin.match(/<g id="axis-x-PR1"><line [^>]*y1="([^"]+)"/)[1]);
    const linBars = lin.match(/<g id="bars-PR1">(.*?)<\/g>/s)[1];
    const rects = [
      ...linBars.matchAll(/<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g),
    ];
    eq(rects.length, 3);
    rects.forEach((m) => assert(Math.abs(Number(m[1]) + Number(m[2]) - axisY) < 1e-9));
    const ref = Number(lin.match(/id="reference-line-PR1" x1="[^"]+" y1="([^"]+)"/)[1]);
    assert(ref < axisY, "FC = 1 line above the 0 baseline");
    const dd = renderHtml(QpcrChart, chartProps({ yScale: "ddct", chartStyle: "dot" }));
    assert(dd.includes(">−ΔΔCt<"));
    assert(!/<g id="bars-PR1"><rect/.test(dd), "dots instead of bars");
    const cld = renderHtml(QpcrChart, chartProps({ annotation: "cld" }));
    assert(cld.includes('id="cld-annotations"'));
    assert(!cld.includes('id="significance-brackets"><g'), "no brackets with letters");
  });

  const R_MOCK_CI_HALF = 0.814479016535155; // R: qt(0.975, 2) * SEM, Mock ΔCt
  const near = (a, b, tol) => assert(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
  // Length of each group's error bar (its vertical line), read from the SVG.
  const errSpans = (html) => {
    const block = html.match(/<g id="error-bars-PR1">(.*?)<\/g><\/g>/s)[0];
    return [...block.matchAll(/<line x1="[^"]+" y1="([^"]+)" x2="[^"]+" y2="([^"]+)"/g)]
      .filter((_, i) => i % 3 === 0)
      .map((m) => Math.abs(Number(m[1]) - Number(m[2])));
  };

  test("chart: error-bar type — SD, SEM, 95 % CI lengths; none hides them", () => {
    // px per log2 unit from the y axis: tick lines one doubling (1, 2, 4, …)
    // apart.
    const pxPerLog2 = (html) => {
      const axis = html.slice(html.indexOf('<g id="axis-y-PR1">'));
      const ys = [...axis.matchAll(/<line x1="[^"]+" x2="[^"]+" y1="([^"]+)" y2="\1"/g)].map((m) =>
        Number(m[1])
      );
      return Math.abs(ys[0] - ys[1]);
    };
    // Mock ΔCt 8.35, 8.75, 8.1 (n = 3) → SD = √0.1075; bars span mean ± half.
    const sd = Math.sqrt(0.1075);
    for (const [type, half] of [
      ["sd", sd],
      ["sem", sd / Math.sqrt(3)],
      ["ci95", R_MOCK_CI_HALF],
    ]) {
      const html = renderHtml(QpcrChart, chartProps({ errorBar: type }));
      const spans = errSpans(html);
      eq(spans.length, 3);
      near(spans[0], 2 * half * pxPerLog2(html), 1e-9);
    }
    const none = renderHtml(QpcrChart, chartProps({ errorBar: "none" }));
    assert(!none.includes('id="error-bars-PR1"'));
  });

  test("chart: no calibrator — 2^−ΔCt axis title, no FC = 1 line, bars from the axis floor", () => {
    const refCfg = { ...cfg, normalize: "refs", control: "" };
    const relGenes = [Q.computeGene(samples, refCfg, "PR1")];
    const relStats = relGenes.map((g) => Q.runGeneStats(g, null));
    const props = {
      ...chartProps(),
      genes: relGenes,
      annotations: relGenes.map((g, i) => Q.geneAnnotation(g, relStats[i], "brackets", false)),
      normalize: "refs",
      control: "",
    };
    const html = renderHtml(QpcrChart, props);
    assert(html.includes(">Relative expression (log₂ scale)<"));
    assert(!html.includes('id="reference-line-PR1"'), "no FC = 1 line");
    assert(html.includes("normalised to the reference genes only"));
    assert(!html.includes('font-weight="700">Mock'), "no group highlighted as control");
    // every bar's bottom edge sits on the x axis
    const axisY = html.match(/<g id="axis-x-PR1"><line [^>]*y1="([^"]+)"/)[1];
    const bars = html.match(/<g id="bars-PR1">(.*?)<\/g>/s)[1];
    const rects = [...bars.matchAll(/<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g)];
    eq(rects.length, 3);
    rects.forEach((m) => near(Number(m[1]) + Number(m[2]), Number(axisY), 1e-9));
    const dct = renderHtml(QpcrChart, { ...props, yScale: "ddct" });
    assert(dct.includes(">−ΔCt<"));
    const panel = renderHtml(QpcrStatsPanel, {
      genes: relGenes,
      stats: relStats,
      normalize: "refs",
      control: "",
      overrides: {},
      onOverride: noop,
      vis,
      updVis: noop,
      onDownloadReport: noop,
      onDownloadR: noop,
    });
    assert(panel.includes("2^−ΔCt [95 % CI]"));
    assert(!panel.includes("1 (calibrator)"));
    assert(panel.includes(">0.00296 ["), "Mock 2^−ΔCt = 2^−8.4");
  });

  test("chart: box plots — median line at the replicates' median, no mean error bars", () => {
    const html = renderHtml(QpcrChart, chartProps({ chartStyle: "box" }));
    assert(!html.includes('id="error-bars-PR1"'), "boxes replace mean ± error");
    const bars = html.match(/<g id="bars-PR1">(.*?)<\/g><\/g>/s)[0];
    eq((bars.match(/<rect/g) || []).length, 3);
    // Mock −ΔΔCt = 0.05, −0.35, 0.3 (calibrator 8.4) → median 0.05 on the log2 axis.
    const axis = html.slice(html.indexOf('<g id="axis-y-PR1">'));
    const ticks = [
      ...axis.matchAll(
        /<line x1="[^"]+" x2="[^"]+" y1="([^"]+)" y2="\1"[^>]*><\/line><text[^>]*>([^<]+)</g
      ),
    ];
    const y1 = Number(ticks.find((m) => m[2] === "1")[1]);
    const y4 = Number(ticks.find((m) => m[2] === "4")[1]);
    const yOf = (L) => y1 - (L * (y1 - y4)) / 2;
    const medians = [
      ...bars.matchAll(
        /<line x1="[^"]+" y1="([^"]+)" x2="[^"]+" y2="\1" stroke="#111111" stroke-width="2"/g
      ),
    ];
    eq(medians.length, 3);
    near(Number(medians[0][1]), yOf(0.05), 1e-9);
  });

  test("chart: horizontal — groups on y, value ticks under the plot, brackets to the right", () => {
    const html = renderHtml(QpcrChart, chartProps({ horizontal: true }));
    const xAxis = html.match(/<g id="axis-x-PR1">(.*?)<\/g>/s)[1];
    eq((xAxis.match(/text-anchor="end" dominant-baseline="central"/g) || []).length, 3);
    const bars = html.match(/<g id="bars-PR1">(.*?)<\/g>/s)[1];
    const heights = [...bars.matchAll(/height="([^"]+)"/g)].map((m) => Number(m[1]));
    eq(heights.length, 3);
    assert(
      heights.every((h) => h === heights[0]),
      "bars share their thickness"
    );
    assert(/<path d="M[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L/.test(html), "bracket paths drawn");
    assert(html.includes('transform="rotate(90,'), "horizontal bracket labels");
    const hid = renderHtml(QpcrChart, chartProps({ horizontal: true, showCalibrator: false }));
    assert(hid.includes("Stars beside bars: vs Mock (not shown)"));
  });

  test("chart: custom axis range (fold-change units), clipped data, custom title, point size, opacity", () => {
    const html = renderHtml(
      QpcrChart,
      chartProps({
        yMin: "0.25",
        yMax: "64",
        yLabel: "Relative PR1 level",
        pointSize: 5,
        fillOpacity: 0.4,
      })
    );
    const axis = html.slice(
      html.indexOf('<g id="axis-y-PR1">'),
      html.indexOf('<g id="axis-x-PR1">')
    );
    eq(
      [...axis.matchAll(/>([^<>]+)<\/text>/g)].map((m) => m[1]).join(),
      "0.25,0.5,1,2,4,8,16,32,64,Relative PR1 level"
    );
    assert(html.includes('<clipPath id="clip-PR1">'));
    assert(html.includes('clip-path="url(#clip-PR1)"'));
    eq((html.match(/<g id="points-PR1">.*?<\/g>/s)[0].match(/r="5"/g) || []).length, 9);
    eq((html.match(/fill-opacity="0.4"/g) || []).length, 3);
    // Inverted range is ignored → automatic axis again.
    const inv = renderHtml(QpcrChart, chartProps({ yMin: "64", yMax: "0.25" }));
    assert(inv.includes(">Fold change (log₂ scale)<") && !inv.includes(">0.25<"));
  });

  test("chart: calibrator hidden — no Mock column, FC = 1 line kept, vs-control stars + footnote", () => {
    const html = renderHtml(QpcrChart, chartProps({ showCalibrator: false, showNs: true }));
    const xAxis = html.match(/<g id="axis-x-PR1">(.*?)<\/g>/s)[1];
    eq([...xAxis.matchAll(/>([^<>]+)<\/text>/g)].map((m) => m[1]).join(), "SA,JA");
    eq((html.match(/<g id="bars-PR1">.*?<\/g>/s)[0].match(/<rect/g) || []).length, 2);
    eq((html.match(/<g id="points-PR1">.*?<\/g>/s)[0].match(/<circle/g) || []).length, 6);
    assert(html.includes('id="reference-line-PR1"'), "dashed FC = 1 line stays");
    const vs = html.match(/<g id="vs-control-PR1">(.*?)<\/g>/s)[1];
    eq((vs.match(/<text/g) || []).length, 2);
    assert(html.includes("Stars above bars: vs Mock (not shown)"));
    // SA vs JA bracket stacks above the star row
    const br = html.match(/<g id="significance-brackets">(.*?)<\/g><\/g>/s);
    assert(br, "bracket between the visible groups");
    const shown = renderHtml(QpcrChart, chartProps());
    assert(!shown.includes("vs-control-PR1") && !shown.includes("Stars above bars"));
  });

  test("Shape & fill: folded by default; one outline slider — 'off' at 0, thickness when on", () => {
    const html = renderHtml(ShapeFillTile, { vis, updVis: noop });
    assert(html.includes("Shape &amp; fill"));
    assert(!html.includes("Outline (black)"), "fine-tuning folded away by default");
    const open = (v) => {
      const patches = [];
      const r = renderWithEffects(ShapeFillTile, { vis: v, updVis: (p) => patches.push(p) });
      React.act(() => r.container.querySelector("button").click());
      return { r, patches };
    };
    const off = open({ ...vis, barOutline: false });
    assert(off.r.container.textContent.includes("Outline (black)off"));
    const on = open({ ...vis, barOutline: true, barOutlineWidth: 1.5 });
    assert(on.r.container.textContent.includes("Outline (black)1.50 px"));
    // Dragging to 0 turns the outline off; any other value turns it on at that width.
    const slider = (c) =>
      [...c.querySelectorAll('input[type="range"]')].find((el) => el.max === "4");
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      React.act(() => {
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    set(slider(on.r.container), "0");
    set(slider(off.r.container), "2");
    eq(JSON.stringify(on.patches.at(-1)), '{"barOutline":false}');
    eq(JSON.stringify(off.patches.at(-1)), '{"barOutline":true,"barOutlineWidth":2}');
    React.act(() => on.r.root.unmount());
    React.act(() => off.r.root.unmount());
  });

  test("stats panel: Statistics header with TXT/R, ΔCt explainer, decision trace, send button", () => {
    const html = renderHtml(QpcrStatsPanel, {
      genes,
      stats,
      normalize: "control",
      control: "Mock",
      overrides: {},
      onOverride: noop,
      vis,
      updVis: noop,
      onDownloadReport: noop,
      onDownloadR: noop,
    });
    assert(/<h3[^>]*>Statistics<\/h3>/.test(html));
    const header = html.slice(0, html.indexOf("Display on plot"));
    assert(header.includes(">⬇ TXT<") && header.includes(">⬇ R<"));
    assert(html.includes("Why the tests use ΔCt"));
    assert(html.includes("Do not run t-tests or ANOVA on 2^−ΔΔCt values."));
    assert(html.includes("Auto — Welch&#x27;s ANOVA"));
    assert(html.includes("Welch&#x27;s ANOVA on ΔCt: F(2, "));
    assert(html.includes("1 (calibrator)"));
    assert(!html.includes("Group Plot"), "no hand-off to Group Plot");
    assert(html.includes("Post-hoc: Games-Howell"));
  });
})();

suite("PlotStyleIconPicker");

test("one labelled icon button per style, selected one pressed, click reports its value", () => {
  const picked = [];
  const props = {
    value: "dot",
    onChange: (v) => picked.push(v),
    ariaLabel: "Style",
    options: [
      { value: "bar", label: "Bars", icon: React.createElement(sc.BarStyleIcon) },
      { value: "dot", label: "Dots", icon: React.createElement(sc.DotStyleIcon) },
      { value: "box", label: "Boxes", icon: React.createElement(sc.BoxStyleIcon), title: "Median" },
    ],
  };
  const r = renderWithEffects(sc.PlotStyleIconPicker, props);
  const group = r.container.querySelector('[role="group"]');
  eq(group.getAttribute("aria-label"), "Style");
  const btns = [...group.querySelectorAll("button")];
  eq(btns.map((b) => b.textContent).join(), "Bars,Dots,Boxes");
  eq(btns.map((b) => b.getAttribute("aria-pressed")).join(), "false,true,false");
  assert(
    btns.every((b) => b.querySelector("svg")),
    "each option has an icon"
  );
  eq(btns[2].getAttribute("title"), "Median");
  React.act(() => btns[2].click());
  eq(picked.join(), "box");
  React.act(() => r.root.unmount());
});

suite("HowToExampleTable");

test("renders headers, rows, a continuation row and the caption", () => {
  const html = renderHtml(sc.HowToExampleTable, {
    headers: ["Sample", "Group", "Gene", "Ct"],
    rows: [
      ["1", "Control", "ACT2", "18.52"],
      ["1", "Control", "RD29A", "Undetermined"],
    ],
    more: true,
    highlight: [3],
    caption: "One row per well",
  });
  eq((html.match(/<th /g) || []).length, 4);
  eq((html.match(/<tr>/g) || []).length, 4); // header + 2 rows + "…"
  eq((html.match(/>…</g) || []).length, 4);
  assert(html.includes("<figcaption") && html.includes("One row per well"));
  assert(/<th style="[^"]*background:var\(--info-bg\)[^"]*">Ct</.test(html), "highlighted column");
});

summary();

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

test("one button per step, in order, inside a labelled nav", function () {
  const html = renderHtml(sc.StepNavBar, {
    steps: ["upload", "configure", "plot"],
    currentStep: "upload",
    onStepChange: noop,
  });
  assert(html.startsWith("<nav"), "nav root");
  eq(rootChildCount(html), 3);
  const ids = [...html.matchAll(/data-testid="(step-[a-z]+)"/g)].map((m) => m[1]);
  eq(ids.join(","), "step-upload,step-configure,step-plot");
});

test("past steps show a check and navigate; the current step is marked and inert", function () {
  const React = require("react");
  const calls = [];
  const { container, root } = renderWithEffects(sc.StepNavBar, {
    steps: ["upload", "configure", "plot"],
    currentStep: "configure",
    onStepChange: (s) => calls.push(s),
    canNavigate: (s) => s !== "plot",
  });
  const [up, conf, plot] = container.querySelectorAll("button");
  assert(up.querySelector("svg"), "past step carries the check icon");
  eq(conf.getAttribute("aria-current"), "step");
  eq(plot.disabled, true, "locked step is disabled");
  eq(plot.textContent, "3Plot", "later steps show their number");
  React.act(() => conf.click());
  eq(calls.length, 0, "clicking the current step does nothing");
  React.act(() => up.click());
  eq(calls.join(","), "upload");
  React.act(() => root.unmount());
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

test("inside a PlotToolShell it registers its buttons and draws nothing", function () {
  let entry = null;
  const React = require("react");
  function Wrapped() {
    return React.createElement(
      sc.PlotActionsContext.Provider,
      { value: { set: (e) => (entry = e) } },
      React.createElement(sc.ActionsPanel, {
        onDownloadSvg: noop,
        onDownloadPng: noop,
        onReset: noop,
        extraDownloads: [{ label: "CSV", onClick: noop }],
      })
    );
  }
  const { html, root } = renderWithEffects(Wrapped, {});
  eq(html, "");
  eq(
    entry.downloads.map((d) => d.label),
    ["SVG", "PNG", "CSV"]
  );
  eq(entry.onReset, noop);
  React.act(() => root.unmount());
  eq(entry, null);
});

suite("PlotActionsBar");

test("Start over, a More menu for every non-SVG download, SVG last as primary", function () {
  const React = require("react");
  let resets = 0;
  let svgClicks = 0;
  const entryRef = {
    current: {
      downloads: [
        { label: "SVG", onClick: () => svgClicks++ },
        { label: "PNG", onClick: noop },
        { label: "CSV", title: "data", onClick: noop },
      ],
      onReset: () => resets++,
    },
  };
  const { container, root } = renderWithEffects(sc.PlotActionsBar, { entryRef });
  // Accessible names (what a screen reader announces).
  const labels = () =>
    [...container.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") || b.textContent
    );
  eq(labels().join("|"), "Start over|More ▾|Download SVG");
  // The SVG button carries both visible labels; components.css shows the
  // short one in narrow windows, and the name stays "Download SVG".
  const svgLabels = container.querySelectorAll("button")[2];
  eq(svgLabels.querySelector(".dv-label-long").textContent, "Download SVG");
  eq(svgLabels.querySelector(".dv-label-short").textContent, "SVG");
  const more = container.querySelectorAll("button")[1];
  eq(more.getAttribute("aria-haspopup"), "menu");
  React.act(() => more.click());
  const items = [...container.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
  eq(items.join("|"), "PNG|CSV", "PNG and further downloads live in the menu, PNG first");
  React.act(() => more.click());
  const svgBtn = container.querySelectorAll("button")[2];
  assert(svgBtn.className.includes("dv-btn-primary"), "SVG is the primary export");
  React.act(() => svgBtn.click());
  eq(svgClicks, 1);
  React.act(() => container.querySelectorAll("button")[0].click());
  eq(resets, 0, "first click only arms the reset");
  eq(labels()[0], "Really clear?");
  React.act(() => container.querySelectorAll("button")[0].click());
  eq(resets, 1, "second click resets");
  React.act(() => root.unmount());
});

test("renders nothing when no tool registered actions", function () {
  eq(renderHtml(sc.PlotActionsBar, { entryRef: { current: null } }), "");
});

suite("WhyThisTest");

test("folds the test justification into a details disclosure", function () {
  const html = renderHtml(sc.WhyThisTest, { text: "Welch is the default." });
  assert(html.includes("<details"), "details element");
  assert(html.includes("Why this test?"), "summary label");
  assert(html.includes("Welch is the default."), "reason text");
  eq(renderHtml(sc.WhyThisTest, { text: null }), "");
});

suite("MethodsButton");

test("opens a read-only paragraph built on demand and closes again", function () {
  const React = require("react");
  let built = 0;
  const { container, root } = renderWithEffects(sc.MethodsButton, {
    getText: () => {
      built++;
      return "The two groups were compared.";
    },
  });
  eq(built, 0, "text is built only when opened");
  const btn = container.querySelector('[data-testid="methods-button"]');
  assert(btn.textContent.includes("Methods"), "button label");
  React.act(() => btn.click());
  eq(built, 1);
  const text = container.querySelector('[data-testid="methods-text"]');
  eq(text.textContent, "The two groups were compared.");
  eq(container.querySelectorAll("textarea, input").length, 0, "read-only");
  const close = container.querySelector('[aria-label="Close"]');
  React.act(() => close.click());
  eq(container.querySelector('[data-testid="methods-popover"]'), null);
  React.act(() => root.unmount());
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

suite("ValueListPanel");

const ReactVL = require("react");

// Group column "Grp" (A ×2, B, C) + filter column "Rep" (1, 2) + value column.
function valueListProps(over) {
  return Object.assign(
    {
      headers: ["Grp", "Rep", "Val"],
      colNames: ["Genotype", "Replicate", "Biomass"],
      colRoles: ["group", "filter", "value"],
      filters: {
        0: { unique: ["A", "B", "C"], included: new Set(["A", "B", "C"]) },
        1: { unique: ["1", "2"], included: new Set(["1", "2"]) },
        2: { unique: ["5", "6", "7", "8"], included: new Set(["5", "6", "7", "8"]) },
      },
      rows: [
        ["A", "1", "5"],
        ["A", "2", "6"],
        ["B", "1", "7"],
        ["C", "2", "8"],
      ],
      valueRenames: {},
      orderableCols: {
        0: { order: ["A", "B", "C"], onReorder: noop },
        1: { order: ["1", "2"], onReorder: noop },
      },
      applyRename: (_i, v) => v,
      filteredCount: 4,
      totalCount: 4,
      onToggle: noop,
      onToggleAll: noop,
      onRenameVal: noop,
    },
    over
  );
}
const renameInputs = (el) =>
  [...el.querySelectorAll("input.dv-input")].map((i) => i.getAttribute("aria-label"));

test("one card per group / filter column, none for the value column", function () {
  const { container, root } = renderWithEffects(sc.ValueListPanel, valueListProps());
  const cards = [...container.querySelectorAll("section")].map((c) => c.getAttribute("aria-label"));
  eq(cards.join("|"), "Genotype|Replicate");
  const grp = container.querySelector('[data-testid="value-list-0"]');
  // Row counts come from the unfiltered rows.
  eq(
    [...grp.querySelectorAll("li")].map((li) => li.textContent.match(/n=\d+/)[0]).join(","),
    "n=2,n=1,n=1"
  );
  ReactVL.act(() => root.unmount());
});

test("values follow the full stored order; an unticked one stays in its slot", function () {
  const props = valueListProps();
  props.orderableCols[0] = { order: ["C", "B"], fullOrder: ["C", "A", "B"], onReorder: noop };
  props.filters[0] = { unique: ["A", "B", "C"], included: new Set(["B", "C"]) };
  const { container, root } = renderWithEffects(sc.ValueListPanel, props);
  const grp = container.querySelector('[data-testid="value-list-0"]');
  eq(renameInputs(grp).join("|"), "Rename C|Rename A|Rename B");
  const rows = grp.querySelectorAll("li");
  const dropped = rows[1].querySelector("input.dv-input");
  eq(dropped.style.textDecoration, "line-through", "unticked value is struck through in place");
  eq(rows[1].querySelectorAll("button").length, 2, "and can still be moved, as in qPCR");
  eq(rows[0].querySelector('button[aria-label="Move C up"]').disabled, true);
  eq(rows[2].querySelector('button[aria-label="Move B down"]').disabled, true);
  ReactVL.act(() => root.unmount());
});

test("arrows reorder the labels, checkboxes and All / None call back", function () {
  const reorders = [];
  const toggles = [];
  const bulk = [];
  const props = valueListProps({
    onToggle: (i, v) => toggles.push(i + ":" + v),
    onToggleAll: (i, on) => bulk.push(i + ":" + on),
  });
  props.orderableCols[0].onReorder = (o) => reorders.push(o.join(","));
  const { container, root } = renderWithEffects(sc.ValueListPanel, props);
  const grp = container.querySelector('[data-testid="value-list-0"]');
  ReactVL.act(() => grp.querySelector('button[aria-label="Move B up"]').click());
  ReactVL.act(() => grp.querySelector('button[aria-label="Move A down"]').click());
  eq(reorders.join(" / "), "B,A,C / B,A,C");
  ReactVL.act(() => grp.querySelector('input[aria-label="Keep C"]').click());
  eq(toggles.join(","), "0:C");
  const all = grp.querySelector('button[aria-label="Keep every value of Genotype"]');
  eq(all.disabled, true, "All is disabled when nothing is dropped");
  ReactVL.act(() => grp.querySelector('button[aria-label="Drop every value of Genotype"]').click());
  eq(bulk.join(","), "0:false");
  ReactVL.act(() => root.unmount());
});

test("renamed values show their old name; same-name values merge and move together", function () {
  const reorders = [];
  const renames = { 0: { A: "WT", B: "WT" } };
  const props = valueListProps({
    valueRenames: renames,
    applyRename: (i, v) => (renames[i] && renames[i][v] != null ? renames[i][v] : v),
  });
  props.orderableCols[0] = { order: ["WT", "C"], onReorder: (o) => reorders.push(o.join(",")) };
  const { container, root } = renderWithEffects(sc.ValueListPanel, props);
  const grp = container.querySelector('[data-testid="value-list-0"]');
  eq(renameInputs(grp).join("|"), "Rename A|Rename B|Rename C");
  assert(grp.textContent.includes("merged · A") && grp.textContent.includes("merged · B"));
  // Only the first row of a merged label carries the arrows.
  eq(grp.querySelectorAll('button[aria-label="Move WT down"]').length, 1);
  ReactVL.act(() => grp.querySelector('button[aria-label="Move C up"]').click());
  eq(reorders.join(""), "C,WT");
  ReactVL.act(() => root.unmount());
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
  const styleProps = (extra) => ({
    groups: sampleGroups,
    yLabel: "Value",
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
    ...extra,
  });
  // IQR boxes are the only rects with stroke-width 1.5; medians the only
  // lines with stroke-width 2.5.
  const boxRects = (html) => html.match(/<rect[^>]*stroke-width="1.5"[^>]*>/g) || [];
  const medianLines = (html) => html.match(/<line[^>]*stroke-width="2.5"[^>]*>/g) || [];

  test("default boxes: rounded corners, outline + median in group colour", function () {
    const html = renderHtml(BoxplotChart, styleProps({}));
    const rects = boxRects(html);
    const meds = medianLines(html);
    eq(rects.length, sampleGroups.length);
    eq(meds.length, sampleGroups.length);
    sampleGroups.forEach((g, i) => {
      assert(rects[i].includes('rx="2"'), "rounded by default");
      assert(rects[i].includes(`stroke="${g.color}"`), "outline in group colour");
      assert(meds[i].includes(`stroke="${g.color}"`), "median in group colour");
    });
  });

  test("square corners drop the rx radius", function () {
    const rects = boxRects(renderHtml(BoxplotChart, styleProps({ boxCorners: "square" })));
    eq(rects.length, sampleGroups.length);
    rects.forEach((r) => assert(r.includes('rx="0"'), "square box should have rx=0: " + r));
  });

  test("custom outline colours box border and median together, fill unchanged", function () {
    const html = renderHtml(
      BoxplotChart,
      styleProps({ boxOutline: "custom", boxOutlineColor: "#000000" })
    );
    const rects = boxRects(html);
    const meds = medianLines(html);
    sampleGroups.forEach((g, i) => {
      assert(rects[i].includes('stroke="#000000"'), "black outline");
      assert(rects[i].includes(`fill="${g.color}"`), "fill stays the group colour");
      assert(meds[i].includes('stroke="#000000"'), "median follows the outline");
    });
  });

  test("custom outline colour is ignored while boxOutline is group", function () {
    const html = renderHtml(BoxplotChart, styleProps({ boxOutlineColor: "#000000" }));
    assert(!html.includes('stroke="#000000"'), "no black stroke without custom mode");
  });

  // Two outliers (30 above wHi, -20 below wLo) on top of five in-range values.
  const outlierGroups = [
    {
      name: "Spiky",
      color: "#648FFF",
      allValues: [-20, 3, 5, 7, 9, 11, 30],
      stats: { q1: 4, med: 7, q3: 10, wLo: 3, wHi: 11 },
      sources: [{ colIndex: 0, values: [-20, 3, 5, 7, 9, 11, 30], category: null }],
    },
  ];
  const blackMarks = (html) => html.match(/<circle[^>]*fill="#000"[^>]*>/g) || [];
  const groupPoints = (html) => html.match(/<circle[^>]*fill="#648FFF"[^>]*>/g) || [];

  test("outliers get a black mark on top of the coloured points by default", function () {
    const html = renderHtml(
      BoxplotChart,
      styleProps({ groups: outlierGroups, showPoints: true, jitterWidth: 0.4 })
    );
    eq(blackMarks(html).length, 2);
    eq(groupPoints(html).length, 7);
  });

  test("markOutliers off drops the black marks, coloured points stay", function () {
    const html = renderHtml(
      BoxplotChart,
      styleProps({ groups: outlierGroups, showPoints: true, jitterWidth: 0.4, markOutliers: false })
    );
    eq(blackMarks(html).length, 0);
    eq(groupPoints(html).length, 7);
  });

  test("outliers stay marked when points are hidden, whatever markOutliers says", function () {
    const html = renderHtml(
      BoxplotChart,
      styleProps({ groups: outlierGroups, showPoints: false, markOutliers: false })
    );
    eq(blackMarks(html).length, 2);
    eq(groupPoints(html).length, 0);
  });

  test("custom outline also draws the violin edge", function () {
    const html = renderHtml(
      BoxplotChart,
      styleProps({ plotStyle: "violin", boxOutline: "custom", boxOutlineColor: "#123456" })
    );
    const paths = html.match(/<path[^>]*stroke="#123456"[^>]*>/g) || [];
    eq(paths.length, sampleGroups.length);
    eq(medianLines(html).filter((l) => l.includes('stroke="#123456"')).length, sampleGroups.length);
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

  test("SkewAlert explains the skew, offers the clip, and notes the legend", function () {
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

  test("SkewAlert singular wording", function () {
    const html = renderHtml(tool.exports.SkewAlert, {
      skew: { ...SKEW, nOutliers: 1 },
      onApply: noop,
    });
    assert(html.indexOf("1 of 3000 cells (0.0%) stretches") !== -1, "singular verb");
    assert(html.indexOf("Exclude 1 outlier from the colour scale") !== -1, "singular button");
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
    const dist = at('hc_dist <- function(x) as.dist(1 - cor(t(x), use = "pairwise.complete.obs"))');
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
  const { ProportionsChart, StatsPanel, GofPanel, ProportionsStatsDisplayBar } = tool.exports;
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
    assert(/data-testid="proportions-dl-r"[^>]*>R script</.test(html), "R script export");
    assert(/data-testid="proportions-dl-txt"[^>]*>Report \.txt</.test(html), "report export");
    assert(!html.includes("Display on plot"), "display controls live in the toolbar");
    assert(html.includes("Cochran"), "selection reason");
    assert(html.includes("Pearson χ²(3) = 94.537, p = 2.3e-20"));
    assert(html.includes("Cramér&#x27;s V = 0.704 · N = 191"));
    assert(html.includes('data-testid="proportions-pairs"'));
    assert(html.includes("p (Holm)"));
    assert(html.includes("+6.14"), "standardised residual");
  });

  test("display bar: Display on plot offers Off / Letters / Brackets (letters only for ≥ 3 groups)", () => {
    const html = renderHtml(ProportionsStatsDisplayBar, { analysis, vis, updVis: noop });
    assert(html.includes("Display on plot"));
    const seg = html.match(/aria-label="Display on plot"[^>]*>(.*?)<\/div>/s)[1];
    eq(
      [...seg.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]).join("|"),
      "Off|Letters|Brackets"
    );
    assert(/aria-pressed="true"[^>]*>Brackets</.test(seg), "brackets active");
    assert(!/disabled=""[^>]*data-testid="proportions-show-ns"/.test(html), "show ns enabled");
    const cldHtml = renderHtml(ProportionsStatsDisplayBar, {
      analysis,
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
    const two = renderHtml(ProportionsStatsDisplayBar, {
      analysis: P.analyseTable(t2, "auto", "holm"),
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
    assert(html.includes('id="significance-brackets-PR1"'), "brackets named per gene");
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
    assert(cld.includes('id="cld-annotations-PR1"'), "letters named per gene");
    assert(!cld.includes('id="significance-brackets-PR1"><g'), "no brackets with letters");
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
    const br = html.match(/<g id="significance-brackets-PR1">(.*?)<\/g><\/g>/s);
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

  test("stats panel: Statistics heading, ΔCt explainer, decision trace, R / report exports", () => {
    const html = renderHtml(QpcrStatsPanel, {
      genes,
      stats,
      normalize: "control",
      control: "Mock",
      overrides: {},
      onOverride: noop,
      vis,
      onDownloadReport: noop,
      onDownloadR: noop,
    });
    assert(/<h3[^>]*>Statistics<\/h3>/.test(html));
    assert(/data-testid="qpcr-dl-r"[^>]*>R script</.test(html), "R script export");
    assert(/data-testid="qpcr-dl-txt"[^>]*>Report \.txt</.test(html), "report export");
    assert(html.indexOf("Why the tests use ΔCt") < html.indexOf("R script"), "exports last");
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

suite("useHandoff");

// Install an in-memory sessionStorage so handoff.ts reads and writes a
// working per-test store regardless of the Node / happy-dom Storage globals.
Object.defineProperty(globalThis, "sessionStorage", {
  value: require("./helpers/_shell-test-utils").makeLocalStorage().localStorage,
  configurable: true,
  writable: true,
});
const clearHandoff = () => sessionStorage.removeItem("dataviz-handoff");

// Mounts a probe that records every payload `useHandoff(tool, …)` delivers.
// `tag` changes between renders to prove the listener calls the latest closure.
function mountHandoffProbe(tool) {
  const got = [];
  let rerender = null;
  function Probe() {
    const [tag, setTag] = React.useState("first");
    rerender = setTag;
    sc.useHandoff(tool, (p) => got.push({ csv: p.csv, tag }));
    return null;
  }
  const { root } = renderWithEffects(Probe, {});
  return { got, root, retag: (t) => React.act(() => rerender(t)) };
}

test("useHandoff delivers a payload already waiting at mount, then clears it", () => {
  clearHandoff();
  sc.setHandoff({ tool: "proportions", csv: "waiting" });
  const { got, root } = mountHandoffProbe("proportions");
  eq(got, [{ csv: "waiting", tag: "first" }]);
  eq(sessionStorage.getItem("dataviz-handoff"), null);
  React.act(() => root.unmount());
});

test("useHandoff receives same-tab writes with the latest closure", () => {
  clearHandoff();
  const { got, root, retag } = mountHandoffProbe("proportions");
  eq(got, []);
  retag("second");
  React.act(() => {
    sc.setHandoff({ tool: "proportions", csv: "live" });
  });
  eq(got, [{ csv: "live", tag: "second" }]);
  React.act(() => root.unmount());
});

test("useHandoff ignores payloads addressed to another tool and leaves them", () => {
  clearHandoff();
  const { got, root } = mountHandoffProbe("boxplot");
  React.act(() => {
    sc.setHandoff({ tool: "proportions", csv: "not mine" });
  });
  eq(got, []);
  assert(sessionStorage.getItem("dataviz-handoff") !== null);
  React.act(() => root.unmount());
  clearHandoff();
});

test("useHandoff stops listening after unmount", () => {
  clearHandoff();
  const { got, root } = mountHandoffProbe("boxplot");
  React.act(() => root.unmount());
  sc.setHandoff({ tool: "boxplot", csv: "too late" });
  eq(got, []);
  clearHandoff();
});

summary();

// ── 2.0 workspace chrome ────────────────────────────────────────────────────

// Same Node 25 caveat as sessionStorage above: give ControlTabs a working
// in-memory localStorage so the remembered-tab path is exercised.
Object.defineProperty(globalThis, "localStorage", {
  value: require("./helpers/_shell-test-utils").makeLocalStorage().localStorage,
  configurable: true,
  writable: true,
});

suite("ControlTabs");

const TABS = (React) => [
  {
    id: "groups",
    label: "Groups",
    content: React.createElement(sc.ControlSection, { title: "Palette" }, "palette body"),
  },
  { id: "style", label: "Style", content: "style body" },
  { id: "axes", label: "Axes", content: "axes body" },
];

test("first tab is selected by default; panels are linked and the rest hidden", function () {
  const React = require("react");
  localStorage.clear();
  const { container, root } = renderWithEffects(sc.ControlTabs, { tool: "t1", tabs: TABS(React) });
  const tabs = container.querySelectorAll('[role="tab"]');
  eq(tabs.length, 3);
  eq(tabs[0].getAttribute("aria-selected"), "true");
  eq(tabs[1].getAttribute("tabindex"), "-1", "roving tabindex");
  const panels = container.querySelectorAll('[role="tabpanel"]');
  eq(panels[0].id, tabs[0].getAttribute("aria-controls"));
  eq(panels[0].hidden, false);
  eq(panels[1].hidden, true);
  React.act(() => root.unmount());
});

test("a ControlSection inside a tab is an open titled group, not a fold-out", function () {
  const React = require("react");
  const { container, root } = renderWithEffects(sc.ControlTabs, { tool: "t2", tabs: TABS(React) });
  const group = container.querySelector("section.dv-ctrl-group");
  assert(group, "rendered as a group");
  assert(group.textContent.includes("palette body"), "body shown without opening");
  eq(group.querySelector(".dv-disclosure"), null, "no chevron");
  React.act(() => root.unmount());
  // Outside tabs the same section still folds.
  const html = renderHtml(sc.ControlSection, { title: "Palette", children: "palette body" });
  assert(html.includes("dv-disclosure") && !html.includes("palette body"));
});

test("click and arrow keys switch tabs; the choice is remembered per tool", function () {
  const React = require("react");
  localStorage.clear();
  const first = renderWithEffects(sc.ControlTabs, { tool: "boxplot", tabs: TABS(React) });
  const tabs = () => first.container.querySelectorAll('[role="tab"]');
  React.act(() => tabs()[1].click());
  eq(tabs()[1].getAttribute("aria-selected"), "true");
  eq(localStorage.getItem("plottr-tab-boxplot"), "style");
  const list = first.container.querySelector('[role="tablist"]');
  const key = (k) =>
    React.act(() => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    });
  key("ArrowRight");
  eq(localStorage.getItem("plottr-tab-boxplot"), "axes");
  key("ArrowRight");
  eq(localStorage.getItem("plottr-tab-boxplot"), "groups", "wraps around");
  key("End");
  eq(localStorage.getItem("plottr-tab-boxplot"), "axes");
  assert(document.activeElement === tabs()[2], "keyboard moves focus with selection");
  React.act(() => first.root.unmount());
  // A fresh mount reopens the remembered tab; another tool is unaffected.
  const again = renderWithEffects(sc.ControlTabs, { tool: "boxplot", tabs: TABS(React) });
  eq(again.container.querySelectorAll('[role="tab"]')[2].getAttribute("aria-selected"), "true");
  React.act(() => again.root.unmount());
  const other = renderWithEffects(sc.ControlTabs, { tool: "scatter", tabs: TABS(React) });
  eq(other.container.querySelectorAll('[role="tab"]')[0].getAttribute("aria-selected"), "true");
  React.act(() => other.root.unmount());
});

test("a remembered tab the tool no longer has falls back to the first", function () {
  const React = require("react");
  localStorage.setItem("plottr-tab-t3", "gone");
  const { container, root } = renderWithEffects(sc.ControlTabs, { tool: "t3", tabs: TABS(React) });
  eq(container.querySelectorAll('[role="tab"]')[0].getAttribute("aria-selected"), "true");
  React.act(() => root.unmount());
});

suite("WorkspaceLayout");

test("three labelled columns with an inspector, two without", function () {
  const three = renderHtml(sc.WorkspaceLayout, {
    controls: "C",
    figure: "F",
    inspector: "I",
    controlsLabel: "Plot controls",
    inspectorLabel: "Statistics",
  });
  assert(three.includes('data-columns="3"'));
  assert(three.includes('aria-label="Plot controls"') && three.includes('aria-label="Statistics"'));
  const two = renderHtml(sc.WorkspaceLayout, {
    controls: "C",
    figure: "F",
    controlsLabel: "Plot controls",
  });
  assert(two.includes('data-columns="2"'));
  assert(!two.includes("dv-workspace-inspector"), "no inspector column");
  assert(!two.includes("dv-workspace-toolbar"), "no toolbar row without a toolbar");
  const withBar = renderHtml(sc.WorkspaceLayout, {
    controls: "C",
    figure: "F",
    toolbar: "T",
    controlsLabel: "Plot controls",
  });
  assert(withBar.includes("dv-workspace-toolbar"));
});

test("each side column opens with a level-2 heading, and the layout adds no <main>", function () {
  // The h3 section titles inside need an h2 above them (h1 is the tool
  // name); PlotToolShell's body is the page's single <main>.
  const three = renderHtml(sc.WorkspaceLayout, {
    controls: "C",
    figure: "F",
    inspector: "I",
    controlsLabel: "Plot controls",
    inspectorLabel: "Statistics",
  });
  const h2s = [...three.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
  eq(JSON.stringify(h2s), JSON.stringify(["Plot controls", "Statistics"]));
  assert(!three.includes("<main"), "no nested main inside the tool body");
  const two = renderHtml(sc.WorkspaceLayout, {
    controls: "C",
    figure: "F",
    controlsLabel: "Plot controls",
  });
  eq([...two.matchAll(/<h2/g)].length, 1);
});

test("inspectorToggle: a rail opens the statistics column, which stays mounted while hidden", function () {
  const React = require("react");
  localStorage.removeItem("plottr-inspector-demo");
  const props = {
    controls: "C",
    figure: "F",
    inspector: React.createElement("p", { className: "stats" }, "I"),
    controlsLabel: "Plot controls",
    inspectorLabel: "Statistics",
    inspectorToggle: "demo",
  };
  const { container, root } = renderWithEffects(sc.WorkspaceLayout, props);
  const aside = container.querySelector(".dv-workspace-inspector");
  eq(aside.hidden, true, "closed by default");
  assert(container.querySelector(".stats"), "panel mounted while hidden (it feeds the plot)");
  eq(container.querySelector(".dv-workspace").getAttribute("data-columns"), "2");
  const rail = container.querySelector(".dv-inspector-rail");
  eq(rail.getAttribute("aria-label"), "Show Statistics");
  eq(rail.getAttribute("aria-controls"), aside.id);
  eq(
    rail.querySelector(".dv-inspector-rail-pill .dv-inspector-rail-label").textContent,
    "Statistics",
    "label sits in the blue pill"
  );
  React.act(() => rail.click());
  eq(aside.hidden, false);
  eq(container.querySelector(".dv-inspector-rail"), null, "rail gone while open");
  eq(localStorage.getItem("plottr-inspector-demo"), "open", "choice remembered");
  React.act(() => root.unmount());
  // Reopened from storage; Hide closes it again.
  const again = renderWithEffects(sc.WorkspaceLayout, props);
  const aside2 = again.container.querySelector(".dv-workspace-inspector");
  eq(aside2.hidden, false);
  const hide = again.container.querySelector(".dv-inspector-head button");
  eq(hide.textContent, "Hide");
  React.act(() => hide.click());
  eq(aside2.hidden, true);
  eq(localStorage.getItem("plottr-inspector-demo"), "closed");
  React.act(() => again.root.unmount());
});

test("PlotToolShell puts the step content in the page's <main>, after the app bar", function () {
  const html = renderHtml(sc.PlotToolShell, {
    state: {
      step: "upload",
      setStep: noop,
      fileName: "",
      commaFixed: false,
      commaFixCount: 0,
      injectionWarning: null,
      parseError: null,
      vis: {},
      updVis: noop,
    },
    toolName: "t",
    title: "Tool",
    visInit: {},
    steps: ["upload", "plot"],
    canNavigate: () => true,
    children: "STEP-BODY",
  });
  eq([...html.matchAll(/<main/g)].length, 1);
  const main = html.slice(html.indexOf("<main"));
  assert(main.includes("STEP-BODY"), "step content inside <main>");
  assert(html.indexOf("<header") < html.indexOf("<main"), "app bar before <main>");
});

test("InspectorSection renders its label as a heading", function () {
  const html = renderHtml(sc.InspectorSection, { label: "Omnibus test", children: "body" });
  assert(/<h3[^>]*>Omnibus test<\/h3>/.test(html));
  assert(html.includes("body"));
});

test("collapsible InspectorSection: a heading button toggles the body, badge stays", function () {
  const React = require("react");
  const { container, root } = renderWithEffects(sc.InspectorSection, {
    label: "WRKY33",
    right: React.createElement("span", { className: "badge" }, "****"),
    collapsible: true,
    defaultOpen: false,
    children: React.createElement("p", { className: "body" }, "stats"),
  });
  const btn = container.querySelector("h3 > button");
  assert(btn, "the title is a button inside the heading");
  eq(btn.getAttribute("aria-expanded"), "false");
  eq(container.querySelector(".body"), null, "collapsed: body not rendered");
  assert(container.querySelector(".badge"), "collapsed: the badge still shows");
  React.act(() => btn.click());
  eq(btn.getAttribute("aria-expanded"), "true");
  const body = container.querySelector(".body");
  assert(body, "expanded: body rendered");
  eq(body.parentElement.id, btn.getAttribute("aria-controls"));
  React.act(() => btn.click());
  eq(container.querySelector(".body"), null);
  React.act(() => root.unmount());
});

test("InspectorSection is not collapsible by default", function () {
  const html = renderHtml(sc.InspectorSection, { label: "Post-hoc", children: "rows" });
  assert(!html.includes("<button"), "no toggle");
  assert(html.includes("rows"));
});

suite("AppBar");

test("without app chrome it shows only the tool's steps and actions", function () {
  const html = renderHtml(sc.AppBar, { steps: "STEPS", actions: "ACTIONS" });
  assert(html.startsWith("<header"), "banner landmark");
  assert(html.includes("STEPS") && html.includes("ACTIONS"));
});

test("with app chrome it adds brand, switcher and utilities around the tool's content", function () {
  const React = require("react");
  const chrome = { brand: "BRAND", switcher: "SWITCH", utilities: "UTILS" };
  const Wrapped = () =>
    React.createElement(
      sc.AppChromeContext.Provider,
      { value: chrome },
      React.createElement(sc.AppBar, { steps: "STEPS", actions: "ACTIONS" })
    );
  const text = renderHtml(Wrapped, {}).replace(/<[^>]+>/g, "");
  eq(text, "BRANDSWITCHSTEPSACTIONSUTILS");
});

test("FileChip names the file and renders nothing without one", function () {
  assert(renderHtml(sc.FileChip, { name: "plants.csv" }).includes("plants.csv"));
  eq(renderHtml(sc.FileChip, { name: "" }), "");
});

suite("Group Plot statistics inspector");

(function () {
  const bp = loadTool("boxplot").exports;
  const range = (a, n, step = 1) => Array.from({ length: n }, (_, i) => a + i * step);
  const three = [
    { name: "WT", values: range(10, 8, 1.3) },
    { name: "abi4", values: range(11, 8, 1.1) },
    { name: "ox", values: range(20, 8, 1.2) },
  ];
  const panelProps = (sets, extra) => ({
    sets,
    setLabel: "Facet",
    fileStem: "plants",
    onAnnotationForKey: noop,
    onSummaryForKey: noop,
    displayMode: "none",
    showNs: false,
    showSummary: false,
    errorBarLabel: null,
    displayKind: "box",
    ...extra,
  });
  const headings = (container) =>
    [...container.querySelectorAll("h3.dv-tile-title")].map((h) => h.textContent);

  test("one set: its sections in order, the result line intact, then the exports", function () {
    const React = require("react");
    const { container, root } = renderWithEffects(
      bp.BoxplotStatsPanel,
      panelProps([{ key: "flat", name: "", groups: three }])
    );
    const hs = headings(container);
    eq(hs[0], "Omnibus test");
    eq(hs[1], "Assumptions checked");
    assert(hs[2].startsWith("Post-hoc · "), "post-hoc section for k = 3");
    eq(hs.slice(3).join("|"), "Groups|Replication planning");
    const line = container.querySelector('[data-testid="inspector-result-line"]');
    assert(
      /^F\(2, [\d.]+\) = [\d.]+$/.test(line.children[0].textContent),
      "F(df1, df2) kept whole"
    );
    assert(line.children[1].textContent.startsWith("p = "));
    const footer = container.querySelector(".dv-inspector-exports");
    const labels = [...footer.querySelectorAll("button")].map((b) => b.textContent);
    eq(labels[0], "R script");
    assert(labels.some((l) => l.includes("Methods")) && labels.includes("Report .txt"));
    eq(container.querySelectorAll(".dv-set-row").length, 0, "no set list for one set");
    React.act(() => root.unmount());
  });

  test("two groups: a two-group test and no post-hoc section", function () {
    const React = require("react");
    const { container, root } = renderWithEffects(
      bp.BoxplotStatsPanel,
      panelProps([{ key: "flat", name: "", groups: three.slice(0, 2) }])
    );
    const hs = headings(container);
    eq(hs[0], "Two-group test");
    assert(!hs.some((h) => h.startsWith("Post-hoc")));
    React.act(() => root.unmount());
  });

  test("several sets: a row per set, details open on demand, one-group sets explained", function () {
    const React = require("react");
    const sets = [
      { key: "a", name: "control", groups: three },
      { key: "b", name: "drought", groups: three.slice(0, 2) },
      { key: "c", name: "salt", groups: three.slice(0, 1) },
    ];
    const { container, root } = renderWithEffects(bp.BoxplotStatsPanel, panelProps(sets));
    const rows = container.querySelectorAll("button.dv-set-row");
    eq(rows.length, 2, "testable sets are buttons");
    assert(container.textContent.includes("Needs ≥ 2 groups"), "untestable set explained");
    eq(headings(container).filter((h) => h === "Omnibus test").length, 0, "collapsed at first");
    React.act(() => rows[0].click());
    eq(rows[0].getAttribute("aria-expanded"), "true");
    eq(headings(container).filter((h) => h === "Omnibus test").length, 1);
    React.act(() => root.unmount());
  });

  test("the panel reports chart annotations for the display mode it is given", function () {
    const React = require("react");
    const seen = [];
    const { root } = renderWithEffects(
      bp.BoxplotStatsPanel,
      panelProps([{ key: "flat", name: "", groups: three }], {
        displayMode: "brackets",
        onAnnotationForKey: (k, spec) => seen.push([k, spec && spec.kind]),
      })
    );
    eq(JSON.stringify(seen[seen.length - 1]), JSON.stringify(["flat", "brackets"]));
    React.act(() => root.unmount());
  });

  test("display bar: Letters need ≥ 3 groups; Show ns follows the mode", function () {
    const React = require("react");
    const calls = [];
    const props = (sets, mode) => ({
      sets,
      displayMode: mode,
      onDisplayModeChange: (m) => calls.push(m),
      showNs: true,
      onShowNsChange: noop,
      showSummary: false,
      onShowSummaryChange: noop,
    });
    const flat3 = [{ key: "flat", name: "", groups: three }];
    const flat2 = [{ key: "flat", name: "", groups: three.slice(0, 2) }];
    const seg = (c) => [...c.querySelectorAll(".dv-seg-btn")].map((b) => b.textContent).join("|");
    const ns = (c) => c.querySelectorAll('input[type="checkbox"]')[0];
    let r = renderWithEffects(bp.BoxplotStatsDisplayBar, props(flat3, "brackets"));
    eq(seg(r.container), "Off|Letters|Brackets");
    eq(ns(r.container).disabled, false);
    React.act(() => r.container.querySelectorAll(".dv-seg-btn")[1].click());
    eq(calls.join(","), "cld");
    React.act(() => r.root.unmount());
    r = renderWithEffects(bp.BoxplotStatsDisplayBar, props(flat3, "cld"));
    eq(ns(r.container).disabled, true, "letters already show every difference");
    React.act(() => r.root.unmount());
    r = renderWithEffects(bp.BoxplotStatsDisplayBar, props(flat2, "none"));
    eq(seg(r.container), "Off|Brackets");
    eq(ns(r.container).disabled, true, "nothing to mark when off");
    React.act(() => r.root.unmount());
  });
})();

suite("useExampleLink");

test("loads once for #/<tool>?example, cleans the hash, ignores other routes", function () {
  const React = require("react");
  let loads = 0;
  const Probe = () => {
    sc.useExampleLink("boxplot", () => loads++);
    return null;
  };
  window.history.replaceState(null, "", "#/boxplot?example");
  const { root } = renderWithEffects(Probe, {});
  eq(loads, 1, "loads at mount");
  eq(window.location.hash, "#/boxplot", "hash rewritten so a reload doesn't reload the example");
  React.act(() => {
    window.history.replaceState(null, "", "#/scatter?example");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  eq(loads, 1, "another tool's link is ignored");
  React.act(() => {
    window.history.replaceState(null, "", "#/boxplot?example");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  eq(loads, 2, "a later link to the mounted tool loads again");
  React.act(() => root.unmount());
  window.history.replaceState(null, "", "#/boxplot?example");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  eq(loads, 2, "no listener after unmount");
  window.history.replaceState(null, "", "#");
});

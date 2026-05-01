// Unit tests for tools/shared-prefs.js — persistence & validation logic.

const { suite, test, eq, assert, summary } = require("./harness");
const { freshContext } = require("./helpers/prefs-loader");

const sampleVisInit = {
  plotTitle: "",
  plotSubtitle: "",
  xAxisLabel: "",
  yAxisLabel: "",
  plotBg: "#ffffff",
  showGrid: true,
  gridColor: "#e0e0e0",
  boxOpacity: 0.15,
  pointRadius: 2.5,
  showPoints: true,
  errorType: "sem",
  xMin: null,
  xMax: null,
};

suite("shared-prefs.js — label key detection");

test("label keys match the Title/Subtitle/AxisLabel suffix", () => {
  const c = freshContext();
  assert(c.isLabelKey("plotTitle"), "plotTitle should be a label key");
  assert(c.isLabelKey("plotSubtitle"), "plotSubtitle should be a label key");
  assert(c.isLabelKey("xAxisLabel"), "xAxisLabel should be a label key");
  assert(c.isLabelKey("yAxisLabel"), "yAxisLabel should be a label key");
});

test("non-label keys do not match", () => {
  const c = freshContext();
  assert(!c.isLabelKey("plotBg"), "plotBg should not be a label key");
  assert(!c.isLabelKey("pointRadius"), "pointRadius should not be a label key");
  assert(!c.isLabelKey("xLabelAngle"), "xLabelAngle (angle, not label) should not match");
  assert(!c.isLabelKey("setLabelFontSize"), "setLabelFontSize should not match");
});

suite("shared-prefs.js — save / load round-trip");

test("style keys round-trip through localStorage", () => {
  const c = freshContext();
  const vis = {
    ...sampleVisInit,
    plotBg: "#000000",
    boxOpacity: 0.5,
    pointRadius: 4,
    showPoints: false,
    errorType: "sd",
  };
  c.flushAutoPrefs("boxplot", vis);
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded.plotBg, "#000000");
  eq(loaded.boxOpacity, 0.5);
  eq(loaded.pointRadius, 4);
  eq(loaded.showPoints, false);
  eq(loaded.errorType, "sd");
});

test("label keys are NOT persisted to localStorage", () => {
  const c = freshContext();
  const vis = {
    ...sampleVisInit,
    plotTitle: "Session title",
    xAxisLabel: "Time (s)",
    yAxisLabel: "Response",
    boxOpacity: 0.5,
  };
  c.flushAutoPrefs("boxplot", vis);
  const raw = JSON.parse(c.localStorage.getItem("dataviz-prefs-boxplot"));
  assert(!("plotTitle" in raw.settings), "plotTitle leaked into localStorage");
  assert(!("xAxisLabel" in raw.settings), "xAxisLabel leaked into localStorage");
  assert(!("yAxisLabel" in raw.settings), "yAxisLabel leaked into localStorage");
  eq(raw.settings.boxOpacity, 0.5);
});

test("loaded state falls back to visInit for label keys", () => {
  const c = freshContext();
  const vis = { ...sampleVisInit, plotTitle: "X", plotBg: "#000000" };
  c.flushAutoPrefs("boxplot", vis);
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded.plotTitle, "", "plotTitle should reset to visInit default");
  eq(loaded.plotBg, "#000000", "plotBg should be restored");
});

test("nullable numeric keys round-trip through saved numbers", () => {
  const c = freshContext();
  const vis = { ...sampleVisInit, xMin: 5, xMax: 100 };
  c.flushAutoPrefs("boxplot", vis);
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded.xMin, 5);
  eq(loaded.xMax, 100);
});

suite("shared-prefs.js — validation & rejection");

test("malformed JSON in localStorage falls back to visInit silently", () => {
  const c = freshContext();
  c.localStorage.setItem("dataviz-prefs-boxplot", "{{{not-json");
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded, sampleVisInit);
});

test("tool-name mismatch rejects the stored settings", () => {
  const c = freshContext();
  c.localStorage.setItem(
    "dataviz-prefs-boxplot",
    JSON.stringify({
      tool: "aequorin",
      version: 1,
      settings: { boxOpacity: 0.9 },
    })
  );
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded.boxOpacity, 0.15, "mismatched tool should not bleed in");
});

test("unknown keys in stored blob are silently dropped", () => {
  const c = freshContext();
  c.localStorage.setItem(
    "dataviz-prefs-boxplot",
    JSON.stringify({
      tool: "boxplot",
      version: 1,
      settings: { boxOpacity: 0.3, legacyKey: "gone", anotherOld: 42 },
    })
  );
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded.boxOpacity, 0.3);
  assert(!("legacyKey" in loaded), "unknown key leaked");
  assert(!("anotherOld" in loaded), "unknown key leaked");
});

test("type-mismatched values are dropped, good keys still apply", () => {
  const c = freshContext();
  c.localStorage.setItem(
    "dataviz-prefs-boxplot",
    JSON.stringify({
      tool: "boxplot",
      version: 1,
      settings: {
        boxOpacity: "not a number",
        pointRadius: 7,
        showGrid: "yes",
        plotBg: "#aabbcc",
      },
    })
  );
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  eq(loaded.boxOpacity, 0.15, "string value rejected for numeric key");
  eq(loaded.pointRadius, 7, "valid number accepted");
  eq(loaded.showGrid, true, "string value rejected for boolean key");
  eq(loaded.plotBg, "#aabbcc", "valid string accepted");
});

test("missing storage entry returns a clone of visInit (not the original)", () => {
  const c = freshContext();
  const loaded = c.loadAutoPrefs("boxplot", sampleVisInit);
  assert(loaded !== sampleVisInit, "must return a clone, not the same reference");
  eq(loaded, sampleVisInit);
});

suite("shared-prefs.js — exportPrefsFile & clearAutoPrefs");

test("exportPrefsFile writes full vis (labels included) via downloadText", () => {
  const c = freshContext();
  const vis = { ...sampleVisInit, plotTitle: "A figure", boxOpacity: 0.4 };
  c.exportPrefsFile("boxplot", vis);
  eq(c.downloadCalls.length, 1);
  eq(c.downloadCalls[0].filename, "boxplot-settings.json");
  const payload = JSON.parse(c.downloadCalls[0].text);
  eq(payload.tool, "boxplot");
  eq(payload.version, 1);
  eq(payload.settings.plotTitle, "A figure", "labels must be in exported file");
  eq(payload.settings.boxOpacity, 0.4);
});

test("clearAutoPrefs removes the tool's stored blob", () => {
  const c = freshContext();
  c.flushAutoPrefs("boxplot", { ...sampleVisInit, boxOpacity: 0.7 });
  assert(c.localStorage.getItem("dataviz-prefs-boxplot") !== null);
  c.clearAutoPrefs("boxplot");
  eq(c.localStorage.getItem("dataviz-prefs-boxplot"), null);
});

suite("shared-prefs.js — mergePrefsSettings direct");

test("mergePrefsSettings with onlyStyle=false includes labels", () => {
  const c = freshContext();
  const merged = c.mergePrefsSettings(
    sampleVisInit,
    { plotTitle: "Imported", boxOpacity: 0.9 },
    { onlyStyle: false }
  );
  eq(merged.plotTitle, "Imported");
  eq(merged.boxOpacity, 0.9);
});

test("mergePrefsSettings with onlyStyle=true drops labels", () => {
  const c = freshContext();
  const merged = c.mergePrefsSettings(
    sampleVisInit,
    { plotTitle: "Dropped", boxOpacity: 0.9 },
    { onlyStyle: true }
  );
  eq(merged.plotTitle, "", "label key must be dropped when onlyStyle is true");
  eq(merged.boxOpacity, 0.9);
});

// ── Audit-23 #1 — scatter + lineplot persisted slots round-trip ────────────

suite("shared-prefs.js — scatter/lineplot styling round-trip (audit-23 #1)");

const scatterVisInit = {
  plotTitle: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  pointColor: "#648FFF",
  pointSize: 5,
  pointOpacity: 0.8,
  strokeColor: "#000000",
  strokeWidth: 1,
  colorMapPalette: "viridis",
  colorMapDiscrete: {},
  sizeMapMin: 3,
  sizeMapMax: 15,
  sizeMapDiscrete: {},
  shapeMapDiscrete: {},
  refLines: [],
  regression: {
    on: false,
    color: "#dc2626",
    strokeWidth: 1.5,
    dashed: false,
    showStats: true,
    position: "tl",
  },
};

test("scatter — point styling round-trips through prefs", () => {
  const c = freshContext();
  const vis = {
    ...scatterVisInit,
    pointColor: "#ff00aa",
    pointSize: 9,
    pointOpacity: 0.4,
    strokeColor: "#222222",
    strokeWidth: 2,
  };
  c.flushAutoPrefs("scatter", vis);
  const loaded = c.loadAutoPrefs("scatter", scatterVisInit);
  eq(loaded.pointColor, "#ff00aa");
  eq(loaded.pointSize, 9);
  eq(loaded.pointOpacity, 0.4);
  eq(loaded.strokeColor, "#222222");
  eq(loaded.strokeWidth, 2);
});

test("scatter — per-category mapping dicts round-trip by category name", () => {
  const c = freshContext();
  const vis = {
    ...scatterVisInit,
    colorMapDiscrete: { Wildtype: "#0066cc", Mutant: "#cc3300" },
    sizeMapDiscrete: { low: 2, mid: 5, high: 8 },
    shapeMapDiscrete: { ctrl: "circle", treat: "triangle" },
  };
  c.flushAutoPrefs("scatter", vis);
  const loaded = c.loadAutoPrefs("scatter", scatterVisInit);
  eq(loaded.colorMapDiscrete.Wildtype, "#0066cc");
  eq(loaded.colorMapDiscrete.Mutant, "#cc3300");
  eq(loaded.sizeMapDiscrete.mid, 5);
  eq(loaded.shapeMapDiscrete.treat, "triangle");
});

test("scatter — refLines + regression sub-object round-trip", () => {
  const c = freshContext();
  const vis = {
    ...scatterVisInit,
    refLines: [
      { value: 0, axis: "y", color: "#888888", style: "dashed" },
      { value: 1, axis: "x", color: "#ff0000" },
    ],
    regression: {
      on: true,
      color: "#0099ff",
      strokeWidth: 2.5,
      dashed: true,
      showStats: false,
      position: "br",
    },
  };
  c.flushAutoPrefs("scatter", vis);
  const loaded = c.loadAutoPrefs("scatter", scatterVisInit);
  eq(loaded.refLines.length, 2);
  eq(loaded.refLines[0].axis, "y");
  eq(loaded.refLines[0].color, "#888888");
  eq(loaded.regression.on, true);
  eq(loaded.regression.color, "#0099ff");
  eq(loaded.regression.position, "br");
});

const lineplotVisInit = {
  plotTitle: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  groupColors: {},
  errorType: "sem",
  showStars: true,
};

test("lineplot — errorType + showStars round-trip", () => {
  const c = freshContext();
  const vis = { ...lineplotVisInit, errorType: "ci95", showStars: false };
  c.flushAutoPrefs("lineplot", vis);
  const loaded = c.loadAutoPrefs("lineplot", lineplotVisInit);
  eq(loaded.errorType, "ci95");
  eq(loaded.showStars, false);
});

summary();

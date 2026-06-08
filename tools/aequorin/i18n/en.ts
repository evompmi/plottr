// English catalog for the RLU Timecourse (aequorin) tool (namespace "aequorin").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App — parse errors / warnings (stored in parseMessage; the ⚠️ prefix
  // drives the warning-vs-error banner styling, so keep it on warnings).
  "aequorin.err.empty":
    "The file appears to be empty or has no data rows. Please check your file and try again.",
  "aequorin.err.oneColumn":
    "Only one column detected — this tool expects wide-format data with one column per sample. Check your separator setting or file format.",
  "aequorin.err.notNumeric":
    "Less than 30% of values are numeric. This tool expects a numeric matrix (one column per sample, one row per time-point). Your file may be in long format or contain mostly text.",
  "aequorin.err.exampleNotLoaded":
    "Example dataset not loaded. Please try uploading a file instead.",
  "aequorin.warn.longFormat":
    "⚠️ This looks like it could be long-format data (few columns, mix of text and numbers). This tool expects wide format — one column per sample, one row per time-point.",
  "aequorin.warn.differentLengths":
    "⚠️ Columns have different lengths ({min}–{max} numeric values). Some samples may have missing time-points, which can affect mean/SD calculations.",

  // App — series / layout toggles
  "aequorin.app.series": "Series",
  "aequorin.app.seriesDef": "Series definition",
  "aequorin.app.poolByName": "Pool by name",
  "aequorin.app.individual": "Individual",
  "aequorin.app.layout": "Layout",
  "aequorin.app.plotLayout": "Plot layout",
  "aequorin.app.combined": "Combined",
  "aequorin.app.faceted": "Faceted",

  // Chart
  "aequorin.chart.fallbackTitle": "RLU timecourse chart",
  "aequorin.chart.desc.one": "Time series chart with {count} series",
  "aequorin.chart.desc.other": "Time series chart with {count} series",
  "aequorin.chart.descX": ", X: {x}",
  "aequorin.chart.descY": ", Y: {y}",
  "aequorin.chart.traceAria": "Trace: {name}",
  "aequorin.chart.barAria": "Bar plot",
  "aequorin.chart.barTitle": "Inset bar plot",
  "aequorin.chart.barDesc.one": "Inset bar plot of {count} condition",
  "aequorin.chart.barDesc.other": "Inset bar plot of {count} conditions",

  // Controls — actions
  "aequorin.ctrl.csvTitle":
    "Download calibrated [Ca²⁺] over time — one row per time-point, one column per sample (calibration applied)",

  // Controls — sections
  "aequorin.ctrl.conditions": "Conditions",
  "aequorin.ctrl.axes": "Axes",
  "aequorin.ctrl.xStart": "X start ({unit})",
  "aequorin.ctrl.xEnd": "X end ({unit})",
  "aequorin.ctrl.yMin": "Y min",
  "aequorin.ctrl.yMax": "Y max",
  "aequorin.ctrl.autoOnTitle": "Re-enable auto-scaling of Y to the visible X window",
  "aequorin.ctrl.autoOffTitle": "Auto-scaling is on — Y follows the visible X window",
  "aequorin.ctrl.auto": "Auto",
  "aequorin.ctrl.autoOn": "Auto ✓",
  "aequorin.ctrl.smooth": "Smooth (±pts)",
  "aequorin.ctrl.smoothValue": "{n} pts",
  "aequorin.ctrl.displayUnit": "Display unit",

  "aequorin.ctrl.labels": "Labels",
  "aequorin.ctrl.title": "Title",
  "aequorin.ctrl.subtitle": "Subtitle",

  "aequorin.ctrl.style": "Style",
  "aequorin.ctrl.lineWidth": "Line width",
  "aequorin.ctrl.sdOpacity": "SD opacity",
  "aequorin.ctrl.plotHeight": "Plot height",

  "aequorin.ctrl.summaryBarplot": "Summary barplot",
  "aequorin.ctrl.summaryBarplotTitle": "Barplot of the sum (Σ) of plotted values per condition",
  "aequorin.ctrl.off": "Off",
  "aequorin.ctrl.on": "On",
  "aequorin.ctrl.layout": "Layout",
  "aequorin.ctrl.autoPlaceholder": "auto",
  "aequorin.ctrl.grid": "Grid",
  "aequorin.ctrl.gridColor": "Grid color",
  "aequorin.ctrl.xLabelAngle": "X label angle",
  "aequorin.ctrl.barWidth": "Bar width",
  "aequorin.ctrl.barGap": "Bar gap",
  "aequorin.ctrl.barFillOpacity": "Bar fill opacity",
  "aequorin.ctrl.barOutline": "Bar outline",
  "aequorin.ctrl.outlineWidth": "Outline width",
  "aequorin.ctrl.outlineColor": "Outline color",
  "aequorin.ctrl.errorBarsHead": "Error bars",
  "aequorin.ctrl.type": "Type",
  "aequorin.ctrl.errorBars": "Error bars",
  "aequorin.ctrl.none": "None",
  "aequorin.ctrl.errorStrokeWidth": "Error stroke width",
  "aequorin.ctrl.points": "Points",
  "aequorin.ctrl.show": "Show",
  "aequorin.ctrl.showPoints": "Show points",
  "aequorin.ctrl.color": "Color",
  "aequorin.ctrl.size": "Size",

  // Steps — formula preview + upload + configure
  "aequorin.steps.formulaAria": "Calibration formula with your parameter values substituted",
  "aequorin.steps.withYourValues": "With your values",
  "aequorin.steps.example.title": "Aequorin Ca²⁺ time-course",
  "aequorin.steps.example.subtitle": "Mutant vs WT response to a CO7 elicitor pulse",
  "aequorin.steps.example.button": "Plot this example →",
  "aequorin.steps.uploadHint":
    "CSV · TSV · TXT · DAT — one column per sample, one row per time-point · 2 MB max",
  "aequorin.steps.aes.calibration": "Aequorin calibration",
  "aequorin.steps.aes.time": "Time axis",
  "aequorin.steps.formula": "Formula",
  "aequorin.steps.formula.none": "None (raw data)",
  "aequorin.steps.formula.allenBlinks": "Allen & Blinks (1978)",
  "aequorin.steps.formula.hill": "Hill equilibrium",
  "aequorin.steps.formula.generalized": "Generalised Allen & Blinks",
  "aequorin.steps.kdLabel": "Kd (µM)",
  "aequorin.steps.hillExp": "n (Hill exp.)",
  "aequorin.steps.timeStep": "Time step (per row)",
  "aequorin.steps.baseUnit": "Base unit",
  "aequorin.steps.range": "Range: 0 – {end} {unit}",
  "aequorin.steps.loaded": "Loaded ",
  "aequorin.steps.loadedSummary": " — {samples} samples × {timepoints} time-points",
  "aequorin.steps.previewRaw": "raw data",
  "aequorin.steps.previewCalibrated": "calibrated data",
  "aequorin.steps.preview": "Preview — {kind} · {shown} of {total} columns (first 15 rows):",

  // Plot area
  "aequorin.pa.perReplicate": "Per replicate",
  "aequorin.pa.openInBoxplot": "↗ Open in Boxplot",
  "aequorin.pa.openInBoxplotTitle":
    "Open this per-replicate Σ data directly in the Group Plot tool (boxplot / violin / raincloud / bar)",
  "aequorin.pa.dragTip": "Tip: drag across the plot to set the time window. Adjust it in Axes.",
  "aequorin.pa.dragTipClear": " Click clear to reset.",
  "aequorin.pa.clear": "Clear",
  "aequorin.pa.resetTitle": "Reset the time window to the full data range",
  "aequorin.pa.samples": "Samples",
  "aequorin.pa.close": "✕ Close",
  "aequorin.pa.sampleSelection": "🔬 Sample selection",

  // Stats panel — test names
  "aequorin.test.studentT": "Student's t-test",
  "aequorin.test.welchT": "Welch's t-test",
  "aequorin.test.mannWhitney": "Mann-Whitney U",
  "aequorin.test.oneWayANOVA": "One-way ANOVA",
  "aequorin.test.welchANOVA": "Welch's ANOVA",
  "aequorin.test.kruskalWallis": "Kruskal-Wallis",
  "aequorin.posthoc.tukeyHSD": "Tukey HSD",
  "aequorin.posthoc.gamesHowell": "Games-Howell",
  "aequorin.posthoc.dunn": "Dunn (BH-adjusted)",

  // Stats panel — header + table
  "aequorin.sp.statistics": "Statistics",
  "aequorin.sp.desc": "Click the row to inspect decision trace, assumptions, post-hoc and power.",
  "aequorin.sp.txtTitle": "Download a plain-text stats report",
  "aequorin.sp.rTitle": "Download a runnable R script reproducing this test",
  "aequorin.sp.displayOnPlot": "Display on plot",
  "aequorin.sp.off": "Off",
  "aequorin.sp.letters": "Letters",
  "aequorin.sp.brackets": "Brackets",
  "aequorin.sp.showNs": "Show ns",
  "aequorin.sp.printSummary": "Print summary below plot",
  "aequorin.sp.groups": "Groups",
  "aequorin.sp.test": "Test",
  "aequorin.sp.statistic": "Statistic",
  "aequorin.sp.colP": "p",

  // Stats panel — detail
  "aequorin.sp.group": "Group",
  "aequorin.sp.n": "n",
  "aequorin.sp.mean": "Mean",
  "aequorin.sp.sd": "SD",
  "aequorin.sp.sem": "SEM",
  "aequorin.sp.ci95": "95% CI",
  "aequorin.sp.assumptions": "Assumptions",
  "aequorin.sp.shapiro": "Shapiro-Wilk (normality)",
  "aequorin.sp.normal": "normal",
  "aequorin.sp.notNormal": "not normal",
  "aequorin.sp.levene": "Levene",
  "aequorin.sp.equalVar": "equal variance",
  "aequorin.sp.unequalVar": "unequal variance",
  "aequorin.sp.recommendedSuffix": "  (recommended)",
  "aequorin.sp.useRecommendation": "Use recommendation",
  "aequorin.sp.suggestedAlt": "Suggested alternative:",
  "aequorin.sp.suggestConsider": "Shapiro-Wilk flagged non-normal data — consider ",
  "aequorin.sp.useSuggestion": "Use suggestion",
  "aequorin.sp.posthocPrefix": "Post-hoc — ",
  "aequorin.sp.pair": "Pair",
  "aequorin.sp.meanDiff": "Mean diff",
  "aequorin.sp.rankDiff": "Rank diff",
  "aequorin.sp.signif": "Signif.",
  "aequorin.sp.vs": "vs",
  "aequorin.sp.replication": "Replication planning (n for 80% power)",
  "aequorin.sp.replicationDesc":
    "Given the observed effect size, sample size a future study would need to detect this effect at 80% power.",
  "aequorin.sp.effectSize": "Effect size",
  "aequorin.sp.nFor80": "n for 80% power",
  "aequorin.sp.gt5000": "> 5000",
  "aequorin.sp.approxNote":
    "Approximation — rank-based test power estimated from its parametric analog.",

  // How-to card
  "aequorin.howto.title": "RLU Timecourse — How to use",
  "aequorin.howto.subtitle":
    "Plot any time-series of replicates (luminescence, fluorescence, OD, …) with replicate-derived error ribbons",
  "aequorin.howto.purpose":
    "Plot a measurement against time, one trace per condition, with replicate spread shown as a ribbon. Calibration is optional — leave the formula on <strong>None</strong> for raw data, or pick an aequorin / Ca²⁺ formula when you have luminescence to convert.",
  "aequorin.howto.dataLayout":
    "Wide format — one column per sample, one row per time-point. Numeric matrix; no time-axis column required (rows are evenly-spaced; you set the per-row time step + base unit). <strong>Columns sharing the same header are pooled as replicates of one condition</strong> — the chart plots their <strong>mean ± SD</strong> ribbon automatically. Rename headers to change which samples group together.",
  "aequorin.howto.display":
    "Each unique header becomes a coloured trace; same-name columns collapse into a mean ± SD ribbon under it. View the combined chart or a faceted small-multiples grid. Optional inset bar plot of integrated Σ-area per condition.",
} as const satisfies Catalog;

export default en;
export type AequorinKey = keyof typeof en;

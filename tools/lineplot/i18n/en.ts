// English catalog for the Line Plot tool (namespace "lineplot").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App
  "lineplot.err.empty":
    "The file appears to be empty or has no data rows. Please check your file and try again.",

  // Chart
  "lineplot.chart.fallbackTitle": "Line chart",
  "lineplot.chart.traceAria.one": "{name}: {n} x-point",
  "lineplot.chart.traceAria.other": "{name}: {n} x-points",

  // Downloads
  "lineplot.dl.statsCsv": "Stats CSV",
  "lineplot.dl.statsCsvTitle":
    "Download the per-x summary statistics (n, mean, SD, SEM, 95% CI) for every group",

  // Variables panel (also the configure-step aes boxes)
  "lineplot.tile.variables": "Variables",
  "lineplot.var.xAxis": "X axis",
  "lineplot.var.yAxis": "Y axis",
  "lineplot.var.groupBy": "Group by",
  "lineplot.var.singleLine": "(single line)",

  // Groups section
  "lineplot.sec.groups": "Groups",
  "lineplot.groups.empty": "No groups yet — pick a grouping column.",
  "lineplot.groups.lineStyleAria": "Line style for {name}",
  "lineplot.groups.pointShapeAria": "Point shape for {name}",
  "lineplot.groups.filled": "Filled marker — click for open",
  "lineplot.groups.open": "Open marker — click for filled",
  "lineplot.lineStyle.solid": "Solid",
  "lineplot.lineStyle.dashed": "Dashed",
  "lineplot.lineStyle.dotted": "Dotted",
  "lineplot.pointShape.circle": "Circle",
  "lineplot.pointShape.square": "Square",
  "lineplot.pointShape.triangle": "Triangle",
  "lineplot.pointShape.diamond": "Diamond",

  // Error bars section
  "lineplot.sec.errorBars": "Error bars",
  "lineplot.errorBars.aria": "Error bar type",
  "lineplot.err.none": "None",
  "lineplot.err.sem": "SEM",
  "lineplot.err.sd": "SD",
  "lineplot.err.ci95": "95% CI",

  // Axes section
  "lineplot.sec.axes": "Axes",
  "lineplot.axes.xMin": "X min",
  "lineplot.axes.xMax": "X max",
  "lineplot.axes.yMin": "Y min",
  "lineplot.axes.yMax": "Y max",
  "lineplot.axes.tickFontSize": "Text size",

  // Labels section
  "lineplot.sec.labels": "Labels",
  "lineplot.labels.title": "Title",
  "lineplot.labels.subtitle": "Subtitle",
  "lineplot.labels.xLabel": "X label",
  "lineplot.labels.yLabel": "Y label",

  // Style section
  "lineplot.sec.style": "Style",
  "lineplot.style.lineWidth": "Line width",
  "lineplot.style.pointRadius": "Point radius",
  "lineplot.style.errorCapWidth": "Error cap width",

  // Upload step
  "lineplot.example.title": "Bacterial growth curves",
  "lineplot.example.subtitle": "3 strains × 5 timepoints × 3 replicates",
  "lineplot.upload.hint":
    "CSV · TSV · TXT — one row per observation, columns for X, Y, and grouping · 2 MB max",

  // Test / post-hoc display names
  "lineplot.test.studentT": "Student's t-test",
  "lineplot.test.welchT": "Welch's t-test",
  "lineplot.test.mannWhitney": "Mann-Whitney U",
  "lineplot.test.oneWayANOVA": "One-way ANOVA",
  "lineplot.test.welchANOVA": "Welch's ANOVA",
  "lineplot.test.kruskalWallis": "Kruskal-Wallis",
  "lineplot.posthoc.tukeyHSD": "Tukey HSD",
  "lineplot.posthoc.gamesHowell": "Games-Howell",
  "lineplot.posthoc.dunn": "Dunn (BH-adjusted)",

  // Per-x stats panel — header + table
  "lineplot.sp.pBH": "p (BH) = {p}",
  "lineplot.sp.analysisExports": "Analysis exports",
  "lineplot.sp.rScript": "R script",
  "lineplot.sp.reportTxt": "Report .txt",
  "lineplot.tab.data": "Data",
  "lineplot.tab.style": "Style",
  "lineplot.tab.axes": "Axes",
  "lineplot.controlsLabel": "Plot controls",
  "lineplot.sp.inspectorLabel": "Statistics",
  "lineplot.sp.title": "Statistics at each {x}",
  "lineplot.sp.xFallback": "x",
  "lineplot.sp.desc":
    "Click a row to see the decision trace, assumptions, and post-hoc details. P-values are BH-adjusted across the x-axis.",
  "lineplot.sp.reportTitle": "Download a plain-text report covering every x",
  "lineplot.sp.rTitle": "Download a runnable R script reproducing every per-x test",
  "lineplot.sp.displayOnPlot": "Display on plot",
  "lineplot.sp.off": "Off",
  "lineplot.sp.stars": "Stars",

  // Per-x expanded detail

  // How-to card
  "lineplot.howto.title": "Line Plot — How to use",
  "lineplot.howto.subtitle": "Mean ± error per group across an x-axis, with per-x significance",
  "lineplot.howto.purpose":
    "Plot how a measurement evolves across an x-axis variable (time, dose, concentration), one line per group. Replicates at the same X are averaged and their spread becomes the error bar.",
  "lineplot.howto.dataLayout":
    "Long format — one row per observation, with a numeric <strong>X</strong>, a numeric <strong>Y</strong>, and a categorical <strong>group</strong> column. Replicates share the same (X, group) pair. Error bars only render when a group has ≥ 2 replicates at that X.",
  "lineplot.howto.display":
    "Pick <strong>SEM</strong> (default), <strong>SD</strong>, or <strong>95% CI</strong> for error ribbons. At every X shared by ≥ 2 groups the right test is auto-routed (t / Welch / Mann-Whitney; ANOVA / Welch-ANOVA / Kruskal-Wallis); p-values are <strong>BH-adjusted</strong> across the X-axis and significance stars overlay the chart.",
} as const satisfies Catalog;

export default en;
export type LineplotKey = keyof typeof en;

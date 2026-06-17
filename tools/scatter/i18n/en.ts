// English catalog for the Scatter tool (namespace "scatter").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App
  "scatter.err.empty":
    "The file appears to be empty or has no data rows. Please check your file and try again.",
  "scatter.set.all": "All",
  "scatter.shapeWarning":
    "This column has {n} unique values — only 4 shapes are available. Categories beyond the 4th will cycle through the same shapes.",

  // Aesthetic boxes (configure + sidebar) + example
  "scatter.aes.color": "Color",
  "scatter.aes.size": "Size",
  "scatter.aes.shape": "Shape",
  "scatter.example.title": "Fisher's Iris dataset",
  "scatter.example.subtitle": "150 flowers × 4 measurements · 3 species",
  "scatter.upload.hint": "CSV · TSV · TXT — one column per variable, one row per point · 2 MB max",

  // Downloads + variables
  "scatter.dl.csv": "CSV",
  "scatter.dl.csvTitle":
    "Download the filtered data table — only the columns and rows currently drawn on the plot",
  "scatter.loaded": "Loaded ",
  "scatter.pastedData": "pasted data",
  "scatter.colsRows": " — {rows} rows × {cols} columns",
  "scatter.tile.variables": "Variables",
  "scatter.var.xAxis": "X axis",
  "scatter.var.yAxis": "Y axis",

  // Point style
  "scatter.sec.pointStyle": "Point style",
  "scatter.pt.color": "Color",
  "scatter.pt.size": "Size",
  "scatter.pt.opacity": "Opacity",
  "scatter.pt.stroke": "Stroke",
  "scatter.pt.strokeWidth": "Stroke width",
  "scatter.on": "On",
  "scatter.off": "Off",

  // Regression
  "scatter.reg.title": "Regression line",
  "scatter.reg.needPoints": "Need ≥ 2 points with variation in X.",
  "scatter.reg.slope": "slope: ",
  "scatter.reg.intercept": "intercept: ",
  "scatter.reg.r2": "R²: ",
  "scatter.reg.undefined": "undefined",
  "scatter.reg.nEq": "n = ",
  "scatter.reg.color": "Color",
  "scatter.reg.width": "Width",
  "scatter.reg.dashed": "Dashed",
  "scatter.reg.showEq": "Show equation & R² on plot",
  "scatter.reg.labelPos": "Label position",
  "scatter.reg.tl": "top-left",
  "scatter.reg.tr": "top-right",
  "scatter.reg.bl": "bottom-left",
  "scatter.reg.br": "bottom-right",

  // Reference lines
  "scatter.ref.title": "Reference line",
  "scatter.ref.addH": "+ H",
  "scatter.ref.addV": "+ V",
  "scatter.ref.none": "No reference lines.",
  "scatter.ref.yEq": "Y =",
  "scatter.ref.xEq": "X =",
  "scatter.ref.width": "Width",
  "scatter.ref.dashed": "Dashed",
  "scatter.ref.labelPlaceholder": "label",
  "scatter.ref.right": "right",
  "scatter.ref.left": "left",
  "scatter.ref.top": "top",
  "scatter.ref.bottom": "bottom",

  // Aesthetic mapping detection
  "scatter.aes.none": "— None —",
  "scatter.aes.detected": "Detected: ",
  "scatter.aes.continuous": "numeric (continuous)",
  "scatter.aes.categorical.one": "categorical ({n} group)",
  "scatter.aes.categorical.other": "categorical ({n} groups)",
  "scatter.aes.range": "range: {min} → {max}",
  "scatter.aes.cbSafe": " · 👁",
  "scatter.aes.cbSafeNote": "👁 colour-blind-safe",
  "scatter.size.min": "Min size",
  "scatter.size.max": "Max size",

  // Axes section
  "scatter.sec.axes": "Axes",
  "scatter.axes.xMin": "X min",
  "scatter.axes.xMax": "X max",
  "scatter.axes.yMin": "Y min",
  "scatter.axes.yMax": "Y max",
  "scatter.axes.auto": "auto ({v})",
  "scatter.axes.xLabel": "X label",
  "scatter.axes.yLabel": "Y label",
  "scatter.axes.title": "Title",
  "scatter.axes.tickFontSize": "Text size",

  // Style + filters
  "scatter.sec.style": "Style",
  "scatter.filters.title": "Filters",
  "scatter.filters.rows": "{shown} of {total} rows",
  "scatter.filters.all": "all",

  // Chart
  "scatter.chart.fallbackTitle": "Scatter plot",
  "scatter.chart.pointsAria.one": "{n} data point",
  "scatter.chart.pointsAria.other": "{n} data points",
  "scatter.chart.regressionAria":
    "Linear regression: slope {slope}, intercept {intercept}, R² {r2}, n={n}",

  // Correlation test names
  "scatter.corr.pearson": "Pearson r",
  "scatter.corr.spearman": "Spearman ρ",
  "scatter.corr.kendall": "Kendall τ",

  // Stats panel — detail
  "scatter.sp.variables": "Variables",
  "scatter.sp.axis": "Axis",
  "scatter.sp.n": "n",
  "scatter.sp.mean": "Mean",
  "scatter.sp.sd": "SD",
  "scatter.sp.assumptions": "Assumptions",
  "scatter.sp.normal": "normal",
  "scatter.sp.notNormal": "not normal",
  "scatter.sp.test": "Test",
  "scatter.sp.recommendedSuffix": "  (recommended)",
  "scatter.sp.useRecommendation": "Use recommendation",
  "scatter.sp.suggestedAlt": "Suggested alternative:",
  "scatter.sp.suggestConsider": "Shapiro-Wilk flagged non-normal data — consider ",
  "scatter.sp.useSuggestion": "Use suggestion",
  "scatter.sp.kendallNote":
    "Kendall τ does not ship an analytic CI — bootstrap if a CI is required.",

  // Stats panel — header + table
  "scatter.sp.headingSingle": "Correlation",
  "scatter.sp.headingGroup": "Correlation by group",
  "scatter.sp.desc":
    "Click a row to inspect assumptions, switch tests, and read the full coefficient + CI.",
  "scatter.sp.descMulti": " Tests run independently per group.",
  "scatter.sp.txtTitleSingle": "Download a plain-text correlation report",
  "scatter.sp.txtTitleMulti": "Download a plain-text correlation report covering every group",
  "scatter.sp.rTitleSingle": "Download a runnable R script reproducing cor.test on this set",
  "scatter.sp.rTitleMulti": "Download a runnable R script reproducing cor.test for every group",
  "scatter.sp.colGroup": "Group",
  "scatter.sp.colTest": "Test",
  "scatter.sp.colStatistic": "Statistic",
  "scatter.sp.colP": "p",

  // How-to card
  "scatter.howto.title": "Scatter Plot — How to use",
  "scatter.howto.subtitle": "XY scatter with optional colour / size / shape mapping",
  "scatter.howto.purpose":
    "Plot one numeric column against another. Map a third (or fourth, or fifth) column to point colour, size, or shape to surface multivariate structure in a single view.",
  "scatter.howto.dataLayout":
    "One row per point. At least two <strong>numeric</strong> columns (the X and Y axes). Extra columns — categorical or numeric — become aesthetic mappings or filters.",
  "scatter.howto.display":
    "Optional colour-by-column (continuous gradient or discrete swatches), size-by-column, and shape-by-column. Add <strong>reference lines</strong> at fixed X / Y values, overlay a <strong>linear regression</strong> with R² + p-value. Filter rows by any categorical column.",
} as const satisfies Catalog;

export default en;
export type ScatterKey = keyof typeof en;

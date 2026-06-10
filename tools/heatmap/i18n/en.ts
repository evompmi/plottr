// English catalog for the Heatmap tool (namespace "heatmap").

import type { Catalog } from "../../_core/i18n";

const en = {
  // Downloads
  "heatmap.dl.csv": "CSV",
  "heatmap.dl.csvTitle":
    "Download the plotted matrix as CSV — normalisation and row / column reordering applied",
  "heatmap.dl.r": "R script",
  "heatmap.dl.rTitle":
    "Download a runnable R script that reproduces this plot with pheatmap (includes the raw matrix, clustering, normalisation, palette)",

  // Cluster-mode control
  "heatmap.cluster.none": "None",
  "heatmap.cluster.hier": "Hier.",
  "heatmap.cluster.kmeans": "K-means",
  "heatmap.cluster.k": "k",
  "heatmap.cluster.rows": "Rows",
  "heatmap.cluster.columns": "Columns",
  "heatmap.cluster.modeAria": "{label} clustering mode",

  // Section titles
  "heatmap.sec.normalisation": "Normalisation",
  "heatmap.sec.clustering": "Clustering",
  "heatmap.sec.colourScale": "Colour scale",
  "heatmap.sec.cellBorders": "Cell borders",
  "heatmap.sec.labels": "Labels",

  // Normalisation options
  "heatmap.norm.none": "None",
  "heatmap.norm.zrow": "Z row",
  "heatmap.norm.zcol": "Z col",
  "heatmap.norm.log2": "log₂",

  // Distance / linkage
  "heatmap.dist.heading": "Hierarchical · Distance",
  "heatmap.dist.aria": "Distance metric",
  "heatmap.dist.euclidean": "Euclidean",
  "heatmap.dist.manhattan": "Manhattan",
  "heatmap.dist.correlation": "1 − r",
  "heatmap.link.heading": "Hierarchical · Linkage",
  "heatmap.link.aria": "Linkage method",
  "heatmap.link.average": "Average",
  "heatmap.link.complete": "Complete",
  "heatmap.link.single": "Single",

  // Dendrogram toggles + note
  "heatmap.dendro.rowHeading": "Hierarchical · Row dendrogram",
  "heatmap.dendro.colHeading": "Hierarchical · Column dendrogram",
  "heatmap.dendro.rowAria": "Show row dendrogram",
  "heatmap.dendro.colAria": "Show column dendrogram",
  "heatmap.dendro.note":
    "Leaf order + cluster structure stay applied when hidden. Drag on the heatmap to open a zoomed selection if you still need per-cluster exports. Applies to both the main and zoomed plots.",
  "heatmap.on": "On",
  "heatmap.off": "Off",

  // K-means seed
  "heatmap.kmeans.seed": "K-means · Seed",
  "heatmap.kmeans.seedNote": "Change the seed to try a different k-means++ initialisation.",

  // Colour scale
  "heatmap.colour.palette": "Palette",
  "heatmap.colour.diverging": "  (diverging)",
  "heatmap.colour.cbSafe": " · 👁",
  "heatmap.colour.cbSafeNote": "👁 colour-blind-safe",
  "heatmap.colour.direction": "Direction",
  "heatmap.colour.directionAria": "Palette direction",
  "heatmap.colour.normal": "Normal",
  "heatmap.colour.inverted": "Inverted",
  "heatmap.colour.min": "Min",
  "heatmap.colour.max": "Max",
  "heatmap.colour.auto": "Auto from data",

  // Cell borders
  "heatmap.border.width": "Width",

  // Labels section
  "heatmap.labels.title": "Title",
  "heatmap.labels.subtitle": "Subtitle",
  "heatmap.labels.xAxis": "X-axis label",
  "heatmap.labels.yAxis": "Y-axis label",
  "heatmap.labels.rowNames": "Row names",
  "heatmap.labels.colNames": "Column names",
  "heatmap.labels.rowNamesAria": "Show row names",
  "heatmap.labels.colNamesAria": "Show column names",

  // Chart (baked into SVG export)
  "heatmap.chart.cluster": "Cluster n° {n}",
  "heatmap.chart.colorbarAria": "Colourbar: values range from {min} to {max}",
  // Accessible chart description (role=img title/desc + group aria-labels)
  "heatmap.chart.fallbackTitle": "Heatmap",
  "heatmap.chart.descRows.one": "{n} row",
  "heatmap.chart.descRows.other": "{n} rows",
  "heatmap.chart.descCols.one": "{n} column",
  "heatmap.chart.descCols.other": "{n} columns",
  "heatmap.chart.desc": "Heatmap of {rows} × {cols}{clustering}",
  "heatmap.chart.descClustering": ", with clustering",
  "heatmap.chart.cellsAria": "Matrix of {rows} × {cols}, values from {min} to {max}",
  "heatmap.chart.rowLabelsAria.one": "{n} row label",
  "heatmap.chart.rowLabelsAria.other": "{n} row labels",
  "heatmap.chart.colLabelsAria.one": "{n} column label",
  "heatmap.chart.colLabelsAria.other": "{n} column labels",

  // App — parse error + step label
  "heatmap.err.matrix":
    "The file needs at least one row label column and one data column with a header.",
  "heatmap.step.importCheck": "Import check",
  "heatmap.cfg.pastedData": "Pasted data",
  "heatmap.cfg.parsed": " — parsed {rows} rows × {cols} columns",
  "heatmap.cfg.nonNumeric.one": "{n} non-numeric cell rendered as NaN",
  "heatmap.cfg.nonNumeric.other": "{n} non-numeric cells rendered as NaN",
  "heatmap.cfg.large": "matrix is large — clustering may take a few seconds",
  "heatmap.cfg.clusterCapped":
    "matrix too large to cluster ({max}+ on an axis) — showing file order",
  "heatmap.table.summary": "Show values as table",
  "heatmap.table.caption": "Heatmap values — {rows} rows × {cols} columns, in display order",
  "heatmap.table.truncated": "Large matrix — showing the first {shown} of {total} rows.",
  "heatmap.table.rowHeader": "Row",
  "heatmap.plot.clear": "Clear",
  "heatmap.plot.dragHint":
    "↳ Drag on the heatmap or click a dendrogram / k-means band to open a zoomed view",

  // Upload step
  "heatmap.example.title": "Gene-expression matrix",
  "heatmap.example.subtitle": "500 genes × 6 samples (3 Control · 3 Stress) · clustered demo",
  "heatmap.upload.hint":
    "CSV · TSV · TXT — first column = row labels, first row = column labels, rest numeric · 2 MB max",

  // How-to card
  "heatmap.howto.title": "Heatmap — How to use",
  "heatmap.howto.subtitle": "Numeric matrix with optional row / column clustering",
  "heatmap.howto.purpose":
    "Visualise a 2D numeric matrix (genes × samples, taxa × conditions, distance matrix). Reorder rows + columns by hierarchical or k-means clustering to surface structure.",
  "heatmap.howto.dataLayout":
    "Wide matrix — first column holds the row labels (genes / features), the header row holds the column labels (samples / conditions), the rest is a numeric grid. Missing values are tolerated.",
  "heatmap.howto.display":
    "Pick a <strong>palette</strong> (continuous viridis-family or diverging), optional <strong>z-score</strong> / <strong>log₂</strong> normalisation per row or column, and independent row / column clustering modes (<strong>hierarchical</strong> with linkage + distance metric, or <strong>k-means</strong> with explicit k). Drag-select any region for a zoomed detail view.",
} as const satisfies Catalog;

export default en;
export type HeatmapKey = keyof typeof en;

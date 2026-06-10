// English catalog for the Volcano tool (namespace "volcano").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App — parse error, axis fallback, example, upload hint
  "volcano.err.fewCols":
    "The file appears empty or has fewer than two columns. Volcano expects at least a log2FC and a p-value column.",
  "volcano.xLabelFallback": "log₂(fold change)",
  "volcano.example.title": "Mock DESeq2 results",
  "volcano.example.subtitle": "200 features · plant circadian transcriptomics",
  "volcano.upload.hint":
    "CSV · TSV · TXT · one row per feature · expects log2FC + p-value columns · 2 MB max",

  // Chart — class labels (summary / accessible legend), title fallback
  "volcano.class.ns": "not significant",
  "volcano.class.down": "downregulated",
  "volcano.class.up": "upregulated",
  "volcano.chart.fallbackTitle": "Volcano plot",
  "volcano.chart.pointsTotal.one": "{n} point total",
  "volcano.chart.pointsTotal.other": "{n} points total",
  // Accessible chart description (role=img desc + per-class group aria-labels)
  "volcano.chart.descPoints.one": "{n} point",
  "volcano.chart.descPoints.other": "{n} points",
  "volcano.chart.desc":
    "Volcano plot of {points}: {up} up, {down} down, {ns} not significant{discarded}",
  "volcano.chart.descDiscarded": ", {n} discarded",
  "volcano.chart.classPointsAria.one": "{count} {label} point",
  "volcano.chart.classPointsAria.other": "{count} {label} points",
  // Accessible data table
  "volcano.table.summary": "Show points as table",
  "volcano.table.caption":
    "{n} points with log₂ fold-change, p-value, and significance class, in file order",
  "volcano.table.truncated": "Many points — showing the first {shown} of {total}.",
  "volcano.table.colLabel": "Label",
  "volcano.table.colFc": "log₂FC",
  "volcano.table.colP": "p",
  "volcano.table.colClass": "Class",
  "volcano.table.noLabel": "(unlabelled)",

  // Aesthetic tile headers
  "volcano.aes.x": "X axis · log₂ fold change",
  "volcano.aes.y": "Y axis · p-value (−log₁₀)",
  "volcano.aes.label": "Feature label (optional)",
  "volcano.aes.colorMap": "Color",
  "volcano.aes.sizeMap": "Size",

  // Thresholds tile
  "volcano.thresh.title": "Thresholds",
  "volcano.thresh.fcCutoff": "|log2FC| cutoff",
  "volcano.thresh.pCutoff": "p-value cutoff",
  "volcano.thresh.none": "None",
  "volcano.thresh.showRefLines": "Show reference lines",
  "volcano.on": "On",
  "volcano.off": "Off",

  // Colors tile
  "volcano.colors.title": "Colors",
  "volcano.colors.up": "Up-regulated",
  "volcano.colors.down": "Down-regulated",
  "volcano.colors.ns": "Not significant",

  // Label search
  "volcano.search.label": "Search by name",
  "volcano.search.placeholder": "gene name (or paste a list)",
  "volcano.search.inputTitle": "Comma- or newline-separated. Case-insensitive substring.",
  "volcano.search.add": "Add",
  "volcano.search.disabledTitle": "Pick a label column in Configure to enable search",
  "volcano.search.typeTitle": "Type a name to search",
  "volcano.search.addTitle.one": "Add {n} matched point to the labelled set",
  "volcano.search.addTitle.other": "Add {n} matched points to the labelled set",
  "volcano.search.disabledHint": "↳ Pick a label column in Configure to enable search",
  "volcano.search.placeholderHint": "↳ Comma- or newline-separated · case-insensitive substring",
  "volcano.search.noMatches": "no matches",
  "volcano.search.matches.one": "{n} match",
  "volcano.search.matches.other": "{n} matches",
  "volcano.search.overlap": " — labels may overlap",
  "volcano.search.unmatched": " · {n} unmatched",
  "volcano.search.showUnmatched": "show unmatched",
  "volcano.search.hideUnmatched": "hide unmatched",
  "volcano.search.unmatchedToggleTitle": "Toggle the list of tokens that matched zero points",

  // Configure step
  "volcano.cfg.adjusted": "This column is an <strong>adjusted</strong> p-value (FDR / BH / qvalue)",
  "volcano.cfg.adjustedNote":
    "Plotted as −log₁₀(p). Auto-detect prefers an adjusted column when both raw and adjusted are present.",
  "volcano.cfg.labelNone": "— none —",
  "volcano.cfg.labelNote":
    "Categorical column used to annotate the top-N most-significant features (gene symbol, protein name, accession). Skip if your data has no such column.",
  "volcano.cfg.assignWarn":
    "Assign both a <strong>log₂FC column</strong> and a <strong>p-value column</strong> to unlock the Plot step in the navigation above.",
  "volcano.cfg.pastedData": "(pasted data)",
  "volcano.cfg.colsRows": " — {cols} cols × {rows} rows",
  "volcano.cfg.preview": "Preview (first 8 rows):",

  // Downloads (plot step)
  "volcano.dl.csv": "CSV",
  "volcano.dl.csvTitle":
    "Download the per-feature classification table — feature, log2FC, p, −log10(p), class",
  "volcano.dl.r": "R",
  "volcano.dl.rTitle":
    "Download a self-contained ggplot2 R script that reproduces this volcano from the underlying data",

  // Plot step — clamped p=0 warning
  "volcano.steps.clamped.one":
    "{count} feature had p = 0; clamped to a finite floor for display so the y-axis stays bounded.",
  "volcano.steps.clamped.other":
    "{count} features had p = 0; clamped to a finite floor for display so the y-axis stays bounded.",

  // Labels tile
  "volcano.labels.title": "Labels",
  "volcano.labels.annotateTop": "Annotate top features",
  "volcano.labels.clicked.one": "{n} point clicked",
  "volcano.labels.clicked.other": "{n} points clicked",
  "volcano.labels.clearTitle":
    "Clear the manual selection — labelling falls back to the auto top-N picks",
  "volcano.labels.clear": "Clear",
  "volcano.labels.clickHint": "↳ Click any point on the chart to label it directly",
  "volcano.labels.topUp": "Top up-regulated",
  "volcano.labels.topDown": "Top down-regulated",
  "volcano.labels.fontSize": "Font size",
  "volcano.labels.densityWarn":
    "{forced} of {attempted} labels couldn't place cleanly at this data density.",
  "volcano.labels.dropTitle":
    "Drop top-N to ({up} up / {down} down) so every label places without overlap.",
  "volcano.labels.useSuggested": "Use suggested ({up} / {down})",

  // Style tile
  "volcano.style.title": "Style",
  "volcano.style.plotWidth": "Plot width",
  "volcano.style.pointRadius": "Point radius",
  "volcano.style.pointAlpha": "Point alpha",
  "volcano.style.showGrid": "Show grid",
  "volcano.style.tickFontSize": "Tick label size",
  "volcano.style.plotTitle": "Plot title",
  "volcano.style.optional": "(optional)",

  // Color/Size mapping tiles
  "volcano.map.none": "— None —",
  "volcano.map.detected": "Detected: ",
  "volcano.map.continuous": "numeric (continuous)",
  "volcano.map.categorical.one": "categorical ({n} group)",
  "volcano.map.categorical.other": "categorical ({n} groups)",
  "volcano.map.diverging": "  (diverging)",
  "volcano.map.direction": "Direction",
  "volcano.map.directionAria": "Palette direction",
  "volcano.map.normal": "Normal",
  "volcano.map.inverted": "Inverted",
  "volcano.map.range": "range: {min} → {max}",
  "volcano.size.minRadius": "Min radius",
  "volcano.size.maxRadius": "Max radius",
  "volcano.size.fallbackNote":
    "Non-numeric / blank cells fall back to the default radius from the Style tile.",

  // Summary tile
  "volcano.summary.up": "↑ up",
  "volcano.summary.down": "↓ down",
  "volcano.summary.ns": "· ns",
  "volcano.summary.ofValid": "of {n} valid",
  "volcano.summary.discarded": " (+{n} discarded)",
  "volcano.summary.cutoffs": "|log2FC| > {fc} · p < {p}",

  // How-to card
  "volcano.howto.title": "Volcano Plot — How to use",
  "volcano.howto.subtitle": "One row per feature · log₂FC on X · p-value (−log₁₀) on Y",
  "volcano.howto.purpose":
    "Highlight differentially expressed features by combining <strong>fold change</strong> with <strong>statistical significance</strong> — the canonical way to inspect RNA-seq, proteomics, or metabolomics tables.",
  "volcano.howto.dataLayout":
    "One <strong>row</strong> per feature. Two numeric columns: a <strong>log₂ fold change</strong> and a <strong>p-value</strong> (raw or adjusted). An optional <strong>label</strong> column (gene symbol, feature ID) drives annotations. DESeq2, limma, edgeR, MaxQuant column names auto-detect.",
  "volcano.howto.display":
    "Tweak <strong>|log₂FC|</strong> + <strong>p</strong> cutoffs in the Thresholds tile to set the up / down / ns split. Label features via auto top-N, click-to-label, or paste-list search in the Labels tile. Optional colour and size aesthetic mappings (e.g. expression level) render in-SVG legends.",
} as const satisfies Catalog;

export default en;
export type VolcanoKey = keyof typeof en;

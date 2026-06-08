// English catalog for the Group Plot (boxplot) tool (namespace "boxplot").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App
  "boxplot.err.empty":
    "The file appears to be empty or has no data rows. Please check your file and try again.",
  "boxplot.set.facet": "Facet",
  "boxplot.set.subgroup": "Subgroup",
  "boxplot.set.facetSubgroup": "Facet × Subgroup",

  // Chart
  "boxplot.chart.boxPlot": "Box plot",
  "boxplot.chart.barChart": "Bar chart",
  "boxplot.chart.descBox.one": "Box plot with {count} group",
  "boxplot.chart.descBox.other": "Box plot with {count} groups",
  "boxplot.chart.descBar.one": "Bar chart with {count} group",
  "boxplot.chart.descBar.other": "Bar chart with {count} groups",
  "boxplot.chart.descYAxis": ", Y axis: {y}",
  "boxplot.chart.mean": "mean",

  // Controls — wide banner
  "boxplot.ctrl.wideDetected": "Wide format auto-detected",
  "boxplot.ctrl.switchLong": "Switch to long pipeline",

  // Controls — conditions
  "boxplot.ctrl.conditions": "Conditions ({sel}/{total})",
  "boxplot.ctrl.selectedObs": "{sel} of {total} selected · {obs} obs",

  // Controls — plot style
  "boxplot.ctrl.plotStyle": "Plot style",
  "boxplot.ctrl.style.box": "Box",
  "boxplot.ctrl.style.violin": "Violin",
  "boxplot.ctrl.style.rain": "Rain",
  "boxplot.ctrl.style.bar": "Bar",
  "boxplot.ctrl.orientation": "Orientation",
  "boxplot.ctrl.vertical": "Vertical",
  "boxplot.ctrl.horizontal": "Horizontal",

  // Controls — shape & fill
  "boxplot.ctrl.shapeFill": "Shape & fill",
  "boxplot.ctrl.boxWidth": "Box width",
  "boxplot.ctrl.barWidth": "Bar width",
  "boxplot.ctrl.width": "Width",
  "boxplot.ctrl.boxGap": "Box gap",
  "boxplot.ctrl.barGap": "Bar gap",
  "boxplot.ctrl.gap": "Gap",
  "boxplot.ctrl.fillOpacity": "Fill opacity",
  "boxplot.ctrl.errorBars": "Error bars",
  "boxplot.ctrl.none": "None",
  "boxplot.ctrl.errStroke": "Error bar stroke",
  "boxplot.ctrl.barOutline": "Bar outline",
  "boxplot.ctrl.outlineWidth": "Outline width",
  "boxplot.ctrl.outlineColor": "Outline color",

  // Controls — data points
  "boxplot.ctrl.dataPoints": "Data points",
  "boxplot.ctrl.showPoints": "Show points",
  "boxplot.ctrl.colorBy": "Color by",
  "boxplot.ctrl.noneOption": "— none —",
  "boxplot.ctrl.compPies": "Composition pies",
  "boxplot.ctrl.size": "Size",
  "boxplot.ctrl.jitter": "Jitter",
  "boxplot.ctrl.opacity": "Opacity",

  // Controls — split by
  "boxplot.ctrl.splitBy": "Split by",
  "boxplot.ctrl.facetBy": "Facet by",
  "boxplot.ctrl.subgroupBy": "Subgroup by",
  "boxplot.ctrl.noneParen": "(none)",

  // Controls — axes & labels
  "boxplot.ctrl.axesLabels": "Axes & labels",
  "boxplot.ctrl.title": "Title",
  "boxplot.ctrl.yLabel": "Y label",
  "boxplot.ctrl.yMin": "Y min",
  "boxplot.ctrl.yMax": "Y max",
  "boxplot.ctrl.auto": "auto",
  "boxplot.ctrl.yScale": "Y scale",
  "boxplot.ctrl.linear": "Linear",
  "boxplot.ctrl.groupLabelAngle": "Group label angle",

  // Steps — aes boxes
  "boxplot.steps.aes.group": "Group (X axis)",
  "boxplot.steps.aes.value": "Value (Y axis)",

  // Steps — upload
  "boxplot.steps.example.title": "Plant biomass under drought & salt",
  "boxplot.steps.example.subtitle": "3 genotypes × 3 treatments × 8 replicates · 72 rows",
  "boxplot.steps.example.button": "Plot this example →",
  "boxplot.steps.uploadHint": "CSV · TSV · TXT · DAT — one row per observation · 2 MB max",

  // Steps — other columns
  "boxplot.steps.otherCols": "Other columns",
  "boxplot.steps.otherColsDesc":
    'Toggle <strong style="color:{c}">filter</strong> to keep the column available for the Filter step and for color / facet / subgroup mapping on the plot. Otherwise the column is ignored.',
  "boxplot.steps.filter": "filter",

  // Steps — configure
  "boxplot.steps.chooseGroup": "— choose a group column —",
  "boxplot.steps.chooseValue": "— choose a value column —",
  "boxplot.steps.displayAs": "Display as",
  "boxplot.steps.renameGroupTitle":
    "Rename the selected column. The new name is used on the X-axis label and in exports.",
  "boxplot.steps.renameValueTitle":
    "Rename the selected column. The new name is used on the Y-axis label and in exports.",
  "boxplot.steps.groupHint":
    "Categorical column that defines the X-axis groups (genotypes, treatments, …).",
  "boxplot.steps.valueHint": "Numeric column plotted as the Y-axis measurement.",
  "boxplot.steps.nonNumericConfigure":
    '⚠ Column <strong>"{name}"</strong> is assigned as <strong>value</strong> but appears to be non-numeric — the plot will be empty. Please assign a numeric column as value.',
  "boxplot.steps.assignGroupValue":
    'Assign at least one <strong style="color:{gc}">group</strong> and one <strong style="color:{vc}">value</strong> column to continue.',
  "boxplot.steps.colsRows": "{cols} cols × {rows} rows",
  "boxplot.steps.noHeader": " (no header)",
  "boxplot.steps.preview8": "Preview (first 8 rows):",

  // Steps — filter
  "boxplot.steps.preview": "Preview",
  "boxplot.steps.previewOf": "of {total} rows",
  "boxplot.steps.filteredOut": "filtered out",

  // Steps — output
  "boxplot.steps.filteredLong": "Filtered data (long)",
  "boxplot.steps.longCsv": "⬇ Long CSV",
  "boxplot.steps.reshapedWide": "Reshaped (wide)",
  "boxplot.steps.wideCsv": "⬇ Wide CSV",
  "boxplot.steps.unlabelled.one":
    '⚠ {count} row had an empty group cell — all merged under the "?" column.',
  "boxplot.steps.unlabelled.other":
    '⚠ {count} rows had an empty group cell — all merged under the "?" column.',
  "boxplot.steps.assignReshape":
    "⚠ Assign <strong>group</strong> + <strong>value</strong> columns to enable reshaping & stats.",
  "boxplot.steps.nonNumericOutput":
    '⚠ Column <strong>"{name}"</strong> is assigned as <strong>value</strong> but appears to be non-numeric — the plot will be empty. Go back to Configure and assign a numeric column as value.',

  // Stats panel — test names
  "boxplot.test.studentT": "Student's t-test",
  "boxplot.test.welchT": "Welch's t-test",
  "boxplot.test.mannWhitney": "Mann-Whitney U",
  "boxplot.test.oneWayANOVA": "One-way ANOVA",
  "boxplot.test.welchANOVA": "Welch's ANOVA",
  "boxplot.test.kruskalWallis": "Kruskal-Wallis",
  "boxplot.posthoc.tukeyHSD": "Tukey HSD",
  "boxplot.posthoc.gamesHowell": "Games-Howell",
  "boxplot.posthoc.dunn": "Dunn (BH-adjusted)",

  // Stats panel — header
  "boxplot.sp.statsAtEach": "Statistics at each {label}",
  "boxplot.sp.statistics": "Statistics",
  "boxplot.sp.desc": "Click a row to inspect decision trace, assumptions, post-hoc and power.",
  "boxplot.sp.descMulti": " Tests are independent per {label}.",
  "boxplot.sp.txtTitleSingle": "Download a plain-text stats report",
  "boxplot.sp.txtTitleMulti": "Download a plain-text report covering every {label}",
  "boxplot.sp.rTitleSingle": "Download a runnable R script reproducing these tests",
  "boxplot.sp.rTitleMulti": "Download a runnable R script reproducing every {label} test",
  "boxplot.sp.displayOnPlot": "Display on plot",
  "boxplot.sp.off": "Off",
  "boxplot.sp.letters": "Letters",
  "boxplot.sp.brackets": "Brackets",
  "boxplot.sp.showNs": "Show ns",
  "boxplot.sp.printSummary": "Print summary below plot",

  // Stats panel — table
  "boxplot.sp.set": "Set",
  "boxplot.sp.groups": "Groups",
  "boxplot.sp.test": "Test",
  "boxplot.sp.statistic": "Statistic",
  "boxplot.sp.colP": "p",
  "boxplot.sp.needsGroups": "Needs ≥ 2 groups with n ≥ 2 to run a test.",

  // Stats panel — detail
  "boxplot.sp.group": "Group",
  "boxplot.sp.n": "n",
  "boxplot.sp.mean": "Mean",
  "boxplot.sp.sd": "SD",
  "boxplot.sp.sem": "SEM",
  "boxplot.sp.ci95": "95% CI",
  "boxplot.sp.assumptions": "Assumptions",
  "boxplot.sp.shapiro": "Shapiro-Wilk (normality)",
  "boxplot.sp.normal": "normal",
  "boxplot.sp.notNormal": "not normal",
  "boxplot.sp.levene": "Levene",
  "boxplot.sp.equalVar": "equal variance",
  "boxplot.sp.unequalVar": "unequal variance",
  "boxplot.sp.recommendedSuffix": "  (recommended)",
  "boxplot.sp.useRecommendation": "Use recommendation",
  "boxplot.sp.suggestedAlt": "Suggested alternative:",
  "boxplot.sp.suggestConsider": "Shapiro-Wilk flagged non-normal data — consider ",
  "boxplot.sp.useSuggestion": "Use suggestion",
  "boxplot.sp.posthocPrefix": "Post-hoc — ",
  "boxplot.sp.pair": "Pair",
  "boxplot.sp.meanDiff": "Mean diff",
  "boxplot.sp.rankDiff": "Rank diff",
  "boxplot.sp.signif": "Signif.",
  "boxplot.sp.vs": "vs",
  "boxplot.sp.replication": "Replication planning (n for 80% power)",
  "boxplot.sp.replicationDesc":
    "Given the observed effect size, sample size a future study would need to detect this effect at 80% power.",
  "boxplot.sp.effectSize": "Effect size",
  "boxplot.sp.nFor80": "n for 80% power",
  "boxplot.sp.gt5000": "> 5000",
  "boxplot.sp.approxNote":
    "Approximation — rank-based test power estimated from its parametric analog.",

  // How-to card
  "boxplot.howto.title": "Group Plot — How to use",
  "boxplot.howto.subtitle": "Compare a numeric measurement across categorical groups",
  "boxplot.howto.purpose":
    "Side-by-side comparison of a numeric measurement across two or more groups (genotypes, treatments, conditions). Routes the right statistical test for the data shape and overlays the result.",
  "boxplot.howto.dataLayout":
    "<strong>Long</strong> (preferred) — one row per observation, with a categorical <strong>group</strong> column and a numeric <strong>value</strong> column. <strong>Wide</strong> (one column per group) is auto-detected and reshaped on the fly. Optional extra columns become filters / facets / sub-groups.",
  "boxplot.howto.display":
    "Switch between <strong>box</strong> / <strong>violin</strong> / <strong>raincloud</strong> / <strong>bar</strong>. Significance is computed automatically (<em>t</em> / Welch / Mann-Whitney for k = 2; ANOVA / Welch-ANOVA / Kruskal-Wallis with Tukey / Games-Howell / Dunn post-hoc for k ≥ 3) and rendered as brackets or compact-letter display.",
  "boxplot.howto.tips":
    "Pick a <strong>Color by</strong> column to map a second categorical to point colour; <strong>Facet by</strong> splits the chart into a small-multiples grid; <strong>Subgroup by</strong> nests a second factor inside each group's box.",
} as const satisfies Catalog;

export default en;
export type BoxplotKey = keyof typeof en;

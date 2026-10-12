// English catalog for the Proportions tool (namespace "proportions").

import type { Catalog } from "../../_core/i18n";

const en = {
  // Upload / examples / parse errors
  "proportions.example.title": "Mycorrhizal colonisation per plant",
  "proportions.example.subtitle": "4 genotypes · colonised vs. not colonised counts",
  "proportions.example.f2": "Or load a phenotype-ratio example (dihybrid F2, 9:3:3:1)",
  "proportions.upload.hint":
    "CSV · TSV · TXT · first column = group names · one column per outcome holding counts · 2 MB max",
  "proportions.err.tooFewColumns":
    "Expected a counts table: a first column of group names plus at least two outcome columns holding counts.",
  "proportions.err.tooFewRows": "Expected at least two groups (rows).",
  "proportions.err.notCount":
    "“{value}” (group “{group}”, column “{category}”) is not a count — every outcome cell must be a whole number ≥ 0. Percentages cannot be analysed here: enter the numbers of individuals.",
  "proportions.err.duplicateGroup":
    "Group “{group}” appears twice. Sum its rows into one before pasting.",
  "proportions.err.emptyLabel": "Row {row} has no group name in the first column.",
  "proportions.rest": "Other",

  // Configure step
  "proportions.cfg.pasted": "Pasted data",
  "proportions.cfg.shape": " — {groups} groups × {cats} outcome categories",
  "proportions.cfg.help":
    "Untick groups or outcomes to leave them out, and use the arrows to set their order on the chart.",
  "proportions.cfg.blank.one": "{count} blank cell was read as 0.",
  "proportions.cfg.blank.other": "{count} blank cells were read as 0.",
  "proportions.cfg.needTwo": "Keep at least two groups and two outcome categories.",
  "proportions.cfg.dropped":
    "Left out because they have no observations in the kept outcomes: {names}",
  "proportions.cfg.groups": "Groups (rows)",
  "proportions.cfg.categories": "Outcome categories (columns)",
  "proportions.cfg.include": "Include {name}",
  "proportions.cfg.up": "Move {name} up",
  "proportions.cfg.down": "Move {name} down",

  // Sidebar tiles
  "proportions.tile.chart": "Chart",
  "proportions.tile.colors": "Colours",
  "proportions.tile.style": "Style",
  "proportions.chart.type": "Chart type",
  "proportions.chart.typeProp": "Proportion",
  "proportions.chart.typePropTitle": "% of one outcome per group, with Wilson 95 % CIs",
  "proportions.chart.typeStacked": "Stacked",
  "proportions.chart.typeStackedTitle": "100 % stacked bars, one segment per outcome",
  "proportions.chart.typeMosaic": "Mosaic",
  "proportions.chart.typeMosaicTitle": "Stacked columns with widths proportional to group size",
  "proportions.chart.focus": "Outcome shown as %",
  "proportions.chart.focusNote":
    "The other outcomes are pooled; tests compare this outcome vs. the rest.",
  "proportions.chart.ci": "Wilson 95 % CI",
  "proportions.chart.segLabels": "Segment labels",
  "proportions.chart.segNone": "None",
  "proportions.chart.segCount": "Count",
  "proportions.chart.showN": "Sample size under groups",
  "proportions.colors.groups": "Bar colour per group",
  "proportions.colors.categories": "Colour per outcome",
  "proportions.style.width": "Plot width",
  "proportions.style.height": "Plot height",
  "proportions.style.barWidth": "Bar width",
  "proportions.style.outline": "Bar outline (black)",
  "proportions.style.outlineWidth": "Outline thickness",
  "proportions.style.labelAngle": "Group label angle",
  "proportions.style.font": "Font size",
  "proportions.style.title": "Title",
  "proportions.style.yLabel": "Y-axis label",
  "proportions.style.optional": "optional",
  "proportions.style.auto": "automatic",

  // Chart
  "proportions.chart.fallbackTitle": "Proportions chart",
  "proportions.chart.desc": "{groups} groups, {categories} outcome categories, {n} observations",
  "proportions.chart.yProp": "% {cat}",
  "proportions.chart.yStack": "% of observations",

  // Downloads
  "proportions.dl.csv": "CSV",
  "proportions.dl.csvTitle": "Counts, proportions and Wilson CIs (long format)",
  "proportions.dl.reportTitle": "Plain-text statistics report",
  "proportions.dl.rTitle": "R script reproducing every test and the chart",

  // Statistics panel
  "proportions.stats.focusNote":
    "Analysing “{cat}” vs. all other outcomes pooled (as on the chart). Switch to Stacked or Mosaic to test every outcome.",
  "proportions.stats.title": "Statistics",
  "proportions.stats.desc": "Counts with Wilson CIs and tests on the table shown in the chart.",
  "proportions.stats.displayOnPlot": "Display on plot",
  "proportions.stats.off": "Off",
  "proportions.stats.letters": "Letters",
  "proportions.stats.lettersTitle":
    "Compact letter display: groups sharing a letter do not differ (adjusted p ≥ 0.05)",
  "proportions.stats.brackets": "Brackets",
  "proportions.stats.showNs": "Show ns",
  "proportions.stats.summary": "Counts · % [Wilson 95 % CI]",
  "proportions.stats.group": "Group",
  "proportions.stats.catCol": "{cat}",
  "proportions.stats.wilsonNote":
    "Wilson score intervals (Brown, Cai & DasGupta 2001): unlike the textbook p ± 1.96·SE, they keep close to 95 % coverage for small n and for proportions near 0 or 100 %.",
  "proportions.stats.test": "Do the groups differ?",
  "proportions.stats.testChoice": "Test",
  "proportions.stats.auto": "Auto",
  "proportions.stats.reasonTwoByTwo":
    "2 groups × 2 outcomes → Fisher's exact test (exact p, no large-sample approximation).",
  "proportions.stats.reasonCochranOk":
    "Every expected count ≥ 1 and at most 20 % below 5 (Cochran's rule) → Pearson χ² test.",
  "proportions.stats.reasonCochranFail":
    "{below} of {cells} expected counts are below 5 (smallest {min}) → Fisher's exact test, because the χ² approximation is unreliable here.",
  "proportions.stats.overridden": "You overrode the recommended test.",
  "proportions.stats.tooSmall":
    "Need at least two groups and two outcomes with observations to run a test.",
  "proportions.stats.fisherLine": "Fisher's exact test ({dims}): p = {p}",
  "proportions.stats.orLine": "Odds ratio (conditional MLE) = {or}, 95 % CI [{lo}, {hi}]",
  "proportions.stats.chi2Line": "Pearson χ²({df}) = {x2}, p = {p}",
  "proportions.stats.cramerLine": "Cramér's V = {v} · N = {n}",
  "proportions.stats.mcNote":
    "This table is too large for full enumeration: p was estimated from {B} random tables with the same margins (Monte-Carlo SE ±{se}).",
  "proportions.stats.residuals": "Standardised residuals",
  "proportions.stats.residualsNote":
    "Observed minus expected, in standard-error units. Bold cells (|r| ≥ 1.96) are those driving the difference.",
  "proportions.stats.pairwise": "Pairwise comparisons (Fisher's exact test)",
  "proportions.stats.adjust": "Multiple-testing correction",
  "proportions.stats.holmTitle": "Holm: controls the chance of any false positive (family-wise)",
  "proportions.stats.bhTitle": "Benjamini–Hochberg: controls the false discovery rate",
  "proportions.stats.pair": "Pair",
  "proportions.stats.pAdj": "p ({method})",
  "proportions.stats.pairwiseNote":
    "Each pair is tested on its own 2-row table; adjusted p-values account for the number of pairs.",

  // Goodness of fit
  "proportions.gof.title": "Goodness of fit to an expected ratio",
  "proportions.gof.intro":
    "Test whether each group's counts match an expected ratio, e.g. a Mendelian segregation. Order: {cats}.",
  "proportions.gof.ratio": "Expected ratio",
  "proportions.gof.invalid": "Enter {k} positive numbers separated by “:”.",
  "proportions.gof.observed": "Observed",
  "proportions.gof.expected": "Expected",
  "proportions.gof.method": "Test",
  "proportions.gof.exact": "exact",
  "proportions.gof.pHolm": "p (Holm)",
  "proportions.gof.note":
    "Exact binomial / multinomial test when feasible (sum of the probabilities of every outcome no more likely than the observed one), otherwise χ². A small p means the counts depart from the ratio.",
  "proportions.gof.fallback":
    "Some groups were too large for the exact test; their p comes from the χ² approximation (reliable at these sample sizes).",

  // Accessible table
  "proportions.table.summary": "Show values as table",
  "proportions.table.caption": "Counts, proportions and Wilson 95 % CIs per group and outcome",

  // How-to
  "proportions.howto.title": "Proportions & Counts — How to use",
  "proportions.howto.subtitle": "Counts per group · Wilson CIs · Fisher / χ² · goodness of fit",
  "proportions.howto.purpose":
    "For outcomes you <strong>count</strong>: % germination, % colonised plants, survival, phenotype classes. Please don't run a t-test or ANOVA on percentages — their variance depends on the percentage itself, they are bounded by 0 and 100, and they hide how many individuals each one rests on. Tests on the counts themselves (Fisher's exact or χ²) do not have these problems, and Wilson intervals stay honest for small n (Brown, Cai &amp; DasGupta 2001, <em>Statistical Science</em> 16(2), doi:10.1214/ss/1009213286).",
  "proportions.howto.dataLayout":
    "A <strong>counts table</strong>: the first column holds group names, every other column one outcome, each cell the <strong>number of individuals</strong> (not a percentage). Example: <code>Genotype,Germinated,Not germinated</code> / <code>WT,46,4</code>. Pool replicate plates into one row per group. Note that pooling assumes the plates agree, so check them separately if in doubt.",
  "proportions.howto.display":
    "<strong>Proportion</strong> shows % of one outcome with Wilson 95 % CIs. <strong>Stacked</strong> and <strong>Mosaic</strong> show every outcome; mosaic widths follow group size. The test is picked automatically: Fisher's exact test for 2×2 tables or when expected counts are small, χ² otherwise. Pairwise comparisons use Holm correction by default. The goodness-of-fit panel tests counts against ratios such as 3:1 or 9:3:3:1.",
} as const satisfies Catalog;

export default en;
export type ProportionsKey = keyof typeof en;

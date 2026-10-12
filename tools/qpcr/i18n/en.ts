// English catalog for the qPCR tool (namespace "qpcr").

import type { Catalog } from "../../_core/i18n";

const en = {
  // Upload / errors
  "qpcr.example.title": "Arabidopsis drought / salt qPCR",
  "qpcr.example.subtitle":
    "2 reference + 2 target genes · 3 groups × 4 biological × 3 technical replicates",
  "qpcr.upload.hint":
    "CSV · TSV · TXT · long (Sample, Group, Gene, Ct — one row per well) or wide (Sample, Group, one Ct column per gene) · 2 MB max",
  "qpcr.err.tooFew": "Expected at least three columns: sample, group, and Ct values.",
  "qpcr.err.empty": "No usable rows: check the sample and group columns.",
  "qpcr.err.noGenes": "Need at least two genes (one reference and one target).",
  "qpcr.err.missingRole": "Choose the {role} column.",

  // Configure
  "qpcr.cfg.pasted": "Pasted data",
  "qpcr.cfg.shape": " — {wells} wells · {genes} genes · {groups} groups",
  "qpcr.cfg.layout": "Layout",
  "qpcr.cfg.long": "Long",
  "qpcr.cfg.longTitle":
    "One row per well — columns: sample, group, gene, Ct. Technical replicates are repeated rows.",
  "qpcr.cfg.wide": "Wide",
  "qpcr.cfg.wideTitle":
    "One row per biological sample — columns: sample, group, then one Ct column per gene.",
  "qpcr.cfg.colSample": "Biological sample",
  "qpcr.cfg.colGroup": "Group / condition",
  "qpcr.cfg.colGene": "Gene",
  "qpcr.cfg.colCt": "Ct / Cq",
  "qpcr.cfg.wideGenes": "Gene columns detected: {genes}",
  "qpcr.cfg.genes": "Genes",
  "qpcr.cfg.gene": "Gene",
  "qpcr.cfg.role": "Role",
  "qpcr.cfg.roleRef": "Reference",
  "qpcr.cfg.roleTarget": "Target",
  "qpcr.cfg.roleIgnore": "Ignore",
  "qpcr.cfg.roleFor": "Role of {gene}",
  "qpcr.cfg.eff": "Efficiency",
  "qpcr.cfg.effFor": "Amplification efficiency of {gene}",
  "qpcr.cfg.effHelp":
    "Efficiency as a percentage (95 %) or amplification factor (1.95). At 100 % for every gene the result is the classic 2^−ΔΔCt; other values give the efficiency-corrected (Pfaffl) ratio.",
  "qpcr.cfg.wells": "Wells",
  "qpcr.cfg.missing": "({n} without Ct)",
  "qpcr.cfg.needRoles": "Mark at least one reference gene and one target gene.",
  "qpcr.cfg.groups": "Groups",
  "qpcr.cfg.control": "Control group (calibrator, fold change = 1)",
  "qpcr.cfg.include": "Include {name}",
  "qpcr.cfg.up": "Move {name} up",
  "qpcr.cfg.down": "Move {name} down",
  "qpcr.cfg.preview":
    "First wells as read (technical replicates are averaged per biological sample and gene).",

  // Standard curve
  "qpcr.std.title": "Efficiency from a standard curve (optional)",
  "qpcr.std.help":
    "Paste a dilution series as Gene, Quantity, Ct (one row per well; quantity can be relative, e.g. 1, 0.1, 0.01). Efficiency = 10^(−1/slope) − 1 from the regression of Ct on log₁₀(quantity).",
  "qpcr.std.slope": "Slope",
  "qpcr.std.eff": "Efficiency",
  "qpcr.std.qc":
    "Highlighted values are outside the usual 90–110 % efficiency range or below R² = 0.98: check the dilution series.",
  "qpcr.std.apply": "Apply these efficiencies",

  // QC
  "qpcr.qc.title": "Quality checks",
  "qpcr.qc.missing.one":
    "{count} well has no Ct (undetermined); it is left out of its sample's mean.",
  "qpcr.qc.missing.other":
    "{count} wells have no Ct (undetermined); they are left out of their sample's mean.",
  "qpcr.qc.noisy.one": "{count} technical-replicate set differs by more than 0.5 cycles (SD):",
  "qpcr.qc.noisy.other": "{count} technical-replicate sets differ by more than 0.5 cycles (SD):",
  "qpcr.qc.genorm": "Reference-gene stability, geNorm M:",
  "qpcr.qc.genormHelp":
    "M is the average variation of each reference gene's ratio to the others across samples (Vandesompele et al. 2002); lower M means more stable expression.",
  "qpcr.qc.genormTwo":
    "With two reference genes both get the same M (their ratio cannot tell which one varies). Lower is more stable.",

  // Plot
  "qpcr.plot.dropped.one":
    "{count} sample was left out because a target or reference gene had no Ct.",
  "qpcr.plot.dropped.other":
    "{count} samples were left out because a target or reference gene had no Ct.",
  "qpcr.tile.chart": "Chart",
  "qpcr.tile.colors": "Colours",
  "qpcr.tile.style": "Style",
  "qpcr.chart.yScale": "Y axis",
  "qpcr.chart.scaleLog2": "log₂ FC",
  "qpcr.chart.scaleLog2Title":
    "Fold change on a log₂ axis: 2× up and 2× down are the same distance from 1",
  "qpcr.chart.scaleLinear": "FC",
  "qpcr.chart.scaleLinearTitle":
    "Fold change on a linear axis (exaggerates increases, compresses decreases)",
  "qpcr.chart.scaleDdctTitle": "−ΔΔCt: the log₂ values the statistics are computed on",
  "qpcr.chart.style": "Style",
  "qpcr.chart.bar": "Bars",
  "qpcr.chart.dot": "Dots",
  "qpcr.chart.points": "Biological replicates",
  "qpcr.chart.ci": "95 % CI",
  "qpcr.chart.yLog2": "Fold change (log₂ scale)",
  "qpcr.chart.yLinear": "Fold change",
  "qpcr.chart.yDdct": "−ΔΔCt",
  "qpcr.chart.fallbackTitle": "qPCR relative expression",
  "qpcr.chart.desc": "Relative expression of {genes}, normalised to the control group {control}",
  "qpcr.colors.groups": "Colour per group",
  "qpcr.style.facetWidth": "Panel width",
  "qpcr.style.facetHeight": "Panel height",
  "qpcr.style.facetCols": "Panels per row",
  "qpcr.style.barWidth": "Bar width",
  "qpcr.style.outline": "Bar outline (black)",
  "qpcr.style.outlineWidth": "Outline thickness",
  "qpcr.style.labelAngle": "Group label angle",
  "qpcr.style.font": "Font size",
  "qpcr.style.title": "Title",
  "qpcr.style.optional": "optional",
  "qpcr.dl.csvTitle": "Per-sample Ct, ΔCt, −ΔΔCt and fold change",
  "qpcr.dl.reportTitle": "Plain-text report: method, QC and per-gene statistics",
  "qpcr.dl.rTitle": "R script recomputing ΔCt from the raw Ct and running the same tests",

  // Statistics panel
  "qpcr.stats.title": "Statistics",
  "qpcr.stats.desc": "Tests on ΔCt per target gene; fold changes are back-transformed estimates.",
  "qpcr.stats.displayOnPlot": "Display on plot",
  "qpcr.stats.off": "Off",
  "qpcr.stats.letters": "Letters",
  "qpcr.stats.lettersTitle": "Groups sharing a letter do not differ (adjusted p ≥ 0.05)",
  "qpcr.stats.brackets": "Brackets",
  "qpcr.stats.showNs": "Show ns",
  "qpcr.stats.whyDctTitle": "Why the tests use ΔCt",
  "qpcr.stats.whyDct":
    "Ct values are on a log₂ scale, where biological variation is roughly normal and symmetric. Fold changes (2^−ΔΔCt) are exponentials of those values: they are skewed (a 4× increase sits far from 1, a 4× decrease is squeezed between 0 and 1), and dividing by the control mean forces the control group to average 1, which hides its own variability. So every test below runs on ΔCt; fold changes and their CIs are back-transformed from the same log-scale numbers.",
  "qpcr.stats.dontTestFc": "Do not run t-tests or ANOVA on 2^−ΔΔCt values.",
  "qpcr.stats.group": "Group",
  "qpcr.stats.meanDct": "ΔCt mean ± SD",
  "qpcr.stats.fcVsControl": "Fold change vs control [95 % CI]",
  "qpcr.stats.calibrator": "1 (calibrator)",
  "qpcr.stats.tableNote":
    "Fold change = 2^(mean ΔCt control − mean ΔCt group), i.e. a ratio of geometric means; its CI is the Welch 95 % CI of the ΔCt difference, back-transformed (hence asymmetric).",
  "qpcr.stats.noControl":
    "No sample of the control group {control} has Ct values for this gene: fold changes cannot be computed.",
  "qpcr.stats.needTwo":
    "Need at least two groups with two or more biological replicates to run a test.",
  "qpcr.stats.test": "Test",
  "qpcr.stats.auto": "Auto — {test}",
  "qpcr.stats.onDct": "on ΔCt",
  "qpcr.stats.posthoc": "Post-hoc: {name}",
  "qpcr.stats.pair": "Pair",
  "qpcr.stats.fc": "Fold change",
  "qpcr.stats.pAdj": "p (adjusted)",
  "qpcr.stats.sendLabel": "Group Plot",
  "qpcr.stats.send": "Send ΔCt of all genes",
  "qpcr.stats.sendTitle":
    "Open every target gene's ΔCt in Group Plot (one CSV), split by gene, for box / violin plots and its full statistics panel",
  "qpcr.stats.asFacets": "Gene = facets",
  "qpcr.stats.asFacetsTitle": "One panel per gene; groups on the x axis; statistics per gene",
  "qpcr.stats.asSubgroups": "Gene = subgroups",
  "qpcr.stats.asSubgroupsTitle": "One panel, groups clustered by gene; statistics per gene",
  "qpcr.test.studentT": "Student's t-test",
  "qpcr.test.welchT": "Welch's t-test",
  "qpcr.test.mannWhitney": "Mann-Whitney U",
  "qpcr.test.oneWayANOVA": "One-way ANOVA",
  "qpcr.test.welchANOVA": "Welch's ANOVA",
  "qpcr.test.kruskalWallis": "Kruskal-Wallis",
  "qpcr.posthoc.tukeyHSD": "Tukey HSD",
  "qpcr.posthoc.gamesHowell": "Games-Howell",
  "qpcr.posthoc.dunn": "Dunn (BH-adjusted)",

  // How-to
  "qpcr.howto.title": "qPCR Relative Expression — How to use",
  "qpcr.howto.subtitle": "Raw Ct → ΔCt → fold change · statistics on ΔCt",
  "qpcr.howto.purpose":
    "Relative quantification from raw Ct values: <strong>2^−ΔΔCt</strong> (Livak &amp; Schmittgen 2001, <em>Methods</em> 25(4):402–408, doi:10.1006/meth.2001.1262), <strong>efficiency-corrected ratios</strong> (Pfaffl 2001, <em>Nucleic Acids Res</em> 29(9):e45, doi:10.1093/nar/29.9.e45) and the <strong>geometric mean of several reference genes</strong> (Vandesompele et al. 2002, <em>Genome Biol</em> 3(7):research0034, doi:10.1186/gb-2002-3-7-research0034). The statistics run on <strong>ΔCt</strong>, never on fold changes.",
  "qpcr.howto.dataLayout":
    '<strong>Long</strong>: one row per well with <code>Sample, Group, Gene, Ct</code> (technical replicates are repeated rows and get averaged). <strong>Wide</strong>: one row per biological sample with <code>Sample, Group</code> then one Ct column per gene. "Undetermined", NA or blank Ct values are treated as missing.',
  "qpcr.howto.exLongCaption":
    "Long layout (most instrument exports): one row per well. Repeated rows for the same sample and gene are technical replicates and get averaged; “Undetermined” counts as missing. Sample ids may repeat across groups.",
  "qpcr.howto.exWideCaption":
    "Wide layout: one row per biological sample, one Ct column per gene (technical replicates already averaged). English headers (Sample, Group, Gene, Ct) are detected automatically; other names can be assigned in the Configure step.",
  "qpcr.howto.display":
    "Choose reference and target genes, efficiencies (typed or from a standard curve) and the control group. The plot shows fold change on a log₂ axis (switchable to linear or −ΔΔCt) with biological replicates and 95 % CIs; brackets or letters come from Welch's t-test / Welch's ANOVA + Games-Howell on ΔCt. Each gene's ΔCt can be sent to Group Plot.",
} as const satisfies Catalog;

export default en;
export type QpcrKey = keyof typeof en;

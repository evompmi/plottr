// English catalog for the static landing page (namespace "landing").
// Applied to index.html via data-i18n / data-i18n-html / data-i18n-title /
// data-i18n-aria / data-i18n-alt by `applyStaticI18n`. Shipped in
// tools/shared.bundle.js (registered in _core/shared-bundle-entry.ts) so the
// landing's inline script can swap copy without the SPA module bundle.
//
// `*.html` values carry authored markup (<em>, <b>, sub/superscripts);
// they are ours, not user input, so innerHTML application is safe.

import type { Catalog } from "../i18n";

const landingEn = {
  // Top bar
  "landing.nav.aria": "Main",
  "landing.nav.tools": "Tools",
  "landing.nav.benchmark": "Benchmark",
  "landing.nav.privacy": "Privacy",
  "landing.nav.cite": "Cite",
  "landing.nav.home": "Plöttr home",

  // Hero
  "landing.eyebrow": "Browser-only · no install · your data stays put",
  "landing.hero.title":
    "Paste a spreadsheet. Leave with the figure <em>and</em> the statistics behind it.",
  "landing.hero.lead":
    "Plöttr turns bench data into a publication-ready SVG, picks the test your data actually supports, and hands you the R script so a reviewer can rerun every number.",
  "landing.hero.choose": "Choose a plot",
  "landing.hero.example": "Try it on example data",

  // Specimen (Group Plot's example dataset, real output)
  "landing.spec.alt":
    "Box plot of biomass for WT, abi4 and oxSOS1 with significance brackets, drawn by Group Plot from its example data",
  "landing.spec.testChosen": "Test chosen",
  "landing.spec.testName": "Welch's ANOVA",
  "landing.spec.posthoc": "Post-hoc",
  "landing.spec.posthocName": "Games-Howell",
  "landing.spec.download": "You download",
  "landing.spec.caption": "Group Plot's example data, exactly as the tool draws and tests it.",

  // Proof strip
  "landing.proof.aria": "Why trust it",
  "landing.proof.benchmark": "comparisons against R 4.5 and SciPy 1.17",
  "landing.proof.benchmarkLink": "See the benchmark →",
  "landing.proof.privacy": "No server, no tracking",
  "landing.proof.privacyLink": "Your data never leaves the browser tab →",
  "landing.proof.cite": "MIT licensed, citable on Zenodo",
  "landing.proof.citeLink": "Get the citation →",

  // How it works
  "landing.hiw.aria": "How every plot tool works",
  "landing.hiw.step1": "Paste or drop a CSV",
  "landing.hiw.step1Desc": "Separator and decimal commas detected for you.",
  "landing.hiw.step2": "Assign column roles",
  "landing.hiw.step2Desc": "Say which column is the group and which is the measurement.",
  "landing.hiw.step3": "Tune the plot",
  "landing.hiw.step3Desc": "Style, facets and significance marks, with the stats updating live.",
  "landing.hiw.step4": "Download SVG + R",
  "landing.hiw.step4Desc": "The figure, plus a script that reproduces the analysis.",

  // Tools
  "landing.tools.title": "Start from your question",
  "landing.tools.note":
    "Ten plot types. Charts need a wide screen; the bench calculators work on a phone.",
  "landing.cat.compare": "Compare groups",
  "landing.cat.compareQ": "Do my conditions differ?",
  "landing.cat.trends": "Trends & relationships",
  "landing.cat.trendsQ": "How does it change?",
  "landing.cat.sets": "Sets & omics",
  "landing.cat.setsQ": "What overlaps, what stands out?",
  "landing.cat.bench": "At the bench · works on a phone",
  "landing.cat.benchQ": "Quick maths before the experiment",
  "landing.mobileHint":
    "<strong>Plot tools need a larger screen.</strong> Open Plöttr on a computer to make figures; the calculators below work here.",

  "landing.tool.boxplot.desc":
    "Box, violin, raincloud or bar, faceted, with the test picked from normality and variance checks.",
  "landing.tool.boxplot.tag": "ANOVA · Welch · Kruskal-Wallis · Tukey · Dunn",
  "landing.tool.proportions.desc": "% germination and phenotype counts.",
  "landing.tool.proportions.tag": "Fisher · χ² · Wilson CI",
  "landing.tool.qpcr.desc": "Raw Ct to fold change, with stats run on ΔCt.",
  "landing.tool.qpcr.tag": "ΔΔCt · Pfaffl",
  "landing.tool.scatter.desc": "XY with colour and size mapped to other columns.",
  "landing.tool.scatter.tag": "Pearson · Spearman · Kendall",
  "landing.tool.lineplot.desc": "Profile plot: mean ± error by group.",
  "landing.tool.lineplot.tag": "Tests at each x · BH",
  "landing.tool.aequorin.desc": "Luminescence traces, with optional Ca²⁺ calibration.",
  "landing.tool.aequorin.tag": "aequorin",
  "landing.tool.venn.desc": "2–3 sets",
  "landing.tool.upset.desc": "4+ sets",
  "landing.tool.heatmap.desc": "matrix + clustering",
  "landing.tool.volcano.desc": "log₂FC vs −log₁₀p",
  "landing.tool.power.desc": "Sample size and power for t, ANOVA, χ², r",
  "landing.tool.molarity.desc": "Molarity, dilution and batch prep sheets",

  // Theme toggle (title/aria) — set dynamically by index.html's inline
  // theme IIFE via t(); changes with the current mode.
  "landing.theme.toLight": "Switch to light mode",
  "landing.theme.toDark": "Switch to dark mode",

  // Cite + footer
  "landing.cite.title": "Used Plöttr in a paper?",
  "landing.cite.text": "Cite the archived release so readers can find the exact version you ran.",
  "landing.cite.copy": "Copy citation",
  "landing.cite.copied": "Copied",
  "landing.footer.mit": "MIT licensed",
} as const satisfies Catalog;

export default landingEn;
export type LandingKey = keyof typeof landingEn;

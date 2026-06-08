// English catalog for the UpSet tool (namespace "upset").

import type { Catalog } from "../../_core/i18n";

const en = {
  // App — parse errors
  "upset.err.empty": "The file appears to be empty or has no data rows.",
  "upset.err.parse": "Unable to parse set membership.",
  "upset.err.longSets": "Need at least 2 distinct set names in the second column.",
  "upset.err.wideSets": "Need at least 2 non-empty set columns.",

  // Chart
  "upset.chart.fallbackTitle": "UpSet plot",
  "upset.chart.barAria.one": "{label}: {size} element",
  "upset.chart.barAria.other": "{label}: {size} elements",

  // Downloads
  "upset.dl.table": "Table",
  "upset.dl.tableTitle":
    "Download the currently-plotted intersection table (Intersection, Degree, Size, + per-set flags). Matches the plot exactly — reflects sort, Top N, Minimum/Maximum degree, and Minimum size filters.",
  "upset.dl.matrix": "Matrix",
  "upset.dl.matrixTitle":
    "Download the membership matrix — one row per item, a 0/1 column for each active set",
  "upset.dl.allRegions": "All regions",
  "upset.dl.allRegionsTitle":
    "One CSV per currently-plotted intersection (named _I1, _I2, … matching the on-plot identifiers) plus an _index.csv mapping Id → Intersection, Degree, Size. Your browser may ask once to allow multiple downloads.",

  // Columns section
  "upset.sec.columns": "Columns",
  "upset.sort.label": "Sort by",
  "upset.sort.sizeDesc": "Size (largest first)",
  "upset.sort.sizeAsc": "Size (smallest first)",
  "upset.sort.degreeDesc": "Degree (highest first)",
  "upset.sort.degreeAsc": "Degree (lowest first)",
  "upset.sort.sets": "Set order",
  "upset.minSize": "Minimum intersection size",
  "upset.maxInData": "max in data: {n}",
  "upset.minDegree": "Minimum degree",
  "upset.maxDegree": "Maximum degree",

  // Labels section
  "upset.sec.labels": "Labels",
  "upset.label.title": "Title",
  "upset.label.subtitle": "Subtitle",

  // Display section
  "upset.sec.display": "Display",
  "upset.disp.barOpacity": "Bar opacity",
  "upset.disp.dotSize": "Dot size",
  "upset.disp.fontSize": "Font size",
  "upset.disp.intersectionLabels": "Intersection size labels",
  "upset.disp.setSizeLabels": "Set size labels",
  "upset.disp.background": "Background",

  // Statistics section
  "upset.sec.statistics": "Statistics",
  "upset.stat.universe": "Universe size (N)",
  "upset.stat.resetUniverse": "Reset to |∪|={n}",
  "upset.stat.resetUniverseTitle": "Revert to the union of uploaded items",
  "upset.stat.universeNote":
    "Defaults to the union of uploaded items (|∪|). Override with the genome / proteome / predefined background for real enrichment analyses — a smaller universe inflates p-values.",
  "upset.stat.intersectionStats": "Intersection statistics",
  "upset.stat.computeDisabledTitle": "Set a Universe size above before computing stats",
  "upset.stat.computingTitle": "Computing…",
  "upset.stat.computeTitle":
    "Run the SuperExactTest exact test for every one of the {n} intersections in the active set selection and BH-adjust across them. Display filters (minimum size / degree) do NOT change which intersections are tested.",
  "upset.stat.computingProgress": "Computing {done}/{total}…",
  "upset.stat.recompute": "Recompute stats ({n} intersections)",
  "upset.stat.compute": "Compute stats ({n} intersections)",
  "upset.stat.clearCached.one": "Clear {n} cached result",
  "upset.stat.clearCached.other": "Clear {n} cached results",
  "upset.stat.computeNote":
    "Computes the exact Binomial p (upper tail, lower tail, and the headline two-sided = smaller tail × 2) per intersection, then BH-adjusts each family across every intersection in the active set selection. Display filters (minimum size / degree) only affect what's shown on the plot — they never change the BH family.",
  "upset.stat.sigMarkers": "Significance markers",
  "upset.stat.off": "Off",
  "upset.stat.stars": "Stars",
  "upset.stat.pvalue": "p-value",
  "upset.stat.on": "On",
  "upset.stat.sigMarkersNote":
    "Only tested intersections are marked. Uses the two-sided p (smaller tail × 2, BH-adjusted across every test run this session), so both enrichment and depletion show up.",
  "upset.stat.colorBars": "Color bars by significance",
  "upset.stat.green": "Green",
  "upset.stat.darkRed": "Dark red",
  "upset.stat.colorBarsNote1": " = enriched. ",
  "upset.stat.colorBarsNote2":
    " = depleted. Both at two-sided p_adj < 0.05, direction from the sign of observed − expected. Untested or non-significant bars stay black.",

  // Upload step + set picker
  "upset.example.title": "Arabidopsis stress-response DEGs",
  "upset.example.subtitle": "5 sets — Drought · Heat · Salt · Cold · ABA",
  "upset.upload.hint":
    "CSV · TSV · TXT — wide (one column per set, 2+) or long (item, set) · 2 MB max",
  "upset.picker.heading": "Sets to include",
  "upset.picker.pick": "Pick at least 2 sets to plot.",
  "upset.picker.one": "1 selected — pick at least one more.",
  "upset.picker.ready": "{n} selected — ready to plot.",
  "upset.items.empty": "Click an intersection bar or matrix column to view items.",
  "upset.items.count.one": "({n} item)",
  "upset.items.count.other": "({n} items)",
  "upset.cutoff.title": "Intersection cutoff",
  "upset.cutoff.intro":
    "With {sets} sets, up to {max} intersections are possible. Keep only intersections whose degree falls in this window:",
  "upset.cutoff.min": "Min",
  "upset.cutoff.max": "Max",
  "upset.cutoff.kept": "{kept} of {total} non-empty intersections kept.",
  "upset.cutoff.note":
    "Degree 1 keeps singletons (items unique to one set); degree = {sets} keeps the all-sets intersection. You can change this later in the plot controls.",
  "upset.cfg.colsRows": " — {cols} cols × {rows} rows",
  "upset.cfg.preview": "Preview (first 8 rows):",

  // Stats panel
  "upset.sp.title": "Intersection significance",
  "upset.sp.subtitle": "SuperExactTest-style exact test against the fixed-margin null",
  "upset.sp.setsTested": "Sets tested",
  "upset.sp.setSizes": "Set sizes (nᵢ)",
  "upset.sp.exclusiveOverlap": "Exclusive overlap (bar)",
  "upset.sp.enriched": "↑ enriched",
  "upset.sp.depleted": "↓ depleted",
  "upset.sp.asExpected": "≈ as expected",
  "upset.sp.expectedNull": "Expected under null",
  "upset.sp.expectedTitle":
    "E[exclusive] = N · Π(nᵢ/N) · Π(1 − nⱼ/N) under the independence approximation (each item falls in each set with its marginal probability). Inside: sets the bar covers. Outside: the other uploaded sets.",
  "upset.sp.inclusiveOverlap": "Inclusive overlap",
  "upset.sp.twoSided": "Two-sided",
  "upset.sp.twoSidedHint":
    "min(2·pUpper, 2·pLower, 1) — headline p, drives plot markers + bar colour",
  "upset.sp.enrichment": "Enrichment",
  "upset.sp.enrichmentHint": "P(X ≥ bar) — Binomial(N, p_M), upper tail",
  "upset.sp.depletion": "Depletion",
  "upset.sp.depletionHint": "P(X ≤ bar) — lower tail",
  "upset.sp.familyNote.one":
    "Each family BH-adjusted separately across {n} intersection cached for N={universe}. The two-sided p is the honest headline (one test per bar, no cherry-picking); the per-tail rows are there for directional breakdown. The Binomial null assumes each item is independently placed in every set at its marginal rate.",
  "upset.sp.familyNote.other":
    "Each family BH-adjusted separately across {n} intersections cached for N={universe}. The two-sided p is the honest headline (one test per bar, no cherry-picking); the per-tail rows are there for directional breakdown. The Binomial null assumes each item is independently placed in every set at its marginal rate.",
  "upset.sp.noPvalue":
    "No p-value for this intersection yet — use <strong>Compute stats</strong> in the sidebar to run the two-sided Binomial test (plus the per-tail enrichment / depletion breakdown) on the exclusive bar height for every intersection in the current set selection in one pass.",

  // How-to card
  "upset.howto.title": "UpSet Plot — How to use",
  "upset.howto.subtitle": "Set-intersection sizes for 2+ sets, where Venn breaks down",
  "upset.howto.purpose":
    "Show intersections between many sets at once — UpSet plots scale gracefully past three sets where Venn diagrams collapse into unreadable shapes.",
  "upset.howto.dataLayout":
    "<strong>Wide</strong> — one column per set, items stacked in each column. <strong>Long</strong> — two columns: <em>item</em> and <em>set</em>. Same format as Venn.",
  "upset.howto.display":
    "Each intersection is a column: top-half bar shows its size, bottom-half dot matrix shows the set membership. Sort by <strong>size</strong> (default) or <strong>degree</strong>; filter by minimum size + degree window. Per-intersection significance test against a uniform-random null with BH-adjusted p-values.",
} as const satisfies Catalog;

export default en;
export type UpsetKey = keyof typeof en;

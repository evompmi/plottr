// English catalog for the Venn tool (namespace "venn"). The completeness
// anchor: VennKey is derived here and fr.ts is typed against it.
// `*.html` values carry authored markup (<strong>/<em>) rendered via
// dangerouslySetInnerHTML in the how-to card.

import type { Catalog } from "../../_core/i18n";

const en = {
  // Downloads
  "venn.dl.csv": "CSV",
  "venn.dl.csvTitle":
    "Download the membership matrix — one row per item, a 0/1 column for each active set (long/tidy format)",
  "venn.dl.regions": "Regions",
  "venn.dl.regionsTitle":
    "Download one CSV per non-empty region (fires multiple saves — your browser may ask once to allow them)",

  // Sidebar tiles + controls
  "venn.tile.sets": "Sets",
  "venn.tile.display": "Display",
  "venn.ctrl.proportionalAreas": "Proportional areas",
  "venn.ctrl.propReadable": "Proportional ↔ Readable",
  "venn.ctrl.title": "Title",
  "venn.ctrl.fillOpacity": "Fill opacity",
  "venn.ctrl.circleOutline": "Circle outline",
  "venn.ctrl.fontSize": "Font size",
  "venn.ctrl.background": "Background",

  // Upload step
  "venn.example.title": "Arabidopsis stress-response DEGs",
  "venn.example.subtitle": "3 sets — Drought · Heat · Salt",
  "venn.upload.hint":
    "CSV · TSV · TXT — wide (one column per set, 2–3) or long (item, set) · 2 MB max",

  // Set picker
  "venn.picker.choose": "Choose sets to overlap",
  "venn.picker.pick": "Pick 2 or 3 sets to overlap.",
  "venn.picker.one": "1 selected — pick at least one more.",
  "venn.picker.ready": "{n} selected — ready to plot.",
  "venn.nudge.count": "{n} sets detected",
  "venn.nudge.rest": " — Venn diagrams only render 2 or 3 sets. For 4+ sets, use the UpSet tool.",
  "venn.nudge.openUpset": "Open in UpSet →",

  // Plot area
  "venn.area.proportionalNote": "Areas are proportional to set sizes (max region error < 0.5%)",
  "venn.area.maxErrorLabel": "Max region error: ",
  "venn.area.meanSuffix": " · mean {mean}%",

  // Intersections table + item list
  "venn.table.region": "Region",
  "venn.table.degree": "Degree",
  "venn.table.count": "Count",
  "venn.items.empty": "Click a region in the Venn diagram or a row in the table to view items.",
  "venn.items.count.one": "{count} item",
  "venn.items.count.other": "{count} items",

  // Chart
  "venn.chart.fallbackTitle": "Venn diagram",
  "venn.chart.desc.one": "Venn diagram with {n} set: {names}",
  "venn.chart.desc.other": "Venn diagram with {n} sets: {names}",

  // App — step labels + parse errors
  "venn.step.configure": "Configure",
  "venn.step.importCheck": "Import check",
  "venn.err.empty": "The file appears to be empty or has no data rows.",
  "venn.err.needSets": "Need at least 2 sets — each column header becomes a set name.",

  // How-to card
  "venn.howto.title": "Venn Diagram — How to use",
  "venn.howto.subtitle": "Item-overlap between 2–3 sets, area-proportional or classic",
  "venn.howto.purpose":
    "Show which items are shared between 2 or 3 sets (genes upregulated in two conditions; taxa common to multiple samples). For ≥ 4 sets, use the UpSet tool instead.",
  "venn.howto.dataLayout":
    "<strong>Wide</strong> — one column per set, items stacked in each column. <strong>Long</strong> — two columns: <em>item</em> and <em>set</em>. Both formats auto-detect.",
  "venn.howto.display":
    "Toggle between <strong>area-proportional</strong> (circle sizes scale with set size; subset relationships are exact) and <strong>classic</strong> (uniform-radius Euler-style). Click any region to drill down into its item list. CSV export per region.",
} as const satisfies Catalog;

export default en;
export type VennKey = keyof typeof en;

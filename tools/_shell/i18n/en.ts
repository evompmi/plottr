// English catalog for the shared shell chrome (namespace "shell").
// This is the completeness anchor: `ShellKey` is derived from these keys
// and `fr.ts` is typed `Record<ShellKey, string>`, so a missing French
// entry is a tsc error. Keep keys dotted + grouped by component.

import type { Catalog } from "../../_core/i18n";

const en = {
  // CommaFixBanner
  "shell.commaFix.title": "Decimal commas automatically converted to dots",
  "shell.commaFix.detail.one":
    '{count} value had commas as decimal separators (e.g. "0,5" → "0.5").',
  "shell.commaFix.detail.other":
    '{count} values had commas as decimal separators (e.g. "0,5" → "0.5").',

  // DetectedSeparatorBadge
  "shell.separator.comma": "comma",
  "shell.separator.semicolon": "semicolon",
  "shell.separator.tab": "tab",
  "shell.separator.space": "space",
  "shell.separator.whitespace": "whitespace",
  "shell.separator.badge": "· detected: {sep}-separated",

  // FormulaInjectionBanner
  "shell.formula.title.one": "Suspicious cells in uploaded data ({count} cell)",
  "shell.formula.title.other": "Suspicious cells in uploaded data ({count} cells)",
  "shell.formula.explain":
    "Cells starting with = + - @ tab CR are treated as formulas by Excel / LibreOffice / Sheets and could exfiltrate or run code if you re-open this data there. Plöttr exports prefix them with a leading apostrophe to neutralise them — but the original file is unchanged, so handle with care.",
  "shell.formula.headerLabel": "Header — ",
  "shell.formula.colLabel": "column {n}",
  "shell.formula.cellWithHeader": "“{header}” row {row}",
  "shell.formula.cellNoHeader": "row {row} col {col}",
  "shell.formula.overflow": "…and {count} more.",

  // ErrorBoundary
  "shell.error.heading": "Something went wrong",
  "shell.error.body":
    "{tool} hit an unexpected error and can't continue. Your data is still on your machine — nothing was sent anywhere. Try reloading; if it keeps crashing, use “Copy error details” and open an issue.",
  "shell.error.toolFallback": "This tool",
  "shell.error.technical": "Technical details",
  "shell.error.reload": "Reload tool",
  "shell.error.copy": "Copy error details",

  // FileDropZone
  "shell.upload.dropAria": "Drop a data file here or press Enter to browse",
  "shell.upload.dropMain": "Drop CSV, TSV, or TXT — or click to browse",
  "shell.upload.dropHint": "CSV · TSV · TXT · DAT — 2 MB max",
  "shell.upload.tooLarge":
    "File too large ({mb} MB). Maximum is 2 MB — split the file or sample rows and try again.",
  "shell.upload.largeWarn": "Large file ({mb} MB) — parsing may take a moment.",
  "shell.upload.readError": "Couldn't read the file ({msg}). Check permissions and try again.",
  "shell.upload.unknownError": "unknown error",
  "shell.upload.reading": "Reading file…",

  // DataPreview
  "shell.preview.more": "… {n} more ({total} total)",

  // ColumnRoleEditor — column-role names (display labels; the <option>
  // value attrs stay the English ColumnRole enum).
  "shell.roles.group": "group",
  "shell.roles.value": "value",
  "shell.roles.filter": "filter",
  "shell.roles.ignore": "ignore",
  "shell.cols.heading": "Column roles",
  // The help line is rendered with the role words as inline coloured spans
  // between these fragments (order: group, value, group, value, filter).
  "shell.cols.help.exactlyOne": "Exactly one ",
  "shell.cols.help.xAxisAndOne": " (x-axis) and one ",
  "shell.cols.help.numericPicking": " (numeric) column. Picking ",
  "shell.cols.help.or": " or ",
  "shell.cols.help.demotesTo": " on another column demotes the previous one to ",
  "shell.cols.help.period": ".",

  // StepNavBar — default step labels (tools may override via stepLabels)
  "shell.step.upload": "Upload",
  "shell.step.configure": "Configure",
  "shell.step.filter": "Filter",
  "shell.step.output": "Output",
  "shell.step.plot": "Plot",
  "shell.step.aria": "Step {n} of {total}: {label}",

  // UploadPanel — separator picker + options (both variants)
  "shell.sep.label": "Column separator",
  "shell.sep.force": "Force separator",
  "shell.sep.select": "— Select —",
  "shell.sep.auto": "Auto-detect",
  "shell.sep.comma": "Comma (,)",
  "shell.sep.semicolon": "Semicolon (;)",
  "shell.sep.tab": "Tab (\\t)",
  "shell.sep.space": "Space",
  "shell.sep.pickToEnable": "Pick a column separator above to enable file loading",
  "shell.sep.overrideHint": "Only needed when the detector picks the wrong delimiter.",
  "shell.sep.autoInfo":
    "Plöttr auto-detects the column separator (comma, tab, semicolon, …) from the data.",
  "shell.sep.overrideShow": "Override ▾",
  "shell.sep.overrideHide": "Hide override ▴",

  // UploadPanel — sample-dataset CTA
  "shell.sample.try": "Try sample data:",
  "shell.sample.loadExample": "Load example →",
  "shell.sample.tryDataset": "Try a sample dataset",
  "shell.sample.plotThis": "Plot this example →",
  "shell.sample.quickStart": "New here? Quick start",

  // UploadPanel — paste card
  "shell.paste.dropTitle": "Drop a file",
  "shell.paste.pasteTitle": "Paste data",
  "shell.paste.placeholder":
    "Paste comma-, tab-, or semicolon-separated rows here.\nTip: a selection copied from Excel or Google Sheets becomes tab-separated automatically.",
  "shell.paste.aria": "Paste tabular data",
  "shell.paste.parse": "Parse pasted data",
  "shell.paste.clear": "Clear",
  "shell.paste.maxSize": "2 MB max",
  "shell.paste.empty": "Paste some data first — copy a selection from Excel, Sheets, or any CSV.",
  "shell.paste.tooLarge":
    "Pasted data too large ({mb} MB). Maximum is 2 MB — split the data or sample rows and try again.",
  "shell.paste.largeWarn": "Large paste ({mb} MB) — parsing may take a moment.",

  // ActionsPanel — plot-step download / reset chrome
  "shell.actions.title": "Actions",
  "shell.actions.svgTitle":
    "Download the plot as SVG — vector graphics, editable in Inkscape or Illustrator",
  "shell.actions.pngTitle": "Download the plot as PNG — 2× raster at the plot's native resolution",
  "shell.actions.startOver": "Start over",
  "shell.actions.resetTitle":
    "Clear all data, controls, and current session — returns to the upload step",
} as const satisfies Catalog;

export default en;
export type ShellKey = keyof typeof en;

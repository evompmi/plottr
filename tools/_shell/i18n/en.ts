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
} as const satisfies Catalog;

export default en;
export type ShellKey = keyof typeof en;

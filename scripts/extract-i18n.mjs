// One-off: extract every i18n catalog (EN + current FR) into a single
// markdown file for batch translation review. Run: node scripts/extract-i18n.mjs
// Output: i18n-translations.md at the repo root.
//
// Format is a GFM table per namespace (Key | English | French). Pipe chars in
// content are escaped as `\|` so the table stays well-formed; the companion
// re-import step un-escapes them.

import { transformSync } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// namespace label, human title, en path, fr path
const CATALOGS = [
  [
    "landing",
    "Static landing page",
    "tools/_core/i18n/landing.en.ts",
    "tools/_core/i18n/landing.fr.ts",
  ],
  [
    "shell",
    "Shared shell (chrome, upload, steps, stats tile/table)",
    "tools/_shell/i18n/en.ts",
    "tools/_shell/i18n/fr.ts",
  ],
  ["venn", "Venn tool", "tools/venn/i18n/en.ts", "tools/venn/i18n/fr.ts"],
  ["volcano", "Volcano tool", "tools/volcano/i18n/en.ts", "tools/volcano/i18n/fr.ts"],
  ["heatmap", "Heatmap tool", "tools/heatmap/i18n/en.ts", "tools/heatmap/i18n/fr.ts"],
  ["upset", "UpSet tool", "tools/upset/i18n/en.ts", "tools/upset/i18n/fr.ts"],
  ["lineplot", "Line Plot tool", "tools/lineplot/i18n/en.ts", "tools/lineplot/i18n/fr.ts"],
  ["scatter", "Scatter tool", "tools/scatter/i18n/en.ts", "tools/scatter/i18n/fr.ts"],
  ["boxplot", "Group Plot (boxplot) tool", "tools/boxplot/i18n/en.ts", "tools/boxplot/i18n/fr.ts"],
  [
    "aequorin",
    "RLU Timecourse (aequorin) tool",
    "tools/aequorin/i18n/en.ts",
    "tools/aequorin/i18n/fr.ts",
  ],
  [
    "power",
    "Power Analysis calculator",
    "tools/power-app/i18n/en.ts",
    "tools/power-app/i18n/fr.ts",
  ],
  [
    "molarity",
    "Calculator (molarity) tool",
    "tools/molarity-app/i18n/en.ts",
    "tools/molarity-app/i18n/fr.ts",
  ],
];

// Load a catalog TS module's default export by transpiling to CJS and evaluating.
function loadCatalog(relPath) {
  const src = readFileSync(resolve(ROOT, relPath), "utf8");
  const { code } = transformSync(src, { loader: "ts", format: "cjs" });
  const module = { exports: {} };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports.default;
}

// Escape for a single GFM table cell: pipes and any stray newlines.
function cell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

let totalKeys = 0;
const parts = [];
parts.push("# Plöttr — i18n translation worksheet\n");
parts.push(
  "Every user-facing string in the app, grouped by namespace. **Edit the " +
    "_French_ column only**, then hand the file back. The `Key` column is my " +
    "reference for writing changes back into the catalogs — please keep it " +
    "intact. Leave the English column unchanged.\n"
);
parts.push(
  'Notes on conventions already applied (so you don\'t need to "fix" them): ' +
    "statistical test / post-hoc names, CSV & R-export column headers, chart " +
    "default axis labels, and tool proper-names are intentionally English; " +
    "`{...}` placeholders and inline HTML (`<strong>`, `<br/>`, `style=...`) " +
    "must be preserved verbatim in the French text.\n"
);

for (const [ns, title, enPath, frPath] of CATALOGS) {
  const en = loadCatalog(enPath);
  const fr = loadCatalog(frPath);
  const keys = Object.keys(en);
  totalKeys += keys.length;
  parts.push(`\n## ${ns} — ${title}\n`);
  parts.push(`_${keys.length} strings · ${enPath}_\n`);
  parts.push("| Key | English | French |");
  parts.push("| --- | --- | --- |");
  for (const k of keys) {
    parts.push(`| \`${k}\` | ${cell(en[k])} | ${cell(fr[k] ?? "")} |`);
  }
}

parts.unshift(""); // leading newline guard
parts.splice(1, 0, `_${totalKeys} strings across ${CATALOGS.length} namespaces._\n`);

writeFileSync(resolve(ROOT, "i18n-translations.md"), parts.join("\n") + "\n", "utf8");
console.log(`Wrote i18n-translations.md — ${totalKeys} strings, ${CATALOGS.length} namespaces.`);

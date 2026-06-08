// One-off companion to extract-i18n.mjs: read the edited i18n-translations.md,
// diff its French column against the current catalogs, and rewrite the fr.ts of
// any namespace whose French changed. Run: node scripts/import-i18n.mjs
//
// Only the French value is taken from the worksheet; key order + completeness
// come from each en.ts (the source of truth). Reports every changed key.

import { transformSync } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CATALOGS = [
  ["landing", "tools/_core/i18n/landing.en.ts", "tools/_core/i18n/landing.fr.ts"],
  ["shell", "tools/_shell/i18n/en.ts", "tools/_shell/i18n/fr.ts"],
  ["venn", "tools/venn/i18n/en.ts", "tools/venn/i18n/fr.ts"],
  ["volcano", "tools/volcano/i18n/en.ts", "tools/volcano/i18n/fr.ts"],
  ["heatmap", "tools/heatmap/i18n/en.ts", "tools/heatmap/i18n/fr.ts"],
  ["upset", "tools/upset/i18n/en.ts", "tools/upset/i18n/fr.ts"],
  ["lineplot", "tools/lineplot/i18n/en.ts", "tools/lineplot/i18n/fr.ts"],
  ["scatter", "tools/scatter/i18n/en.ts", "tools/scatter/i18n/fr.ts"],
  ["boxplot", "tools/boxplot/i18n/en.ts", "tools/boxplot/i18n/fr.ts"],
  ["aequorin", "tools/aequorin/i18n/en.ts", "tools/aequorin/i18n/fr.ts"],
  ["power", "tools/power-app/i18n/en.ts", "tools/power-app/i18n/fr.ts"],
  ["molarity", "tools/molarity-app/i18n/en.ts", "tools/molarity-app/i18n/fr.ts"],
];

function loadCatalog(relPath) {
  const src = readFileSync(resolve(ROOT, relPath), "utf8");
  const { code } = transformSync(src, { loader: "ts", format: "cjs" });
  const module = { exports: {} };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports.default;
}

const uncell = (s) => s.replace(/<br>/g, "\n").replace(/\\\|/g, "|");

// Parse the worksheet into { ns: { key: frenchValue } }.
function parseWorksheet() {
  const lines = readFileSync(resolve(ROOT, "i18n-translations.md"), "utf8").split("\n");
  const out = {};
  let ns = null;
  for (const line of lines) {
    const h = line.match(/^## (\S+) /);
    if (h) {
      ns = h[1];
      out[ns] = {};
      continue;
    }
    if (!ns || !line.startsWith("| `")) continue;
    const key = line.match(/^\| `([^`]+)` \| /);
    if (!key) continue;
    // Strip the trailing " |" then take the last " | "-delimited cell as French
    // (English may itself contain an escaped pipe, never a raw " | ").
    const body = line.replace(/ \|\s*$/, "");
    const lastSep = body.lastIndexOf(" | ");
    out[ns][key[1]] = uncell(body.slice(lastSep + 3));
  }
  return out;
}

const sheet = parseWorksheet();
let changedFiles = 0;
let changedKeys = 0;

for (const [ns, enPath, frPath] of CATALOGS) {
  const en = loadCatalog(enPath);
  const curFr = loadCatalog(frPath);
  const newFr = sheet[ns] || {};
  const keys = Object.keys(en);

  const diffs = [];
  for (const k of keys) {
    const proposed = Object.prototype.hasOwnProperty.call(newFr, k) ? newFr[k] : curFr[k];
    if (proposed !== curFr[k]) diffs.push(k);
  }
  if (diffs.length === 0) continue;

  // Rebuild fr.ts: keep the existing preamble (comment + import + `const … = {`)
  // and footer; regenerate entries in en key order, French from the worksheet
  // where present. JSON.stringify gives valid double-quoted literals; prettier
  // normalizes quote style afterward.
  const src = readFileSync(resolve(ROOT, frPath), "utf8");
  const headEnd = src.indexOf("= {");
  const head = src.slice(0, headEnd + 3);
  // Derive the catalog's binding name (most are `fr`, but landing is `landingFr`)
  // so the regenerated `export default` matches.
  const varName = (head.match(/const\s+(\w+)\s*:/) || ["", "fr"])[1];
  const entries = keys
    .map((k) => {
      const v = Object.prototype.hasOwnProperty.call(newFr, k) ? newFr[k] : curFr[k];
      return `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`;
    })
    .join("\n");
  writeFileSync(
    resolve(ROOT, frPath),
    `${head}\n${entries}\n};\n\nexport default ${varName};\n`,
    "utf8"
  );

  changedFiles++;
  changedKeys += diffs.length;
  console.log(`\n${ns} (${diffs.length} changed) — ${frPath}`);
  for (const k of diffs) {
    console.log(`  ${k}`);
    console.log(`    -  ${JSON.stringify(curFr[k])}`);
    console.log(`    +  ${JSON.stringify(newFr[k])}`);
  }
}

console.log(`\n${changedKeys} keys across ${changedFiles} file(s) updated.`);

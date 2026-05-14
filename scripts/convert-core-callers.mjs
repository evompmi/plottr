#!/usr/bin/env node
// scripts/convert-core-callers.mjs — one-shot codemod that adds direct
// `import { ... } from "../_core/..."` lines to every tool .tsx / .ts file
// that consumes the shared kernel via ambient globals.
//
// Used once during the v1.6.x migration to retire the transitional
// `globalThis.X = X` shims. After every caller imports its symbols
// directly, the shim blocks at the bottom of each `_core/*` module can be
// dropped and the ambient `declare const` blocks in `types/globals.d.ts`
// (and a few per-file leftovers in `tools/_shell/*` / `tools/heatmap/`)
// can be cleaned out.
//
// Algorithm:
//   1. For each `_core/*` module, list its exported names.
//   2. For each candidate file (`tools/**/*.{ts,tsx}` minus `_core/`,
//      `.d.ts`, and compiled outputs), strip comments + string literals
//      so identifier matches are real references — not commented-out
//      pseudo-mentions.
//   3. For each matched name, group by module and skip names already
//      imported via an existing `import { ... } from "../_core/..."` line.
//   4. Compute the relative path from the file to `tools/_core/<module>`
//      (varies with file depth) and emit one import statement per module.
//   5. Inject the imports immediately after the last existing `import`
//      line (or at the very top if no imports exist), preserving the file
//      otherwise.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "..");
const TOOLS = path.join(REPO, "tools");

// Names per module — mirror the public exports in each `_core/*` file.
const MODULES = {
  "_core/color": [
    "hexToRgb",
    "rgbToHex",
    "shadeColor",
    "getPointColors",
    "PALETTE",
    "COLOR_PALETTES",
    "DIVERGING_PALETTES",
    "interpolateColor",
    "roleColors",
  ],
  "_core/icons": ["TOOL_ICONS", "toolIcon"],
  "_core/numeric": ["normalizeNumericString", "isNumericValue", "toNumericValue", "seededRandom"],
  "_core/scale": ["niceStep", "makeTicks", "makeLogTicks"],
  "_core/csv": [
    "autoDetectSep",
    "tokenizeDelimited",
    "fixDecimalCommas",
    "detectHeader",
    "parseRaw",
    "guessColumnType",
    "detectWideFormat",
    "parseWideMatrix",
    "parseData",
    "dataToColumns",
    "wideToLong",
    "reshapeWide",
    "parseSetData",
    "parseLongFormatSets",
    "buildCsvString",
    "scanForFormulaInjection",
  ],
  "_core/descriptive": ["computeStats", "quartiles", "kde", "computeGroupStats"],
  "_core/svg-export": [
    "svgSafeId",
    "PLOTTR_ATTRIBUTION_PAD",
    "registerSvgExportMutator",
    "unregisterSvgExportMutator",
    "buildExportSvg",
    "serializeSvgForExport",
    "appendPlottrAttribution",
  ],
  "_core/download": [
    "fileBaseName",
    "flashSaved",
    "saveBlob",
    "downloadSvg",
    "downloadPng",
    "downloadText",
    "downloadCsv",
  ],
  "_core/stats/dist": [
    "normcdf",
    "normsf",
    "norminv",
    "gammaln",
    "betai",
    "betai_upper",
    "betacf",
    "gammainc",
    "gammainc_upper",
    "tcdf",
    "tcdf_upper",
    "tpdf",
    "tinv",
    "fcdf",
    "fcdf_upper",
    "chi2cdf",
    "chi2pdf",
    "chi2inv",
    "nctcdf",
    "ncf_sf",
    "ncchi2cdf",
    "bisect",
    "powerTwoSample",
    "powerPaired",
    "powerOneSample",
    "powerAnova",
    "powerCorrelation",
    "powerChi2",
    "fFromGroupMeans",
  ],
  "_core/stats/tests": [
    "sampleMean",
    "sampleVariance",
    "sampleSD",
    "rankWithTies",
    "shapiroWilk",
    "leveneTest",
    "tTest",
    "mannWhitneyU",
    "cohenD",
    "hedgesG",
    "rankBiserial",
    "cohenDCI",
    "oneWayANOVA",
    "welchANOVA",
    "kruskalWallis",
    "pearsonCorrelation",
    "spearmanCorrelation",
    "kendallTau",
    "selectCorrelation",
    "etaSquared",
    "epsilonSquared",
  ],
  "_core/stats/posthoc": [
    "ptukey",
    "ptukey_upper",
    "qtukey",
    "tukeyHSD",
    "gamesHowell",
    "bhAdjust",
    "dunnTest",
    "compactLetterDisplay",
    "selectTest",
  ],
  "_core/stats/format": ["pStars", "formatP"],
  "_core/stats/cluster": [
    "pairwiseDistance",
    "rowDistance",
    "hclust",
    "dendrogramLayout",
    "kmeans",
  ],
  "_core/stats/msi": [
    "multisetIntersectionPExact",
    "multisetExclusiveExpected",
    "multisetExclusiveP",
    "multisetIntersectionPExactLower",
    "multisetIntersectionExpected",
    "multisetIntersectionPPoisson",
    "multisetIntersectionP",
  ],
  "_core/theme": ["getTheme", "setTheme", "toggleTheme", "useThemeMode", "ThemeToggle"],
};

// Build reverse index: name → module.
const NAME_TO_MODULE = new Map();
for (const [mod, names] of Object.entries(MODULES)) {
  for (const name of names) NAME_TO_MODULE.set(name, mod);
}

// Walk a directory recursively, yielding .ts / .tsx files.
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip _core (the source-of-truth modules); skip _app/chunks (compiled).
      if (full === path.join(TOOLS, "_core")) continue;
      if (full === path.join(TOOLS, "_app/chunks")) continue;
      yield* walk(full);
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts")
    ) {
      yield full;
    }
  }
}

// Strip // line comments, /* … */ block comments, and "string" / 'string' /
// `template` literals so identifier matches are real references. Template
// literals that contain ${expr} interpolations are partially lossy (we drop
// the whole literal, including the expression) — acceptable trade-off for
// this one-shot codemod: false negatives just mean we skip an import the
// user can add manually if a later edit re-introduces the dependency.
function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    // Line comment
    if (ch === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // String literals
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        i++;
      }
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Find existing `import { ... } from "..."` blocks so we don't duplicate.
function existingImports(src) {
  const matches = [...src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g)];
  const byModule = new Map(); // module-key (resolved relative path) → Set of names
  for (const m of matches) {
    const names = m[1]
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
      )
      .filter(Boolean);
    const mod = m[2];
    if (!byModule.has(mod)) byModule.set(mod, new Set());
    for (const n of names) byModule.get(mod).add(n);
  }
  return byModule;
}

// Compute the relative import path from a file to a `_core/<module>` target.
// e.g. tools/boxplot/app.tsx → ../_core/csv
//      tools/molarity-app.tsx → ./_core/csv
//      tools/_shell/StatsTile.tsx → ../_core/svg-export
function relCorePath(fromFile, coreModule) {
  const target = path.join(TOOLS, coreModule);
  let rel = path.relative(path.dirname(fromFile), target);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

// Inject `lines` (an array of strings) into `src` after the last existing
// `import …` statement (or `const … = require(...)` for CommonJS-leaning
// test files — but we only run on .ts(x), so really just `import`).
function inject(src, lines) {
  if (lines.length === 0) return src;
  // Find the last import statement's end-of-line position.
  const importRe = /^(?:import[\s\S]*?from\s*["'][^"']+["'];|import\s*["'][^"']+["'];)\s*$/gm;
  let lastEnd = -1;
  for (const m of src.matchAll(importRe)) {
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd === -1) {
    // No existing imports. Inject right after the leading comment block (if
    // any) — heuristic: skip leading block of `//` line comments + blank lines.
    let i = 0;
    while (i < src.length) {
      const lineEnd = src.indexOf("\n", i);
      if (lineEnd === -1) break;
      const line = src.slice(i, lineEnd);
      if (line.startsWith("//") || line.trim() === "") {
        i = lineEnd + 1;
        continue;
      }
      break;
    }
    return src.slice(0, i) + lines.join("\n") + "\n\n" + src.slice(i);
  }
  // Insert after the last import line. Find end-of-line for that import.
  const eol = src.indexOf("\n", lastEnd);
  const cut = eol === -1 ? lastEnd : eol + 1;
  return src.slice(0, cut) + lines.join("\n") + "\n" + src.slice(cut);
}

const STATS = { filesTouched: 0, importsAdded: 0, skipped: 0 };

for (const file of walk(TOOLS)) {
  const src = fs.readFileSync(file, "utf8");
  const stripped = stripCommentsAndStrings(src);

  // Bucket usages by module.
  const wanted = new Map(); // module → Set<name>
  for (const [name, mod] of NAME_TO_MODULE) {
    const re = new RegExp("\\b" + name + "\\b");
    if (re.test(stripped)) {
      if (!wanted.has(mod)) wanted.set(mod, new Set());
      wanted.get(mod).add(name);
    }
  }
  if (wanted.size === 0) {
    STATS.skipped++;
    continue;
  }

  const existing = existingImports(src);

  const newLines = [];
  for (const [mod, names] of wanted) {
    const relPath = relCorePath(file, mod);
    // Strip extension since we're importing a module specifier.
    const specifier = relPath.replace(/\.tsx?$/, "");
    // Filter out names already imported (from any path that resolves to the
    // same module). Match by suffix: e.g. "../_core/csv" vs "../../_core/csv".
    const already = new Set();
    for (const [existingPath, existingNames] of existing) {
      // Resolve existingPath relative to the file's dir; if it points to the
      // same target module, mark those names as already imported.
      const tail = `_core/${mod.replace(/^_core\//, "")}`;
      if (existingPath.endsWith(tail) || existingPath === specifier) {
        for (const n of existingNames) already.add(n);
      }
    }
    const toAdd = [...names].filter((n) => !already.has(n)).sort();
    if (toAdd.length === 0) continue;
    newLines.push(`import { ${toAdd.join(", ")} } from "${specifier}";`);
    STATS.importsAdded += toAdd.length;
  }

  if (newLines.length === 0) {
    STATS.skipped++;
    continue;
  }

  const next = inject(src, newLines);
  fs.writeFileSync(file, next);
  STATS.filesTouched++;
  console.log(`  + ${path.relative(REPO, file)}  (${newLines.length} import line(s))`);
}

console.log(
  `\nDone. files touched: ${STATS.filesTouched}, imports added: ${STATS.importsAdded}, files skipped: ${STATS.skipped}`
);

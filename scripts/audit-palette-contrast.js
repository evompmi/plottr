#!/usr/bin/env node
// Audits every palette stop in Plöttr's catalogue against WCAG 2.1
// SC 1.4.11 (Non-text Contrast, 3.0:1) on the chart's white background.
//
// Why static, not Playwright + axe-core: the palette catalogue is a
// finite curated set (~70 hex stops across ~20 catalogues), rendered
// onto a hard-coded white plot card (`var(--plot-card-bg)` resolves to
// white in both themes per CLAUDE.md). axe-core has known SVG-fill
// blind spots and wouldn't catch a pale dot on white anyway. Pure
// arithmetic is the right tool.
//
// Run on demand: `npm run audit:contrast`. Not a CI gate — the pastel
// catalogues are *expected* to fail 3:1 (that's what makes them
// pastels). The report distinguishes "discrete-as-points" failures
// (real visibility issue) from "sequential-endpoint" failures (the
// lightest stop in viridis / blues / etc. is by-design near-white).

const fs = require("fs");
const path = require("path");

// ── WCAG 2.1 relative-luminance + contrast ratio ──────────────────────
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relLuminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function hexToRgb(hex) {
  const h = hex.replace(/^#/, "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function contrastRatio(hexA, hexB) {
  const La = relLuminance(hexToRgb(hexA));
  const Lb = relLuminance(hexToRgb(hexB));
  const [hi, lo] = La > Lb ? [La, Lb] : [Lb, La];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Palette catalogue ──────────────────────────────────────────────────
// Reuse the existing test loader — it's already set up to pull
// `_shell/discrete-palette.ts` exports + the legacy `PALETTE` global
// out of `tools/shared.js` via vm.runInContext.
const palette = require("../tests/helpers/discrete-palette-loader");
const shared = require("../tests/helpers/shared-loader");

// Volcano default colors live in tools/volcano/helpers.ts as a TS object
// literal. Loading via esbuild + vm just to read three constants is
// overkill; a focused regex over the source is the cheapest pin that
// stays in sync — it picks up edits to the literal values without a
// rebuild step.
const volcanoHelpersSrc = fs.readFileSync(
  path.join(__dirname, "..", "tools", "volcano", "helpers.ts"),
  "utf8"
);
function readVolcanoDefault(key) {
  const m = volcanoHelpersSrc.match(new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{3,6})"`));
  if (!m) throw new Error(`couldn't read VOLCANO_DEFAULT_COLORS.${key} from helpers.ts`);
  return m[1];
}
const VOLCANO_DEFAULT_COLORS = {
  up: readVolcanoDefault("up"),
  down: readVolcanoDefault("down"),
  ns: readVolcanoDefault("ns"),
};

// ── Classification per palette family ──────────────────────────────────
//
//   discrete   — every stop is used as a categorical fill (point / bar /
//                line / set ring). Every stop must clear 3:1 vs white.
//   sequential — stops interpolate; only the lightest endpoint matters
//                for visibility (everything between is by design).
//   diverging  — like sequential but symmetric; both endpoints matter,
//                middle stop near-white is the design.
const SEQUENTIAL = new Set([
  "viridis",
  "plasma",
  "magma",
  "inferno",
  "cividis",
  "reds",
  "blues",
  "greens",
]);
const DIVERGING = new Set(["rdbu", "bwr", "rdylbu", "spectral"]);

const WCAG_NON_TEXT = 3.0;
const WHITE = "#FFFFFF";

function audit() {
  const failures = [];
  const lines = [];
  lines.push("# Palette contrast audit");
  lines.push("");
  lines.push(
    `Threshold: WCAG 2.1 SC 1.4.11 (non-text), **${WCAG_NON_TEXT.toFixed(1)}:1** vs white background.`
  );
  lines.push("");

  function check(name, family, stops) {
    const rows = stops.map((stop) => ({ stop, ratio: contrastRatio(stop, WHITE) }));
    const fails = rows.filter((r) => r.ratio < WCAG_NON_TEXT);
    const summary = fails.length === 0 ? "✅" : family === "discrete" ? "❌" : "⚠";
    lines.push(`## ${summary} \`${name}\` (${family}, ${stops.length} stops)`);
    lines.push("");
    lines.push("| Stop | Ratio | Pass 3:1 |");
    lines.push("| ---- | ----: | :------: |");
    for (const r of rows) {
      const ok = r.ratio >= WCAG_NON_TEXT;
      lines.push(`| \`${r.stop}\` | ${r.ratio.toFixed(2)}:1 | ${ok ? "✅" : "❌"} |`);
    }
    lines.push("");
    if (family === "discrete" && fails.length > 0) {
      failures.push({ name, family, fails });
    }
  }

  // Discrete categorical palettes — every stop must clear the bar.
  for (const [name, stops] of Object.entries(palette.DISCRETE_PALETTES)) {
    if (stops.length === 1 && stops[0] === "*") continue; // sentinel, handled below
    check(name, "discrete", stops);
  }
  // Runtime-generated discrete palettes — sample a typical N=8.
  check("ggplot2-hue (n=8)", "discrete", palette.buildGgplot2Hue(8));
  check("viridis-d (n=8)", "discrete", palette.buildViridisDiscrete(8));

  // Legacy Okabe-Ito global from shared.js.
  check("PALETTE (shared.js, Okabe-Ito + extras)", "discrete", shared.PALETTE || palette.PALETTE);

  // Continuous palettes — sequential / diverging.
  for (const [name, stops] of Object.entries(shared.COLOR_PALETTES)) {
    const family = SEQUENTIAL.has(name)
      ? "sequential"
      : DIVERGING.has(name)
        ? "diverging"
        : "sequential";
    check(name, family, stops);
  }

  // Volcano fixed defaults — each used as a categorical point fill.
  check("VOLCANO_DEFAULT_COLORS", "discrete", [
    VOLCANO_DEFAULT_COLORS.up,
    VOLCANO_DEFAULT_COLORS.down,
    VOLCANO_DEFAULT_COLORS.ns,
  ]);

  lines.push("---");
  lines.push("");
  if (failures.length === 0) {
    lines.push("**Result: every discrete-categorical stop clears 3:1 vs white.** ✅");
  } else {
    lines.push(
      `**Result: ${failures.length} discrete palette${failures.length === 1 ? "" : "s"} contain stops below 3:1 vs white.**`
    );
    lines.push("");
    for (const f of failures) {
      lines.push(
        `- \`${f.name}\` — ${f.fails.length} failing stop${f.fails.length === 1 ? "" : "s"}: ${f.fails.map((x) => `\`${x.stop}\` (${x.ratio.toFixed(2)}:1)`).join(", ")}`
      );
    }
  }
  lines.push("");
  return { report: lines.join("\n"), failureCount: failures.length };
}

if (require.main === module) {
  const { report } = audit();
  process.stdout.write(report);
  // Informational; never fail CI. The pastels are intentional — and a
  // CI gate would force the catalogue to drop them, which loses real
  // user choice for filled-region overlays.
  process.exit(0);
}

module.exports = { audit, contrastRatio, hexToRgb, relLuminance };

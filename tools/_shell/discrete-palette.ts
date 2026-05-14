// Discrete colour palette catalogue + helpers shared across plot tools, the
// discrete analogue of the continuous COLOR_PALETTES / PaletteStrip pattern
// used by scatter / heatmap / volcano. Used by every per-group / per-category
// colouring slot (boxplot groups, lineplot series, scatter discrete
// categories, venn sets, aequorin conditions, volcano up/down/ns).
//
// `okabe-ito` is byte-identical to the global PALETTE in shared.js — every
// tool defaults its `vis.discretePalette` to "okabe-ito" so existing
// behaviour is preserved exactly.
//
// Attribution:
//   ColorBrewer palettes (set1/set2/set3/dark2/paired/pastel1/pastel2)
//   © Cynthia Brewer, Mark Harrower, and Penn State University.
//   Licensed under the Apache License, Version 2.0
//   (http://www.apache.org/licenses/LICENSE-2.0).
//
//   Okabe-Ito: Wong 2011, Nature Methods 8(6):441.
//   Tableau10: ©Tableau Software; reproduced under fair-use widely.
//   ggplot2-hue: derived at runtime from hcl(h, l=65, c=100), no licence.
//   viridis-d: even-spaced sample of the continuous viridis (CC0).
//
// Note: viridis-d (discrete sample) is intentionally distinct from
// COLOR_PALETTES.viridis (continuous): the discrete form generates exactly
// `n = names.length` colours via interpolateColor at runtime.

import { COLOR_PALETTES, interpolateColor } from "../_core/color";

export const DISCRETE_PALETTES: Record<string, string[]> = {
  // Okabe-Ito (Wong 2011) — colour-blind safe. Same as PALETTE in shared.js.
  "okabe-ito": [
    "#E69F00",
    "#56B4E9",
    "#009E73",
    "#F0E442",
    "#0072B2",
    "#D55E00",
    "#CC79A7",
    "#000000",
    "#88CCEE",
    "#AA4499",
  ],
  tab10: [
    "#4E79A7",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#59A14F",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
  ],
  set1: [
    "#E41A1C",
    "#377EB8",
    "#4DAF4A",
    "#984EA3",
    "#FF7F00",
    "#FFFF33",
    "#A65628",
    "#F781BF",
    "#999999",
  ],
  set2: ["#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3", "#A6D854", "#FFD92F", "#E5C494", "#B3B3B3"],
  set3: [
    "#8DD3C7",
    "#FFFFB3",
    "#BEBADA",
    "#FB8072",
    "#80B1D3",
    "#FDB462",
    "#B3DE69",
    "#FCCDE5",
    "#D9D9D9",
    "#BC80BD",
    "#CCEBC5",
    "#FFED6F",
  ],
  dark2: ["#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02", "#A6761D", "#666666"],
  paired: [
    "#A6CEE3",
    "#1F78B4",
    "#B2DF8A",
    "#33A02C",
    "#FB9A99",
    "#E31A1C",
    "#FDBF6F",
    "#FF7F00",
    "#CAB2D6",
    "#6A3D9A",
    "#FFFF99",
    "#B15928",
  ],
  pastel1: [
    "#FBB4AE",
    "#B3CDE3",
    "#CCEBC5",
    "#DECBE4",
    "#FED9A6",
    "#FFFFCC",
    "#E5D8BD",
    "#FDDAEC",
    "#F2F2F2",
  ],
  pastel2: ["#B3E2CD", "#FDCDAC", "#CBD5E8", "#F4CAE4", "#E6F5C9", "#FFF2AE", "#F1E2CC", "#CCCCCC"],
  // Sentinel "*" means "generate at runtime sized to names.length"; consumers
  // call buildGgplot2Hue / buildViridisDiscrete via resolveDiscretePalette.
  "ggplot2-hue": ["*"],
  "viridis-d": ["*"],
};

// Subset considered colour-blind-safe (no red/green adjacency, sufficient
// luminance contrast). Surfaced as a 👁 glyph in the dropdown so users can
// quickly tell. Conservative on purpose — Set2 / Pastel2 are arguably
// borderline; only the unambiguous ones are marked.
export const COLORBLIND_SAFE_PALETTES = new Set(["okabe-ito", "dark2", "paired", "viridis-d"]);

// HCL → sRGB conversion for ggplot2-hue. Implementation matches grDevices::hcl
// closely enough for visual parity (D65 white point, 2° observer). Full
// agreement with R's hcl() output is not the goal — we just need the iconic
// ggplot2 look.
function hclToHex(h: number, c: number, l: number): string {
  const hRad = (h * Math.PI) / 180;
  const a = Math.cos(hRad) * c;
  const b = Math.sin(hRad) * c;
  // Lab → XYZ (D65)
  const Y = (l + 16) / 116;
  const X = a / 500 + Y;
  const Z = Y - b / 200;
  const fInv = (t: number): number => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const Xn = 95.047,
    Yn = 100.0,
    Zn = 108.883;
  const x = Xn * fInv(X);
  const y = Yn * fInv(Y);
  const z = Zn * fInv(Z);
  // XYZ → linear sRGB (D65)
  let r = (x * 3.2406 + y * -1.5372 + z * -0.4986) / 100;
  let g = (x * -0.9689 + y * 1.8758 + z * 0.0415) / 100;
  let bl = (x * 0.0557 + y * -0.204 + z * 1.057) / 100;
  // Linear → sRGB gamma
  const gam = (u: number): number =>
    u > 0.0031308 ? 1.055 * Math.pow(u, 1 / 2.4) - 0.055 : 12.92 * u;
  r = Math.max(0, Math.min(1, gam(r)));
  g = Math.max(0, Math.min(1, gam(g)));
  bl = Math.max(0, Math.min(1, gam(bl)));
  const toHex = (u: number): string =>
    Math.round(u * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(bl);
}

// Generate ggplot2's default hue scale for n colours.
export function buildGgplot2Hue(n: number): string[] {
  if (n <= 0) return [];
  const out: string[] = [];
  // hues = seq(15, 375, length.out = n + 1)[1:n]
  for (let i = 0; i < n; i++) {
    const h = 15 + (360 * i) / n;
    out.push(hclToHex(h, 100, 65));
  }
  return out;
}

// Generate evenly-spaced viridis samples for n colours by interpolating
// COLOR_PALETTES.viridis. Falls back to the raw stops if interpolateColor
// isn't yet on the global scope (defensive — they live in shared.js which
// loads first in the bundle).
export function buildViridisDiscrete(n: number): string[] {
  if (n <= 0) return [];
  if (typeof interpolateColor !== "function" || typeof COLOR_PALETTES !== "object") {
    return [];
  }
  const stops = COLOR_PALETTES.viridis;
  if (n === 1) return [stops[Math.floor(stops.length / 2)]];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(interpolateColor(stops, i / (n - 1)));
  }
  return out;
}

// Resolve a palette name to a concrete hex array sized for `n` slots.
// Recycles modulo for fixed-length palettes, generates exactly n for the
// runtime palettes (ggplot2-hue / viridis-d). Unknown names fall back to
// okabe-ito so a stale localStorage value never produces an empty palette.
export function resolveDiscretePalette(name: string, n: number): string[] {
  if (name === "ggplot2-hue") return buildGgplot2Hue(Math.max(1, n || 1));
  if (name === "viridis-d") return buildViridisDiscrete(Math.max(1, n || 1));
  const stops = DISCRETE_PALETTES[name] || DISCRETE_PALETTES["okabe-ito"];
  if (!stops || stops.length === 0) return [];
  const count = Math.max(1, n || stops.length);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(stops[i % stops.length]);
  return out;
}

// Build a `{ name → hex }` record for an ordered array of group/category
// names using the named palette. Recycles modulo for fixed palettes,
// generates exact for runtime palettes.
export function applyDiscretePalette(name: string, names: string[]): Record<string, string> {
  const list = Array.isArray(names) ? names : [];
  const resolved = resolveDiscretePalette(name, list.length);
  const out: Record<string, string> = {};
  list.forEach((nm, i) => {
    out[nm] = resolved[i % Math.max(1, resolved.length)] || "#000000";
  });
  return out;
}

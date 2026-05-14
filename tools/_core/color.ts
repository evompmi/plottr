// _core/color.ts — color helpers, palettes, and role colours.
//
// Carved out of `_core/shared.ts` in v1.6.x. The trailing `globalThis` shim
// keeps the legacy ambient surface alive for callers that still consume
// these names as globals; the shim retires when every caller imports
// directly.

// ── Color helpers ───────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

export function shadeColor(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (factor > 0)
    return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  return rgbToHex(r * (1 + factor), g * (1 + factor), b * (1 + factor));
}

export function getPointColors(baseColor: string, nSources: number): string[] {
  if (nSources <= 1) return [baseColor];
  const colors: string[] = [];
  for (let i = 0; i < nSources; i++) {
    const t = nSources === 1 ? 0 : Math.min(1, i / (nSources - 1));
    colors.push(shadeColor(baseColor, -0.4 + t * 0.7));
  }
  return colors;
}

// ── Color palette (Okabe-Ito colorblind-safe; Wong 2011, Nature Methods) ────

export const PALETTE: readonly string[] = [
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
];

// ── Continuous colour palettes (shared by scatter + heatmap) ──────────────

export const COLOR_PALETTES: Record<string, string[]> = {
  viridis: ["#440154", "#3b528b", "#21908c", "#5dc963", "#fde725"],
  plasma: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
  magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
  inferno: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
  cividis: ["#00204c", "#213d6b", "#555b6c", "#7b7a77", "#a59c74", "#d3c064", "#ffe945"],
  rdbu: ["#b2182b", "#ef8a62", "#fddbc7", "#f7f7f7", "#d1e5f0", "#67a9cf", "#2166ac"],
  bwr: ["#0000ff", "#8888ff", "#ffffff", "#ff8888", "#ff0000"],
  rdylbu: ["#a50026", "#f46d43", "#fee090", "#ffffbf", "#e0f3f8", "#74add1", "#313695"],
  reds: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  blues: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  greens: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  spectral: ["#9e0142", "#f46d43", "#fee08b", "#e6f598", "#66c2a5", "#3288bd", "#5e4fa2"],
};

// Diverging palettes should be anchored at 0 when rendered (symmetric vmin/vmax).
export const DIVERGING_PALETTES: Set<string> = new Set(["rdbu", "bwr", "rdylbu", "spectral"]);

export function interpolateColor(stops: string[], t: number): string {
  if (!stops || stops.length === 0) return "#000000";
  if (stops.length === 1) return stops[0];
  if (t <= 0 || !Number.isFinite(t)) return stops[0];
  if (t >= 1) return stops[stops.length - 1];
  const seg = (stops.length - 1) * t;
  const i = Math.floor(seg);
  const f = seg - i;
  const [r1, g1, b1] = hexToRgb(stops[i]);
  const [r2, g2, b2] = hexToRgb(stops[i + 1]);
  return rgbToHex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f);
}

// ── Role colours ────────────────────────────────────────────────────────────
// Chrome styling lives in `tools/components.css` via `dv-*` classes; only
// `roleColors` remains here because the column-role chips read it directly.

export const roleColors: Record<string, string> = {
  group: "#0072B2",
  value: "#009E73",
  filter: "#E69F00",
  ignore: "var(--border-strong)",
};

// ── Transitional global shim ───────────────────────────────────────────────
const _g = globalThis as Record<string, unknown>;
_g.hexToRgb = hexToRgb;
_g.rgbToHex = rgbToHex;
_g.shadeColor = shadeColor;
_g.getPointColors = getPointColors;
_g.PALETTE = PALETTE;
_g.COLOR_PALETTES = COLOR_PALETTES;
_g.DIVERGING_PALETTES = DIVERGING_PALETTES;
_g.interpolateColor = interpolateColor;
_g.roleColors = roleColors;

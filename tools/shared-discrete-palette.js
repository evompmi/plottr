// shared-discrete-palette.js — plain JS, no JSX. Discrete colour palette
// catalogue + dropdown picker shared across plot tools, mirroring the
// continuous COLOR_PALETTES / PaletteStrip pattern (scatter, heatmap,
// volcano) for discrete category colouring (boxplot groups, lineplot
// series, scatter discrete categories, venn sets, aequorin conditions,
// volcano up/down/ns).
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

const DISCRETE_PALETTES = {
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
  // Tableau10
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
  // ColorBrewer Set1
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
  // ColorBrewer Set2 — colour-blind friendly
  set2: ["#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3", "#A6D854", "#FFD92F", "#E5C494", "#B3B3B3"],
  // ColorBrewer Set3
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
  // ColorBrewer Dark2 — colour-blind friendly
  dark2: ["#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02", "#A6761D", "#666666"],
  // ColorBrewer Paired — light/dark pairs
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
  // ColorBrewer Pastel1
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
  // ColorBrewer Pastel2
  pastel2: ["#B3E2CD", "#FDCDAC", "#CBD5E8", "#F4CAE4", "#E6F5C9", "#FFF2AE", "#F1E2CC", "#CCCCCC"],
  // ggplot2 default scale_colour_hue — hcl(h = seq(15, 375, length.out=n+1)[1:n], l=65, c=100).
  // Sentinel "*" means "generate at runtime sized to names.length"; consumers
  // call buildGgplot2Hue(n).
  "ggplot2-hue": ["*"],
  // viridis-d — even-spaced sample of continuous viridis. Same sentinel shape.
  "viridis-d": ["*"],
};

// Subset of palette keys considered colour-blind-safe (no red/green
// adjacency, sufficient luminance contrast). Surfaced as a ✓ glyph in the
// dropdown so users can quickly tell. Conservative on purpose — Set2 and
// Pastel2 are arguably borderline; we only mark the unambiguous ones.
const COLORBLIND_SAFE_PALETTES = new Set(["okabe-ito", "dark2", "paired", "viridis-d"]);

// HCL → sRGB conversion for ggplot2-hue. Implementation matches grDevices::hcl
// closely enough for visual parity (D65 white point, 2° observer). The math:
// HCL → Lab → XYZ (D65) → linear sRGB → sRGB with gamma. Full agreement with
// R's hcl() output is not the goal — we just need the iconic ggplot2 look.
function hclToHex(h, c, l) {
  const hRad = (h * Math.PI) / 180;
  const a = Math.cos(hRad) * c;
  const b = Math.sin(hRad) * c;
  // Lab → XYZ (D65)
  const Y = (l + 16) / 116;
  const X = a / 500 + Y;
  const Z = Y - b / 200;
  const fInv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
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
  const gam = (u) => (u > 0.0031308 ? 1.055 * Math.pow(u, 1 / 2.4) - 0.055 : 12.92 * u);
  r = Math.max(0, Math.min(1, gam(r)));
  g = Math.max(0, Math.min(1, gam(g)));
  bl = Math.max(0, Math.min(1, gam(bl)));
  const toHex = (u) => {
    const v = Math.round(u * 255)
      .toString(16)
      .padStart(2, "0");
    return v;
  };
  return "#" + toHex(r) + toHex(g) + toHex(bl);
}

// Generate ggplot2's default hue scale for n colours.
function buildGgplot2Hue(n) {
  if (n <= 0) return [];
  const out = [];
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
function buildViridisDiscrete(n) {
  if (n <= 0) return [];
  if (typeof interpolateColor !== "function" || typeof COLOR_PALETTES !== "object") {
    return [];
  }
  const stops = COLOR_PALETTES.viridis;
  if (n === 1) return [stops[Math.floor(stops.length / 2)]];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(interpolateColor(stops, i / (n - 1)));
  }
  return out;
}

// Resolve a palette name to a concrete hex array sized for `n` slots.
// Recycles modulo for fixed-length palettes, generates exactly n for the
// runtime palettes (ggplot2-hue / viridis-d). Unknown names fall back to
// okabe-ito so a stale localStorage value never produces an empty palette.
function resolveDiscretePalette(name, n) {
  if (name === "ggplot2-hue") return buildGgplot2Hue(Math.max(1, n || 1));
  if (name === "viridis-d") return buildViridisDiscrete(Math.max(1, n || 1));
  const stops = DISCRETE_PALETTES[name] || DISCRETE_PALETTES["okabe-ito"];
  if (!stops || stops.length === 0) return [];
  const count = Math.max(1, n || stops.length);
  const out = [];
  for (let i = 0; i < count; i++) out.push(stops[i % stops.length]);
  return out;
}

// Build a `{ name → hex }` record for an ordered array of group/category
// names using the named palette. Recycles modulo for fixed palettes,
// generates exact for runtime palettes.
function applyDiscretePalette(name, names) {
  const list = Array.isArray(names) ? names : [];
  const resolved = resolveDiscretePalette(name, list.length);
  const out = {};
  list.forEach(function (nm, i) {
    out[nm] = resolved[i % Math.max(1, resolved.length)] || "#000000";
  });
  return out;
}

// ── UI components ───────────────────────────────────────────────────────────

// n side-by-side coloured rects — discrete analogue of PaletteStrip. Default
// preview length = 8 (covers most real-world group counts).
function DiscreteSwatchStrip(props) {
  const palette = props.palette;
  const n = props.n || 8;
  const height = props.height || 12;
  const width = props.width || "100%";
  const colours = resolveDiscretePalette(palette, n);
  const cells = [];
  for (let i = 0; i < n; i++) {
    cells.push(
      React.createElement("div", {
        key: i,
        style: { flex: 1, background: colours[i] || "#000000" },
      })
    );
  }
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        width: width,
        height: height,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid var(--border-strong)",
      },
    },
    cells
  );
}

// Dropdown of palette keys with an inline preview strip below. Stateless.
// Uses className="dv-select" so the dropdown chrome inherits the same
// theme-aware styling (background, border, text colour) as every other
// select in the codebase — without it, the browser's default select chrome
// shows up white-on-white in dark mode.
function DiscretePaletteSelect(props) {
  const value = props.value;
  const onChange = props.onChange;
  const n = props.n || 8;
  const keys = Object.keys(DISCRETE_PALETTES);
  return React.createElement(
    "div",
    null,
    React.createElement(
      "select",
      {
        value: value,
        onChange: function (e) {
          onChange(e.target.value);
        },
        className: "dv-select",
        style: { width: "100%", fontSize: 11, margin: "2px 0 6px" },
        title:
          "Pick a discrete palette. Picking a palette overwrites every " +
          "group's colour. 👁 marks colour-blind-safe palettes.",
      },
      keys.map(function (k) {
        return React.createElement(
          "option",
          { key: k, value: k },
          k + (COLORBLIND_SAFE_PALETTES.has(k) ? "  👁" : "")
        );
      })
    ),
    React.createElement(DiscreteSwatchStrip, { palette: value, n: n })
  );
}

// High-level adapter: dropdown + preview + clobber-on-pick wiring. The tool
// supplies `applyColors(hexArray)` — a 3-line lambda that maps `hexArray[i]`
// into whatever shape the tool stores (record, array, nested). That keeps
// the per-tool integration tiny while leaving storage shapes untouched.
function DiscretePaletteRow(props) {
  const value = props.value;
  const onChange = props.onChange;
  const names = Array.isArray(props.names) ? props.names : [];
  const applyColors = props.applyColors;
  const handle = function (next) {
    onChange(next);
    if (typeof applyColors === "function") {
      const resolved = resolveDiscretePalette(next, names.length || 8);
      applyColors(resolved);
    }
  };
  return React.createElement(
    "div",
    { style: { marginBottom: 6 } },
    React.createElement(
      "div",
      {
        className: "dv-label",
        style: { fontSize: 11, marginBottom: 2 },
      },
      "Palette"
    ),
    React.createElement(DiscretePaletteSelect, {
      value: value,
      onChange: handle,
      n: Math.max(4, Math.min(12, names.length || 8)),
    })
  );
}

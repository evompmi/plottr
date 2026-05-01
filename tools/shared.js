// ── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
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
function shadeColor(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  if (factor > 0)
    return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  return rgbToHex(r * (1 + factor), g * (1 + factor), b * (1 + factor));
}
function getPointColors(baseColor, nSources) {
  if (nSources <= 1) return [baseColor];
  const colors = [];
  for (let i = 0; i < nSources; i++) {
    const t = nSources === 1 ? 0 : Math.min(1, i / (nSources - 1));
    colors.push(shadeColor(baseColor, -0.4 + t * 0.7));
  }
  return colors;
}

// ── Color palette ─────────────────────────────────────────────────────────────

// Okabe-Ito colorblind-safe palette (Wong 2011, Nature Methods)
const PALETTE = [
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

// ── Continuous colour palettes (shared by scatter + heatmap) ──────────────────

const COLOR_PALETTES = {
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
const DIVERGING_PALETTES = new Set(["rdbu", "bwr", "rdylbu", "spectral"]);

// Linear interpolation along a palette's colour stops. t in [0, 1].
function interpolateColor(stops, t) {
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

// ── Tool icons (raw SVG strings) ─────────────────────────────────────────────

const TOOL_ICONS = {
  aequorin:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 36 C8 36, 10 36, 12 34 C14 30, 15 8, 17 6 C19 4, 20 14, 22 22 C24 28, 25 32, 27 34 C29 36, 32 36, 40 36"/></svg>',
  boxplot:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="4" x2="22" y2="12"/><rect x="14" y="12" width="16" height="18" rx="2"/><line x1="14" y1="22" x2="30" y2="22"/><line x1="22" y1="30" x2="22" y2="40"/></svg>',
  scatter:
    '<svg viewBox="0 0 44 44" fill="#648FFF" stroke="none"><circle cx="10" cy="30" r="3"/><circle cx="16" cy="22" r="2.5"/><circle cx="24" cy="26" r="3.5"/><circle cx="20" cy="14" r="2"/><circle cx="32" cy="18" r="3"/><circle cx="36" cy="10" r="2.5"/><circle cx="28" cy="32" r="2"/></svg>',
  venn: '<svg viewBox="0 0 44 44" fill="none" stroke-width="1.5"><circle cx="16" cy="20" r="12" stroke="#648FFF" fill="rgba(100,143,255,0.12)"/><circle cx="28" cy="20" r="12" stroke="#785EF0" fill="rgba(120,94,240,0.12)"/></svg>',
  molarity:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2.5" stroke-linecap="round"><line x1="8" y1="10" x2="18" y2="10"/><line x1="13" y1="5" x2="13" y2="15"/><line x1="26" y1="10" x2="36" y2="10"/><line x1="8" y1="30" x2="18" y2="30"/><circle cx="13" cy="25" r="1.5" fill="#648FFF" stroke="none"/><circle cx="13" cy="35" r="1.5" fill="#648FFF" stroke="none"/><line x1="28" y1="27" x2="34" y2="33"/><line x1="34" y1="27" x2="28" y2="33"/></svg>',
  power:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="38" x2="6" y2="6"/><line x1="6" y1="38" x2="38" y2="38"/><path d="M8 34 C12 33, 16 28, 20 20 C24 12, 28 8, 36 7" stroke="#648FFF" stroke-width="2.5"/><line x1="6" y1="14" x2="38" y2="14" stroke-dasharray="3,3" stroke-width="1" opacity="0.5"/></svg>',
  lineplot:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,34 16,24 26,28 36,12"/><circle cx="6" cy="34" r="2.5" fill="#648FFF"/><circle cx="16" cy="24" r="2.5" fill="#648FFF"/><circle cx="26" cy="28" r="2.5" fill="#648FFF"/><circle cx="36" cy="12" r="2.5" fill="#648FFF"/></svg>',
  heatmap:
    '<svg viewBox="0 0 44 44" fill="none" stroke="none"><rect x="6" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.2"/><rect x="17" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="28" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="6" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="17" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="28" y="17" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="6" y="28" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="17" y="28" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="28" y="28" width="10" height="10" fill="#785EF0"/></svg>',
  upset:
    '<svg viewBox="0 0 44 44" fill="none" stroke="none"><rect x="10" y="4" width="4" height="10" fill="#648FFF"/><rect x="18" y="7" width="4" height="7" fill="#648FFF"/><rect x="26" y="10" width="4" height="4" fill="#648FFF"/><rect x="34" y="11" width="4" height="3" fill="#648FFF"/><line x1="12" y1="22" x2="12" y2="36" stroke="#333333" stroke-width="1.5"/><line x1="20" y1="22" x2="20" y2="36" stroke="#333333" stroke-width="1.5"/><circle cx="12" cy="22" r="2.5" fill="#333333"/><circle cx="20" cy="22" r="2.5" fill="#333333"/><circle cx="28" cy="22" r="2.5" fill="#DDDDDD"/><circle cx="36" cy="22" r="2.5" fill="#DDDDDD"/><circle cx="12" cy="29" r="2.5" fill="#333333"/><circle cx="20" cy="29" r="2.5" fill="#DDDDDD"/><circle cx="28" cy="29" r="2.5" fill="#333333"/><circle cx="36" cy="29" r="2.5" fill="#DDDDDD"/><circle cx="12" cy="36" r="2.5" fill="#DDDDDD"/><circle cx="20" cy="36" r="2.5" fill="#333333"/><circle cx="28" cy="36" r="2.5" fill="#DDDDDD"/><circle cx="36" cy="36" r="2.5" fill="#333333"/></svg>',
};

function toolIcon(name, size, opts) {
  size = size || 22;
  opts = opts || {};
  if (!TOOL_ICONS[name]) return null;
  const svg = TOOL_ICONS[name].replace("<svg ", '<svg width="' + size + '" height="' + size + '" ');
  const pad = Math.round(size * 0.3);
  const outerSize = size + pad * 2;
  if (opts.circle) {
    return React.createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: outerSize,
          height: outerSize,
          borderRadius: "50%",
          background: "#fff",
          flexShrink: 0,
          verticalAlign: "middle",
          marginRight: 6,
          lineHeight: 0,
        },
      },
      React.createElement("span", {
        dangerouslySetInnerHTML: { __html: svg },
        style: { display: "inline-block", lineHeight: 0 },
      })
    );
  }
  return React.createElement("span", {
    dangerouslySetInnerHTML: { __html: svg },
    style: { display: "inline-block", verticalAlign: "middle", marginRight: 6, lineHeight: 0 },
  });
}

// ── Role colours ────────────────────────────────────────────────────────────
// The old inline-style constants (sec/inp/inpN/lbl/btn*/selStyle/sepSelect)
// have been retired — chrome elements use the `dv-*` classes declared in
// `components.css` instead (see CLAUDE.md Theming section).
//
// Okabe-Ito hues: saturated enough to work on both light and dark chrome.
// Only `ignore` becomes theme-aware since it was a neutral gray.
const roleColors = {
  group: "#0072B2",
  value: "#009E73",
  filter: "#E69F00",
  ignore: "var(--border-strong)",
};

// ── Numeric detection ────────────────────────────────────────────────────────

// Unicode-aware normalisation before numeric parsing. Excel on macOS, PDFs,
// Word docs, and statistical-paper copy-paste all routinely embed non-ASCII
// minus-ish and whitespace-ish characters into number cells. These are
// visually identical to the ASCII forms but break `Number()` parsing —
// `Number("−5")` (U+2212 minus sign) is `NaN`, not `-5`. Normalise them
// before regex + Number() so we don't silently drop legitimate values.
const UNICODE_MINUS_CHARS = /[\u2212\u2013\u2014]/g; // − (minus) – (en-dash) — (em-dash)
const UNICODE_SPACE_CHARS = /[\u00A0\u2009\u202F]/g; // NBSP, thin space, narrow NBSP
function normalizeNumericString(v) {
  if (typeof v !== "string") return v;
  return v.replace(UNICODE_MINUS_CHARS, "-").replace(UNICODE_SPACE_CHARS, "");
}

// Returns true only for strings that are entirely a valid finite number.
// Rejects:
//   - alphanumeric ("6wpi", "12abc", "0xFF"),
//   - Number() specials ("Infinity", "NaN"),
//   - overflow strings that coerce to ±Infinity ("1e999"),
//   - leading-zero integer IDs ("007", "000123") that silently lose their
//     zero-padded form when coerced — well plates, accession numbers, and
//     LIMS codes commonly use this shape.
// Accepts normalised Unicode variants: "−5" (U+2212), "–5" (en-dash), and
// numbers containing NBSP / thin spaces from copy-paste.
function isNumericValue(v) {
  if (typeof v !== "string") return false;
  const s = normalizeNumericString(v).trim();
  if (s.length === 0) return false;
  // Leading-zero integer guard: reject "007", "-007", "00012". Allow "0",
  // "-0", "0.5", "0e3" (exponent notation starting with 0 is still a valid
  // normalised number).
  if (/^-?0\d/.test(s)) return false;
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return false;
  return Number.isFinite(Number(s));
}

// Convenience: normalise + parse. Callers that already know `isNumericValue`
// is true should route through this instead of `Number(v)` directly so
// Unicode-minus / NBSP values parse correctly.
function toNumericValue(v) {
  return isNumericValue(v) ? Number(normalizeNumericString(v).trim()) : NaN;
}

// ── Seeded random ────────────────────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ── Example dataset (long format, used by group plot "Load example") ──
// Arabidopsis biomass × 3 genotypes × 3 treatments × 8 replicates = 72 rows.
// Effects are tuned so k=3 ANOVA + Tukey is meaningful, facet-by-Treatment works,
// and group colors / filters / renames all have something interesting to show.
function makeExamplePlantCSV() {
  const rng = seededRandom(42);
  // Box–Muller standard normal from the seeded uniform RNG.
  const norm = () => {
    const u = Math.max(rng(), 1e-9);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const genotypes = [
    { name: "WT", base: 100 },
    { name: "abi4", base: 96 },
    { name: "oxSOS1", base: 128 },
  ];
  const treatments = [
    { name: "control", delta: 0, sd: 8 },
    { name: "drought", delta: -24, sd: 10 },
    { name: "salt", delta: -5, sd: 9 },
  ];
  const lines = ["Genotype,Treatment,Replicate,Biomass_mg"];
  for (const g of genotypes) {
    for (const t of treatments) {
      for (let r = 1; r <= 8; r++) {
        const v = g.base + t.delta + norm() * t.sd;
        lines.push(`${g.name},${t.name},${r},${v.toFixed(1)}`);
      }
    }
  }
  return lines.join("\n");
}

// ── Axis ticks ───────────────────────────────────────────────────────────────

function niceStep(range, approxN) {
  const rough = range / approxN;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = rough / mag;
  if (nice <= 1) return mag;
  if (nice <= 2) return 2 * mag;
  if (nice <= 5) return 5 * mag;
  return 10 * mag;
}
function makeTicks(min, max, approxN) {
  const step = niceStep(max - min || 1, approxN);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    const tick = parseFloat(v.toPrecision(10));
    if (tick <= max + step * 1e-9) ticks.push(tick);
  }
  return ticks;
}
function makeLogTicks(dataMin, dataMax, base) {
  if (!isFinite(dataMin) || dataMin <= 0) dataMin = base === 2 ? 0.5 : 0.1;
  if (!isFinite(dataMax) || dataMax <= dataMin) dataMax = dataMin * 1000;
  const logFn = base === 2 ? Math.log2 : base === 10 ? Math.log10 : Math.log;
  const logMin = Math.floor(logFn(dataMin));
  const logMax = Math.ceil(logFn(dataMax));
  const decades = logMax - logMin;
  const ticks = [];
  for (let exp = logMin; exp <= logMax; exp++) {
    const v = Math.pow(base, exp);
    if (v >= dataMin * 0.99 && v <= dataMax * 1.01) ticks.push({ value: v, major: true });
    if (base === 10) {
      const muls = [2, 3, 4, 5, 6, 7, 8, 9];
      for (const mul of muls) {
        const sv = mul * Math.pow(base, exp);
        if (sv >= dataMin * 0.99 && sv <= dataMax * 1.01) ticks.push({ value: sv, major: false });
      }
    } else if (base === 2 && decades <= 8) {
      const mid = Math.pow(base, exp) * 1.5;
      if (mid >= dataMin * 0.99 && mid <= dataMax * 1.01) ticks.push({ value: mid, major: false });
    }
  }
  ticks.sort((a, b) => a.value - b.value);
  return ticks;
}

// ── Separator detection ───────────────────────────────────────────────────────
//
// Picks the delimiter most likely to produce a consistent column count. The
// naive "count occurrences across the first 2 kB" heuristic fails on TSVs
// whose header has commas in free-text ("Sample, Description, Notes") — those
// header-level commas can out-count the tabs in data rows and flip the
// detection to `,`, collapsing 20 data columns to 1.
//
// Strategy: for each candidate (`\t`, `;`, `,`), measure how uniform the
// per-line count is across the first ~50 non-empty lines. A real delimiter
// partitions every line into the SAME number of columns, so its per-line
// count has low variance and a median ≥ 1. A separator that sneaks into
// quoted text or headers only produces inconsistent per-line counts.
//
// Ranking key: (medianPerLine >= 1, then low coefficient of variation, then
// high total count). Falls back to `\s+` only when no candidate appears at
// all.
function autoDetectSep(text, override = "") {
  if (override !== "") return override;
  const h = text.slice(0, 2000);
  // Bound the scan to ~50 non-empty lines — enough to see pattern, cheap.
  const lines = h.split(/\r?\n/).filter((l) => l.trim() !== "");
  const head = lines.slice(0, Math.min(50, lines.length));
  if (head.length === 0) return /\s+/;

  const CANDIDATES = ["\t", ";", ","];
  const scores = CANDIDATES.map((sep) => {
    const countPerLine = head.map((line) => {
      // Quoted-field-aware count: skip chars inside "..." (matches the
      // tokenizer so the detector can't be fooled by an inlined delimiter
      // in a legitimately-quoted cell).
      let n = 0;
      let inQuoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuoted = !inQuoted;
          continue;
        }
        if (!inQuoted && ch === sep) n++;
      }
      return n;
    });
    const total = countPerLine.reduce((a, b) => a + b, 0);
    const sorted = countPerLine.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = total / countPerLine.length;
    // Sample variance with Bessel correction collapses to 0 for uniform
    // counts; coefficient of variation is σ / μ (0 when perfectly uniform).
    let variance = 0;
    if (countPerLine.length > 1) {
      for (const n of countPerLine) variance += (n - mean) * (n - mean);
      variance /= countPerLine.length - 1;
    }
    const cv = mean > 0 ? Math.sqrt(variance) / mean : Infinity;
    return { sep, total, median, cv };
  });

  // Keep only candidates that actually show up in most lines. A separator
  // with median 0 never partitions more than half the lines → it's noise.
  const viable = scores.filter((s) => s.median >= 1);
  if (viable.length === 0) {
    // No candidate partitions consistently — fall back to "highest raw count"
    // like the old heuristic, or to whitespace when nothing appears.
    const best = scores.reduce((a, b) => (b.total > a.total ? b : a));
    return best.total === 0 ? /\s+/ : best.sep;
  }
  // Prefer the most-uniform partition (lowest CV). Break ties by total count.
  viable.sort((a, b) => a.cv - b.cv || b.total - a.total);
  return viable[0].sep;
}

// ── Delimited-text tokenizer ──────────────────────────────────────────────────
//
// RFC 4180-style state machine. Handles quoted fields with embedded separators,
// embedded `\n` / `\r\n` inside quoted cells, escaped `""` pairs, a leading BOM,
// and mixed CRLF/LF line endings. A `"` in the middle of an unquoted field is
// preserved literally (so `5"` as an inch measurement survives) — only a
// leading `"` at the start of a field opens a quoted run.
//
// Cells are post-trimmed to match the historical pre-state-machine behaviour.
// `sep` may be a single-character string (`,`, `\t`, `;`) or a RegExp (only
// used for the `autoDetectSep` whitespace fallback). For the RegExp path we
// fall back to simple line-by-line `split(sep)` because quoted fields don't
// make sense under an arbitrary-whitespace grammar.
function tokenizeDelimited(text, sep) {
  if (typeof text !== "string" || text.length === 0) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Identify whitespace-fallback regex by duck-typing (an `instanceof RegExp`
  // check would fail under the vm-context loader used by the tests because the
  // regex is constructed in a different realm).
  if (typeof sep !== "string") {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((l) => l.trim().split(sep));
  }
  const rows = [];
  let row = [];
  let field = "";
  let inQuoted = false;
  let fieldStarted = false;
  const flushRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) {
      for (let c = 0; c < row.length; c++) row[c] = row[c].trim();
      rows.push(row);
    }
    row = [];
    field = "";
    fieldStarted = false;
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (inQuoted) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuoted = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (!fieldStarted && ch === '"') {
      inQuoted = true;
      fieldStarted = true;
      i++;
    } else if (ch === sep) {
      row.push(field);
      for (let c = 0; c < 0; c++); // no-op; trim happens at flushRow
      field = "";
      fieldStarted = false;
      i++;
    } else if (ch === "\n" || ch === "\r") {
      flushRow();
      if (ch === "\r" && i + 1 < n && text[i + 1] === "\n") i += 2;
      else i++;
    } else {
      field += ch;
      fieldStarted = true;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    flushRow();
  }
  // `flushRow` only trims cells when the row wasn't empty; cells in mid-row
  // positions pushed before the row-end still need trimming.
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) rows[r][c] = rows[r][c].trim();
  }
  return rows;
}

// ── Decimal comma fix (per-column) ────────────────────────────────────────────
//
// Old implementation did a global `/(\d),(\d)/g` text rewrite, which silently
// mangled US-format thousand separators (`1,000.50` → `1.000.50` → NaN) and
// mutated label cells containing commas (`"E,coli"` → `E.coli`).
//
// The new implementation tokenizes the text first, then decides per-column
// whether commas are decimal separators. A column is flagged only when:
//   - it has at least one cell containing a comma,
//   - strictly more cells match `isNumericValue` after `,`→`.` than before,
//   - at least one comma-cell has a non-3-digit fractional part (pure
//     `1,000`/`2,500` patterns look like US thousand groups and are left
//     alone).
// Only flagged columns get rewritten; label columns, mixed-format columns, and
// pure-thousand-grouping columns are preserved exactly.
function fixDecimalCommas(text, sep) {
  if (typeof text !== "string" || text.length === 0) {
    return { text, commaFixed: false, count: 0 };
  }
  if (typeof sep !== "string") return { text, commaFixed: false, count: 0 };
  if (sep === ",") return { text, commaFixed: false, count: 0 };
  if (sep === "") return { text, commaFixed: false, count: 0 };
  const rows = tokenizeDelimited(text, sep);
  if (rows.length < 2) return { text, commaFixed: false, count: 0 };
  const nCols = Math.max(...rows.map((r) => r.length));
  const decimalCommaCols = new Set();
  for (let c = 0; c < nCols; c++) {
    let numericAsIs = 0;
    let numericIfFixed = 0;
    let hasComma = 0;
    let nonEmpty = 0;
    let anyNonThousandish = false;
    for (let r = 1; r < rows.length; r++) {
      const v = rows[r][c];
      if (v == null || v === "") continue;
      nonEmpty++;
      if (v.indexOf(",") !== -1) {
        hasComma++;
        const last = v.lastIndexOf(",");
        const after = v.slice(last + 1);
        const m = after.match(/^\d+/);
        if (!m || m[0].length !== 3) anyNonThousandish = true;
      }
      if (isNumericValue(v)) numericAsIs++;
      if (isNumericValue(v.replace(/,/g, "."))) numericIfFixed++;
    }
    if (nonEmpty > 0 && hasComma > 0 && numericIfFixed > numericAsIs && anyNonThousandish) {
      decimalCommaCols.add(c);
    }
  }
  if (decimalCommaCols.size === 0) return { text, commaFixed: false, count: 0 };
  let count = 0;
  for (let r = 0; r < rows.length; r++) {
    for (const c of decimalCommaCols) {
      const v = rows[r][c];
      if (v && v.indexOf(",") !== -1) {
        const fixed = v.replace(/,/g, ".");
        if (isNumericValue(fixed)) {
          rows[r][c] = fixed;
          count++;
        }
      }
    }
  }
  if (count === 0) return { text, commaFixed: false, count: 0 };
  const q = (cell) => {
    if (
      cell.indexOf(sep) !== -1 ||
      cell.indexOf('"') !== -1 ||
      cell.indexOf("\n") !== -1 ||
      cell.indexOf("\r") !== -1
    ) {
      return '"' + cell.replace(/"/g, '""') + '"';
    }
    return cell;
  };
  const rebuilt = rows.map((r) => r.map(q).join(sep)).join("\n");
  return { text: rebuilt, commaFixed: true, count };
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function detectHeader(rows) {
  if (rows.length < 2) return true;
  const a = rows[0].filter((v) => !isNumericValue(v) && v.trim() !== "").length;
  const b = rows[1].filter((v) => !isNumericValue(v) && v.trim() !== "").length;
  if (a > b) return true;
  if (a === b && a > 0) {
    let reps = 0;
    for (let i = 1; i < Math.min(rows.length, 20); i++)
      for (let c = 0; c < rows[0].length; c++)
        if (rows[i][c] && rows[i][c].trim() === rows[0][c].trim()) reps++;
    return reps < rows[0].length;
  }
  return a > 0;
}

function parseRaw(text, sepOv = "") {
  const sep = autoDetectSep(text, sepOv);
  const all = tokenizeDelimited(text, sep);
  if (all.length < 1) return { headers: [], rows: [], hasHeader: false };
  const mx = Math.max(...all.map((r) => r.length));
  const pad = all.map((r) => {
    while (r.length < mx) r.push("");
    return r;
  });
  const hh = detectHeader(pad);
  if (hh) return { headers: pad[0], rows: pad.slice(1), hasHeader: true };
  return { headers: pad[0].map((_, i) => `Col_${i + 1}`), rows: pad, hasHeader: false };
}

function guessColumnType(vals) {
  const ne = vals.filter((v) => v != null && v !== "");
  if (ne.length === 0) return "ignore";
  if (ne.filter((v) => isNumericValue(v)).length / ne.length > 0.8) {
    // Years (2024 / 2025 / 2026), binary flags (0 / 1), and small integer
    // enumerations are 100 % numeric but semantically categorical. Demote to
    // "group" before the value branch returns: small distinct count, all
    // integer, and many repetitions per value (cardinality << row count).
    // Threshold matches the "group" rule below (≤ 12 distinct, < 30 % of
    // rows) — tighter than the generic ≤ 20 to avoid pulling continuous
    // small-N data (e.g. 5 unique fluorescence intensities) into the wrong
    // bucket.
    const u = new Set(ne);
    if (u.size <= 12 && u.size < ne.length * 0.3) {
      const allIntegers = ne.every((v) => {
        const n = Number(String(v).trim());
        return Number.isFinite(n) && Number.isInteger(n);
      });
      if (allIntegers) return "group";
    }
    return "value";
  }
  const u = new Set(ne);
  if (u.size <= 20 && u.size < ne.length * 0.5) return "group";
  return "filter";
}

function detectWideFormat(headers, rows) {
  if (headers.length < 2 || rows.length < 2) return false;
  const numericCols = headers.map((_, ci) => {
    const vals = rows.map((r) => r[ci]).filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.8;
  });
  return numericCols.every(Boolean);
}

// Wide-matrix parser for heatmap-style data:
//   first row     = column labels (the leading cell is the row-label-column
//                   heading and may be blank or any token — we drop it)
//   first column  = row labels
//   everything else = numeric values (non-numeric cells become NaN and are
//                   counted in warnings.nonNumeric so the UI can surface them)
// Returns { rowLabels, colLabels, matrix, warnings } where matrix is a
// 2-D array shaped [rowLabels.length][colLabels.length].
function parseWideMatrix(text, sepOv = "") {
  const { headers, rows } = parseRaw(text, sepOv);
  if (headers.length < 2 || rows.length < 1) {
    return {
      rowLabels: [],
      colLabels: [],
      matrix: [],
      warnings: { nonNumeric: 0, emptyRows: 0, emptyCols: 0 },
    };
  }
  const colLabels = headers.slice(1);
  const rowLabels = [];
  const matrix = [];
  let nonNumeric = 0;
  rows.forEach((r) => {
    const label = r[0] == null ? "" : String(r[0]);
    const values = new Array(colLabels.length);
    for (let ci = 0; ci < colLabels.length; ci++) {
      const raw = r[ci + 1];
      if (raw == null || raw === "") {
        values[ci] = NaN;
      } else if (isNumericValue(raw)) {
        values[ci] = toNumericValue(raw);
      } else {
        values[ci] = NaN;
        nonNumeric++;
      }
    }
    rowLabels.push(label);
    matrix.push(values);
  });
  return { rowLabels, colLabels, matrix, warnings: { nonNumeric } };
}

// ── Unified data parsing ─────────────────────────────────────────────────────

function parseData(text, sepOv = "") {
  const sep = autoDetectSep(text, sepOv);
  const all = tokenizeDelimited(text, sep);
  if (all.length < 2) return { headers: [], data: [], rawData: [] };
  const headers = all[0];
  const nCols = headers.length;
  const data = [],
    rawData = [];
  for (let i = 1; i < all.length; i++) {
    const rawVals = all[i].slice();
    while (rawVals.length < nCols) rawVals.push("");
    if (rawVals.every((v) => v === "")) continue;
    data.push(rawVals.map((s) => (isNumericValue(s) ? toNumericValue(s) : null)));
    rawData.push(rawVals);
  }
  return { headers, data, rawData };
}

function dataToColumns(data, nCols) {
  const columns = Array.from({ length: nCols }, () => []);
  for (const row of data) {
    for (let c = 0; c < nCols; c++) {
      if (row[c] != null) columns[c].push(row[c]);
    }
  }
  return columns;
}

// ── Wide / long format helpers ────────────────────────────────────────────────

function wideToLong(headers, rows) {
  const longRows = [];
  rows.forEach((r) => {
    headers.forEach((h, ci) => {
      if (r[ci] !== "" && isNumericValue(r[ci])) longRows.push([h, r[ci]]);
    });
  });
  return { headers: ["Group", "Value"], rows: longRows };
}

function reshapeWide(rows, gi, vi) {
  const g = {};
  rows.forEach((r) => {
    const k = r[gi] || "?";
    if (!g[k]) g[k] = [];
    g[k].push(r[vi]);
  });
  const vals = Object.values(g);
  if (vals.length === 0) return { headers: [], rows: [] };
  const mx = Math.max(...vals.map((v) => v.length));
  const names = Object.keys(g);
  const w = [];
  for (let i = 0; i < mx; i++) w.push(names.map((n) => (g[n][i] != null ? g[n][i] : "")));
  return { headers: names, rows: w };
}

// ── Set-membership parsing (Venn / UpSet) ─────────────────────────────────────

// Wide format: each column is one set, cells are item ids. Preserves the
// column order via Map so downstream colour/index assignment is deterministic.
function parseSetData(headers, rows) {
  const sets = new Map();
  for (let ci = 0; ci < headers.length; ci++) {
    const s = new Set();
    for (const r of rows) {
      const v = (r[ci] || "").trim();
      if (v) s.add(v);
    }
    if (s.size > 0) sets.set(headers[ci], s);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

// Long format: exactly two columns — item id, set name. Pivots into the same
// {setNames, sets} shape as parseSetData. setNames are ordered by first
// appearance in the input. Throws if the table doesn't have exactly 2 columns.
function parseLongFormatSets(headers, rows) {
  if (!headers || headers.length !== 2) {
    throw new Error("Long format requires exactly 2 columns (item, set).");
  }
  const sets = new Map();
  for (const r of rows) {
    const item = (r[0] || "").trim();
    const setName = (r[1] || "").trim();
    if (!item || !setName) continue;
    if (!sets.has(setName)) sets.set(setName, new Set());
    sets.get(setName).add(item);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

// ── Statistics ────────────────────────────────────────────────────────────────

function computeStats(arr) {
  const n = arr.length;
  if (n === 0) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const sd = Math.sqrt(variance);
  const sem = n > 1 ? sd / Math.sqrt(n) : 0;
  // 95% CI half-width (two-sided t-critical × SEM). Matches lineplot's per-x
  // CI at line 86. Falls back to 0 when n<2 or tinv is unavailable (shared.js
  // loads before stats.js, but this runs at call time when tinv is global).
  const ci95 = n > 1 && typeof tinv === "function" ? tinv(0.975, n - 1) * sem : 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return { mean, sd, sem, ci95, n, min, max, median };
}

function quartiles(arr) {
  const s = [...arr].sort((a, b) => a - b),
    n = s.length;
  if (n === 0) return null;
  const q = (p) => {
    const i = p * (n - 1),
      lo = Math.floor(i),
      hi = Math.min(Math.ceil(i), n - 1);
    return lo === hi ? s[lo] : s[lo] * (hi - i) + s[hi] * (i - lo);
  };
  const q1 = q(0.25),
    med = q(0.5),
    q3 = q(0.75),
    iqr = q3 - q1;
  return {
    min: s[0],
    max: s[n - 1],
    q1,
    med,
    q3,
    iqr,
    wLo: Math.min(s.find((v) => v >= q1 - 1.5 * iqr) ?? s[0], q1),
    wHi: Math.max([...s].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? s[n - 1], q3),
    n,
  };
}

function kde(values, nPoints = 50) {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0],
    max = sorted[n - 1];
  const iqr = n >= 4 ? sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)] : max - min;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const bw = 1.06 * Math.min(std, (iqr || 1) / 1.34) * n ** -0.2 || 1;
  const pad = bw * 2;
  const lo = min - pad,
    hi = max + pad;
  const step = (hi - lo) / (nPoints - 1);
  const pts = [];
  for (let i = 0; i < nPoints; i++) {
    const x = lo + i * step;
    let density = 0;
    for (let j = 0; j < n; j++) {
      const z = (x - values[j]) / bw;
      density += Math.exp(-0.5 * z * z);
    }
    density /= n * bw * Math.sqrt(2 * Math.PI);
    pts.push({ x, d: density });
  }
  return pts;
}

function computeGroupStats(groups) {
  return Object.entries(groups).map(([name, vals]) => {
    const nums = vals.filter((v) => v !== "" && isNumericValue(v)).map(toNumericValue);
    const stats = computeStats(nums);
    if (!stats)
      return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
    return { name, ...stats };
  });
}

// ── Download helpers ──────────────────────────────────────────────────────────

// Sanitize an arbitrary string into an SVG-safe id fragment so exported
// <g id="..."> values are valid NCNames and show up as readable group names
// in Inkscape's Objects panel / XML editor. Non-alphanumerics become hyphens,
// runs are collapsed, edges trimmed, and a leading digit is prefixed with "_".
function svgSafeId(s) {
  if (s == null) return "unnamed";
  const cleaned = String(s)
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) return "unnamed";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : "_" + cleaned;
}

function fileBaseName(fileName, fallback) {
  if (typeof fileName === "string" && fileName.trim()) return fileName.replace(/\.[^.]+$/, "");
  return fallback || "data";
}

function flashSaved(btn) {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = "✓ Saved";
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled = false;
  }, 1500);
}

// Produce a standalone SVG string suitable for a file export.
//
// Two transformations vs the live DOM, both Inkscape workarounds:
//
//   1. Strip the root <svg> inline `style="max-width:100%;height:auto;..."`
//      (responsive-layout sugar that only makes sense inside an HTML flow;
//      Inkscape's CSS engine can collapse the computed viewport when it sees
//      `height: auto` on a root <svg>).
//
//   2. Strip every `shape-rendering="crispEdges"` attribute. This matters for
//      the heatmap, where the cells group carries crispEdges to keep browser
//      PNG rasterisation seamless. Inkscape ≥1.1 has a cairo-renderer bug
//      where crispEdges on a group containing thousands of small rects (esp.
//      sub-pixel-height ones like heatmap cells at 2 px tall) collapses the
//      whole group to default-fill (black). Our cell rects are already on
//      integer pixel coordinates via Math.round in the layout code, so
//      crispEdges is redundant for seam avoidance in the exported file — we
//      just drop it on export.
function serializeSvgForExport(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute("style");
  clone.querySelectorAll("[shape-rendering]").forEach((el) => {
    el.removeAttribute("shape-rendering");
  });
  return new XMLSerializer().serializeToString(clone);
}

function downloadSvg(svgEl, filename) {
  if (!svgEl) return;
  const svgStr = serializeSvgForExport(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadPng(svgEl, filename, scale) {
  if (!svgEl) return;
  scale = scale || 2;
  const svgStr = serializeSvgForExport(svgEl);
  const vb = svgEl.getAttribute("viewBox");
  const parts = vb ? vb.split(/[\s,]+/) : [];
  const w = parts.length >= 4 ? parseFloat(parts[2]) : svgEl.clientWidth || 800;
  const h = parts.length >= 4 ? parseFloat(parts[3]) : svgEl.clientHeight || 600;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  img.onload = function () {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function (pngBlob) {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(pngUrl);
      }, 1000);
    }, "image/png");
  };
  img.src = url;
}
function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// RFC 4180 CSV string builder. Pure (no DOM / Blob) so it round-trips through
// `parseRaw` in tests without needing a browser context. Headers go through
// the same escape as data cells — a header containing a comma
// ("Sample, Note") used to write a malformed first line that Plöttr's own
// parseRaw split into N+1 columns on re-import.
function buildCsvString(headers, rows) {
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

function downloadCsv(headers, rows, filename) {
  const blob = new Blob([buildCsvString(headers, rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

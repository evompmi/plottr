// _core/shared.ts — color, palette, numeric, CSV / TSV, ticks, statistics,
// SVG export, and download helpers shared across every tool.
//
// Migrated from the legacy script-scope `tools/shared.js`. The same algorithms
// and the same public surface — typed at the boundaries and importable as ES
// modules. The trailing `globalThis` block keeps the legacy ambient global
// surface alive for unmigrated callers (tool `.tsx` files using `parseRaw`,
// `PALETTE`, `isNumericValue`, …) until the Phase-5 cleanup converts each
// caller to a direct import.

import { tinv } from "./stats/dist";

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

// ── Color palette ──────────────────────────────────────────────────────────

// Okabe-Ito colorblind-safe palette (Wong 2011, Nature Methods)
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

// ── Tool icons (raw SVG strings) ─────────────────────────────────────────

export const TOOL_ICONS: Record<string, string> = {
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
  volcano:
    '<svg viewBox="0 0 44 44" fill="none"><line x1="3" y1="30" x2="41" y2="30" stroke="#999999" stroke-width="0.6" stroke-dasharray="2,2" opacity="0.45"/><circle cx="22" cy="38" r="1.4" fill="#999999"/><circle cx="20" cy="36" r="1.2" fill="#999999"/><circle cx="24" cy="36" r="1.2" fill="#999999"/><circle cx="18" cy="38" r="1" fill="#999999"/><circle cx="26" cy="38" r="1" fill="#999999"/><circle cx="22" cy="34" r="1" fill="#999999"/><circle cx="17" cy="28" r="1.6" fill="#0072B2"/><circle cx="13" cy="22" r="2" fill="#0072B2"/><circle cx="9" cy="16" r="2.4" fill="#0072B2"/><circle cx="5" cy="10" r="2.6" fill="#0072B2"/><circle cx="27" cy="28" r="1.6" fill="#D55E00"/><circle cx="31" cy="22" r="2" fill="#D55E00"/><circle cx="35" cy="16" r="2.4" fill="#D55E00"/><circle cx="39" cy="10" r="2.6" fill="#D55E00"/></svg>',
};

export function toolIcon(
  name: string,
  size?: number,
  opts?: { circle?: boolean }
): React.ReactElement | null {
  const sz = size || 22;
  const o = opts || {};
  if (!TOOL_ICONS[name]) return null;
  const svg = TOOL_ICONS[name].replace("<svg ", '<svg width="' + sz + '" height="' + sz + '" ');
  const pad = Math.round(sz * 0.3);
  const outerSize = sz + pad * 2;
  if (o.circle) {
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

// ── Role colours ───────────────────────────────────────────────────────────

export const roleColors: Record<string, string> = {
  group: "#0072B2",
  value: "#009E73",
  filter: "#E69F00",
  ignore: "var(--border-strong)",
};

// ── Numeric detection ──────────────────────────────────────────────────────

const UNICODE_MINUS_CHARS = /[−–—]/g; // − (minus) – (en-dash) — (em-dash)
const UNICODE_SPACE_CHARS = /[   ]/g; // NBSP, thin space, narrow NBSP

export function normalizeNumericString(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v.replace(UNICODE_MINUS_CHARS, "-").replace(UNICODE_SPACE_CHARS, "");
}

export function isNumericValue(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = (normalizeNumericString(v) as string).trim();
  if (s.length === 0) return false;
  if (/^-?0\d/.test(s)) return false;
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return false;
  return Number.isFinite(Number(s));
}

export function toNumericValue(v: unknown): number {
  return isNumericValue(v) ? Number((normalizeNumericString(v) as string).trim()) : NaN;
}

// ── Seeded random ──────────────────────────────────────────────────────────

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ── Axis ticks ─────────────────────────────────────────────────────────────

export function niceStep(range: number, approxN: number): number {
  const rough = range / approxN;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = rough / mag;
  if (nice <= 1) return mag;
  if (nice <= 2) return 2 * mag;
  if (nice <= 5) return 5 * mag;
  return 10 * mag;
}

export function makeTicks(min: number, max: number, approxN: number): number[] {
  const step = niceStep(max - min || 1, approxN);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    const tick = parseFloat(v.toPrecision(10));
    if (tick <= max + step * 1e-9) ticks.push(tick);
  }
  return ticks;
}

export interface LogTick {
  value: number;
  major: boolean;
}

export function makeLogTicks(dataMin: number, dataMax: number, base: number): LogTick[] {
  let lo = dataMin;
  let hi = dataMax;
  if (!isFinite(lo) || lo <= 0) lo = base === 2 ? 0.5 : 0.1;
  if (!isFinite(hi) || hi <= lo) hi = lo * 1000;
  const logFn = base === 2 ? Math.log2 : base === 10 ? Math.log10 : Math.log;
  const logMin = Math.floor(logFn(lo));
  const logMax = Math.ceil(logFn(hi));
  const decades = logMax - logMin;
  const ticks: LogTick[] = [];
  for (let exp = logMin; exp <= logMax; exp++) {
    const v = Math.pow(base, exp);
    if (v >= lo * 0.99 && v <= hi * 1.01) ticks.push({ value: v, major: true });
    if (base === 10) {
      const muls = [2, 3, 4, 5, 6, 7, 8, 9];
      for (const mul of muls) {
        const sv = mul * Math.pow(base, exp);
        if (sv >= lo * 0.99 && sv <= hi * 1.01) ticks.push({ value: sv, major: false });
      }
    } else if (base === 2 && decades <= 8) {
      const mid = Math.pow(base, exp) * 1.5;
      if (mid >= lo * 0.99 && mid <= hi * 1.01) ticks.push({ value: mid, major: false });
    }
  }
  ticks.sort((a, b) => a.value - b.value);
  return ticks;
}

// ── Separator detection ────────────────────────────────────────────────────

export function autoDetectSep(text: string, override: string = ""): string | RegExp {
  if (override !== "") return override;
  const h = text.slice(0, 2000);
  const lines = h.split(/\r?\n/).filter((l) => l.trim() !== "");
  const head = lines.slice(0, Math.min(50, lines.length));
  if (head.length === 0) return /\s+/;

  const CANDIDATES = ["\t", ";", ","];
  const scores = CANDIDATES.map((sep) => {
    const countPerLine = head.map((line) => {
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
    let variance = 0;
    if (countPerLine.length > 1) {
      for (const n of countPerLine) variance += (n - mean) * (n - mean);
      variance /= countPerLine.length - 1;
    }
    const cv = mean > 0 ? Math.sqrt(variance) / mean : Infinity;
    return { sep, total, median, cv };
  });

  const viable = scores.filter((s) => s.median >= 1);
  if (viable.length === 0) {
    const best = scores.reduce((a, b) => (b.total > a.total ? b : a));
    return best.total === 0 ? /\s+/ : best.sep;
  }
  viable.sort((a, b) => a.cv - b.cv || b.total - a.total);
  return viable[0].sep;
}

// ── Delimited-text tokenizer ───────────────────────────────────────────────

export function tokenizeDelimited(text: string, sep: string | RegExp): string[][] {
  if (typeof text !== "string" || text.length === 0) return [];
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (typeof sep !== "string") {
    return s
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((l) => l.trim().split(sep));
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuoted = false;
  let fieldStarted = false;
  const flushRow = (): void => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) {
      for (let c = 0; c < row.length; c++) row[c] = row[c].trim();
      rows.push(row);
    }
    row = [];
    field = "";
    fieldStarted = false;
  };
  const n = s.length;
  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (inQuoted) {
      if (ch === '"') {
        if (i + 1 < n && s[i + 1] === '"') {
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
      field = "";
      fieldStarted = false;
      i++;
    } else if (ch === "\n" || ch === "\r") {
      flushRow();
      if (ch === "\r" && i + 1 < n && s[i + 1] === "\n") i += 2;
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
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) rows[r][c] = rows[r][c].trim();
  }
  return rows;
}

// ── Decimal comma fix (per-column) ────────────────────────────────────────

export function fixDecimalCommas(
  text: string,
  sep: string | RegExp
): { text: string; commaFixed: boolean; count: number } {
  if (typeof text !== "string" || text.length === 0) {
    return { text, commaFixed: false, count: 0 };
  }
  if (typeof sep !== "string") return { text, commaFixed: false, count: 0 };
  if (sep === ",") return { text, commaFixed: false, count: 0 };
  if (sep === "") return { text, commaFixed: false, count: 0 };
  const rows = tokenizeDelimited(text, sep);
  if (rows.length < 2) return { text, commaFixed: false, count: 0 };
  const nCols = Math.max(...rows.map((r) => r.length));
  const decimalCommaCols = new Set<number>();
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
  const q = (cell: string): string => {
    if (
      cell.indexOf(sep as string) !== -1 ||
      cell.indexOf('"') !== -1 ||
      cell.indexOf("\n") !== -1 ||
      cell.indexOf("\r") !== -1
    ) {
      return '"' + cell.replace(/"/g, '""') + '"';
    }
    return cell;
  };
  const rebuilt = rows.map((r) => r.map(q).join(sep as string)).join("\n");
  return { text: rebuilt, commaFixed: true, count };
}

// ── Parsing helpers ────────────────────────────────────────────────────────

export function detectHeader(rows: string[][]): boolean {
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

export interface FormulaInjectionWarning {
  count: number;
  headers: Array<{ idx: number; value: string }>;
  cells: Array<{ row: number; col: number; header: string | null; value: string }>;
}

export interface ParseRawResult {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  injectionWarnings: FormulaInjectionWarning | null;
}

export function parseRaw(text: string, sepOv: string = ""): ParseRawResult {
  const sep = autoDetectSep(text, sepOv);
  const all = tokenizeDelimited(text, sep);
  if (all.length < 1) return { headers: [], rows: [], hasHeader: false, injectionWarnings: null };
  const mx = Math.max(...all.map((r) => r.length));
  const pad = all.map((r) => {
    while (r.length < mx) r.push("");
    return r;
  });
  const hh = detectHeader(pad);
  let headers: string[], rows: string[][];
  if (hh) {
    headers = pad[0];
    rows = pad.slice(1);
  } else {
    headers = pad[0].map((_, i) => `Col_${i + 1}`);
    rows = pad;
  }
  const scan = scanForFormulaInjection(headers, rows);
  return {
    headers,
    rows,
    hasHeader: !!hh,
    injectionWarnings: scan.count > 0 ? scan : null,
  };
}

export type ColumnRole = "group" | "value" | "filter" | "ignore";

export function guessColumnType(vals: string[]): ColumnRole {
  const ne = vals.filter((v) => v != null && v !== "");
  if (ne.length === 0) return "ignore";
  if (ne.filter((v) => isNumericValue(v)).length / ne.length > 0.8) {
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

export function detectWideFormat(headers: string[], rows: string[][]): boolean {
  if (headers.length < 2 || rows.length < 2) return false;
  const numericCols = headers.map((_, ci) => {
    const vals = rows.map((r) => r[ci]).filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.8;
  });
  return numericCols.every(Boolean);
}

export interface ParseWideMatrixResult {
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
  warnings: { nonNumeric: number };
  injectionWarnings: FormulaInjectionWarning | null;
}

export function parseWideMatrix(text: string, sepOv: string = ""): ParseWideMatrixResult {
  const parsed = parseRaw(text, sepOv);
  const { headers, rows, injectionWarnings } = parsed;
  if (headers.length < 2 || rows.length < 1) {
    return {
      rowLabels: [],
      colLabels: [],
      matrix: [],
      warnings: { nonNumeric: 0 },
      injectionWarnings: null,
    };
  }
  const colLabels = headers.slice(1);
  const rowLabels: string[] = [];
  const matrix: number[][] = [];
  let nonNumeric = 0;
  rows.forEach((r) => {
    const label = r[0] == null ? "" : String(r[0]);
    const values: number[] = new Array(colLabels.length);
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
  return { rowLabels, colLabels, matrix, warnings: { nonNumeric }, injectionWarnings };
}

// ── Unified data parsing ──────────────────────────────────────────────────

export interface ParseDataResult {
  headers: string[];
  data: (number | null)[][];
  rawData: string[][];
  injectionWarnings: FormulaInjectionWarning | null;
}

export function parseData(text: string, sepOv: string = ""): ParseDataResult {
  const sep = autoDetectSep(text, sepOv);
  const all = tokenizeDelimited(text, sep);
  if (all.length < 2) return { headers: [], data: [], rawData: [], injectionWarnings: null };
  const headers = all[0];
  const nCols = headers.length;
  const data: (number | null)[][] = [];
  const rawData: string[][] = [];
  for (let i = 1; i < all.length; i++) {
    const rawVals = all[i].slice();
    while (rawVals.length < nCols) rawVals.push("");
    if (rawVals.every((v) => v === "")) continue;
    data.push(rawVals.map((s) => (isNumericValue(s) ? toNumericValue(s) : null)));
    rawData.push(rawVals);
  }
  const scan = scanForFormulaInjection(headers, rawData);
  return { headers, data, rawData, injectionWarnings: scan.count > 0 ? scan : null };
}

export function dataToColumns(data: (number | null)[][], nCols: number): number[][] {
  const columns: number[][] = Array.from({ length: nCols }, () => []);
  for (const row of data) {
    for (let c = 0; c < nCols; c++) {
      if (row[c] != null) columns[c].push(row[c] as number);
    }
  }
  return columns;
}

// ── Wide / long format helpers ────────────────────────────────────────────

export function wideToLong(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][]; skipped: number } {
  const longRows: string[][] = [];
  let skipped = 0;
  rows.forEach((r) => {
    headers.forEach((h, ci) => {
      if (r[ci] !== "" && isNumericValue(r[ci])) {
        longRows.push([h, r[ci]]);
      } else {
        skipped++;
      }
    });
  });
  return { headers: ["Group", "Value"], rows: longRows, skipped };
}

export function reshapeWide(
  rows: string[][],
  gi: number,
  vi: number
): { headers: string[]; rows: string[][]; unlabelled: number } {
  const g: Record<string, string[]> = {};
  let unlabelled = 0;
  rows.forEach((r) => {
    const raw = r[gi];
    if (raw === "" || raw == null) unlabelled++;
    const k = raw || "?";
    if (!g[k]) g[k] = [];
    g[k].push(r[vi]);
  });
  const vals = Object.values(g);
  if (vals.length === 0) return { headers: [], rows: [], unlabelled };
  const mx = Math.max(...vals.map((v) => v.length));
  const names = Object.keys(g);
  const w: string[][] = [];
  for (let i = 0; i < mx; i++) w.push(names.map((n) => (g[n][i] != null ? g[n][i] : "")));
  return { headers: names, rows: w, unlabelled };
}

// ── Set-membership parsing (Venn / UpSet) ─────────────────────────────────

export function parseSetData(
  headers: string[],
  rows: string[][]
): { setNames: string[]; sets: Map<string, Set<string>> } {
  const sets = new Map<string, Set<string>>();
  for (let ci = 0; ci < headers.length; ci++) {
    const s = new Set<string>();
    for (const r of rows) {
      const v = (r[ci] || "").trim();
      if (v) s.add(v);
    }
    if (s.size > 0) sets.set(headers[ci], s);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

export function parseLongFormatSets(
  headers: string[],
  rows: string[][]
): { setNames: string[]; sets: Map<string, Set<string>> } {
  if (!headers || headers.length !== 2) {
    throw new Error("Long format requires exactly 2 columns (item, set).");
  }
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    const item = (r[0] || "").trim();
    const setName = (r[1] || "").trim();
    if (!item || !setName) continue;
    if (!sets.has(setName)) sets.set(setName, new Set());
    sets.get(setName)!.add(item);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

// ── Statistics ─────────────────────────────────────────────────────────────

export interface ComputeStatsResult {
  mean: number;
  sd: number;
  sem: number;
  ci95: number;
  n: number;
  min: number;
  max: number;
  median: number;
}

export function computeStats(arr: number[]): ComputeStatsResult | null {
  const n = arr.length;
  if (n === 0) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const sd = Math.sqrt(variance);
  const sem = n > 1 ? sd / Math.sqrt(n) : 0;
  // Direct import from _core/stats/dist replaces the prior `typeof tinv ===
  // "function"` runtime check (shared.js loaded before stats.js in script
  // order). Module imports resolve before either module's body runs.
  const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return { mean, sd, sem, ci95, n, min, max, median };
}

export interface QuartilesResult {
  min: number;
  max: number;
  q1: number;
  med: number;
  q3: number;
  iqr: number;
  wLo: number;
  wHi: number;
  n: number;
}

export function quartiles(arr: number[]): QuartilesResult | null {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return null;
  const q = (p: number): number => {
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

export interface KdePoint {
  x: number;
  d: number;
}

export function kde(values: number[], nPoints: number = 50): KdePoint[] {
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
  const pts: KdePoint[] = [];
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

export interface GroupStats {
  name: string;
  n: number;
  mean: number | null;
  sd: number | null;
  sem: number | null;
  ci95?: number;
  min: number | null;
  max: number | null;
  median: number | null;
}

export function computeGroupStats(groups: Record<string, unknown[]>): GroupStats[] {
  return Object.entries(groups).map(([name, vals]) => {
    const nums = vals.filter((v) => v !== "" && isNumericValue(v)).map(toNumericValue);
    const stats = computeStats(nums);
    if (!stats)
      return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
    return { name, ...stats };
  });
}

// ── Download helpers ──────────────────────────────────────────────────────

export function svgSafeId(s: string | null | undefined): string {
  if (s == null) return "unnamed";
  const cleaned = String(s)
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) return "unnamed";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : "_" + cleaned;
}

export function fileBaseName(fileName: unknown, fallback?: string): string {
  if (typeof fileName === "string" && fileName.trim()) return fileName.replace(/\.[^.]+$/, "");
  return fallback || "data";
}

export function flashSaved(btn: HTMLButtonElement | null): void {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = "✓ Saved";
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled = false;
  }, 1500);
}

export const PLOTTR_ATTRIBUTION_PAD = 14;

// ── SVG export mutators ───────────────────────────────────────────────────

type ExportMutator = (svgClone: SVGElement) => void;
const _svgExportMutators: WeakMap<SVGElement, ExportMutator> | null =
  typeof WeakMap === "function" ? new WeakMap() : null;

export function registerSvgExportMutator(svgEl: SVGElement, mutator: ExportMutator): void {
  if (!_svgExportMutators || !svgEl || typeof mutator !== "function") return;
  _svgExportMutators.set(svgEl, mutator);
}

export function unregisterSvgExportMutator(svgEl: SVGElement): void {
  if (!_svgExportMutators || !svgEl) return;
  _svgExportMutators.delete(svgEl);
}

export function buildExportSvg(svgEl: SVGElement): SVGElement {
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.removeAttribute("style");
  clone.querySelectorAll("[shape-rendering]").forEach((el) => {
    el.removeAttribute("shape-rendering");
  });
  const mutator = _svgExportMutators ? _svgExportMutators.get(svgEl) : null;
  if (typeof mutator === "function") {
    try {
      mutator(clone);
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[plottr] SVG export mutator failed:", err);
      }
    }
  }
  appendPlottrAttribution(clone);
  return clone;
}

export function serializeSvgForExport(svgEl: SVGElement): string {
  return new XMLSerializer().serializeToString(buildExportSvg(svgEl));
}

export function appendPlottrAttribution(svgEl: SVGElement): void {
  if (!svgEl || typeof svgEl.setAttribute !== "function") return;
  const prior = svgEl.querySelector("#plottr-attribution");
  const hadPrior = !!(prior && prior.parentNode === svgEl);
  if (hadPrior && prior) prior.parentNode!.removeChild(prior);

  const vbParts = (svgEl.getAttribute("viewBox") || "").split(/[\s,]+/).map(parseFloat);
  let vbX = 0;
  let vbY = 0;
  let vbW = 0;
  let vbH = 0;
  if (vbParts.length >= 4 && vbParts.every((n) => Number.isFinite(n))) {
    vbX = vbParts[0];
    vbY = vbParts[1];
    vbW = vbParts[2];
    vbH = vbParts[3];
  } else {
    const wAttr = parseFloat(svgEl.getAttribute("width") || "");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "");
    vbW = Number.isFinite(wAttr) ? wAttr : 0;
    vbH = Number.isFinite(hAttr) ? hAttr : 0;
  }
  if (hadPrior) vbH -= PLOTTR_ATTRIBUTION_PAD;
  if (!(vbW > 0) || !(vbH > 0)) return;

  const newH = vbH + PLOTTR_ATTRIBUTION_PAD;
  svgEl.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${newH}`);
  const heightAttr = parseFloat(svgEl.getAttribute("height") || "");
  if (Number.isFinite(heightAttr)) {
    const baseHeight = hadPrior ? heightAttr - PLOTTR_ATTRIBUTION_PAD : heightAttr;
    svgEl.setAttribute("height", String(baseHeight + PLOTTR_ATTRIBUTION_PAD));
  }

  const version =
    (typeof window !== "undefined" &&
    typeof (window as Window & { __APP_VERSION__?: string }).__APP_VERSION__ === "string"
      ? (window as Window & { __APP_VERSION__?: string }).__APP_VERSION__
      : null) || "v?";
  const doc = svgEl.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc || typeof doc.createElementNS !== "function") return;
  const NS = "http://www.w3.org/2000/svg";
  const g = doc.createElementNS(NS, "g");
  g.setAttribute("id", "plottr-attribution");
  g.setAttribute("data-plottr-version", version);
  const text = doc.createElementNS(NS, "text");
  text.setAttribute("x", String(vbX + vbW - 5));
  text.setAttribute("y", String(vbY + newH - 4));
  text.setAttribute("font-size", "8");
  text.setAttribute("font-style", "italic");
  text.setAttribute("fill", "#999");
  text.setAttribute("text-anchor", "end");
  text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
  text.textContent = `Plöttr ${version}`;
  g.appendChild(text);
  svgEl.appendChild(g);
}

interface SavePickerType {
  mime: string;
  description: string;
}
const _SAVE_PICKER_TYPES: Record<string, SavePickerType> = {
  ".svg": { mime: "image/svg+xml", description: "SVG image" },
  ".png": { mime: "image/png", description: "PNG image" },
  ".csv": { mime: "text/csv", description: "CSV file" },
  ".tsv": { mime: "text/tab-separated-values", description: "TSV file" },
  ".txt": { mime: "text/plain", description: "Text file" },
  ".r": { mime: "text/plain", description: "R script" },
  ".json": { mime: "application/json", description: "JSON file" },
};

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (b: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (
    typeof window !== "undefined" &&
    typeof (window as SaveFilePickerWindow).showSaveFilePicker === "function"
  ) {
    try {
      const dot = filename.lastIndexOf(".");
      const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
      const meta = _SAVE_PICKER_TYPES[ext] || {
        mime: blob.type || "application/octet-stream",
        description: "File",
      };
      const handle = await (window as SaveFilePickerWindow).showSaveFilePicker!({
        suggestedName: filename,
        types: [{ description: meta.description, accept: { [meta.mime]: [ext || ""] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err && (err as { name?: string }).name === "AbortError") return;
    }
  }
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

export function downloadSvg(svgEl: SVGElement | null, filename: string): void {
  if (!svgEl) return;
  const svgStr = serializeSvgForExport(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  saveBlob(blob, filename);
}

export function downloadPng(svgEl: SVGElement | null, filename: string, scale?: number): void {
  if (!svgEl) return;
  const s = scale || 2;
  const exportSvg = buildExportSvg(svgEl);
  const svgStr = new XMLSerializer().serializeToString(exportSvg);
  const vb = exportSvg.getAttribute("viewBox");
  const parts = vb ? vb.split(/[\s,]+/) : [];
  const w = parts.length >= 4 ? parseFloat(parts[2]) : (svgEl as SVGSVGElement).clientWidth || 800;
  const h =
    parts.length >= 4
      ? parseFloat(parts[3])
      : ((svgEl as SVGSVGElement).clientHeight || 600) + PLOTTR_ATTRIBUTION_PAD;
  const canvas = document.createElement("canvas");
  canvas.width = w * s;
  canvas.height = h * s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  img.onload = function () {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function (pngBlob) {
      if (pngBlob) saveBlob(pngBlob, filename);
    }, "image/png");
  };
  img.src = url;
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain" });
  saveBlob(blob, filename);
}

const _CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

function _isFormulaInjection(s: string): boolean {
  return _CSV_FORMULA_LEAD.test(s) && !isNumericValue(s);
}

function _escapeCsvCell(v: unknown): string {
  let s = String(v);
  if (_isFormulaInjection(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsvString(headers: unknown[], rows: unknown[][]): string {
  return [
    headers.map(_escapeCsvCell).join(","),
    ...rows.map((r) => r.map(_escapeCsvCell).join(",")),
  ].join("\n");
}

export function scanForFormulaInjection(
  headers: unknown[] | null | undefined,
  rows: unknown[][] | null | undefined,
  opts?: { cap?: number }
): FormulaInjectionWarning {
  const cap = (opts && opts.cap) || 8;
  const out: FormulaInjectionWarning = { count: 0, headers: [], cells: [] };
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i++) {
      const v = headers[i];
      if (typeof v !== "string" || !_isFormulaInjection(v)) continue;
      out.count++;
      if (out.headers.length < cap) out.headers.push({ idx: i, value: v });
    }
  }
  if (Array.isArray(rows)) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (typeof v !== "string" || !_isFormulaInjection(v)) continue;
        out.count++;
        if (out.cells.length < cap) {
          out.cells.push({
            row: r,
            col: c,
            header: headers && headers[c] != null ? String(headers[c]) : null,
            value: v,
          });
        }
      }
    }
  }
  return out;
}

export function downloadCsv(headers: unknown[], rows: unknown[][], filename: string): void {
  const blob = new Blob([buildCsvString(headers, rows)], { type: "text/csv" });
  saveBlob(blob, filename);
}

// ── Transitional global shim ───────────────────────────────────────────────
// Populates the legacy script-scope global surface so unmigrated callers
// (tools/*.tsx files using `parseRaw` / `PALETTE` / `isNumericValue` / …)
// keep working until the Phase-5 cleanup converts every caller to direct
// imports.
const _g = globalThis as Record<string, unknown>;
_g.hexToRgb = hexToRgb;
_g.rgbToHex = rgbToHex;
_g.shadeColor = shadeColor;
_g.getPointColors = getPointColors;
_g.PALETTE = PALETTE;
_g.COLOR_PALETTES = COLOR_PALETTES;
_g.DIVERGING_PALETTES = DIVERGING_PALETTES;
_g.interpolateColor = interpolateColor;
_g.TOOL_ICONS = TOOL_ICONS;
_g.toolIcon = toolIcon;
_g.roleColors = roleColors;
_g.normalizeNumericString = normalizeNumericString;
_g.isNumericValue = isNumericValue;
_g.toNumericValue = toNumericValue;
_g.seededRandom = seededRandom;
_g.niceStep = niceStep;
_g.makeTicks = makeTicks;
_g.makeLogTicks = makeLogTicks;
_g.autoDetectSep = autoDetectSep;
_g.tokenizeDelimited = tokenizeDelimited;
_g.fixDecimalCommas = fixDecimalCommas;
_g.detectHeader = detectHeader;
_g.parseRaw = parseRaw;
_g.guessColumnType = guessColumnType;
_g.detectWideFormat = detectWideFormat;
_g.parseWideMatrix = parseWideMatrix;
_g.parseData = parseData;
_g.dataToColumns = dataToColumns;
_g.wideToLong = wideToLong;
_g.reshapeWide = reshapeWide;
_g.parseSetData = parseSetData;
_g.parseLongFormatSets = parseLongFormatSets;
_g.computeStats = computeStats;
_g.quartiles = quartiles;
_g.kde = kde;
_g.computeGroupStats = computeGroupStats;
_g.svgSafeId = svgSafeId;
_g.fileBaseName = fileBaseName;
_g.flashSaved = flashSaved;
_g.PLOTTR_ATTRIBUTION_PAD = PLOTTR_ATTRIBUTION_PAD;
_g.registerSvgExportMutator = registerSvgExportMutator;
_g.unregisterSvgExportMutator = unregisterSvgExportMutator;
_g.buildExportSvg = buildExportSvg;
_g.serializeSvgForExport = serializeSvgForExport;
_g.appendPlottrAttribution = appendPlottrAttribution;
_g.saveBlob = saveBlob;
_g.downloadSvg = downloadSvg;
_g.downloadPng = downloadPng;
_g.downloadText = downloadText;
_g.buildCsvString = buildCsvString;
_g.scanForFormulaInjection = scanForFormulaInjection;
_g.downloadCsv = downloadCsv;

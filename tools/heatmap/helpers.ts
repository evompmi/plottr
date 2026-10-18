import type { HClustTreeNode as HClustNode } from "../_core/stats/types";
// Pure helpers for the heatmap tool — normalisation, dendrogram layout/prune,
// colorbar tick formatting, and dendrogram/selection colour constants. These
// have no React / DOM dependency and are separately testable (tests/helpers/
// heatmap-loader.js loads this file directly). JSX-bearing helpers
// (PaletteStrip, HeatmapChart, …) stay in tools/heatmap.tsx.

// `DataMatrix` is the shape of `parsed.data` for the heatmap tool: rows
// keyed by row label, columns keyed by column label. Cells are `number`
// (parsed from numeric tokens) or `NaN` for non-numeric / missing cells —
// the chart renders NaN as `NAN_FILL` instead of dropping the cell.
export type DataMatrix = number[][];

// ── Normalisation helpers ────────────────────────────────────────────────────

export function finiteMean(arr: number[]): number {
  let s = 0,
    n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      s += arr[i];
      n++;
    }
  }
  return n ? s / n : NaN;
}

export function finiteSD(arr: number[], mean: number): number {
  let s = 0,
    n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      const d = arr[i] - mean;
      s += d * d;
      n++;
    }
  }
  return n > 1 ? Math.sqrt(s / (n - 1)) : 0;
}

export function normalizeMatrix(matrix: DataMatrix, mode: Normalization): DataMatrix {
  const nRows = matrix.length;
  if (nRows === 0) return matrix;
  const nCols = matrix[0].length;

  if (mode === "zrow") {
    return matrix.map((row) => {
      const m = finiteMean(row);
      const sd = finiteSD(row, m);
      if (!Number.isFinite(m) || sd === 0) return row.slice();
      return row.map((v) => (Number.isFinite(v) ? (v - m) / sd : NaN));
    });
  }
  if (mode === "zcol") {
    const out = matrix.map((r) => r.slice());
    for (let ci = 0; ci < nCols; ci++) {
      const col = new Array<number>(nRows);
      for (let ri = 0; ri < nRows; ri++) col[ri] = matrix[ri][ci];
      const m = finiteMean(col);
      const sd = finiteSD(col, m);
      if (!Number.isFinite(m) || sd === 0) continue;
      for (let ri = 0; ri < nRows; ri++) {
        out[ri][ci] = Number.isFinite(matrix[ri][ci]) ? (matrix[ri][ci] - m) / sd : NaN;
      }
    }
    return out;
  }
  if (mode === "log2") {
    return matrix.map((row) =>
      row.map((v) => (Number.isFinite(v) && v > -1 ? Math.log2(v + 1) : NaN))
    );
  }
  return matrix;
}

export function autoRange(matrix: DataMatrix, diverging: boolean): [number, number] {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const v = matrix[i][j];
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m || 0, m || 1];
  }
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

// ── Outlier-skew detection + colour-range presets ───────────────────────────
//
// A handful of extreme cells can stretch [vmin, vmax] so far that the bulk of
// the matrix collapses into a thin band of the palette. Outliers are cells
// beyond fences set ½ a robust span past the [2nd, 98th] percentiles; the
// "outliers" preset is then the exact extent of everything else, rounded
// outward so no ordinary cell is clipped. `detectRangeSkew` judges the
// CURRENT colour range, so the alert clears itself once the user clips.

export const SKEW_MIN_CELLS = 20; // below this, percentiles are too coarse to judge
export const SKEW_LO_Q = 0.02;
export const SKEW_HI_Q = 0.98;
export const SKEW_OCCUPIED_MAX = 0.5; // bulk uses < half the colour scale…
export const SKEW_OUTLIER_FRAC_MAX = 0.02; // …because of ≤ 2 % of the cells
export const SKEW_FENCE = 0.5; // outlier = beyond the robust range by > ½ its span

export interface RangeSkew {
  nOutliers: number; // cells the suggested range clips (inside the current range)
  nTotal: number;
  occupied: number; // fraction of [vmin, vmax] the suggested range spans
  suggestedMin: number;
  suggestedMax: number;
}

export type RangePresetKey = "full" | "outliers" | "p1_99" | "p5_95";
export type ColourRange = [number, number];

export interface RangePresets {
  full: ColourRange;
  // null when nothing lies beyond the outlier fences.
  outliers: ColourRange | null;
  p1_99: ColourRange | null;
  p5_95: ColourRange | null;
}

export function sortedFiniteValues(matrix: DataMatrix): number[] {
  const out: number[] = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      if (Number.isFinite(matrix[i][j])) out.push(matrix[i][j]);
    }
  }
  return out.sort((a, b) => a - b);
}

// Linear-interpolated quantile on an ascending array (R's type 7).
export function quantileSorted(sorted: number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  if (lo + 1 >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]);
}

// Four significant digits — readable in the Min / Max inputs, and unlike a
// fixed decimal count it can't collapse a 1e-4-scale range to zero width.
export function roundSig(v: number): number {
  return Number(v.toPrecision(4));
}

// Same, but rounded away from the data (dir = -1 → down for a minimum,
// +1 → up for a maximum) so the rounded bound never clips the value itself.
export function roundSigOut(v: number, dir: 1 | -1): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  const r = roundSig(v);
  if (dir > 0 ? r >= v : r <= v) return r;
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const step = Math.pow(10, exp - 3);
  return roundSig(r + dir * step);
}

const symmetric = (lo: number, hi: number): ColourRange => {
  const m = roundSigOut(Math.max(Math.abs(lo), Math.abs(hi)), 1);
  return [-m, m];
};

const outward = (lo: number, hi: number, diverging: boolean): ColourRange =>
  diverging ? symmetric(lo, hi) : [roundSigOut(lo, -1), roundSigOut(hi, 1)];

// Outlier fences; null when the robust range is degenerate (a constant bulk
// has no meaningful "rest of the data" to fit the scale to).
export function outlierFences(sorted: number[], diverging: boolean): ColourRange | null {
  let lo = quantileSorted(sorted, SKEW_LO_Q);
  let hi = quantileSorted(sorted, SKEW_HI_Q);
  if (diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    lo = -m;
    hi = m;
  }
  const span = hi - lo;
  if (!(span > 0)) return null;
  return [lo - SKEW_FENCE * span, hi + SKEW_FENCE * span];
}

// Data-extent range, rounded outward ("Full" preset / initial auto-range).
export function fullRange(sorted: number[], diverging: boolean): ColourRange {
  if (!sorted.length) return [0, 1];
  const lo = sorted[0],
    hi = sorted[sorted.length - 1];
  if (diverging) {
    const r = symmetric(lo, hi);
    return r[1] > 0 ? r : [-1, 1];
  }
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return outward(lo, hi, false);
}

// Extent of the non-outlier cells (null when there are no outliers).
export function innerExtent(sorted: number[], diverging: boolean): ColourRange | null {
  if (sorted.length < SKEW_MIN_CELLS) return null;
  const f = outlierFences(sorted, diverging);
  if (!f) return null;
  let i = 0,
    j = sorted.length - 1;
  while (i < sorted.length && sorted[i] < f[0]) i++;
  while (j >= 0 && sorted[j] > f[1]) j--;
  if (i === 0 && j === sorted.length - 1) return null;
  if (i > j) return null;
  return [sorted[i], sorted[j]];
}

export function rangePresets(sorted: number[], diverging: boolean): RangePresets {
  const pct = (lo: number, hi: number): ColourRange | null => {
    if (sorted.length < 2) return null;
    const r = outward(quantileSorted(sorted, lo), quantileSorted(sorted, hi), diverging);
    return r[1] > r[0] ? r : null;
  };
  const inner = innerExtent(sorted, diverging);
  const outliers = inner ? outward(inner[0], inner[1], diverging) : null;
  return {
    full: fullRange(sorted, diverging),
    outliers: outliers && outliers[1] > outliers[0] ? outliers : null,
    p1_99: pct(0.01, 0.99),
    p5_95: pct(0.05, 0.95),
  };
}

// Which preset (if any) the current range matches. Relative tolerance so a
// value round-tripped through the Min / Max inputs still matches.
export function activePreset(
  presets: RangePresets,
  vmin: number,
  vmax: number
): RangePresetKey | null {
  const keys: RangePresetKey[] = ["full", "outliers", "p1_99", "p5_95"];
  const tol = Math.abs(vmax - vmin) * 1e-6;
  for (const k of keys) {
    const r = presets[k];
    if (r && Math.abs(r[0] - vmin) <= tol && Math.abs(r[1] - vmax) <= tol) return k;
  }
  return null;
}

export function detectRangeSkew(
  sorted: number[],
  vmin: number,
  vmax: number,
  diverging: boolean
): RangeSkew | null {
  const n = sorted.length;
  const span = vmax - vmin;
  if (n < SKEW_MIN_CELLS || !(span > 0)) return null;
  const inner = innerExtent(sorted, diverging);
  if (!inner) return null;
  const [lo, hi] = outward(inner[0], inner[1], diverging);
  const sugMin = Math.max(lo, vmin);
  const sugMax = Math.min(hi, vmax);
  if (!(sugMax > sugMin)) return null;
  const occupied = (sugMax - sugMin) / span;
  if (occupied >= SKEW_OCCUPIED_MAX) return null;
  // Only cells inside the current range stretch it — anything already beyond
  // vmin / vmax is saturated and no longer moves the scale.
  let nOutliers = 0;
  for (let i = 0; i < n; i++) {
    const v = sorted[i];
    if ((v < sugMin && v >= vmin) || (v > sugMax && v <= vmax)) nOutliers++;
  }
  if (nOutliers === 0 || nOutliers > SKEW_OUTLIER_FRAC_MAX * n) return null;
  return { nOutliers, nTotal: n, occupied, suggestedMin: sugMin, suggestedMax: sugMax };
}

// ── Range histogram (sidebar) ───────────────────────────────────────────────
//
// The sidebar histogram must not repeat the heatmap's own failure mode — one
// outlier squashing everything into a corner. So the axis is piecewise: the
// non-outlier extent gets the main zone, and anything farther out (outliers,
// or a colour range the user widened past the data) is compressed into a
// narrow "broken-axis" stub on that side.

export const HIST_BINS = 48;
export const HIST_STUB_FRAC = 0.1; // each stub's share of the track width
// Overflow shorter than this share of the main span just extends the main
// zone linearly — a broken axis for a sliver would only confuse.
export const HIST_STUB_MIN_OVERFLOW = 0.25;

export interface HistogramModel {
  lo: number; // main-zone extent
  hi: number;
  outerLo: number; // stub extents (=== lo / hi when that side has no stub)
  outerHi: number;
  stubLo: boolean;
  stubHi: boolean;
  counts: number[]; // main-zone bins, low → high
  maxCount: number;
  nStubLo: number; // cells inside each stub
  nStubHi: number;
}

export function histogramModel(
  sorted: number[],
  diverging: boolean,
  vmin: number,
  vmax: number,
  nBins: number = HIST_BINS
): HistogramModel | null {
  if (!sorted.length) return null;
  const dataLo = sorted[0],
    dataHi = sorted[sorted.length - 1];
  const inner = innerExtent(sorted, diverging) || [dataLo, dataHi];
  let lo = inner[0],
    hi = inner[1];
  if (!(hi > lo)) {
    lo -= 0.5;
    hi += 0.5;
  }
  let outerLo = Math.min(dataLo, Number.isFinite(vmin) ? vmin : dataLo);
  let outerHi = Math.max(dataHi, Number.isFinite(vmax) ? vmax : dataHi);
  const span = hi - lo;
  let stubLo = lo - outerLo > HIST_STUB_MIN_OVERFLOW * span;
  let stubHi = outerHi - hi > HIST_STUB_MIN_OVERFLOW * span;
  if (!stubLo) {
    lo = Math.min(lo, outerLo);
    outerLo = lo;
  }
  if (!stubHi) {
    hi = Math.max(hi, outerHi);
    outerHi = hi;
  }
  const counts = new Array<number>(nBins).fill(0);
  let nStubLo = 0,
    nStubHi = 0;
  // Index from the full span, not a per-bin width: on a subnormal-scale
  // range the bin width underflows to 0 and (v − lo) / 0 would drop cells.
  const mainSpan = hi - lo;
  for (const v of sorted) {
    if (v < lo) nStubLo++;
    else if (v > hi) nStubHi++;
    else {
      const k = Math.floor(((v - lo) / mainSpan) * nBins);
      counts[Number.isFinite(k) ? Math.max(0, Math.min(nBins - 1, k)) : 0]++;
    }
  }
  stubLo = stubLo || nStubLo > 0;
  stubHi = stubHi || nStubHi > 0;
  return {
    lo,
    hi,
    outerLo,
    outerHi,
    stubLo,
    stubHi,
    counts,
    maxCount: Math.max(1, ...counts),
    nStubLo,
    nStubHi,
  };
}

// Value ↔ track fraction [0, 1] over the piecewise axis.
export function histValueToFrac(m: HistogramModel, v: number): number {
  const a = m.stubLo ? HIST_STUB_FRAC : 0;
  const b = m.stubHi ? 1 - HIST_STUB_FRAC : 1;
  if (v < m.lo) {
    if (!m.stubLo) return 0;
    const d = m.lo - m.outerLo;
    return d > 0 ? Math.max(0, (a * (v - m.outerLo)) / d) : 0;
  }
  if (v > m.hi) {
    if (!m.stubHi) return 1;
    const d = m.outerHi - m.hi;
    return d > 0 ? Math.min(1, b + ((1 - b) * (v - m.hi)) / d) : 1;
  }
  // Clamp: `a + (b - a) * 1` can land a hair past `b` in floating point.
  return Math.min(b, Math.max(a, a + ((b - a) * (v - m.lo)) / (m.hi - m.lo)));
}

export function histFracToValue(m: HistogramModel, f: number): number {
  const a = m.stubLo ? HIST_STUB_FRAC : 0;
  const b = m.stubHi ? 1 - HIST_STUB_FRAC : 1;
  const t = Math.max(0, Math.min(1, f));
  if (t < a) return m.outerLo + ((m.lo - m.outerLo) * t) / a;
  if (t > b) return m.hi + ((m.outerHi - m.hi) * (t - b)) / (1 - b);
  return m.lo + ((m.hi - m.lo) * (t - a)) / (b - a);
}

// ── Colour mapping (linear / two-slope) ─────────────────────────────────────
//
// Diverging palettes have a neutral middle colour that must mean 0. A linear
// Min→Max map puts that colour at the range midpoint, so a lopsided range
// (say −2 … +8) would paint +3 as "neutral". With `centred`, 0 is pinned to
// the palette midpoint and each side of 0 gets its own slope (matplotlib's
// TwoSlopeNorm): vmin → 0 uses the low half of the palette, 0 → vmax the high
// half. Min / Max move independently and the neutral colour stays at 0 —
// including when 0 sits at or beyond an end of the range: [0, 8] uses only
// the neutral → high half, [2, 8] only part of it.

// Whether 0 lies strictly inside the range (it then gets its own colourbar
// tick). The pinning itself applies to every centred range.
export function isTwoSlope(vmin: number, vmax: number, centred: boolean): boolean {
  return centred && vmin < 0 && vmax > 0;
}

// Palette position of v on the centred scale, no clamping.
const pinned = (v: number, vmin: number, vmax: number): number => {
  if (v < 0) {
    const neg = Math.min(vmin, 0);
    return neg < 0 ? 0.5 * (1 - v / neg) : 0.5;
  }
  const pos = Math.max(vmax, 0);
  return pos > 0 ? 0.5 + (0.5 * v) / pos : 0.5;
};

// Palette position t ∈ [0, 1] for value v. Values beyond the range take the
// colour of the range end they exceed.
export function colourPosition(v: number, vmin: number, vmax: number, centred: boolean): number {
  if (centred) {
    const c = Math.max(Math.min(vmin, vmax), Math.min(Math.max(vmin, vmax), v));
    return Math.max(0, Math.min(1, pinned(c, vmin, vmax)));
  }
  const t = (v - vmin) / (vmax - vmin || 1);
  return Math.max(0, Math.min(1, t));
}

// Inverse: the value that lands at palette position t.
export function valueAtPosition(t: number, vmin: number, vmax: number, centred: boolean): number {
  if (centred) {
    return t < 0.5 ? Math.min(vmin, 0) * (1 - 2 * t) : Math.max(vmax, 0) * (2 * t - 1);
  }
  return vmin + t * (vmax - vmin);
}

// Colourbar gradient stops: the bar is linear in VALUE (ticks sit at their
// value's height), so on a centred scale the palette is stretched differently
// above and below 0, and only the slice [t(vmin), t(vmax)] is shown. Explicit
// stops at the slice ends and at the palette midpoint keep the colours exact.
// `offset` runs 0 (vmin, bottom) → 1 (vmax, top).
export function colourbarGradient(
  stops: string[],
  vmin: number,
  vmax: number,
  centred: boolean
): { offset: number; t: number }[] {
  const n = stops.length;
  const ts = stops.map((_, i) => i / (n - 1));
  if (!centred) return ts.map((t) => ({ offset: t, t }));
  const span = vmax - vmin;
  const t0 = colourPosition(vmin, vmin, vmax, true);
  const t1 = colourPosition(vmax, vmin, vmax, true);
  if (!(span > 0) || !(t1 > t0))
    return [
      { offset: 0, t: t0 },
      { offset: 1, t: t1 },
    ];
  const inner = ts.concat([0.5]).filter((t) => t > t0 && t < t1);
  const all = [t0, ...Array.from(new Set(inner)).sort((x, y) => x - y), t1];
  return all.map((t, i) => ({
    offset:
      i === 0 ? 0 : i === all.length - 1 ? 1 : (valueAtPosition(t, vmin, vmax, true) - vmin) / span,
    t,
  }));
}

// ── Legend histogram (figure) ───────────────────────────────────────────────
//
// Bins over [vmin, vmax] of the DISPLAYED cells, aligned with the colourbar so
// each bar sits next to the colour its values get. Cells beyond the range are
// reported separately (they're the colourbar's "≥ / ≤" ends).

export function legendHistogram(
  matrix: DataMatrix,
  vmin: number,
  vmax: number,
  rows: number[],
  cols: number[],
  nBins: number
): { counts: number[]; maxCount: number } {
  const counts = new Array<number>(Math.max(1, nBins)).fill(0);
  const span = vmax - vmin;
  if (span > 0) {
    for (const ri of rows) {
      const row = matrix[ri];
      if (!row) continue;
      for (const ci of cols) {
        const v = row[ci];
        if (!(v >= vmin && v <= vmax)) continue;
        counts[Math.min(counts.length - 1, Math.floor(((v - vmin) / span) * counts.length))]++;
      }
    }
  }
  return { counts, maxCount: Math.max(1, ...counts) };
}

// Cells the colour scale saturates (rendered in the end colours) among the
// displayed rows × cols. Drives the "≥ / ≤" colourbar tick prefixes so a
// clipped legend says so — the detail view passes its own subset so it only
// flags clipping it actually draws.
export function countClipped(
  matrix: DataMatrix,
  vmin: number,
  vmax: number,
  rows: number[],
  cols: number[]
): { below: number; above: number } {
  let below = 0,
    above = 0;
  for (const ri of rows) {
    const row = matrix[ri];
    if (!row) continue;
    for (const ci of cols) {
      const v = row[ci];
      if (v < vmin) below++;
      else if (v > vmax) above++;
    }
  }
  return { below, above };
}

// ── Dendrogram constants & layout ────────────────────────────────────────────

export const DENDRO_STROKE = "#555555";
export const DENDRO_HOVER_STROKE = "#0072B2"; // Okabe-Ito blue — stands out against the grey default.
export const NAN_FILL = "#e0e0e0";
export const SELECTION_STROKE = "#111111";
export const HIGHLIGHT_STROKE = "#111111";

// Walk an hclust tree producing BOTH the segment list for drawing AND the
// per-internal-node records for hit-testing. Each segment is tagged with the
// [xMin, xMax] leaf-order span of the internal node that emitted it, so we can
// cheaply decide later whether it belongs to a hovered subtree: segment.xMin ≥
// hoverNode.xMin && segment.xMax ≤ hoverNode.xMax. Kept local (not in stats.js)
// because only the heatmap view needs the hover metadata.

// Each emitted segment carries the [xMin, xMax] leaf-order span of the
// internal node that produced it (used by the hover handlers to decide
// whether a segment belongs to the hovered subtree).
export interface DendroLayoutSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  xMin: number;
  xMax: number;
}

export interface DendroLayoutNode {
  height: number;
  leaves: number[];
  xMin: number;
  xMax: number;
}

export interface DendroLayout {
  segments: DendroLayoutSegment[];
  nodes: DendroLayoutNode[];
  maxHeight: number;
}

interface DendroWalkResult {
  x: number;
  h: number;
  leaves: number[];
  xMin: number;
  xMax: number;
}

export function buildDendroLayout(tree: HClustNode | null | undefined): DendroLayout {
  if (!tree) return { segments: [], nodes: [], maxHeight: 0 };
  const segments: DendroLayoutSegment[] = [];
  const nodes: DendroLayoutNode[] = [];
  let leafIdx = 0;
  let maxHeight = 0;
  function walk(node: HClustNode): DendroWalkResult {
    if (!node.left && !node.right) {
      const pos = leafIdx++;
      return { x: pos, h: 0, leaves: [node.index ?? -1], xMin: pos, xMax: pos };
    }
    const L = walk(node.left as HClustNode);
    const R = walk(node.right as HClustNode);
    const h = node.height;
    if (h > maxHeight) maxHeight = h;
    const leaves = L.leaves.concat(R.leaves);
    const xMin = Math.min(L.xMin, R.xMin);
    const xMax = Math.max(L.xMax, R.xMax);
    segments.push({ x1: L.x, y1: L.h, x2: L.x, y2: h, xMin, xMax });
    segments.push({ x1: R.x, y1: R.h, x2: R.x, y2: h, xMin, xMax });
    segments.push({ x1: L.x, y1: h, x2: R.x, y2: h, xMin, xMax });
    nodes.push({ height: h, leaves, xMin, xMax });
    return { x: (L.x + R.x) / 2, h, leaves, xMin, xMax };
  }
  walk(tree);
  return { segments, nodes, maxHeight };
}

// Prune an hclust tree down to the leaves whose original indices are in
// `keepSet`. Returns the pruned subtree, or `null` if pruning leaves fewer
// than two leaves (a single-leaf "tree" has no internal merges, so there's
// no dendrogram to draw). Internal nodes that retain only one child are
// collapsed to that child, so the returned tree has no unary internals;
// original merge heights are preserved, giving a true subtree dendrogram
// of the selection — edges skip over elided sibling clades but the
// heights still reflect the original clustering distances.
export function pruneDendroTree(
  tree: HClustNode | null | undefined,
  keepSet: Set<number>
): HClustNode | null {
  function rec(node: HClustNode | null | undefined): HClustNode | null {
    if (!node) return null;
    if (!node.left && !node.right) {
      return node.index != null && keepSet.has(node.index) ? node : null;
    }
    const L = rec(node.left);
    const R = rec(node.right);
    if (!L && !R) return null;
    if (!L) return R;
    if (!R) return L;
    return {
      index: -1,
      left: L,
      right: R,
      height: node.height,
      size: (L.size || 1) + (R.size || 1),
    };
  }
  const pruned = rec(tree);
  if (!pruned || (!pruned.left && !pruned.right)) return null;
  return pruned;
}

// Okabe-Ito categorical palette for k-means cluster-id colour strips.
export const CLUSTER_PALETTE = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#999999",
  "#88CCEE",
  "#AA4499",
];

// ── Colorbar tick formatting ─────────────────────────────────────────────────

export function fmtColorbarTick(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toExponential(1);
  if (abs < 1) return v.toFixed(2);
  return v.toFixed(1);
}

// ── Vis state + prop interfaces ─────────────────────────────────────────────
//
// Mirrors the runtime shape of `VIS_INIT_HEATMAP` in index.tsx — declared
// here so the prop bags can reference it without a circular import.

export interface HeatmapVis {
  palette: string;
  invertPalette: boolean;
  vmin: number;
  vmax: number;
  plotTitle: string;
  plotSubtitle: string;
  colAxisLabel: string;
  rowAxisLabel: string;
  showRowLabels: boolean;
  showColLabels: boolean;
  showRowDendrogram: boolean;
  showColDendrogram: boolean;
  showLegendHistogram: boolean;
}

export type UpdVis = (patch: Partial<HeatmapVis> | { _reset: true }) => void;

export interface CellBorderState {
  on: boolean;
  color: string;
  width: number;
}
export type UpdCellBorder = (patch: Partial<CellBorderState> | { _reset: true }) => void;

export interface RawMatrix {
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
}

export type ClusterMode = "none" | "hierarchical" | "kmeans";
export type Normalization = "none" | "zrow" | "zcol" | "log2";
export type DistanceMetric = "euclidean" | "manhattan" | "correlation";
export type LinkageMethod = "average" | "complete" | "single" | "ward";

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  handleTextPaste: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export interface ClusterModeControlProps {
  label: string;
  mode: ClusterMode;
  setMode: (m: ClusterMode) => void;
  k: number;
  setK: (k: number) => void;
}

// `matrixRef` is a ref to the materialised CSV-export shape — it carries
// the post-normalisation matrix + row/col orders + (optional) cluster ids
// so the CSV download tile can serialize the exact view the user sees.
// app.tsx writes into the ref from a useEffect; the ref's value is `null`
// before the first effect runs.
export interface MatrixExportRef {
  rowLabels: string[];
  colLabels: string[];
  matrix: DataMatrix;
  rowOrder: number[];
  colOrder: number[];
  rowClusterIds: number[] | null;
  colClusterIds: number[] | null;
}

// ── PaletteStrip props ─────────────────────────────────────────────────────

export interface PaletteStripProps {
  palette: string;
  invert?: boolean;
  height?: number;
}

// ── Selection + brush types ────────────────────────────────────────────────

// Selection is keyed on ORIGINAL rawMatrix indices, not on rowOrder /
// colOrder, so cluster changes don't invalidate the user's selection.
// `null` on an axis means "all rows / cols on that axis".
export interface HeatmapSelection {
  rows: number[] | null;
  cols: number[] | null;
  // When the selection came from a cluster-strip click, `clusterId` (0-based)
  // and `clusterAxis` annotate which cluster on which axis was picked.
  clusterId: number | null;
  clusterAxis: "row" | "col" | null;
}

// Brush coordinates are in display space (rowOrder / colOrder positions).
// app.tsx maps them through rowOrder / colOrder before setting selection.
export interface BrushBox {
  riMin: number;
  riMax: number;
  ciMin: number;
  ciMax: number;
}

// `axis` + a cluster meta object (passed by the dendrogram-branch click and
// the cluster-strip click handlers).
export interface AxisClusterMeta {
  clusterId?: number;
}

// Result shape of `rowCluster` / `colCluster` useMemo in app.tsx —
// hierarchical clustering yields a tree + leaf order; k-means yields per-row
// cluster ids + leaf order. Mode is the discriminant.
export type ClusterResult =
  | { mode: "hierarchical"; tree: HClustNode; order: number[] }
  | { mode: "kmeans"; clusters: number[]; order: number[]; k: number };

// ── Chart props ────────────────────────────────────────────────────────────

export interface HeatmapChartProps {
  rowLabels: string[];
  colLabels: string[];
  matrix: DataMatrix;
  rowOrder: number[];
  colOrder: number[];
  rowCluster: ClusterResult | null;
  colCluster: ClusterResult | null;
  vmin: number;
  vmax: number;
  palette: string;
  invertPalette?: boolean;
  cellBorder: CellBorderState;
  plotTitle?: string;
  plotSubtitle?: string;
  rowAxisLabel?: string;
  colAxisLabel?: string;
  showRowLabels?: boolean;
  showColLabels?: boolean;
  showRowDendrogram?: boolean;
  showColDendrogram?: boolean;
  // Interactive props (main view only — detail view leaves them undefined).
  interactive?: boolean;
  selection?: HeatmapSelection | null;
  onBrushEnd?: (box: BrushBox) => void;
  onAxisSelect?: (
    axis: "row" | "col",
    indices: number[] | null,
    meta?: AxisClusterMeta | null
  ) => void;
  onClearSelection?: () => void;
  // The pre-normalisation matrix — passed as a raw `DataMatrix` (not the
  // full `RawMatrix` envelope) so the chart's hover tooltip can show the
  // original value alongside the normalised one. Optional because the
  // detail view doesn't always pass it through.
  rawMatrix?: DataMatrix;
  // Cell-size + colourbar overrides for the detail view.
  baseCellW?: number;
  baseCellH?: number;
  baseColorbarH?: number;
  baseDendroSizeLeft?: number;
  baseDendroSizeTop?: number;
  baseColLabelH?: number;
  baseRowLabelW?: number;
  cellOffsetCols?: number;
  cellOffsetRows?: number;
  basePlotW?: number;
  basePlotH?: number;
  colGapStartPx?: number;
  rowGapStartPx?: number;
  showClusterStrip?: boolean;
  showKmeansStrip?: boolean;
  // Distribution of the displayed values beside the colourbar.
  showLegendHistogram?: boolean;
  dendrogramStrokeWidth?: number;
}

// ── plot-area (detail view + preview card) props ──────────────────────────

export interface DetailViewProps {
  rawMatrix: RawMatrix;
  normalized: DataMatrix;
  detailRowOrder: number[];
  detailColOrder: number[];
  mainRowCluster: ClusterResult | null;
  mainColCluster: ClusterResult | null;
  vis: HeatmapVis;
  cellBorder: CellBorderState;
  detailChartRef: React.MutableRefObject<SVGSVGElement | null>;
  fileName: string;
  // 0-based cluster id when the selection came from a cluster-strip click,
  // null when it came from a brush / dendrogram-branch click. Used to tag
  // download filenames with `_cluster1` / `_cluster2` etc.
  clusterId: number | null;
}

export interface DetailPreviewCardProps {
  rawMatrix: RawMatrix;
  normalized: DataMatrix;
  detailRowOrder: number[];
  detailColOrder: number[];
  fileName: string;
  clusterId: number | null;
}

export interface SkewAlertProps {
  skew: RangeSkew;
  onApply: () => void;
}

export interface PlotControlsProps {
  vis: HeatmapVis;
  updVis: UpdVis;
  cellBorder: CellBorderState;
  updCellBorder: UpdCellBorder;
  matrixRef: React.MutableRefObject<MatrixExportRef | null>;
  // Main heatmap SVG, for the SVG / PNG downloads in the export bar.
  chartRef: React.RefObject<SVGSVGElement | null>;
  rawMatrix: RawMatrix;
  resetAll: () => void;
  fileName: string;
  normalization: Normalization;
  setNormalization: (n: Normalization) => void;
  rowMode: ClusterMode;
  setRowMode: (m: ClusterMode) => void;
  colMode: ClusterMode;
  setColMode: (m: ClusterMode) => void;
  rowK: number;
  setRowK: (k: number) => void;
  colK: number;
  setColK: (k: number) => void;
  kmeansSeed: number;
  setKmeansSeed: (s: number) => void;
  distanceMetric: DistanceMetric;
  setDistanceMetric: (m: DistanceMetric) => void;
  linkageMethod: LinkageMethod;
  setLinkageMethod: (m: LinkageMethod) => void;
  // Non-null when a few cells stretch the colour scale (see detectRangeSkew).
  skew: RangeSkew | null;
  presets: RangePresets;
  sortedValues: number[];
  rangeIsDiverging: boolean;
  setRange: (lo: number, hi: number) => void;
}

export interface RangeHistogramProps {
  sortedValues: number[];
  vmin: number;
  vmax: number;
  palette: string;
  invertPalette: boolean;
  // Outlier fences are judged symmetrically about 0 (diverging / z-score
  // data), matching the presets. The handles themselves are independent.
  symmetricAxis: boolean;
  onChange: (lo: number, hi: number) => void;
}

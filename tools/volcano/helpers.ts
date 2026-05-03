// Pure helpers for the Volcano tool. All exports are deterministic, no
// React, no DOM, no globals — exactly what tests/helpers/volcano-loader.js
// needs to load under vm.runInContext for direct unit-testing.
//
// The volcano shape is dead simple: each input row is one feature with a
// log2-fold-change ("log2FC") and a p-value. We classify each row into
// up / down / ns based on user-set cutoffs, score-rank for top-N
// labelling, and lay labels out with a greedy collision-avoid pass.
// Everything that touches the rendering layer is in chart.tsx; this
// module never imports a React or DOM API.
//
// The colour palette lives here too as a const because the R-script
// exporter needs it to emit a matching ggplot2 scale_color_manual call.

// Okabe-Ito-aligned defaults: deep blue (PALETTE[4]) for down-regulated,
// vermillion (PALETTE[5]) for up-regulated, neutral mid-grey for the
// non-significant majority. Chosen to (a) be colourblind-distinguishable
// (Okabe-Ito is the canonical safe palette) and (b) match the
// conventional volcano-plot signal direction (warm = up, cool = down).
export const VOLCANO_DEFAULT_COLORS = {
  up: "#D55E00",
  down: "#0072B2",
  ns: "#999999",
} as const;

export type VolcanoClass = "up" | "down" | "ns";

// One row of input. `idx` is the row's original parsed-data index so the
// chart can highlight back into the source on hover / click.
export interface VolcanoPoint {
  idx: number;
  log2fc: number;
  p: number; // raw p-value (0 < p ≤ 1 typically; 0 is allowed and clamped)
  label: string | null;
}

// Result of classifying a point against user-set cutoffs. Pure function:
// `up` requires *both* `log2fc > +fcCutoff` AND `p < pCutoff`, mirror for
// `down`. Anything else (sub-threshold |log2FC|, or above-threshold p) is
// `ns` — that's the convention every -omics paper uses.
export function classifyPoint(
  log2fc: number,
  p: number,
  fcCutoff: number,
  pCutoff: number
): VolcanoClass {
  if (!Number.isFinite(log2fc) || !Number.isFinite(p)) return "ns";
  const sigByP = p < pCutoff;
  if (!sigByP) return "ns";
  if (log2fc > fcCutoff) return "up";
  if (log2fc < -fcCutoff) return "down";
  return "ns";
}

// Smallest non-zero, finite p-value across the dataset, divided by 10.
// Used to clamp `p === 0` to a finite y-coordinate so the chart doesn't
// emit -log10(0) = Infinity. /10 buffer keeps clamped points visibly
// "off the top" without ballooning the y-axis range. Returns 1e-300 as
// a defensible floor when the dataset has no non-zero p (degenerate).
export function computePFloor(points: VolcanoPoint[]): number {
  let minNonZero = Infinity;
  for (const pt of points) {
    if (Number.isFinite(pt.p) && pt.p > 0 && pt.p < minNonZero) {
      minNonZero = pt.p;
    }
  }
  if (!Number.isFinite(minNonZero)) return 1e-300;
  return minNonZero / 10;
}

// p → -log10(p), with `0` → -log10(pFloor). Non-finite or negative input
// returns 0 (so the point sits at the bottom of the y-axis rather than
// off the chart). The clamp is reported separately by `countClamped` so
// the UI can surface a "N points had p = 0; clamped for display" notice.
export function negLog10P(p: number, pFloor: number): number {
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p === 0) return -Math.log10(pFloor);
  return -Math.log10(p);
}

export function countClamped(points: VolcanoPoint[]): number {
  let n = 0;
  for (const pt of points) if (pt.p === 0) n++;
  return n;
}

// Group counts for the stats summary tile (and for the R-script
// `# Toolbox reported: …` comment). Excludes points with non-finite
// log2FC or p so the user can see the "discarded" count too.
export interface VolcanoSummary {
  up: number;
  down: number;
  ns: number;
  total: number; // total *valid* points (excludes discarded)
  discarded: number;
}

export function summarize(
  points: VolcanoPoint[],
  fcCutoff: number,
  pCutoff: number
): VolcanoSummary {
  let up = 0,
    down = 0,
    ns = 0,
    discarded = 0;
  for (const pt of points) {
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) {
      discarded++;
      continue;
    }
    const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
    if (cls === "up") up++;
    else if (cls === "down") down++;
    else ns++;
  }
  return { up, down, ns, total: up + down + ns, discarded };
}

// ── Auto-detect column roles ────────────────────────────────────────────
//
// On first parse we try to guess which column is log2FC, which is the
// p-value, and which (if any) is the label. The user can always override
// from the configure step.
//
// Rules of thumb derived from common -omics tool outputs:
//   DESeq2:   gene, baseMean, log2FoldChange, lfcSE, stat, pvalue, padj
//   limma:    Gene, logFC, AveExpr, t, P.Value, adj.P.Val, B
//   edgeR:    Gene, logFC, logCPM, F, PValue, FDR
//   MaxQuant: Gene names, Log2 fold change, p-value, q-value
// We prefer the *adjusted* p-value when we can find one (padj / adj.P.Val
// / FDR / qvalue), since that's the column users actually want to plot
// against in 99% of cases. Falls back to the raw p-value if no adjusted
// column exists.

const X_PATTERNS = [
  /^log2foldchange$/i,
  /^log2fc$/i,
  /^logfc$/i,
  /^log2[\s_-]?fold[\s_-]?change$/i,
  /^log2[\s_-]?fc$/i,
  /^foldchange$/i,
  /^fold[\s_-]?change$/i,
  /^fc$/i,
  /log2.*fold/i,
  /log.*fc/i,
  /fold.*change/i,
];

// Adjusted p-value patterns checked first so they win over raw p-value.
const Y_ADJ_PATTERNS = [
  /^padj$/i,
  /^p[\s_.-]?adj$/i,
  /^adj[\s_.-]?p[\s_.-]?val$/i,
  /^adjusted[\s_.-]?p[\s_.-]?value$/i,
  /^fdr$/i,
  /^q[\s_.-]?value$/i,
  /^qvalue$/i,
  /^q[\s_.-]?val$/i,
];
const Y_RAW_PATTERNS = [/^p[\s_.-]?value$/i, /^pvalue$/i, /^p[\s_.-]?val$/i, /^pval$/i, /^p$/i];

const LABEL_PATTERNS = [
  /^gene$/i,
  /^gene[\s_.-]?name$/i,
  /^gene[\s_.-]?symbol$/i,
  /^symbol$/i,
  /^protein$/i,
  /^feature$/i,
  /^feature[\s_.-]?id$/i,
  /^feature[\s_.-]?name$/i,
  /^name$/i,
  /^id$/i,
];

function findFirstMatch(headers: string[], patterns: RegExp[]): number {
  for (const re of patterns) {
    for (let i = 0; i < headers.length; i++) {
      if (re.test(String(headers[i]).trim())) return i;
    }
  }
  return -1;
}

export interface AutoDetectResult {
  xCol: number; // log2FC column index, or -1
  yCol: number; // p-value column index, or -1
  labelCol: number; // optional label column index, or -1
  yIsAdjusted: boolean;
}

export function autoDetectColumns(headers: string[]): AutoDetectResult {
  const xCol = findFirstMatch(headers, X_PATTERNS);
  let yCol = findFirstMatch(headers, Y_ADJ_PATTERNS);
  let yIsAdjusted = yCol >= 0;
  if (yCol < 0) yCol = findFirstMatch(headers, Y_RAW_PATTERNS);
  const labelCol = findFirstMatch(headers, LABEL_PATTERNS);
  return { xCol, yCol, labelCol, yIsAdjusted };
}

// ── Top-N picking & label layout ────────────────────────────────────────
//
// Score = |log2FC| × -log10(p). This combined score is what most volcano
// plots use to pick "top hits to label" — a point that's far from origin
// in both axes is more interesting than one extreme on a single axis.
// Non-significant points are excluded by default; users almost never
// want to label noise.

export interface ScoredPoint {
  idx: number; // index into the ORIGINAL points array
  score: number;
}

export function pickTopLabels(
  points: VolcanoPoint[],
  n: number,
  fcCutoff: number,
  pCutoff: number,
  pFloor: number
): ScoredPoint[] {
  if (n <= 0) return [];
  const scored: ScoredPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) continue;
    if (!pt.label) continue;
    const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
    if (cls === "ns") continue;
    const score = Math.abs(pt.log2fc) * negLog10P(pt.p, pFloor);
    scored.push({ idx: i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

// ── Greedy collision-avoid label layout ─────────────────────────────────
//
// For each picked point, try four candidate anchors in order:
//   1. above-right  (point.x + offset, point.y - offset)
//   2. above-left   (point.x - offset - w, point.y - offset)
//   3. below-right  (point.x + offset, point.y + offset + h)
//   4. below-left   (point.x - offset - w, point.y + offset + h)
// First anchor whose bbox doesn't overlap any already-placed label OR
// the plot border wins. If none fit, we fall back to anchor 1 anyway and
// flag `forced: true` so the chart can render a leader line. This is
// intentionally simpler than ggrepel's force-directed simulation; the
// kill-chain user wants "top 10 labels readable", not 500.

export interface LayoutInput {
  pointPx: { x: number; y: number };
  text: string;
  charWidth: number; // pixels per char at the chosen font size (monospace ≈ fontSize × 0.6)
  lineHeight: number; // pixels
}

export interface PlacedLabel {
  pointPx: { x: number; y: number };
  textPx: { x: number; y: number }; // baseline anchor (SVG text default)
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
  anchor: "above-right" | "above-left" | "below-right" | "below-left";
  forced: boolean; // true ⇒ all anchors collided; render a leader line
}

const LABEL_OFFSET = 6;

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function within(
  bbox: { x: number; y: number; w: number; h: number },
  plotW: number,
  plotH: number
): boolean {
  return bbox.x >= 0 && bbox.y >= 0 && bbox.x + bbox.w <= plotW && bbox.y + bbox.h <= plotH;
}

export function layoutLabels(inputs: LayoutInput[], plotW: number, plotH: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const inp of inputs) {
    const w = inp.charWidth * inp.text.length;
    const h = inp.lineHeight;
    const candidates: Array<{
      anchor: PlacedLabel["anchor"];
      bbox: { x: number; y: number; w: number; h: number };
      textPx: { x: number; y: number };
    }> = [
      {
        anchor: "above-right",
        bbox: { x: inp.pointPx.x + LABEL_OFFSET, y: inp.pointPx.y - LABEL_OFFSET - h, w, h },
        textPx: { x: inp.pointPx.x + LABEL_OFFSET, y: inp.pointPx.y - LABEL_OFFSET - 2 },
      },
      {
        anchor: "above-left",
        bbox: { x: inp.pointPx.x - LABEL_OFFSET - w, y: inp.pointPx.y - LABEL_OFFSET - h, w, h },
        textPx: { x: inp.pointPx.x - LABEL_OFFSET - w, y: inp.pointPx.y - LABEL_OFFSET - 2 },
      },
      {
        anchor: "below-right",
        bbox: { x: inp.pointPx.x + LABEL_OFFSET, y: inp.pointPx.y + LABEL_OFFSET, w, h },
        textPx: { x: inp.pointPx.x + LABEL_OFFSET, y: inp.pointPx.y + LABEL_OFFSET + h - 2 },
      },
      {
        anchor: "below-left",
        bbox: { x: inp.pointPx.x - LABEL_OFFSET - w, y: inp.pointPx.y + LABEL_OFFSET, w, h },
        textPx: { x: inp.pointPx.x - LABEL_OFFSET - w, y: inp.pointPx.y + LABEL_OFFSET + h - 2 },
      },
    ];
    let chosen: (typeof candidates)[number] | null = null;
    for (const c of candidates) {
      if (!within(c.bbox, plotW, plotH)) continue;
      let collides = false;
      for (const p of placed) {
        if (rectsOverlap(c.bbox, p.bbox)) {
          collides = true;
          break;
        }
      }
      if (!collides) {
        chosen = c;
        break;
      }
    }
    const forced = chosen == null;
    if (forced) chosen = candidates[0];
    placed.push({
      pointPx: inp.pointPx,
      textPx: chosen!.textPx,
      bbox: chosen!.bbox,
      text: inp.text,
      anchor: chosen!.anchor,
      forced,
    });
  }
  return placed;
}

// Estimate average char width for a monospace font at a given size.
// 0.6 × fontSize is the standard heuristic for SF Mono / Menlo /
// Monaco; close enough for collision-avoid math (we don't need to
// pixel-align text, just keep boxes from overlapping).
export function approxMonoCharWidth(fontSize: number): number {
  return fontSize * 0.6;
}

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

// ── Search points by label ──────────────────────────────────────────────
//
// User feature: paste a comma- / newline-separated list of feature names
// (genes, proteins, …) and highlight the matching points. The chart's
// existing manual-selection infrastructure already renders a black ring +
// leader line + label for any index in `manualSelection: Set<number>`, so
// this helper just resolves a query to a list of `VolcanoPoint.idx` values
// the App can union into that set. Pure (no React, no DOM, no globals)
// so it loads cleanly under tests/helpers/volcano-loader.js.
//
// Match semantics — case-insensitive substring per token:
//   "AT1G"            → matches every point whose label contains "AT1G"
//   "AT1G01010,AT2G02020"
//   "AT1G01010\nAT2G"  (mixed comma + newline)
//   Tokens are trimmed; empty tokens are skipped; duplicates dedup.
//   Points with `label == null` are skipped silently.
//
// Performance: callers with large datasets should pass `labelLowerCache`
// — a precomputed `points.map(p => p.label?.toLocaleLowerCase() ?? null)`
// memo'd on the points reference — to avoid re-lowercasing every label
// per keystroke. The 2-arg overload computes the cache inline (fine for
// one-off / non-debounced calls).

export interface LabelMatchResult {
  matched: number[]; // unique VolcanoPoint.idx values, in points order
  unmatchedTokens: string[]; // tokens that matched zero points (in input order, deduped)
}

export function matchPointsByLabel(
  points: VolcanoPoint[],
  query: string,
  labelLowerCache?: Array<string | null>
): LabelMatchResult {
  if (typeof query !== "string") return { matched: [], unmatchedTokens: [] };
  // Split on commas + any newline variant; trim; drop empties; dedup
  // (case-folded) so the user can paste sloppily without duplicate work.
  const rawTokens = query.split(/[,\r\n]+/);
  const seen = new Set<string>();
  const tokens: string[] = [];
  const tokensLower: string[] = [];
  for (const raw of rawTokens) {
    const t = raw.trim();
    if (!t) continue;
    const tl = t.toLocaleLowerCase();
    if (seen.has(tl)) continue;
    seen.add(tl);
    tokens.push(t);
    tokensLower.push(tl);
  }
  if (tokens.length === 0) return { matched: [], unmatchedTokens: [] };

  const cache: Array<string | null> =
    labelLowerCache && labelLowerCache.length === points.length
      ? labelLowerCache
      : points.map((pt) => (pt.label == null ? null : pt.label.trim().toLocaleLowerCase()));

  const matchedIdx = new Set<number>();
  const tokenHit: boolean[] = new Array(tokens.length).fill(false);

  for (let i = 0; i < points.length; i++) {
    const lab = cache[i];
    if (lab == null || lab.length === 0) continue;
    for (let ti = 0; ti < tokensLower.length; ti++) {
      if (lab.includes(tokensLower[ti])) {
        matchedIdx.add(points[i].idx);
        tokenHit[ti] = true;
        // Don't break — other tokens for this row may also be the user's
        // intent; we still need to flag them as "found" so they're not
        // surfaced as unmatched.
      }
    }
  }

  const matched: number[] = [];
  for (const pt of points) {
    if (matchedIdx.has(pt.idx)) matched.push(pt.idx);
  }
  const unmatchedTokens: string[] = [];
  for (let ti = 0; ti < tokens.length; ti++) {
    if (!tokenHit[ti]) unmatchedTokens.push(tokens[ti]);
  }
  return { matched, unmatchedTokens };
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
//
// Up- and down-regulated features are picked independently with their
// own per-class N counts, so a dataset that's heavily skewed one way
// (e.g. 200 up-hits and 5 down-hits) doesn't crowd out the few rare
// hits in the smaller class. The chart caller defaults to nUp = nDown
// = 10 but exposes the two as separate sliders.

export interface ScoredPoint {
  idx: number; // index into the ORIGINAL points array
  score: number;
  cls: VolcanoClass; // "up" or "down" (ns is filtered out before scoring)
}

export function pickTopLabels(
  points: VolcanoPoint[],
  nUp: number,
  nDown: number,
  fcCutoff: number,
  pCutoff: number,
  pFloor: number
): ScoredPoint[] {
  const ups: ScoredPoint[] = [];
  const downs: ScoredPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) continue;
    if (!pt.label) continue;
    const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
    if (cls === "ns") continue;
    const score = Math.abs(pt.log2fc) * negLog10P(pt.p, pFloor);
    if (cls === "up") ups.push({ idx: i, score, cls });
    else downs.push({ idx: i, score, cls });
  }
  ups.sort((a: any, b: any) => b.score - a.score);
  downs.sort((a: any, b: any) => b.score - a.score);
  const out: ScoredPoint[] = [];
  if (nUp > 0) for (const e of ups.slice(0, nUp)) out.push(e);
  if (nDown > 0) for (const e of downs.slice(0, nDown)) out.push(e);
  return out;
}

// ── Leader-line label layout ────────────────────────────────────────────
//
// For each picked point, try 12 candidate angles around the source
// (every 30°, starting from 12-o'clock and fanning outward) at a fixed
// `LEADER_DISTANCE` from the source centre. The first angle that
// satisfies ALL of these constraints wins:
//
//   1. label bbox stays inside the layout `bounds` (the chart caller
//      passes a bbox bigger than the inner data plot so labels can
//      legitimately spill into the chart's chrome margin)
//   2. label bbox doesn't overlap any already-placed label
//   3. label bbox doesn't enclose any data point — text never sits on
//      top of a dot
//   4. the dashed leader line, drawn from the *outer ring edge* of the
//      source dot (not the dot itself) to the *nearest edge midpoint*
//      of the label bbox, doesn't pass within `obs.r` of any other
//      data point
//   5. that leader doesn't cross any already-placed leader either —
//      crossed leaders are visually noisy and ambiguous
//
// The leader entering the bbox at its *closest edge midpoint* (rather
// than the centre) means a gene name placed to the right of its dot
// has the leader join the left edge of the text, giving a clean "bracket"
// look instead of a line tunneling under the letters.
//
// If no candidate angle satisfies all five constraints, fall back to
// "12-o'clock" and flag `forced: true` so the chart can render the
// leader anyway. With a generous `bounds` (margin extension) and 12
// angles, the forced path is rare — typically only for points piled in
// a tight cluster against the plot edge.

export interface ObstaclePoint {
  x: number;
  y: number;
  r: number;
}

// The chart caller passes a `LayoutBounds` rect that is typically
// slightly larger than the inner data-plot area, so labels can legally
// land in the chart's outer margin where there are no data points to
// collide with. Using a rect (not just plotW / plotH) lets the bounds
// have negative origin — labels sitting *above* the inner plot in
// inner-coordinate space are kosher when y < 0.
export interface LayoutBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutInput {
  pointPx: { x: number; y: number };
  text: string;
  charWidth: number; // pixels per char at the chosen font size
  lineHeight: number; // pixels
  pointRadius: number; // radius of the source dot
  ringRadius: number; // radius of the black selection ring drawn outside the dot — leader starts here
}

export interface PlacedLabel {
  pointPx: { x: number; y: number };
  textPx: { x: number; y: number }; // baseline anchor for `text-anchor="middle"`
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
  // The dashed leader runs from leaderStart (on the *ring edge* of the
  // source point, away from the label) to leaderEnd (the closest edge
  // midpoint of the label bbox). Always populated.
  leaderStart: { x: number; y: number };
  leaderEnd: { x: number; y: number };
  forced: boolean; // true ⇒ all candidate angles collided; placement may overlap
}

// Layout search space. Each candidate is (angle, distance) — the
// algorithm tries every angle at the nearest distance first, then
// progressively farther distances. With 24 angles × 4 distances = 96
// candidates per label, dense plots have *much* more wiggle room than
// the original 12-angles-at-one-distance design (the user complaint).
// Angles are listed in preference order: 12 o'clock first (volcano
// significance points up), fanning outward through the upper hemisphere
// before reaching the lower hemisphere — labels above the data are the
// natural reading direction for top-N hits.
const LEADER_DISTANCES = [38, 56, 80, 108]; // px from source centre to label centre
const LABEL_BBOX_PAD = 1; // halo around each obstacle keeps text from kissing dot edges
const LABEL_ANGLES_DEG = [
  // Upper hemisphere first (12 o'clock outward), 15° apart.
  -90, -75, -105, -60, -120, -45, -135, -30, -150, -15, -165, 0, 180,
  // Lower hemisphere, same spacing.
  15, 165, 30, 150, 45, 135, 60, 120, 75, 105, 90,
];

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function within(
  bbox: { x: number; y: number; w: number; h: number },
  bounds: LayoutBounds
): boolean {
  return (
    bbox.x >= bounds.x &&
    bbox.y >= bounds.y &&
    bbox.x + bbox.w <= bounds.x + bounds.w &&
    bbox.y + bbox.h <= bounds.y + bounds.h
  );
}

// Closest-point distance from segment (x1,y1)→(x2,y2) to a circle's
// centre, returning true iff the segment passes within `r` of (cx, cy).
function lineSegmentIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t: number;
  if (len2 < 1e-9) {
    t = 0;
  } else {
    t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const ddx = cx - px;
  const ddy = cy - py;
  return ddx * ddx + ddy * ddy <= r * r;
}

// Standard 2D segment-segment intersection: returns true iff the open
// segments AB and CD share an interior point. Co-linear overlap is
// reported as non-intersecting (the leader-vs-leader check tolerates
// touch-only cases for points sharing a source edge).
function lineSegmentsIntersect(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number
): boolean {
  const d1x = ax2 - ax1;
  const d1y = ay2 - ay1;
  const d2x = bx2 - bx1;
  const d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false; // parallel
  const dx = bx1 - ax1;
  const dy = by1 - ay1;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  // Strict inequality at the endpoints so two leaders sharing a source
  // pixel (e.g. labels for two points right on top of each other) don't
  // register as crossing each other.
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

// Project (sx, sy) onto the bbox, returning the closest point on the
// bbox boundary. Used to anchor the leader on the side of the text
// nearest the source — gives a visual "bracket" when the label sits to
// one side of the dot.
function nearestPointOnBbox(
  bbox: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number
): { x: number; y: number } {
  const nx = Math.max(bbox.x, Math.min(sx, bbox.x + bbox.w));
  const ny = Math.max(bbox.y, Math.min(sy, bbox.y + bbox.h));
  return { x: nx, y: ny };
}

function pointInPaddedRect(
  px: number,
  py: number,
  bbox: { x: number; y: number; w: number; h: number },
  pad: number
): boolean {
  return (
    px >= bbox.x - pad &&
    px <= bbox.x + bbox.w + pad &&
    py >= bbox.y - pad &&
    py <= bbox.y + bbox.h + pad
  );
}

export function layoutLabels(
  inputs: LayoutInput[],
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const inp of inputs) {
    const w = inp.charWidth * inp.text.length;
    const h = inp.lineHeight;
    const sx = inp.pointPx.x;
    const sy = inp.pointPx.y;
    let chosen: PlacedLabel | null = null;

    // Outer loop = distance (prefer near placement). Inner loop = angle
    // (prefer 12 o'clock). Total candidate count = 24 × 4 = 96 — enough
    // wiggle room for dense plots without becoming a force-directed
    // simulation. The first candidate that satisfies all five
    // constraints wins.
    distanceLoop: for (const dist of LEADER_DISTANCES) {
      for (const deg of LABEL_ANGLES_DEG) {
        const rad = (deg * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const labelCx = sx + dist * cosA;
        const labelCy = sy + dist * sinA;
        const bbox = { x: labelCx - w / 2, y: labelCy - h / 2, w, h };

        // Constraint 1: bbox stays inside layout bounds.
        if (!within(bbox, bounds)) continue;

        // Constraint 2: bbox doesn't overlap any already-placed label.
        let labelCollides = false;
        for (const p of placed) {
          if (rectsOverlap(bbox, p.bbox)) {
            labelCollides = true;
            break;
          }
        }
        if (labelCollides) continue;

        // Constraint 3: bbox doesn't enclose any data point. Padding by
        // (obstacle radius + LABEL_BBOX_PAD) so text doesn't kiss dot edges.
        let bboxHitsPoint = false;
        for (const obs of obstacles) {
          const ox = obs.x - sx;
          const oy = obs.y - sy;
          if (ox * ox + oy * oy < 1) continue; // skip the source itself
          if (pointInPaddedRect(obs.x, obs.y, bbox, obs.r + LABEL_BBOX_PAD)) {
            bboxHitsPoint = true;
            break;
          }
        }
        if (bboxHitsPoint) continue;

        // Leader: ring edge → nearest bbox edge point.
        const startX = sx + inp.ringRadius * cosA;
        const startY = sy + inp.ringRadius * sinA;
        const leaderEnd = nearestPointOnBbox(bbox, sx, sy);

        // Constraint 4: leader doesn't cross any other data point.
        let leaderCollides = false;
        for (const obs of obstacles) {
          const ox = obs.x - sx;
          const oy = obs.y - sy;
          if (ox * ox + oy * oy < 1) continue; // source
          if (
            lineSegmentIntersectsCircle(
              startX,
              startY,
              leaderEnd.x,
              leaderEnd.y,
              obs.x,
              obs.y,
              obs.r + 0.5
            )
          ) {
            leaderCollides = true;
            break;
          }
        }
        if (leaderCollides) continue;

        // Constraint 5: leader doesn't cross any already-placed leader.
        let leadersCross = false;
        for (const p of placed) {
          if (
            lineSegmentsIntersect(
              startX,
              startY,
              leaderEnd.x,
              leaderEnd.y,
              p.leaderStart.x,
              p.leaderStart.y,
              p.leaderEnd.x,
              p.leaderEnd.y
            )
          ) {
            leadersCross = true;
            break;
          }
        }
        if (leadersCross) continue;

        chosen = {
          pointPx: { x: sx, y: sy },
          textPx: { x: labelCx, y: labelCy + h / 4 },
          bbox,
          text: inp.text,
          leaderStart: { x: startX, y: startY },
          leaderEnd,
          forced: false,
        };
        break distanceLoop;
      }
    }

    if (!chosen) {
      // Fallback: place straight up at the nearest distance regardless
      // of collisions; flag as forced so the chart renders the leader
      // visibly anyway.
      const rad = (-90 * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const labelCx = sx + LEADER_DISTANCES[0] * cosA;
      const labelCy = sy + LEADER_DISTANCES[0] * sinA;
      const bbox = { x: labelCx - w / 2, y: labelCy - h / 2, w, h };
      const startX = sx + inp.ringRadius * cosA;
      const startY = sy + inp.ringRadius * sinA;
      const leaderEnd = nearestPointOnBbox(bbox, sx, sy);
      chosen = {
        pointPx: { x: sx, y: sy },
        textPx: { x: labelCx, y: labelCy + h / 4 },
        bbox,
        text: inp.text,
        leaderStart: { x: startX, y: startY },
        leaderEnd,
        forced: true,
      };
    }
    placed.push(chosen);
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

// ── Aesthetic mapping (optional column → colour or size) ──────────────
//
// Volcano's default colouring is class-based (up = red, down = blue,
// ns = grey). The user can override that with an arbitrary column from
// the parsed dataset — useful for "colour by chromosome", "colour by
// pathway", "size by base-mean expression", etc. Detection rule
// matches scatter's: a column is *continuous* if its values are >80 %
// numeric AND it has > 12 unique values; otherwise *discrete*.

export type ColorMapType = "discrete" | "continuous";

export interface DiscreteColorMap {
  type: "discrete";
  // idx → hex colour. `idx` is the original-row index (matches
  // VolcanoPoint.idx). Values not in this map fall back to the chart's
  // default class colour. The legend list is the unique values in
  // first-seen order so the SVG legend / sidebar legend can use it.
  colorByIdx: Map<number, string>;
  legend: Array<{ value: string; color: string }>;
}

export interface ContinuousColorMap {
  type: "continuous";
  colorByIdx: Map<number, string>;
  // Numeric range used for the scale. UI shows these as the colorbar
  // endpoints; user can override via vmin/vmax sliders later.
  vmin: number;
  vmax: number;
  // The palette name the chart should expose in the colour-bar (so
  // the legend and the actual colours stay in sync).
  paletteName: string;
  // The actual gradient stops the mapping was built with — *post*-
  // inversion, so the in-SVG legend can re-render the bar directly
  // without reaching for the global palette table or knowing about
  // the user's invert flag.
  paletteStops: string[];
}

export type ColorMap = DiscreteColorMap | ContinuousColorMap | null;

// Pull the raw value for a given row's column out of `parseData`-style
// rawData. Returns the empty string if missing — matches Plöttr's
// usual "non-numeric / blank cell" convention.
function rawCell(rawData: string[][], rowIdx: number, col: number): string {
  if (col < 0) return "";
  const row = rawData[rowIdx];
  if (!row) return "";
  const v = row[col];
  return v == null ? "" : String(v);
}

// Plain numeric check — `parseData` upstream has already run
// `fixDecimalCommas` so we don't need the locale-aware shared helper
// here. Keeps this module dependency-free for the test loader.
function isNumericString(s: string): boolean {
  if (s === "") return false;
  const n = Number(s);
  return Number.isFinite(n);
}

// Detect whether a column should be treated as continuous (numeric
// with > 12 unique values, > 80 % numeric ratio) or discrete. Mirrors
// scatter's convention so users get the same auto-mode behaviour
// across plot tools.
//
// `pointIndices` is optional — when provided, only those rows of
// `rawData` are sampled. Used by buildColorMap to keep the type
// classification consistent with the (filtered) set of points the
// caller will actually colour. Default behaviour (no indices) walks
// every row, matching the v1 contract used by sibling tests.
export function detectColorMapType(
  rawData: string[][],
  col: number,
  pointIndices?: number[]
): ColorMapType {
  if (col < 0) return "discrete";
  let total = 0;
  let numeric = 0;
  const unique = new Set<string>();
  const inspect = (s: string) => {
    if (s === "") return;
    total++;
    unique.add(s);
    if (isNumericString(s)) numeric++;
  };
  if (pointIndices) {
    for (const idx of pointIndices) inspect(rawCell(rawData, idx, col));
  } else {
    for (const row of rawData) {
      const v = row[col];
      inspect(v == null ? "" : String(v));
    }
  }
  if (total === 0) return "discrete";
  const numericRatio = numeric / total;
  if (numericRatio > 0.8 && unique.size > 12) return "continuous";
  return "discrete";
}

interface BuildColorMapArgs {
  rawData: string[][];
  pointIndices: number[]; // VolcanoPoint.idx values (one per drawn point)
  col: number; // column index into rawData
  paletteStops: string[]; // pre-resolved palette colour-stop array (continuous mode)
  paletteName: string; // for the result object — the chart pairs it with the legend colourbar
  discretePalette: readonly string[]; // for discrete mode (Okabe-Ito by default)
  interpolate: (stops: string[], t: number) => string; // shared.js `interpolateColor`
}

export function buildColorMap(args: BuildColorMapArgs): ColorMap {
  const { rawData, pointIndices, col, paletteStops, paletteName, discretePalette, interpolate } =
    args;
  if (col < 0) return null;
  // Detect type against the same row subset we'll iterate for
  // colouring — otherwise a column that's continuous overall but
  // categorical-among-sig-points (or vice versa) would render with
  // the wrong scale.
  const type = detectColorMapType(rawData, col, pointIndices);
  if (type === "continuous") {
    let vmin = Infinity;
    let vmax = -Infinity;
    const numeric: Array<{ idx: number; v: number }> = [];
    for (const idx of pointIndices) {
      const raw = rawCell(rawData, idx, col);
      if (!isNumericString(raw)) continue;
      const n = Number(raw);
      numeric.push({ idx, v: n });
      if (n < vmin) vmin = n;
      if (n > vmax) vmax = n;
    }
    if (!Number.isFinite(vmin) || !Number.isFinite(vmax) || vmin === vmax) {
      // Degenerate range — every point is the same value. Fall back
      // to the palette's mid-point so the user still sees a colour.
      vmin = 0;
      vmax = 1;
    }
    const colorByIdx = new Map<number, string>();
    for (const { idx, v } of numeric) {
      const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5;
      colorByIdx.set(idx, interpolate(paletteStops, Math.max(0, Math.min(1, t))));
    }
    return {
      type: "continuous",
      colorByIdx,
      vmin,
      vmax,
      paletteName,
      paletteStops: paletteStops.slice(),
    };
  }
  // Discrete: assign palette colours in first-seen order.
  const seen = new Map<string, string>();
  const order: string[] = [];
  for (const idx of pointIndices) {
    const raw = rawCell(rawData, idx, col);
    if (raw === "") continue;
    if (!seen.has(raw)) {
      const color = discretePalette[seen.size % discretePalette.length];
      seen.set(raw, color);
      order.push(raw);
    }
  }
  const colorByIdx = new Map<number, string>();
  for (const idx of pointIndices) {
    const raw = rawCell(rawData, idx, col);
    const c = seen.get(raw);
    if (c != null) colorByIdx.set(idx, c);
  }
  return {
    type: "discrete",
    colorByIdx,
    legend: order.map((value: any) => ({ value, color: seen.get(value)! })),
  };
}

// Result of building a size mapping: the per-point radius map plus the
// numeric range it was derived from. The chart uses `byIdx` for actual
// point sizing and `vmin` / `vmax` / `minR` / `maxR` to draw the
// matching SVG legend (sample circles at min, mid, max with their
// data-value labels).
export interface SizeMap {
  byIdx: Map<number, number>;
  vmin: number;
  vmax: number;
  minR: number;
  maxR: number;
}

// Build a per-point radius map from a numeric column. Linearly
// interpolates between `minR` and `maxR`; non-numeric / missing values
// get no entry (chart uses default radius). Mirrors scatter's
// continuous size-mapping behaviour. Returns null when no rows have a
// finite numeric value in the chosen column.
export function buildSizeMap(
  rawData: string[][],
  pointIndices: number[],
  col: number,
  minR: number,
  maxR: number
): SizeMap | null {
  if (col < 0) return null;
  let vmin = Infinity;
  let vmax = -Infinity;
  const numeric: Array<{ idx: number; v: number }> = [];
  for (const idx of pointIndices) {
    const raw = rawCell(rawData, idx, col);
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    numeric.push({ idx, v: n });
    if (n < vmin) vmin = n;
    if (n > vmax) vmax = n;
  }
  if (numeric.length === 0) return null;
  const byIdx = new Map<number, number>();
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax) || vmin === vmax) {
    const mid = (minR + maxR) / 2;
    for (const { idx } of numeric) byIdx.set(idx, mid);
    return {
      byIdx,
      vmin: Number.isFinite(vmin) ? vmin : 0,
      vmax: Number.isFinite(vmax) ? vmax : 0,
      minR,
      maxR,
    };
  }
  const span = vmax - vmin;
  for (const { idx, v } of numeric) {
    const t = (v - vmin) / span;
    byIdx.set(idx, minR + t * (maxR - minR));
  }
  return { byIdx, vmin, vmax, minR, maxR };
}

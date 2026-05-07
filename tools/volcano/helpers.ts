// Pure helpers for the Volcano tool. All exports are deterministic, no
// React, no DOM, and no shared-bundle globals **except** through the
// `isNumericValue` / `toNumericValue` pair already declared in
// types/globals.d.ts (and pre-loaded into the test vm context by
// tests/helpers/volcano-loader.js). Same boundary every other tool's
// helpers.ts honours — TypeScript compiles standalone, the loader picks
// up the shared script-tag globals.
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

// Penalty weights for the smart-fallback path. A clean placement scores
// 0 (all constraints satisfied) and short-circuits the fallback. When no
// clean candidate exists, every (angle, distance) is scored by these
// weights and the least-bad wins — replaces the previous always-12-
// o'clock fallback, which produced visible label piles when multiple
// labels' clean candidates were all blocked.
//
// Weight ordering (most → least bad):
//   - bbox-on-dot: text sitting directly on a data point is unreadable.
//   - leader-on-dot or leader-vs-leader: visually confusing but the text
//     itself stays legible.
//   - bbox-vs-bbox overlap: legible if mild; the overlap area gives a
//     graceful penalty proportional to how much text gets obscured.
const PENALTY_BBOX_ON_POINT = 200;
const PENALTY_LEADER_ON_POINT = 50;
const PENALTY_LEADER_CROSS = 50;
const PENALTY_BBOX_OVERLAP_PER_100PX2 = 1;

// Single-candidate evaluator: build the bbox / leader at the given
// (angleDeg, distance) and tally the constraint penalty against the
// already-placed labels. Returns null if the candidate spills past
// `bounds` (hard reject, never refined into); else returns the
// placement + penalty pair.
//
// Extracted so both the coarse search in findBestPlacement and the
// sub-degree refinement (refineForcedAngle) call the same evaluator.
function evaluateCandidate(
  inp: LayoutInput,
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds,
  placed: PlacedLabel[],
  angleDeg: number,
  distance: number
): { placement: PlacedLabel; penalty: number } | null {
  const w = inp.charWidth * inp.text.length;
  const h = inp.lineHeight;
  const sx = inp.pointPx.x;
  const sy = inp.pointPx.y;
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const labelCx = sx + distance * cosA;
  const labelCy = sy + distance * sinA;
  const bbox = { x: labelCx - w / 2, y: labelCy - h / 2, w, h };

  if (!within(bbox, bounds)) return null;

  const startX = sx + inp.ringRadius * cosA;
  const startY = sy + inp.ringRadius * sinA;
  const leaderEnd = nearestPointOnBbox(bbox, sx, sy);

  let labelOverlapArea = 0;
  for (const p of placed) {
    const ix1 = Math.max(bbox.x, p.bbox.x);
    const iy1 = Math.max(bbox.y, p.bbox.y);
    const ix2 = Math.min(bbox.x + bbox.w, p.bbox.x + p.bbox.w);
    const iy2 = Math.min(bbox.y + bbox.h, p.bbox.y + p.bbox.h);
    if (ix2 > ix1 && iy2 > iy1) {
      labelOverlapArea += (ix2 - ix1) * (iy2 - iy1);
    }
  }

  let bboxHitsPointCount = 0;
  for (const obs of obstacles) {
    const ox = obs.x - sx;
    const oy = obs.y - sy;
    if (ox * ox + oy * oy < 1) continue;
    if (pointInPaddedRect(obs.x, obs.y, bbox, obs.r + LABEL_BBOX_PAD)) {
      bboxHitsPointCount++;
    }
  }

  let leaderHitsPointCount = 0;
  for (const obs of obstacles) {
    const ox = obs.x - sx;
    const oy = obs.y - sy;
    if (ox * ox + oy * oy < 1) continue;
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
      leaderHitsPointCount++;
    }
  }

  let leaderCrossCount = 0;
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
      leaderCrossCount++;
    }
  }

  const penalty =
    labelOverlapArea * (PENALTY_BBOX_OVERLAP_PER_100PX2 / 100) +
    leaderCrossCount * PENALTY_LEADER_CROSS +
    leaderHitsPointCount * PENALTY_LEADER_ON_POINT +
    bboxHitsPointCount * PENALTY_BBOX_ON_POINT;

  return {
    placement: {
      pointPx: { x: sx, y: sy },
      textPx: { x: labelCx, y: labelCy + h / 4 },
      bbox,
      text: inp.text,
      leaderStart: { x: startX, y: startY },
      leaderEnd,
      forced: false,
    },
    penalty,
  };
}

// Sub-degree refinement around a coarse forced placement. The coarse
// search uses a fixed 15° grid (24 angles); a forced winner at -105°
// might have a strictly-better placement at -97° that the grid missed.
// This walks ±7.5° in 5 evenly-spaced fine angles, picks the lowest
// penalty, and recurses one level (3 angles ±3.75°) around the winner.
//
// Only kicks in for forced placements — clean ones already have
// penalty 0 and can't be improved. Total cost: ~8 extra evaluations
// per forced label.
const REFINE_RANGE_DEG = 7.5;
const REFINE_STEPS_LEVEL_1 = 5;
const REFINE_STEPS_LEVEL_2 = 3;

function refineForcedAngle(
  inp: LayoutInput,
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds,
  placed: PlacedLabel[],
  baseAngleDeg: number,
  baseDistance: number,
  basePenalty: number,
  baseCandidate: PlacedLabel
): { placement: PlacedLabel; penalty: number } {
  let best = { placement: baseCandidate, penalty: basePenalty };

  // Level 1: coarse fine-grained sweep ±REFINE_RANGE_DEG.
  let bestLevel1Angle = baseAngleDeg;
  for (let i = 0; i < REFINE_STEPS_LEVEL_1; i++) {
    const offset = -REFINE_RANGE_DEG + (2 * REFINE_RANGE_DEG * i) / (REFINE_STEPS_LEVEL_1 - 1);
    const angleDeg = baseAngleDeg + offset;
    if (Math.abs(offset) < 1e-9) continue; // skip the base — already evaluated
    const result = evaluateCandidate(inp, obstacles, bounds, placed, angleDeg, baseDistance);
    if (result && result.penalty < best.penalty) {
      best = result;
      bestLevel1Angle = angleDeg;
    }
  }

  // Level 2: tighter sweep around level-1 winner ±REFINE_RANGE_DEG/2.
  // No-op when level 1 didn't improve — bestLevel1Angle is still the
  // base, which we already evaluated at level 1.
  if (bestLevel1Angle === baseAngleDeg) return best;
  const half = REFINE_RANGE_DEG / 2;
  for (let i = 0; i < REFINE_STEPS_LEVEL_2; i++) {
    const offset = -half + (2 * half * i) / (REFINE_STEPS_LEVEL_2 - 1);
    if (Math.abs(offset) < 1e-9) continue;
    const angleDeg = bestLevel1Angle + offset;
    const result = evaluateCandidate(inp, obstacles, bounds, placed, angleDeg, baseDistance);
    if (result && result.penalty < best.penalty) {
      best = result;
    }
  }
  return best;
}

// Single-label search: walk the candidate (angle, distance) grid given
// the labels already placed, return the placement with lowest penalty.
// Penalty == 0 means clean (no constraint violations). Forced
// placements get a sub-degree refinement pass around the coarse
// winner — cheap precision boost when the 15° angle grid doesn't land
// on the true minimum.
function findBestPlacement(
  inp: LayoutInput,
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds,
  placed: PlacedLabel[]
): { placement: PlacedLabel; penalty: number } {
  let chosen: PlacedLabel | null = null;
  let bestForced: {
    penalty: number;
    candidate: PlacedLabel;
    angleDeg: number;
    distance: number;
  } | null = null;

  distanceLoop: for (const dist of LEADER_DISTANCES) {
    for (const deg of LABEL_ANGLES_DEG) {
      const result = evaluateCandidate(inp, obstacles, bounds, placed, deg, dist);
      if (!result) continue;

      if (result.penalty < 1e-9) {
        chosen = result.placement;
        break distanceLoop;
      }

      if (!bestForced || result.penalty < bestForced.penalty) {
        bestForced = {
          penalty: result.penalty,
          candidate: result.placement,
          angleDeg: deg,
          distance: dist,
        };
      }
    }
  }

  if (chosen) return { placement: chosen, penalty: 0 };
  if (bestForced) {
    // Sub-degree refinement around the coarse forced winner. May find
    // a placement with strictly lower penalty (e.g. a label that
    // needed 4 px lateral movement to clear an overlap can now find
    // it; the 15° coarse grid steps ~10 px laterally at the nearest
    // distance, missing such fits).
    const refined = refineForcedAngle(
      inp,
      obstacles,
      bounds,
      placed,
      bestForced.angleDeg,
      bestForced.distance,
      bestForced.penalty,
      bestForced.candidate
    );
    return {
      placement: { ...refined.placement, forced: true },
      penalty: refined.penalty,
    };
  }
  // Last-resort fallback: no in-bounds candidate at all (caller passed
  // bounds smaller than the label can fit). Plant at 12 o'clock anyway,
  // marked forced; the caller sees a visibly broken result and should
  // widen `bounds`.
  const w = inp.charWidth * inp.text.length;
  const h = inp.lineHeight;
  const sx = inp.pointPx.x;
  const sy = inp.pointPx.y;
  const rad = (-90 * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const labelCx = sx + LEADER_DISTANCES[0] * cosA;
  const labelCy = sy + LEADER_DISTANCES[0] * sinA;
  const bbox = { x: labelCx - w / 2, y: labelCy - h / 2, w, h };
  const startX = sx + inp.ringRadius * cosA;
  const startY = sy + inp.ringRadius * sinA;
  const leaderEnd = nearestPointOnBbox(bbox, sx, sy);
  return {
    placement: {
      pointPx: { x: sx, y: sy },
      textPx: { x: labelCx, y: labelCy + h / 4 },
      bbox,
      text: inp.text,
      leaderStart: { x: startX, y: startY },
      leaderEnd,
      forced: true,
    },
    // Sentinel: outside the normal penalty range so multi-restart
    // always prefers any other run that managed an in-bounds placement.
    penalty: 1e9,
  };
}

// Greedy first-fit pass over `inputs` in the given `order`. Returns the
// placements re-indexed back to input order (placed[i] corresponds to
// inputs[i]) plus the total penalty across all labels. The total is
// what the multi-restart wrapper minimizes over.
function greedyPass(
  inputs: LayoutInput[],
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds,
  order: number[]
): { placed: PlacedLabel[]; totalPenalty: number } {
  const placedInOrder: PlacedLabel[] = [];
  const placedAt: number[] = []; // input index for each entry in placedInOrder
  let totalPenalty = 0;
  for (const idx of order) {
    const { placement, penalty } = findBestPlacement(inputs[idx], obstacles, bounds, placedInOrder);
    placedInOrder.push(placement);
    placedAt.push(idx);
    totalPenalty += penalty;
  }
  // Re-index back to input order — the public contract is
  // `placed[i] ↔ inputs[i]` regardless of internal placement order.
  const placed: PlacedLabel[] = new Array(inputs.length);
  for (let k = 0; k < placedInOrder.length; k++) {
    placed[placedAt[k]] = placedInOrder[k];
  }
  return { placed, totalPenalty };
}

// Build several input orderings to run the greedy pass with. Each
// ordering is a permutation of [0..inputs.length-1].
//
// Why multiple orderings: greedy first-fit is order-dependent — the
// label placed first claims its preferred slot, leaving downstream
// labels to fight over what remains. A label that's "harder" to place
// (anchor in a dense region) might come up early and grab the easy
// slot, leaving an "easy" label stranded in a forced fallback later.
// By running the greedy pass with a few different orderings and
// picking the lowest-total-penalty result, we get most of the benefit
// of a global optimization without paying the cost of a force-directed
// or simulated-annealing solver.
function buildOrderings(inputs: LayoutInput[]): number[][] {
  const n = inputs.length;
  if (n <= 1) return [Array.from({ length: n }, (_, i) => i)];

  const idxs = Array.from({ length: n }, (_, i) => i);

  // Ordering 1 — input order. Highest-priority label first under
  // pickTopLabels' ranking by |log2FC| × −log10(p).
  const inputOrder = [...idxs];

  // Ordering 2 — reverse. Lowest-priority label first.
  const reverseOrder = [...idxs].reverse();

  // Ordering 3 — most-isolated anchor first. For each anchor, find
  // the distance to its nearest neighbor; sort by that distance
  // descending. Isolated anchors trivially get clean candidates and
  // don't constrain others; clustered anchors fight last over what's
  // left.
  const isolation = idxs.map((i) => {
    let minD2 = Infinity;
    for (const j of idxs) {
      if (j === i) continue;
      const dx = inputs[i].pointPx.x - inputs[j].pointPx.x;
      const dy = inputs[i].pointPx.y - inputs[j].pointPx.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
    return { idx: i, isolation: minD2 };
  });
  isolation.sort((a, b) => b.isolation - a.isolation);
  const isolatedFirst = isolation.map((e) => e.idx);

  // Ordering 4 — most-clustered first. Reverse of isolation: dense
  // anchors get first claim, the isolated ones place later (where
  // they'll easily find clean spots regardless). Sometimes wins on
  // grids that are uniformly dense in one quadrant.
  const clusteredFirst = [...isolatedFirst].reverse();

  return [inputOrder, reverseOrder, isolatedFirst, clusteredFirst];
}

export function layoutLabels(
  inputs: LayoutInput[],
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds
): PlacedLabel[] {
  if (inputs.length === 0) return [];

  // Multi-restart greedy: try a handful of input orderings, pick the
  // result with lowest total penalty. Strictly non-regressing — the
  // single-pass greedy result (input-order) is one of the candidates,
  // so the worst case is "no improvement found, return the original
  // result." No force-directed simulation, no stochastic steps; pure
  // re-runs of the deterministic greedy with different starting orders.
  //
  // Cost: K × greedy-pass-cost. With K = 4 orderings and ~20 typical
  // labels, this is ~4× the prior single-pass layout — measured
  // ~5–20 ms on a 50-label dense plot. Fast enough that we don't gate
  // it behind a "high density" heuristic; just always run K passes.
  const orderings = buildOrderings(inputs);
  let best = greedyPass(inputs, obstacles, bounds, orderings[0]);
  for (let i = 1; i < orderings.length; i++) {
    const candidate = greedyPass(inputs, obstacles, bounds, orderings[i]);
    if (candidate.totalPenalty < best.totalPenalty) {
      best = candidate;
    }
  }
  return best.placed;
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

// ── Row → VolcanoPoint pull ────────────────────────────────────────────
//
// Boundary between Plöttr's parseData() output (a 2-D string array
// indexed by column) and the typed `VolcanoPoint[]` shape every
// downstream consumer (chart, summary, label search, colour/size maps)
// operates on. Skips rows where x or y is null / "" (NA placeholders);
// non-numeric x/y falls through as NaN so the chart filters at draw time
// rather than failing at ingest. Trims trailing whitespace from label
// cells so a sloppy `"AT1G01010 "` still matches an exact-match search.
export function buildPoints(
  rawData: string[][],
  xCol: number,
  yCol: number,
  labelCol: number
): VolcanoPoint[] {
  const out: VolcanoPoint[] = [];
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const xRaw = row[xCol];
    const yRaw = row[yCol];
    if (xRaw == null || yRaw == null || xRaw === "" || yRaw === "") continue;
    const log2fc = isNumericValue(xRaw) ? toNumericValue(xRaw) : NaN;
    const p = isNumericValue(yRaw) ? toNumericValue(yRaw) : NaN;
    const labelRaw =
      labelCol >= 0 && row[labelCol] != null && row[labelCol] !== "" ? String(row[labelCol]) : null;
    const label = labelRaw == null ? null : labelRaw.trim() || null;
    out.push({ idx: i, log2fc, p, label });
  }
  return out;
}

// ── Eligible-columns filter for aesthetic mapping tiles ────────────────
//
// Aesthetic mappings (Color / Size) can use any column NOT already bound
// to a primary role (x or y). The label column is allowed (a user might
// want to colour by gene name AND show those names — fine, the chart
// will just colour each labelled point with its discrete colour).
// `labelCol` stays in the signature so callers can pass it without
// thinking; it's ignored on purpose.
//
// `parsed: any` matches the convention every other tool uses for the
// parseData() output bag: only `parsed.headers` is read here, and the
// canonical ParseDataResult typing lives in types/globals.d.ts where
// React-tier files pick it up.
export function eligibleColumns(
  parsed: any,
  xCol: number,
  yCol: number,
  labelCol: number
): { h: string; i: number }[] {
  void labelCol;
  const used = new Set<number>([xCol, yCol]);
  return (parsed?.headers || [])
    .map((h: string, i: number) => ({ h, i }))
    .filter(({ i }: { i: number }) => !used.has(i));
}

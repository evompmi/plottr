// Pure layout helpers for `chart.tsx`. Everything that was inlined as a
// `useMemo` body inside the `VolcanoChart` component lives here as a
// standalone function — no React, no DOM. The chart re-imports them and
// memoises the calls; the maths sits in this file so the render component
// stays a thin orchestrator (the user's "chart-internal complexity is
// creeping up" review item).

import {
  VolcanoPoint,
  VolcanoClass,
  classifyPoint,
  negLog10P,
  pickTopLabels,
  layoutLabels,
  approxMonoCharWidth,
  PlacedLabel,
  ColorMap,
  SizeMap,
} from "./helpers";

// Default canvas dimensions — match scatter's 800×500 export shape.
// VBW is overridable via the `plotWidth` prop: the user has a slider in
// the Style tile that resizes the SVG viewBox horizontally (so the inner
// data area widens / narrows independent of the downstream image scale).
// Height is fixed for now — most volcano plots want a wider-than-tall
// canvas.
export const DEFAULT_VBW = 800;
export const VBH = 500;
// Margins are deliberately generous (vs scatter's tight 28/28/56/70) so
// the label-layout pass has somewhere to spill labels when the inner
// plot is dense. layoutLabels accepts a `bounds` rect that extends
// `LABEL_OUTSIDE_PAD` px into each margin — labels can legally land in
// the chart's chrome where there are no data points to collide with.
export const MARGIN = { top: 56, right: 60, bottom: 78, left: 86 };
// Labels are allowed to spill up to LABEL_OUTSIDE_PAD pixels into each
// outer chart margin — the inner data area is 658 × 366 (at VBW=800,
// VBH=500), and a 56-px halo around it brings the layout's effective
// bounding box to 770 × 478, giving even dense top-N picks plenty of
// room to fan their labels into the chrome where there are no points
// to collide with.
export const LABEL_OUTSIDE_PAD = 56;
// outer ring radius = pointRadius + SELECTION_RING_PAD
export const SELECTION_RING_PAD = 1.5;
export const LEGEND_W = 130;
export const LEGEND_GAP = 14;

// ── Numeric formatters ──────────────────────────────────────────────────────

// Conventional fmt: keep the numeric labels readable on both axes. The
// y-axis is always -log10(p) (so usually 0..50ish, integers); the x-axis
// is log2FC (usually -10..+10, fractional).
export function fmtTick(t: number): string {
  if (t === 0) return "0";
  if (Math.abs(t) >= 100) return t.toFixed(0);
  if (Math.abs(t) >= 10) return t.toFixed(1);
  return t.toFixed(2);
}

// Compact numeric formatter for legend endpoints — short for huge values
// (10k → "10000"), exponent for very small (< 0.01).
export function fmtLegend(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs >= 1e6) return n.toExponential(1);
  if (abs >= 1000) return Math.round(n).toString();
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  return n.toExponential(1);
}

// ── Axis ranges ─────────────────────────────────────────────────────────────

export interface AxisRanges {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

// Auto-ranges from the data, with optional user overrides honoured.
// Symmetric around 0 on the x-axis (volcano convention — the centre of
// the plot is "no fold change") so up and down points balance visually.
// Y-axis runs 0..max with a 5% headroom so the highest -log10(p) point
// doesn't sit on the top frame.
export function computeAxisRanges(
  points: VolcanoPoint[],
  pFloor: number,
  fcCutoff: number,
  pCutoff: number,
  userXMin: number | null,
  userXMax: number | null,
  userYMin: number | null,
  userYMax: number | null
): AxisRanges {
  let absMaxFc = 0;
  let maxNL = 0;
  for (const pt of points) {
    if (Number.isFinite(pt.log2fc)) {
      const a = Math.abs(pt.log2fc);
      if (a > absMaxFc) absMaxFc = a;
    }
    const nl = negLog10P(pt.p, pFloor);
    if (Number.isFinite(nl) && nl > maxNL) maxNL = nl;
  }
  // Pad to at least the cutoff so reference lines are visible even on a
  // flat dataset.
  absMaxFc = Math.max(absMaxFc, fcCutoff * 1.5, 1);
  maxNL = Math.max(maxNL, -Math.log10(pCutoff) * 1.5, 1);
  const autoXMin = -absMaxFc * 1.05;
  const autoXMax = absMaxFc * 1.05;
  const autoYMin = 0;
  const autoYMax = maxNL * 1.05;
  return {
    xMin: userXMin != null ? userXMin : autoXMin,
    xMax: userXMax != null ? userXMax : autoXMax,
    yMin: userYMin != null ? userYMin : autoYMin,
    yMax: userYMax != null ? userYMax : autoYMax,
  };
}

// ── Pre-classified, pre-positioned point list ──────────────────────────────

export interface RenderedPoint {
  pt: VolcanoPoint;
  cls: VolcanoClass;
  px: { x: number; y: number };
  nl: number;
}

// Pre-classify and pre-compute pixel coords once so the JSX walk is
// purely a render of an already-shaped point list. Sort order: ns
// (background) → down → up so the significant points sit on top and pop
// visually against the grey carpet.
export function buildRenderedPoints(
  points: VolcanoPoint[],
  pFloor: number,
  fcCutoff: number,
  pCutoff: number,
  sx: (v: number) => number,
  sy: (v: number) => number
): RenderedPoint[] {
  const out: RenderedPoint[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.log2fc)) continue;
    const nl = negLog10P(pt.p, pFloor);
    const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
    out.push({ pt, cls, nl, px: { x: sx(pt.log2fc), y: sy(nl) } });
  }
  out.sort((a, b) => {
    const order: Record<VolcanoClass, number> = { ns: 0, down: 1, up: 2 };
    return order[a.cls] - order[b.cls];
  });
  return out;
}

// ── Label layout (auto top-N or manual selection) ──────────────────────────

export interface LabelLayoutResult {
  labels: PlacedLabel[];
  // Per-label source-point radius. The selection-ring renderer needs it
  // (size mapping makes per-point radii variable) and walking `rendered`
  // again at render time is O(N²); keeping the radii alongside the
  // layout result keeps it O(N).
  radii: number[];
}

export interface BuildLabelLayoutInput {
  showLabels: boolean;
  topNUp: number;
  topNDown: number;
  points: VolcanoPoint[];
  rendered: RenderedPoint[];
  fcCutoff: number;
  pCutoff: number;
  pFloor: number;
  labelFontSize: number;
  pointRadius: number;
  manualSelection?: Set<number>;
  // Per-point radius resolver (size aesthetic mapping). Defaults to
  // `pointRadius` for points without a mapping entry.
  radiusFor: (idx: number) => number;
  // Inner data-area dims (post-margin, post-legend).
  w: number;
  h: number;
}

// Two label modes:
//   manual: use exactly the user-clicked indices, regardless of class
//           (an ns point the user explicitly clicked still gets labelled
//           — that's the whole point of a manual override).
//   auto:   use pickTopLabels(topNUp, topNDown) on significant up / down
//           hits.
//
// The manual path also bypasses the "must have a label string" guard
// the auto path enforces — if the user clicks a point with an empty
// label column, we synthesise "row N" so the click still produces
// visible feedback.
export function buildLabelLayout(input: BuildLabelLayoutInput): LabelLayoutResult {
  const {
    showLabels,
    topNUp,
    topNDown,
    points,
    rendered,
    fcCutoff,
    pCutoff,
    pFloor,
    labelFontSize,
    manualSelection,
    radiusFor,
    w,
    h,
  } = input;
  if (!showLabels) return { labels: [], radii: [] };

  const renderByIdx = new Map<number, RenderedPoint>();
  for (const r of rendered) renderByIdx.set(r.pt.idx, r);

  const charW = approxMonoCharWidth(labelFontSize);
  const lineH = labelFontSize * 1.15;

  let pickedRenders: RenderedPoint[];
  if (manualSelection && manualSelection.size > 0) {
    pickedRenders = [];
    for (const idx of manualSelection) {
      const r = renderByIdx.get(idx);
      if (r) pickedRenders.push(r);
    }
  } else {
    if (topNUp <= 0 && topNDown <= 0) return { labels: [], radii: [] };
    const top = pickTopLabels(points, topNUp, topNDown, fcCutoff, pCutoff, pFloor);
    pickedRenders = top
      .map(({ idx }) => renderByIdx.get(points[idx].idx))
      .filter((r): r is RenderedPoint => r != null && r.pt.label != null);
  }

  // Per-point radius / ring radius — the size mapping might give each
  // label a different source-point size, which the leader layout needs
  // to start the leader at the correct ring edge.
  const inputs = pickedRenders.map((r) => {
    const pr = radiusFor(r.pt.idx);
    return {
      pointPx: { x: r.px.x - MARGIN.left, y: r.px.y - MARGIN.top },
      text: r.pt.label != null && r.pt.label !== "" ? r.pt.label : "row " + (r.pt.idx + 1),
      charWidth: charW,
      lineHeight: lineH,
      pointRadius: pr,
      ringRadius: pr + SELECTION_RING_PAD,
    };
  });
  // Obstacles: every rendered point (incl. ns ones — leader lines
  // shouldn't tunnel through any dot, regardless of class). Uses each
  // point's actual rendered radius so the collision math stays accurate
  // when sizes vary.
  const obstacles = rendered.map((r) => ({
    x: r.px.x - MARGIN.left,
    y: r.px.y - MARGIN.top,
    r: radiusFor(r.pt.idx),
  }));
  // Allow labels to land up to LABEL_OUTSIDE_PAD pixels into the outer
  // chart margin where there are no data points to collide with. Bounds
  // origin can be negative — that's how a label legitimately sits
  // *above* the inner plot frame.
  const labelBounds = {
    x: -LABEL_OUTSIDE_PAD,
    y: -LABEL_OUTSIDE_PAD,
    w: w + LABEL_OUTSIDE_PAD * 2,
    h: h + LABEL_OUTSIDE_PAD * 2,
  };
  const placed = layoutLabels(inputs, obstacles, labelBounds);
  const radii = pickedRenders.map((r) => radiusFor(r.pt.idx));
  return { labels: placed, radii };
}

// ── Per-point fill / radius resolvers (aesthetic-mapping fallback) ─────────

// Per-point resolvers: pick the data-driven mapping when an entry
// exists, otherwise fall back to the class colour / uniform radius.
// Colour-by-column is *only* applied to features that pass the
// thresholds (up / down classes). Non-significant points stay
// class-grey regardless of the colorByIdx map — that's the user
// expectation for a volcano (highlight what's significant; noise stays
// as noise). Size mapping deliberately applies to every point so
// cluster-size or expression-level cues aren't lost.
export function makeFillFor(
  colors: { up: string; down: string; ns: string },
  colorMap: ColorMap | null | undefined
): (idx: number, cls: VolcanoClass) => string {
  const colorByIdx = colorMap ? colorMap.colorByIdx : null;
  return (idx, cls) => {
    if (cls !== "ns" && colorByIdx && colorByIdx.has(idx)) return colorByIdx.get(idx)!;
    return colors[cls];
  };
}

export function makeRadiusFor(
  pointRadius: number,
  sizeMap: SizeMap | null | undefined
): (idx: number) => number {
  const radiusByIdx = sizeMap ? sizeMap.byIdx : null;
  return (idx) => {
    if (radiusByIdx && radiusByIdx.has(idx)) return radiusByIdx.get(idx)!;
    return pointRadius;
  };
}

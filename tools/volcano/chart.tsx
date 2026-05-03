// VolcanoChart — SVG renderer for volcano plots.
//
// Pure render component (forwardRef so the parent can grab the SVG node
// for download). All layout / classification / labelling has already
// happened upstream via tools/volcano/helpers.ts; this file just walks
// the prepared point list and emits the corresponding SVG primitives in
// named groups (so Inkscape users can hand-edit the export).
//
// The standard ambient globals (React, makeTicks, svgSafeId) come from
// tools/shared.bundle.js — same pattern as every other plot tool.

import {
  VOLCANO_DEFAULT_COLORS,
  VolcanoPoint,
  VolcanoClass,
  classifyPoint,
  negLog10P,
  pickTopLabels,
  layoutLabels,
  approxMonoCharWidth,
  PlacedLabel,
} from "./helpers";

const { forwardRef, useMemo } = React;

// Same canvas dimensions as scatter — keeps the export-default 800×500
// expectation consistent across XY tools.
export const VBW = 800;
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
const LABEL_OUTSIDE_PAD = 56;
const SELECTION_RING_PAD = 1.5; // outer ring radius = pointRadius + SELECTION_RING_PAD

interface VolcanoChartProps {
  points: VolcanoPoint[];
  pFloor: number;
  fcCutoff: number;
  pCutoff: number;
  // Auto means "derive from data"; explicit numbers override.
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  xLabel: string;
  yLabel: string;
  title: string;
  subtitle: string;
  colors: { up: string; down: string; ns: string };
  pointRadius: number;
  pointAlpha: number;
  showRefLines: boolean;
  showLabels: boolean;
  topNUp: number;
  topNDown: number;
  labelFontSize: number;
  showAxes: boolean;
  // Click-to-label: a Set of original-row indices the user has clicked.
  // When non-empty, the chart bypasses the auto top-N picker and labels
  // ONLY these features (regardless of class). The black selection ring
  // tracks the same set. Optional — auto-mode behaviour kicks in when
  // the prop is undefined or empty.
  manualSelection?: Set<number>;
  onPointClick?: (idx: number) => void;
  // Optional aesthetic mappings derived in the App orchestrator. Both
  // are keyed by VolcanoPoint.idx (the original parsed-row index). When
  // colorByIdx is set, it overrides the class-based fill on each point
  // it has an entry for; class-coloured fallback applies elsewhere.
  // When radiusByIdx is set, it overrides the uniform `pointRadius`
  // on each point it has an entry for. Both selection-ring radii and
  // the label-layout obstacles inherit the per-point radius so the
  // collision math stays accurate for variably-sized clouds.
  colorByIdx?: Map<number, string> | null;
  radiusByIdx?: Map<number, number> | null;
  plotBg: string;
}

// Conventional fmt: keep the numeric labels readable on both axes. The
// y-axis is always -log10(p) (so usually 0..50ish, integers); the x-axis
// is log2FC (usually -10..+10, fractional).
function fmtTick(t: number): string {
  if (t === 0) return "0";
  if (Math.abs(t) >= 100) return t.toFixed(0);
  if (Math.abs(t) >= 10) return t.toFixed(1);
  return t.toFixed(2);
}

export const VolcanoChart = forwardRef<SVGSVGElement, VolcanoChartProps>(
  function VolcanoChart(props, ref) {
    const {
      points,
      pFloor,
      fcCutoff,
      pCutoff,
      xMin: userXMin,
      xMax: userXMax,
      yMin: userYMin,
      yMax: userYMax,
      xLabel,
      yLabel,
      title,
      subtitle,
      colors,
      pointRadius,
      pointAlpha,
      showRefLines,
      showLabels,
      topNUp,
      topNDown,
      labelFontSize,
      showAxes,
      manualSelection,
      onPointClick,
      colorByIdx,
      radiusByIdx,
      plotBg,
    } = props;
    // Per-point resolvers: pick the data-driven mapping when an entry
    // exists, otherwise fall back to the class colour / uniform radius.
    // Colour-by-column is *only* applied to features that pass the
    // thresholds (up / down classes). Non-significant points stay
    // class-grey regardless of the colorByIdx map — that's the user
    // expectation for a volcano (highlight what's significant; noise
    // stays as noise). Size mapping deliberately applies to every
    // point so cluster-size or expression-level cues aren't lost.
    const fillFor = (idx: number, cls: VolcanoClass): string => {
      if (cls !== "ns" && colorByIdx && colorByIdx.has(idx)) return colorByIdx.get(idx)!;
      return colors[cls];
    };
    const radiusFor = (idx: number): number => {
      if (radiusByIdx && radiusByIdx.has(idx)) return radiusByIdx.get(idx)!;
      return pointRadius;
    };

    const w = VBW - MARGIN.left - MARGIN.right;
    const h = VBH - MARGIN.top - MARGIN.bottom;

    // Derive auto-ranges from the data. Symmetric around 0 on the x-axis
    // (volcano convention — the centre of the plot is "no fold change") so
    // up and down points balance visually. Y-axis runs 0..max with a 5%
    // headroom so the highest -log10(p) point doesn't sit on the top frame.
    const { xMin, xMax, yMin, yMax } = useMemo(() => {
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
      // Pad to at least the cutoff so reference lines are visible even on
      // a flat dataset.
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
    }, [points, pFloor, fcCutoff, pCutoff, userXMin, userXMax, userYMin, userYMax]);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * w;
    const sy = (v: number) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
    const xTicks = makeTicks(xMin, xMax, 8);
    const yTicks = makeTicks(yMin, yMax, 6);

    // Pre-classify and pre-compute pixel coords once so the JSX walk is
    // purely a render of an already-shaped point list.
    const rendered = useMemo(() => {
      const out: Array<{
        pt: VolcanoPoint;
        cls: VolcanoClass;
        px: { x: number; y: number };
        nl: number;
      }> = [];
      for (const pt of points) {
        if (!Number.isFinite(pt.log2fc)) continue;
        const nl = negLog10P(pt.p, pFloor);
        const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
        out.push({
          pt,
          cls,
          nl,
          px: { x: sx(pt.log2fc), y: sy(nl) },
        });
      }
      // Render order: ns (background) → down → up so the significant
      // points sit on top and pop visually against the grey carpet.
      out.sort((a, b) => {
        const order = { ns: 0, down: 1, up: 2 } as Record<VolcanoClass, number>;
        return order[a.cls] - order[b.cls];
      });
      return out;
    }, [points, pFloor, fcCutoff, pCutoff, xMin, xMax, yMin, yMax]);

    // Labels: two modes —
    //   manual:   use exactly the user-clicked indices, regardless of
    //             class (an ns point the user explicitly clicked still
    //             gets labelled — that's the whole point of a manual
    //             override).
    //   auto:    use pickTopLabels(topNUp, topNDown) on significant
    //            up / down hits.
    // The manual path also bypasses the "must have a label string"
    // guard the auto path enforces — if the user clicks a point with
    // an empty label column, we synthesise "row N" so the click still
    // produces visible feedback.
    // Returns BOTH the placed labels and a parallel array of source-
    // point radii. The selection-ring render needs the per-point
    // radius (size-mapping makes it variable), and walking `rendered`
    // again at render time is O(N²); keeping the radii alongside the
    // layout result is O(N) and keeps the data local.
    const labelLayout: { labels: PlacedLabel[]; radii: number[] } = useMemo(() => {
      if (!showLabels) return { labels: [], radii: [] };
      const renderByIdx = new Map<number, (typeof rendered)[number]>();
      for (const r of rendered) renderByIdx.set(r.pt.idx, r);

      const charW = approxMonoCharWidth(labelFontSize);
      const lineH = labelFontSize * 1.15;

      let pickedRenders: Array<(typeof rendered)[number]>;
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
          .filter((r): r is (typeof rendered)[number] => r != null && r.pt.label != null);
      }

      // Per-point radius / ring radius — the size-mapping might give
      // each label a different source-point size, which the leader
      // layout needs to start the leader at the correct ring edge.
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
      // shouldn't tunnel through any dot, regardless of class). Uses
      // each point's actual rendered radius so the collision math
      // stays accurate when sizes vary.
      const obstacles = rendered.map((r) => ({
        x: r.px.x - MARGIN.left,
        y: r.px.y - MARGIN.top,
        r: radiusFor(r.pt.idx),
      }));
      // Allow labels to land up to LABEL_OUTSIDE_PAD pixels into the
      // outer chart margin where there are no data points to collide
      // with. Bounds origin can be negative — that's how a label
      // legitimately sits *above* the inner plot frame.
      const labelBounds = {
        x: -LABEL_OUTSIDE_PAD,
        y: -LABEL_OUTSIDE_PAD,
        w: w + LABEL_OUTSIDE_PAD * 2,
        h: h + LABEL_OUTSIDE_PAD * 2,
      };
      const placed = layoutLabels(inputs, obstacles, labelBounds);
      const radii = pickedRenders.map((r) => radiusFor(r.pt.idx));
      return { labels: placed, radii };
    }, [
      showLabels,
      topNUp,
      topNDown,
      points,
      rendered,
      fcCutoff,
      pCutoff,
      pFloor,
      labelFontSize,
      pointRadius,
      manualSelection,
      colorByIdx,
      radiusByIdx,
      w,
      h,
    ]);
    const labels = labelLayout.labels;
    const labelRadii = labelLayout.radii;

    // Reference-line coordinates: vertical at ±fcCutoff (in x-axis units),
    // horizontal at -log10(pCutoff) (in y-axis units). Only drawn when
    // they fall inside the visible range — a manual axis range that
    // excludes the cutoff shouldn't paint a line on the frame itself.
    const refXLeft = -fcCutoff;
    const refXRight = fcCutoff;
    const refY = -Math.log10(pCutoff);

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VBW} ${VBH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g id="background">
          <rect x={0} y={0} width={VBW} height={VBH} fill={plotBg || "#fff"} />
        </g>
        <g id="plot-area-background">
          <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} fill={plotBg || "#fff"} />
        </g>

        {/* ── Grid + axes ───────────────────────────────────────────────
             Axes (line + ticks + tick labels) are rendered unconditionally,
             matching the scatter / lineplot idiom — a chart without ticks
             isn't useful, so the toggle on the sidebar gates only the
             background grid. Tick text uses sans-serif (not the monospace
             we use elsewhere) so digits land on the same baseline as
             scatter / lineplot exports. */}
        {showAxes && (
          <g id="grid">
            {xTicks.map((t, i) => (
              <line
                key={`gx-${i}`}
                x1={sx(t)}
                x2={sx(t)}
                y1={MARGIN.top}
                y2={MARGIN.top + h}
                stroke="#e5e5e5"
                strokeWidth="0.6"
              />
            ))}
            {yTicks.map((t, i) => (
              <line
                key={`gy-${i}`}
                x1={MARGIN.left}
                x2={MARGIN.left + w}
                y1={sy(t)}
                y2={sy(t)}
                stroke="#e5e5e5"
                strokeWidth="0.6"
              />
            ))}
          </g>
        )}

        <g id="axis-x">
          {xTicks.map((t) => (
            <g key={`tx-${t}`}>
              <line
                x1={sx(t)}
                x2={sx(t)}
                y1={MARGIN.top + h}
                y2={MARGIN.top + h + 5}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={sx(t)}
                y={MARGIN.top + h + 18}
                textAnchor="middle"
                fontSize="11"
                fill="#555"
                fontFamily="sans-serif"
              >
                {fmtTick(t)}
              </text>
            </g>
          ))}
        </g>
        <g id="axis-y">
          {yTicks.map((t) => (
            <g key={`ty-${t}`}>
              <line
                x1={MARGIN.left - 5}
                x2={MARGIN.left}
                y1={sy(t)}
                y2={sy(t)}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 8}
                y={sy(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#555"
                fontFamily="sans-serif"
              >
                {fmtTick(t)}
              </text>
            </g>
          ))}
        </g>

        <g id="x-axis-label">
          <text
            x={MARGIN.left + w / 2}
            y={VBH - 14}
            textAnchor="middle"
            fontSize="13"
            fill="#222"
            fontFamily="ui-monospace, Menlo, monospace"
          >
            {xLabel}
          </text>
        </g>
        <g id="y-axis-label">
          <text
            x={20}
            y={MARGIN.top + h / 2}
            textAnchor="middle"
            fontSize="13"
            fill="#222"
            fontFamily="ui-monospace, Menlo, monospace"
            transform={`rotate(-90, 20, ${MARGIN.top + h / 2})`}
          >
            {yLabel}
          </text>
        </g>

        {title && (
          <g id="title">
            <text
              x={MARGIN.left + w / 2}
              y={18}
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill="#222"
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {title}
            </text>
          </g>
        )}
        {subtitle && (
          <g id="subtitle">
            <text
              x={MARGIN.left + w / 2}
              y={VBH - 30}
              textAnchor="middle"
              fontSize="11"
              fill="#666"
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {subtitle}
            </text>
          </g>
        )}

        {/* ── Reference lines ─────────────────────────────────────────── */}
        {showRefLines && (
          <g id="reference-lines">
            {refXLeft >= xMin && refXLeft <= xMax && (
              <line
                x1={sx(refXLeft)}
                x2={sx(refXLeft)}
                y1={MARGIN.top}
                y2={MARGIN.top + h}
                stroke="#888"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}
            {refXRight >= xMin && refXRight <= xMax && (
              <line
                x1={sx(refXRight)}
                x2={sx(refXRight)}
                y1={MARGIN.top}
                y2={MARGIN.top + h}
                stroke="#888"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}
            {refY >= yMin && refY <= yMax && (
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + w}
                y1={sy(refY)}
                y2={sy(refY)}
                stroke="#888"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}
          </g>
        )}

        {/* ── Data points (grouped by class for SVG-export clarity) ───
             Each circle is clickable: a click toggles the point's
             original-row index in the parent's manualSelection set.
             cursor: pointer surfaces the affordance; the title tag
             gets a "(click to label)" hint so the gesture is
             discoverable on hover. Per-point fill / radius come from
             the optional aesthetic-mapping props (colorByIdx /
             radiusByIdx) — falls back to the class palette + uniform
             radius when no mapping is active. */}
        <g id="data-points">
          {(["ns", "down", "up"] as VolcanoClass[]).map((cls) => (
            <g key={cls} id={`points-${cls}`} fillOpacity={pointAlpha}>
              {rendered
                .filter((r) => r.cls === cls)
                .map((r, i) => (
                  <circle
                    key={i}
                    cx={r.px.x}
                    cy={r.px.y}
                    r={radiusFor(r.pt.idx)}
                    fill={fillFor(r.pt.idx, cls)}
                    style={onPointClick ? { cursor: "pointer" } : undefined}
                    onClick={
                      onPointClick
                        ? (e) => {
                            e.stopPropagation();
                            onPointClick(r.pt.idx);
                          }
                        : undefined
                    }
                  >
                    <title>
                      {(r.pt.label ? r.pt.label + " · " : "") +
                        "log2FC=" +
                        r.pt.log2fc.toFixed(3) +
                        ", p=" +
                        (r.pt.p === 0 ? "0 (clamped)" : r.pt.p.toExponential(2)) +
                        ", " +
                        cls +
                        (onPointClick ? " — click to label" : "")}
                    </title>
                  </circle>
                ))}
            </g>
          ))}
        </g>

        {/* ── Selected-point rings ──────────────────────────────────────
             Every labelled point gets an outer black ring so the user
             can spot the labelled features without tracing the leader
             line first. Rendered as a separate group so SVG-export
             readers can disable them independently. */}
        {showLabels && labels.length > 0 && (
          <g id="selected-point-rings">
            {labels.map((lab, i) => (
              <circle
                key={i}
                cx={MARGIN.left + lab.pointPx.x}
                cy={MARGIN.top + lab.pointPx.y}
                r={(labelRadii[i] || pointRadius) + SELECTION_RING_PAD}
                fill="none"
                stroke="#222"
                strokeWidth="1.4"
              />
            ))}
          </g>
        )}

        {/* ── Top-N leader lines + labels ───────────────────────────────
             A dashed grey leader runs from each labelled point's edge to
             the closest edge of its label bbox, deliberately routed
             around other data points by `layoutLabels`. Labels render
             above the leaders, centre-anchored. `forced=true` labels
             (the layout couldn't satisfy all constraints) get a slightly
             stronger leader stroke so the user can see they're worth a
             second look. */}
        {showLabels && labels.length > 0 && (
          <g id="top-n-leaders">
            {labels.map((lab, i) => (
              <line
                key={i}
                x1={MARGIN.left + lab.leaderStart.x}
                y1={MARGIN.top + lab.leaderStart.y}
                x2={MARGIN.left + lab.leaderEnd.x}
                y2={MARGIN.top + lab.leaderEnd.y}
                stroke="#666"
                strokeWidth={lab.forced ? "1" : "0.7"}
                strokeDasharray="3 2"
              />
            ))}
          </g>
        )}
        {showLabels && labels.length > 0 && (
          <g id="top-n-labels">
            {labels.map((lab, i) => (
              <text
                key={i}
                x={MARGIN.left + lab.textPx.x}
                y={MARGIN.top + lab.textPx.y}
                textAnchor="middle"
                fontSize={labelFontSize}
                fill="#222"
                fontFamily="ui-monospace, Menlo, monospace"
              >
                {lab.text}
              </text>
            ))}
          </g>
        )}

        {/* ── Plot frame on top so the points don't bleed visually ──── */}
        <g id="plot-frame">
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={w}
            height={h}
            fill="none"
            stroke="#333"
            strokeWidth="1"
          />
        </g>
      </svg>
    );
  }
);

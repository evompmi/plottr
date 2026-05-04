// VolcanoChart — SVG renderer for volcano plots.
//
// Pure render component (forwardRef so the parent can grab the SVG node
// for download). All layout / classification / labelling is delegated to
// `./chart-layout.ts` (axis ranges, point classification, label
// placement, per-point fill / radius resolvers); aesthetic legends live
// in `./chart-legends.tsx`. This file is the slim orchestrator that
// composes them and emits SVG primitives in named groups (so Inkscape
// users can hand-edit the export).
//
// The standard ambient globals (React, makeTicks, svgSafeId) come from
// tools/shared.bundle.js — same pattern as every other plot tool.

import { VolcanoPoint, VolcanoClass, ColorMap, SizeMap } from "./helpers";
import {
  DEFAULT_VBW,
  VBH,
  MARGIN,
  SELECTION_RING_PAD,
  LEGEND_W,
  LEGEND_GAP,
  fmtTick,
  computeAxisRanges,
  buildRenderedPoints,
  buildLabelLayout,
  makeFillFor,
  makeRadiusFor,
} from "./chart-layout";
import { ColorLegend, SizeLegend } from "./chart-legends";

// Re-export a few constants the rest of the volcano tool reaches for
// (reports.ts uses MARGIN; index.tsx uses DEFAULT_VBW for the slider's
// initial / reset value). Keeps the import surface unchanged after the
// chart-layout split.
export { DEFAULT_VBW, VBH, MARGIN } from "./chart-layout";

const { forwardRef, useMemo } = React;

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
  // carry their own metadata so the chart can render an in-SVG legend
  // (which then rides along on every PNG / SVG export — the whole point
  // of putting it in the SVG rather than in the React sidebar).
  // ColorMap carries vmin / vmax (continuous) or a legend list
  // (discrete); SizeMap carries vmin / vmax / minR / maxR for the
  // sample-circle legend.
  colorMap?: ColorMap;
  colorMapLabel?: string; // header name of the column being mapped
  sizeMap?: SizeMap | null;
  sizeMapLabel?: string;
  // Override the SVG viewBox width. Falls back to DEFAULT_VBW (800) when
  // undefined. Sliding this in the Style tile widens the inner data
  // area, which is especially useful when an aesthetic legend is active
  // and the user wants the data plot to keep its breathing room.
  plotWidth?: number;
  plotBg: string;
}

export const VolcanoChart = forwardRef<SVGSVGElement, VolcanoChartProps>(function VolcanoChart(
  props: any,
  ref: any
) {
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
    colorMap,
    colorMapLabel,
    sizeMap,
    sizeMapLabel,
    plotWidth,
    plotBg,
  } = props;

  const VBW = plotWidth && plotWidth > 0 ? plotWidth : DEFAULT_VBW;
  const fillFor = makeFillFor(colors, colorMap);
  const radiusFor = makeRadiusFor(pointRadius, sizeMap);

  // Reserve right-side space for the in-SVG legend column when any
  // aesthetic mapping is active. Inner plot width shrinks to fit.
  const hasLegend = !!colorMap || !!sizeMap;
  const legendW = hasLegend ? LEGEND_W : 0;
  const w = VBW - MARGIN.left - MARGIN.right - legendW;
  const h = VBH - MARGIN.top - MARGIN.bottom;

  const { xMin, xMax, yMin, yMax } = useMemo(
    () =>
      computeAxisRanges(points, pFloor, fcCutoff, pCutoff, userXMin, userXMax, userYMin, userYMax),
    [points, pFloor, fcCutoff, pCutoff, userXMin, userXMax, userYMin, userYMax]
  );

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = (v: number) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);

  const rendered = useMemo(
    () => buildRenderedPoints(points, pFloor, fcCutoff, pCutoff, sx, sy),
    // `w` / `h` flow into `sx` / `sy` (the closures that produce each
    // point's pixel coords); when the legend column reserves space and
    // shrinks `w`, the rendered points must reflow with it. Listing
    // xMin/xMax/yMin/yMax/w/h captures every input that mutates `sx` /
    // `sy`; eslint can't see through the closure so silence the rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, pFloor, fcCutoff, pCutoff, xMin, xMax, yMin, yMax, w, h]
  );

  const labelLayout = useMemo(
    () =>
      buildLabelLayout({
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
        radiusFor,
        w,
        h,
      }),
    // `radiusFor` is a fresh closure each render but only reads sizeMap
    // + pointRadius — both already listed via colorMap / sizeMap deps —
    // so the memo invalidates correctly without re-firing every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
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
      colorMap,
      sizeMap,
      w,
      h,
    ]
  );
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
          {xTicks.map((t: any, i: number) => (
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
          {yTicks.map((t: any, i: number) => (
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
        {xTicks.map((t: any) => (
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
        {yTicks.map((t: any) => (
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
             cursor: pointer surfaces the affordance; the title tag gets
             a "(click to label)" hint so the gesture is discoverable on
             hover. Per-point fill / radius come from the optional
             aesthetic-mapping props (colorByIdx / radiusByIdx) — falls
             back to the class palette + uniform radius when no mapping
             is active. */}
      <g id="data-points">
        {(["ns", "down", "up"] as VolcanoClass[]).map((cls: any) => (
          <g key={cls} id={`points-${cls}`} fillOpacity={pointAlpha}>
            {rendered
              .filter((r: any) => r.cls === cls)
              .map((r: any, i: number) => (
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
          {labels.map((lab: any, i: number) => (
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
          {labels.map((lab: any, i: number) => (
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
          {labels.map((lab: any, i: number) => (
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

      {/* ── Aesthetic legends ──────────────────────────────────────────
             Stacked vertically in the right-margin column reserved by
             `legendW`: Color first (continuous: gradient strip + endpoint
             labels; discrete: swatch / label rows, capped at 14 visible),
             Size below (sample circles at nice tick values with their
             data values). Both sections only render when the matching
             mapping is active. */}
      {hasLegend && (
        <g
          id="aesthetic-legends"
          transform={`translate(${MARGIN.left + w + LEGEND_GAP}, ${MARGIN.top})`}
        >
          {colorMap && (
            <ColorLegend
              colorMap={colorMap}
              title={colorMapLabel || "color"}
              width={LEGEND_W - LEGEND_GAP}
              yOffset={0}
            />
          )}
          {sizeMap && (
            <SizeLegend
              sizeMap={sizeMap}
              title={sizeMapLabel || "size"}
              width={LEGEND_W - LEGEND_GAP}
              yOffset={
                colorMap
                  ? colorMap.type === "continuous"
                    ? 78
                    : Math.min(14, colorMap.legend.length) * 14 + 28
                  : 0
              }
            />
          )}
        </g>
      )}
    </svg>
  );
});

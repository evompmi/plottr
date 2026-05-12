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

import { VolcanoClass, summarize } from "./helpers";
import type { VolcanoChartProps } from "./helpers";
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

const { forwardRef, useMemo, useEffect, useRef } = React;

// Above this many visible points, the data layer rasterises to an
// off-screen canvas + a single PNG `<image>` per class instead of N
// individual `<circle>` elements. Below the threshold we keep SVG
// circles so small-N exports stay crisp and per-point `<title>` tooltips
// keep working. 2,000 was picked from the 2026-05-12 perf spike (see
// `docs/perf-spike-2026-05-12.md`): at 20,000 points the SVG path took
// ~1.2 s + ~10 MB of markup; the canvas path drops both by ~10–50×.
const POINT_RASTERIZE_THRESHOLD = 2000;

// `VolcanoChartProps` is the type-canonical home in helpers.ts; this
// file imports it so chart-internal consumers (e.g. tests stubbing
// chart props) and chart-external callers reach for the same type.
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
      colorMap,
      colorMapLabel,
      sizeMap,
      sizeMapLabel,
      plotWidth,
      plotBg,
      onLabelLayoutInfo,
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
        computeAxisRanges(
          points,
          pFloor,
          fcCutoff,
          pCutoff,
          userXMin,
          userXMax,
          userYMin,
          userYMax
        ),
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

    // Surface the layout's forced/attempted counts to the controls UI
    // (one render lag — fires after the chart commits, controls warning
    // updates on the next render). The data-density signal is the actual
    // layout outcome, not a heuristic; if the user lowers top-N enough
    // that every requested label places cleanly, forcedCount drops to 0
    // and the warning disappears.
    useEffect(() => {
      if (!onLabelLayoutInfo) return;
      onLabelLayoutInfo({
        forcedCount: labelLayout.forcedCount,
        attemptedCount: labelLayout.attemptedCount,
      });
    }, [onLabelLayoutInfo, labelLayout.forcedCount, labelLayout.attemptedCount]);

    // Reference-line coordinates: vertical at ±fcCutoff (in x-axis units),
    // horizontal at -log10(pCutoff) (in y-axis units). Only drawn when
    // they fall inside the visible range — a manual axis range that
    // excludes the cutoff shouldn't paint a line on the frame itself.
    const refXLeft = -fcCutoff;
    const refXRight = fcCutoff;
    const refY = -Math.log10(pCutoff);

    const summary = useMemo(
      () => summarize(points, fcCutoff, pCutoff),
      [points, fcCutoff, pCutoff]
    );

    // ── Canvas-rasterised data layer (large N) ────────────────────────
    // Above POINT_RASTERIZE_THRESHOLD, paint each significance class to
    // an off-screen canvas and ship the result as a single PNG `<image>`
    // per class. Same pattern as the heatmap v1.4.0 cell-grid migration.
    // The exported SVG embeds the data URLs literally, so the rasterised
    // points survive into downloaded `.svg` files unchanged.
    const useRasterize = rendered.length >= POINT_RASTERIZE_THRESHOLD;
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    if (canvasRef.current === null && typeof document !== "undefined") {
      canvasRef.current = document.createElement("canvas");
    }
    const pointsImageHref = useMemo(
      () => {
        if (!useRasterize) return "";
        const canvas = canvasRef.current;
        if (!canvas) return "";
        const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
        canvas.width = Math.max(1, Math.round(VBW * dpr));
        canvas.height = Math.max(1, Math.round(VBH * dpr));
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, VBW, VBH);
        ctx.globalAlpha = pointAlpha;
        // Paint class-by-class so the canvas preserves the SVG z-order
        // (`up` points draw on top of `down` on top of `ns`, matching
        // the per-class `<g>` order in the non-raster path). One
        // canvas, one `toDataURL` — three was the bottleneck pre-fix.
        for (const cls of ["ns", "down", "up"] as VolcanoClass[]) {
          for (const r of rendered) {
            if (r.cls !== cls) continue;
            ctx.fillStyle = fillFor(r.pt.idx, cls);
            ctx.beginPath();
            ctx.arc(r.px.x, r.px.y, radiusFor(r.pt.idx), 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        return canvas.toDataURL("image/png");
      },
      // The fillFor / radiusFor closures are recreated each render but
      // only read colors / colorMap / pointRadius / sizeMap (already
      // listed). Same constraint as the existing labelLayout memo above;
      // listing the closures themselves would re-fire on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [useRasterize, rendered, pointAlpha, VBW, colors, colorMap, pointRadius, sizeMap]
    );

    // Hit testing for the rasterised path: a transparent overlay rect
    // covers the data area and finds the nearest point on click. Uses
    // the same `rendered` records the canvas paints from, so the click
    // target matches what the user sees pixel-for-pixel.
    const handleRasterClick = (e: React.MouseEvent<SVGRectElement>) => {
      if (!onPointClick) return;
      e.stopPropagation();
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const screenCTM = svg.getScreenCTM();
      if (!screenCTM) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(screenCTM.inverse());
      let bestD2 = Infinity;
      let bestIdx = -1;
      let bestRadius = 0;
      for (const r of rendered) {
        const dx = r.px.x - local.x;
        const dy = r.px.y - local.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = r.pt.idx;
          bestRadius = radiusFor(r.pt.idx);
        }
      }
      // Generous click radius: the canvas-painted disc + a few px of
      // forgiveness, since the user can't see anti-aliasing edges.
      const tol = bestRadius + 4;
      if (bestIdx >= 0 && bestD2 <= tol * tol) onPointClick(bestIdx);
    };

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VBW} ${VBH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title || "Volcano plot"}
      >
        <title>{title || "Volcano plot"}</title>
        <desc>{`Volcano plot of ${summary.total} point${summary.total !== 1 ? "s" : ""}: ${summary.up} up, ${summary.down} down, ${summary.ns} not significant${summary.discarded > 0 ? `, ${summary.discarded} discarded` : ""}`}</desc>
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
             cursor: pointer surfaces the affordance; the title tag gets
             a "(click to label)" hint so the gesture is discoverable on
             hover. Per-point fill / radius come from the optional
             aesthetic-mapping props (colorByIdx / radiusByIdx) — falls
             back to the class palette + uniform radius when no mapping
             is active. */}
        <g
          id="data-points"
          aria-label={`${summary.total} point${summary.total !== 1 ? "s" : ""} total`}
        >
          {useRasterize ? (
            <>
              {/* Single canvas-rasterised PNG of every point. Painted
                   class-by-class for z-order, but exported as one image
                   to keep the canvas → dataURL pass single-shot. */}
              {pointsImageHref && (
                <image
                  x={0}
                  y={0}
                  width={VBW}
                  height={VBH}
                  href={pointsImageHref}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                />
              )}
              {/* Empty per-class groups keep the SVG document structure
                   stable for screen-readers + downstream Inkscape users
                   even though the visible content lives in the image. */}
              {(["ns", "down", "up"] as VolcanoClass[]).map((cls) => {
                const count =
                  cls === "up" ? summary.up : cls === "down" ? summary.down : summary.ns;
                const classLabel =
                  cls === "up"
                    ? "upregulated"
                    : cls === "down"
                      ? "downregulated"
                      : "not significant";
                return (
                  <g
                    key={cls}
                    id={`points-${cls}`}
                    aria-label={`${count} ${classLabel} point${count !== 1 ? "s" : ""}`}
                  />
                );
              })}
              {onPointClick && (
                <rect
                  x={MARGIN.left}
                  y={MARGIN.top}
                  width={w}
                  height={h}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={handleRasterClick}
                  aria-hidden="true"
                />
              )}
            </>
          ) : (
            (["ns", "down", "up"] as VolcanoClass[]).map((cls) => {
              const count = cls === "up" ? summary.up : cls === "down" ? summary.down : summary.ns;
              const classLabel =
                cls === "up" ? "upregulated" : cls === "down" ? "downregulated" : "not significant";
              return (
                <g
                  key={cls}
                  id={`points-${cls}`}
                  fillOpacity={pointAlpha}
                  aria-label={`${count} ${classLabel} point${count !== 1 ? "s" : ""}`}
                >
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
              );
            })
          )}
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
  }
);

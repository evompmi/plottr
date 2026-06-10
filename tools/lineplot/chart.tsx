// lineplot/chart.tsx — Line / profile plot SVG renderer. Pure render code;
// consumes computed series + per-x stats from the parent App. Layout
// constants and pure helpers (computeSeries, computePerXStats, buildLineD)
// live in tools/lineplot/helpers.ts.

import { MARGIN as BASE_MARGIN, STAR_ROW_H, buildLineD, ChartProps, SeriesPoint } from "./helpers";
import { computeLegendHeight, renderSvgLegend } from "../_shell";
import type { LegendBlock } from "../_shell";
import { makeTicks } from "../_core/scale";
import { valueAxisLeftMargin } from "../_shell/chart-layout";
import { pStars } from "../_core/stats/format";
import { svgSafeId } from "../_core/svg-export";
import { tt } from "./i18n";
const { forwardRef, memo } = React;

export const Chart = memo(
  forwardRef<SVGSVGElement, ChartProps>(function Chart(
    {
      series,
      perXStats,
      xMin,
      xMax,
      yMin,
      yMax,
      vbW,
      vbH,
      xLabel,
      yLabel,
      plotTitle,
      plotSubtitle,
      plotBg,
      showGrid,
      gridColor,
      lineWidth,
      pointRadius,
      errorStrokeWidth,
      errorCapWidth,
      tickFontSize,
      errorType,
      svgLegend,
      showStars,
    },
    ref
  ) {
    // Grow the left margin so wide y-tick numbers or a larger tick font never
    // collide with the rotated y-axis label.
    const MARGIN = {
      ...BASE_MARGIN,
      left: valueAxisLeftMargin(
        BASE_MARGIN.left,
        makeTicks(yMin, yMax, 6).map((t) => (t % 1 === 0 ? t : t.toFixed(1))),
        tickFontSize
      ),
    };
    const itemW = (b: LegendBlock): number => {
      const maxLen = Math.max(0, ...(b.items || []).map((i) => (i.label || "").length));
      return Math.max(110, maxLen * 6 + 28);
    };
    const legendH = computeLegendHeight(svgLegend, vbW - MARGIN.left - MARGIN.right, itemW);
    const topPad = (plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0);
    const starRowH = showStars && perXStats.some((r) => r.pAdj != null) ? STAR_ROW_H : 0;

    const w = vbW - MARGIN.left - MARGIN.right;
    const h = vbH - MARGIN.top - MARGIN.bottom;
    const innerTop = MARGIN.top + starRowH;
    const innerH = h - starRowH;
    // Larger tick fonts grow upward into the axis line; nudge the x-tick
    // baseline down by the extra ascent (0 at the 11 px default).
    const xTickDy = Math.max(0, (tickFontSize - 11) * 0.8);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * w;
    const sy = (v: number) => innerTop + (1 - (v - yMin) / yRange) * innerH;
    const clampY = (v: number) => Math.max(yMin, Math.min(yMax, v));

    const xTicks = makeTicks(xMin, xMax, 8);
    const yTicks = makeTicks(yMin, yMax, 6);

    // errorType === "none" returns null so the render loop's
    // `!e || !Number.isFinite(e)` guard skips the bar entirely.
    const errOf = (p: SeriesPoint): number | null =>
      errorType === "none"
        ? null
        : errorType === "sd"
          ? p.sd
          : errorType === "ci95"
            ? p.ci95
            : p.sem;

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${vbW} ${vbH + legendH + topPad}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={plotTitle || tt("lineplot.chart.fallbackTitle")}
      >
        <title>{plotTitle || tt("lineplot.chart.fallbackTitle")}</title>
        <desc>{`Line chart with ${series.length} group${series.length === 1 ? "" : "s"}`}</desc>
        <g id="background">
          <rect x={0} y={0} width={vbW} height={vbH + legendH + topPad} fill={plotBg || "#fff"} />
        </g>
        {plotTitle && (
          <g id="title">
            <text
              x={vbW / 2}
              y={17}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill="#222"
              fontFamily="sans-serif"
            >
              {plotTitle}
            </text>
          </g>
        )}
        {plotSubtitle && (
          <g id="subtitle">
            <text
              x={vbW / 2}
              y={plotTitle ? 34 : 17}
              textAnchor="middle"
              fontSize="12"
              fill="#888"
              fontFamily="sans-serif"
            >
              {plotSubtitle}
            </text>
          </g>
        )}
        <g id="chart" transform={`translate(0, ${topPad})`}>
          <rect
            id="plot-area-background"
            x={MARGIN.left}
            y={MARGIN.top}
            width={w}
            height={h}
            fill={plotBg || "#fff"}
          />
          {showGrid && (
            <g id="grid">
              {yTicks.map((t) => (
                <line
                  key={`gy-${t}`}
                  x1={MARGIN.left}
                  x2={MARGIN.left + w}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke={gridColor || "#e0e0e0"}
                  strokeWidth="0.5"
                />
              ))}
              {xTicks.map((t) => (
                <line
                  key={`gx-${t}`}
                  x1={sx(t)}
                  x2={sx(t)}
                  y1={innerTop}
                  y2={innerTop + innerH}
                  stroke={gridColor || "#e0e0e0"}
                  strokeWidth="0.5"
                />
              ))}
            </g>
          )}
          <g id="traces">
            {series.map((s) => {
              const linePts = s.points.map((p) => ({
                x: sx(p.x),
                y: p.mean != null ? sy(p.mean) : null,
              }));
              const d = buildLineD(linePts);
              if (!d) return null;
              return (
                <path
                  key={`line-${s.name}`}
                  id={`trace-${svgSafeId(s.name)}`}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={lineWidth}
                  role="img"
                  aria-label={tt("lineplot.chart.traceAria", {
                    name: s.name,
                    n: s.points.length,
                    count: s.points.length,
                  })}
                />
              );
            })}
          </g>
          <g id="error-bars">
            {series.map((s) => (
              <g key={`errs-${s.name}`} id={`errbars-${svgSafeId(s.name)}`}>
                {s.points.map((p, pi) => {
                  if (p.n < 2 || p.mean == null) return null;
                  const e = errOf(p);
                  if (!e || !Number.isFinite(e)) return null;
                  const cx = sx(p.x);
                  const yHi = sy(clampY(p.mean + e));
                  const yLo = sy(clampY(p.mean - e));
                  const cap = errorCapWidth / 2;
                  return (
                    <g key={`err-${pi}`}>
                      <line
                        x1={cx}
                        x2={cx}
                        y1={yHi}
                        y2={yLo}
                        stroke={s.color}
                        strokeWidth={errorStrokeWidth}
                      />
                      <line
                        x1={cx - cap}
                        x2={cx + cap}
                        y1={yHi}
                        y2={yHi}
                        stroke={s.color}
                        strokeWidth={errorStrokeWidth}
                      />
                      <line
                        x1={cx - cap}
                        x2={cx + cap}
                        y1={yLo}
                        y2={yLo}
                        stroke={s.color}
                        strokeWidth={errorStrokeWidth}
                      />
                    </g>
                  );
                })}
              </g>
            ))}
          </g>
          <g id="data-points">
            {series.map((s) => (
              <g key={`pts-${s.name}`} id={`points-${svgSafeId(s.name)}`}>
                {s.points.map((p, pi) =>
                  p.mean == null ? null : (
                    <circle
                      key={`pt-${pi}`}
                      cx={sx(p.x)}
                      cy={sy(p.mean)}
                      r={pointRadius}
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth="0.5"
                    />
                  )
                )}
              </g>
            ))}
          </g>
          {showStars && starRowH > 0 && (
            <g id="significance-stars">
              {perXStats.map((r, i) => {
                if (r.pAdj == null) return null;
                const s = pStars(r.pAdj);
                if (!s || s === "ns") return null;
                return (
                  <text
                    key={`star-${i}`}
                    x={sx(r.x)}
                    y={MARGIN.top + 14}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill="#222"
                    fontFamily="sans-serif"
                  >
                    {s}
                  </text>
                );
              })}
            </g>
          )}
          <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
            <line x1={MARGIN.left} y1={innerTop} x2={MARGIN.left + w} y2={innerTop} />
            <line x1={MARGIN.left + w} y1={innerTop} x2={MARGIN.left + w} y2={innerTop + innerH} />
            <line
              x1={MARGIN.left}
              y1={innerTop + innerH}
              x2={MARGIN.left + w}
              y2={innerTop + innerH}
            />
            <line x1={MARGIN.left} y1={innerTop} x2={MARGIN.left} y2={innerTop + innerH} />
          </g>
          <g id="axis-x">
            {xTicks.map((t) => (
              <g key={t}>
                <line
                  x1={sx(t)}
                  x2={sx(t)}
                  y1={innerTop + innerH}
                  y2={innerTop + innerH + 5}
                  stroke="#333"
                  strokeWidth="1"
                />
                <text
                  x={sx(t)}
                  y={innerTop + innerH + 18 + xTickDy}
                  textAnchor="middle"
                  fontSize={tickFontSize}
                  fill="#555"
                  fontFamily="sans-serif"
                >
                  {t}
                </text>
              </g>
            ))}
          </g>
          <g id="axis-y">
            {yTicks.map((t) => (
              <g key={t}>
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
                  fontSize={tickFontSize}
                  fill="#555"
                  fontFamily="sans-serif"
                >
                  {t % 1 === 0 ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
          </g>
          {xLabel && (
            <g id="x-axis-label">
              <text
                x={MARGIN.left + w / 2}
                y={vbH - 4}
                textAnchor="middle"
                fontSize="13"
                fill="#444"
                fontFamily="sans-serif"
              >
                {xLabel}
              </text>
            </g>
          )}
          {yLabel && (
            <g id="y-axis-label">
              <text
                transform={`translate(14,${innerTop + innerH / 2}) rotate(-90)`}
                textAnchor="middle"
                fontSize="13"
                fill="#444"
                fontFamily="sans-serif"
              >
                {yLabel}
              </text>
            </g>
          )}
          {renderSvgLegend(
            svgLegend,
            vbH + 10,
            MARGIN.left,
            vbW - MARGIN.left - MARGIN.right,
            itemW,
            14
          )}
        </g>
      </svg>
    );
  })
);

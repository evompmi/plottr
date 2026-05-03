// lineplot/chart.tsx — Line / profile plot SVG renderer. Pure render code;
// consumes computed series + per-x stats from the parent App. Layout
// constants and pure helpers (computeSeries, computePerXStats, buildLineD)
// live in tools/lineplot/helpers.ts.

import { MARGIN, STAR_ROW_H, buildLineD } from "./helpers";

const { forwardRef } = React;

export const Chart = forwardRef<SVGSVGElement, any>(function Chart(
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
    errorType,
    svgLegend,
    showStars,
  },
  ref
) {
  const itemW = (b: any) => {
    const maxLen = Math.max(0, ...(b.items || []).map((i: any) => (i.label || "").length));
    return Math.max(110, maxLen * 6 + 28);
  };
  const legendH = computeLegendHeight(svgLegend, vbW - MARGIN.left - MARGIN.right, itemW);
  const topPad = (plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0);
  const starRowH = showStars && perXStats.some((r: any) => r.pAdj != null) ? STAR_ROW_H : 0;

  const w = vbW - MARGIN.left - MARGIN.right;
  const h = vbH - MARGIN.top - MARGIN.bottom;
  const innerTop = MARGIN.top + starRowH;
  const innerH = h - starRowH;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = (v: number) => innerTop + (1 - (v - yMin) / yRange) * innerH;
  const clampY = (v: number) => Math.max(yMin, Math.min(yMax, v));

  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);

  // errorType === "none" returns null so the render loop's
  // `!e || !Number.isFinite(e)` guard skips the bar entirely.
  const errOf = (p: any) =>
    errorType === "none" ? null : errorType === "sd" ? p.sd : errorType === "ci95" ? p.ci95 : p.sem;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${vbW} ${vbH + legendH + topPad}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Line chart"}
    >
      <title>{plotTitle || "Line chart"}</title>
      <desc>{`Line chart with ${series.length} group${series.length === 1 ? "" : "s"}`}</desc>
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
          {series.map((s: any) => {
            const linePts = s.points.map((p: any) => ({
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
              />
            );
          })}
        </g>
        <g id="error-bars">
          {series.map((s: any) => (
            <g key={`errs-${s.name}`} id={`errbars-${svgSafeId(s.name)}`}>
              {s.points.map((p: any, pi: number) => {
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
          {series.map((s: any) => (
            <g key={`pts-${s.name}`} id={`points-${svgSafeId(s.name)}`}>
              {s.points.map((p: any, pi: number) =>
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
            {perXStats.map((r: any, i: number) => {
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
                y={innerTop + innerH + 18}
                textAnchor="middle"
                fontSize="11"
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
                fontSize="11"
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
        {renderSvgLegend(svgLegend, vbH + 10, MARGIN.left, vbW - MARGIN.left - MARGIN.right, itemW)}
      </g>
    </svg>
  );
});

// doseresponse/chart.tsx — DoseResponseChart forwardRef SVG renderer.
// Per-condition curves (with translucent CI ribbons), per-condition data
// points, optional residuals diagnostic strip below the main panel, and an
// optional in-SVG parameter table for slide-ready exports. Hex literals
// throughout (chart-internal styling); chrome around the chart uses var(--*)
// CSS variables in plot-area.tsx.

import {
  CURVE_DASH,
  CURVE_MARKER,
  CurveMarker,
  ChartProps,
  ConditionFit,
  FitParams,
  MARGIN,
  RESIDUAL_STRIP_GAP,
  RESIDUAL_STRIP_H,
  VBH,
  VBW,
  buildXGrid,
  curveBand,
  fmtEC50,
  fmtNum,
  formatLogTick,
  fourPL,
  logTickRange,
} from "./helpers";
import { computeLegendHeight, renderSvgLegend } from "../_shell";
import type { LegendBlock } from "../_shell";
const { forwardRef } = React;

const POINT_STROKE = "#000000";
const FRAME_COLOR = "#333333";
const TICK_TEXT = "#555555";
const AXIS_LABEL = "#444444";
const RESIDUAL_BASELINE = "#aaaaaa";

function renderPoint(
  shape: CurveMarker,
  cx: number,
  cy: number,
  r: number,
  key: string | number,
  fill: string,
  opacity: number,
  stroke: string,
  strokeWidth: number
): React.ReactElement {
  const common = {
    key,
    fill,
    fillOpacity: opacity,
    stroke,
    strokeWidth,
  };
  if (shape === "triangle") {
    const h = r * 1.15;
    const path = `M${cx},${cy - h} L${cx + h},${cy + h * 0.7} L${cx - h},${cy + h * 0.7} Z`;
    return <path d={path} {...common} />;
  }
  if (shape === "square") {
    const s = r * 1.6;
    return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} {...common} />;
  }
  if (shape === "diamond") {
    const h = r * 1.4;
    const path = `M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z`;
    return <path d={path} {...common} />;
  }
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

function buildCurvePath(
  xs: number[],
  ys: number[],
  sx: (v: number) => number,
  sy: (v: number) => number
): string {
  if (xs.length === 0) return "";
  let d = `M${sx(xs[0])},${sy(ys[0])}`;
  for (let i = 1; i < xs.length; i++) d += ` L${sx(xs[i])},${sy(ys[i])}`;
  return d;
}

function buildBandPath(
  grid: { x: number; yLo: number; yHi: number }[],
  sx: (v: number) => number,
  sy: (v: number) => number
): string {
  if (grid.length === 0) return "";
  let d = `M${sx(grid[0].x)},${sy(grid[0].yLo)}`;
  for (let i = 1; i < grid.length; i++) d += ` L${sx(grid[i].x)},${sy(grid[i].yLo)}`;
  for (let i = grid.length - 1; i >= 0; i--) d += ` L${sx(grid[i].x)},${sy(grid[i].yHi)}`;
  d += " Z";
  return d;
}

export const DoseResponseChart = forwardRef<SVGSVGElement, ChartProps>(function DoseResponseChart(
  {
    conditionFits,
    sharedTests,
    xMin,
    xMax,
    yMin,
    yMax,
    xLabel,
    yLabel,
    title,
    plotBg,
    showGrid,
    gridColor,
    showCIBand,
    ciBandOpacity,
    showResidualsStrip,
    showParamTable,
    conditionColors,
    pointSize,
    pointOpacity,
    curveStrokeWidth,
    alpha,
    svgLegend,
  },
  ref
) {
  const w = VBW - MARGIN.left - MARGIN.right;
  const h = VBH - MARGIN.top - MARGIN.bottom;

  const showRes = showResidualsStrip && conditionFits.some((cf) => cf.fit.valid);
  const residTop = VBH + (showRes ? RESIDUAL_STRIP_GAP : 0);
  const residBottom = residTop + (showRes ? RESIDUAL_STRIP_H : 0);

  const conditionsForTable = showParamTable ? conditionFits.filter((cf) => cf.fit.valid) : [];
  const tableHeaderH = 22;
  const tableRowH = 18;
  const tableH =
    conditionsForTable.length > 0 ? tableHeaderH + conditionsForTable.length * tableRowH + 6 : 0;
  const tableTop = residBottom + (tableH > 0 ? 18 : 0);
  const tableBottom = tableTop + tableH;

  const sharedTablePresent = showParamTable && sharedTests.some((t) => !t.failed);
  const sharedRowH = 16;
  const sharedTableH = sharedTablePresent
    ? 18 + sharedTests.filter((t) => !t.failed).length * sharedRowH
    : 0;
  const sharedTop = tableBottom + (sharedTableH > 0 ? 8 : 0);
  const sharedBottom = sharedTop + sharedTableH;

  const legendItemWidth = (block: LegendBlock): number => {
    if (!block.items) return 88;
    const maxLen = block.items.reduce((m: number, it) => Math.max(m, (it.label || "").length), 0);
    return Math.max(88, Math.min(260, maxLen * 6.2 + 22));
  };
  const legendH = computeLegendHeight(svgLegend, w, legendItemWidth);
  const totalH = sharedBottom + (legendH > 0 ? 10 : 0) + legendH;

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v: number): number => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = (v: number): number => MARGIN.top + (1 - (v - yMin) / yRange) * h;

  const xTicks = logTickRange(xMin, xMax);
  const yTicks: number[] = [];
  {
    const niceCount = 6;
    const step = (yMax - yMin) / niceCount;
    for (let i = 0; i <= niceCount; i++) yTicks.push(yMin + i * step);
  }

  // Residual strip layout: shared X scaling with main plot, but its own Y
  // scale centred on 0. Symmetric absolute residual range across all
  // conditions for visual consistency.
  let residMaxAbs = 0;
  if (showRes) {
    for (const cf of conditionFits) {
      if (!cf.fit.valid) continue;
      for (const o of cf.observations) {
        if (o.isZeroDose) continue;
        const yhat = fourPL(o.x, cf.fit.params);
        const r = Math.abs(o.y - yhat);
        if (r > residMaxAbs) residMaxAbs = r;
      }
    }
  }
  if (showRes && residMaxAbs === 0) residMaxAbs = 1;
  const residPad = residMaxAbs * 0.1;
  const residHigh = residMaxAbs + residPad;
  const residSy = (r: number): number =>
    residTop + (1 - (r - -residHigh) / (2 * residHigh)) * RESIDUAL_STRIP_H;

  const xGrid = buildXGrid(xMin, xMax, 220);

  const curves: Array<{
    cf: ConditionFit;
    params: FitParams;
    color: string;
    dash: string;
    marker: CurveMarker;
    band: ReturnType<typeof curveBand>;
  }> = [];
  conditionFits.forEach((cf, idx) => {
    if (!cf.fit.valid) return;
    const color = conditionColors[cf.condition] || "#0072B2";
    curves.push({
      cf,
      params: cf.fit.params,
      color,
      dash: CURVE_DASH[idx % CURVE_DASH.length],
      marker: CURVE_MARKER[idx % CURVE_MARKER.length],
      band: showCIBand ? curveBand(cf.fit, xGrid, alpha) : [],
    });
  });

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VBW} ${totalH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title || "Dose–response plot"}
    >
      <title>{title || "Dose–response plot"}</title>
      <desc>{`Dose–response plot with ${curves.length} fitted curve${curves.length !== 1 ? "s" : ""}.`}</desc>
      <defs>
        <clipPath id="dr-clip-main">
          <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} />
        </clipPath>
        <clipPath id="dr-clip-resid">
          <rect x={MARGIN.left} y={residTop} width={w} height={RESIDUAL_STRIP_H} />
        </clipPath>
      </defs>

      <g id="background">
        <rect x={0} y={0} width={VBW} height={totalH} fill={plotBg || "#ffffff"} />
      </g>
      <g id="plot-area-background">
        <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} fill={plotBg || "#ffffff"} />
      </g>

      {showGrid && (
        <g id="grid">
          {yTicks.map((t, i) => (
            <line
              key={`gy-${i}`}
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
              y1={MARGIN.top}
              y2={MARGIN.top + h}
              stroke={gridColor || "#e0e0e0"}
              strokeWidth="0.5"
            />
          ))}
        </g>
      )}

      {showCIBand && curves.length > 0 && (
        <g id="ci-band" clipPath="url(#dr-clip-main)">
          {curves.map(({ cf, color, band }) =>
            band.length > 0 ? (
              <path
                key={`ciband-${cf.conditionIdx}`}
                d={buildBandPath(band, sx, sy)}
                fill={color}
                fillOpacity={ciBandOpacity}
                stroke="none"
              />
            ) : null
          )}
        </g>
      )}

      {curves.length > 0 && (
        <g id="dose-response-curve" clipPath="url(#dr-clip-main)">
          {curves.map(({ cf, params, color, dash }) => {
            const xs = xGrid;
            const ys = xs.map((x) => fourPL(x, params));
            return (
              <path
                key={`curve-${cf.conditionIdx}`}
                d={buildCurvePath(xs, ys, sx, sy)}
                fill="none"
                stroke={color}
                strokeWidth={curveStrokeWidth}
                strokeDasharray={dash === "none" ? undefined : dash}
              />
            );
          })}
        </g>
      )}

      <g id="data-points" clipPath="url(#dr-clip-main)">
        {conditionFits.map((cf, idx) => {
          const color = conditionColors[cf.condition] || "#0072B2";
          const marker = CURVE_MARKER[idx % CURVE_MARKER.length];
          return (
            <g key={`points-${cf.conditionIdx}`}>
              {cf.observations
                .filter((o) => !o.isZeroDose)
                .map((o, i) =>
                  renderPoint(
                    marker,
                    sx(o.x),
                    sy(o.y),
                    pointSize,
                    `${cf.conditionIdx}-${i}`,
                    color,
                    pointOpacity,
                    POINT_STROKE,
                    1
                  )
                )}
            </g>
          );
        })}
      </g>

      <g id="plot-frame" fill="none" stroke={FRAME_COLOR} strokeWidth="1">
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left + w} y2={MARGIN.top} />
        <line x1={MARGIN.left + w} y1={MARGIN.top} x2={MARGIN.left + w} y2={MARGIN.top + h} />
        <line x1={MARGIN.left} y1={MARGIN.top + h} x2={MARGIN.left + w} y2={MARGIN.top + h} />
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + h} />
      </g>

      <g id="axis-x">
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line
              x1={sx(t)}
              x2={sx(t)}
              y1={MARGIN.top + h}
              y2={MARGIN.top + h + 5}
              stroke={FRAME_COLOR}
              strokeWidth="1"
            />
            <text
              x={sx(t)}
              y={MARGIN.top + h + 18}
              textAnchor="middle"
              fontSize="11"
              fill={TICK_TEXT}
              fontFamily="sans-serif"
            >
              {formatLogTick(t)}
            </text>
          </g>
        ))}
      </g>

      <g id="axis-y">
        {yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={MARGIN.left - 5}
              x2={MARGIN.left}
              y1={sy(t)}
              y2={sy(t)}
              stroke={FRAME_COLOR}
              strokeWidth="1"
            />
            <text
              x={MARGIN.left - 8}
              y={sy(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill={TICK_TEXT}
              fontFamily="sans-serif"
            >
              {fmtNum(t, 3)}
            </text>
          </g>
        ))}
      </g>

      {xLabel && (
        <g id="x-axis-label">
          <text
            x={MARGIN.left + w / 2}
            y={VBH - 6}
            textAnchor="middle"
            fontSize="13"
            fill={AXIS_LABEL}
            fontFamily="sans-serif"
          >
            {xLabel}
          </text>
        </g>
      )}
      {yLabel && (
        <g id="y-axis-label">
          <text
            transform={`translate(16,${MARGIN.top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="13"
            fill={AXIS_LABEL}
            fontFamily="sans-serif"
          >
            {yLabel}
          </text>
        </g>
      )}
      {title && (
        <g id="title">
          <text
            x={VBW / 2}
            y={18}
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="#222222"
            fontFamily="sans-serif"
          >
            {title}
          </text>
        </g>
      )}

      {showRes && (
        <g id="residuals-strip">
          <rect x={MARGIN.left} y={residTop} width={w} height={RESIDUAL_STRIP_H} fill="#fafafa" />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + w}
            y1={residSy(0)}
            y2={residSy(0)}
            stroke={RESIDUAL_BASELINE}
            strokeWidth="1"
          />
          <text
            x={MARGIN.left - 8}
            y={residTop + 12}
            textAnchor="end"
            fontSize="10"
            fill={TICK_TEXT}
            fontFamily="sans-serif"
          >
            +{fmtNum(residHigh, 2)}
          </text>
          <text
            x={MARGIN.left - 8}
            y={residTop + RESIDUAL_STRIP_H - 4}
            textAnchor="end"
            fontSize="10"
            fill={TICK_TEXT}
            fontFamily="sans-serif"
          >
            −{fmtNum(residHigh, 2)}
          </text>
          <text
            transform={`translate(${MARGIN.left - 38},${residTop + RESIDUAL_STRIP_H / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="11"
            fill={AXIS_LABEL}
            fontFamily="sans-serif"
          >
            residuals
          </text>
          <g clipPath="url(#dr-clip-resid)">
            {curves.map(({ cf, params, color, marker }) => (
              <g key={`resid-${cf.conditionIdx}`}>
                {cf.observations
                  .filter((o) => !o.isZeroDose)
                  .map((o, i) => {
                    const yhat = fourPL(o.x, params);
                    const res = o.y - yhat;
                    return renderPoint(
                      marker,
                      sx(o.x),
                      residSy(res),
                      Math.max(2.5, pointSize - 1),
                      `${cf.conditionIdx}-${i}`,
                      color,
                      pointOpacity,
                      POINT_STROKE,
                      0.8
                    );
                  })}
              </g>
            ))}
          </g>
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + w}
            y1={residTop}
            y2={residTop}
            stroke={FRAME_COLOR}
            strokeWidth="0.6"
          />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + w}
            y1={residTop + RESIDUAL_STRIP_H}
            y2={residTop + RESIDUAL_STRIP_H}
            stroke={FRAME_COLOR}
            strokeWidth="0.6"
          />
        </g>
      )}

      {conditionsForTable.length > 0 && (
        <g id="parameter-table" fontFamily="sans-serif">
          {(() => {
            const cols = [
              "Condition",
              "EC50 (95% CI)",
              "Hill (95% CI)",
              "Top",
              "Bottom",
              "R²",
              "n",
            ];
            const colXs = [0, 0.18, 0.42, 0.62, 0.74, 0.86, 0.94].map((p) => MARGIN.left + p * w);
            return (
              <>
                <rect
                  x={MARGIN.left}
                  y={tableTop}
                  width={w}
                  height={tableH}
                  fill="#ffffff"
                  stroke="#dddddd"
                  strokeWidth="0.6"
                />
                {cols.map((label, i) => (
                  <text
                    key={`head-${i}`}
                    x={colXs[i]}
                    y={tableTop + 14}
                    fontSize="10"
                    fontWeight="700"
                    fill="#444444"
                  >
                    {label}
                  </text>
                ))}
                {conditionsForTable.map((cf, ri) => {
                  if (!cf.fit.valid) return null;
                  const color = conditionColors[cf.condition] || "#0072B2";
                  const y = tableTop + tableHeaderH + ri * tableRowH + 12;
                  const ec50Label = `${fmtEC50(cf.fit.ec50)} (${fmtEC50(cf.fit.ec50CI[0])} – ${fmtEC50(cf.fit.ec50CI[1])})`;
                  const hillLabel = `${fmtNum(cf.fit.params.hillSlope, 3)} (${fmtNum(cf.fit.paramCI.hillSlope[0], 3)} – ${fmtNum(cf.fit.paramCI.hillSlope[1], 3)})`;
                  const cells = [
                    cf.condition,
                    ec50Label,
                    hillLabel,
                    fmtNum(cf.fit.params.top, 3),
                    fmtNum(cf.fit.params.bottom, 3),
                    Number.isFinite(cf.fit.r2) ? cf.fit.r2.toFixed(4) : "—",
                    String(cf.fit.n),
                  ];
                  return (
                    <g key={`row-${ri}`}>
                      <rect x={colXs[0] - 6} y={y - 9} width={4} height={10} fill={color} />
                      {cells.map((c, i) => (
                        <text key={`c-${i}`} x={colXs[i]} y={y} fontSize="10" fill="#222222">
                          {c}
                        </text>
                      ))}
                    </g>
                  );
                })}
              </>
            );
          })()}
        </g>
      )}

      {sharedTablePresent && (
        <g id="shared-param-tests" fontFamily="sans-serif">
          <text x={MARGIN.left} y={sharedTop + 12} fontSize="11" fontWeight="700" fill="#444444">
            F-test for shared parameter (extra-sum-of-squares)
          </text>
          {sharedTests
            .filter((t) => !t.failed)
            .map((t, ri) => {
              const y = sharedTop + 12 + 16 + ri * sharedRowH;
              return (
                <text key={`stest-${ri}`} x={MARGIN.left + 12} y={y} fontSize="10" fill="#333333">
                  {t.paramKey === "logEC50" ? "Shared EC50?" : "Shared Hill slope?"} F(
                  {t.df1.toFixed(0)}, {t.df2.toFixed(0)}) = {fmtNum(t.F, 3)}, p ={" "}
                  {Number.isFinite(t.p) ? formatP(t.p) : "—"} {t.pStars}
                </text>
              );
            })}
        </g>
      )}

      {renderSvgLegend(svgLegend, sharedBottom + 10, MARGIN.left, w, legendItemWidth, 14)}
    </svg>
  );
});

// scatter/chart.tsx — ScatterChart forwardRef SVG renderer. Pure render
// code; consumes the filtered data, the column mappings, and the aesthetic
// computations the parent App built. Delegates per-point shape rendering
// to renderPoint in shapes.tsx.

import { fmtTick, MARGIN, VBW, VBH } from "./helpers";
import { renderPoint } from "./shapes";

const { forwardRef } = React;

export const ScatterChart = forwardRef<SVGSVGElement, any>(function ScatterChart(
  {
    data,
    rawData,
    xCol,
    yCol,
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
    refLines,
    regression,
    regressionStats,
    pointColor,
    pointSize,
    pointOpacity,
    strokeColor,
    strokeWidth,
    colorMapCol,
    colorMapType,
    colorMapPalette,
    colorMapDiscrete,
    colorMapRange,
    sizeMapCol,
    sizeMapType,
    sizeMapMin,
    sizeMapMax,
    sizeMapDiscrete,
    sizeMapRange,
    shapeMapCol,
    shapeMapDiscrete,
    svgLegend,
  },
  ref
) {
  const w = VBW - MARGIN.left - MARGIN.right;
  const h = VBH - MARGIN.top - MARGIN.bottom;
  const legendItemWidth = (block: any) => {
    if (!block.items) return 88;
    const maxLen = block.items.reduce(
      (m: number, it: any) => Math.max(m, (it.label || "").length),
      0
    );
    return Math.max(88, Math.min(260, maxLen * 6.2 + 22));
  };
  const legendH = computeLegendHeight(svgLegend, VBW - MARGIN.left - MARGIN.right, legendItemWidth);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = (v: number) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);

  const getColor = (xVal: number, yVal: number, rowIdx: number): string => {
    void xVal;
    void yVal;
    if (colorMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][colorMapCol] : null;
      if (raw != null && raw !== "") {
        if (colorMapType === "continuous") {
          const num = parseFloat(raw.replace(",", "."));
          if (!isNaN(num)) {
            const [cMin, cMax] = colorMapRange;
            const t = Math.max(0, Math.min(1, (num - cMin) / (cMax - cMin || 1)));
            return interpolateColor(COLOR_PALETTES[colorMapPalette] || COLOR_PALETTES.viridis, t);
          }
        } else {
          return colorMapDiscrete[raw] || pointColor;
        }
      }
    }
    return pointColor;
  };

  const getSize = (rowIdx: number): number => {
    if (sizeMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][sizeMapCol] : null;
      if (raw != null && raw !== "") {
        if (sizeMapType === "continuous") {
          const num = parseFloat(raw.replace(",", "."));
          if (!isNaN(num)) {
            const [sMin, sMax] = sizeMapRange;
            const t = Math.max(0, Math.min(1, (num - sMin) / (sMax - sMin || 1)));
            return sizeMapMin + t * (sizeMapMax - sizeMapMin);
          }
        } else {
          return sizeMapDiscrete[raw] !== undefined ? sizeMapDiscrete[raw] : pointSize;
        }
      }
    }
    return pointSize;
  };

  const getShape = (rowIdx: number): string => {
    if (shapeMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][shapeMapCol] : null;
      if (raw != null && raw !== "" && shapeMapDiscrete[raw] !== undefined) {
        return shapeMapDiscrete[raw];
      }
    }
    return "circle";
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VBW} ${VBH + legendH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title || "Scatter plot"}
    >
      <title>{title || "Scatter plot"}</title>
      <desc>{`Scatter plot with ${data.length} data point${data.length !== 1 ? "s" : ""}${xLabel ? `, X: ${xLabel}` : ""}${yLabel ? `, Y: ${yLabel}` : ""}`}</desc>
      <defs>
        <clipPath id="sc-clip">
          <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} />
        </clipPath>
      </defs>

      <g id="background">
        <rect x={0} y={0} width={VBW} height={VBH} fill={plotBg || "#fff"} />
      </g>
      <g id="plot-area-background">
        <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} fill={plotBg || "#fff"} />
      </g>

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
              y1={MARGIN.top}
              y2={MARGIN.top + h}
              stroke={gridColor || "#e0e0e0"}
              strokeWidth="0.5"
            />
          ))}
        </g>
      )}

      <g id="reference-lines" clipPath="url(#sc-clip)">
        {refLines.map((rl: any) => {
          const isH = rl.dir === "h";
          const x1 = isH ? MARGIN.left : sx(rl.value);
          const x2 = isH ? MARGIN.left + w : sx(rl.value);
          const y1 = isH ? sy(rl.value) : MARGIN.top;
          const y2 = isH ? sy(rl.value) : MARGIN.top + h;
          if (
            (isH && (rl.value < yMin || rl.value > yMax)) ||
            (!isH && (rl.value < xMin || rl.value > xMax))
          )
            return null;
          return (
            <line
              key={rl.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={rl.color || "#444"}
              strokeWidth={rl.strokeWidth || 1.5}
              strokeDasharray={rl.dashed ? rl.dashArray || "7,4" : "none"}
            />
          );
        })}
      </g>

      <g id="reference-line-labels">
        {refLines.map((rl: any) => {
          if (!rl.label) return null;
          const isH = rl.dir === "h";
          if (isH) {
            if (rl.value < yMin || rl.value > yMax) return null;
            const lx = rl.labelSide === "left" ? MARGIN.left + 4 : MARGIN.left + w - 4;
            return (
              <text
                key={`lbl-${rl.id}`}
                x={lx}
                y={sy(rl.value) - 4}
                textAnchor={rl.labelSide === "left" ? "start" : "end"}
                fontSize="10"
                fill={rl.color || "#444"}
                fontFamily="sans-serif"
                fontStyle="italic"
              >
                {rl.label}
              </text>
            );
          } else {
            if (rl.value < xMin || rl.value > xMax) return null;
            const ly = rl.labelSide === "bottom" ? MARGIN.top + h - 4 : MARGIN.top + 12;
            return (
              <text
                key={`lbl-${rl.id}`}
                x={sx(rl.value) + 4}
                y={ly}
                textAnchor="start"
                fontSize="10"
                fill={rl.color || "#444"}
                fontFamily="sans-serif"
                fontStyle="italic"
              >
                {rl.label}
              </text>
            );
          }
        })}
      </g>

      <g
        id="data-points"
        clipPath="url(#sc-clip)"
        role="group"
        aria-label={`${data.length} data points`}
      >
        {data.map((row: any, ri: number) => {
          const xVal = row[xCol],
            yVal = row[yCol];
          if (xVal == null || yVal == null) return null;
          return renderPoint(getShape(ri), sx(xVal), sy(yVal), getSize(ri), {
            key: ri,
            fill: getColor(xVal, yVal, ri),
            fillOpacity: pointOpacity,
            stroke: strokeColor || "none",
            strokeWidth: strokeWidth || 0,
          });
        })}
      </g>

      {regression && regression.on && regressionStats && regressionStats.valid && (
        <g id="regression-line" clipPath="url(#sc-clip)">
          <line
            x1={sx(xMin)}
            y1={sy(regressionStats.slope * xMin + regressionStats.intercept)}
            x2={sx(xMax)}
            y2={sy(regressionStats.slope * xMax + regressionStats.intercept)}
            stroke={regression.color || "#dc2626"}
            strokeWidth={regression.strokeWidth || 1.5}
            strokeDasharray={regression.dashed ? "7,4" : "none"}
          />
        </g>
      )}

      {/* Regression stats label */}
      {regression &&
        regression.on &&
        regression.showStats &&
        regressionStats &&
        regressionStats.valid &&
        (() => {
          const pad = 8;
          const pos = regression.position || "tl";
          const tx = pos.endsWith("r") ? MARGIN.left + w - pad : MARGIN.left + pad;
          const ty = pos.startsWith("b") ? MARGIN.top + h - pad - 38 : MARGIN.top + pad;
          const anchor = pos.endsWith("r") ? "end" : "start";
          const s = regressionStats.slope;
          const b = regressionStats.intercept;
          const eq = `y = ${fmtTick(s)}·x ${b >= 0 ? "+" : "−"} ${fmtTick(Math.abs(b))}`;
          const r2 = `R² = ${Number.isFinite(regressionStats.r2) ? regressionStats.r2.toFixed(4) : "undefined"}`;
          const nTxt = `n = ${regressionStats.n}`;
          return (
            <g
              id="regression-stats"
              fontFamily="sans-serif"
              fontSize="11"
              fill={regression.color || "#dc2626"}
            >
              <text x={tx} y={ty + 10} textAnchor={anchor}>
                {eq}
              </text>
              <text x={tx} y={ty + 24} textAnchor={anchor}>
                {r2}
              </text>
              <text x={tx} y={ty + 38} textAnchor={anchor} fill="#888">
                {nTxt}
              </text>
            </g>
          );
        })()}

      <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
        <line
          id="plot-frame-top"
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left + w}
          y2={MARGIN.top}
        />
        <line
          id="plot-frame-right"
          x1={MARGIN.left + w}
          y1={MARGIN.top}
          x2={MARGIN.left + w}
          y2={MARGIN.top + h}
        />
        <line
          id="plot-frame-bottom"
          x1={MARGIN.left}
          y1={MARGIN.top + h}
          x2={MARGIN.left + w}
          y2={MARGIN.top + h}
        />
        <line
          id="plot-frame-left"
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={MARGIN.top + h}
        />
      </g>

      <g id="axis-x">
        {xTicks.map((t) => (
          <g key={t}>
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
              {fmtTick(t)}
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
            transform={`translate(14,${MARGIN.top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="13"
            fill="#444"
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
            y={16}
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="#222"
            fontFamily="sans-serif"
          >
            {title}
          </text>
        </g>
      )}
      {renderSvgLegend(
        svgLegend,
        VBH + 10,
        MARGIN.left,
        VBW - MARGIN.left - MARGIN.right,
        legendItemWidth
      )}
    </svg>
  );
});

// Local style constants retired — chrome elements now use the dv-* CSS
// classes (dv-input-num, dv-btn-secondary, dv-select) from components.css.

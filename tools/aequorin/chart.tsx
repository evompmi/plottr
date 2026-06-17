// Chart (main time-course forwardRef SVG), InsetBarplot (Σ barplot forwardRef
// SVG), and FacetChartItem (memoised per-condition chart wrapper for the
// faceted layout). Pure React/SVG — no tool state, no side effects; consumes
// MARGIN from ./helpers and otherwise relies on shared globals
// (computeLegendHeight, renderSvgLegend, makeTicks, svgSafeId,
// assignBracketLevels, seededRandom, tinv) resolved through shared.bundle.js.

import {
  MARGIN as BASE_MARGIN,
  buildAreaD,
  buildLineD,
  ChartProps,
  InsetBarplotProps,
  FacetChartItemProps,
  RepSum,
  SeriesRow,
} from "./helpers";
import {
  CldLabels,
  SignificanceBrackets,
  assignBracketLevels,
  computeLegendHeight,
  renderSvgLegend,
} from "../_shell";
import type { LegendBlock } from "../_shell";
import { seededRandom } from "../_core/numeric";
import { makeTicks } from "../_core/scale";
import { valueAxisLeftMargin } from "../_shell/chart-layout";
import { tinv } from "../_core/stats/dist";
import { svgSafeId } from "../_core/svg-export";
import { useT } from "./i18n";
const { forwardRef, useRef, useState, useEffect, memo } = React;

// ── Chart ────────────────────────────────────────────────────────────────────

export const Chart = memo(
  forwardRef<SVGSVGElement, ChartProps>(function Chart(
    {
      series,
      xStart,
      xEnd,
      yMin,
      yMax,
      vbW,
      vbH,
      xLabel,
      yLabel,
      plotBg,
      showGrid,
      lineWidth,
      ribbonOpacity,
      gridColor,
      tickFontSize,
      svgLegend,
      plotTitle,
      plotSubtitle,
      onBrush,
    },
    ref
  ) {
    const tr = useT();
    // Grow the left margin so wide y-tick numbers (e.g. uncalibrated RLU) or
    // a larger tick font never collide with the rotated y-axis label.
    const MARGIN = {
      ...BASE_MARGIN,
      left: valueAxisLeftMargin(
        BASE_MARGIN.left,
        makeTicks(yMin, yMax, 6).map((t) => (t % 1 === 0 ? t : t.toFixed(1))),
        tickFontSize,
        tickFontSize / 11
      ),
    };
    const aequorinItemW = (b: LegendBlock): number => {
      const maxLen = Math.max(0, ...(b.items || []).map((i) => (i.label || "").length));
      return Math.max(110, maxLen * 6 + 28);
    };
    const legendH = computeLegendHeight(svgLegend, vbW - MARGIN.left - MARGIN.right, aequorinItemW);
    // The title/subtitle band scales with the "Text size" slider so larger
    // headings get proportionally more room (× 1 at the 11 px default).
    const topPad = ((plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0)) * (tickFontSize / 11);
    const w = vbW - MARGIN.left - MARGIN.right;
    const h = vbH - MARGIN.top - MARGIN.bottom;
    // Larger tick fonts grow upward into the axis line; nudge the x-tick
    // baseline down by the extra ascent (0 at the 11 px default).
    const xTickDy = Math.max(0, (tickFontSize - 11) * 0.8);
    // Scale main-chart axis labels, title and subtitle proportionally to the
    // tick-size slider (1× at the 11 px default, so the default is unchanged).
    // The zoom inset keeps its own independent font sizing.
    const textScale = tickFontSize / 11;
    // Keep the growing axis labels off the canvas edge: pin each label's outer
    // edge by nudging its baseline inward by the extra ascent/descent (≈0.8/0.25
    // of a font's height; 0 at the default). The title/subtitle band grows via
    // `topPad` above instead.
    const ascentNudge = 0.8 * (textScale - 1);
    const descentNudge = 0.25 * (textScale - 1);
    const xRange = xEnd - xStart || 1;
    const yRange = yMax - yMin || 1;
    const sx = (v: number): number => MARGIN.left + ((v - xStart) / xRange) * w;
    const sy = (v: number): number => MARGIN.top + (1 - (v - yMin) / yRange) * h;
    const clamp = (v: number): number => Math.max(yMin, Math.min(yMax, v));

    const xTicks = makeTicks(xStart, xEnd, 8);
    const yTicks = makeTicks(yMin, yMax, 6);

    const paths = series.map((s) => {
      const areaPts = s.rows.map((r: SeriesRow) => ({
        x: sx(r.t),
        yHi: r.mean != null && r.sd != null ? sy(clamp(r.mean + r.sd)) : null,
        yLo: r.mean != null && r.sd != null ? sy(clamp(r.mean - r.sd)) : null,
      }));
      const linePts = s.rows.map((r: SeriesRow) => ({
        x: sx(r.t),
        y: r.mean != null ? sy(r.mean) : null,
      }));
      return {
        prefix: s.prefix,
        color: s.color,
        areaD: buildAreaD(areaPts),
        lineD: buildLineD(linePts),
      };
    });

    // ── Click-drag brush (set the X window by dragging across the plot) ──
    // `brush` holds the live selection in viewBox-x coordinates (the chart
    // group only translates in y, so x is shared with the root svg). It is
    // transient — cleared on mouseup — so it never lands in an exported SVG.
    const [brush, setBrush] = useState<{ x0: number; x1: number } | null>(null);
    const plotY0 = topPad + MARGIN.top;
    const plotY1 = plotY0 + h;
    // Map a clientX/clientY to viewBox coordinates via the rendered svg box,
    // then clamp x to the plot area. The viewBox width is `vbW`; the rendered
    // CSS width is the bounding-rect width, so 1 css-px = vbW/rect.width vb-units.
    const clientToVb = (
      svg: SVGSVGElement,
      clientX: number,
      clientY: number
    ): { x: number; y: number } => {
      const bb = svg.getBoundingClientRect();
      const scale = vbW / (bb.width || 1);
      const x = (clientX - bb.left) * scale;
      const y = (clientY - bb.top) * scale;
      return { x: Math.max(MARGIN.left, Math.min(MARGIN.left + w, x)), y };
    };
    const vbToData = (vx: number): number =>
      xStart + ((vx - MARGIN.left) / (w || 1)) * (xEnd - xStart);

    const onBrushDown = (e: React.MouseEvent<SVGSVGElement>): void => {
      if (!onBrush || e.button !== 0) return;
      // Capture to a const so the narrowing survives into the nested mouseup
      // closure (TS re-widens captured parameters otherwise).
      const emit = onBrush;
      const svg = e.currentTarget;
      const start = clientToVb(svg, e.clientX, e.clientY);
      // Only begin a brush when the press lands inside the plot area; clicks
      // on the title / legend / margins fall through to normal behaviour.
      if (start.y < plotY0 || start.y > plotY1) return;
      e.preventDefault();
      setBrush({ x0: start.x, x1: start.x });
      const move = (ev: MouseEvent): void => {
        setBrush({ x0: start.x, x1: clientToVb(svg, ev.clientX, ev.clientY).x });
      };
      const up = (ev: MouseEvent): void => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        const endX = clientToVb(svg, ev.clientX, ev.clientY).x;
        setBrush(null);
        // Ignore clicks / micro-drags so a stray click never collapses the
        // window to a zero-width slice.
        if (Math.abs(endX - start.x) < 4) return;
        const a = vbToData(start.x);
        const b = vbToData(endX);
        emit(Math.min(a, b), Math.max(a, b));
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${vbW} ${vbH + legendH + topPad}`}
        style={
          // Only add the brush affordances when brushing is enabled, so the
          // non-interactive render (faceted mini-charts, snapshot tests) stays
          // byte-identical to before this feature.
          onBrush
            ? {
                width: "100%",
                height: "auto",
                display: "block",
                cursor: "crosshair",
                userSelect: "none",
              }
            : { width: "100%", height: "auto", display: "block" }
        }
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={plotTitle || tr("aequorin.chart.fallbackTitle")}
        onMouseDown={onBrush ? onBrushDown : undefined}
      >
        <title>{plotTitle || tr("aequorin.chart.fallbackTitle")}</title>
        <desc>
          {tr("aequorin.chart.desc", { count: series.length }) +
            (xLabel ? tr("aequorin.chart.descX", { x: xLabel }) : "") +
            (yLabel ? tr("aequorin.chart.descY", { y: yLabel }) : "")}
        </desc>
        <g id="background">
          <rect x={0} y={0} width={vbW} height={vbH + legendH + topPad} fill={plotBg || "#fff"} />
        </g>
        {plotTitle && (
          <g id="title">
            <text
              x={vbW / 2}
              y={17 * textScale}
              textAnchor="middle"
              fontSize={15 * textScale}
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
              y={(plotTitle ? 34 : 17) * textScale}
              textAnchor="middle"
              fontSize={12 * textScale}
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
                  y1={MARGIN.top}
                  y2={MARGIN.top + h}
                  stroke={gridColor || "#e0e0e0"}
                  strokeWidth="0.5"
                />
              ))}
            </g>
          )}
          <g id="ribbons">
            {paths.map((p) =>
              p.areaD ? (
                <path
                  key={`area-${p.prefix}`}
                  id={`ribbon-${svgSafeId(p.prefix)}`}
                  d={p.areaD}
                  fill={p.color}
                  fillOpacity={ribbonOpacity}
                  stroke={p.color}
                  strokeOpacity={ribbonOpacity}
                  strokeWidth="0.5"
                />
              ) : null
            )}
          </g>
          <g id="traces">
            {paths.map((p) =>
              p.lineD ? (
                <path
                  key={`line-${p.prefix}`}
                  id={`trace-${svgSafeId(p.prefix)}`}
                  d={p.lineD}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={lineWidth}
                  role="img"
                  aria-label={tr("aequorin.chart.traceAria", { name: p.prefix })}
                />
              ) : null
            )}
          </g>
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
                  y={MARGIN.top + h + 18 + xTickDy}
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
                y={vbH - 4 - descentNudge * 13}
                textAnchor="middle"
                fontSize={13 * textScale}
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
                transform={`translate(${14 + ascentNudge * 13},${MARGIN.top + h / 2}) rotate(-90)`}
                textAnchor="middle"
                fontSize={13 * textScale}
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
            // No `truncateLabel` — `aequorinItemW` sizes each legend column to
            // the full label width (name + "(n=NN)"), so labels are shown in
            // full. Long names widen their column, which drops the per-row
            // count (down to one-per-row / stacked) rather than clipping text.
            aequorinItemW
          )}
          {brush && Math.abs(brush.x1 - brush.x0) > 0.5 && (
            <g id="brush-selection" pointerEvents="none">
              <rect
                x={Math.min(brush.x0, brush.x1)}
                y={MARGIN.top}
                width={Math.abs(brush.x1 - brush.x0)}
                height={h}
                fill="#648fff"
                fillOpacity="0.15"
                stroke="#648fff"
                strokeOpacity="0.6"
                strokeWidth="1"
              />
            </g>
          )}
        </g>
      </svg>
    );
  })
);

// ── InsetBarplot ─────────────────────────────────────────────────────────────

export const InsetBarplot = memo(
  forwardRef<SVGSVGElement, InsetBarplotProps>(function InsetBarplot(
    {
      series,
      insetFillOpacity,
      insetBarWidth,
      insetBarGap,
      insetYMin,
      insetYMax,
      insetW,
      insetH,
      insetErrorType,
      insetShowBarOutline,
      insetBarOutlineColor,
      insetBarStrokeWidth,
      insetShowGrid,
      insetGridColor,
      insetErrorStrokeWidth,
      insetXFontSize,
      insetYFontSize,
      insetXLabelAngle,
      plotBg,
      plotTitle,
      plotSubtitle,
      corrected,
      replicateSums,
      annotations,
      statsSummary,
      showPoints,
      pointSize,
      pointColor,
    },
    ref
  ) {
    const tr = useT();
    const refIW = insetW || 400,
      iH = insetH || 200;
    const _compact = (100 - (insetBarGap != null ? insetBarGap : 0)) / 100;
    const topPad = (plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0);
    const xAngle = insetXLabelAngle || 0;
    const absAngle = Math.abs(xAngle);

    const annotPairs =
      annotations && annotations.kind === "brackets"
        ? assignBracketLevels(annotations.pairs || [])
        : [];
    const annotMaxLevel = annotPairs.reduce((m, pr) => Math.max(m, pr._level || 0), 0);
    const annotTopPad =
      annotations && annotations.kind === "cld"
        ? 22
        : annotations && annotations.kind === "brackets" && annotPairs.length > 0
          ? (annotMaxLevel + 1) * 20 + 6
          : 0;

    // Stats summary below chart
    const STATS_LINE_H = 11;
    const STATS_FONT = 8;
    const summaryLines = statsSummary ? statsSummary.split("\n") : [];
    const summaryH = summaryLines.length > 0 ? summaryLines.length * STATS_LINE_H + 14 : 0;

    const M = {
      top: 24,
      right: 24,
      bottom: 60 + (absAngle > 0 ? absAngle * 0.8 : 0),
      left: 62,
    };
    const iW = Math.max(
      M.left + M.right + 40,
      Math.round((refIW - M.left - M.right) * _compact) + M.left + M.right
    );
    const w = iW - M.left - M.right;
    const h = iH - M.top - M.bottom;
    const totalH = iH + summaryH;

    const bars = series.map((s) => {
      const repData = replicateSums ? replicateSums.find((r) => r.prefix === s.prefix) : null;
      const vals: number[] | null =
        repData && repData.repSums.length > 0
          ? repData.repSums.map((r: RepSum) => (corrected ? r.corrSum : r.rawSum))
          : null;
      const n = vals ? vals.length : 0;
      const barMean = vals && n > 0 ? vals.reduce((a, b) => a + b, 0) / n : 0;
      const variance =
        vals && n > 1 ? vals.reduce((a, v) => a + (v - barMean) ** 2, 0) / (n - 1) : 0;
      const sd = Math.sqrt(variance);
      const sem = n > 1 ? sd / Math.sqrt(n) : 0;
      const ci95 = n > 1 && typeof tinv === "function" ? tinv(0.975, n - 1) * sem : 0;
      return {
        label: s.label,
        prefix: s.prefix,
        fillColor: s.color,
        barMean,
        sd,
        sem,
        ci95,
        n,
        vals,
      };
    });

    const errBars = bars.map((b) => {
      if (insetErrorType === "sd") return b.sd;
      if (insetErrorType === "sem") return b.sem;
      if (insetErrorType === "ci95") return b.ci95;
      return 0;
    });

    const dataMax = Math.max(...bars.map((b, i) => b.barMean + (errBars[i] || 0)), 0.001);
    const yMin2 = insetYMin != null ? insetYMin : 0;
    let yMax2 = insetYMax != null ? insetYMax : dataMax * 1.15;
    // Reserve headroom inside the plot frame for annotations (same approach as boxplot)
    if (annotTopPad > 0 && h > annotTopPad + 10) {
      yMax2 = yMin2 + ((yMax2 - yMin2) * h) / (h - annotTopPad);
    }
    const yRange = yMax2 - yMin2 || 1;

    const bandW = w / bars.length;
    const bx = (i: number): number => M.left + i * bandW + bandW / 2;
    const sy = (v: number): number => M.top + (1 - (v - yMin2) / yRange) * h;
    const yTicks = makeTicks(yMin2, yMax2, 8);
    const halfBar = (insetBarWidth != null ? insetBarWidth / 100 : 0.7) * bandW * 0.5;
    const fOp = insetFillOpacity != null ? insetFillOpacity : 0.7;

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${iW} ${totalH + topPad}`}
        style={{ width: iW, maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={plotTitle || tr("aequorin.chart.barAria")}
      >
        <title>{plotTitle || tr("aequorin.chart.barTitle")}</title>
        <desc>{tr("aequorin.chart.barDesc", { count: series.length })}</desc>
        <g id="background">
          <rect x={0} y={0} width={iW} height={totalH + topPad} fill={plotBg || "#fff"} />
        </g>
        {plotTitle && (
          <g id="title">
            <text
              x={iW / 2}
              y={15}
              textAnchor="middle"
              fontSize="11"
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
              x={iW / 2}
              y={plotTitle ? 28 : 15}
              textAnchor="middle"
              fontSize="9"
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
            x={M.left}
            y={M.top}
            width={w}
            height={h}
            fill={plotBg || "#fff"}
          />
          {insetShowGrid && (
            <g id="grid">
              {yTicks.map((t) => (
                <line
                  key={t}
                  x1={M.left}
                  x2={M.left + w}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke={insetGridColor || "#e0e0e0"}
                  strokeWidth="0.4"
                />
              ))}
            </g>
          )}
          <g id="axis-y">
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={M.left - 3}
                  x2={M.left}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke="#333"
                  strokeWidth="0.5"
                />
                <text
                  x={M.left - 5}
                  y={sy(t) + 3}
                  textAnchor="end"
                  fontSize={insetYFontSize || 7}
                  fill="#555"
                  fontFamily="sans-serif"
                >
                  {t % 1 === 0 ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
          </g>
          <g id="bars">
            {bars.map((b, i) => {
              const val = b.barMean;
              const barTop = sy(Math.min(val, yMax2));
              const baseline = sy(Math.max(0, yMin2));
              const errVal = errBars[i] || 0;
              const capW = halfBar * 0.4;
              const hiVal = val + errVal;
              const loVal = val - errVal;
              const hiValC = Math.min(hiVal, yMax2);
              const loValC = Math.max(loVal, yMin2);
              const drawErrBar = insetErrorType !== "none" && errVal > 0 && hiValC > loValC;
              const drawHiCap = drawErrBar && hiVal <= yMax2;
              const drawLoCap = drawErrBar && loVal >= yMin2;
              return (
                <g key={b.prefix} id={`bar-${svgSafeId(b.prefix)}`}>
                  <rect
                    x={bx(i) - halfBar}
                    y={barTop}
                    width={Math.max(0, halfBar * 2)}
                    height={Math.max(0, baseline - barTop)}
                    fill={b.fillColor}
                    fillOpacity={fOp}
                    stroke={insetShowBarOutline ? insetBarOutlineColor || b.fillColor : "none"}
                    strokeWidth={insetShowBarOutline ? insetBarStrokeWidth || 1 : 0}
                    rx="1"
                  />
                  {drawErrBar && (
                    <>
                      <line
                        x1={bx(i)}
                        x2={bx(i)}
                        y1={sy(hiValC)}
                        y2={sy(loValC)}
                        stroke="#333"
                        strokeWidth={insetErrorStrokeWidth}
                      />
                      {drawHiCap && (
                        <line
                          x1={bx(i) - capW}
                          x2={bx(i) + capW}
                          y1={sy(hiValC)}
                          y2={sy(hiValC)}
                          stroke="#333"
                          strokeWidth={insetErrorStrokeWidth}
                        />
                      )}
                      {drawLoCap && (
                        <line
                          x1={bx(i) - capW}
                          x2={bx(i) + capW}
                          y1={sy(loValC)}
                          y2={sy(loValC)}
                          stroke="#333"
                          strokeWidth={insetErrorStrokeWidth}
                        />
                      )}
                    </>
                  )}
                  {showPoints &&
                    b.vals &&
                    b.vals.map((v, vi) => {
                      const rng = seededRandom(i * 1000 + vi + 42);
                      const jitter = (rng() - 0.5) * halfBar * 1.2;
                      return (
                        <circle
                          key={`pt-${i}-${vi}`}
                          cx={bx(i) + jitter}
                          cy={sy(v)}
                          r={pointSize || 3}
                          fill={pointColor || "#333"}
                          fillOpacity={0.6}
                          stroke={pointColor || "#333"}
                          strokeOpacity={0.75}
                          strokeWidth="0.3"
                        />
                      );
                    })}
                  {absAngle === 0 ? (
                    <text
                      x={bx(i)}
                      y={M.top + h + 12}
                      textAnchor="middle"
                      fontSize={insetXFontSize || 7}
                      fill="#333"
                      fontFamily="sans-serif"
                      fontWeight="600"
                    >
                      {b.label}
                    </text>
                  ) : (
                    <text
                      x={bx(i)}
                      y={M.top + h + 10}
                      transform={`rotate(${xAngle}, ${bx(i)}, ${M.top + h + 10})`}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={insetXFontSize || 7}
                      fill="#333"
                      fontFamily="sans-serif"
                      fontWeight="600"
                    >
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g id="plot-frame" fill="none" stroke="#333" strokeWidth="0.5">
            <line id="plot-frame-top" x1={M.left} y1={M.top} x2={M.left + w} y2={M.top} />
            <line id="plot-frame-right" x1={M.left + w} y1={M.top} x2={M.left + w} y2={M.top + h} />
            <line
              id="plot-frame-bottom"
              x1={M.left}
              y1={M.top + h}
              x2={M.left + w}
              y2={M.top + h}
            />
            <line id="plot-frame-left" x1={M.left} y1={M.top} x2={M.left} y2={M.top + h} />
          </g>
          {annotations && annotations.kind === "cld" && annotations.labels && (
            <CldLabels
              labels={(annotations.labels as (string | null)[]).map((lbl, i) =>
                i >= bars.length ? null : lbl
              )}
              axisCoord={bx}
              crossCoord={M.top + 15}
              orientation="vertical-top"
            />
          )}
          {annotations && annotations.kind === "brackets" && (
            <SignificanceBrackets
              pairs={annotPairs}
              axisCoord={bx}
              baseline={M.top + annotTopPad - 6}
              orientation="vertical-top"
            />
          )}
          <g id="y-axis-label">
            <text
              transform={`translate(14,${M.top + h / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={insetYFontSize || 12}
              fill="#444"
              fontFamily="sans-serif"
            >
              {corrected ? `\u03A3 (baseline-corrected)` : `\u03A3 (raw)`}
            </text>
          </g>
        </g>
        {summaryLines.length > 0 && (
          <g id="stats-summary">
            {summaryLines.map((line, i) => (
              <text
                key={`ss-${i}`}
                x={M.left}
                y={iH + topPad + 10 + i * STATS_LINE_H}
                fontSize={STATS_FONT}
                fill="#aaa"
                fontFamily="monospace"
              >
                {line}
              </text>
            ))}
          </g>
        )}
      </svg>
    );
  })
);

// ── FacetChartItem ───────────────────────────────────────────────────────────

export const FacetChartItem = memo(function FacetChartItem({
  s,
  facetRefs,
  chartProps,
}: FacetChartItemProps) {
  const localRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    // See boxplot/plot-area.tsx — capture facetRefs.current locally so the
    // cleanup closes over the same map the effect mutated.
    const refs = facetRefs.current;
    refs[s.prefix] = localRef.current;
    return () => {
      delete refs[s.prefix];
    };
  }, [s.prefix, facetRefs]);
  return (
    <div
      className="dv-plot-card"
      style={{
        background: "var(--plot-card-bg)",
        borderRadius: 8,
        padding: 12,
        border: "1px solid var(--plot-card-border)",
      }}
    >
      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: s.color }}>
        {s.label}{" "}
        <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
          number of repeats used = {s.n}
        </span>
      </p>
      <Chart ref={localRef} {...chartProps} />
    </div>
  );
});

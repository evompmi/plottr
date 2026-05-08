// BoxplotChart (forwardRef SVG renderer) and its stats-summary SVG helpers.
// Split out of tools/boxplot.tsx as part of the folder-split refactor — pure
// React/SVG; no state, no side effects. The pure layout / scale arithmetic
// (margins, viewbox, y-domain, band/value scales, ticks, tick formatter)
// lives in `./layout` and `./scales` so it's independently testable; this
// file orchestrates the React/SVG render around their outputs.

// statsSummaryHeight + STATS_FONT are now consumed inside ./layout's
// computeViewBox; chart.tsx still pulls STATS_LINE_H + STATS_FONT for its
// internal SVG text rendering.
import { STATS_LINE_H, STATS_FONT } from "./helpers";
import { SignificanceBrackets, CldLabels } from "../_shell/chart-annotations";
import {
  computeAnnotationPadding,
  computeBandSizing,
  computeChartMargins,
  computeCumulativeGap,
  computeViewBox,
  expandYMaxForAnnotations,
  findSubgroupForIndex,
} from "./layout";
import {
  computeYDomain,
  computeYTicks,
  makeBandScale,
  makeTickFormatter,
  makeValueScale,
} from "./scales";

const { forwardRef, useRef } = React;

function statsTextLines(
  lines: string[],
  x: number,
  yStart: number,
  anchor: "start" | "middle" | "end" = "start",
  baseline?: "middle" | "central" | "hanging"
) {
  return lines.map((line: any, i: number) => (
    <text
      key={i}
      x={x}
      y={yStart + i * STATS_LINE_H}
      textAnchor={anchor}
      dominantBaseline={baseline}
      fontSize={STATS_FONT}
      fill="#aaa"
      fontFamily="monospace"
    >
      {line}
    </text>
  ));
}
function renderStatsSummary(summary: string | null, y: number, x: number) {
  if (!summary) return null;
  return <g id="stats-summary">{statsTextLines(summary.split("\n"), x, y + 10)}</g>;
}
function renderSubgroupSummaries({
  subgroups,
  summaries,
  hz,
  bx,
  bandW,
  separatorGap,
  M,
  w,
  summaryY,
}: any) {
  return subgroups.map((sg: any, sgIdx: number) => {
    const txt = summaries[sg.name];
    if (!txt) return null;
    const lines = txt.split("\n");
    const gid = `stats-summary-${svgSafeId(sg.name)}`;
    if (hz) {
      const firstPos = bx(sg.startIndex);
      const lastPos = bx(sg.startIndex + sg.count - 1);
      const centerPos = (firstPos + lastPos) / 2;
      const startY = centerPos - (lines.length * STATS_LINE_H) / 2;
      return (
        <g key={sg.name} id={gid}>
          {statsTextLines(lines, M.left + w + 12, startY, "start", "middle")}
        </g>
      );
    }
    // Anchor each block at the left edge of its subgroup band: the plot
    // frame for the first subgroup, the dashed separator line for the rest.
    const leftEdge = sgIdx === 0 ? M.left : bx(sg.startIndex) - bandW / 2 - separatorGap / 2;
    return (
      <g key={sg.name} id={gid}>
        {statsTextLines(lines, leftEdge + 4, summaryY + 10)}
      </g>
    );
  });
}

export const BoxplotChart = forwardRef<SVGSVGElement, any>(function BoxplotChart(
  {
    groups,
    yLabel,
    plotTitle,
    plotBg,
    showGrid,
    gridColor,
    boxWidth,
    boxFillOpacity,
    pointSize,
    showPoints,
    jitterWidth,
    pointOpacity,
    xLabelAngle,
    yMin: yMinP,
    yMax: yMaxP,
    categoryColors: catCols,
    colorByCol: cbc,
    boxGap,
    svgLegend,
    showCompPie,
    plotStyle = "box",
    annotations,
    statsSummary,
    barOpacity,
    errorType,
    errStrokeWidth,
    showBarOutline,
    barOutlineWidth,
    barOutlineColor,
    horizontal,
    subgroups,
    subgroupSummaries,
    yScale,
  },
  ref
) {
  // ── Layout: margins + annotation padding ─────────────────────────────────
  const { M, hz, isBar, angle, absA, pieSpace, labelZone } = computeChartMargins({
    groups,
    horizontal,
    xLabelAngle,
    plotStyle,
    showCompPie,
    colorByCol: cbc,
  });
  const {
    hasLabels: _hasLabels,
    hasPairs: _hasPairs,
    annotPairs,
    subgroupLabelPad,
    annotTopPad,
  } = computeAnnotationPadding({ annotations, subgroups });

  // ── KDE cache hook (must precede any early-return for rules-of-hooks) ────
  // Cache kde() across renders, keyed on the underlying allValues array. The
  // chart wrapper rebuilds `groups` on every aesthetic tweak (sliders, colors)
  // but each group's `allValues` reference is preserved from the upstream
  // useMemo, so a WeakMap on that reference reuses the kde points until the
  // user actually changes the data. kde is the dominant render-time cost on
  // violin/raincloud plots (O(nPoints × n) Gaussian evaluations per group),
  // and it is invoked twice per group per render — once for axis bounds, once
  // for the path geometry — so this also dedupes within a single render.
  const kdeCacheRef = useRef<WeakMap<number[], Array<{ x: number; d: number }>>>(new WeakMap());

  const allV = groups.flatMap((g: any) => g.allValues);
  if (allV.length === 0) return null;
  const getKde = (allValues: number[]) => {
    let pts = kdeCacheRef.current.get(allValues);
    if (!pts) {
      pts = kde(allValues, 60);
      kdeCacheRef.current.set(allValues, pts);
    }
    return pts;
  };

  // ── Y-domain (with log-scale handling) ───────────────────────────────────
  // Destructured into a `let` for yMin/yMax (mutable: expandYMaxForAnnotations
  // adjusts yMax once the chart's pixel dimensions are known) and a `const`
  // for the log-scale derivatives.
  const yDomain = computeYDomain({
    allV,
    groups,
    isBar,
    plotStyle,
    errorType,
    getKde,
    yMinP,
    yMaxP,
    yScale,
  });
  let { yMin, yMax } = yDomain;
  const { isLog, logBase, safeLog } = yDomain;

  // ── Band sizing + viewbox ───────────────────────────────────────────────
  const { n, separatorGap, totalGap, catSize, valSize } = computeBandSizing({
    groups,
    subgroups,
    boxGap,
    isBar,
    hz,
    absA,
  });
  const {
    vbW,
    vbH,
    vbHChart: vbH_chart,
    w,
    h,
    legH: _legH,
    hasSgSummaries: _hasSgSummaries,
  } = computeViewBox({
    subgroups,
    subgroupSummaries,
    statsSummary,
    hz,
    valSize,
    catSize,
    M,
    svgLegend,
  });

  // ── Annotation y-max expansion ──────────────────────────────────────────
  const annotDim = hz ? w : h;
  yMax = expandYMaxForAnnotations({
    yMin,
    yMax,
    annotTopPad,
    annotDim,
    isLog,
    logBase,
    safeLog,
  });

  // ── Scales + ticks ──────────────────────────────────────────────────────
  const bandW = ((hz ? h : w) - totalGap) / n;
  const cumulGap = computeCumulativeGap(subgroups, n, separatorGap);
  const bx = makeBandScale({ M, hz, bandW, cumulGap });
  const sy = makeValueScale({ yMin, yMax, isLog, safeLog, M, w, h, hz });
  const yTicks = computeYTicks({ yMin, yMax, isLog, logBase });
  const fmtTick = makeTickFormatter(isLog);

  // ── Chart-local closures (subgroup-scoped element IDs) ──────────────────
  const _grpId = (prefix: any, gi: any, name: any) => {
    const sg = findSubgroupForIndex(subgroups, gi);
    return sg
      ? `${prefix}-${svgSafeId(sg.name)}-${svgSafeId(name)}`
      : `${prefix}-${svgSafeId(name)}`;
  };
  const halfBox = (boxWidth / 100) * bandW * 0.4;

  const pointColor = (g: any, src: any, si: any) => {
    if (cbc >= 0 && catCols && src.category)
      return catCols[src.category] || getPointColors(g.color, g.sources.length)[si] || g.color;
    return getPointColors(g.color, g.sources.length)[si] || g.color;
  };

  const renderCompPie = (g: any, px: any, py: any, gi = 0) => {
    if (cbc < 0 || !g.sources || !showCompPie) return null;
    const total = g.allValues.length;
    if (!total) return null;
    const r = 20;
    let cum = 0;

    const slices = g.sources.map((src: any, si: number) => {
      const pct = src.values.length / total;
      const a0 = cum * Math.PI * 2;
      const a1 = (cum + pct) * Math.PI * 2;
      cum += pct;
      const col = catCols && src.category ? catCols[src.category] || "#999" : "#999";
      if (pct >= 1)
        return <circle key={si} cx={px} cy={py} r={r} fill={col} stroke="#000" strokeWidth="0.5" />;
      const x0 = px + Math.sin(a0) * r;
      const y0 = py - Math.cos(a0) * r;
      const x1 = px + Math.sin(a1) * r;
      const y1 = py - Math.cos(a1) * r;
      const lg = pct > 0.5 ? 1 : 0;
      return (
        <path
          key={si}
          d={`M${px},${py}L${x0},${y0}A${r},${r},0,${lg},1,${x1},${y1}Z`}
          fill={col}
          stroke="#000"
          strokeWidth="0.5"
        />
      );
    });

    const labels = g.sources.map((src: any, si: number) => {
      const pct = src.values.length / total;
      if (pct < 0.08) return null;
      const cumPct = g.sources
        .slice(0, si)
        .reduce((s: any, ss: any) => s + ss.values.length / total, 0);
      const midA = (cumPct + pct / 2) * Math.PI * 2;
      const lr = r + 8;
      return (
        <text
          key={`t${si}`}
          x={px + Math.sin(midA) * lr}
          y={py - Math.cos(midA) * lr + 3}
          textAnchor="middle"
          fontSize="7"
          fill="#888"
          fontFamily="sans-serif"
        >
          {Math.round(pct * 100)}%
        </text>
      );
    });

    return (
      <g key={`cb-${gi}-${g.name}`}>
        {slices}
        <circle cx={px} cy={py} r={r} fill="none" stroke="#000" strokeWidth="0.5" />
        {labels}
      </g>
    );
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${vbW} ${vbH}`}
      style={{ width: vbW, maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || (isBar ? "Bar chart" : "Box plot")}
    >
      <title>{plotTitle || (isBar ? "Bar chart" : "Box plot")}</title>
      <desc>{`${isBar ? "Bar chart" : "Box plot"} with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`}</desc>

      <rect id="plot-area-background" x={M.left} y={M.top} width={w} height={h} fill={plotBg} />

      {showGrid && (
        <g id="grid">
          {yTicks
            .filter((tk: any) => tk.major)
            .map((tk: any) =>
              hz ? (
                <line
                  key={tk.value}
                  x1={sy(tk.value)}
                  x2={sy(tk.value)}
                  y1={M.top}
                  y2={M.top + h}
                  stroke={gridColor}
                  strokeWidth="0.5"
                />
              ) : (
                <line
                  key={tk.value}
                  x1={M.left}
                  x2={M.left + w}
                  y1={sy(tk.value)}
                  y2={sy(tk.value)}
                  stroke={gridColor}
                  strokeWidth="0.5"
                />
              )
            )}
        </g>
      )}

      <g id={hz ? "axis-x" : "axis-y"}>
        {yTicks.map((tk: any) => {
          const v = tk.value;
          const tickLen = tk.major ? 5 : 3;
          return (
            <g key={v}>
              {hz ? (
                <>
                  <line
                    x1={sy(v)}
                    x2={sy(v)}
                    y1={M.top + h}
                    y2={M.top + h + tickLen}
                    stroke="#333"
                    strokeWidth={tk.major ? "1" : "0.5"}
                  />
                  {tk.major && (
                    <text
                      x={sy(v)}
                      y={M.top + h + 16}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#555"
                      fontFamily="sans-serif"
                    >
                      {fmtTick(v)}
                    </text>
                  )}
                </>
              ) : (
                <>
                  <line
                    x1={M.left - tickLen}
                    x2={M.left}
                    y1={sy(v)}
                    y2={sy(v)}
                    stroke="#333"
                    strokeWidth={tk.major ? "1" : "0.5"}
                  />
                  {tk.major && (
                    <text
                      x={M.left - 8}
                      y={sy(v) + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#555"
                      fontFamily="sans-serif"
                    >
                      {fmtTick(v)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>

      <g id={isBar ? "bars" : "groups"}>
        {groups.map((g: any, gi: number) => {
          if (!g.stats) return null;
          const cx = bx(gi);

          if (isBar) {
            const { mean, sd, sem, ci95 } = g.stats;
            if (mean < yMin || mean > yMax) return null;
            const showErr = errorType !== "none";
            const errVal = !showErr
              ? 0
              : errorType === "sd"
                ? sd
                : errorType === "ci95"
                  ? ci95
                  : sem;
            const baselinePos = sy(isLog ? yMin : Math.max(0, yMin));
            const meanPos = sy(mean);
            const capSize = halfBox * 0.4;
            const hiVal = mean + errVal;
            const loVal = mean - errVal;
            const hiValC = Math.min(hiVal, yMax);
            const loValC = Math.max(loVal, yMin);
            const drawWhisker = showErr && hiValC > loValC;
            const drawHiCap = drawWhisker && hiVal <= yMax;
            const drawLoCap = drawWhisker && loVal >= yMin;
            const errHi = sy(hiValC);
            const errLo = sy(loValC);
            const barR = hz
              ? {
                  x: Math.min(baselinePos, meanPos),
                  y: cx - halfBox,
                  width: Math.abs(meanPos - baselinePos),
                  height: halfBox * 2,
                }
              : {
                  x: cx - halfBox,
                  y: mean >= 0 ? meanPos : baselinePos,
                  width: halfBox * 2,
                  height: Math.max(0, Math.abs(meanPos - baselinePos)),
                };
            return (
              <g
                key={`${gi}-${g.name}`}
                id={_grpId("bar", gi, g.name)}
                role="group"
                aria-label={`${g.name}: mean ${mean.toFixed(2)}${showErr ? `, ${errorType === "sd" ? "SD" : errorType === "ci95" ? "95% CI" : "SEM"} ${errVal.toFixed(2)}` : ""}, n=${g.stats.n}`}
              >
                <rect
                  {...barR}
                  fill={g.color}
                  fillOpacity={barOpacity}
                  stroke={showBarOutline ? barOutlineColor || g.color : "none"}
                  strokeWidth={showBarOutline ? barOutlineWidth || 1.5 : 0}
                  rx="1"
                />
                {drawWhisker && (
                  <>
                    <line
                      x1={hz ? errLo : cx}
                      x2={hz ? errHi : cx}
                      y1={hz ? cx : errHi}
                      y2={hz ? cx : errLo}
                      stroke="#333"
                      strokeWidth={errStrokeWidth || 1.2}
                    />
                    {drawHiCap && (
                      <line
                        x1={hz ? errHi : cx - capSize}
                        x2={hz ? errHi : cx + capSize}
                        y1={hz ? cx - capSize : errHi}
                        y2={hz ? cx + capSize : errHi}
                        stroke="#333"
                        strokeWidth={errStrokeWidth || 1.2}
                      />
                    )}
                    {drawLoCap && (
                      <line
                        x1={hz ? errLo : cx - capSize}
                        x2={hz ? errLo : cx + capSize}
                        y1={hz ? cx - capSize : errLo}
                        y2={hz ? cx + capSize : errLo}
                        stroke="#333"
                        strokeWidth={errStrokeWidth || 1.2}
                      />
                    )}
                  </>
                )}
                {showPoints &&
                  g.sources.map((src: any, si: number) => {
                    const rng = seededRandom(gi * 1000 + si * 100 + 42);
                    const ptColor = pointColor(g, src, si);
                    return src.values.map((v: any, vi: number) => {
                      const jitter = (rng() - 0.5) * jitterWidth * halfBox * 2;
                      return (
                        <circle
                          key={`${gi}-${si}-${vi}`}
                          cx={hz ? sy(v) : cx + jitter}
                          cy={hz ? cx + jitter : sy(v)}
                          r={pointSize}
                          fill={ptColor}
                          fillOpacity={pointOpacity || 0.6}
                          stroke={ptColor}
                          strokeOpacity={Math.min(1, (pointOpacity || 0.6) + 0.15)}
                          strokeWidth="0.3"
                        />
                      );
                    });
                  })}
              </g>
            );
          }

          const { q1, med, q3, wLo, wHi } = g.stats;
          const isRain = plotStyle === "raincloud";
          const isViolin = plotStyle === "violin" || isRain;

          /* ── Violin / raincloud KDE shape ── */
          let violinPath = null;
          if (isViolin && g.allValues.length >= 2) {
            const pts = getKde(g.allValues);
            const maxD = Math.max(...pts.map((p: any) => p.d));
            if (maxD > 0) {
              const sc = (d: any) => (d / maxD) * halfBox;
              if (isRain) {
                let d = hz ? `M ${sy(pts[0].x)},${cx}` : `M ${cx},${sy(pts[0].x)}`;
                for (const p of pts)
                  d += hz ? ` L ${sy(p.x)},${cx - sc(p.d)}` : ` L ${cx - sc(p.d)},${sy(p.x)}`;
                d += hz
                  ? ` L ${sy(pts[pts.length - 1].x)},${cx} Z`
                  : ` L ${cx},${sy(pts[pts.length - 1].x)} Z`;
                violinPath = (
                  <path
                    d={d}
                    fill={g.color}
                    fillOpacity={boxFillOpacity}
                    stroke={g.color}
                    strokeWidth="1"
                  />
                );
              } else {
                let d = hz
                  ? `M ${sy(pts[0].x)},${cx - sc(pts[0].d)}`
                  : `M ${cx - sc(pts[0].d)},${sy(pts[0].x)}`;
                for (const p of pts)
                  d += hz ? ` L ${sy(p.x)},${cx - sc(p.d)}` : ` L ${cx - sc(p.d)},${sy(p.x)}`;
                d += hz
                  ? ` L ${sy(pts[pts.length - 1].x)},${cx + sc(pts[pts.length - 1].d)}`
                  : ` L ${cx + sc(pts[pts.length - 1].d)},${sy(pts[pts.length - 1].x)}`;
                for (let i = pts.length - 1; i >= 0; i--)
                  d += hz
                    ? ` L ${sy(pts[i].x)},${cx + sc(pts[i].d)}`
                    : ` L ${cx + sc(pts[i].d)},${sy(pts[i].x)}`;
                d += " Z";
                violinPath = (
                  <path
                    d={d}
                    fill={g.color}
                    fillOpacity={boxFillOpacity}
                    stroke={g.color}
                    strokeWidth="1"
                  />
                );
              }
            }
          }

          /* ── Box elements ── */
          const boxHalf = isViolin ? halfBox * 0.35 : halfBox;
          const boxCx = isRain ? cx + halfBox * 0.15 : cx;
          const boxEls = hz ? (
            <>
              <line y1={boxCx} y2={boxCx} x1={sy(q3)} x2={sy(wHi)} stroke="#333" strokeWidth="1" />
              <line y1={boxCx} y2={boxCx} x1={sy(wLo)} x2={sy(q1)} stroke="#333" strokeWidth="1" />
              <line
                y1={boxCx - boxHalf * 0.5}
                y2={boxCx + boxHalf * 0.5}
                x1={sy(wHi)}
                x2={sy(wHi)}
                stroke="#333"
                strokeWidth="1"
              />
              <line
                y1={boxCx - boxHalf * 0.5}
                y2={boxCx + boxHalf * 0.5}
                x1={sy(wLo)}
                x2={sy(wLo)}
                stroke="#333"
                strokeWidth="1"
              />
              <rect
                x={sy(q1)}
                y={boxCx - boxHalf}
                width={sy(q3) - sy(q1)}
                height={boxHalf * 2}
                fill={isViolin ? "#fff" : g.color}
                fillOpacity={isViolin ? 0.7 : boxFillOpacity}
                stroke={g.color}
                strokeWidth="1.5"
                rx="2"
              />
              <line
                y1={boxCx - boxHalf}
                y2={boxCx + boxHalf}
                x1={sy(med)}
                x2={sy(med)}
                stroke={g.color}
                strokeWidth="2.5"
              />
            </>
          ) : (
            <>
              <line x1={boxCx} x2={boxCx} y1={sy(wHi)} y2={sy(q3)} stroke="#333" strokeWidth="1" />
              <line x1={boxCx} x2={boxCx} y1={sy(q1)} y2={sy(wLo)} stroke="#333" strokeWidth="1" />
              <line
                x1={boxCx - boxHalf * 0.5}
                x2={boxCx + boxHalf * 0.5}
                y1={sy(wHi)}
                y2={sy(wHi)}
                stroke="#333"
                strokeWidth="1"
              />
              <line
                x1={boxCx - boxHalf * 0.5}
                x2={boxCx + boxHalf * 0.5}
                y1={sy(wLo)}
                y2={sy(wLo)}
                stroke="#333"
                strokeWidth="1"
              />
              <rect
                x={boxCx - boxHalf}
                y={sy(q3)}
                width={boxHalf * 2}
                height={sy(q1) - sy(q3)}
                fill={isViolin ? "#fff" : g.color}
                fillOpacity={isViolin ? 0.7 : boxFillOpacity}
                stroke={g.color}
                strokeWidth="1.5"
                rx="2"
              />
              <line
                x1={boxCx - boxHalf}
                x2={boxCx + boxHalf}
                y1={sy(med)}
                y2={sy(med)}
                stroke={g.color}
                strokeWidth="2.5"
              />
            </>
          );

          /* ── Jitter points ── */
          const ptOffset = isRain ? halfBox * 0.55 : 0;
          const jitterEls =
            showPoints &&
            g.sources.map((src: any, si: number) => {
              const rng = seededRandom(gi * 1000 + si * 100 + 42);
              const ptColor = pointColor(g, src, si);
              return src.values.map((v: any, vi: number) => {
                const j = isRain
                  ? ptOffset + Math.abs(rng() - 0.5) * jitterWidth * halfBox
                  : (rng() - 0.5) * jitterWidth * halfBox * 2;
                return (
                  <circle
                    key={`${gi}-${si}-${vi}`}
                    cx={hz ? sy(v) : cx + j}
                    cy={hz ? cx + j : sy(v)}
                    r={pointSize}
                    fill={ptColor}
                    fillOpacity={pointOpacity || 0.6}
                    stroke={ptColor}
                    strokeOpacity={Math.min(1, (pointOpacity || 0.6) + 0.15)}
                    strokeWidth="0.3"
                  />
                );
              });
            });

          /* ── Outlier dots (always visible) ── */
          const outlierCx = isRain ? cx + ptOffset : cx;
          const outlierEls = g.sources.flatMap((src: any, si: number) =>
            src.values
              .filter((v: any) => v < wLo || v > wHi)
              .map((v: any, oi: number) => (
                <circle
                  key={`out-${gi}-${si}-${oi}`}
                  cx={hz ? sy(v) : outlierCx}
                  cy={hz ? outlierCx : sy(v)}
                  r={2.5}
                  fill="#000"
                  fillOpacity={0.8}
                  stroke="none"
                />
              ))
          );

          return (
            <g
              key={`${gi}-${g.name}`}
              id={_grpId("group", gi, g.name)}
              role="group"
              aria-label={`${g.name}: median ${med.toFixed(2)}, Q1 ${q1.toFixed(2)}, Q3 ${q3.toFixed(2)}, n=${g.stats.n}`}
            >
              {violinPath}
              {boxEls}
              {jitterEls}
              {outlierEls}
            </g>
          );
        })}
      </g>

      <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
        <line id="plot-frame-top" x1={M.left} y1={M.top} x2={M.left + w} y2={M.top} />
        <line id="plot-frame-right" x1={M.left + w} y1={M.top} x2={M.left + w} y2={M.top + h} />
        <line id="plot-frame-bottom" x1={M.left} y1={M.top + h} x2={M.left + w} y2={M.top + h} />
        <line id="plot-frame-left" x1={M.left} y1={M.top} x2={M.left} y2={M.top + h} />
      </g>

      {subgroups && subgroups.length > 1 && (
        <g id="subgroup-separators">
          {subgroups.slice(1).map((sg: any, idx: number) => {
            const sepPos = bx(sg.startIndex) - bandW / 2 - separatorGap / 2;
            return hz ? (
              <line
                key={`sep-${idx}`}
                x1={M.left}
                x2={M.left + w}
                y1={sepPos}
                y2={sepPos}
                stroke="#999"
                strokeWidth="1"
                strokeDasharray="5,4"
              />
            ) : (
              <line
                key={`sep-${idx}`}
                x1={sepPos}
                x2={sepPos}
                y1={M.top}
                y2={M.top + h}
                stroke="#999"
                strokeWidth="1"
                strokeDasharray="5,4"
              />
            );
          })}
        </g>
      )}

      {subgroups && subgroups.length > 0 && (
        <g id="subgroup-labels">
          {subgroups.map((sg: any) => {
            const firstX = bx(sg.startIndex);
            const lastX = bx(sg.startIndex + sg.count - 1);
            const midPos = (firstX + lastX) / 2;
            if (hz) {
              const lx = M.left + w - subgroupLabelPad / 2;
              return (
                <text
                  key={`sgl-${sg.name}`}
                  x={lx}
                  y={midPos}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#666"
                  fontFamily="sans-serif"
                  fontStyle="italic"
                  transform={`rotate(90,${lx},${midPos})`}
                >
                  {sg.name}
                </text>
              );
            }
            return (
              <text
                key={`sgl-${sg.name}`}
                x={midPos}
                y={M.top + subgroupLabelPad / 2 + 3}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="700"
                fill="#666"
                fontFamily="sans-serif"
                fontStyle="italic"
              >
                {sg.name}
              </text>
            );
          })}
        </g>
      )}

      <g id={hz ? "axis-y" : "axis-x"}>
        {groups.map((g: any, gi: number) => {
          const gp = bx(gi);
          if (hz) {
            const labelX = M.left - 8;
            const pieX = M.left - labelZone - pieSpace / 2;
            const hzPie = renderCompPie(g, pieX, gp, gi);
            return (
              <React.Fragment key={`xl-${gi}-${g.name}`}>
                <g>
                  <text
                    x={labelX}
                    y={gp}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {g.name}
                  </text>
                  <text
                    x={labelX}
                    y={gp + 12}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill="#999"
                    fontFamily="sans-serif"
                  >
                    n={g.stats?.n || 0}
                  </text>
                </g>
                {hzPie}
              </React.Fragment>
            );
          }
          const ly = M.top + h + 16;
          const compBar = renderCompPie(g, gp, vbH_chart - 20 - 12, gi);
          return (
            <React.Fragment key={`xl-${gi}-${g.name}`}>
              {angle === 0 ? (
                <g>
                  <text
                    x={gp}
                    y={ly}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {g.name}
                  </text>
                  <text
                    x={gp}
                    y={ly + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#999"
                    fontFamily="sans-serif"
                  >
                    n={g.stats?.n || 0}
                  </text>
                </g>
              ) : (
                <g transform={`rotate(${angle},${gp},${ly})`}>
                  <text
                    x={gp}
                    y={ly}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {g.name}
                  </text>
                  <text
                    x={gp}
                    y={ly + 12}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill="#999"
                    fontFamily="sans-serif"
                  >
                    n={g.stats?.n || 0}
                  </text>
                </g>
              )}
              {compBar}
            </React.Fragment>
          );
        })}
      </g>

      {annotations && _hasLabels && (
        <CldLabels
          labels={annotations.labels || []}
          axisCoord={bx}
          crossCoord={hz ? M.left + w - subgroupLabelPad - 10 : M.top + subgroupLabelPad + 15}
          orientation={hz ? "horizontal-right" : "vertical-top"}
        />
      )}

      {annotations && _hasPairs && (
        <SignificanceBrackets
          pairs={annotPairs}
          axisCoord={bx}
          baseline={hz ? M.left + w - annotTopPad + 6 : M.top + annotTopPad - 6}
          orientation={hz ? "horizontal-right" : "vertical-top"}
        />
      )}

      {yLabel && (
        <g id={hz ? "x-axis-label" : "y-axis-label"}>
          {hz ? (
            <text
              x={M.left + w / 2}
              y={M.top + h + 36}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {yLabel}
            </text>
          ) : (
            <text
              transform={`translate(14,${M.top + h / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {yLabel}
            </text>
          )}
        </g>
      )}

      {plotTitle && (
        <g id="title">
          <text
            x={M.left + w / 2}
            y={14}
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

      {renderSvgLegend(svgLegend, vbH_chart + 10, M.left, vbW - M.left - M.right, 88, 14)}
      {_hasSgSummaries
        ? renderSubgroupSummaries({
            subgroups,
            summaries: subgroupSummaries,
            hz,
            bx,
            bandW,
            separatorGap,
            M,
            w,
            summaryY: vbH_chart + _legH,
          })
        : renderStatsSummary(statsSummary, vbH_chart + _legH, M.left)}
    </svg>
  );
});

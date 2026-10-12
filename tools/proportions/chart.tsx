// ProportionsChart — SVG renderer for the three chart types:
//   proportion — % of the focus category per group, Wilson 95 % CI whiskers
//   stacked    — 100 % stacked bars, one segment per category
//   mosaic     — stacked columns whose widths are proportional to group n
// Pure render: every number comes from props (analysis lives in app.tsx).
// Hex literals only inside the SVG (chrome / SVG theming split).

import { CldLabels, SignificanceBrackets, assignBracketLevels } from "../_shell";
import { svgSafeId } from "../_core/svg-export";
import { mosaicSpans, stackSegments } from "./helpers";
import type { ProportionsChartProps } from "./helpers";
import { tt } from "./i18n";

const { forwardRef, memo, useMemo } = React;

const FONT = "sans-serif";
const AXIS = "#333333";
const MOSAIC_GAP = 6;
const BRACKET_STEP = 18;

// Rough text width for layout (no DOM measurement — keeps export stable).
function textW(s: string, fs: number): number {
  return s.length * fs * 0.58;
}

// Readable label colour on a filled segment.
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#000000";
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

export const ProportionsChart = memo(
  forwardRef<SVGSVGElement, ProportionsChartProps>(function ProportionsChart(props, ref) {
    const {
      table,
      chartType,
      summaries,
      brackets,
      cld,
      annotation,
      colors,
      groupColors,
      showCI,
      showN,
      segmentLabels,
      barWidthFrac,
      barOutline,
      barOutlineWidth,
      xLabelAngle,
      plotWidth,
      plotHeight,
      tickFontSize: fs,
      title,
      yLabel,
      plotBg,
      showGrid,
      gridColor,
    } = props;
    const k = table.groups.length;
    const totals = table.counts.map((row) => row.reduce((a, b) => a + b, 0));
    const isProp = chartType === "proportion";

    const leveled = useMemo(
      () => (annotation === "brackets" ? assignBracketLevels(brackets) : []),
      [annotation, brackets]
    );
    const nLevels = leveled.reduce((m, b) => Math.max(m, b._level + 1), 0);
    const showCld = annotation === "cld" && cld.some((s) => s !== "");

    // ── Layout ──
    const slot = plotWidth / Math.max(1, k);
    const spans: [number, number][] = useMemo(() => {
      if (chartType === "mosaic") return mosaicSpans(totals, plotWidth, MOSAIC_GAP);
      const bw = slot * barWidthFrac;
      return table.groups.map((_, i) => {
        const cx = slot * (i + 0.5);
        return [cx - bw / 2, cx + bw / 2] as [number, number];
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chartType, totals.join(","), plotWidth, slot, barWidthFrac, k]);

    // Group labels: horizontal at 0°, otherwise tilted (−90…0°) and
    // end-anchored at the tick, like the other tools' "group label angle".
    const angle = Math.max(-90, Math.min(0, xLabelAngle || 0));
    const rad = (Math.abs(angle) * Math.PI) / 180;
    const labelW = table.groups.map((g) => textW(g, fs));
    const maxLabelW = Math.max(0, ...labelW);
    const xLabelH = angle === 0 ? fs + 4 : maxLabelW * Math.sin(rad) + fs * Math.cos(rad) + 6;
    // Leftward overhang of a tilted label past the plot's left edge.
    const overhang =
      angle === 0
        ? 0
        : Math.max(0, ...labelW.map((w, i) => w * Math.cos(rad) - (spans[i][0] + spans[i][1]) / 2));
    const nLineH = showN ? fs + 4 : 0;
    const titleH = title ? fs + 14 : 0;
    const annotH =
      annotation === "brackets" && nLevels > 0 ? nLevels * BRACKET_STEP + 6 : showCld ? fs + 10 : 0;
    const legendW = isProp
      ? 0
      : 28 + Math.max(...table.categories.map((c) => textW(c, fs)), textW("Category", fs));
    const M = {
      left: Math.max(30 + fs + textW("100 %", fs), overhang + 8),
      right: 16 + legendW,
      top: 12 + titleH + annotH,
      bottom: 14 + xLabelH + nLineH,
    };
    const VBW = M.left + plotWidth + M.right;
    const VBH = M.top + plotHeight + M.bottom;
    const yOf = (frac: number): number => M.top + plotHeight * (1 - frac);
    const centre = (i: number): number => M.left + (spans[i][0] + spans[i][1]) / 2;

    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const yTitle =
      yLabel ||
      (isProp
        ? tt("proportions.chart.yProp", { cat: table.categories[0] ?? "" })
        : tt("proportions.chart.yStack"));

    const groupLabel = (i: number) => {
      const x = centre(i);
      if (angle === 0) {
        return (
          <text
            key={`gl-${i}`}
            x={x}
            y={M.top + plotHeight + 8 + fs}
            fontSize={fs}
            fontFamily={FONT}
            fill={AXIS}
            textAnchor="middle"
          >
            {table.groups[i]}
          </text>
        );
      }
      const y = M.top + plotHeight + 6 + fs * 0.7;
      return (
        <text
          key={`gl-${i}`}
          x={x}
          y={y}
          fontSize={fs}
          fontFamily={FONT}
          fill={AXIS}
          textAnchor="end"
          transform={`rotate(${angle},${x},${y})`}
        >
          {table.groups[i]}
        </text>
      );
    };

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VBW} ${VBH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title || tt("proportions.chart.fallbackTitle")}
      >
        <title>{title || tt("proportions.chart.fallbackTitle")}</title>
        <desc>
          {tt("proportions.chart.desc", {
            groups: k,
            categories: table.categories.length,
            n: totals.reduce((a, b) => a + b, 0),
          })}
        </desc>
        <g id="background">
          <rect x={0} y={0} width={VBW} height={VBH} fill={plotBg} />
        </g>
        {title && (
          <g id="title">
            <text
              x={M.left + plotWidth / 2}
              y={12 + fs + 2}
              fontSize={fs + 3}
              fontWeight={700}
              fontFamily={FONT}
              fill="#111111"
              textAnchor="middle"
            >
              {title}
            </text>
          </g>
        )}
        {showGrid && (
          <g id="grid">
            {ticks.map((t) => (
              <line
                key={t}
                x1={M.left}
                x2={M.left + plotWidth}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke={gridColor}
                strokeWidth={1}
              />
            ))}
          </g>
        )}

        {isProp ? (
          <g id="bars">
            {summaries.map((s, i) => {
              const p = s.props[0];
              const [x0, x1] = spans[i];
              const top = yOf(Number.isFinite(p.p) ? p.p : 0);
              return (
                <rect
                  key={i}
                  id={`bar-${svgSafeId(s.group)}`}
                  x={M.left + x0}
                  y={top}
                  width={Math.max(0, x1 - x0)}
                  height={M.top + plotHeight - top}
                  fill={groupColors[i % groupColors.length]}
                  stroke={barOutline ? "#000000" : "none"}
                  strokeWidth={barOutline ? barOutlineWidth : 0}
                >
                  <title>
                    {`${s.group}: ${s.counts[0]}/${s.n} = ${(100 * p.p).toFixed(1)} % [${(
                      100 * p.lower
                    ).toFixed(1)}, ${(100 * p.upper).toFixed(1)}]`}
                  </title>
                </rect>
              );
            })}
          </g>
        ) : (
          <g id="segments">
            {table.counts.map((row, i) => {
              const [x0, x1] = spans[i];
              const w = Math.max(0, x1 - x0);
              const n = totals[i];
              return (
                <g key={i} id={`group-${svgSafeId(table.groups[i])}`}>
                  {stackSegments(row).map((sg) => {
                    const yTop = yOf(sg.y1);
                    const h = yOf(sg.y0) - yTop;
                    if (h <= 0) return null;
                    const fill = colors[sg.category % colors.length];
                    const label =
                      segmentLabels === "percent"
                        ? `${Math.round((100 * sg.count) / n)} %`
                        : segmentLabels === "count"
                          ? String(sg.count)
                          : "";
                    const fits = label !== "" && h >= fs + 2 && textW(label, fs - 1) <= w - 4;
                    return (
                      <g key={sg.category}>
                        <rect
                          x={M.left + x0}
                          y={yTop}
                          width={w}
                          height={h}
                          fill={fill}
                          stroke={barOutline ? "#000000" : "#ffffff"}
                          strokeWidth={barOutline ? barOutlineWidth : 0.8}
                        >
                          <title>
                            {`${table.groups[i]} · ${table.categories[sg.category]}: ${sg.count}/${n} (${(
                              (100 * sg.count) /
                              n
                            ).toFixed(1)} %)`}
                          </title>
                        </rect>
                        {fits && (
                          <text
                            x={M.left + x0 + w / 2}
                            y={yTop + h / 2}
                            dominantBaseline="central"
                            textAnchor="middle"
                            fontSize={fs - 1}
                            fontFamily={FONT}
                            fill={inkOn(fill)}
                          >
                            {label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        )}

        {isProp && showCI && (
          <g id="ci-whiskers">
            {summaries.map((s, i) => {
              const p = s.props[0];
              if (!Number.isFinite(p.lower)) return null;
              const x = centre(i);
              const cap = Math.min(10, (spans[i][1] - spans[i][0]) / 4);
              const yl = yOf(p.lower);
              const yu = yOf(p.upper);
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={yl} y2={yu} stroke="#111111" strokeWidth={1.3} />
                  <line
                    x1={x - cap}
                    x2={x + cap}
                    y1={yu}
                    y2={yu}
                    stroke="#111111"
                    strokeWidth={1.3}
                  />
                  <line
                    x1={x - cap}
                    x2={x + cap}
                    y1={yl}
                    y2={yl}
                    stroke="#111111"
                    strokeWidth={1.3}
                  />
                </g>
              );
            })}
          </g>
        )}

        <g id="axis-y">
          <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotHeight} stroke={AXIS} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left - 5} x2={M.left} y1={yOf(t)} y2={yOf(t)} stroke={AXIS} />
              <text
                x={M.left - 8}
                y={yOf(t)}
                dominantBaseline="central"
                textAnchor="end"
                fontSize={fs}
                fontFamily={FONT}
                fill={AXIS}
              >
                {`${Math.round(t * 100)} %`}
              </text>
            </g>
          ))}
          <text
            x={12}
            y={M.top + plotHeight / 2}
            transform={`rotate(-90,12,${M.top + plotHeight / 2})`}
            dominantBaseline="hanging"
            textAnchor="middle"
            fontSize={fs}
            fontFamily={FONT}
            fill={AXIS}
          >
            {yTitle}
          </text>
        </g>

        <g id="axis-x">
          <line
            x1={M.left}
            x2={M.left + plotWidth}
            y1={M.top + plotHeight}
            y2={M.top + plotHeight}
            stroke={AXIS}
          />
          {table.groups.map((_, i) => groupLabel(i))}
        </g>

        {showN && (
          <g id="n-labels">
            {table.groups.map((_, i) => (
              <text
                key={i}
                x={centre(i)}
                y={M.top + plotHeight + 14 + xLabelH + fs - 4}
                fontSize={fs - 1}
                fontFamily={FONT}
                fill="#666666"
                textAnchor="middle"
              >
                {isProp ? `${summaries[i].counts[0]}/${summaries[i].n}` : `n = ${totals[i]}`}
              </text>
            ))}
          </g>
        )}

        {annotation === "brackets" && (
          <SignificanceBrackets
            pairs={leveled}
            axisCoord={centre}
            baseline={M.top - 8}
            orientation="vertical-top"
            levelStep={BRACKET_STEP}
            fontSize={fs}
            stroke="#333333"
            textColor="#222222"
          />
        )}
        {showCld && (
          <CldLabels
            labels={cld}
            axisCoord={centre}
            crossCoord={M.top - 6}
            orientation="vertical-top"
            fontSize={fs + 1}
            textColor="#222222"
          />
        )}

        {!isProp && (
          <g id="legend">
            {table.categories.map((c, ci) => {
              const lx = M.left + plotWidth + 18;
              const ly = M.top + 4 + (table.categories.length - 1 - ci) * (fs + 8);
              return (
                <g key={ci} id={`legend-${svgSafeId(c)}`}>
                  <rect
                    x={lx}
                    y={ly}
                    width={fs}
                    height={fs}
                    fill={colors[ci % colors.length]}
                    stroke="#333333"
                    strokeWidth={0.5}
                  />
                  <text
                    x={lx + fs + 6}
                    y={ly + fs / 2}
                    dominantBaseline="central"
                    fontSize={fs}
                    fontFamily={FONT}
                    fill={AXIS}
                  >
                    {c}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
    );
  })
);

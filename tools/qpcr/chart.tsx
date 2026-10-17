// QpcrChart — one facet per target gene. Bars (or dots) show each group's
// geometric-mean fold change (mean −ΔΔCt back-transformed) with SEM / SD /
// 95 % CI error bars; box plots show median / quartiles / Tukey whiskers of
// the replicates on the plotted axis. Biological replicates as points, a
// dashed line at fold change 1, and significance from the ΔCt tests.
// Vertical or horizontal; an optional custom value range (shared by every
// panel) clips the data layers. Y scale: log2 fold change
// (default), linear fold change, or −ΔΔCt. Without a calibrator ("refs"
// normalisation) the same axes show 2^−ΔCt / −ΔCt, bars rise from the axis
// floor and there is no FC = 1 line. With the calibrator column hidden, the
// FC = 1 line stays and its comparisons show as "vs control" stars above the
// other groups, explained by a footnote. Hex literals only inside the SVG.

import { CldLabels, SignificanceBrackets, assignBracketLevels } from "../_shell";
import { svgSafeId } from "../_core/svg-export";
import { makeTicks } from "../_core/scale";
import { quartiles } from "../_core/descriptive";
import { errorBounds, parseAxisBound, visibleGene } from "./helpers";
import type { ErrorBarType, GeneAnalysis, QpcrChartProps, QpcrChartStyle, YScale } from "./helpers";
import { tt } from "./i18n";

const { forwardRef, memo } = React;

const FONT = "sans-serif";
const AXIS = "#333333";
const BRACKET_STEP = 16;

function textW(s: string, fs: number): number {
  return s.length * fs * 0.58;
}

// Value on the plotted axis for a −ΔΔCt value L.
function toAxis(L: number, scale: YScale): number {
  return scale === "linear" ? Math.pow(2, L) : L;
}

// Fold change label for an integer log2 tick: 4, 2, 1, 0.5, 0.25, 1/8 …
function fcLabel(k: number): string {
  if (k >= 0) return String(Math.pow(2, k));
  if (k >= -3) return String(Math.pow(2, k));
  return `1/${Math.pow(2, -k)}`;
}

interface Tick {
  v: number;
  label: string;
}

function axisTicks(lo: number, hi: number, scale: YScale): Tick[] {
  if (scale === "log2") {
    // One tick per doubling while that gives ≤ 10 labels (coarser beyond),
    // aligned to 0 so FC = 1 is always a tick.
    const step = Math.max(1, Math.ceil((Math.ceil(hi) - Math.floor(lo)) / 10));
    const a = Math.floor(lo / step) * step;
    const b = Math.ceil(hi / step) * step;
    const out: Tick[] = [];
    for (let k = a; k <= b; k += step) {
      if (k >= lo - 1e-9 && k <= hi + 1e-9) out.push({ v: k, label: fcLabel(k) });
    }
    return out;
  }
  return makeTicks(lo, hi, 5).map((v) => ({ v, label: String(v) }));
}

interface FacetAxis {
  lo: number;
  hi: number;
  ticks: Tick[];
}

// Axis range over bars, error bars, boxes and points; with a calibrator it
// also spans the FC = 1 baseline. Custom bounds (axis units) replace the
// automatic ones; an inverted pair is ignored.
function facetAxis(
  g: GeneAnalysis,
  scale: YScale,
  relToControl: boolean,
  style: QpcrChartStyle,
  errorBar: ErrorBarType,
  showPoints: boolean,
  bounds: { lo: number | null; hi: number | null }
): FacetAxis {
  const vals: number[] = relToControl ? [toAxis(0, scale)] : [];
  if (style !== "box") {
    g.summaries.forEach((s) => {
      vals.push(toAxis(s.meanL, scale));
      const e = errorBounds(s, errorBar);
      if (e) vals.push(toAxis(e.lo, scale), toAxis(e.hi, scale));
    });
  }
  if (showPoints || style === "box") g.rows.forEach((r) => vals.push(toAxis(r.L, scale)));
  const finite = vals.filter(Number.isFinite);
  let lo = finite.length ? Math.min(...finite) : 0;
  let hi = finite.length ? Math.max(...finite) : 1;
  if (scale === "linear") lo = 0;
  const pad = (hi - lo || 1) * 0.08;
  if (scale !== "linear") lo -= pad;
  hi += pad;
  const cLo = bounds.lo ?? lo;
  const cHi = bounds.hi ?? hi;
  if ((bounds.lo !== null || bounds.hi !== null) && cLo < cHi) {
    return { lo: cLo, hi: cHi, ticks: axisTicks(cLo, cHi, scale) };
  }
  const ticks = axisTicks(lo, hi, scale);
  if (scale !== "log2" && ticks.length) {
    lo = Math.min(lo, ticks[0].v);
    hi = Math.max(hi, ticks[ticks.length - 1].v);
  }
  return { lo, hi, ticks };
}

export const QpcrChart = memo(
  forwardRef<SVGSVGElement, QpcrChartProps>(function QpcrChart(props, ref) {
    const {
      genes: allGenes,
      annotations,
      colors,
      groupOrder,
      normalize,
      control,
      yScale,
      chartStyle,
      showPoints,
      errorBar: errorBarProp,
      showCalibrator,
      horizontal,
      pointSize,
      jitterWidth,
      fillOpacity,
      yMin,
      yMax,
      yLabel,
      barOutline,
      barOutlineWidth,
      barWidthFrac,
      facetWidth: fw,
      facetHeight: fh,
      facetCols,
      xLabelAngle,
      tickFontSize: fs,
      title,
      plotBg,
      showGrid,
      gridColor,
    } = props;

    // Calibrator hidden → drawn genes drop its column (annotations already
    // index the visible groups).
    const hidden = normalize === "control" && !showCalibrator ? control : null;
    const genes = allGenes.map((g) => visibleGene(g, hidden));
    // Boxes summarise the replicates themselves: no mean ± error bars.
    const errorBar: ErrorBarType = chartStyle === "box" ? "none" : errorBarProp;

    // Hover label: fold change, or 2^−ΔCt (often ≪ 1, so significant digits).
    const valLabel = normalize === "control" ? "FC" : "2^−ΔCt";
    const fmtVal = (L: number): string =>
      normalize === "control" ? Math.pow(2, L).toFixed(3) : Math.pow(2, L).toPrecision(3);
    const colorOf = (g: string): string =>
      colors[Math.max(0, groupOrder.indexOf(g)) % Math.max(1, colors.length)];

    const relToControl = normalize === "control";
    const autoTitle = relToControl
      ? yScale === "log2"
        ? tt("qpcr.chart.yLog2")
        : yScale === "linear"
          ? tt("qpcr.chart.yLinear")
          : tt("qpcr.chart.yDdct")
      : yScale === "log2"
        ? tt("qpcr.chart.yLog2Rel")
        : yScale === "linear"
          ? tt("qpcr.chart.yLinearRel")
          : tt("qpcr.chart.yDct");
    const yTitle = yLabel.trim() || autoTitle;
    const bounds = { lo: parseAxisBound(yMin, yScale), hi: parseAxisBound(yMax, yScale) };
    const axes = genes.map((g) =>
      facetAxis(g, yScale, relToControl, chartStyle, errorBar, showPoints, bounds)
    );

    // Shared facet geometry so panels line up.
    const angle = horizontal ? 0 : Math.max(-90, Math.min(0, xLabelAngle || 0));
    const rad = (Math.abs(angle) * Math.PI) / 180;
    const allGroups = [...new Set(genes.flatMap((g) => g.groups))];
    const maxLabelW = Math.max(0, ...allGroups.map((g) => textW(g, fs)));
    const xLabelH = angle === 0 ? fs + 6 : maxLabelW * Math.sin(rad) + fs * Math.cos(rad) + 8;
    const levels = annotations.map((a) =>
      a.brackets.length ? Math.max(...assignBracketLevels(a.brackets).map((b) => b._level)) + 1 : 0
    );
    const maxLevels = Math.max(0, ...levels);
    const cldW = Math.max(0, ...annotations.flatMap((a) => a.cld.map((c) => textW(c, fs))));
    const hasCld = cldW > 0;
    const hasVs = annotations.some((a) => a.vsControl.some((c) => c !== ""));
    // Annotation band beyond the plot (above it, or right of it when
    // horizontal): "vs control" stars nearest the data, brackets beyond.
    const vsBand = hasVs ? (horizontal ? textW("****", fs - 1) + 8 : fs + 6) : 0;
    const bracketBand = maxLevels
      ? horizontal
        ? 10 + (maxLevels - 1) * BRACKET_STEP + fs + 4
        : maxLevels * BRACKET_STEP + 6
      : 0;
    const annotBand = Math.max(
      vsBand + bracketBand,
      hasCld ? (horizontal ? cldW + 10 : fs + 8) : 0
    );
    const tickW = Math.max(
      textW("0.125", fs),
      ...axes.flatMap((a) => a.ticks.map((t) => textW(t.label, fs - 1)))
    );
    const FM = horizontal
      ? {
          left: maxLabelW + 14,
          right: 12 + annotBand,
          top: fs + 12,
          bottom: 2 * fs + 22,
        }
      : {
          left: 34 + fs + tickW,
          right: 12,
          top: fs + 12 + annotBand,
          bottom: xLabelH + 10,
        };
    const cellW = FM.left + fw + FM.right;
    const cellH = FM.top + fh + FM.bottom;
    const cols = Math.max(1, Math.min(facetCols, genes.length));
    const rows = Math.ceil(genes.length / cols);
    const titleH = title ? fs + 16 : 0;
    const footH = hasVs ? fs + 8 : 0;
    const VBW = cols * cellW;
    const VBH = titleH + rows * cellH + footH;

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VBW} ${Math.max(VBH, 40)}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title || tt("qpcr.chart.fallbackTitle")}
      >
        <title>{title || tt("qpcr.chart.fallbackTitle")}</title>
        <desc>
          {relToControl
            ? tt("qpcr.chart.desc", { genes: genes.map((g) => g.gene).join(", "), control })
            : tt("qpcr.chart.descRefs", { genes: genes.map((g) => g.gene).join(", ") })}
        </desc>
        <g id="background">
          <rect x={0} y={0} width={VBW} height={Math.max(VBH, 40)} fill={plotBg} />
        </g>
        {title && (
          <g id="title">
            <text
              x={VBW / 2}
              y={fs + 6}
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
        {genes.map((g, gi) => {
          const gid = svgSafeId(g.gene);
          const ox = (gi % cols) * cellW;
          const oy = titleH + Math.floor(gi / cols) * cellH;
          const left = ox + FM.left;
          const top = oy + FM.top;
          const k = g.groups.length;
          // Categorical axis runs along x (vertical chart) or y (horizontal).
          const catLen = horizontal ? fh : fw;
          const slot = catLen / Math.max(1, k);
          const cat = (i: number): number => (horizontal ? top : left) + slot * (i + 0.5);
          const bw = slot * barWidthFrac;
          const { lo, hi, ticks } = axes[gi];
          const span = hi - lo || 1;
          const val = (v: number): number =>
            horizontal ? left + fw * ((v - lo) / span) : top + fh * (1 - (v - lo) / span);
          // (category coord, value coord) → SVG x / y.
          const X = (c: number, v: number): number => (horizontal ? v : c);
          const Y = (c: number, v: number): number => (horizontal ? c : v);
          const seg = (c1: number, v1: number, c2: number, v2: number) => ({
            x1: X(c1, v1),
            y1: Y(c1, v1),
            x2: X(c2, v2),
            y2: Y(c2, v2),
          });
          // Rectangle spanning [c − w/2, c + w/2] × [v1, v2].
          const box = (c: number, w: number, v1: number, v2: number) =>
            horizontal
              ? { x: Math.min(v1, v2), y: c - w / 2, width: Math.abs(v2 - v1), height: w }
              : { x: c - w / 2, y: Math.min(v1, v2), width: w, height: Math.abs(v2 - v1) };
          const catStart = horizontal ? top : left;
          const catEnd = catStart + catLen;
          // On a log axis bars rise from FC = 1 with a calibrator (no natural
          // 1 without one: the axis floor); on a linear axis from 0, like
          // any linear bar chart (FC = 1 keeps its dashed line).
          const oneAt = val(toAxis(0, yScale)); // FC = 1
          const base = yScale === "linear" ? val(0) : relToControl ? oneAt : val(lo);
          const ann = annotations[gi];
          const leveled = assignBracketLevels(ann.brackets);
          const clipId = `clip-${gid}`;
          const outline = barOutline ? barOutlineWidth : 0;
          // Annotation anchors just outside the plot area.
          const annotEdge = horizontal ? left + fw + 6 : top - 6;

          return (
            <g key={g.gene} id={`facet-${gid}`}>
              <defs>
                <clipPath id={clipId}>
                  <rect x={left} y={top} width={fw} height={fh} />
                </clipPath>
              </defs>
              <text
                x={left + fw / 2}
                y={oy + fs + 4}
                fontSize={fs + 1}
                fontWeight={700}
                fontStyle="italic"
                fontFamily={FONT}
                fill="#111111"
                textAnchor="middle"
              >
                {g.gene}
              </text>
              {showGrid && (
                <g id={`grid-${gid}`}>
                  {ticks.map((t) => (
                    <line
                      key={t.v}
                      {...seg(catStart, val(t.v), catEnd, val(t.v))}
                      stroke={gridColor}
                    />
                  ))}
                </g>
              )}
              <g clipPath={`url(#${clipId})`}>
                {relToControl && (
                  <line
                    id={`reference-line-${gid}`}
                    {...seg(catStart, oneAt, catEnd, oneAt)}
                    stroke="#888888"
                    strokeDasharray="4,3"
                  />
                )}
                <g id={`bars-${gid}`}>
                  {chartStyle === "box"
                    ? g.groups.map((grp, i) => {
                        const q = quartiles(
                          g.rows.filter((r) => r.group === grp).map((r) => toAxis(r.L, yScale))
                        );
                        if (!q) return null;
                        const c = cat(i);
                        const cap = bw * 0.3;
                        return (
                          <g key={grp}>
                            <line {...seg(c, val(q.wLo), c, val(q.q1))} stroke="#222222" />
                            <line {...seg(c, val(q.q3), c, val(q.wHi))} stroke="#222222" />
                            <line
                              {...seg(c - cap / 2, val(q.wLo), c + cap / 2, val(q.wLo))}
                              stroke="#222222"
                            />
                            <line
                              {...seg(c - cap / 2, val(q.wHi), c + cap / 2, val(q.wHi))}
                              stroke="#222222"
                            />
                            <rect
                              {...box(c, bw, val(q.q1), val(q.q3))}
                              fill={colorOf(grp)}
                              fillOpacity={fillOpacity}
                              stroke="#222222"
                              strokeWidth={Math.max(1, outline)}
                            >
                              <title>{`${g.gene} · ${grp}: median ${q.med.toPrecision(3)} (n = ${q.n})`}</title>
                            </rect>
                            <line
                              {...seg(c - bw / 2, val(q.med), c + bw / 2, val(q.med))}
                              stroke="#111111"
                              strokeWidth={2}
                            />
                          </g>
                        );
                      })
                    : g.summaries.map((s, i) => {
                        const v = val(toAxis(s.meanL, yScale));
                        const fill = colorOf(s.group);
                        const tip = `${g.gene} · ${s.group}: ${valLabel} ${fmtVal(s.meanL)} (n = ${s.n})`;
                        return chartStyle === "bar" ? (
                          <rect
                            key={s.group}
                            {...box(cat(i), bw, base, v)}
                            fill={fill}
                            fillOpacity={fillOpacity}
                            stroke={barOutline ? "#000000" : "none"}
                            strokeWidth={outline}
                          >
                            <title>{tip}</title>
                          </rect>
                        ) : (
                          <circle
                            key={s.group}
                            cx={X(cat(i), v)}
                            cy={Y(cat(i), v)}
                            r={Math.max(4, fs * 0.42)}
                            fill={fill}
                            fillOpacity={fillOpacity}
                            stroke="#000000"
                            strokeWidth={outline}
                          >
                            <title>{tip}</title>
                          </circle>
                        );
                      })}
                </g>
                {errorBar !== "none" && (
                  <g id={`error-bars-${gid}`}>
                    {g.summaries.map((s, i) => {
                      const e = errorBounds(s, errorBar);
                      if (!e) return null;
                      const a = val(toAxis(e.lo, yScale));
                      const b = val(toAxis(e.hi, yScale));
                      const c = cat(i);
                      const cap = Math.min(8, bw / 4);
                      return (
                        <g key={s.group}>
                          <line {...seg(c, a, c, b)} stroke="#111111" strokeWidth={1.3} />
                          <line
                            {...seg(c - cap, a, c + cap, a)}
                            stroke="#111111"
                            strokeWidth={1.3}
                          />
                          <line
                            {...seg(c - cap, b, c + cap, b)}
                            stroke="#111111"
                            strokeWidth={1.3}
                          />
                        </g>
                      );
                    })}
                  </g>
                )}
                {showPoints && (
                  <g id={`points-${gid}`}>
                    {g.rows.map((r, ri) => {
                      const i = g.groups.indexOf(r.group);
                      const jitter = (((ri * 0.618034) % 1) - 0.5) * bw * jitterWidth;
                      const c = cat(i) + jitter;
                      const v = val(toAxis(r.L, yScale));
                      return (
                        <circle
                          key={`${r.group}-${r.sample}`}
                          cx={X(c, v)}
                          cy={Y(c, v)}
                          r={pointSize}
                          fill="#ffffff"
                          stroke="#222222"
                          strokeWidth={1}
                        >
                          <title>{`${r.group} ${r.sample}: ΔCt ${r.dCt.toFixed(2)}, ${valLabel} ${fmtVal(r.L)}`}</title>
                        </circle>
                      );
                    })}
                  </g>
                )}
              </g>
              <g id={`axis-y-${gid}`}>
                {horizontal ? (
                  <line x1={left} x2={left + fw} y1={top + fh} y2={top + fh} stroke={AXIS} />
                ) : (
                  <line x1={left} x2={left} y1={top} y2={top + fh} stroke={AXIS} />
                )}
                {ticks.map((t) =>
                  horizontal ? (
                    <g key={t.v}>
                      <line
                        x1={val(t.v)}
                        x2={val(t.v)}
                        y1={top + fh}
                        y2={top + fh + 4}
                        stroke={AXIS}
                      />
                      <text
                        x={val(t.v)}
                        y={top + fh + 6 + fs}
                        textAnchor="middle"
                        fontSize={fs - 1}
                        fontFamily={FONT}
                        fill={AXIS}
                      >
                        {t.label}
                      </text>
                    </g>
                  ) : (
                    <g key={t.v}>
                      <line x1={left - 4} x2={left} y1={val(t.v)} y2={val(t.v)} stroke={AXIS} />
                      <text
                        x={left - 7}
                        y={val(t.v)}
                        dominantBaseline="central"
                        textAnchor="end"
                        fontSize={fs - 1}
                        fontFamily={FONT}
                        fill={AXIS}
                      >
                        {t.label}
                      </text>
                    </g>
                  )
                )}
                {horizontal ? (
                  <text
                    x={left + fw / 2}
                    y={top + fh + 2 * fs + 14}
                    textAnchor="middle"
                    fontSize={fs - 1}
                    fontFamily={FONT}
                    fill={AXIS}
                  >
                    {yTitle}
                  </text>
                ) : (
                  <text
                    x={ox + 10}
                    y={top + fh / 2}
                    transform={`rotate(-90,${ox + 10},${top + fh / 2})`}
                    dominantBaseline="hanging"
                    textAnchor="middle"
                    fontSize={fs - 1}
                    fontFamily={FONT}
                    fill={AXIS}
                  >
                    {yTitle}
                  </text>
                )}
              </g>
              <g id={`axis-x-${gid}`}>
                {horizontal ? (
                  <line x1={left} x2={left} y1={top} y2={top + fh} stroke={AXIS} />
                ) : (
                  <line x1={left} x2={left + fw} y1={top + fh} y2={top + fh} stroke={AXIS} />
                )}
                {g.groups.map((grp, i) => {
                  const weight = grp === control ? 700 : 400;
                  if (horizontal) {
                    return (
                      <text
                        key={grp}
                        x={left - 6}
                        y={cat(i)}
                        textAnchor="end"
                        dominantBaseline="central"
                        fontSize={fs}
                        fontFamily={FONT}
                        fill={AXIS}
                        fontWeight={weight}
                      >
                        {grp}
                      </text>
                    );
                  }
                  const x = cat(i);
                  const ly = top + fh + 6 + fs * 0.7;
                  return angle === 0 ? (
                    <text
                      key={grp}
                      x={x}
                      y={top + fh + 6 + fs}
                      textAnchor="middle"
                      fontSize={fs}
                      fontFamily={FONT}
                      fill={AXIS}
                      fontWeight={weight}
                    >
                      {grp}
                    </text>
                  ) : (
                    <text
                      key={grp}
                      x={x}
                      y={ly}
                      textAnchor="end"
                      transform={`rotate(${angle},${x},${ly})`}
                      fontSize={fs}
                      fontFamily={FONT}
                      fill={AXIS}
                      fontWeight={weight}
                    >
                      {grp}
                    </text>
                  );
                })}
              </g>
              <SignificanceBrackets
                pairs={leveled}
                axisCoord={cat}
                baseline={horizontal ? annotEdge + vsBand + 4 : annotEdge - vsBand}
                orientation={horizontal ? "horizontal-right" : "vertical-top"}
                levelStep={BRACKET_STEP}
                fontSize={fs - 1}
                stroke="#333333"
                textColor="#222222"
              />
              {ann.cld.some((c) => c !== "") && (
                <CldLabels
                  labels={ann.cld.map((c) => (c === "" ? null : c))}
                  axisCoord={cat}
                  crossCoord={horizontal ? annotEdge + cldW : annotEdge}
                  orientation={horizontal ? "horizontal-right" : "vertical-top"}
                  fontSize={fs}
                  textColor="#222222"
                />
              )}
              {ann.vsControl.some((c) => c !== "") && (
                <g id={`vs-control-${gid}`}>
                  {ann.vsControl.map((c, i) =>
                    c === "" ? null : (
                      <text
                        key={i}
                        x={horizontal ? annotEdge : cat(i)}
                        y={horizontal ? cat(i) : annotEdge}
                        textAnchor={horizontal ? "start" : "middle"}
                        dominantBaseline={horizontal ? "central" : undefined}
                        fontSize={fs - 1}
                        fontWeight={700}
                        fontFamily={FONT}
                        fill="#222222"
                      >
                        {c}
                      </text>
                    )
                  )}
                </g>
              )}
            </g>
          );
        })}
        {hasVs && (
          <g id="footnote">
            <text x={8} y={VBH - 8} fontSize={fs - 2} fontFamily={FONT} fill="#555555">
              {tt(horizontal ? "qpcr.chart.vsControlNoteH" : "qpcr.chart.vsControlNote", {
                control: control,
              })}
            </text>
          </g>
        )}
      </svg>
    );
  })
);

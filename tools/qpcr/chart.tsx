// QpcrChart — one facet per target gene. Bars (or dots) show each group's
// geometric-mean fold change (mean −ΔΔCt back-transformed) with its 95 % CI,
// biological replicates as points, a dashed line at fold change 1, and
// significance from the ΔCt tests. Y scale: log2 fold change (default),
// linear fold change, or −ΔΔCt. Hex literals only inside the SVG.

import { CldLabels, SignificanceBrackets, assignBracketLevels } from "../_shell";
import { svgSafeId } from "../_core/svg-export";
import { makeTicks } from "../_core/scale";
import type { QpcrChartProps, YScale } from "./helpers";
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
    // Integer log2 steps, aligned to 0 so FC = 1 is always a tick.
    const step = Math.max(1, Math.ceil((Math.ceil(hi) - Math.floor(lo)) / 7));
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

export const QpcrChart = memo(
  forwardRef<SVGSVGElement, QpcrChartProps>(function QpcrChart(props, ref) {
    const {
      genes,
      annotations,
      colors,
      groupOrder,
      control,
      yScale,
      chartStyle,
      showPoints,
      showCI,
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

    const colorOf = (g: string): string =>
      colors[Math.max(0, groupOrder.indexOf(g)) % Math.max(1, colors.length)];

    // Shared facet geometry so panels line up.
    const angle = Math.max(-90, Math.min(0, xLabelAngle || 0));
    const rad = (Math.abs(angle) * Math.PI) / 180;
    const allGroups = [...new Set(genes.flatMap((g) => g.groups))];
    const maxLabelW = Math.max(0, ...allGroups.map((g) => textW(g, fs)));
    const xLabelH = angle === 0 ? fs + 6 : maxLabelW * Math.sin(rad) + fs * Math.cos(rad) + 8;
    const levels = annotations.map((a) =>
      a.brackets.length ? Math.max(...assignBracketLevels(a.brackets).map((b) => b._level)) + 1 : 0
    );
    const hasCld = annotations.some((a) => a.cld.some((c) => c !== ""));
    const annotH = Math.max(
      0,
      ...levels.map((l) => (l ? l * BRACKET_STEP + 6 : 0)),
      hasCld ? fs + 8 : 0
    );
    const yTitle =
      yScale === "log2"
        ? tt("qpcr.chart.yLog2")
        : yScale === "linear"
          ? tt("qpcr.chart.yLinear")
          : tt("qpcr.chart.yDdct");
    const FM = {
      left: 34 + fs + textW("0.125", fs),
      right: 12,
      top: fs + 12 + annotH,
      bottom: xLabelH + 10,
    };
    const cellW = FM.left + fw + FM.right;
    const cellH = FM.top + fh + FM.bottom;
    const cols = Math.max(1, Math.min(facetCols, genes.length));
    const rows = Math.ceil(genes.length / cols);
    const titleH = title ? fs + 16 : 0;
    const VBW = cols * cellW;
    const VBH = titleH + rows * cellH;

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
          {tt("qpcr.chart.desc", { genes: genes.map((g) => g.gene).join(", "), control })}
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
          const ox = (gi % cols) * cellW;
          const oy = titleH + Math.floor(gi / cols) * cellH;
          const left = ox + FM.left;
          const top = oy + FM.top;
          const k = g.groups.length;
          const slot = fw / Math.max(1, k);
          const cx = (i: number): number => left + slot * (i + 0.5);
          const bw = slot * barWidthFrac;

          // Axis range over points, CIs and the FC = 1 baseline.
          const vals: number[] = [toAxis(0, yScale)];
          g.summaries.forEach((s) => {
            vals.push(toAxis(s.meanL, yScale));
            if (showCI && Number.isFinite(s.lo))
              vals.push(toAxis(s.lo, yScale), toAxis(s.hi, yScale));
          });
          if (showPoints) g.rows.forEach((r) => vals.push(toAxis(r.L, yScale)));
          let lo = Math.min(...vals.filter(Number.isFinite));
          let hi = Math.max(...vals.filter(Number.isFinite));
          if (yScale === "linear") lo = 0;
          const pad = (hi - lo || 1) * 0.08;
          if (yScale !== "linear") lo -= pad;
          hi += pad;
          const ticks = axisTicks(lo, hi, yScale);
          if (yScale !== "log2" && ticks.length) {
            lo = Math.min(lo, ticks[0].v);
            hi = Math.max(hi, ticks[ticks.length - 1].v);
          }
          const y = (v: number): number => top + fh * (1 - (v - lo) / (hi - lo || 1));
          const base = y(toAxis(0, yScale));
          const ann = annotations[gi];
          const leveled = assignBracketLevels(ann.brackets);

          return (
            <g key={g.gene} id={`facet-${svgSafeId(g.gene)}`}>
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
                <g id={`grid-${svgSafeId(g.gene)}`}>
                  {ticks.map((t) => (
                    <line
                      key={t.v}
                      x1={left}
                      x2={left + fw}
                      y1={y(t.v)}
                      y2={y(t.v)}
                      stroke={gridColor}
                    />
                  ))}
                </g>
              )}
              <line
                id={`reference-line-${svgSafeId(g.gene)}`}
                x1={left}
                x2={left + fw}
                y1={base}
                y2={base}
                stroke="#888888"
                strokeDasharray="4,3"
              />
              <g id={`bars-${svgSafeId(g.gene)}`}>
                {g.summaries.map((s, i) => {
                  const v = y(toAxis(s.meanL, yScale));
                  const fill = colorOf(s.group);
                  return chartStyle === "bar" ? (
                    <rect
                      key={s.group}
                      x={cx(i) - bw / 2}
                      y={Math.min(v, base)}
                      width={bw}
                      height={Math.abs(base - v)}
                      fill={fill}
                      stroke={barOutline ? "#000000" : "none"}
                      strokeWidth={barOutline ? barOutlineWidth : 0}
                    >
                      <title>{`${g.gene} · ${s.group}: FC ${Math.pow(2, s.meanL).toFixed(3)} (n = ${s.n})`}</title>
                    </rect>
                  ) : (
                    <circle
                      key={s.group}
                      cx={cx(i)}
                      cy={v}
                      r={Math.max(4, fs * 0.42)}
                      fill={fill}
                      stroke="#000000"
                      strokeWidth={barOutline ? barOutlineWidth : 0}
                    />
                  );
                })}
              </g>
              {showCI && (
                <g id={`ci-whiskers-${svgSafeId(g.gene)}`}>
                  {g.summaries.map((s, i) => {
                    if (!Number.isFinite(s.lo)) return null;
                    const a = y(toAxis(s.lo, yScale));
                    const b = y(toAxis(s.hi, yScale));
                    const cap = Math.min(8, bw / 4);
                    return (
                      <g key={s.group}>
                        <line
                          x1={cx(i)}
                          x2={cx(i)}
                          y1={a}
                          y2={b}
                          stroke="#111111"
                          strokeWidth={1.3}
                        />
                        <line
                          x1={cx(i) - cap}
                          x2={cx(i) + cap}
                          y1={a}
                          y2={a}
                          stroke="#111111"
                          strokeWidth={1.3}
                        />
                        <line
                          x1={cx(i) - cap}
                          x2={cx(i) + cap}
                          y1={b}
                          y2={b}
                          stroke="#111111"
                          strokeWidth={1.3}
                        />
                      </g>
                    );
                  })}
                </g>
              )}
              {showPoints && (
                <g id={`points-${svgSafeId(g.gene)}`}>
                  {g.rows.map((r, ri) => {
                    const i = g.groups.indexOf(r.group);
                    const jitter = (((ri * 0.618034) % 1) - 0.5) * Math.min(bw * 0.6, 24);
                    return (
                      <circle
                        key={`${r.group}-${r.sample}`}
                        cx={cx(i) + jitter}
                        cy={y(toAxis(r.L, yScale))}
                        r={2.6}
                        fill="#ffffff"
                        stroke="#222222"
                        strokeWidth={1}
                      >
                        <title>{`${r.group} ${r.sample}: ΔCt ${r.dCt.toFixed(2)}, FC ${Math.pow(2, r.L).toFixed(3)}`}</title>
                      </circle>
                    );
                  })}
                </g>
              )}
              <g id={`axis-y-${svgSafeId(g.gene)}`}>
                <line x1={left} x2={left} y1={top} y2={top + fh} stroke={AXIS} />
                {ticks.map((t) => (
                  <g key={t.v}>
                    <line x1={left - 4} x2={left} y1={y(t.v)} y2={y(t.v)} stroke={AXIS} />
                    <text
                      x={left - 7}
                      y={y(t.v)}
                      dominantBaseline="central"
                      textAnchor="end"
                      fontSize={fs - 1}
                      fontFamily={FONT}
                      fill={AXIS}
                    >
                      {t.label}
                    </text>
                  </g>
                ))}
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
              </g>
              <g id={`axis-x-${svgSafeId(g.gene)}`}>
                <line x1={left} x2={left + fw} y1={top + fh} y2={top + fh} stroke={AXIS} />
                {g.groups.map((grp, i) => {
                  const x = cx(i);
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
                      fontWeight={grp === control ? 700 : 400}
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
                      fontWeight={grp === control ? 700 : 400}
                    >
                      {grp}
                    </text>
                  );
                })}
              </g>
              <SignificanceBrackets
                pairs={leveled}
                axisCoord={cx}
                baseline={top - 6}
                orientation="vertical-top"
                levelStep={BRACKET_STEP}
                fontSize={fs - 1}
                stroke="#333333"
                textColor="#222222"
              />
              {ann.cld.some((c) => c !== "") && (
                <CldLabels
                  labels={ann.cld.map((c) => (c === "" ? null : c))}
                  axisCoord={cx}
                  crossCoord={top - 6}
                  orientation="vertical-top"
                  fontSize={fs}
                  textColor="#222222"
                />
              )}
            </g>
          );
        })}
      </svg>
    );
  })
);

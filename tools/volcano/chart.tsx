// VolcanoChart — SVG renderer for volcano plots.
//
// Pure render component (forwardRef so the parent can grab the SVG node
// for download). All layout / classification / labelling has already
// happened upstream via tools/volcano/helpers.ts; this file just walks
// the prepared point list and emits the corresponding SVG primitives in
// named groups (so Inkscape users can hand-edit the export).
//
// The standard ambient globals (React, makeTicks, svgSafeId) come from
// tools/shared.bundle.js — same pattern as every other plot tool.

import {
  VOLCANO_DEFAULT_COLORS,
  VolcanoPoint,
  VolcanoClass,
  classifyPoint,
  negLog10P,
  pickTopLabels,
  layoutLabels,
  approxMonoCharWidth,
  PlacedLabel,
} from "./helpers";

const { forwardRef, useMemo } = React;

// Same canvas dimensions as scatter — keeps the export-default 800×500
// expectation consistent across XY tools.
export const VBW = 800;
export const VBH = 500;
export const MARGIN = { top: 28, right: 28, bottom: 56, left: 70 };

interface VolcanoChartProps {
  points: VolcanoPoint[];
  pFloor: number;
  fcCutoff: number;
  pCutoff: number;
  // Auto means "derive from data"; explicit numbers override.
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  xLabel: string;
  yLabel: string;
  title: string;
  subtitle: string;
  colors: { up: string; down: string; ns: string };
  pointRadius: number;
  pointAlpha: number;
  showRefLines: boolean;
  showLabels: boolean;
  topN: number;
  labelFontSize: number;
  showAxes: boolean;
  plotBg: string;
}

// Conventional fmt: keep the numeric labels readable on both axes. The
// y-axis is always -log10(p) (so usually 0..50ish, integers); the x-axis
// is log2FC (usually -10..+10, fractional).
function fmtTick(t: number): string {
  if (t === 0) return "0";
  if (Math.abs(t) >= 100) return t.toFixed(0);
  if (Math.abs(t) >= 10) return t.toFixed(1);
  return t.toFixed(2);
}

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
      topN,
      labelFontSize,
      showAxes,
      plotBg,
    } = props;

    const w = VBW - MARGIN.left - MARGIN.right;
    const h = VBH - MARGIN.top - MARGIN.bottom;

    // Derive auto-ranges from the data. Symmetric around 0 on the x-axis
    // (volcano convention — the centre of the plot is "no fold change") so
    // up and down points balance visually. Y-axis runs 0..max with a 5%
    // headroom so the highest -log10(p) point doesn't sit on the top frame.
    const { xMin, xMax, yMin, yMax } = useMemo(() => {
      let absMaxFc = 0;
      let maxNL = 0;
      for (const pt of points) {
        if (Number.isFinite(pt.log2fc)) {
          const a = Math.abs(pt.log2fc);
          if (a > absMaxFc) absMaxFc = a;
        }
        const nl = negLog10P(pt.p, pFloor);
        if (Number.isFinite(nl) && nl > maxNL) maxNL = nl;
      }
      // Pad to at least the cutoff so reference lines are visible even on
      // a flat dataset.
      absMaxFc = Math.max(absMaxFc, fcCutoff * 1.5, 1);
      maxNL = Math.max(maxNL, -Math.log10(pCutoff) * 1.5, 1);
      const autoXMin = -absMaxFc * 1.05;
      const autoXMax = absMaxFc * 1.05;
      const autoYMin = 0;
      const autoYMax = maxNL * 1.05;
      return {
        xMin: userXMin != null ? userXMin : autoXMin,
        xMax: userXMax != null ? userXMax : autoXMax,
        yMin: userYMin != null ? userYMin : autoYMin,
        yMax: userYMax != null ? userYMax : autoYMax,
      };
    }, [points, pFloor, fcCutoff, pCutoff, userXMin, userXMax, userYMin, userYMax]);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * w;
    const sy = (v: number) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
    const xTicks = makeTicks(xMin, xMax, 8);
    const yTicks = makeTicks(yMin, yMax, 6);

    // Pre-classify and pre-compute pixel coords once so the JSX walk is
    // purely a render of an already-shaped point list.
    const rendered = useMemo(() => {
      const out: Array<{
        pt: VolcanoPoint;
        cls: VolcanoClass;
        px: { x: number; y: number };
        nl: number;
      }> = [];
      for (const pt of points) {
        if (!Number.isFinite(pt.log2fc)) continue;
        const nl = negLog10P(pt.p, pFloor);
        const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
        out.push({
          pt,
          cls,
          nl,
          px: { x: sx(pt.log2fc), y: sy(nl) },
        });
      }
      // Render order: ns (background) → down → up so the significant
      // points sit on top and pop visually against the grey carpet.
      out.sort((a, b) => {
        const order = { ns: 0, down: 1, up: 2 } as Record<VolcanoClass, number>;
        return order[a.cls] - order[b.cls];
      });
      return out;
    }, [points, pFloor, fcCutoff, pCutoff, xMin, xMax, yMin, yMax]);

    // Top-N labels (only when enabled). Score ranks the same way the
    // helper did; we then translate point indices into pixel coordinates
    // via the same `rendered` array so labels track the points exactly.
    const labels: PlacedLabel[] = useMemo(() => {
      if (!showLabels || topN <= 0) return [];
      // pickTopLabels returns indices into the ORIGINAL points array. We
      // need to look those up in `rendered` (which has been filtered for
      // finite log2fc and reordered for z-stacking). Build an idx → render
      // map so the lookup is O(1).
      const renderByIdx = new Map<number, (typeof rendered)[number]>();
      for (const r of rendered) renderByIdx.set(r.pt.idx, r);
      const top = pickTopLabels(points, topN, fcCutoff, pCutoff, pFloor);
      const charW = approxMonoCharWidth(labelFontSize);
      const lineH = labelFontSize * 1.15;
      const inputs = top
        .map(({ idx }) => renderByIdx.get(points[idx].idx))
        .filter((r): r is (typeof rendered)[number] => r != null && r.pt.label != null)
        .map((r) => ({
          pointPx: { x: r.px.x - MARGIN.left, y: r.px.y - MARGIN.top },
          text: r.pt.label!,
          charWidth: charW,
          lineHeight: lineH,
        }));
      return layoutLabels(inputs, w, h);
    }, [showLabels, topN, points, rendered, fcCutoff, pCutoff, pFloor, labelFontSize, w, h]);

    // Reference-line coordinates: vertical at ±fcCutoff (in x-axis units),
    // horizontal at -log10(pCutoff) (in y-axis units). Only drawn when
    // they fall inside the visible range — a manual axis range that
    // excludes the cutoff shouldn't paint a line on the frame itself.
    const refXLeft = -fcCutoff;
    const refXRight = fcCutoff;
    const refY = -Math.log10(pCutoff);

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${VBW} ${VBH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
      >
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

        {/* ── Data points (grouped by class for SVG-export clarity) ─── */}
        <g id="data-points">
          {(["ns", "down", "up"] as VolcanoClass[]).map((cls) => (
            <g key={cls} id={`points-${cls}`} fill={colors[cls]} fillOpacity={pointAlpha}>
              {rendered
                .filter((r) => r.cls === cls)
                .map((r, i) => (
                  <circle key={i} cx={r.px.x} cy={r.px.y} r={pointRadius}>
                    <title>
                      {(r.pt.label ? r.pt.label + " · " : "") +
                        "log2FC=" +
                        r.pt.log2fc.toFixed(3) +
                        ", p=" +
                        (r.pt.p === 0 ? "0 (clamped)" : r.pt.p.toExponential(2)) +
                        ", " +
                        cls}
                    </title>
                  </circle>
                ))}
            </g>
          ))}
        </g>

        {/* ── Top-N labels with optional leader lines for forced placements ── */}
        {showLabels && labels.length > 0 && (
          <g id="top-n-labels">
            {labels.map((lab, i) => {
              // Translate label coords (which are relative to the inner
              // plot box) back to outer canvas coords.
              const px = MARGIN.left + lab.pointPx.x;
              const py = MARGIN.top + lab.pointPx.y;
              const tx = MARGIN.left + lab.textPx.x;
              const ty = MARGIN.top + lab.textPx.y;
              return (
                <g key={i}>
                  {lab.forced && (
                    <line
                      x1={px}
                      y1={py}
                      x2={tx + (approxMonoCharWidth(labelFontSize) * lab.text.length) / 2}
                      y2={ty - labelFontSize * 0.35}
                      stroke="#888"
                      strokeWidth="0.6"
                    />
                  )}
                  <text
                    x={tx}
                    y={ty}
                    fontSize={labelFontSize}
                    fill="#222"
                    fontFamily="ui-monospace, Menlo, monospace"
                  >
                    {lab.text}
                  </text>
                </g>
              );
            })}
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
      </svg>
    );
  }
);

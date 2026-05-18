// gff/chart.tsx — GffChart forwardRef SVG renderer for the genome feature
// track. Pure render code: it consumes pre-packed gene models (lane already
// assigned by `packModels` in the parent App) and a base-pair view window,
// and draws lanes of features with a coordinate axis beneath.
//
// Every chart element sits in a named `<g id="...">` group so an exported SVG
// stays editable in Inkscape (see tools/CLAUDE.md "SVG export").

import { formatBp, strandColor } from "./helpers";
import type { GffChartProps, PackedModel } from "./helpers";

import { makeTicks } from "../_core/scale";
import { svgSafeId } from "../_core/svg-export";
const { forwardRef } = React;

// ── Layout constants ─────────────────────────────────────────────────────────

const PREFERRED_W = 980;
const MARGIN_L = 26;
const MARGIN_R = 26;
const AXIS_H = 48; // x-axis line + tick labels + axis caption
const LEGEND_H = 26;
const CHEVRON_GAP = 26; // px between strand chevrons along a feature

// SVG-literal colours (chart internals must not reference CSS vars — they do
// not survive SVG export; see tools/CLAUDE.md "Theming").
const TEXT_DARK = "#333333";
const TEXT_MUTED = "#555555";
const GRID = "#ececec";
const FRAME = "#cccccc";
const CONNECTOR = "#9aa0a6";
const SELECT_FILL = "#648FFF";

// ── GffChart ─────────────────────────────────────────────────────────────────

export const GffChart = forwardRef<SVGSVGElement, GffChartProps>(function GffChart(
  {
    packed,
    laneCount,
    seqid,
    viewStart,
    viewEnd,
    typeColors,
    colorMode,
    selectedKey,
    onSelect,
    plotTitle,
    plotSubtitle,
    plotBg,
    fontSize,
    featureHeight,
    showLabels,
    showChevrons,
  },
  ref
) {
  const fSize = fontSize || 12;
  const fh = Math.max(4, featureHeight || 12);
  const span = Math.max(1, viewEnd - viewStart);

  const titleH = plotTitle ? 38 : 14;
  const subH = plotSubtitle ? 20 : 0;
  const plotTop = titleH + subH + 8;

  const labelRowH = showLabels ? fSize + 6 : 0;
  const laneH = labelRowH + fh + 11;
  const lanes = Math.max(1, laneCount);
  const plotH = lanes * laneH;
  const plotBottom = plotTop + plotH;
  const axisY = plotBottom + 8;
  const totalH = plotBottom + AXIS_H + LEGEND_H;

  const W = PREFERRED_W;
  const plotLeft = MARGIN_L;
  const plotRight = W - MARGIN_R;
  const plotW = plotRight - plotLeft;

  const xOf = (bp: number): number => plotLeft + ((bp - viewStart) / span) * plotW;
  const clampX = (xv: number): number => Math.max(plotLeft, Math.min(plotRight, xv));

  const ticks = makeTicks(viewStart, viewEnd, 8);

  // Legend rows — type swatches, or the three strand classes.
  const legendItems: { label: string; color: string }[] =
    colorMode === "strand"
      ? [
          { label: "+ strand", color: strandColor("+") },
          { label: "− strand", color: strandColor("-") },
          { label: "unstranded", color: strandColor(".") },
        ]
      : [...typeColors.entries()].map(([label, color]) => ({ label, color }));
  const legendWidths = legendItems.map((it) => 16 + it.label.length * fSize * 0.56 + 16);
  const legendTotal = legendWidths.reduce((a, b) => a + b, 0);
  let legendX = legendTotal < plotW ? plotLeft + (plotW - legendTotal) / 2 : plotLeft;
  const legendY = totalH - LEGEND_H / 2;

  const renderPart = (
    px: number,
    py: number,
    pw: number,
    ph: number,
    fill: string,
    selected: boolean,
    key: string
  ): React.ReactNode => (
    <rect
      key={key}
      x={px}
      y={py}
      width={pw}
      height={ph}
      rx={1.5}
      fill={fill}
      stroke={selected ? TEXT_DARK : "none"}
      strokeWidth={selected ? 1.4 : 0}
    />
  );

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${totalH}`}
      width={W}
      height={totalH}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || `Genome track for ${seqid}`}
    >
      <title>{plotTitle || `Genome track for ${seqid}`}</title>
      <desc>{`GFF3 feature track — ${packed.length} features across ${lanes} lane(s) on ${seqid}`}</desc>

      <g id="background">
        <rect width={W} height={totalH} fill={plotBg || "#ffffff"} rx="8" />
      </g>

      {plotTitle && (
        <g id="title">
          <text
            x={W / 2}
            y={24}
            textAnchor="middle"
            fontSize={Math.max(14, fSize + 4)}
            fontWeight="700"
            fill={TEXT_DARK}
            fontFamily="sans-serif"
          >
            {plotTitle}
          </text>
        </g>
      )}
      {plotSubtitle && (
        <g id="subtitle">
          <text
            x={W / 2}
            y={titleH + 13}
            textAnchor="middle"
            fontSize={Math.max(11, fSize)}
            fill={TEXT_MUTED}
            fontFamily="sans-serif"
          >
            {plotSubtitle}
          </text>
        </g>
      )}

      <g id="plot-area-background">
        <rect x={plotLeft} y={plotTop} width={plotW} height={plotH} fill="#fbfbfc" />
      </g>

      {/* Vertical grid at each axis tick. */}
      <g id="grid">
        {ticks.map((t, i) => (
          <line
            key={`g-${i}`}
            x1={xOf(t)}
            x2={xOf(t)}
            y1={plotTop}
            y2={plotBottom}
            stroke={GRID}
            strokeWidth="1"
          />
        ))}
      </g>

      {/* One group per feature: selection highlight, connector line, part
          boxes, strand chevrons, label, and a transparent hit target. */}
      <g id="features">
        {packed.map((p: PackedModel) => {
          const { model, lane } = p;
          const laneTop = plotTop + lane * laneH;
          const featRowTop = laneTop + labelRowH + 4;
          const centerY = featRowTop + fh / 2;
          const selected = model.key === selectedKey;

          const startX = clampX(xOf(model.start));
          const endX = clampX(xOf(model.end + 1));
          const hasParts = model.parts.length > 0;

          const parts: React.ReactNode[] = [];
          if (hasParts) {
            for (let i = 0; i < model.parts.length; i++) {
              const part = model.parts[i];
              const rawL = xOf(part.start);
              const rawR = xOf(part.end + 1);
              if (rawR < plotLeft || rawL > plotRight) continue;
              const pl = clampX(rawL);
              const pr = clampX(rawR);
              const ph = part.type === "CDS" ? fh : fh * 0.62;
              const fill =
                colorMode === "strand"
                  ? strandColor(model.strand)
                  : (typeColors.get(part.type) ?? "#888888");
              parts.push(
                renderPart(pl, centerY - ph / 2, Math.max(1, pr - pl), ph, fill, selected, `p-${i}`)
              );
            }
          } else {
            const fill =
              colorMode === "strand"
                ? strandColor(model.strand)
                : (typeColors.get(model.feature.type) ?? "#888888");
            parts.push(
              renderPart(
                startX,
                centerY - fh / 2,
                Math.max(1, endX - startX),
                fh,
                fill,
                selected,
                "p-block"
              )
            );
          }

          // Strand chevrons spaced along the feature span.
          const chevrons: React.ReactNode[] = [];
          if (showChevrons && (model.strand === "+" || model.strand === "-")) {
            const dir = model.strand === "+" ? 1 : -1;
            const arm = Math.max(2.5, Math.min(4.5, fh * 0.32));
            for (let cx = startX + CHEVRON_GAP / 2; cx < endX - 3; cx += CHEVRON_GAP) {
              chevrons.push(
                <polyline
                  key={`c-${cx}`}
                  points={`${cx - dir * arm},${centerY - arm} ${cx},${centerY} ${cx - dir * arm},${centerY + arm}`}
                  fill="none"
                  stroke={CONNECTOR}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }
          }

          // Label truncated to the room available to the plot's right edge.
          let label: React.ReactNode = null;
          if (showLabels) {
            const maxChars = Math.max(4, Math.floor((plotRight - startX) / (fSize * 0.6)));
            const text =
              model.feature.name.length > maxChars
                ? model.feature.name.slice(0, maxChars - 1) + "…"
                : model.feature.name;
            label = (
              <text
                x={startX}
                y={laneTop + fSize}
                textAnchor="start"
                fontSize={fSize}
                fontWeight={selected ? 700 : 600}
                fill={TEXT_DARK}
                fontFamily="sans-serif"
              >
                {text}
              </text>
            );
          }

          return (
            <g
              key={model.key}
              id={`feature-${svgSafeId(model.key)}`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect && onSelect(selected ? null : model.key)}
              role="img"
              aria-label={`${model.feature.type} ${model.feature.name}, ${model.start}–${model.end} ${model.strand}`}
            >
              {selected && (
                <rect
                  x={startX - 3}
                  y={laneTop + 1}
                  width={endX - startX + 6}
                  height={laneH - 3}
                  rx={3}
                  fill={SELECT_FILL}
                  fillOpacity="0.12"
                />
              )}
              {hasParts && (
                <line
                  x1={startX}
                  x2={endX}
                  y1={centerY}
                  y2={centerY}
                  stroke={CONNECTOR}
                  strokeWidth={Math.max(1, fh / 10)}
                />
              )}
              {parts}
              {chevrons}
              {label}
              {/* Transparent hit target so the whole lane row is clickable. */}
              <rect
                x={startX}
                y={laneTop}
                width={Math.max(2, endX - startX)}
                height={laneH}
                fill="#ffffff"
                fillOpacity="0"
                pointerEvents="all"
              />
            </g>
          );
        })}
      </g>

      {packed.length === 0 && (
        <g id="empty-message">
          <text
            x={W / 2}
            y={plotTop + plotH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.max(12, fSize)}
            fill={TEXT_MUTED}
            fontFamily="sans-serif"
          >
            No features in this view — widen the view window or clear a type filter.
          </text>
        </g>
      )}

      <g id="plot-frame">
        <rect
          x={plotLeft}
          y={plotTop}
          width={plotW}
          height={plotH}
          fill="none"
          stroke={FRAME}
          strokeWidth="1"
        />
      </g>

      {/* X axis — base-pair coordinates. */}
      <g id="axis-x">
        <line
          x1={plotLeft}
          x2={plotRight}
          y1={axisY}
          y2={axisY}
          stroke={TEXT_DARK}
          strokeWidth="1"
        />
        {ticks.map((t, i) => (
          <g key={`t-${i}`}>
            <line
              x1={xOf(t)}
              x2={xOf(t)}
              y1={axisY}
              y2={axisY + 4}
              stroke={TEXT_DARK}
              strokeWidth="1"
            />
            <text
              x={xOf(t)}
              y={axisY + 16}
              textAnchor="middle"
              fontSize={Math.max(9, fSize - 3)}
              fill={TEXT_MUTED}
              fontFamily="sans-serif"
            >
              {formatBp(t)}
            </text>
          </g>
        ))}
      </g>
      <g id="x-axis-label">
        <text
          x={(plotLeft + plotRight) / 2}
          y={axisY + 36}
          textAnchor="middle"
          fontSize={Math.max(10, fSize - 2)}
          fill={TEXT_MUTED}
          fontFamily="sans-serif"
        >
          {`Position on ${seqid} (bp)`}
        </text>
      </g>

      {/* Colour legend. */}
      <g id="legend">
        {legendItems.map((it, i) => {
          const ix = legendX;
          legendX += legendWidths[i];
          return (
            <g key={`l-${i}`}>
              <rect x={ix} y={legendY - 5} width={10} height={10} rx={2} fill={it.color} />
              <text
                x={ix + 15}
                y={legendY}
                dominantBaseline="central"
                fontSize={Math.max(9, fSize - 3)}
                fill={TEXT_MUTED}
                fontFamily="sans-serif"
              >
                {it.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
});

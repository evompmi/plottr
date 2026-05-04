// In-SVG aesthetic legends for the volcano chart. Rendered inside the
// SVG (not in the React sidebar) so they ride along on every PNG / SVG
// export. The React sidebar tile keeps its own preview (palette strip +
// chip list / min-max sliders) for editing convenience, but the chart
// legend is the authoritative one for downstream consumers.

import { ColorMap, SizeMap } from "./helpers";
import { fmtLegend } from "./chart-layout";

export function ColorLegend({
  colorMap,
  title,
  width,
  yOffset,
}: {
  colorMap: ColorMap;
  title: string;
  width: number;
  yOffset: number;
}) {
  return (
    <g id="color-legend" transform={`translate(0, ${yOffset})`}>
      <text
        x={0}
        y={10}
        fontSize="11"
        fontWeight="700"
        fill="#222"
        fontFamily="ui-monospace, Menlo, monospace"
      >
        {title}
      </text>
      {colorMap!.type === "continuous" ? (
        <ContinuousColorLegend
          stops={colorMap as Extract<ColorMap, { type: "continuous" }>}
          width={width}
        />
      ) : (
        <DiscreteColorLegend
          legend={(colorMap as Extract<ColorMap, { type: "discrete" }>).legend}
        />
      )}
    </g>
  );
}

function ContinuousColorLegend({
  stops,
  width,
}: {
  stops: Extract<ColorMap, { type: "continuous" }>;
  width: number;
}) {
  // Resample the actual palette gradient (post-inversion — the ColorMap
  // result carries the final `paletteStops`). 32 segments is smooth
  // enough at 130 px and keeps the SVG export compact.
  const N = 32;
  const stripWidth = width;
  const stripH = 10;
  const stripY = 18;
  return (
    <>
      {Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        return (
          <rect
            key={i}
            x={(i * stripWidth) / N}
            y={stripY}
            width={stripWidth / N + 0.5}
            height={stripH}
            fill={interpolateColor(stops.paletteStops, t)}
          />
        );
      })}
      <rect
        x={0}
        y={stripY}
        width={stripWidth}
        height={stripH}
        fill="none"
        stroke="#888"
        strokeWidth="0.6"
      />
      <text x={0} y={stripY + stripH + 12} fontSize="10" fill="#555" fontFamily="sans-serif">
        {fmtLegend(stops.vmin)}
      </text>
      <text
        x={stripWidth}
        y={stripY + stripH + 12}
        textAnchor="end"
        fontSize="10"
        fill="#555"
        fontFamily="sans-serif"
      >
        {fmtLegend(stops.vmax)}
      </text>
    </>
  );
}

function DiscreteColorLegend({ legend }: { legend: Array<{ value: string; color: string }> }) {
  // Cap the visible rows so the legend doesn't run off the bottom of the
  // SVG. Caller passes the full list; we render up to 14 + a "+N more"
  // footer.
  const MAX_ROWS = 14;
  const rows = legend.slice(0, MAX_ROWS);
  const overflow = legend.length - rows.length;
  const ROW_H = 14;
  const startY = 18;
  return (
    <>
      {rows.map((entry, i) => (
        <g key={entry.value} transform={`translate(0, ${startY + i * ROW_H})`}>
          <rect
            x={0}
            y={0}
            width={10}
            height={10}
            fill={entry.color}
            stroke="#888"
            strokeWidth="0.5"
          />
          <text x={16} y={9} fontSize="10" fill="#222" fontFamily="ui-monospace, Menlo, monospace">
            {entry.value.length > 16 ? entry.value.slice(0, 16) + "…" : entry.value}
          </text>
        </g>
      ))}
      {overflow > 0 && (
        <text
          x={0}
          y={startY + rows.length * ROW_H + 8}
          fontSize="9"
          fill="#888"
          fontStyle="italic"
          fontFamily="ui-monospace, Menlo, monospace"
        >
          + {overflow} more
        </text>
      )}
    </>
  );
}

export function SizeLegend({
  sizeMap,
  title,
  width,
  yOffset,
}: {
  sizeMap: SizeMap;
  title: string;
  width: number;
  yOffset: number;
}) {
  // Round-number sample circles produced by `makeTicks` — same helper
  // the X / Y axes use, so the legend stops land on the same nice values
  // an axis would (10, 20, 50, 100, …) instead of literal arithmetic
  // min / mid / max. Ticks outside the actual data range are dropped so
  // legend circles never claim radii beyond [minR, maxR]. Falls back to
  // a single mid-point sample when the data is degenerate (vmin === vmax)
  // or `makeTicks` returns no in-range values.
  const span = sizeMap.vmax - sizeMap.vmin;
  const ticks =
    span > 0
      ? makeTicks(sizeMap.vmin, sizeMap.vmax, 4).filter(
          (t) => t >= sizeMap.vmin && t <= sizeMap.vmax
        )
      : [];
  const samples =
    ticks.length > 0
      ? ticks.map((v) => ({
          v,
          r: sizeMap.minR + ((v - sizeMap.vmin) / span) * (sizeMap.maxR - sizeMap.minR),
        }))
      : [
          {
            v: sizeMap.vmin,
            r: span > 0 ? sizeMap.minR : (sizeMap.minR + sizeMap.maxR) / 2,
          },
        ];
  const ROW_H = Math.max(20, sizeMap.maxR * 2 + 6);
  const cx = sizeMap.maxR + 2;
  return (
    <g id="size-legend" transform={`translate(0, ${yOffset})`}>
      <text
        x={0}
        y={10}
        fontSize="11"
        fontWeight="700"
        fill="#222"
        fontFamily="ui-monospace, Menlo, monospace"
      >
        {title}
      </text>
      {samples.map((s, i) => (
        <g key={i} transform={`translate(0, ${20 + i * ROW_H})`}>
          <circle cx={cx} cy={ROW_H / 2} r={s.r} fill="#bbb" stroke="#444" strokeWidth="0.6" />
          <text
            x={sizeMap.maxR * 2 + 10}
            y={ROW_H / 2 + 3}
            fontSize="10"
            fill="#555"
            fontFamily="sans-serif"
          >
            {fmtLegend(s.v)}
          </text>
        </g>
      ))}
      {/* swallow the unused width so the type-checker doesn't complain */}
      {width < 0 && <text>{title}</text>}
    </g>
  );
}

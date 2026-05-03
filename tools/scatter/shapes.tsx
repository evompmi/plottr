// scatter/shapes.tsx — small UI shape utilities for the scatter tool:
// the palette strip preview (continuous colour-mapping selector),
// renderPoint (the SVG-shape switch used by the chart for every point),
// and the HTML ShapePreview (the discrete-shape selector swatch).

export function PaletteStrip({
  palette,
  width,
  height = 12,
}: {
  palette: any;
  width?: any;
  height?: number;
}) {
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const n = 48;
  return (
    <div
      style={{
        display: "flex",
        width: width || "100%",
        height,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ flex: 1, background: interpolateColor(stops, i / (n - 1)) }} />
      ))}
    </div>
  );
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export function renderPoint(
  shape: string,
  cx: number,
  cy: number,
  r: number,
  props: {
    fill?: string;
    fillOpacity?: number;
    stroke?: string;
    strokeWidth?: number;
    key?: string | number;
  }
) {
  const { fill, fillOpacity, stroke, strokeWidth, key } = props;
  switch (shape) {
    case "triangle": {
      const bx = r * 0.866;
      const by = cy + r * 0.5;
      return (
        <polygon
          key={key}
          points={`${cx},${cy - r} ${cx - bx},${by} ${cx + bx},${by}`}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    case "square": {
      const s = r * 1.4;
      return (
        <rect
          key={key}
          x={cx - s / 2}
          y={cy - s / 2}
          width={s}
          height={s}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    case "cross": {
      const t = r * 0.35;
      return (
        <path
          key={key}
          d={`M${cx - r},${cy - t}H${cx - t}V${cy - r}H${cx + t}V${cy - t}H${cx + r}V${cy + t}H${cx + t}V${cy + r}H${cx - t}V${cy + t}H${cx - r}Z`}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    default:
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
  }
}

// Shape preview for HTML UI
export function ShapePreview({
  shape,
  size = 16,
  color = "#666",
}: {
  shape: string;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {renderPoint(shape, 8, 8, 6, { fill: color, fillOpacity: 1, stroke: "none", strokeWidth: 0 })}
    </svg>
  );
}

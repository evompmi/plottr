// lineplot/shapes.tsx — point-marker rendering for the chart (`renderLinePoint`)
// and a small HTML preview swatch for the per-group shape picker
// (`LinePointPreview`). Mirrors `tools/scatter/shapes.tsx`'s renderPoint
// switch but adds "diamond" and a filled/open toggle, which lineplot needs
// and scatter currently doesn't.

import type { PointShape } from "./helpers";

export function renderLinePoint(
  shape: PointShape | undefined,
  filled: boolean | undefined,
  cx: number,
  cy: number,
  r: number,
  color: string,
  key?: string | number
): React.ReactNode {
  // `filled !== false` (rather than a truthy check) so legacy call sites
  // that predate this feature and don't set the field at all keep
  // rendering solid filled markers, matching pre-feature behaviour.
  const fillProps =
    filled !== false
      ? { fill: color, stroke: "#fff", strokeWidth: 0.5 }
      : { fill: "#fff", stroke: color, strokeWidth: 1.5 };
  switch (shape) {
    case "triangle": {
      const bx = r * 0.9;
      const by = cy + r * 0.6;
      return (
        <polygon
          key={key}
          points={`${cx},${cy - r} ${cx - bx},${by} ${cx + bx},${by}`}
          {...fillProps}
        />
      );
    }
    case "square": {
      const s = r * 1.6;
      return <rect key={key} x={cx - s / 2} y={cy - s / 2} width={s} height={s} {...fillProps} />;
    }
    case "diamond": {
      const d = r * 1.2;
      return (
        <polygon
          key={key}
          points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
          {...fillProps}
        />
      );
    }
    default:
      return <circle key={key} cx={cx} cy={cy} r={r} {...fillProps} />;
  }
}

export function LinePointPreview({
  shape,
  filled,
  color,
  size = 16,
}: {
  shape: PointShape;
  filled: boolean;
  color: string;
  size?: number;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {renderLinePoint(shape, filled, 8, 8, 5, color)}
    </svg>
  );
}

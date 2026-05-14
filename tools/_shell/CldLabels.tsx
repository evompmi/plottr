// `CldLabels` — Compact-Letter-Display labels for k≥3 group annotations.
// Emits one `<text>` per group with the letter assignment from
// `compactLetterDisplay` upstream. Pairs with `SignificanceBrackets` as
// the two annotation primitives every chart uses.

const CLD_DEFAULTS = {
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "sans-serif",
  textColor: "#222",
};

interface CldLabelsProps {
  labels: (string | null)[];
  axisCoord: (i: number) => number;
  // Perpendicular coord — y for vertical-top, x for horizontal-right.
  crossCoord: number;
  orientation: "vertical-top" | "horizontal-right";
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  textColor?: string;
}

export function CldLabels({
  labels,
  axisCoord,
  crossCoord,
  orientation,
  fontSize = CLD_DEFAULTS.fontSize,
  fontWeight = CLD_DEFAULTS.fontWeight,
  fontFamily = CLD_DEFAULTS.fontFamily,
  textColor = CLD_DEFAULTS.textColor,
}: CldLabelsProps) {
  if (!labels || labels.length === 0) return null;
  const horizontal = orientation === "horizontal-right";
  return (
    <g id="cld-annotations">
      {labels.map((lbl, i) =>
        lbl != null ? (
          <text
            key={`cld-${i}`}
            x={horizontal ? crossCoord : axisCoord(i)}
            y={horizontal ? axisCoord(i) : crossCoord}
            textAnchor={horizontal ? "end" : "middle"}
            {...(horizontal ? { dominantBaseline: "middle" } : {})}
            fontSize={fontSize}
            fontWeight={fontWeight}
            fill={textColor}
            fontFamily={fontFamily}
          >
            {lbl}
          </text>
        ) : null
      )}
    </g>
  );
}

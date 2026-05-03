// Shared chart annotation primitives — significance brackets and CLD-letter
// labels. Used by boxplot's main chart (vertical + horizontal) and aequorin's
// inset bar chart (vertical only). Audit M7 follow-up: collapses three
// near-identical bracket renderers and three near-identical CLD-label
// renderers into two parameterised components, with boxplot's styling as the
// source of truth (stroke #333, bracket fontSize 12, CLD fontSize 13, text
// colour #222 — aequorin's previous fontSize 10 / stroke #222 inset values
// are dropped in favour of the unified set).
//
// Pure presentational. The caller is expected to pre-compute per-pair levels
// (via `assignBracketLevels` from `shared.js`) and per-pair labels (e.g.
// `pStars(p)` upstream in the annotation-spec builder). These components
// consume `pr.label` directly and only translate (i, j, _level) → SVG geometry.
//
// Coordinate system is parameterised through `axisCoord(i)` so the same
// component works for box-axis, line-x, and any future categorical axis.
// Orientation drives the layout fork:
//   - "vertical-top": brackets arc above the data, levels stack upward
//   - "horizontal-right": brackets arc to the right, levels stack rightward

const BRACKET_DEFAULTS = {
  stroke: "#333",
  strokeWidth: 1,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "sans-serif",
  textColor: "#222",
  levelStep: 20,
  tickHeight: 4,
};

const CLD_DEFAULTS = {
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "sans-serif",
  textColor: "#222",
};

// Same shape as the ambient BracketPair declared in types/globals.d.ts —
// label may be omitted (the renderer falls back to a default string), so
// the local prop interface must accept `string | undefined` to be
// assignable from the global type that StatsTile produces.
interface ChartAnnotationBracketPair {
  i: number;
  j: number;
  label?: string;
  _level?: number;
}

interface SignificanceBracketsProps {
  pairs: ChartAnnotationBracketPair[];
  // Group-center coord along the categorical axis.
  axisCoord: (i: number) => number;
  // Anchor for level=0 along the perpendicular axis. Vertical-top: top edge
  // of bracket band (e.g. `M.top + annotTopPad - 6`). Horizontal-right: left
  // edge of bracket band (e.g. `M.left + w - annotTopPad + 6`).
  baseline: number;
  orientation: "vertical-top" | "horizontal-right";
  levelStep?: number;
  tickHeight?: number;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  textColor?: string;
}

export function SignificanceBrackets({
  pairs,
  axisCoord,
  baseline,
  orientation,
  levelStep = BRACKET_DEFAULTS.levelStep,
  tickHeight = BRACKET_DEFAULTS.tickHeight,
  stroke = BRACKET_DEFAULTS.stroke,
  strokeWidth = BRACKET_DEFAULTS.strokeWidth,
  fontSize = BRACKET_DEFAULTS.fontSize,
  fontWeight = BRACKET_DEFAULTS.fontWeight,
  fontFamily = BRACKET_DEFAULTS.fontFamily,
  textColor = BRACKET_DEFAULTS.textColor,
}: SignificanceBracketsProps) {
  if (!pairs || pairs.length === 0) return null;
  return (
    <g id="significance-brackets">
      {pairs.map((pr, idx) => {
        const lvl = pr._level || 0;
        const a = axisCoord(pr.i);
        const b = axisCoord(pr.j);
        if (orientation === "horizontal-right") {
          const xLine = baseline + lvl * levelStep;
          return (
            <g key={`br-${idx}`}>
              <path
                d={`M${xLine - tickHeight},${a} L${xLine},${a} L${xLine},${b} L${xLine - tickHeight},${b}`}
                stroke={stroke}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <text
                x={xLine + 6}
                y={(a + b) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontSize}
                fontWeight={fontWeight}
                fill={textColor}
                fontFamily={fontFamily}
                transform={`rotate(90,${xLine + 6},${(a + b) / 2})`}
              >
                {pr.label}
              </text>
            </g>
          );
        }
        const yLine = baseline - lvl * levelStep;
        return (
          <g key={`br-${idx}`}>
            <path
              d={`M${a},${yLine + tickHeight} L${a},${yLine} L${b},${yLine} L${b},${yLine + tickHeight}`}
              stroke={stroke}
              strokeWidth={strokeWidth}
              fill="none"
            />
            <text
              x={(a + b) / 2}
              y={yLine - 2}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight={fontWeight}
              fill={textColor}
              fontFamily={fontFamily}
            >
              {pr.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

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

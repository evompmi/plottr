// Shared typed chart-layout helpers used by more than one tool — currently
// `lineplot/helpers.ts` and `aequorin/helpers.ts`, both of which re-export
// from here. Only pure functions and data shapes belong here; anything
// with per-tool behaviour stays in `tools/<tool>/helpers.ts`.

// Default chart-margin for line-trace charts (lineplot + aequorin). Matches
// the axis-label / tick-label footprints both tools use.
export const CHART_MARGIN = { top: 20, right: 20, bottom: 48, left: 62 };

// Reserve enough left margin for the widest value-axis tick label so the
// numbers never overrun into the rotated y-axis label sitting at the far
// left. Tick labels are anchored "end" 8 px inside the plot area and grow
// leftward, so wider numbers (big magnitudes) or a larger `tickFontSize`
// eat into the gutter the axis label needs. Width is estimated at ~0.6 em
// per character (a safe upper bound for sans-serif digits); the +32 px
// gutter covers the 8 px tick gap plus the ~13 px rotated label strip and a
// little padding. Returns `baseLeft` unchanged whenever the labels already
// fit, so the default layout (small numbers at 11 px) is untouched.
//
// `labelScale` (1 at the default text size) widens the reserved label strip
// in step with the "Text size" slider: the rotated y-axis label grows from
// its 13 px base to 13·labelScale, and it is nudged the same amount rightward
// at draw time (see each chart's y-axis-label block), so the strip must grow
// by 13·(labelScale−1) to keep it clear of the tick numbers. At labelScale 1
// the extra term is 0, so the default layout is byte-identical.
//
// This is the single source of truth for the "tick labels must not collide
// with the axis label" rule — every chart that renders a left value axis
// routes its left margin through here.
export function valueAxisLeftMargin(
  baseLeft: number,
  tickLabels: Array<string | number>,
  tickFontSize: number,
  labelScale = 1
): number {
  let maxChars = 0;
  for (const t of tickLabels) {
    const len = String(t).length;
    if (len > maxChars) maxChars = len;
  }
  const extraLabelStrip = Math.ceil(13 * (labelScale - 1));
  return Math.max(baseLeft, Math.ceil(maxChars * tickFontSize * 0.6) + 32 + extraLabelStrip);
}

// Build an SVG polyline `d` attribute from an array of `{x, y}` points.
// Skips any point whose `y` is null (missing/interpolated gaps). Returns an
// empty string when fewer than 2 valid points remain — the caller should
// suppress rendering rather than emit an empty path.
export function buildLineD(pts: { x: number; y: number | null }[]): string {
  const valid = pts.filter((p): p is { x: number; y: number } => p.y != null);
  if (valid.length < 2) return "";
  return "M" + valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
}

// Shared typed chart-layout helpers used by more than one tool — currently
// `lineplot/helpers.ts` and `aequorin/helpers.ts`, both of which re-export
// from here. Only pure functions and data shapes belong here; anything
// with per-tool behaviour stays in `tools/<tool>/helpers.ts`.

// Default chart-margin for line-trace charts (lineplot + aequorin). Matches
// the axis-label / tick-label footprints both tools use.
export const CHART_MARGIN = { top: 20, right: 20, bottom: 48, left: 62 };

// Build an SVG polyline `d` attribute from an array of `{x, y}` points.
// Skips any point whose `y` is null (missing/interpolated gaps). Returns an
// empty string when fewer than 2 valid points remain — the caller should
// suppress rendering rather than emit an empty path.
export function buildLineD(pts: { x: number; y: number | null }[]): string {
  const valid = pts.filter((p): p is { x: number; y: number } => p.y != null);
  if (valid.length < 2) return "";
  return "M" + valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
}

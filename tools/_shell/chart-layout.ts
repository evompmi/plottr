// Shared typed chart-layout helpers. `_shell/` is the canonical home for
// helpers used by more than one tool — precedent set by
// `_shell/stats-dispatch.ts` and `_shell/usePlotToolState.ts`. Only pure
// functions + data shapes go here; anything with per-tool behaviour stays
// in `tools/<tool>/helpers.ts`.
//
// Audit M7: `buildLineD` and the default chart-margin constant used to be
// byte-identical in `tools/lineplot/helpers.ts` and `tools/aequorin/helpers.ts`.
// Kept in each tool because a cross-tool extraction felt premature at the
// time; once the duplication held across both tools and was confirmed
// byte-identical, lifting the two items here became the obvious next step.
// `lineplot/helpers.ts` and `aequorin/helpers.ts` now re-export from here.

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

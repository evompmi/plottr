// stats/format.ts — small zero-dep formatters for p-values and significance.
//
// Lives alone so `tests.ts` and `posthoc.ts` can both consume them without
// drawing a cycle (selectCorrelation in tests.ts wants formatP, selectTest in
// posthoc.ts wants formatP — both originally pulled it from the same global
// surface).

// Map a p-value to the 4-level significance stars used on plots.
// Non-finite or missing p → empty string so callers can suppress the label.
export function pStars(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

// Format a p-value for display next to a test statistic. Uses scientific
// notation below 1e-3 (where fixed-point would round to 0) and keeps 3
// significant digits otherwise.
export function formatP(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p < 1e-4) return p.toExponential(1);
  if (p < 1e-3) return p.toExponential(2);
  return p.toFixed(4);
}

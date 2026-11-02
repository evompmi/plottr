// "Print summary below plot": a few grey monospace lines recapping the
// statistics behind the marks on a chart (normality, equal variance, test,
// post-hoc, comparisons, error bars). Group Plot, Proportions and qPCR draw
// it inside their SVG so it travels with the exported figure. The summary
// is one string, lines separated by "\n"; the tool builds it and the chart
// reserves `statsSummaryHeight(summary)` of space for it.

import type { NormalityResult, SelectTestResult } from "../_core/stats/types";

export const STATS_LINE_H = 11;
export const STATS_FONT = 8;

export function statsSummaryHeight(summary: string | null): number {
  if (!summary) return 0;
  return summary.split("\n").length * STATS_LINE_H + 14; // 14 = top/bottom padding
}

// "yes" when every group passed Shapiro-Wilk, "no" when any failed, "—" when
// none could be tested.
export function summariseNormality(norm: NormalityResult[] | null | undefined): string {
  if (!Array.isArray(norm) || norm.length === 0) return "—";
  let hasTrue = false;
  let hasFalse = false;
  for (const r of norm) {
    if (r.normal === true) hasTrue = true;
    else if (r.normal === false) hasFalse = true;
  }
  if (hasFalse) return "no";
  if (hasTrue) return "yes";
  return "—";
}

export function summariseEqualVariance(lev: SelectTestResult["levene"] | null | undefined): string {
  if (!lev || "error" in lev) return "—";
  if (lev.F == null) return "—";
  return lev.equalVar ? "yes" : "no";
}

export interface StatsSummaryLinesProps {
  lines: string[];
  x: number;
  yStart: number;
  anchor?: "start" | "middle" | "end";
  baseline?: "middle" | "central" | "hanging";
}

// The lines as SVG text, one every STATS_LINE_H from `yStart` (the first
// baseline). Hex literals: the summary is part of the exported figure.
export function StatsSummaryLines({
  lines,
  x,
  yStart,
  anchor = "start",
  baseline,
}: StatsSummaryLinesProps) {
  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={yStart + i * STATS_LINE_H}
          textAnchor={anchor}
          dominantBaseline={baseline}
          fontSize={STATS_FONT}
          fill="#aaa"
          fontFamily="monospace"
        >
          {line}
        </text>
      ))}
    </>
  );
}

// Pure layout math for the boxplot chart — margins, annotation padding,
// band sizing, viewbox dimensions, cumulative subgroup-gap accumulator,
// y-max expansion-for-annotations, and the subgroup-by-index lookup.
//
// No React, no SVG: every export takes plain values in and returns plain
// values (or a closure of plain values) out, so each piece is independently
// testable through `tests/helpers/boxplot-loader.js`. Carved out of
// tools/boxplot/chart.tsx (which previously inlined ~225 LOC of layout
// arithmetic before its JSX) to mirror the venn/ folder's areas / centroids /
// geometry / layout split.

import type { BoxplotGroup } from "./helpers";
import { computeLegendHeight, type LegendBlock } from "../_shell/svg-legend";

// ── Public types ────────────────────────────────────────────────────────────

export interface ChartMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Subgroup {
  name: string;
  startIndex: number;
  count: number;
}

export interface ChartAnnotations {
  kind: "brackets" | "cld" | "both";
  pairs?: BracketPair[];
  labels?: Array<string | null>;
  groupNames: string[];
}

// ── Margins ─────────────────────────────────────────────────────────────────

// Bottom-margin for non-hz mode mixes a 60 px text-row baseline with two
// rotation contributions: the legacy angle-only heuristic (kept as a floor
// so short-label charts don't shrink on this fix) AND a sharper label-aware
// estimate (label length × char width × sin(angle) + small padding for the
// tick line). hz mode collapses the rotation contribution to 0 and reserves
// 50 px for the bottom-row tick labels instead.
//
// `labelZone` (used for hz mode's left margin and the comp-pie placement)
// is a function of the longest group name; `maxLabelLen ≥ 4` floor keeps
// short-label charts from collapsing the label gutter to nothing.

export interface ChartMarginsInput {
  groups: BoxplotGroup[];
  horizontal: boolean;
  xLabelAngle: number;
  plotStyle: string;
  showCompPie: boolean;
  colorByCol: number;
}

export interface ChartMarginsResult {
  M: ChartMargins;
  hz: boolean;
  isBar: boolean;
  angle: number;
  absA: number;
  hasPie: boolean;
  pieSpace: number;
  labelZone: number;
  maxLabelLen: number;
  rotationExtra: number;
}

export function computeChartMargins(opts: ChartMarginsInput): ChartMarginsResult {
  const { groups, horizontal, xLabelAngle, plotStyle, showCompPie, colorByCol } = opts;
  const isBar = plotStyle === "bar";
  const hz = !!horizontal;
  const angle = hz ? 0 : xLabelAngle || 0;
  const absA = Math.abs(angle);
  const hasPie = colorByCol >= 0 && showCompPie;
  const pieSpace = hasPie ? 60 : 0;
  // maxLabelLen drives BOTH the hz-mode left margin (where labels render
  // horizontally on the y-axis) AND the non-hz-mode bottom-margin
  // reservation when labels are rotated. Pre-fix this was only computed
  // for hz mode, so vertical-mode rotated labels longer than ~12 chars
  // overran their reservation and clipped into the legend zone below.
  const maxLabelLen = Math.max(...groups.map((g) => g.name.length), 4);
  const labelZone = maxLabelLen * 7 + 20;
  const rotationExtra =
    absA > 0
      ? Math.max(
          absA * (isBar ? 0.9 : 0.8),
          maxLabelLen * 7 * Math.sin((absA * Math.PI) / 180) + 12
        )
      : 0;
  const botM = hz ? 50 : 60 + rotationExtra + pieSpace;
  const leftM = hz ? Math.max(62, labelZone + (hasPie ? pieSpace : 0)) : 62;
  const M: ChartMargins = { top: 24, right: 24, bottom: botM, left: leftM };
  return { M, hz, isBar, angle, absA, hasPie, pieSpace, labelZone, maxLabelLen, rotationExtra };
}

// ── Annotation padding ──────────────────────────────────────────────────────

// CLD labels need a flat strip (22 px); brackets stack vertically with each
// level adding 20 px (+6 px clearance for the topmost). Subgroups add an
// 18 px label strip on top regardless of annotation kind. Pad sums dictate
// how much room the chart reserves above (or right of, in hz) the plot area;
// `expandYMaxForAnnotations` later inflates the y-domain by the same amount
// so brackets/labels don't shrink the data area.

export interface AnnotationPaddingInput {
  annotations: ChartAnnotations | null | undefined;
  subgroups: Subgroup[] | null | undefined;
}

export interface AnnotationPaddingResult {
  hasLabels: boolean;
  hasPairs: boolean;
  annotPairs: BracketPair[];
  annotMaxLevel: number;
  subgroupLabelPad: number;
  annotTopPad: number;
}

export function computeAnnotationPadding(opts: AnnotationPaddingInput): AnnotationPaddingResult {
  const { annotations, subgroups } = opts;
  const hasLabels = !!(annotations && (annotations.kind === "cld" || annotations.kind === "both"));
  const hasPairs = !!(
    annotations &&
    (annotations.kind === "brackets" || annotations.kind === "both")
  );
  const annotPairs: BracketPair[] = hasPairs ? assignBracketLevels(annotations!.pairs || []) : [];
  const annotMaxLevel = annotPairs.reduce((m, pr) => Math.max(m, pr._level || 0), 0);
  const subgroupLabelPad = subgroups && subgroups.length > 0 ? 18 : 0;
  const cldPad = hasLabels ? 22 : 0;
  const bracketPad = annotPairs.length > 0 ? (annotMaxLevel + 1) * 20 + 6 : 0;
  const annotTopPadBase = Math.max(cldPad, bracketPad);
  const annotTopPad = annotTopPadBase + subgroupLabelPad;
  return { hasLabels, hasPairs, annotPairs, annotMaxLevel, subgroupLabelPad, annotTopPad };
}

// ── Band sizing ─────────────────────────────────────────────────────────────

// Category-axis size grows linearly with `n` (200 px floor + 100 px / group,
// scaled by `compact` = 1 − boxGap%). Subgroups inject a fixed 40 px gap
// between adjacent bands, accumulated into `totalGap`. Value-axis size is
// 420 px for bars / 504 px for box-style; vertical-mode rotated labels add
// extra width proportional to the angle (mirrors the bottom-margin formula).

export interface BandSizingInput {
  groups: BoxplotGroup[];
  subgroups: Subgroup[] | null | undefined;
  boxGap: number | null | undefined;
  isBar: boolean;
  hz: boolean;
  absA: number;
}

export interface BandSizingResult {
  n: number;
  separatorGap: number;
  totalGap: number;
  catSize: number;
  valSize: number;
}

export function computeBandSizing(opts: BandSizingInput): BandSizingResult {
  const { groups, subgroups, boxGap, isBar, hz, absA } = opts;
  const n = groups.length;
  const compact = (100 - (boxGap != null ? boxGap : 0)) / 100;
  const separatorGap = subgroups && subgroups.length > 1 ? 40 : 0;
  const totalGap = subgroups ? (subgroups.length - 1) * separatorGap : 0;
  const catSize = Math.max(200, n * 100 * compact) + totalGap;
  const valSize = (isBar ? 420 : 504) + (hz ? 0 : absA > 0 ? absA * (isBar ? 0.9 : 0.8) : 0);
  return { n, separatorGap, totalGap, catSize, valSize };
}

// ── Viewbox ─────────────────────────────────────────────────────────────────

// vbW / vbH are the SVG's viewBox dimensions. _hzSgSummaryW reserves a strip
// to the right of the plot area for hz-mode subgroup stats text. _statsH
// reserves a strip below the plot for non-hz subgroup stats (or the single
// global stats summary). _legH is the legend height computed by the shared
// helper; vbH = vbH_base + _legH puts the legend below the chart-and-stats.

import { STATS_FONT, statsSummaryHeight } from "./helpers";

export interface ViewBoxInput {
  subgroups: Subgroup[] | null | undefined;
  subgroupSummaries: Record<string, string | null> | null | undefined;
  statsSummary: string | null;
  hz: boolean;
  valSize: number;
  catSize: number;
  M: ChartMargins;
  svgLegend: LegendBlock[] | null;
}

export interface ViewBoxResult {
  vbW: number;
  vbH: number;
  vbHChart: number;
  w: number;
  h: number;
  statsH: number;
  legH: number;
  hzSgSummaryW: number;
  hasSgSummaries: boolean;
}

export function computeViewBox(opts: ViewBoxInput): ViewBoxResult {
  const { subgroups, subgroupSummaries, statsSummary, hz, valSize, catSize, M, svgLegend } = opts;
  const hasSgSummaries = !!(
    subgroupSummaries &&
    subgroups &&
    Object.values(subgroupSummaries).some((v) => v)
  );
  const hzSgSummaryW =
    hz && hasSgSummaries
      ? Math.max(
          ...Object.values(subgroupSummaries as Record<string, string | null>).map((txt) => {
            if (!txt) return 0;
            const maxLen = Math.max(...txt.split("\n").map((l: string) => l.length), 0);
            return maxLen * (STATS_FONT * 0.62) + 16;
          }),
          0
        )
      : 0;
  const statsH =
    hasSgSummaries && !hz
      ? Math.max(
          ...subgroups!.map((sg) => statsSummaryHeight(subgroupSummaries![sg.name] || null)),
          0
        )
      : statsSummaryHeight(statsSummary);
  const vbW = (hz ? valSize : catSize) + M.left + M.right + hzSgSummaryW;
  const vbHBase = (hz ? catSize : valSize) + M.top + M.bottom;
  const legH = computeLegendHeight(svgLegend, vbW - M.left - M.right - hzSgSummaryW, 88);
  const vbHChart = vbHBase - statsH;
  const vbH = vbHBase + legH;
  const w = vbW - M.left - M.right - hzSgSummaryW;
  const h = vbHChart - M.top - M.bottom;
  return { vbW, vbH, vbHChart, w, h, statsH, legH, hzSgSummaryW, hasSgSummaries };
}

// ── Cumulative subgroup gap ─────────────────────────────────────────────────

// Returns an array of length `n` whose i-th entry is the sum of all subgroup
// separator gaps that fall before category index i. Used by the band scale
// `bx(i)` to push categories past the dashed subgroup separators. Returns
// null when there are 0 or 1 subgroups (no separators to step over).

export function computeCumulativeGap(
  subgroups: Subgroup[] | null | undefined,
  n: number,
  separatorGap: number
): number[] | null {
  if (!subgroups || subgroups.length < 2) return null;
  const boundaries = new Set(subgroups.slice(1).map((sg) => sg.startIndex));
  const arr = new Array<number>(n);
  let gap = 0;
  for (let i = 0; i < n; i++) {
    if (boundaries.has(i)) gap += separatorGap;
    arr[i] = gap;
  }
  return arr;
}

// ── Y-max expansion for annotations ─────────────────────────────────────────

// When annotations claim N pixels at the top of the data area, inflate the
// y-domain so the chart's inner data still fills the same fraction of the
// screen. Linear case: scale (yMax − yMin) by annotDim / (annotDim − pad).
// Log case: do the scaling in log space so the inflation is uniform across
// orders of magnitude. The `annotDim > annotTopPad + 10` floor guards
// against pathologically small charts where the inflation would push yMax
// off-screen entirely.

export interface YMaxExpansionInput {
  yMin: number;
  yMax: number;
  annotTopPad: number;
  annotDim: number;
  isLog: boolean;
  logBase: number;
  safeLog: (v: number) => number;
}

export function expandYMaxForAnnotations(opts: YMaxExpansionInput): number {
  const { yMin, yMax, annotTopPad, annotDim, isLog, logBase, safeLog } = opts;
  if (annotTopPad <= 0 || annotDim <= annotTopPad + 10) return yMax;
  if (isLog) {
    const lMin = safeLog(yMin);
    const lMax = safeLog(yMax);
    const lRange = ((lMax - lMin) * annotDim) / (annotDim - annotTopPad);
    const candidate = Math.pow(logBase, lMin + lRange);
    return isFinite(candidate) && candidate > yMin ? candidate : yMax;
  }
  return yMin + ((yMax - yMin) * annotDim) / (annotDim - annotTopPad);
}

// ── Subgroup-by-index lookup ────────────────────────────────────────────────

// Linear scan — subgroup count is bounded by user-facing UI (almost always
// ≤ 8), so a Map keyed on every category index would be over-engineering.

export function findSubgroupForIndex(
  subgroups: Subgroup[] | null | undefined,
  i: number
): Subgroup | null {
  if (!subgroups) return null;
  for (const sg of subgroups) {
    if (i >= sg.startIndex && i < sg.startIndex + sg.count) return sg;
  }
  return null;
}

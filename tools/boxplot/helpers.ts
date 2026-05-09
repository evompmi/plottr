// Pure stats-routing, formatting, annotation, and summary helpers for the
// boxplot tool. No React / DOM dependency — separately testable
// (tests/helpers/boxplot-loader.js loads this file directly). JSX-bearing
// helpers (stats-summary SVG renderers, BoxplotChart, step components) and
// the big text-block builders (buildBpSetTextBlock / buildBpAggregateReport /
// buildBpAggregateRScript) stay in tools/boxplot.tsx.

import type { TestResult } from "../_shell/stats-dispatch";
import type { LegendBlock } from "../_shell/svg-legend";
import {
  STATS_TEST_REGISTRY,
  STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K2,
  STATS_TESTS_FOR_K,
} from "../_shell/stats-registry";
import type { PowerFromDataResult } from "../_shell/stats-tile";

// ── Stats summary SVG layout constants ──────────────────────────────────────

export const STATS_LINE_H = 11;
export const STATS_FONT = 8;

export function statsSummaryHeight(summary: string | null): number {
  if (!summary) return 0;
  return summary.split("\n").length * STATS_LINE_H + 14; // 14 = top/bottom padding
}

// ── Test / post-hoc metadata ────────────────────────────────────────────────
//
// Sourced from the shared registry (`tools/shared-stats-registry.js`).
// Pre-registry these were verbatim duplicates of the labels /
// option-arrays that lived in three other files (boxplot here, lineplot,
// aequorin). Consumers in this package still import the `_BP`-suffixed
// names so the public API is unchanged; only the source of truth moved.

export const TEST_LABELS_BP: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_TEST_REGISTRY).map(([id, entry]) => [id, entry.label])
);

export const POSTHOC_LABELS_BP: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_POSTHOC_REGISTRY).map(([id, entry]) => [id, entry.label])
);

export const TEST_OPTIONS_BP_2 = STATS_TESTS_FOR_K2;
export const TEST_OPTIONS_BP_K = STATS_TESTS_FOR_K;

export const ERROR_BAR_LABELS: Record<string, string> = {
  none: "None",
  sd: "SD",
  sem: "SEM",
  ci95: "95% CI",
};

// Test / post-hoc dispatchers live in tools/_shell/stats-dispatch.ts
// (runTest, runPostHoc, postHocForTest) — shared across boxplot, lineplot,
// and aequorin.

// ── Result formatting ───────────────────────────────────────────────────────

// `res` is one of five different test-result shapes (tTest / mannWhitneyU /
// oneWay-or-WelchANOVA / kruskalWallis); branching on `testName` selects
// which fields are valid. Read fields off TestResult's `[key: string]:
// unknown` index signature with narrow `as number` casts at each access —
// modelling the full union here would be heavier than the dispatch is worth.
const numCast = (v: unknown): number => v as number;

export function formatBpStatShort(
  testName: string | null | undefined,
  res: TestResult | null | undefined
): string {
  if (!testName || !res || res.error) return "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${numCast(res.df).toFixed(2)}) = ${numCast(res.t).toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${numCast(res.U).toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA") {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${numCast(res.F).toFixed(3)}`;
  }
  if (testName === "kruskalWallis") return `H(${numCast(res.df)}) = ${numCast(res.H).toFixed(3)}`;
  return "—";
}

export function formatBpResultLine(
  testName: string | null | undefined,
  res: TestResult | null | undefined
): string {
  if (!testName || !res) return "—";
  if (res.error) return "⚠ " + res.error;
  if (testName === "studentT" || testName === "welchT")
    return `t(${numCast(res.df).toFixed(2)}) = ${numCast(res.t).toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "mannWhitney")
    return `U = ${numCast(res.U).toFixed(1)},  z = ${numCast(res.z).toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA") {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${numCast(res.F).toFixed(3)},  p = ${formatP(res.p)}`;
  }
  if (testName === "kruskalWallis")
    return `H(${numCast(res.df)}) = ${numCast(res.H).toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

// ── Annotation spec ─────────────────────────────────────────────────────────

// ── Annotation / post-hoc shared types ────────────────────────────────────
//
// Mirrors the lineplot / aequorin shape — boxplot can additionally produce
// a `"both"` kind when a faceted plot mixes CLD and brackets across
// subgroups (see `mergeSubgroupAnnotations` below).

export interface PostHocPair {
  i: number;
  j: number;
  p: number;
  pAdj?: number | null;
  label?: string;
  diff?: number;
  z?: number;
  se?: number;
  q?: number;
  lwr?: number;
  upr?: number;
  df?: number;
}

export interface PostHocResult {
  pairs: PostHocPair[];
  k?: number;
  df?: number;
  mse?: number;
  method?: string;
  error?: string;
}

export interface AnnotationBracket {
  i: number;
  j: number;
  p: number;
  label?: string;
}

export type AnnotationSpec =
  | { kind: "brackets"; pairs: AnnotationBracket[]; groupNames: string[] }
  | { kind: "cld"; labels: Array<string | null>; groupNames: string[] }
  | {
      kind: "both";
      labels: Array<string | null>;
      pairs: AnnotationBracket[];
      groupNames: string[];
    };

// SelectTestResult + EnrichedBoxplotStatsRow — analogous to lineplot /
// aequorin but the boxplot panel keys rows by `setKey` (one row per facet ×
// subgroup pair) rather than a global singleton.
export type SelectTestResult = ReturnType<typeof selectTest> & {
  suggestion?: {
    test: RecommendedTest;
    postHoc?: RecommendedPostHoc;
    why?: string;
  };
};

// One row of input to the BoxplotStatsPanel — `key` identifies the cell
// (facet × subgroup composite), `name` is shown in the row header (empty
// string in flat mode where the panel hides the column), and `groups` is
// the set of `{name, values}` rows the panel runs `selectTest` over. The
// panel enriches each `BoxplotStatsSet` into a full
// `EnrichedBoxplotStatsRow` after running the test / post-hoc / power
// chain.
export interface BoxplotStatsSet {
  key: string;
  name: string;
  groups: Array<{ name: string; values: number[] }>;
}

export interface EnrichedBoxplotStatsRow extends BoxplotStatsSet {
  k: number;
  names: string[];
  values: number[][];
  rec: SelectTestResult | null;
  recTest?: RecommendedTest | null;
  chosenTest: RecommendedTest | null;
  testResult: TestResult | null;
  postHocName: Exclude<RecommendedPostHoc, null> | null;
  postHocResult: PostHocResult | null;
  powerResult: PowerFromDataResult | null;
  pAdj?: number | null;
  skip?: boolean;
}

export interface BoxplotStatsDetailProps {
  row: EnrichedBoxplotStatsRow;
  onOverrideTest: (test: RecommendedTest | null) => void;
  isOverridden: boolean;
}

export interface BoxplotStatsPanelProps {
  sets: BoxplotStatsSet[];
  setLabel: string;
  fileStem: string;
  onAnnotationForKey: (key: string, spec: AnnotationSpec | null) => void;
  onSummaryForKey: (key: string, text: string | null) => void;
  singletonAutoExpand?: boolean;
  displayMode: "none" | "cld" | "brackets";
  onDisplayModeChange: (mode: "none" | "cld" | "brackets") => void;
  showNs: boolean;
  onShowNsChange: (b: boolean) => void;
  showSummary: boolean;
  onShowSummaryChange: (b: boolean) => void;
  // null in non-bar plot styles (no error bars to label).
  errorBarLabel: string | null;
}

// Row argument to the annotation / summary builders accepts a permissive
// shape so callers can pass either an `EnrichedBoxplotStatsRow` or the raw
// `selectTest()` shape with a few panel-level fields layered on top.
interface AnnotationSpecRow {
  skip?: boolean;
  k: number;
  names: string[];
  testResult?: TestResult | null;
  postHocResult?: { pairs: PostHocPair[]; error?: string } | null;
}

// Build the annotation spec the chart consumes, from a row's test / post-hoc
// result. Mirrors StatsTile's logic but driven by panel-level display
// controls rather than per-row toggles.
export function computeBpAnnotationSpec(
  row: AnnotationSpecRow,
  displayMode: "none" | "cld" | "brackets",
  showNs: boolean
): AnnotationSpec | null {
  if (displayMode === "none" || !row || row.skip) return null;
  const { k, names, testResult, postHocResult } = row;
  if (k < 2) return null;
  if (k === 2) {
    const p = testResult && !testResult.error ? (testResult.p as number | undefined) : null;
    if (p == null) return null;
    if (!showNs && p >= 0.05) return null;
    return {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p, label: pStars(p) }],
      groupNames: names,
    };
  }
  if (!postHocResult || postHocResult.error) return null;
  if (displayMode === "cld") {
    const labels = compactLetterDisplay(postHocResult.pairs, k);
    return { kind: "cld", labels, groupNames: names };
  }
  const pairs = postHocResult.pairs
    .map((pr) => ({ i: pr.i, j: pr.j, p: pr.pAdj != null ? pr.pAdj : pr.p }))
    .map((pr) => ({ ...pr, label: pStars(pr.p) }))
    .filter((pr) => showNs || pr.p < 0.05);
  if (pairs.length === 0) return null;
  return { kind: "brackets", pairs, groupNames: names };
}

// ── Plain-text summaries ────────────────────────────────────────────────────

// Plain-text "print summary below plot" string — a lean four-line recap
// (normality / equal variance / test / post-hoc). Detailed per-pair stats
// live in the TXT / R downloads.
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
  if (!lev || lev.F == null) return "—";
  return lev.equalVar ? "yes" : "no";
}

interface SummaryTextRow {
  skip?: boolean;
  k: number;
  chosenTest: RecommendedTest | string | null;
  testResult: TestResult | null;
  postHocName?: string | null;
  rec?: SelectTestResult | null;
}

export function computeBpSummaryText(
  row: SummaryTextRow,
  showSummary: boolean,
  errorBarLabel: string | null
): string | null {
  if (!showSummary || !row || row.skip) return null;
  const { chosenTest, testResult, k, postHocName, rec } = row;
  if (!chosenTest || !testResult || testResult.error) return null;
  const lines = [
    `Normality: ${summariseNormality(rec?.normality)}`,
    `Equal variance: ${summariseEqualVariance(rec?.levene)}`,
    `Test: ${TEST_LABELS_BP[chosenTest] || chosenTest}`,
  ];
  if (k > 2 && postHocName) {
    lines.push(`Post-hoc: ${POSTHOC_LABELS_BP[postHocName] || postHocName}`);
  }
  if (errorBarLabel) lines.push(`Error bars: ${errorBarLabel}`);
  return lines.join("\n");
}

// ── Sub-group annotation merge ──────────────────────────────────────────────

export interface Subgroup {
  name: string;
  startIndex: number;
  count: number;
}

export function mergeSubgroupAnnotations(
  subgroups: Subgroup[],
  flatGroups: Array<{ name: string }>,
  perKeySpecs: Record<string, AnnotationSpec | null | undefined>
): AnnotationSpec | null {
  const total = flatGroups.length;
  const names = flatGroups.map((g) => g.name);
  const cldLabels: Array<string | null> = new Array(total).fill(null);
  const allPairs: AnnotationBracket[] = [];
  let hasCld = false;
  let hasBrackets = false;
  for (const sg of subgroups) {
    const spec = perKeySpecs[sg.name];
    if (!spec) continue;
    if (spec.kind === "cld" && spec.labels) {
      hasCld = true;
      spec.labels.forEach((lbl, i) => {
        cldLabels[sg.startIndex + i] = lbl;
      });
    } else if (spec.kind === "brackets" && spec.pairs) {
      hasBrackets = true;
      for (const pr of spec.pairs) {
        allPairs.push({ ...pr, i: pr.i + sg.startIndex, j: pr.j + sg.startIndex });
      }
    } else if (spec.kind === "both") {
      hasCld = true;
      hasBrackets = true;
      spec.labels.forEach((lbl, i) => {
        cldLabels[sg.startIndex + i] = lbl;
      });
      for (const pr of spec.pairs) {
        allPairs.push({ ...pr, i: pr.i + sg.startIndex, j: pr.j + sg.startIndex });
      }
    }
  }
  if (!hasCld && !hasBrackets) return null;
  if (hasBrackets && hasCld)
    return { kind: "both", labels: cldLabels, pairs: allPairs, groupNames: names };
  if (hasBrackets) return { kind: "brackets", pairs: allPairs, groupNames: names };
  return { kind: "cld", labels: cldLabels, groupNames: names };
}

// ── Public types for steps / controls prop interfaces ───────────────────────
//
// Mirrors the runtime shape of `VIS_INIT_BOXPLOT` in index.tsx so the prop
// bags don't need to duplicate the field list. Keep the two in sync.

export interface BoxplotVis {
  plotTitle: string;
  yLabel: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  boxFillOpacity: number;
  boxWidth: number;
  boxGap: number;
  pointSize: number;
  showPoints: boolean;
  jitterWidth: number;
  pointOpacity: number;
  xLabelAngle: number;
  yMinCustom: string;
  yMaxCustom: string;
  yScale: string;
  showCompPie: boolean;
  plotStyle: string;
  horizontal: boolean;
  errorType: string;
  errStrokeWidth: number;
  showBarOutline: boolean;
  barOutlineWidth: number;
  barOutlineColor: string;
  barOpacity: number;
  boxplotColors: Record<string, string>;
  categoryColors: Record<string, string>;
  discretePalette: string;
  categoryPalette: string;
}

export type UpdVis = (patch: Partial<BoxplotVis> | { _reset: true }) => void;

// `BoxplotGroupStats` is the merge of `quartiles(allValues)` (q1 / med / q3 /
// iqr / wLo / wHi / min / max / n) and `computeStats(allValues)` (mean / sd /
// sem / ci95 / median / + same min/max/n). All fields are non-null because
// callers filter out empty groups before constructing this — either function
// returns `null` on an empty array, but `boxplotGroups` only spreads them
// when both succeed.
export interface BoxplotGroupStats {
  n: number;
  min: number;
  max: number;
  median: number;
  mean: number;
  sd: number;
  sem: number;
  ci95: number;
  q1: number;
  med: number;
  q3: number;
  iqr: number;
  wLo: number;
  wHi: number;
}

// `BoxplotGroup` is the per-group object returned by the App's
// `boxplotGroups` useMemo — sources, allValues, stats, color, plus the
// optional displayName / enabled flags added when it's mapped through
// `allDisplayGroups`.
export interface BoxplotGroup {
  name: string;
  sources: Array<{ colIndex: number; values: number[]; category: string }>;
  allValues: number[];
  // `stats` can be null when `allValues` is empty (`quartiles` /
  // `computeStats` both return null in that case, so the spread is `{}`).
  // Chart consumers guard with `if (!g.stats) return null` before reading
  // .q1 / .med / etc.
  stats: BoxplotGroupStats | null;
  color: string;
  displayName?: string;
  enabled?: boolean;
}

export interface WideExport {
  headers: string[];
  rows: Array<Array<string | number>>;
  // Number of rows that had an empty group cell and got merged under the
  // "?" column during reshape. Optional because `reshapeWide` (the
  // current builder) doesn't populate it; the OutputStep banner
  // gracefully handles `undefined`.
  unlabelled?: number;
}

export type DragState = { col: number; idx: number } | null;

interface FilterStateCommonProps {
  parsedHeaders: string[];
  parsedRows: string[][];
  colRoles: ColumnRole[];
  colNames: string[];
}

export interface UploadStepProps {
  sepOverride: string;
  onSepChange: (s: string) => void;
  rawText: string | null;
  doParse: (text: string, sep: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  setStep: (s: string) => void;
  onLoadExample: () => void;
}

export interface ConfigureStepProps extends FilterStateCommonProps {
  fileName: string;
  hasHeader: boolean;
  valueColIdx: number;
  valueColIsNumeric: boolean;
  onRoleChange: (i: number, role: ColumnRole) => void;
  onNameChange: (i: number, name: string) => void;
}

export interface FilterStepProps extends FilterStateCommonProps {
  filters: Record<number, FilterEntry>;
  filteredRows: string[][];
  renamedRows: string[][];
  activeColIdxs: number[];
  valueRenames: Record<number, Record<string, string>>;
  orderableCols: Record<number, { order: string[]; onReorder: (newOrder: string[]) => void }>;
  applyRename: (i: number, value: string) => string;
  toggleFilter: (i: number, value: string) => void;
  toggleAllFilter: (i: number, allOn: boolean) => void;
  setRenameVal: (i: number, origValue: string, newValue: string) => void;
  dragState: DragState;
  setDragState: (s: DragState) => void;
}

export interface OutputStepProps {
  colNames: string[];
  groupColIdx: number;
  valueColIdx: number;
  valueColIsNumeric: boolean;
  stats: GroupStats[];
  renamedRows: string[][];
  activeColIdxs: number[];
  wideData: WideExport | null;
  fileName: string;
}

// ── Chart + plot-area data shapes ──────────────────────────────────────────

// Per-facet data passed to PlotArea / FacetPlotList. `category` is the
// facet's value (e.g. "Day1"); `groups` is the boxplot groups for this
// cell. When subgroups are active, `subgroups` and `flatGroups` carry the
// partitioning so the chart can draw separators + subgroup labels.
export interface FacetCell {
  category: string;
  groups: BoxplotGroup[];
  subgroups: Subgroup[] | null;
  flatGroups: BoxplotGroup[] | null;
}

export interface SubgroupedData {
  subgroups: Subgroup[];
  flatGroups: BoxplotGroup[];
}

export interface ChartProps {
  groups: BoxplotGroup[];
  yLabel: string;
  plotTitle?: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  boxWidth: number;
  boxFillOpacity: number;
  pointSize: number;
  showPoints: boolean;
  jitterWidth: number;
  pointOpacity: number;
  xLabelAngle: number;
  yMin: number | null;
  yMax: number | null;
  categoryColors?: Record<string, string>;
  colorByCol: number;
  boxGap: number;
  svgLegend: LegendBlock[] | null;
  showCompPie: boolean;
  plotStyle?: string;
  annotations: AnnotationSpec | null;
  statsSummary: string | null;
  barOpacity: number;
  errorType: string;
  errStrokeWidth: number;
  showBarOutline: boolean;
  barOutlineWidth: number;
  barOutlineColor: string;
  horizontal: boolean;
  subgroups?: Subgroup[] | null;
  subgroupSummaries?: Record<string, string | null> | null;
  yScale: string;
}

export interface PlotAreaProps {
  colorByCol: number;
  colorByCategories: string[];
  colNames: string[];
  categoryColors: Record<string, string>;
  facetByCol: number;
  facetedData: FacetCell[];
  chartRef: React.RefObject<SVGSVGElement>;
  displayBoxplotGroups: BoxplotGroup[];
  vis: BoxplotVis;
  yMinVal: number | null;
  yMaxVal: number | null;
  chartAnnotations: AnnotationSpec | null;
  chartSummary: string | null;
  subgroups?: Subgroup[] | null;
  subgroupSummaries?: Record<string, string | null> | null;
}

export interface FacetPlotListProps {
  facetedData: FacetCell[];
  facetRefs: React.MutableRefObject<Record<string, SVGSVGElement | null>>;
  vis: BoxplotVis;
  yMinVal: number | null;
  yMaxVal: number | null;
  plotGroupRenames: Record<string, string>;
  boxplotColors: Record<string, string>;
  categoryColors: Record<string, string>;
  colorByCol: number;
  colorByCategories: string[];
  colNames: string[];
  facetStatsAnnotations: Record<string, AnnotationSpec | null>;
  facetStatsSummary: Record<string, string | null>;
  facetSubgroupSummaries: Record<string, Record<string, string | null>>;
}

// FacetTrio is the per-facet memoised wrapper inside FacetPlotList — it
// receives the facet's data + the panel-level controls + the legend
// already-computed by the parent. Internal to plot-area.tsx but typed
// here so the memo wrapper can declare its props signature.
export interface FacetTrioProps {
  fd: FacetCell;
  annotations: AnnotationSpec | null;
  statsSummary: string | null;
  subgroupSummaries: Record<string, string | null> | null;
  vis: BoxplotVis;
  yMinVal: number | null;
  yMaxVal: number | null;
  plotGroupRenames: Record<string, string>;
  boxplotColors: Record<string, string>;
  categoryColors: Record<string, string>;
  colorByCol: number;
  svgLegend: LegendBlock[] | null;
  facetRefs: React.MutableRefObject<Record<string, SVGSVGElement | null>>;
}

export interface PlotControlsProps {
  dataFormat: "long" | "wide";
  setDataFormat: (f: "long" | "wide") => void;
  setStep: (s: string) => void;
  resetAll: () => void;
  allDisplayGroups: BoxplotGroup[];
  boxplotGroups: BoxplotGroup[];
  renamedRows: string[][];
  setPlotGroupRenames: (
    updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setBoxplotColors: (
    updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  onToggleGroup: (i: number) => void;
  vis: BoxplotVis;
  updVis: UpdVis;
  colorByCol: number;
  setColorByCol: (i: number) => void;
  colorByCandidates: number[];
  colNames: string[];
  categoryColors: Record<string, string>;
  setCategoryColors: (
    updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  colorByCategories: string[];
  facetByCol: number;
  setFacetByCol: (i: number) => void;
  subgroupByCol: number;
  setSubgroupByCol: (i: number) => void;
  onDownloadSvg: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDownloadPng: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

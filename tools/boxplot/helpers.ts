// Pure stats-routing, formatting, annotation, and summary helpers for the
// boxplot tool. No React / DOM dependency — separately testable
// (tests/helpers/boxplot-loader.js loads this file directly). JSX-bearing
// helpers (stats-summary SVG renderers, BoxplotChart, step components) and
// the big text-block builders (buildBpSetTextBlock / buildBpAggregateReport /
// buildBpAggregateRScript) stay in tools/boxplot.tsx.

// ── Stats summary SVG layout constants ──────────────────────────────────────

export const STATS_LINE_H = 11;
export const STATS_FONT = 8;

export function statsSummaryHeight(summary: string | null): number {
  if (!summary) return 0;
  return summary.split("\n").length * STATS_LINE_H + 14; // 14 = top/bottom padding
}

// ── Test / post-hoc metadata ────────────────────────────────────────────────

export const TEST_LABELS_BP: Record<string, string> = {
  studentT: "Student's t-test",
  welchT: "Welch's t-test",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};

export const POSTHOC_LABELS_BP: Record<string, string> = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

export const TEST_OPTIONS_BP_2 = ["studentT", "welchT", "mannWhitney"];
export const TEST_OPTIONS_BP_K = ["oneWayANOVA", "welchANOVA", "kruskalWallis"];

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

export function formatBpStatShort(testName: any, res: any) {
  if (!res || res.error) return "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${res.U.toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA")
    return `F(${res.df1}, ${typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2}) = ${res.F.toFixed(3)}`;
  if (testName === "kruskalWallis") return `H(${res.df}) = ${res.H.toFixed(3)}`;
  return "—";
}

export function formatBpResultLine(testName: any, res: any) {
  if (!res || res.error) return res && res.error ? "⚠ " + res.error : "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "mannWhitney")
    return `U = ${res.U.toFixed(1)},  z = ${res.z.toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA")
    return `F(${res.df1}, ${typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2}) = ${res.F.toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "kruskalWallis")
    return `H(${res.df}) = ${res.H.toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

// ── Annotation spec ─────────────────────────────────────────────────────────

// Build the annotation spec the chart consumes, from a row's test / post-hoc
// result. Mirrors StatsTile's logic but driven by panel-level display
// controls rather than per-row toggles.
export function computeBpAnnotationSpec(row: any, displayMode: any, showNs: any) {
  if (displayMode === "none" || !row || row.skip) return null;
  const { k, names, testResult, postHocResult } = row;
  if (k < 2) return null;
  if (k === 2) {
    const p = testResult && !testResult.error ? testResult.p : null;
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
    .map((pr: any) => ({ i: pr.i, j: pr.j, p: pr.pAdj != null ? pr.pAdj : pr.p }))
    .map((pr: any) => ({ ...pr, label: pStars(pr.p) }))
    .filter((pr: any) => showNs || pr.p < 0.05);
  if (pairs.length === 0) return null;
  return { kind: "brackets", pairs, groupNames: names };
}

// ── Plain-text summaries ────────────────────────────────────────────────────

// Plain-text "print summary below plot" string — a lean four-line recap
// (normality / equal variance / test / post-hoc). Detailed per-pair stats
// live in the TXT / R downloads.
export function summariseNormality(norm: any) {
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

export function summariseEqualVariance(lev: any) {
  if (!lev || lev.F == null) return "—";
  return lev.equalVar ? "yes" : "no";
}

export function computeBpSummaryText(row: any, showSummary: any, errorBarLabel: any) {
  if (!showSummary || !row || row.skip) return null;
  const { chosenTest, testResult, k, postHocName, rec } = row;
  if (!chosenTest || !testResult || testResult.error) return null;
  const lines = [
    `Normality: ${summariseNormality(rec && rec.normality)}`,
    `Equal variance: ${summariseEqualVariance(rec && rec.levene)}`,
    `Test: ${TEST_LABELS_BP[chosenTest] || chosenTest}`,
  ];
  if (k > 2 && postHocName) {
    lines.push(`Post-hoc: ${POSTHOC_LABELS_BP[postHocName] || postHocName}`);
  }
  if (errorBarLabel) lines.push(`Error bars: ${errorBarLabel}`);
  return lines.join("\n");
}

// ── Sub-group annotation merge ──────────────────────────────────────────────

export function mergeSubgroupAnnotations(subgroups: any, flatGroups: any, perKeySpecs: any) {
  const total = flatGroups.length;
  const names = flatGroups.map((g: any) => g.name);
  const cldLabels: Array<string | null> = new Array(total).fill(null);
  const allPairs: any[] = [];
  let hasCld = false;
  let hasBrackets = false;
  for (const sg of subgroups) {
    const spec = perKeySpecs[sg.name];
    if (!spec) continue;
    if (spec.kind === "cld" && spec.labels) {
      hasCld = true;
      spec.labels.forEach((lbl: string, i: number) => {
        cldLabels[sg.startIndex + i] = lbl;
      });
    } else if (spec.kind === "brackets" && spec.pairs) {
      hasBrackets = true;
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

// `BoxplotGroup` is the per-group object returned by the App's
// `boxplotGroups` useMemo — sources, allValues, stats, color, plus the
// optional displayName / enabled flags added when it's mapped through
// `allDisplayGroups`.
export interface BoxplotGroup {
  name: string;
  sources: Array<{ colIndex: number; values: number[]; category: string }>;
  allValues: number[];
  stats: any;
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

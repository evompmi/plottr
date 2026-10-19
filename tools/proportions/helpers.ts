// Proportions tool — pure data model, statistics orchestration and typed
// prop interfaces. No React, no DOM: loaded by tests/helpers/
// proportions-loader.js.
//
// Input is a counts table: first column = group labels, every other column
// = one outcome category holding non-negative integer counts, e.g.
//
//   Genotype,Colonised,Not colonised
//   WT,34,16
//   mutant-1,12,38
//
// The analysed table is what the chart shows: the full groups × categories
// table for the stacked / mosaic charts, or the focus category vs. the
// pooled rest (2 columns) for the proportion chart. Tests run on exactly
// that table, so what users see is what gets tested.

import {
  chiSquareIndependence,
  compactLetterDisplay,
  fisherExact,
  holmAdjust,
  multinomialExactGOF,
  pairwiseFisher,
  pairwiseFisherVsControl,
  pStars,
  selectCountsTest,
  wilsonCI,
} from "../_core/stats";
import type {
  ChiSquareResult,
  CountsPair,
  CountsTestSelection,
  FisherResult,
  GOFResult,
  PAdjustMethod,
  ProportionCI,
} from "../_core/stats";
import { isNumericValue, toNumericValue } from "../_core/numeric";
import type { ParseRawResult } from "../_core/csv";

// ── Types ───────────────────────────────────────────────────────────────

export interface CountsTable {
  groups: string[];
  categories: string[];
  // counts[g][c] — non-negative integers.
  counts: number[][];
}

export type CountsParseError =
  | { kind: "tooFewColumns" }
  | { kind: "tooFewRows" }
  | { kind: "notCount"; group: string; category: string; value: string }
  | { kind: "duplicateGroup"; group: string }
  | { kind: "emptyLabel"; row: number };

export interface CountsParseResult {
  table: CountsTable | null;
  error: CountsParseError | null;
  // Cells left blank, read as 0.
  blankCells: number;
}

export type ChartType = "proportion" | "stacked" | "mosaic";
export type AnnotationMode = "brackets" | "cld" | "none";
export type SegmentLabelMode = "none" | "percent" | "count";
export type TestChoice = "auto" | "fisher" | "chi2";

export interface ProportionsVis {
  chartType: ChartType;
  showCI: boolean;
  showN: boolean;
  annotation: AnnotationMode;
  showNsBrackets: boolean;
  segmentLabels: SegmentLabelMode;
  discretePalette: string;
  barWidthFrac: number;
  barOutline: boolean;
  barOutlineWidth: number;
  xLabelAngle: number;
  plotWidth: number;
  plotHeight: number;
  tickFontSize: number;
  plotTitle: string;
  yLabel: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  testChoice: TestChoice;
  adjustMethod: PAdjustMethod;
}

export interface OrderItem {
  name: string;
  include: boolean;
}

// ── Parsing ─────────────────────────────────────────────────────────────

export function parseCountsTable(
  parsed: Pick<ParseRawResult, "headers" | "rows">
): CountsParseResult {
  const { headers, rows } = parsed;
  const fail = (error: CountsParseError): CountsParseResult => ({
    table: null,
    error,
    blankCells: 0,
  });
  if (headers.length < 3) return fail({ kind: "tooFewColumns" });
  const dataRows = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (dataRows.length < 2) return fail({ kind: "tooFewRows" });
  const categories = headers.slice(1).map((h, i) => String(h ?? "").trim() || `Category ${i + 1}`);
  const groups: string[] = [];
  const counts: number[][] = [];
  const seen = new Set<string>();
  let blankCells = 0;
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const label = String(row[0] ?? "").trim();
    if (label === "") return fail({ kind: "emptyLabel", row: r + 1 });
    if (seen.has(label)) return fail({ kind: "duplicateGroup", group: label });
    seen.add(label);
    const vals: number[] = [];
    for (let c = 0; c < categories.length; c++) {
      const raw = String(row[c + 1] ?? "").trim();
      if (raw === "") {
        blankCells++;
        vals.push(0);
        continue;
      }
      const v = isNumericValue(raw) ? toNumericValue(raw) : NaN;
      if (!Number.isInteger(v) || v < 0) {
        return fail({ kind: "notCount", group: label, category: categories[c], value: raw });
      }
      vals.push(v);
    }
    groups.push(label);
    counts.push(vals);
  }
  return { table: { groups, categories, counts }, error: null, blankCells };
}

// ── Selection / reordering ──────────────────────────────────────────────

export function defaultOrder(names: string[]): OrderItem[] {
  return names.map((name) => ({ name, include: true }));
}

export interface SelectedTable {
  table: CountsTable;
  // Included groups whose total over the included categories is zero —
  // dropped because a proportion with n = 0 is undefined.
  droppedGroups: string[];
}

export function applySelection(
  table: CountsTable,
  groupOrder: OrderItem[],
  catOrder: OrderItem[]
): SelectedTable {
  const gIdx = groupOrder
    .filter((g) => g.include)
    .map((g) => table.groups.indexOf(g.name))
    .filter((i) => i >= 0);
  const cIdx = catOrder
    .filter((c) => c.include)
    .map((c) => table.categories.indexOf(c.name))
    .filter((i) => i >= 0);
  const groups: string[] = [];
  const counts: number[][] = [];
  const droppedGroups: string[] = [];
  for (const g of gIdx) {
    const row = cIdx.map((c) => table.counts[g][c]);
    if (row.reduce((a, b) => a + b, 0) === 0) droppedGroups.push(table.groups[g]);
    else {
      groups.push(table.groups[g]);
      counts.push(row);
    }
  }
  return {
    table: { groups, categories: cIdx.map((c) => table.categories[c]), counts },
    droppedGroups,
  };
}

// Focus category vs. the pooled rest. `restLabel` is the (translated)
// name of the pooled column; with exactly two categories the other
// category keeps its own name.
export function collapseToFocus(table: CountsTable, focus: number, restLabel: string): CountsTable {
  const k = table.categories.length;
  const f = Math.min(Math.max(0, focus), k - 1);
  const other = k === 2 ? table.categories[1 - f] : restLabel;
  return {
    groups: table.groups,
    categories: [table.categories[f], other],
    counts: table.counts.map((row) => {
      const n = row.reduce((a, b) => a + b, 0);
      return [row[f], n - row[f]];
    }),
  };
}

// ── Summaries ───────────────────────────────────────────────────────────

export interface GroupSummary {
  group: string;
  n: number;
  counts: number[];
  // Per category: proportion with its Wilson 95 % CI.
  props: ProportionCI[];
}

export function groupSummaries(table: CountsTable): GroupSummary[] {
  return table.groups.map((group, g) => {
    const counts = table.counts[g];
    const n = counts.reduce((a, b) => a + b, 0);
    return { group, n, counts, props: counts.map((x) => wilsonCI(x, n)) };
  });
}

// Drop categories that are zero in every group (they make expected
// counts zero and carry no information).
export function dropEmptyCategories(table: CountsTable): CountsTable {
  const keep = table.categories.map((_, c) => table.counts.some((row) => row[c] > 0));
  return {
    groups: table.groups,
    categories: table.categories.filter((_, c) => keep[c]),
    counts: table.counts.map((row) => row.filter((_, c) => keep[c])),
  };
}

// ── Analysis ────────────────────────────────────────────────────────────

export interface ProportionsAnalysis {
  // Table the tests ran on (empty categories dropped).
  table: CountsTable;
  selection: CountsTestSelection;
  test: "fisher" | "chi2";
  fisher: FisherResult | null;
  chi2: ChiSquareResult;
  // Omnibus p of the test actually used.
  p: number;
  pairs: CountsPair[];
  // Index of the control group when every group is compared with it only
  // (many-to-one); null for all pairs.
  control: number | null;
  // Compact-letter display, one string per group ("" when k < 3 or when
  // comparing with a control — letters need every pair).
  cld: string[];
  error: "tooSmall" | null;
}

export function analyseTable(
  input: CountsTable,
  testChoice: TestChoice,
  adjust: PAdjustMethod,
  controlGroup: string | null = null
): ProportionsAnalysis {
  const table = dropEmptyCategories(input);
  const chi2 = chiSquareIndependence(table.counts);
  const empty: ProportionsAnalysis = {
    table,
    selection: {
      test: "fisher",
      reason: "twoByTwo",
      minExpected: NaN,
      nExpectedBelow5: 0,
      nCells: 0,
    },
    test: "fisher",
    fisher: null,
    chi2,
    p: NaN,
    pairs: [],
    control: null,
    cld: table.groups.map(() => ""),
    error: "tooSmall",
  };
  if (table.groups.length < 2 || table.categories.length < 2) return empty;
  const selection = selectCountsTest(table.counts);
  const test = testChoice === "auto" ? selection.test : testChoice;
  const fisher = test === "fisher" ? fisherExact(table.counts) : null;
  const p = fisher ? fisher.p : chi2.p;
  const multi = table.groups.length > 2;
  // A control that isn't among the analysed groups falls back to all pairs.
  const ci = controlGroup === null ? -1 : table.groups.indexOf(controlGroup);
  const control = multi && ci >= 0 ? ci : null;
  const pairs = !multi
    ? []
    : control !== null
      ? pairwiseFisherVsControl(table.counts, control, adjust)
      : pairwiseFisher(table.counts, adjust);
  const cld =
    multi && control === null
      ? compactLetterDisplay(pairs, table.groups.length)
      : table.groups.map(() => "");
  return { table, selection, test, fisher, chi2, p, pairs, control, cld, error: null };
}

// Brackets for the chart: significant pairs (adjusted p < 0.05) by
// default, every pair when `showNs`. With exactly two groups the single
// "pair" is the omnibus test itself.
export interface BracketSpec {
  i: number;
  j: number;
  label: string;
}

export function bracketPairs(analysis: ProportionsAnalysis, showNs: boolean): BracketSpec[] {
  if (analysis.error) return [];
  if (analysis.table.groups.length === 2) {
    const label = pStars(analysis.p);
    return showNs || label !== "ns" ? [{ i: 0, j: 1, label }] : [];
  }
  return analysis.pairs
    .filter((pr) => showNs || pr.pAdj < 0.05)
    .map((pr) => ({ i: pr.i, j: pr.j, label: pStars(pr.pAdj) }));
}

// ── Goodness of fit ─────────────────────────────────────────────────────

export const RATIO_PRESETS: ReadonlyArray<{ ratio: string; k: number }> = [
  { ratio: "1:1", k: 2 },
  { ratio: "3:1", k: 2 },
  { ratio: "15:1", k: 2 },
  { ratio: "1:2:1", k: 3 },
  { ratio: "9:3:4", k: 3 },
  { ratio: "12:3:1", k: 3 },
  { ratio: "9:3:3:1", k: 4 },
];

// "9:3:3:1" (also accepts "/", spaces, commas as separators) → [9,3,3,1].
// Null when malformed, non-positive, or not one entry per category.
export function parseRatio(text: string, k: number): number[] | null {
  const parts = String(text ?? "")
    .trim()
    .split(/\s*[:/,;\s]\s*/)
    .filter((s) => s !== "");
  if (parts.length !== k) return null;
  const vals = parts.map((s) => (isNumericValue(s) ? toNumericValue(s) : NaN));
  if (!vals.every((v) => Number.isFinite(v) && v > 0)) return null;
  return vals;
}

export interface GroupGOF {
  group: string;
  n: number;
  result: GOFResult;
  pAdj: number;
}

// One goodness-of-fit test per group (exact multinomial when the outcome
// space is small enough, χ² otherwise), Holm-adjusted across groups.
export function gofPerGroup(table: CountsTable, ratio: number[]): GroupGOF[] {
  const res = table.groups.map((group, g) => ({
    group,
    n: table.counts[g].reduce((a, b) => a + b, 0),
    result: multinomialExactGOF(table.counts[g], ratio),
  }));
  const adj = holmAdjust(res.map((r) => r.result.p));
  return res.map((r, i) => ({ ...r, pAdj: adj[i] }));
}

// ── Chart geometry (pure) ───────────────────────────────────────────────

export interface Segment {
  category: number;
  // Fractions of the bar, bottom (y0) to top (y1), in [0, 1].
  y0: number;
  y1: number;
  count: number;
}

// Stacked 100 % segments for one group, first category at the bottom.
export function stackSegments(counts: number[]): Segment[] {
  const n = counts.reduce((a, b) => a + b, 0);
  let acc = 0;
  return counts.map((count, category) => {
    const y0 = n > 0 ? acc / n : 0;
    acc += count;
    return { category, y0, y1: n > 0 ? acc / n : 0, count };
  });
}

// Mosaic column spans: widths ∝ group totals over `width`, with `gap`
// pixels between columns. Returns [x0, x1] per group.
export function mosaicSpans(totals: number[], width: number, gap: number): [number, number][] {
  const n = totals.reduce((a, b) => a + b, 0);
  const usable = Math.max(0, width - gap * (totals.length - 1));
  let x = 0;
  return totals.map((t) => {
    const w = n > 0 ? (usable * t) / n : 0;
    const span: [number, number] = [x, x + w];
    x += w + gap;
    return span;
  });
}

// Palette colour per name, with per-name overrides on top (overrides are
// keyed by name so they survive reordering and exclusion).
export function resolveColors(
  names: string[],
  palette: string[],
  overrides: Record<string, string>
): string[] {
  return names.map((n, i) => overrides[n] ?? palette[i % Math.max(1, palette.length)]);
}

export function formatPct(p: number, digits = 1): string {
  return Number.isFinite(p) ? (100 * p).toFixed(digits) + " %" : "—";
}

// ── Prop interfaces ─────────────────────────────────────────────────────

export interface ProportionsChartProps {
  table: CountsTable;
  chartType: ChartType;
  // Proportion chart: summaries of the analysed (focus vs rest) table;
  // index 0 is the focus category.
  summaries: GroupSummary[];
  brackets: BracketSpec[];
  cld: string[];
  annotation: AnnotationMode;
  // One colour per category (stacked / mosaic segments).
  colors: string[];
  // One colour per group (proportion-chart bars).
  groupColors: string[];
  showCI: boolean;
  showN: boolean;
  segmentLabels: SegmentLabelMode;
  barWidthFrac: number;
  // Black outline around bars / segments (px); off → no outline on bars,
  // thin white separators between stacked segments.
  barOutline: boolean;
  barOutlineWidth: number;
  // Group-label tilt in degrees, −90…0 (0 = horizontal).
  xLabelAngle: number;
  plotWidth: number;
  plotHeight: number;
  tickFontSize: number;
  title: string;
  yLabel: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
}

export interface OrderListProps {
  title: string;
  items: OrderItem[];
  onChange: (next: OrderItem[]) => void;
  testIdPrefix: string;
}

export interface ConfigureStepProps {
  table: CountsTable;
  fileName: string;
  detectedSep: string;
  blankCells: number;
  groupOrder: OrderItem[];
  setGroupOrder: (next: OrderItem[]) => void;
  catOrder: OrderItem[];
  setCatOrder: (next: OrderItem[]) => void;
  droppedGroups: string[];
}

export interface StatsPanelProps {
  analysis: ProportionsAnalysis;
  // Control group name (many-to-one comparisons) or null for all pairs.
  control: string | null;
  setControl: (name: string | null) => void;
  // Column names matching `summaries[*].counts`.
  categories: string[];
  summaries: GroupSummary[];
  focusLabel: string | null;
  vis: ProportionsVis;
  updVis: (patch: Partial<ProportionsVis>) => void;
  onDownloadReport: () => void;
  onDownloadR: () => void;
}

export interface GofPanelProps {
  table: CountsTable;
  ratioText: string;
  setRatioText: (v: string) => void;
}

export interface TileProps {
  vis: ProportionsVis;
  updVis: (patch: Partial<ProportionsVis>) => void;
}

export interface ChartTileProps extends TileProps {
  categories: string[];
  focus: number;
  setFocus: (i: number) => void;
}

export interface ColorItem {
  name: string;
  color: string;
  n: number;
}

export interface ColorsTileProps extends TileProps {
  // Groups (proportion chart) or categories (stacked / mosaic) to colour.
  items: ColorItem[];
  itemsLabel: string;
  onColorChange: (name: string, color: string) => void;
  onPaletteChange: (palette: string) => void;
}

export interface PlotStepProps {
  chartRef: React.RefObject<SVGSVGElement>;
  // Groups × categories after the Configure-step selection.
  selected: CountsTable;
  // Table the chart shows: `selected`, or focus vs. rest for the
  // proportion chart. Tests run on it with empty categories dropped.
  displayed: CountsTable;
  analysis: ProportionsAnalysis;
  summaries: GroupSummary[];
  brackets: BracketSpec[];
  colors: string[];
  groupColors: string[];
  onGroupColor: (name: string, color: string) => void;
  onCategoryColor: (name: string, color: string) => void;
  onPaletteChange: (palette: string) => void;
  focus: number;
  setFocus: (i: number) => void;
  focusLabel: string | null;
  control: string | null;
  setControl: (name: string | null) => void;
  vis: ProportionsVis;
  updVis: (patch: Partial<ProportionsVis>) => void;
  ratioText: string;
  setRatioText: (v: string) => void;
  fileName: string;
  onDownloadCsv: () => void;
  onDownloadReport: () => void;
  onDownloadR: () => void;
  onReset: () => void;
}

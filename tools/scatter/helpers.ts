// Pure helpers + typed prop interfaces for the scatter tool. Pure helpers
// (fmtTick, computeLinearRegression, layout constants) have no React / DOM
// dependency and are separately testable (tests/helpers/scatter-loader.js
// loads this file directly). The types below are the shared contract
// between app.tsx, chart.tsx, plot-area.tsx, and shapes.tsx — declared
// here so steps.tsx / plot-area.tsx can import them without forcing a
// circular `app → step → app` import.
//
// Keep JSX-bearing helpers (PaletteStrip, renderPoint, ShapePreview) out —
// they belong in tools/scatter/shapes.tsx.

import type { LegendBlock } from "../_shell";
import {
  kendallTau,
  pearsonCorrelation,
  selectCorrelation,
  spearmanCorrelation,
} from "../_core/stats/tests";
import type {
  CorrTest,
  KendallTauResult,
  PearsonCorrResult,
  SpearmanCorrResult,
} from "../_core/stats/types";
import { formatP } from "../_core/stats/format";
import type { ParseDataResult } from "../_core/csv";
export type { LegendBlock, CorrTest };

// ── Tick formatting ────────────────────────────────────────────────────────

export function fmtTick(t: number): string {
  if (t === 0) return "0";
  const abs = Math.abs(t);
  if (abs >= 10000 || (abs < 0.01 && abs > 0)) return t.toExponential(1);
  if (abs >= 100) return t.toFixed(0);
  return parseFloat(t.toPrecision(3)).toString();
}

// ── Shapes ────────────────────────────────────────────────────────────────

export const SHAPES = ["circle", "triangle", "cross", "square"];

// ── Layout constants ──────────────────────────────────────────────────────

export const MARGIN = { top: 28, right: 28, bottom: 56, left: 70 };
export const VBW = 800;
export const VBH = 500;

// ── Simple linear regression (y ~ x) ──────────────────────────────────────

// Runs over the supplied rows. Skips any row where either column is null or
// NaN. Returns `{valid: false}` for fewer than 2 usable points or when either
// axis is degenerate (zero variance). Otherwise `{valid: true, slope,
// intercept, r2, n}` with `r2` possibly `NaN` if y is degenerate but x is
// not. The `valid` field is a discriminant — `if (rs.valid)` narrows to the
// populated branch so callers can read `.slope` / `.intercept` / `.r2` / `.n`
// without optional-chaining.
export function computeLinearRegression(
  rows: Array<Array<number | null>>,
  xCol: number,
  yCol: number
): { valid: false } | { valid: true; slope: number; intercept: number; r2: number; n: number } {
  if (!rows || rows.length < 2) return { valid: false };
  // Two passes over centred values (what R's `lm` effectively computes).
  // The one-pass `n·Σx² − (Σx)²` form cancels catastrophically once |x| is
  // large next to its spread — the slope is already off in the 4th digit at
  // x ≈ 1e7 and meaningless for epoch timestamps — while the stats panel's
  // Pearson r stays correct, so the two would disagree.
  const xs: number[] = [];
  const ys: number[] = [];
  let xMin = Infinity,
    xMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity,
    sx = 0,
    sy = 0;
  for (const row of rows) {
    const x = row[xCol],
      y = row[yCol];
    if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
    xs.push(x);
    ys.push(y);
    sx += x;
    sy += y;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const n = xs.length;
  // All-equal x is tested on the raw values: the mean of identical values
  // need not round back to that value, so a centred Σ(x − x̄)² can be FP
  // noise rather than an exact 0.
  if (n < 2 || xMin === xMax) return { valid: false };
  const mx = sx / n,
    my = sy / n;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx,
      dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0) return { valid: false };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2Raw = yMin === yMax || syy === 0 ? NaN : (sxy * sxy) / (sxx * syy);
  // Clamp to the mathematical invariant r² ∈ [0, 1]. Even centred, the
  // ratio can overshoot by FP noise when the spreads sit at subnormal
  // magnitudes (e.g. x-values 1e-160 apart); clamping keeps the contract.
  const r2 = Number.isFinite(r2Raw) ? Math.min(1, Math.max(0, r2Raw)) : r2Raw;
  return { valid: true, slope, intercept, r2, n };
}

export type RegressionStats = ReturnType<typeof computeLinearRegression>;

// ── Correlation (scatter stats panel) ──────────────────────────────────────
//
// The scatter stats panel runs pure-text helpers off these types. Runtime
// results come from the `pearsonCorrelation` / `spearmanCorrelation` /
// `kendallTau` / `selectCorrelation` globals declared in
// `types/globals.d.ts`.

export const CORR_TEST_LABELS: Record<CorrTest, string> = {
  pearson: "Pearson r",
  spearman: "Spearman ρ",
  kendall: "Kendall τ",
};

export const CORR_TEST_OPTIONS: CorrTest[] = ["pearson", "spearman", "kendall"];

// Discriminated union of the three correlation-result shapes. The panel
// branches on `kind` to pull the right coefficient field; downstream
// formatters narrow via the same tag.
export type CorrResult =
  | ({ kind: "pearson" } & PearsonCorrResult)
  | ({ kind: "spearman" } & SpearmanCorrResult)
  | ({ kind: "kendall" } & KendallTauResult);

// Run the named test on a paired (x, y) array. Drops rows where either
// value is non-finite before delegating to the stats global. Returns
// `{ ... , error }`-shaped results on failure so callers don't have to
// branch on the test name themselves.
export function runCorrelation(
  test: CorrTest,
  xs: number[],
  ys: number[],
  opts?: { conf?: number }
): CorrResult {
  if (test === "spearman") {
    return { kind: "spearman", ...spearmanCorrelation(xs, ys, opts) };
  }
  if (test === "kendall") {
    return { kind: "kendall", ...kendallTau(xs, ys, opts) };
  }
  return { kind: "pearson", ...pearsonCorrelation(xs, ys, opts) };
}

// Pull the coefficient (`r` / `rho` / `tau`) from a CorrResult.
export function correlationCoef(res: CorrResult): number {
  if (res.kind === "spearman") return res.rho;
  if (res.kind === "kendall") return res.tau;
  return res.r;
}

// R's `cor.test` statistics on the exact (tie-free) paths: Spearman's
// S = (n³ − n)(1 − ρ)/6 and Kendall's T = #concordant pairs.
function spearmanS(rho: number, n: number): string {
  return String(Math.round(((n * n * n - n) * (1 - rho)) / 6));
}
function kendallT(S: number, n: number): string {
  return String(Math.round((S + (n * (n - 1)) / 2) / 2));
}

// Compact "stat = value" string for the table row. Pearson ships a
// t-statistic + df; Spearman / Kendall ship t / z, or R's S / T on the
// exact tie-free paths. Format mirrors boxplot's
// formatBpStatShort.
export function formatCorrStatShort(res: CorrResult | null | undefined): string {
  if (!res || res.error) return "—";
  if (res.kind === "pearson") return `r = ${res.r.toFixed(3)}, t(${res.df}) = ${res.t.toFixed(3)}`;
  if (res.kind === "spearman")
    return res.exact
      ? `ρ = ${res.rho.toFixed(3)}, S = ${spearmanS(res.rho, res.n)}`
      : `ρ = ${res.rho.toFixed(3)}, t(${res.df}) = ${res.t.toFixed(3)}`;
  return res.exact
    ? `τ = ${res.tau.toFixed(3)}, T = ${kendallT(res.S, res.n)}`
    : `τ = ${res.tau.toFixed(3)}, z = ${res.z.toFixed(3)}`;
}

// Full-precision human-readable line used in the expanded detail and the
// TXT export.
export function formatCorrResultLine(res: CorrResult | null | undefined): string {
  if (!res) return "—";
  if (res.error) return "⚠ " + res.error;
  if (res.kind === "pearson") {
    const ci = res.ci;
    const ciStr = Number.isFinite(ci.lo)
      ? `, 95% CI [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]`
      : "";
    return `r = ${res.r.toFixed(3)}${ciStr}, t(${res.df}) = ${res.t.toFixed(3)}, p = ${formatP(res.p)}`;
  }
  if (res.kind === "spearman") {
    const ci = res.ci;
    const ciStr = Number.isFinite(ci.lo)
      ? `, 95% CI [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]`
      : "";
    return res.exact
      ? `ρ = ${res.rho.toFixed(3)}${ciStr}, S = ${spearmanS(res.rho, res.n)}, p = ${formatP(res.p)}`
      : `ρ = ${res.rho.toFixed(3)}${ciStr}, t(${res.df}) = ${res.t.toFixed(3)}, p = ${formatP(res.p)}`;
  }
  return res.exact
    ? `τ = ${res.tau.toFixed(3)}, T = ${kendallT(res.S, res.n)}, p = ${formatP(res.p)} (exact)`
    : `τ = ${res.tau.toFixed(3)}, z = ${res.z.toFixed(3)}, p = ${formatP(res.p)}`;
}

// One row in the scatter stats panel — the unfiltered "all rows" set plus
// one per category when a discrete colour aesthetic is mapped.
export interface ScatterStatsSet {
  // Stable key for keyed React renders + per-row override storage.
  key: string;
  // Human-readable label for the row ("All", "setosa", "versicolor", …).
  name: string;
  // Optional swatch colour so per-group rows can carry the colour-map dot.
  color?: string;
  // Paired complete x / y values for this row (NaN/null already stripped).
  xs: number[];
  ys: number[];
}

// Enriched row after the panel runs selectCorrelation + the chosen test.
// Mirrors the boxplot enriched-row pattern.
export interface EnrichedScatterStatsRow extends ScatterStatsSet {
  n: number;
  rec: ReturnType<typeof selectCorrelation> | null;
  recTest: CorrTest | null;
  chosenTest: CorrTest;
  testResult: CorrResult | null;
  skip?: false;
}

export type EnrichedOrSkip =
  | EnrichedScatterStatsRow
  | (ScatterStatsSet & { n: number; skip: true });

// ── Vis state + reference-line / regression sub-types ──────────────────────
//
// `ScatterVis` mirrors the runtime shape of `VIS_INIT_SCATTER` in app.tsx.
// Declared here (helpers.ts is the type-canonical home) so step / plot-area
// modules can import it without forcing a circular import through app.tsx.
//
// Auto-prefs uses a value-compat whitelist (loadAutoPrefs in shared-prefs.js)
// so all fields default to a non-undefined value at the runtime declaration
// site; this interface mirrors that contract.

export interface RefLine {
  id: number;
  dir: "h" | "v";
  value: number;
  color: string;
  strokeWidth: number;
  dashed: boolean;
  dashArray?: string;
  label: string;
  labelSide: "left" | "right" | "top" | "bottom";
}

export type RegressionPosition = "tl" | "tr" | "bl" | "br";

export interface ScatterRegression {
  on: boolean;
  color: string;
  strokeWidth: number;
  dashed: boolean;
  showStats: boolean;
  position: RegressionPosition;
}

export interface ScatterVis {
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  xLabel: string;
  yLabel: string;
  plotTitle: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  tickFontSize: number;
  pointColor: string;
  pointSize: number;
  pointOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  colorMapPalette: string;
  colorMapDiscrete: Record<string, string>;
  discretePalette: string;
  sizeMapMin: number;
  sizeMapMax: number;
  sizeMapDiscrete: Record<string, number>;
  shapeMapDiscrete: Record<string, string>;
  refLines: RefLine[];
  regression: ScatterRegression;
}

export type UpdVis = (patch: Partial<ScatterVis> | { _reset: true }) => void;

export interface AutoAxis {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type ColumnType = "continuous" | "discrete" | null;

// `Record<string, V>` setter that accepts both direct values and functional
// updaters — mirrors React's setState signature. `app.tsx` defines the
// setColorMapDiscrete / setSizeMapDiscrete / setShapeMapDiscrete callbacks
// in this shape so existing call sites (`setX((prev) => ({...prev, k: v}))`)
// work unchanged.
export type SetMapDispatch<V> = (
  updater: Record<string, V> | ((prev: Record<string, V>) => Record<string, V>)
) => void;

export type SetRefLinesDispatch = (updater: RefLine[] | ((prev: RefLine[]) => RefLine[])) => void;

// ── Chart props ────────────────────────────────────────────────────────────

export interface ChartProps {
  data: Array<Array<number | null>>;
  rawData: string[][];
  xCol: number;
  yCol: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  title: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  tickFontSize: number;
  refLines: RefLine[];
  regression: ScatterRegression;
  regressionStats: RegressionStats;
  pointColor: string;
  pointSize: number;
  pointOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  colorMapCol: number | null;
  colorMapType: ColumnType;
  colorMapPalette: string;
  colorMapDiscrete: Record<string, string>;
  colorMapRange: [number, number];
  sizeMapCol: number | null;
  sizeMapType: ColumnType;
  sizeMapMin: number;
  sizeMapMax: number;
  sizeMapDiscrete: Record<string, number>;
  sizeMapRange: [number, number];
  shapeMapCol: number | null;
  shapeMapDiscrete: Record<string, string>;
  svgLegend: LegendBlock[] | null;
}

// ── PlotStep props ─────────────────────────────────────────────────────────
//
// PlotStep is the right-rail composition: chart + sidebar controls + the
// per-row regression / filter / mapping panels. Receives every column-
// mapping slot as a (state, setter) pair so the sidebar's mutations land
// back on App's vis reducer / local useState through the right channel.

export interface PlotStepProps {
  parsed: ParseDataResult;
  fileName: string;
  // Separator the auto-detector resolved. Empty string until first parse.
  detectedSep: string;
  filteredData: Array<Array<number | null>>;
  filteredRawRows: string[][];
  activeColIdxs: number[];
  xCol: number;
  setXCol: (i: number) => void;
  yCol: number;
  setYCol: (i: number) => void;
  numericCols: number[];
  pointColor: string;
  setPointColor: (v: string) => void;
  pointSize: number;
  setPointSize: (v: number) => void;
  pointOpacity: number;
  setPointOpacity: (v: number) => void;
  strokeColor: string;
  setStrokeColor: (v: string) => void;
  strokeWidth: number;
  setStrokeWidth: (v: number) => void;
  colorMapCol: number | null;
  setColorMapCol: (i: number | null) => void;
  colorMapType: ColumnType;
  colorMapPalette: string;
  setColorMapPalette: (v: string) => void;
  colorMapDiscrete: Record<string, string>;
  setColorMapDiscrete: SetMapDispatch<string>;
  colorMapCategories: string[];
  colorMapRange: [number, number];
  sizeMapCol: number | null;
  setSizeMapCol: (i: number | null) => void;
  sizeMapType: ColumnType;
  sizeMapMin: number;
  setSizeMapMin: (v: number) => void;
  sizeMapMax: number;
  setSizeMapMax: (v: number) => void;
  sizeMapDiscrete: Record<string, number>;
  setSizeMapDiscrete: SetMapDispatch<number>;
  sizeMapCategories: string[];
  sizeMapRange: [number, number];
  shapeMapCol: number | null;
  setShapeMapCol: (i: number | null) => void;
  shapeMapCategories: string[];
  shapeMapDiscrete: Record<string, string>;
  setShapeMapDiscrete: SetMapDispatch<string>;
  shapeWarning: string | null;
  vis: ScatterVis;
  updVis: UpdVis;
  autoAxis: AutoAxis;
  effAxis: AutoAxis;
  refLines: RefLine[];
  addRefLine: (dir: "h" | "v") => void;
  updateRefLine: (id: number, key: string, val: unknown) => void;
  removeRefLine: (id: number) => void;
  regression: ScatterRegression;
  updRegression: (patch: Partial<ScatterRegression>) => void;
  regressionStats: RegressionStats;
  filterState: Record<string, string[]>;
  setFilterState: (
    updater:
      | Record<string, string[]>
      | ((prev: Record<string, string[]>) => Record<string, string[]>)
  ) => void;
  filterableCols: number[];
  uniqueVals: (colIdx: number | null) => string[];
  mappableCols: number[];
  resetAll: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
  svgLegend: LegendBlock[] | null;
  // Pre-assembled "All" + per-colour-category sets for the stats panel.
  // Empty when fewer than 3 complete pairs are available.
  statsSets: ScatterStatsSet[];
  // File stem (e.g. "iris_scatter") used to name downloaded reports.
  fileStem: string;
}

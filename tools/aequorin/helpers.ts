// Pure calibration, condition-detection, smoothing, and SVG-path helpers for
// the Aequorin tool. No React / DOM dependency — separately testable
// (tests/helpers/aequorin-loader.js loads this file directly). Keep chart
// components and step UI out; they belong in the sibling modules under
// tools/aequorin/ (chart.tsx, stats-panel.tsx, reports.ts, plot-area.tsx,
// steps.tsx, controls.tsx, index.tsx).

import { CHART_MARGIN, buildLineD, resolveDiscretePalette, round2 } from "../_shell";
import type { LegendBlock, PowerFromDataResult, TestResult } from "../_shell";
import { PALETTE } from "../_core/color";
import { selectTest } from "../_core/stats/posthoc";
import type { ParseDataResult } from "../_core/csv";
export { buildLineD };

// ── Calibration defaults ─────────────────────────────────────────────────────
//
// These values are the kinetic rate constants for native shrimp aequorin in
// solution, as determined experimentally and tabulated by Allen & Blinks:
//
//   Allen, D. G., & Blinks, J. R. (1978). "Calcium transients in aequorin-
//   injected frog cardiac muscle." Nature 273(5663): 509-513.
//
//   • KR  = 7     — rate constant for the calcium-bound luminescent state
//   • KTR = 118   — turnover rate from the triggered complex
//
// The Hill variant (Kd) and the adjustable Hill exponent (n) come from the
// equilibrium treatment later adopted for plant aequorin:
//
//   Knight, M. R., Campbell, A. K., Smith, S. M., & Trewavas, A. J. (1991).
//     "Transgenic plant aequorin reports the effects of touch and cold-shock
//     and elicitors on cytoplasmic calcium." Nature 352(6335): 524-526.
//
//   Plieth, C. (2006). "Aequorin as a reporter gene." Methods in Molecular
//     Biology 323: 307-327.
//
//   • KD         = 7   — dissociation constant for the Hill-equilibrium form
//   • HILL_N     = 3   — the canonical triple-Ca²⁺-binding Hill coefficient
//
// These defaults are what plant-science papers almost always report; changing
// them silently shifts every downstream [Ca²⁺] value. `tests/aequorin.test.js`
// pins the (input, DEFAULT_*) → output map so a "tidy" edit can't drift them
// without a test failure.
export const DEFAULT_KR = 7;
export const DEFAULT_KTR = 118;
export const DEFAULT_KD = 7;
export const DEFAULT_HILL_N = 3;

// ── Time units ───────────────────────────────────────────────────────────────

export const TIME_UNITS = [
  { key: "ms", label: "milliseconds" },
  { key: "s", label: "seconds" },
  { key: "min", label: "minutes" },
  { key: "h", label: "hours" },
  { key: "d", label: "days" },
  { key: "w", label: "weeks" },
  { key: "mo", label: "months" },
  { key: "yr", label: "years" },
];

export const TO_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  min: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2629800,
  yr: 31557600,
};

export function convertTime(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;
  return (value * TO_SECONDS[fromUnit]) / TO_SECONDS[toUnit];
}

// `DataMatrix` — the shape of `parsed.data` for the aequorin tool: rows
// keyed by time index, columns keyed by sample. Cells are `null` when the
// raw cell parsed to a non-numeric value (empty / missing / non-numeric
// string), `number` otherwise. Calibration helpers preserve this shape:
// out-of-domain calibration outputs (e.g. division by zero, log of a
// non-positive) become `null` instead of NaN/Infinity.
export type DataMatrix = Array<Array<number | null>>;

// ── Formula labels / equations ───────────────────────────────────────────────

export const FORMULA_DEFS = {
  none: {
    label: "No calibration",
    eq: "Raw luminescence values plotted as-is",
  },
  "allen-blinks": {
    label: "Allen & Blinks (1978)",
    eq: "[Ca²⁺] = ((1+Ktr)·f^⅓ − 1) / (Kr·(1−f^⅓))",
  },
  hill: {
    label: "Hill equilibrium",
    eq: "[Ca²⁺] = Kd · (f/(1−f))^⅓  where f = L/ΣL",
  },
  generalized: {
    label: "Generalised Allen & Blinks",
    eq: "[Ca²⁺] = ((1+Ktr)·f^(1/n) − 1) / (Kr·(1−f^(1/n)))",
  },
};

// ── Calibration ──────────────────────────────────────────────────────────────

// Allen & Blinks (1978):
//   [Ca²⁺] = ((1 + Ktr) · f^⅓ − 1) / (Kr · (1 − f^⅓))    with f = L(t) / ΣL
//
// Standard rate-constant form for native shrimp aequorin in solution. f is the
// fraction of the cell's remaining aequorin pool consumed at time t (rundown
// fraction); the cube root reflects the three Ca²⁺-binding sites.
//
//   Allen, D. G., & Blinks, J. R. (1978). "Calcium transients in aequorin-
//     injected frog cardiac muscle." Nature 273(5663): 509-513.
//
// Defaults: Kr = 7, Ktr = 118 (DEFAULT_KR / DEFAULT_KTR above).
export function calibrate(
  headers: string[],
  data: DataMatrix,
  Kr: number,
  Ktr: number
): DataMatrix {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array<number>(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v != null) totals[c] += v;
    }
  const cal: DataMatrix = [];
  for (let r = 0; r < nRows; r++) {
    const row: Array<number | null> = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const cbrt = Math.cbrt(v / totals[c]);
      const denom = Kr * (1 - cbrt);
      row.push(denom === 0 ? null : ((1 + Ktr) * cbrt - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

// Hill equilibrium:
//   [Ca²⁺] = Kd · (f / (1 − f))^⅓    with f = L(t) / ΣL
//
// Equilibrium-binding treatment adopted for plant aequorin. The cube root is
// the canonical triple-Ca²⁺-binding Hill coefficient (n = 3); Kd is the
// apparent dissociation constant of the Ca²⁺–aequorin complex.
//
//   Knight, M. R., Campbell, A. K., Smith, S. M., & Trewavas, A. J. (1991).
//     "Transgenic plant aequorin reports the effects of touch and cold-shock
//     and elicitors on cytoplasmic calcium." Nature 352(6335): 524-526.
//
//   Plieth, C. (2006). "Aequorin as a reporter gene." Methods in Molecular
//     Biology 323: 307-327.
//
// Default: Kd = 7 (DEFAULT_KD above). Note: published Kd values for plant
// aequorin vary between groups; this default is what plant-science papers
// most commonly report — change it if your reference uses a different value.
export function calibrateHill(headers: string[], data: DataMatrix, Kd: number): DataMatrix {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array<number>(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v != null) totals[c] += v;
    }
  const cal: DataMatrix = [];
  for (let r = 0; r < nRows; r++) {
    const row: Array<number | null> = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const f = v / totals[c];
      if (f >= 1) {
        row.push(null);
        continue;
      }
      row.push(Kd * Math.cbrt(f / (1 - f)));
    }
    cal.push(row);
  }
  return cal;
}

// Generalised Allen & Blinks:
//   [Ca²⁺] = ((1 + Ktr) · f^(1/n) − 1) / (Kr · (1 − f^(1/n)))    with f = L(t) / ΣL
//
// Same rate-constant form as Allen & Blinks (1978) above, with the cube root
// replaced by an adjustable Hill exponent n. Setting n = 3 recovers the
// standard Allen & Blinks expression exactly. The generalised exponent treatment
// is described in:
//
//   Plieth, C. (2006). "Aequorin as a reporter gene." Methods in Molecular
//     Biology 323: 307-327.
//
// Defaults: Kr = 7, Ktr = 118, n = 3 (DEFAULT_KR / DEFAULT_KTR / DEFAULT_HILL_N).
export function calibrateGeneralized(
  headers: string[],
  data: DataMatrix,
  Kr: number,
  Ktr: number,
  n: number
): DataMatrix {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array<number>(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v != null) totals[c] += v;
    }
  const cal: DataMatrix = [];
  for (let r = 0; r < nRows; r++) {
    const row: Array<number | null> = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const fn = Math.pow(v / totals[c], 1 / n);
      const denom = Kr * (1 - fn);
      row.push(denom === 0 ? null : ((1 + Ktr) * fn - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

export function detectConditions(
  headers: string[],
  poolReplicates = true,
  columnEnabled: Record<number, boolean> | null = null,
  paletteName: string = "okabe-ito"
): Condition[] {
  const nameOcc: Record<string, number> = {};
  const repNums = headers.map((h) => {
    nameOcc[h] = (nameOcc[h] || 0) + 1;
    return nameOcc[h];
  });
  if (poolReplicates) {
    const pm: Record<string, number[]> = {};
    headers.forEach((h, i) => {
      if (columnEnabled && columnEnabled[i] === false) return;
      if (!pm[h]) pm[h] = [];
      pm[h].push(i);
    });
    const entries = Object.entries(pm);
    const seed = resolveDiscretePalette(paletteName, entries.length);
    return entries.map(([name, colIndices], idx) => ({
      prefix: name,
      label: name,
      color: seed[idx % Math.max(1, seed.length)] || PALETTE[idx % PALETTE.length],
      colIndices,
    }));
  } else {
    const items = headers
      .map((h, i) => ({ h, i, rep: repNums[i] }))
      .filter(({ i }) => !columnEnabled || columnEnabled[i] !== false);
    const seed = resolveDiscretePalette(paletteName, items.length);
    return items.map(({ h, i, rep }, ci) => ({
      prefix: `${h}__col${i}`,
      label: `${h}_rep${rep}`,
      color: seed[ci % Math.max(1, seed.length)] || PALETTE[ci % PALETTE.length],
      colIndices: [i],
    }));
  }
}

export function smooth(arr: Array<number | null>, w: number): Array<number | null> {
  if (w <= 0) return arr;
  return arr.map((_, i) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) {
      const v = arr[j];
      if (v != null) {
        sum += v;
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

// ── SVG path builders ────────────────────────────────────────────────────────

// Each input point is one (x, yLo, yHi) sample of the ribbon's lower / upper
// edge; null on either edge means a missing replicate at that x and is
// dropped before the path is built. Returns the empty string when fewer
// than 2 valid points remain (callers render no <path> for an empty `d`).
export interface RibbonPoint {
  x: number;
  yLo: number | null;
  yHi: number | null;
}

export function buildAreaD(pts: RibbonPoint[]): string {
  const valid = pts.filter(
    (p): p is { x: number; yLo: number; yHi: number } => p.yHi != null && p.yLo != null
  );
  if (valid.length < 2) return "";
  const fwd = valid.map((p) => `${p.x.toFixed(2)},${p.yHi.toFixed(2)}`);
  const rev = valid
    .slice()
    .reverse()
    .map((p) => `${p.x.toFixed(2)},${p.yLo.toFixed(2)}`);
  return "M" + fwd.join("L") + "L" + rev.join("L") + "Z";
}

// ── Chart layout constant ────────────────────────────────────────────────────
// Re-exported from `_shell/chart-layout.ts` (audit M7 — was byte-identical
// with lineplot's `MARGIN`).
export const MARGIN = CHART_MARGIN;

// ── Auto Y-axis range over a visible x-window ────────────────────────────────
// Returns { yMin, yMax } padded ±10% (lower clamped at 0, both rounded to
// 2 decimal places — matches the prior inline logic in index.tsx). Returns
// `null` when calData is empty / window contains no finite values, so the
// caller can short-circuit instead of pushing NaN through updVis.
//
// Pure for testability: the React layer (useLayoutEffect in index.tsx) calls
// this and pushes the result into vis.{yMin,yMax}. Pre-existing values in
// vis.* (e.g. rehydrated from auto-prefs of a previous session) are
// irrelevant — this function is keyed only on the actual data, so the
// chart never paints with a stale persisted range.
export function computeAutoYRange(
  calData: DataMatrix | null,
  xStart: number,
  xEnd: number
): { yMin: number; yMax: number } | null {
  if (!calData || calData.length === 0) return null;
  const r0 = Math.max(0, Math.floor(xStart));
  const r1 = Math.min(calData.length - 1, Math.ceil(xEnd));
  let lo = Infinity,
    hi = -Infinity;
  for (let r = r0; r <= r1; r++) {
    const row = calData[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v != null && Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return null;
  return { yMin: round2(Math.max(0, lo * 0.9)), yMax: round2(hi * 1.1) };
}

// ── Ribbon-extent matrix for the auto Y-range ────────────────────────────────
// The chart draws each condition as a mean line wrapped in a mean ± SD
// ribbon. Auto Y-range must cover the *ribbon edges*: `mean + SD` routinely
// exceeds the largest single replicate, so ranging over the raw calData
// cells clips the top of the band against the plot frame. This projects the
// per-condition stats into a DataMatrix whose every value is a ribbon edge
// (`mean − SD` and `mean + SD`), one row per time point — so the existing
// `computeAutoYRange` windowing / padding logic can range over it unchanged.
// Time points whose mean is null / non-finite are skipped; a null / non-finite
// SD is treated as a zero half-width (mean line only). All conditions are
// included, matching the prior raw-calData behaviour.
export function ribbonEdgeMatrix(stats: AequorinSeriesStats[] | null): DataMatrix {
  if (!stats || stats.length === 0) return [];
  const rows: Array<Array<number | null>> = [];
  for (const s of stats) {
    for (let r = 0; r < s.means.length; r++) {
      if (!rows[r]) rows[r] = [];
      const m = s.means[r];
      if (m == null || !Number.isFinite(m)) continue;
      const sd = s.sds[r];
      const half = sd != null && Number.isFinite(sd) ? sd : 0;
      rows[r].push(m - half, m + half);
    }
  }
  return rows;
}

// ── Public types for steps / controls prop interfaces ───────────────────────

export type CalibrationFormula = "none" | "allen-blinks" | "hill" | "generalized";

export interface Condition {
  prefix: string;
  label: string;
  color: string;
  colIndices: number[];
  activeColIndices?: number[];
  enabled?: boolean;
}

// `vis` shape mirrors VIS_INIT_AEQUORIN in index.tsx — declared here so
// the prop bags don't need to duplicate it. Keep the two in sync.
export interface AequorinVis {
  xStart: number;
  xEnd: number;
  yMin: number;
  yMax: number;
  autoYRange: boolean;
  faceted: boolean;
  plotTitle: string;
  plotSubtitle: string;
  smoothWidth: number;
  plotBg: string;
  showGrid: boolean;
  lineWidth: number;
  ribbonOpacity: number;
  gridColor: string;
  plotHeight: number;
  timeStep: number;
  baseUnit: string;
  displayUnit: string;
  showInset: boolean;
  insetFillOpacity: number;
  insetBarWidth: number;
  insetBarGap: number;
  insetYMinCustom: string;
  insetYMaxCustom: string;
  insetW: number;
  insetH: number;
  insetErrorType: string;
  insetShowBarOutline: boolean;
  insetBarOutlineColor: string;
  insetBarStrokeWidth: number;
  insetShowGrid: boolean;
  insetGridColor: string;
  insetErrorStrokeWidth: number;
  insetXFontSize: number;
  insetYFontSize: number;
  insetXLabelAngle: number;
  showColumnOverlay: boolean;
  insetShowPoints: boolean;
  insetPointSize: number;
  insetPointColor: string;
  discretePalette: string;
}

export type UpdVis = (patch: Partial<AequorinVis> | { _reset: true }) => void;

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  rawText: string | null;
  doParse: (text: string, sep: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  handleTextPaste: (text: string, name: string) => void;
  onLoadExample: () => void;
}

// `parsed` is non-null at the call-site (ConfigureStep is only rendered
// when `parsed` is set); calData mirrors `parsed.data` shape with the
// calibration applied.
export interface ConfigureStepProps {
  parsed: ParseDataResult;
  formula: CalibrationFormula;
  setFormula: (f: CalibrationFormula) => void;
  Kr: number;
  setKr: (v: number) => void;
  Ktr: number;
  setKtr: (v: number) => void;
  Kd: number;
  setKd: (v: number) => void;
  hillN: number;
  setHillN: (v: number) => void;
  vis: AequorinVis;
  updVis: UpdVis;
  fileName: string;
  // Empty string until first parse. Surfaced inline on the Configure step
  // file-info line via `<DetectedSeparatorBadge />`.
  detectedSep: string;
  calData: Array<Array<number | null>> | null;
  columnEnabled: Record<number, boolean>;
  downloadCalibrated: () => void;
}

// `plotPanelRef` is the imperative handle exposed by PlotPanel
// (forwardRef) — it surfaces .downloadMain() / .downloadMainPng().
export interface PlotPanelHandle {
  downloadMain: () => void;
  downloadMainPng: () => void;
}

export interface PlotControlsProps {
  conditions: Condition[];
  // Aequorin only ever passes a fresh array (no functional updaters);
  // narrower than the React setState signature.
  setConditions: (next: Condition[]) => void;
  vis: AequorinVis;
  updVis: UpdVis;
  plotPanelRef: React.RefObject<PlotPanelHandle | null>;
  downloadCalibrated: () => void;
  resetAll: () => void;
}

// ── Series + chart prop interfaces ──────────────────────────────────────────
//
// `AequorinSeriesStats` is the shape produced by the per-condition stats
// useMemo in app.tsx — it spreads a `Condition` and adds the time-aligned
// `means` and `sds` arrays (one entry per row in calData). PlotPanel
// receives `stats: AequorinSeriesStats[]`, filters to enabled, and turns it
// into the `series` array the chart consumes (smoothed + windowed).

export interface AequorinSeriesStats extends Condition {
  means: Array<number | null>;
  sds: Array<number | null>;
}

export interface SeriesRow {
  t: number;
  mean: number | null;
  sd: number | null;
}

export interface SeriesItem {
  prefix: string;
  label: string;
  color: string;
  n: number;
  rows: SeriesRow[];
}

// ReplicateSums — per-condition row of per-replicate Σ luminescence values
// for the inset barplot. `repSums[i].rawSum` is the raw integral; `corrSum`
// is the calibration-corrected integral. Computed in app.tsx from calData.

export interface RepSum {
  colIndex: number;
  rawSum: number;
  corrSum: number;
}

export interface ReplicateSumsRow {
  prefix: string;
  label: string;
  // Optional — `replicateSums` in app.tsx tracks only `prefix`, `label`,
  // `repSums`; consumers don't read `color` off this shape (they look it
  // up via `activeStats[…].color` instead). Keep optional for forward
  // compatibility with future per-row tinted bars.
  color?: string;
  enabled?: boolean;
  repSums: RepSum[];
}

// ── Chart props ─────────────────────────────────────────────────────────────

export interface ChartProps {
  series: SeriesItem[];
  xStart: number;
  xEnd: number;
  yMin: number;
  yMax: number;
  vbW: number;
  vbH: number;
  xLabel: string;
  yLabel: string;
  plotBg: string;
  showGrid: boolean;
  lineWidth: number;
  ribbonOpacity: number;
  gridColor: string;
  svgLegend: LegendBlock[] | null;
  // Both nullable — the facet view passes `s.label || null` and the main
  // combined chart passes title / subtitle which can be empty strings.
  plotTitle: string | null;
  plotSubtitle?: string | null;
  // Optional click-drag brush. When supplied, dragging across the plot area
  // reports the selected window in *display-time* units (same units as the
  // axis the user sees); PlotPanel maps it back to row indices. Omitted on
  // the faceted mini-charts — only the main combined chart is brushable.
  onBrush?: (d0: number, d1: number) => void;
}

export interface InsetBarplotProps {
  series: SeriesItem[];
  insetFillOpacity: number;
  insetBarWidth: number;
  insetBarGap: number;
  insetYMin: number | null;
  insetYMax: number | null;
  insetW: number;
  insetH: number;
  insetErrorType: string;
  insetShowBarOutline: boolean;
  insetBarOutlineColor: string;
  insetBarStrokeWidth: number;
  insetShowGrid: boolean;
  insetGridColor: string;
  insetErrorStrokeWidth: number;
  insetXFontSize: number;
  insetYFontSize: number;
  insetXLabelAngle: number;
  plotBg: string;
  plotTitle: string | null;
  plotSubtitle: string | null;
  corrected: boolean;
  replicateSums?: ReplicateSumsRow[] | null;
  annotations?: AnnotationSpec | null;
  statsSummary?: string | null;
  showPoints: boolean;
  pointSize: number;
  pointColor: string;
}

export interface FacetChartItemProps {
  // The faceted chart consumes the per-series `SeriesItem` (label + n + rows),
  // not the full `AequorinSeriesStats` — `displaySeries` in plot-area.tsx is
  // the time-windowed projection of `series`, not `stats`.
  s: SeriesItem;
  facetRefs: React.MutableRefObject<Record<string, SVGSVGElement | null>>;
  // chartProps already contains the `series` slot for this single facet, so
  // `Pick` keeps the per-facet override list explicit instead of using `Omit`
  // which would require a `series` field that's already filled in.
  chartProps: ChartProps;
}

// ── Stats annotation spec (shared with boxplot's spec shape) ───────────────

export interface AnnotationSpecBracket {
  i: number;
  j: number;
  p: number;
  label: string;
}

export type AnnotationSpec =
  | { kind: "brackets"; pairs: AnnotationSpecBracket[]; groupNames: string[] }
  | { kind: "cld"; labels: string[]; groupNames: string[] };

// ── Stats panel prop interfaces ─────────────────────────────────────────────
//
// AequorinStatsPanel receives the inset stats groups (`{ name, values }[]`)
// + display controls and emits the annotation spec + summary text via
// callbacks. AequorinStatsDetail expands a single row's decision trace.

export type SelectTestResult = ReturnType<typeof selectTest> & {
  suggestion?: {
    test: RecommendedTest;
    postHoc?: RecommendedPostHoc;
    why?: string;
  };
};

export interface PostHocPair {
  i: number;
  j: number;
  p: number;
  pAdj?: number | null;
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

export interface StatsGroup {
  name: string;
  values: number[];
}

export interface EnrichedAequorinStatsRow {
  k: number;
  names: string[];
  values: number[][];
  rec: SelectTestResult;
  chosenTest: RecommendedTest | null;
  testResult: TestResult | null;
  postHocName: Exclude<RecommendedPostHoc, null> | null;
  postHocResult: PostHocResult | null;
  powerResult: PowerFromDataResult | null;
  skip?: boolean;
}

export interface AequorinStatsDetailProps {
  row: EnrichedAequorinStatsRow;
  onOverrideTest: (test: RecommendedTest | null) => void;
  isOverridden: boolean;
}

export interface AequorinStatsPanelProps {
  groups: StatsGroup[];
  fileStem: string;
  errorBarLabel: string;
  onAnnotationChange: (spec: AnnotationSpec | null) => void;
  onSummaryChange: (text: string | null) => void;
}

// ── ConditionEditor + SampleSelectionOverlay ───────────────────────────────

export interface ConditionEditorProps {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
}

export interface ColInfo {
  h: string;
  i: number;
  rep: number;
  isDup: boolean;
}

export interface SampleSelectionOverlayProps {
  showColumnOverlay: boolean;
  setShowColumnOverlay: (b: boolean) => void;
  poolReplicates: boolean;
  colInfo: ColInfo[];
  columnEnabled: Record<number, boolean>;
  handleColumnToggle: (i: number, enabled: boolean) => void;
  conditions: Condition[];
}

// Type alias kept available for any future SampleSelectionOverlay variant
// that needs to dispatch a Condition[] write — no current consumer.
export type SetConditionsDispatch = (next: Condition[]) => void;

// ── PlotPanel props ─────────────────────────────────────────────────────────

export interface PlotPanelProps {
  stats: AequorinSeriesStats[];
  xStart: number;
  xEnd: number;
  yMin: number;
  yMax: number;
  faceted: boolean;
  title: string;
  subtitle: string;
  smoothWidth: number;
  plotBg: string;
  showGrid: boolean;
  lineWidth: number;
  ribbonOpacity: number;
  gridColor: string;
  plotHeight: number;
  timeStep: number;
  baseUnit: string;
  displayUnit: string;
  showInset: boolean;
  insetFillOpacity: number;
  insetBarWidth: number;
  insetBarGap: number;
  insetYMin: number | null;
  insetYMax: number | null;
  insetW: number;
  insetH: number;
  insetErrorType: string;
  insetShowBarOutline: boolean;
  insetBarOutlineColor: string;
  insetBarStrokeWidth: number;
  insetShowGrid: boolean;
  insetGridColor: string;
  insetErrorStrokeWidth: number;
  insetXFontSize: number;
  insetYFontSize: number;
  insetXLabelAngle: number;
  insetShowPoints: boolean;
  insetPointSize: number;
  insetPointColor: string;
  formula: CalibrationFormula;
  replicateSums?: ReplicateSumsRow[] | null;
  fileName: string;
  // Drag-to-window callback. Receives row indices (xStart, xEnd) derived from
  // a brush gesture on the main chart; App wires it to updVis.
  onXRangeChange?: (xStartRow: number, xEndRow: number) => void;
  // Reset the X window to the full data extent (the "Clear" affordance next to
  // the brush tip). App wires it to updVis({ xStart: 0, xEnd: <full>, … }).
  onResetXRange?: () => void;
  // Whether the X window is currently narrower than the full data extent —
  // true when zoomed via either the brush or the Axes number inputs. Gates the
  // visibility of the "Clear" button (and its mention in the tip).
  xZoomed?: boolean;
}

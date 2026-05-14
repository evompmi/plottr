// Pure series + per-x stats helpers for the Line / profile plot. These have
// no React / DOM dependency and are separately testable (tests/helpers/
// lineplot-loader.js loads this file directly). Keep render-layer code and
// UI-specific components out — they belong in tools/lineplot.tsx.

import { CHART_MARGIN, TestResult, buildLineD, round2, round4, runTest } from "../_shell";
import type { LegendBlock, PowerFromDataResult } from "../_shell";
import { tinv } from "../_core/stats/dist";
import { sampleMean, sampleSD } from "../_core/stats/tests";
import { bhAdjust, selectTest } from "../_core/stats/posthoc";
import type { ParseDataResult } from "../_core/csv";
// ── Constants ──────────────────────────────────────────────────────────────
// `MARGIN` used to live here as a byte-identical twin of aequorin's. Lifted
// into `_shell/chart-layout.ts` (audit M7); re-export here so the existing
// `import { MARGIN } from "./helpers"` call sites keep working. Same story
// for `round2`/`round4` — single-line numeric helpers, lifted to
// `_shell/round.ts` once aequorin started reaching for the same shape.
export const MARGIN = CHART_MARGIN;
export { buildLineD, round2, round4 };
export const STAR_ROW_H = 18;

export type ErrorKind = "none" | "sem" | "sd" | "ci95";

export const ERROR_KINDS: ReadonlyArray<{ value: ErrorKind; label: string }> = [
  { value: "none", label: "None" },
  { value: "sem", label: "SEM" },
  { value: "sd", label: "SD" },
  { value: "ci95", label: "95% CI" },
];

// ── Small helpers ──────────────────────────────────────────────────────────

export function formatX(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return String(x);
  return Number.isInteger(x) ? String(x) : String(round4(x));
}

// Test / post-hoc dispatchers live in tools/_shell/stats-dispatch.ts
// (runTest, runPostHoc, postHocForTest) — shared across boxplot, lineplot,
// and aequorin.

// ── Series + per-x stats ───────────────────────────────────────────────────

// Build per-group point summaries keyed on strict numeric x equality.
export function computeSeries(
  data: Array<Array<number | null>>,
  rawData: string[][],
  xCol: number,
  yCol: number,
  groupCol: number | null,
  groupColors: Record<string, string>,
  palette: readonly string[]
) {
  // Preserve first-seen group order so legend ordering matches the CSV.
  const groupOrder: string[] = [];
  const perGroup = new Map<string, Map<number, number[]>>();

  for (let ri = 0; ri < data.length; ri++) {
    const x = data[ri][xCol];
    const y = data[ri][yCol];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const gName = groupCol == null ? "(all)" : String(rawData[ri][groupCol] ?? "");
    if (!perGroup.has(gName)) {
      perGroup.set(gName, new Map());
      groupOrder.push(gName);
    }
    const xMap = perGroup.get(gName)!;
    if (!xMap.has(x)) xMap.set(x, []);
    xMap.get(x)!.push(y);
  }

  return groupOrder.map((name, idx) => {
    const xMap = perGroup.get(name)!;
    const xs = [...xMap.keys()].sort((a, b) => a - b);
    const points = xs.map((x) => {
      const values = xMap.get(x)!;
      const n = values.length;
      const mean = sampleMean(values);
      const sd = n > 1 ? sampleSD(values) : 0;
      const sem = n > 1 ? sd / Math.sqrt(n) : 0;
      const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
      return { x, values, n, mean, sd, sem, ci95 };
    });
    return {
      name,
      color: groupColors[name] || palette[idx % palette.length],
      points,
    };
  });
}

// For each x shared by ≥2 groups (with n≥2 per group), run the routed test and
// BH-adjust across x. Returns one row per eligible x.
export type PerXRow = {
  x: number;
  names: string[];
  values: number[][];
  chosenTest: RecommendedTest | null;
  result: TestResult | null;
  pAdj?: number | null;
};

export type Series = ReturnType<typeof computeSeries>[number];
export type SeriesPoint = Series["points"][number];

// ── Vis state + prop interfaces ─────────────────────────────────────────────
//
// `LineplotVis` is the runtime shape of `VIS_INIT_LINEPLOT` in index.tsx.
// We declare it here (helpers.ts is the type-canonical home) rather than
// `typeof VIS_INIT_LINEPLOT` from index.tsx to avoid a circular import:
// steps.tsx imports types from helpers; index.tsx imports from steps.tsx.
//
// Auto-prefs uses a value-compat whitelist (loadAutoPrefs in shared-prefs.js)
// so all fields must default to a non-undefined value at the runtime
// declaration site; this interface mirrors that contract.
export interface LineplotVis {
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  xLabel: string;
  yLabel: string;
  plotTitle: string;
  plotSubtitle: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  lineWidth: number;
  pointRadius: number;
  errorStrokeWidth: number;
  errorCapWidth: number;
  groupColors: Record<string, string>;
  discretePalette: string;
  errorType: ErrorKind;
  showStars: boolean;
}

// The reducer signature emitted by `usePlotToolState` — accepts a partial
// patch or the `{ _reset: true }` sentinel.
export type UpdVis = (patch: Partial<LineplotVis> | { _reset: true }) => void;

export interface AutoAxis {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

// ── Step / control prop bags ────────────────────────────────────────────────

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  rawText: string | null;
  doParse: (text: string, sep: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  handleTextPaste: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export interface ConfigureStepProps {
  parsed: ParseDataResult;
  fileName: string;
  // Separator the auto-detector resolved. Empty string until first parse.
  detectedSep: string;
  xCol: number;
  setXCol: (i: number) => void;
  yCol: number;
  setYCol: (i: number) => void;
  groupCol: number | null;
  setGroupCol: (i: number | null) => void;
  numericCols: number[];
  categoricalCols: number[];
}

export interface PlotControlsProps {
  parsed: ParseDataResult;
  fileName: string;
  xCol: number;
  setXCol: (i: number) => void;
  yCol: number;
  setYCol: (i: number) => void;
  groupCol: number | null;
  setGroupCol: (i: number | null) => void;
  numericCols: number[];
  categoricalCols: number[];
  series: Series[];
  setGroupColor: (name: string, color: string) => void;
  vis: LineplotVis;
  updVis: UpdVis;
  autoAxis: AutoAxis;
  effAxis: AutoAxis;
  errorType: ErrorKind;
  setErrorType: (k: ErrorKind) => void;
  showStars: boolean;
  setShowStars: (b: boolean) => void;
  statsRows: PerXRow[];
  svgRef: React.RefObject<SVGSVGElement>;
  svgLegend: LegendBlock[] | null;
  resetAll: () => void;
}

// PlotStep just forwards the same prop bag down to PlotControls + the
// chart, so it accepts the superset.
export type PlotStepProps = PlotControlsProps;

// ── Chart prop interface ────────────────────────────────────────────────────
//
// Concrete shape for `forwardRef<SVGSVGElement, ChartProps>` in chart.tsx.
// Pulls together the slimmed view of `LineplotVis` the chart actually
// consumes (axis bounds + style props) plus the precomputed series and
// per-x stats from app.tsx.

export interface ChartProps {
  series: Series[];
  perXStats: PerXRow[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  vbW: number;
  vbH: number;
  xLabel: string;
  yLabel: string;
  plotTitle: string;
  plotSubtitle: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
  lineWidth: number;
  pointRadius: number;
  errorStrokeWidth: number;
  errorCapWidth: number;
  errorType: ErrorKind;
  svgLegend: LegendBlock[] | null;
  showStars: boolean;
}

// ── Per-x stats panel prop interfaces ───────────────────────────────────────
//
// `PerXStatsPanel` enriches every input row with `rec` / `chosenTest` /
// `result` / `postHocResult` / `powerResult` / `pAdj` derived from the
// override state — so `PerXDetail` (the expander) consumes the enriched
// shape, while the panel itself accepts the raw `PerXRow[]`.

// `selectTest` returns `recommendation` plus an optional `suggestion` field
// that the global type stub omits; we widen here so the panel can pick up
// the suggestion narrative.
export type SelectTestResult = ReturnType<typeof selectTest> & {
  suggestion?: {
    test: RecommendedTest;
    postHoc?: RecommendedPostHoc;
    why?: string;
  };
};

// Post-hoc pairs across tukeyHSD / gamesHowell / dunnTest share a small
// common surface; the per-cell renderer in PerXDetail branches on which
// optional fields are present.
export interface PostHocPair {
  i: number;
  j: number;
  p: number;
  pAdj?: number | null;
  diff?: number;
  z?: number;
  // tukeyHSD-only fields:
  se?: number;
  q?: number;
  lwr?: number;
  upr?: number;
  // games-howell:
  df?: number;
}

export interface PostHocResult {
  pairs: PostHocPair[];
  k?: number;
  df?: number;
  mse?: number;
  method?: string;
  error?: string;
  // Soft warning surfaced by `tukeyHSD` when (1−α, k, df) lies in the
  // qtukey design-envelope (df ≤ 2 ∧ p ≥ 0.95 ∧ k ≥ 10) — see the source
  // comment on `qtukey` in `tools/stats-posthoc.js`.
  warning?: string;
}

// PerXRow + the override-derived fields PerXStatsPanel attaches to it.
export interface EnrichedPerXRow extends PerXRow {
  rec: SelectTestResult | null;
  chosenTest: RecommendedTest | null;
  result: TestResult | null;
  postHocName: Exclude<RecommendedPostHoc, null> | null;
  postHocResult: PostHocResult | null;
  powerResult: PowerFromDataResult | null;
  pAdj: number | null;
}

export interface PerXDetailProps {
  row: EnrichedPerXRow;
  onOverrideTest: (test: RecommendedTest | null) => void;
  isOverridden: boolean;
}

export interface PerXStatsPanelProps {
  rows: PerXRow[];
  xLabel: string;
  fileName: string;
  showStars: boolean;
  setShowStars: (b: boolean) => void;
}

export function computePerXStats(series: Series[]) {
  const xSet = new Set<number>();
  for (const s of series) for (const p of s.points) xSet.add(p.x);
  const xs = [...xSet].sort((a, b) => a - b);

  const rows: PerXRow[] = [];
  for (const x of xs) {
    const groups: { name: string; values: number[] }[] = [];
    for (const s of series) {
      const p = s.points.find((q) => q.x === x);
      if (p && p.n >= 2) groups.push({ name: s.name, values: p.values });
    }
    if (groups.length < 2) continue;
    const values = groups.map((g) => g.values);
    const names = groups.map((g) => g.name);
    const rec = selectTest(values);
    const chosenTest =
      rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
    const result = chosenTest ? runTest(chosenTest, values) : null;
    rows.push({ x, names, values, chosenTest, result });
  }

  // BH-adjust valid p-values across x-axis.
  const validIdx: number[] = [];
  const validPs: number[] = [];
  rows.forEach((r, i) => {
    if (r.result && !r.result.error && r.result.p != null && Number.isFinite(r.result.p)) {
      validIdx.push(i);
      validPs.push(r.result.p);
    }
  });
  const adjPs = validPs.length > 0 ? bhAdjust(validPs) : [];
  rows.forEach((r) => (r.pAdj = null));
  validIdx.forEach((origIdx, j) => (rows[origIdx].pAdj = adjPs[j]));

  return rows;
}

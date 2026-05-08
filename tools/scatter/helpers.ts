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
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (const row of rows) {
    const x = row[xCol],
      y = row[yCol];
    if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  if (n < 2) return { valid: false };
  const denomX = n * sxx - sx * sx;
  if (denomX === 0) return { valid: false };
  const slope = (n * sxy - sx * sy) / denomX;
  const intercept = (sy - slope * sx) / n;
  const denomY = n * syy - sy * sy;
  const r2 = denomY === 0 ? NaN : Math.pow(n * sxy - sx * sy, 2) / (denomX * denomY);
  return { valid: true, slope, intercept, r2, n };
}

export type RegressionStats = ReturnType<typeof computeLinearRegression>;

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
}

// scatter/index.tsx — App orchestrator for the Scatter tool. This is the
// esbuild entry point (bundles to tools/scatter/index.js). Chart, shapes,
// step panels, and the plot-step composition live in sibling modules
// under tools/scatter/.

import { PlotToolShell, resolveDiscretePalette, usePlotToolState } from "../_shell";
import {
  SHAPES,
  ScatterStatsSet,
  computeLinearRegression,
  ScatterVis,
  RefLine,
  ScatterRegression,
} from "./helpers";
import { UploadStep } from "./steps";
import { PlotStep } from "./plot-area";

import { COLOR_PALETTES, PALETTE } from "../_core/color";
import { isNumericValue } from "../_core/numeric";
import { autoDetectSep, fixDecimalCommas, parseData } from "../_core/csv";
import { fileBaseName } from "../_core/download";
const { useState, useMemo, useCallback, useEffect, useRef } = React;

// Module-scope counter for stable per-session refLine ids. Stays outside
// App so dev-mode StrictMode double-renders don't reset it.
let refLineCounter = 0;

const VIS_INIT_SCATTER: ScatterVis = {
  xMin: null,
  xMax: null,
  yMin: null,
  yMax: null,
  xLabel: "",
  yLabel: "",
  plotTitle: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  // Per-style + per-mapping prefs auto-persist to localStorage and
  // round-trip through PrefsPanel save / load. Per-category dicts
  // (colorMapDiscrete / sizeMapDiscrete / shapeMapDiscrete) are keyed by
  // category NAME so they survive a dataset swap as long as names match.
  pointColor: "#648FFF",
  pointSize: 5,
  pointOpacity: 0.8,
  strokeColor: "#000000",
  strokeWidth: 1,
  colorMapPalette: "viridis",
  colorMapDiscrete: {},
  // Discrete-palette key driving the per-category seed when the user picks
  // a discrete colour column. The single `pointColor` (above) is what wins
  // when NO colour aesthetic is mapped, and the continuous `colorMapPalette`
  // wins when a numeric column is mapped — so this only applies to the
  // categorical-discrete path. Default "okabe-ito" is byte-identical to
  // PALETTE so existing behaviour is preserved exactly.
  discretePalette: "okabe-ito",
  sizeMapMin: 3,
  sizeMapMax: 15,
  sizeMapDiscrete: {},
  shapeMapDiscrete: {},
  refLines: [],
  regression: {
    on: false,
    color: "#dc2626",
    strokeWidth: 1.5,
    dashed: false,
    showStats: true,
    position: "tl",
  },
};

// ── Bundled example dataset ──
// Fisher's Iris dataset (Anderson 1935 / Fisher 1936) — 150 observations, 3 species.
// Sepal.Length, Sepal.Width, Petal.Length, Petal.Width in cm; Species as group column.
const EXAMPLE_CSV = `Sepal.Length,Sepal.Width,Petal.Length,Petal.Width,Species
5.1,3.5,1.4,0.2,setosa
4.9,3.0,1.4,0.2,setosa
4.7,3.2,1.3,0.2,setosa
4.6,3.1,1.5,0.2,setosa
5.0,3.6,1.4,0.2,setosa
5.4,3.9,1.7,0.4,setosa
4.6,3.4,1.4,0.3,setosa
5.0,3.4,1.5,0.2,setosa
4.4,2.9,1.4,0.2,setosa
4.9,3.1,1.5,0.1,setosa
5.4,3.7,1.5,0.2,setosa
4.8,3.4,1.6,0.2,setosa
4.8,3.0,1.4,0.1,setosa
4.3,3.0,1.1,0.1,setosa
5.8,4.0,1.2,0.2,setosa
5.7,4.4,1.5,0.4,setosa
5.4,3.9,1.3,0.4,setosa
5.1,3.5,1.4,0.3,setosa
5.7,3.8,1.7,0.3,setosa
5.1,3.8,1.5,0.3,setosa
5.4,3.4,1.7,0.2,setosa
5.1,3.7,1.5,0.4,setosa
4.6,3.6,1.0,0.2,setosa
5.1,3.3,1.7,0.5,setosa
4.8,3.4,1.9,0.2,setosa
5.0,3.0,1.6,0.2,setosa
5.0,3.4,1.6,0.4,setosa
5.2,3.5,1.5,0.2,setosa
5.2,3.4,1.4,0.2,setosa
4.7,3.2,1.6,0.2,setosa
4.8,3.1,1.6,0.2,setosa
5.4,3.4,1.5,0.4,setosa
5.2,4.1,1.5,0.1,setosa
5.5,4.2,1.4,0.2,setosa
4.9,3.1,1.5,0.2,setosa
5.0,3.2,1.2,0.2,setosa
5.5,3.5,1.3,0.2,setosa
4.9,3.6,1.4,0.1,setosa
4.4,3.0,1.3,0.2,setosa
5.1,3.4,1.5,0.2,setosa
5.0,3.5,1.3,0.3,setosa
4.5,2.3,1.3,0.3,setosa
4.4,3.2,1.3,0.2,setosa
5.0,3.5,1.6,0.6,setosa
5.1,3.8,1.9,0.4,setosa
4.8,3.0,1.4,0.3,setosa
5.1,3.8,1.6,0.2,setosa
4.6,3.2,1.4,0.2,setosa
5.3,3.7,1.5,0.2,setosa
5.0,3.3,1.4,0.2,setosa
7.0,3.2,4.7,1.4,versicolor
6.4,3.2,4.5,1.5,versicolor
6.9,3.1,4.9,1.5,versicolor
5.5,2.3,4.0,1.3,versicolor
6.5,2.8,4.6,1.5,versicolor
5.7,2.8,4.5,1.3,versicolor
6.3,3.3,4.7,1.6,versicolor
4.9,2.4,3.3,1.0,versicolor
6.6,2.9,4.6,1.3,versicolor
5.2,2.7,3.9,1.4,versicolor
5.0,2.0,3.5,1.0,versicolor
5.9,3.0,4.2,1.5,versicolor
6.0,2.2,4.0,1.0,versicolor
6.1,2.9,4.7,1.4,versicolor
5.6,2.9,3.6,1.3,versicolor
6.7,3.1,4.4,1.4,versicolor
5.6,3.0,4.5,1.5,versicolor
5.8,2.7,4.1,1.0,versicolor
6.2,2.2,4.5,1.5,versicolor
5.6,2.5,3.9,1.1,versicolor
5.9,3.2,4.8,1.8,versicolor
6.1,2.8,4.0,1.3,versicolor
6.3,2.5,4.9,1.5,versicolor
6.1,2.8,4.7,1.2,versicolor
6.4,2.9,4.3,1.3,versicolor
6.6,3.0,4.4,1.4,versicolor
6.8,2.8,4.8,1.4,versicolor
6.7,3.0,5.0,1.7,versicolor
6.0,2.9,4.5,1.5,versicolor
5.7,2.6,3.5,1.0,versicolor
5.5,2.4,3.8,1.1,versicolor
5.5,2.4,3.7,1.0,versicolor
5.8,2.7,3.9,1.2,versicolor
6.0,2.7,5.1,1.6,versicolor
5.4,3.0,4.5,1.5,versicolor
6.0,3.4,4.5,1.6,versicolor
6.7,3.1,4.7,1.5,versicolor
6.3,2.3,4.4,1.3,versicolor
5.6,3.0,4.1,1.3,versicolor
5.5,2.5,4.0,1.3,versicolor
5.5,2.6,4.4,1.2,versicolor
6.1,3.0,4.6,1.4,versicolor
5.8,2.6,4.0,1.2,versicolor
5.0,2.3,3.3,1.0,versicolor
5.6,2.7,4.2,1.3,versicolor
5.7,3.0,4.2,1.2,versicolor
5.7,2.9,4.2,1.3,versicolor
6.2,2.9,4.3,1.3,versicolor
5.1,2.5,3.0,1.1,versicolor
5.7,2.8,4.1,1.3,versicolor
6.3,3.3,6.0,2.5,virginica
5.8,2.7,5.1,1.9,virginica
7.1,3.0,5.9,2.1,virginica
6.3,2.9,5.6,1.8,virginica
6.5,3.0,5.8,2.2,virginica
7.6,3.0,6.6,2.1,virginica
4.9,2.5,4.5,1.7,virginica
7.3,2.9,6.3,1.8,virginica
6.7,2.5,5.8,1.8,virginica
7.2,3.6,6.1,2.5,virginica
6.5,3.2,5.1,2.0,virginica
6.4,2.7,5.3,1.9,virginica
6.8,3.0,5.5,2.1,virginica
5.7,2.5,5.0,2.0,virginica
5.8,2.8,5.1,2.4,virginica
6.4,3.2,5.3,2.3,virginica
6.5,3.0,5.5,1.8,virginica
7.7,3.8,6.7,2.2,virginica
7.7,2.6,6.9,2.3,virginica
6.0,2.2,5.0,1.5,virginica
6.9,3.2,5.7,2.3,virginica
5.6,2.8,4.9,2.0,virginica
7.7,2.8,6.7,2.0,virginica
6.3,2.7,4.9,1.8,virginica
6.7,3.3,5.7,2.1,virginica
7.2,3.2,6.0,1.8,virginica
6.2,2.8,4.8,1.8,virginica
6.1,3.0,4.9,1.8,virginica
6.4,2.8,5.6,2.1,virginica
7.2,3.0,5.8,1.6,virginica
7.4,2.8,6.1,1.9,virginica
7.9,3.8,6.4,2.0,virginica
6.4,2.8,5.6,2.2,virginica
6.3,2.8,5.1,1.5,virginica
6.1,2.6,5.6,1.4,virginica
7.7,3.0,6.1,2.3,virginica
6.3,3.4,5.6,2.4,virginica
6.4,3.1,5.5,1.8,virginica
6.0,3.0,4.8,1.8,virginica
6.9,3.1,5.4,2.1,virginica
6.7,3.1,5.6,2.4,virginica
6.9,3.1,5.1,2.3,virginica
5.8,2.7,5.1,1.9,virginica
6.8,3.2,5.9,2.3,virginica
6.7,3.3,5.7,2.5,virginica
6.7,3.0,5.2,2.3,virginica
6.3,2.5,5.0,1.9,virginica
6.5,3.0,5.2,2.0,virginica
6.2,3.4,5.4,2.3,virginica
5.9,3.0,5.1,1.8,virginica`;

export function App() {
  const shell = usePlotToolState("scatter", VIS_INIT_SCATTER);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    setInjectionWarning,
    vis,
    updVis,
  } = shell;

  const [rawText, setRawText] = useState<string | null>(null);

  // Column selection
  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState(1);

  // Point defaults + style + mappings + refLines + regression live in
  // `vis` so they auto-persist via PrefsPanel + localStorage. Read-
  // through `const` for value access, useCallback setters that accept
  // both direct values AND functional updaters so call sites like
  // `setShape((prev) => ({...prev, [k]: v}))` work unchanged.
  const pointColor = vis.pointColor ?? "#648FFF";
  const setPointColor = useCallback((v: string) => updVis({ pointColor: v }), [updVis]);
  const pointSize = vis.pointSize ?? 5;
  const setPointSize = useCallback((v: number) => updVis({ pointSize: v }), [updVis]);
  const pointOpacity = vis.pointOpacity ?? 0.8;
  const setPointOpacity = useCallback((v: number) => updVis({ pointOpacity: v }), [updVis]);
  const strokeColor = vis.strokeColor ?? "#000000";
  const setStrokeColor = useCallback((v: string) => updVis({ strokeColor: v }), [updVis]);
  const strokeWidth = vis.strokeWidth ?? 1;
  const setStrokeWidth = useCallback((v: number) => updVis({ strokeWidth: v }), [updVis]);

  // Column-index mappings stay local — they're tied to the current dataset's
  // columns, not a visual pref the user wants restored across reloads.
  const [colorMapCol, setColorMapCol] = useState<number | null>(null);
  const colorMapPalette = vis.colorMapPalette ?? "viridis";
  const setColorMapPalette = useCallback((v: string) => updVis({ colorMapPalette: v }), [updVis]);
  const colorMapDiscrete: Record<string, string> = useMemo(
    () => vis.colorMapDiscrete || {},
    [vis.colorMapDiscrete]
  );
  const setColorMapDiscrete = useCallback(
    (
      updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
    ) =>
      updVis({
        colorMapDiscrete:
          typeof updater === "function" ? updater(vis.colorMapDiscrete || {}) : updater || {},
      }),
    [updVis, vis.colorMapDiscrete]
  );

  const [sizeMapCol, setSizeMapCol] = useState<number | null>(null);
  const sizeMapMin = vis.sizeMapMin ?? 3;
  const setSizeMapMin = useCallback((v: number) => updVis({ sizeMapMin: v }), [updVis]);
  const sizeMapMax = vis.sizeMapMax ?? 15;
  const setSizeMapMax = useCallback((v: number) => updVis({ sizeMapMax: v }), [updVis]);
  const sizeMapDiscrete: Record<string, number> = useMemo(
    () => vis.sizeMapDiscrete || {},
    [vis.sizeMapDiscrete]
  );
  const setSizeMapDiscrete = useCallback(
    (
      updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)
    ) =>
      updVis({
        sizeMapDiscrete:
          typeof updater === "function" ? updater(vis.sizeMapDiscrete || {}) : updater || {},
      }),
    [updVis, vis.sizeMapDiscrete]
  );

  const [shapeMapCol, setShapeMapCol] = useState<number | null>(null);
  const shapeMapDiscrete: Record<string, string> = useMemo(
    () => vis.shapeMapDiscrete || {},
    [vis.shapeMapDiscrete]
  );
  const setShapeMapDiscrete = useCallback(
    (
      updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
    ) =>
      updVis({
        shapeMapDiscrete:
          typeof updater === "function" ? updater(vis.shapeMapDiscrete || {}) : updater || {},
      }),
    [updVis, vis.shapeMapDiscrete]
  );

  // Filter state stays local — depends on the current dataset's column values.
  const [filterState, setFilterState] = useState<Record<string, string[]>>({});

  const refLines: RefLine[] = vis.refLines || [];
  const setRefLines = useCallback(
    (updater: RefLine[] | ((prev: RefLine[]) => RefLine[])) =>
      updVis({
        refLines: typeof updater === "function" ? updater(vis.refLines || []) : updater || [],
      }),
    [updVis, vis.refLines]
  );

  // Regression styling is a sub-object; merge patches via updRegression so
  // existing `updRegression({ on: true })` call sites stay unchanged.
  const regression: ScatterRegression = vis.regression || {
    on: false,
    color: "#dc2626",
    strokeWidth: 1.5,
    dashed: false,
    showStats: true,
    position: "tl",
  };
  const updRegression = (patch: Partial<ScatterRegression>) =>
    updVis({ regression: { ...regression, ...patch } });
  const svgRef = useRef<SVGSVGElement>(null);
  const sepRef = useRef("");
  // Separator the auto-detector resolved on the most recent parse. Surfaced
  // inline on the Plot step's file-info line — Scatter has no configure step
  // so the badge lives directly above the controls / chart row.
  const [detectedSep, setDetectedSep] = useState<string>("");

  const parsed = useMemo(() => (rawText ? parseData(rawText, sepRef.current) : null), [rawText]);

  // Numeric column detection
  const colIsNumeric = useMemo<Record<number, boolean>>(() => {
    if (!parsed) return {};
    return parsed.headers.reduce<Record<number, boolean>>((acc, _, i) => {
      const vals = parsed.rawData.map((r) => r[i]).filter((v) => v !== "" && v != null);
      acc[i] = vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
      return acc;
    }, {});
  }, [parsed]);

  const numericCols = useMemo<number[]>(() => {
    if (!parsed) return [];
    return parsed.headers.reduce<number[]>(
      (acc, _, i) => (colIsNumeric[i] ? [...acc, i] : acc),
      []
    );
  }, [parsed, colIsNumeric]);

  // All column indices (active = not X or Y)
  const activeColIdxs = useMemo(
    () => (parsed ? parsed.headers.map((_: unknown, i: number) => i) : []),
    [parsed]
  );

  // Columns available for aesthetic mapping (everything except X and Y)
  const mappableCols = useMemo<number[]>(() => {
    if (!parsed) return [];
    return parsed.headers.reduce<number[]>(
      (acc, _, i) => (i !== xCol && i !== yCol ? [...acc, i] : acc),
      []
    );
  }, [parsed, xCol, yCol]);

  // Columns available for filtering (non-X, non-Y, non-aesthetic, categorical with ≤30 values)
  const filterableCols = useMemo(() => {
    if (!parsed) return [];
    return mappableCols.filter((i: number) => {
      const vals = [
        ...new Set(parsed.rawData.map((r) => r[i]).filter((v) => v != null && v !== "")),
      ];
      return vals.length > 0 && vals.length <= 30;
    });
  }, [parsed, mappableCols]);

  // Apply filterState to rows
  const filteredIndices = useMemo(() => {
    if (!parsed) return [];
    return parsed.rawData.reduce<number[]>((acc, row, ri) => {
      for (const [ci, allowed] of Object.entries(filterState)) {
        if (allowed.length > 0 && !allowed.includes(row[parseInt(ci)])) return acc;
      }
      acc.push(ri);
      return acc;
    }, []);
  }, [parsed, filterState]);

  const filteredData = useMemo(
    () => (parsed ? filteredIndices.map((i: number) => parsed.data[i]) : []),
    [parsed, filteredIndices]
  );
  const filteredRawRows = useMemo(
    () => (parsed ? filteredIndices.map((i: number) => parsed.rawData[i]) : []),
    [parsed, filteredIndices]
  );

  // Detect column type (numeric vs discrete)
  const detectColType = useCallback(
    (colIdx: number | null): "continuous" | "discrete" | null => {
      if (colIdx == null || !parsed) return null;
      const vals = parsed.rawData.map((r) => r[colIdx]).filter((v) => v != null && v !== "");
      return vals.every((v) => isNumericValue(v)) ? "continuous" : "discrete";
    },
    [parsed]
  );

  const colorMapType = useMemo(() => detectColType(colorMapCol), [colorMapCol, detectColType]);
  const sizeMapType = useMemo(() => detectColType(sizeMapCol), [sizeMapCol, detectColType]);

  // Unique values (sorted). Numeric sort uses decorate-sort-undecorate so
  // each value is parsed once (2n) instead of twice per comparison
  // (~2·n log n).
  const uniqueVals = useCallback(
    (colIdx: number | null): string[] => {
      if (colIdx == null || !parsed) return [];
      const vals = [
        ...new Set(parsed.rawData.map((r) => r[colIdx]).filter((v) => v != null && v !== "")),
      ] as string[];
      const allNum = vals.every((v) => isNumericValue(v));
      if (!allNum) return vals.sort();
      const decorated: [string, number][] = vals.map((v) => [v, parseFloat(v.replace(",", "."))]);
      decorated.sort((a, b) => a[1] - b[1]);
      return decorated.map((d) => d[0]);
    },
    [parsed]
  );

  const colorMapCategories = useMemo(
    () => (colorMapType === "discrete" ? uniqueVals(colorMapCol) : []),
    [colorMapCol, colorMapType, uniqueVals]
  );
  const sizeMapCategories = useMemo(
    () => (sizeMapType === "discrete" ? uniqueVals(sizeMapCol) : []),
    [sizeMapCol, sizeMapType, uniqueVals]
  );
  const shapeMapCategories = useMemo(
    () => (shapeMapCol != null ? uniqueVals(shapeMapCol) : []),
    [shapeMapCol, uniqueVals]
  );

  const shapeWarning = useMemo(() => {
    if (shapeMapCategories.length > 4) {
      return `This column has ${shapeMapCategories.length} unique values — only 4 shapes are available. Categories beyond the 4th will cycle through the same shapes.`;
    }
    return null;
  }, [shapeMapCategories]);

  // Numeric ranges for continuous mappings
  const numericRange = useCallback(
    (colIdx: number | null): [number, number] => {
      if (colIdx == null || !parsed) return [0, 1];
      const vals = parsed.rawData
        .map((r) => parseFloat((r[colIdx] || "").replace(",", ".")))
        .filter((v) => !isNaN(v));
      if (!vals.length) return [0, 1];
      // Linear min/max — Math.min(...vals) spreads every row as a function
      // argument and throws RangeError past ~125k elements (scatter has no
      // row cap beyond the 2 MB ingest limit, which permits far more).
      let mn = Infinity,
        mx = -Infinity;
      for (const v of vals) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return [mn, mx];
    },
    [parsed]
  );

  const colorMapRange = useMemo(() => numericRange(colorMapCol), [colorMapCol, numericRange]);
  const sizeMapRange = useMemo(() => numericRange(sizeMapCol), [sizeMapCol, numericRange]);

  // Auto-assign discrete colors. Seeds from the picked discrete palette so
  // that switching to e.g. "set1" propagates to newly-detected categories
  // without the user needing to re-pick. Falls back to PALETTE if a stale
  // palette name slips through.
  useEffect(() => {
    if (colorMapCategories.length === 0) {
      setColorMapDiscrete({});
      return;
    }
    setColorMapDiscrete((prev) => {
      const seed = resolveDiscretePalette(
        vis.discretePalette || "okabe-ito",
        colorMapCategories.length
      );
      const next: Record<string, string> = {};
      colorMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] || seed[i % Math.max(1, seed.length)] || PALETTE[i % PALETTE.length];
      });
      return next;
    });
  }, [colorMapCategories, setColorMapDiscrete, vis.discretePalette]);

  // Auto-assign discrete sizes
  useEffect(() => {
    if (sizeMapCategories.length === 0) {
      setSizeMapDiscrete({});
      return;
    }
    setSizeMapDiscrete((prev) => {
      const next: Record<string, number> = {};
      sizeMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] !== undefined ? prev[cat] : 3 + i * 3;
      });
      return next;
    });
  }, [sizeMapCategories, setSizeMapDiscrete]);

  // Auto-assign discrete shapes
  useEffect(() => {
    if (shapeMapCategories.length === 0) {
      setShapeMapDiscrete({});
      return;
    }
    setShapeMapDiscrete((prev) => {
      const next: Record<string, string> = {};
      shapeMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] || SHAPES[i % SHAPES.length];
      });
      return next;
    });
  }, [shapeMapCategories, setShapeMapDiscrete]);

  // Reset axis overrides and labels when X/Y columns change
  useEffect(() => {
    if (!parsed || xCol == null || yCol == null) return;
    updVis({
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      xLabel: parsed.headers[xCol],
      yLabel: parsed.headers[yCol],
    });
  }, [xCol, yCol, parsed, updVis]);

  // Auto-compute axis ranges from data (used as fallback when vis values are null)
  const autoAxis = useMemo(() => {
    if (!parsed || xCol == null || yCol == null) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const data = parsed.data;
    const xVals = data.map((r) => r[xCol]).filter((v) => v != null);
    const yVals = data.map((r) => r[yCol]).filter((v) => v != null);
    // Linear min/max — Math.min/max(...vals) spreads every row as a function
    // argument and throws RangeError past ~125k elements (no row cap beyond
    // the 2 MB ingest limit).
    let xMn = Infinity,
      xMx = -Infinity,
      yMn = Infinity,
      yMx = -Infinity;
    for (const v of xVals) {
      if (v < xMn) xMn = v;
      if (v > xMx) xMx = v;
    }
    for (const v of yVals) {
      if (v < yMn) yMn = v;
      if (v > yMx) yMx = v;
    }
    const xPad = xVals.length > 1 ? (xMx - xMn) * 0.05 : 0.5;
    const yPad = yVals.length > 1 ? (yMx - yMn) * 0.05 : 0.5;
    return {
      xMin: xVals.length ? xMn - xPad : 0,
      xMax: xVals.length ? xMx + xPad : 1,
      yMin: yVals.length ? yMn - yPad : 0,
      yMax: yVals.length ? yMx + yPad : 1,
    };
  }, [parsed, xCol, yCol]);

  // Linear regression over filtered data (simple y ~ x)
  const regressionStats = useMemo(
    () => computeLinearRegression(filteredData, xCol, yCol),
    [filteredData, xCol, yCol]
  );

  // Stats panel sets: one "All" row over every visible point, plus one row
  // per category when a discrete colour aesthetic is mapped. Drops rows
  // where either axis is non-finite before assembling — runCorrelation
  // would do the same drop internally, but stripping here keeps the n
  // counts and per-axis Shapiro inputs honest.
  const statsSets = useMemo<ScatterStatsSet[]>(() => {
    if (!parsed || xCol == null || yCol == null) return [];
    const xs: number[] = [];
    const ys: number[] = [];
    const rowCats: (string | null)[] = [];
    const discreteColorMap =
      colorMapCol != null && colorMapType === "discrete" && parsed.rawData ? colorMapCol : null;
    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const xv = row[xCol];
      const yv = row[yCol];
      if (xv == null || yv == null || !Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      xs.push(xv);
      ys.push(yv);
      if (discreteColorMap != null) {
        const raw = filteredRawRows[i]?.[discreteColorMap];
        rowCats.push(raw != null && raw !== "" ? String(raw) : null);
      } else {
        rowCats.push(null);
      }
    }
    if (xs.length === 0) return [];
    const sets: ScatterStatsSet[] = [{ key: "__all__", name: "All", xs, ys }];
    if (discreteColorMap != null && colorMapCategories.length > 0) {
      for (const cat of colorMapCategories) {
        const sx: number[] = [];
        const sy: number[] = [];
        for (let i = 0; i < rowCats.length; i++) {
          if (rowCats[i] === cat) {
            sx.push(xs[i]);
            sy.push(ys[i]);
          }
        }
        sets.push({
          key: `cat:${cat}`,
          name: cat,
          color: colorMapDiscrete[cat] || PALETTE[0],
          xs: sx,
          ys: sy,
        });
      }
    }
    return sets;
  }, [
    parsed,
    filteredData,
    filteredRawRows,
    xCol,
    yCol,
    colorMapCol,
    colorMapType,
    colorMapCategories,
    colorMapDiscrete,
  ]);

  const fileStem = useMemo(() => fileBaseName(fileName, "scatter") + "_scatter", [fileName]);

  // Effective axis values: user override or auto
  const effAxis = {
    xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
    xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
    yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
    yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax,
  };

  // Clear aesthetic that refers to X or Y column. We deliberately depend
  // ONLY on xCol / yCol — the effect's purpose is "react to a column
  // change", and adding the *MapCol values would re-fire it every time
  // the user picks a new mapping (which shouldn't reset itself).
  useEffect(() => {
    if (colorMapCol === xCol || colorMapCol === yCol) setColorMapCol(null);
    if (sizeMapCol === xCol || sizeMapCol === yCol) setSizeMapCol(null);
    if (shapeMapCol === xCol || shapeMapCol === yCol) setShapeMapCol(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xCol, yCol]);

  // Build SVG legend
  const svgLegend = useMemo(() => {
    const items: Array<Record<string, unknown>> = [];
    if (!parsed) return null;
    const hasColorMap = colorMapCol != null;
    const hasSizeMap = sizeMapCol != null;
    const hasShapeMap = shapeMapCol != null;

    if (hasColorMap && colorMapType === "continuous") {
      const stops = COLOR_PALETTES[colorMapPalette] || COLOR_PALETTES.viridis;
      items.push({
        id: "legend-color",
        title: parsed.headers[colorMapCol],
        gradient: { stops, min: colorMapRange[0].toFixed(2), max: colorMapRange[1].toFixed(2) },
      });
    } else if (hasColorMap && colorMapType === "discrete") {
      items.push({
        id: "legend-color",
        title: parsed.headers[colorMapCol],
        items: colorMapCategories.map((c) => ({
          label: c,
          color: colorMapDiscrete[c] || "#999",
          shape: "dot",
        })),
      });
    }

    if (hasSizeMap && sizeMapType === "discrete") {
      items.push({
        id: "legend-size",
        title: parsed.headers[sizeMapCol],
        sizeItems: sizeMapCategories.map((c) => ({
          label: c,
          r: sizeMapDiscrete[c] || sizeMapMin,
        })),
      });
    } else if (hasSizeMap && sizeMapType === "continuous") {
      const sizeItems = Array.from({ length: 4 }, (_, i) => {
        const t = i / 3;
        return {
          label: (sizeMapRange[0] + t * (sizeMapRange[1] - sizeMapRange[0])).toFixed(1),
          r: sizeMapMin + t * (sizeMapMax - sizeMapMin),
        };
      });
      items.push({ id: "legend-size", title: parsed.headers[sizeMapCol], sizeItems });
    }

    if (hasShapeMap) {
      items.push({
        id: "legend-shape",
        title: parsed.headers[shapeMapCol],
        items: shapeMapCategories.map((c) => ({
          label: c,
          color: "var(--text-muted)",
          shape: shapeMapDiscrete[c] || "circle",
        })),
      });
    }

    return items.length > 0 ? items : null;
  }, [
    parsed,
    colorMapCol,
    colorMapType,
    colorMapPalette,
    colorMapDiscrete,
    colorMapCategories,
    colorMapRange,
    sizeMapCol,
    sizeMapType,
    sizeMapMin,
    sizeMapMax,
    sizeMapDiscrete,
    sizeMapCategories,
    sizeMapRange,
    shapeMapCol,
    shapeMapCategories,
    shapeMapDiscrete,
  ]);

  const doParse = useCallback(
    (text: string, sep: string) => {
      // Resolve "auto" (sep === "") before fixDecimalCommas so European
      // semicolon-delimited input still gets its decimal commas fixed
      // — `fixDecimalCommas` short-circuits on sep === "". Same pattern
      // as boxplot/app.tsx.
      const resolved = autoDetectSep(text, sep);
      const effectiveSep = typeof resolved === "string" ? resolved : "";
      sepRef.current = effectiveSep;
      setDetectedSep(effectiveSep);
      const dc = fixDecimalCommas(text, effectiveSep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const fixedText = dc.text;
      const { headers, data, rawData, injectionWarnings } = parseData(fixedText, effectiveSep);
      setInjectionWarning(injectionWarnings);
      if (headers.length < 2 || data.length === 0) {
        setParseError(
          "The file appears to be empty or has no data rows. Please check your file and try again."
        );
        return;
      }
      setParseError(null);
      setRawText(fixedText);

      // Auto-assign X and Y to first two numeric columns
      const isNum = (idx: number): boolean => {
        const vals = rawData.map((r) => r[idx]).filter((v) => v !== "" && v != null);
        return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
      };
      const nums = headers.reduce<number[]>((acc, _, i) => (isNum(i) ? [...acc, i] : acc), []);
      setXCol(nums[0] !== undefined ? nums[0] : 0);
      setYCol(nums[1] !== undefined ? nums[1] : nums[0] !== undefined ? nums[0] : 1);

      // Reset only dataset-tied state. Visual prefs (pointColor / pointSize /
      // strokeColor / strokeWidth / pointOpacity / colorMapPalette /
      // refLines / regression sub-object) live in `vis` and persist
      // across parses — wiping them on every upload would lose the
      // user's saved style. Per-category mapping dicts (colorMapDiscrete
      // / sizeMapDiscrete / shapeMapDiscrete) ALSO persist by design:
      // they're keyed by category NAME, so on a new dataset orphaned
      // keys are harmless and matching names keep the user's colour.
      // Column indices reset because they refer to the previous
      // dataset's column layout.
      setColorMapCol(null);
      setSizeMapCol(null);
      setShapeMapCol(null);
      setFilterState({});

      setStep("plot");
    },
    [setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse, setFileName]
  );

  // Paste-data path. UploadPanel hands raw text + a synthetic filename;
  // size is gated in the panel against FILE_LIMIT_BYTES. Force
  // sepOverride="" so auto-detect kicks in for Excel/Sheets paste.
  const handleTextPaste = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      setSepOverride("");
      doParse(text, "");
    },
    [doParse, setFileName, setSepOverride]
  );

  const loadExample = useCallback(() => {
    const text = EXAMPLE_CSV;
    if (!text) return;
    // Leave sepOverride empty so the Override disclosure stays closed on
    // back-nav; autoDetectSep resolves "," from the bundled CSV.
    setSepOverride("");
    setFileName("iris.csv");
    doParse(text, "");
  }, [doParse, setFileName, setSepOverride]);

  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  };

  const addRefLine = (dir: "h" | "v") =>
    setRefLines((prev) => [
      ...prev,
      {
        id: ++refLineCounter,
        dir,
        value: 0,
        color: "#dc2626",
        strokeWidth: 1.5,
        dashed: true,
        dashArray: "7,4",
        label: "",
        labelSide: dir === "h" ? "right" : "top",
      },
    ]);
  const updateRefLine = (id: number, key: string, val: unknown) =>
    setRefLines((prev) => prev.map((rl) => (rl.id === id ? { ...rl, [key]: val } : rl)));
  const removeRefLine = (id: number) => setRefLines((prev) => prev.filter((rl) => rl.id !== id));

  const canNavigate = (s: string) => {
    if (s === "upload") return true;
    if (s === "plot") return !!parsed;
    return false;
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="scatter"
      title="Scatter Plot"
      visInit={VIS_INIT_SCATTER}
      steps={["upload", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          handleTextPaste={handleTextPaste}
          onLoadExample={loadExample}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed}
          fileName={fileName}
          detectedSep={detectedSep}
          filteredData={filteredData}
          filteredRawRows={filteredRawRows}
          activeColIdxs={activeColIdxs}
          xCol={xCol}
          setXCol={setXCol}
          yCol={yCol}
          setYCol={setYCol}
          numericCols={numericCols}
          pointColor={pointColor}
          setPointColor={setPointColor}
          pointSize={pointSize}
          setPointSize={setPointSize}
          pointOpacity={pointOpacity}
          setPointOpacity={setPointOpacity}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          colorMapCol={colorMapCol}
          setColorMapCol={setColorMapCol}
          colorMapType={colorMapType}
          colorMapPalette={colorMapPalette}
          setColorMapPalette={setColorMapPalette}
          colorMapDiscrete={colorMapDiscrete}
          setColorMapDiscrete={setColorMapDiscrete}
          colorMapCategories={colorMapCategories}
          colorMapRange={colorMapRange}
          sizeMapCol={sizeMapCol}
          setSizeMapCol={setSizeMapCol}
          sizeMapType={sizeMapType}
          sizeMapMin={sizeMapMin}
          setSizeMapMin={setSizeMapMin}
          sizeMapMax={sizeMapMax}
          setSizeMapMax={setSizeMapMax}
          sizeMapDiscrete={sizeMapDiscrete}
          setSizeMapDiscrete={setSizeMapDiscrete}
          sizeMapCategories={sizeMapCategories}
          sizeMapRange={sizeMapRange}
          shapeMapCol={shapeMapCol}
          setShapeMapCol={setShapeMapCol}
          shapeMapCategories={shapeMapCategories}
          shapeMapDiscrete={shapeMapDiscrete}
          setShapeMapDiscrete={setShapeMapDiscrete}
          shapeWarning={shapeWarning}
          vis={vis}
          updVis={updVis}
          autoAxis={autoAxis}
          effAxis={effAxis}
          refLines={refLines}
          addRefLine={addRefLine}
          updateRefLine={updateRefLine}
          removeRefLine={removeRefLine}
          regression={regression}
          updRegression={updRegression}
          regressionStats={regressionStats}
          filterState={filterState}
          setFilterState={setFilterState}
          filterableCols={filterableCols}
          uniqueVals={uniqueVals}
          mappableCols={mappableCols}
          resetAll={resetAll}
          svgRef={svgRef}
          svgLegend={svgLegend}
          statsSets={statsSets}
          fileStem={fileStem}
        />
      )}
    </PlotToolShell>
  );
}

// scatter/index.tsx — App orchestrator for the Scatter tool. This is the
// esbuild entry point (bundles to tools/scatter/index.js). Chart, shapes,
// step panels, and the plot-step composition live in sibling modules
// under tools/scatter/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { SHAPES, computeLinearRegression } from "./helpers";
import { UploadStep } from "./steps";
import { PlotStep } from "./plot-area";

const { useState, useMemo, useCallback, useEffect, useRef } = React;

// Module-scope counter for stable per-session refLine ids. Stays outside
// App so dev-mode StrictMode double-renders don't reset it.
let refLineCounter = 0;

const VIS_INIT_SCATTER = {
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
  // Per-style + per-mapping prefs that used to live in local useState. They
  // auto-persist to localStorage and round-trip through PrefsPanel save /
  // load. Per-category dicts (colorMapDiscrete / sizeMapDiscrete /
  // shapeMapDiscrete) are keyed by category NAME so they survive a
  // dataset swap as long as names match.
  pointColor: "#648FFF",
  pointSize: 5,
  pointOpacity: 0.8,
  strokeColor: "#000000",
  strokeWidth: 1,
  colorMapPalette: "viridis",
  colorMapDiscrete: {},
  sizeMapMin: 3,
  sizeMapMax: 15,
  sizeMapDiscrete: {},
  shapeMapDiscrete: {},
  refLines: [] as any[],
  regression: {
    on: false,
    color: "#dc2626",
    strokeWidth: 1.5,
    dashed: false,
    showStats: true,
    position: "tl",
  },
};

function App() {
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

  // Point defaults + style + mappings + refLines + regression: all migrated
  // into `vis` so they auto-persist via PrefsPanel + localStorage. Read-
  // through `const` for value access, useCallback setters that accept both
  // direct values AND functional updaters so existing call sites (including
  // setShape((prev) => ({...prev, [k]: v})) patterns) keep working unchanged.
  const pointColor = vis.pointColor ?? "#648FFF";
  const setPointColor = useCallback((v: any) => updVis({ pointColor: v }), [updVis]);
  const pointSize = vis.pointSize ?? 5;
  const setPointSize = useCallback((v: any) => updVis({ pointSize: v }), [updVis]);
  const pointOpacity = vis.pointOpacity ?? 0.8;
  const setPointOpacity = useCallback((v: any) => updVis({ pointOpacity: v }), [updVis]);
  const strokeColor = vis.strokeColor ?? "#000000";
  const setStrokeColor = useCallback((v: any) => updVis({ strokeColor: v }), [updVis]);
  const strokeWidth = vis.strokeWidth ?? 1;
  const setStrokeWidth = useCallback((v: any) => updVis({ strokeWidth: v }), [updVis]);

  // Column-index mappings stay local — they're tied to the current dataset's
  // columns, not a visual pref the user wants restored across reloads.
  const [colorMapCol, setColorMapCol] = useState<number | null>(null);
  const colorMapPalette = vis.colorMapPalette ?? "viridis";
  const setColorMapPalette = useCallback((v: any) => updVis({ colorMapPalette: v }), [updVis]);
  const colorMapDiscrete: Record<string, string> = vis.colorMapDiscrete || {};
  const setColorMapDiscrete = useCallback(
    (updater: any) =>
      updVis({
        colorMapDiscrete:
          typeof updater === "function" ? updater(vis.colorMapDiscrete || {}) : updater || {},
      }),
    [updVis, vis.colorMapDiscrete]
  );

  const [sizeMapCol, setSizeMapCol] = useState<number | null>(null);
  const sizeMapMin = vis.sizeMapMin ?? 3;
  const setSizeMapMin = useCallback((v: any) => updVis({ sizeMapMin: v }), [updVis]);
  const sizeMapMax = vis.sizeMapMax ?? 15;
  const setSizeMapMax = useCallback((v: any) => updVis({ sizeMapMax: v }), [updVis]);
  const sizeMapDiscrete: Record<string, number> = vis.sizeMapDiscrete || {};
  const setSizeMapDiscrete = useCallback(
    (updater: any) =>
      updVis({
        sizeMapDiscrete:
          typeof updater === "function" ? updater(vis.sizeMapDiscrete || {}) : updater || {},
      }),
    [updVis, vis.sizeMapDiscrete]
  );

  const [shapeMapCol, setShapeMapCol] = useState<number | null>(null);
  const shapeMapDiscrete: Record<string, string> = vis.shapeMapDiscrete || {};
  const setShapeMapDiscrete = useCallback(
    (updater: any) =>
      updVis({
        shapeMapDiscrete:
          typeof updater === "function" ? updater(vis.shapeMapDiscrete || {}) : updater || {},
      }),
    [updVis, vis.shapeMapDiscrete]
  );

  // Filter state stays local — depends on the current dataset's column values.
  const [filterState, setFilterState] = useState<Record<string, string[]>>({});

  const refLines = vis.refLines || [];
  const setRefLines = useCallback(
    (updater: any) =>
      updVis({
        refLines: typeof updater === "function" ? updater(vis.refLines || []) : updater || [],
      }),
    [updVis, vis.refLines]
  );

  // Regression styling is a sub-object; merge patches via updRegression so
  // existing `updRegression({ on: true })` call sites stay unchanged.
  const regression = vis.regression || {
    on: false,
    color: "#dc2626",
    strokeWidth: 1.5,
    dashed: false,
    showStats: true,
    position: "tl",
  };
  const updRegression = (patch: any) => updVis({ regression: { ...regression, ...patch } });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const sepRef = useRef("");

  const parsed = useMemo(() => (rawText ? parseData(rawText, sepRef.current) : null), [rawText]);

  // Numeric column detection
  const colIsNumeric = useMemo<Record<number, boolean>>(() => {
    if (!parsed) return {};
    return parsed.headers.reduce<Record<number, boolean>>((acc, _, i) => {
      const vals = parsed.rawData.map((r: any) => r[i]).filter((v: any) => v !== "" && v != null);
      acc[i] =
        vals.length > 0 && vals.filter((v: any) => isNumericValue(v)).length / vals.length > 0.5;
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
    (colIdx: number | null) => {
      if (colIdx == null || !parsed) return null;
      const vals = parsed.rawData
        .map((r: any) => r[colIdx])
        .filter((v: any) => v != null && v !== "");
      return vals.every((v: any) => isNumericValue(v)) ? "continuous" : "discrete";
    },
    [parsed]
  );

  const colorMapType = useMemo(() => detectColType(colorMapCol), [colorMapCol, detectColType]);
  const sizeMapType = useMemo(() => detectColType(sizeMapCol), [sizeMapCol, detectColType]);

  // Unique values (sorted)
  const uniqueVals = useCallback(
    (colIdx: number | null): string[] => {
      if (colIdx == null || !parsed) return [];
      const vals = [
        ...new Set(
          parsed.rawData.map((r: any) => r[colIdx]).filter((v: any) => v != null && v !== "")
        ),
      ] as string[];
      const allNum = vals.every((v) => isNumericValue(v));
      return allNum
        ? vals.sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", ".")))
        : vals.sort();
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
        .map((r: any) => parseFloat((r[colIdx] || "").replace(",", ".")))
        .filter((v: number) => !isNaN(v));
      return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
    },
    [parsed]
  );

  const colorMapRange = useMemo(() => numericRange(colorMapCol), [colorMapCol, numericRange]);
  const sizeMapRange = useMemo(() => numericRange(sizeMapCol), [sizeMapCol, numericRange]);

  // Auto-assign discrete colors
  useEffect(() => {
    if (colorMapCategories.length === 0) {
      setColorMapDiscrete({});
      return;
    }
    setColorMapDiscrete((prev: any) => {
      const next: Record<string, string> = {};
      colorMapCategories.forEach((cat: string, i: number) => {
        next[cat] = prev[cat] || PALETTE[i % PALETTE.length];
      });
      return next;
    });
  }, [colorMapCategories]);

  // Auto-assign discrete sizes
  useEffect(() => {
    if (sizeMapCategories.length === 0) {
      setSizeMapDiscrete({});
      return;
    }
    setSizeMapDiscrete((prev: any) => {
      const next: Record<string, number> = {};
      sizeMapCategories.forEach((cat: string, i: number) => {
        next[cat] = prev[cat] !== undefined ? prev[cat] : 3 + i * 3;
      });
      return next;
    });
  }, [sizeMapCategories]);

  // Auto-assign discrete shapes
  useEffect(() => {
    if (shapeMapCategories.length === 0) {
      setShapeMapDiscrete({});
      return;
    }
    setShapeMapDiscrete((prev: any) => {
      const next: Record<string, string> = {};
      shapeMapCategories.forEach((cat: string, i: number) => {
        next[cat] = prev[cat] || SHAPES[i % SHAPES.length];
      });
      return next;
    });
  }, [shapeMapCategories]);

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
  }, [xCol, yCol, parsed]);

  // Auto-compute axis ranges from data (used as fallback when vis values are null)
  const autoAxis = useMemo(() => {
    if (!parsed || xCol == null || yCol == null) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const data = parsed.data;
    const xVals = data.map((r) => r[xCol]).filter((v) => v != null);
    const yVals = data.map((r) => r[yCol]).filter((v) => v != null);
    const xPad = xVals.length > 1 ? (Math.max(...xVals) - Math.min(...xVals)) * 0.05 : 0.5;
    const yPad = yVals.length > 1 ? (Math.max(...yVals) - Math.min(...yVals)) * 0.05 : 0.5;
    return {
      xMin: xVals.length ? Math.min(...xVals) - xPad : 0,
      xMax: xVals.length ? Math.max(...xVals) + xPad : 1,
      yMin: yVals.length ? Math.min(...yVals) - yPad : 0,
      yMax: yVals.length ? Math.max(...yVals) + yPad : 1,
    };
  }, [parsed, xCol, yCol]);

  // Linear regression over filtered data (simple y ~ x)
  const regressionStats = useMemo(
    () => computeLinearRegression(filteredData, xCol, yCol),
    [filteredData, xCol, yCol]
  );

  // Effective axis values: user override or auto
  const effAxis = {
    xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
    xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
    yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
    yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax,
  };

  // Clear aesthetic that refers to X or Y column
  useEffect(() => {
    if (colorMapCol === xCol || colorMapCol === yCol) setColorMapCol(null);
    if (sizeMapCol === xCol || sizeMapCol === yCol) setSizeMapCol(null);
    if (shapeMapCol === xCol || shapeMapCol === yCol) setShapeMapCol(null);
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
        items: colorMapCategories.map((c: any) => ({
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
        sizeItems: sizeMapCategories.map((c: any) => ({
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
        items: shapeMapCategories.map((c: any) => ({
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

  const doParse = useCallback((text: string, sep: string) => {
    sepRef.current = sep;
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    const fixedText = dc.text;
    const { headers, data, rawData, injectionWarnings } = parseData(fixedText, sep);
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
    const isNum = (idx: number) => {
      const vals = rawData.map((r: any) => r[idx]).filter((v: any) => v !== "" && v != null);
      return (
        vals.length > 0 && vals.filter((v: any) => isNumericValue(v)).length / vals.length > 0.5
      );
    };
    const nums = headers.reduce<number[]>((acc, _, i) => (isNum(i) ? [...acc, i] : acc), []);
    setXCol(nums[0] !== undefined ? nums[0] : 0);
    setYCol(nums[1] !== undefined ? nums[1] : nums[0] !== undefined ? nums[0] : 1);

    // Reset only dataset-tied state. Visual prefs (pointColor / pointSize /
    // strokeColor / strokeWidth / pointOpacity / colorMapPalette / refLines /
    // regression sub-object) persist across parses now that they live in
    // `vis` — wiping them on every upload would defeat the audit-23 #1
    // persistence fix. Per-category mapping dicts (colorMapDiscrete /
    // sizeMapDiscrete / shapeMapDiscrete) ALSO persist by design: they're
    // keyed by category NAME, so on a new dataset the orphaned keys are
    // harmless and any matching category names retain the user's colour.
    // Column indices reset because they refer to the previous dataset's
    // column layout.
    setColorMapCol(null);
    setSizeMapCol(null);
    setShapeMapCol(null);
    setFilterState({});

    setStep("plot");
  }, []);

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__SCATTER_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFileName("iris.csv");
    doParse(text, ",");
  }, [doParse]);

  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  };

  const addRefLine = (dir: "h" | "v") =>
    setRefLines((prev: any[]) => [
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
    setRefLines((prev: any[]) =>
      prev.map((rl: any) => (rl.id === id ? { ...rl, [key]: val } : rl))
    );
  const removeRefLine = (id: number) =>
    setRefLines((prev: any[]) => prev.filter((rl: any) => rl.id !== id));

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
          onLoadExample={loadExample}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed}
          fileName={fileName}
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
        />
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Scatter plot">
    <App />
  </ErrorBoundary>
);

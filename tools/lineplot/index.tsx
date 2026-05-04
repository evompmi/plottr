// lineplot/index.tsx — App orchestrator for the Line / profile plot. This
// is the esbuild entry point (bundles to tools/lineplot/index.js). Chart
// rendering, step panels, sidebar controls, and the per-x stats panel live
// in sibling modules under tools/lineplot/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { computeSeries, computePerXStats, round2 } from "./helpers";
import { UploadStep, ConfigureStep } from "./steps";
import { PlotStep } from "./plot-area";

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const VIS_INIT_LINEPLOT = {
  xMin: null,
  xMax: null,
  yMin: null,
  yMax: null,
  xLabel: "",
  yLabel: "",
  plotTitle: "",
  plotSubtitle: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  lineWidth: 1.5,
  pointRadius: 3.5,
  errorStrokeWidth: 1,
  errorCapWidth: 6,
  // Per-group line colours, keyed by group name.
  groupColors: {},
  // Discrete-palette key driving the per-group colour seed. Default
  // "okabe-ito" is byte-identical to PALETTE so existing behaviour is
  // preserved exactly.
  discretePalette: "okabe-ito",
  errorType: "sem",
  showStars: true,
};

function App() {
  const shell = usePlotToolState("lineplot", VIS_INIT_LINEPLOT);
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

  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState(1);
  const [groupCol, setGroupCol] = useState<number | null>(null);

  // errorType + showStars + groupColors now live in `vis` so the PrefsPanel
  // Save / Load file and the auto-persist localStorage slot cover them.
  const errorType = vis.errorType ?? "sem";
  const setErrorType = useCallback((v: string) => updVis({ errorType: v }), [updVis]);
  const showStars = vis.showStars ?? true;
  const setShowStars = useCallback((v: boolean) => updVis({ showStars: v }), [updVis]);
  const groupColors = useMemo(() => vis.groupColors || {}, [vis.groupColors]);

  const svgRef = useRef<SVGSVGElement>(null);
  const sepRef = useRef("");

  const parsed = useMemo(() => (rawText ? parseData(rawText, sepRef.current) : null), [rawText]);

  const colIsNumeric = useMemo(() => {
    if (!parsed) return {};
    return parsed.headers.reduce((acc: any, _: unknown, i: number) => {
      const vals = parsed.rawData.map((r: any) => r[i]).filter((v: any) => v !== "" && v != null);
      acc[i] =
        vals.length > 0 && vals.filter((v: any) => isNumericValue(v)).length / vals.length > 0.5;
      return acc;
    }, {});
  }, [parsed]);

  const numericCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce(
      (acc: any, _: unknown, i: number) => (colIsNumeric[i] ? [...acc, i] : acc),
      []
    );
  }, [parsed, colIsNumeric]);

  const categoricalCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce(
      (acc: any, _: unknown, i: number) => (colIsNumeric[i] ? acc : [...acc, i]),
      []
    );
  }, [parsed, colIsNumeric]);

  const series = useMemo(() => {
    if (!parsed || xCol == null || yCol == null) return [];
    // Resolve the picked discrete palette to a hex array sized for whatever
    // `computeSeries` will eventually emit. We don't know the final group
    // count up front, so size to a safe upper bound (number of unique
    // categorical values in groupCol, capped to avoid pathological CSVs).
    // computeSeries recycles modulo when needed.
    const groupCount =
      groupCol == null
        ? 1
        : Math.min(
            128,
            new Set(parsed.rawData.map((r: any) => String(r[groupCol] ?? ""))).size || 1
          );
    const seedColors = resolveDiscretePalette(vis.discretePalette || "okabe-ito", groupCount);
    return computeSeries(
      parsed.data,
      parsed.rawData,
      xCol,
      yCol,
      groupCol,
      groupColors,
      seedColors
    );
  }, [parsed, xCol, yCol, groupCol, groupColors, vis.discretePalette]);

  const setGroupColor = useCallback(
    (name: string, color: string) =>
      updVis({ groupColors: { ...(vis.groupColors || {}), [name]: color } }),
    [updVis, vis.groupColors]
  );

  const statsRows = useMemo(() => (series.length >= 2 ? computePerXStats(series) : []), [series]);

  const autoAxis = useMemo(() => {
    if (series.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    let xMin = Infinity,
      xMax = -Infinity,
      yLo = Infinity,
      yHi = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.mean == null) continue;
        // Auto-axis contracts to the mean when errorType is "none" so the
        // y-range isn't padded for bars the user doesn't want to see.
        const e =
          errorType === "none"
            ? 0
            : errorType === "sd"
              ? p.sd
              : errorType === "ci95"
                ? p.ci95
                : p.sem;
        const hi = p.mean + (e || 0);
        const lo = p.mean - (e || 0);
        if (lo < yLo) yLo = lo;
        if (hi > yHi) yHi = hi;
      }
    }
    if (!Number.isFinite(xMin)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const xPad = xMin === xMax ? 0.5 : (xMax - xMin) * 0.05;
    const yPad = yLo === yHi ? 0.5 : (yHi - yLo) * 0.08;
    return {
      xMin: round2(xMin - xPad),
      xMax: round2(xMax + xPad),
      yMin: round2(yLo - yPad),
      yMax: round2(yHi + yPad),
    };
  }, [series, errorType]);

  const effAxis = {
    xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
    xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
    yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
    yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax,
  };

  const svgLegend = useMemo(() => {
    if (series.length === 0) return null;
    if (series.length === 1 && series[0].name === "(all)") return null;
    return [
      {
        id: "legend-group",
        title: groupCol != null && parsed ? parsed.headers[groupCol] : "",
        items: series.map((s: any) => ({ label: s.name, color: s.color, shape: "dot" })),
      },
    ];
  }, [series, groupCol, parsed]);

  // Seed labels when columns change.
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

  const doParse = useCallback(
    (text: string, sep: string) => {
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

      const isNum = (idx: number) => {
        const vals = rawData.map((r: any) => r[idx]).filter((v: any) => v !== "" && v != null);
        return (
          vals.length > 0 && vals.filter((v: any) => isNumericValue(v)).length / vals.length > 0.5
        );
      };
      const nums = headers.reduce(
        (acc: any, _: unknown, i: number) => (isNum(i) ? [...acc, i] : acc),
        []
      );
      const cats = headers.reduce(
        (acc: any, _: unknown, i: number) => (isNum(i) ? acc : [...acc, i]),
        []
      );
      setXCol(nums[0] !== undefined ? nums[0] : 0);
      setYCol(nums[1] !== undefined ? nums[1] : nums[0] !== undefined ? nums[0] : 1);
      setGroupCol(cats[0] !== undefined ? cats[0] : null);
      updVis({ groupColors: {} });
      setStep("configure");
    },
    [setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep, updVis]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse, setFileName]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__LINEPLOT_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFileName("bacterial_growth.csv");
    doParse(text, ",");
  }, [doParse, setFileName, setSepOverride]);

  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  };

  const canNavigate = (s: string) => {
    if (s === "upload") return true;
    if (s === "configure") return !!parsed;
    if (s === "plot") return !!parsed && xCol != null && yCol != null;
    return false;
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="lineplot"
      title="Line Plot"
      visInit={VIS_INIT_LINEPLOT}
      steps={["upload", "configure", "plot"]}
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

      {step === "configure" && parsed && (
        <ConfigureStep
          parsed={parsed}
          fileName={fileName}
          xCol={xCol}
          setXCol={setXCol}
          yCol={yCol}
          setYCol={setYCol}
          groupCol={groupCol}
          setGroupCol={setGroupCol}
          numericCols={numericCols}
          categoricalCols={categoricalCols}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed}
          fileName={fileName}
          series={series}
          statsRows={statsRows}
          xCol={xCol}
          setXCol={setXCol}
          yCol={yCol}
          setYCol={setYCol}
          groupCol={groupCol}
          setGroupCol={setGroupCol}
          numericCols={numericCols}
          categoricalCols={categoricalCols}
          setGroupColor={setGroupColor}
          vis={vis}
          updVis={updVis}
          autoAxis={autoAxis}
          effAxis={effAxis}
          errorType={errorType}
          setErrorType={setErrorType}
          showStars={showStars}
          setShowStars={setShowStars}
          svgRef={svgRef}
          svgLegend={svgLegend}
          resetAll={resetAll}
        />
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Line plot">
    <App />
  </ErrorBoundary>
);

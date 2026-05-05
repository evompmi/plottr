// Volcano plot — App orchestrator. Mirrors scatter's wiring (the closest
// tool in shape) but with three-class significance colouring, reference
// lines, p-value clamping, top-N feature labels, click-to-label, and
// optional Color / Size aesthetic mappings.
//
// Folder layout (matches the boxplot convention):
//   helpers.ts   — pure logic (classify / score / layout / aesthetic
//                   maps / row→VolcanoPoint pull / eligibleColumns).
//                   Loaded by tests/helpers/volcano-loader.js.
//   chart.tsx    — VolcanoChart (forwardRef SVG renderer)
//   chart-layout.ts / chart-legends.tsx — supporting modules for chart.tsx
//   controls.tsx — VolcanoAesBox + sidebar tiles (Thresholds / Colors /
//                   ColorMap / SizeMap / Labels / Style / Summary).
//   steps.tsx    — ConfigureStep + PlotStep wrappers.
//   reports.ts   — buildVolcanoRScript + buildVolcanoCsv (sanitised)
//   howto.tsx    — VOLCANO_HOWTO content for the in-tool help tile.
//   index.tsx    — this file: App + ReactDOM mount.
//
// All shared scaffold (PlotToolShell, usePlotToolState, FormulaInjection
// banner, etc.) come from the tools/_shell/ + shared.bundle.js pair every
// other tool uses.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { HowTo } from "../_shell/HowTo";
import { VOLCANO_HOWTO } from "./howto";
import {
  VolcanoPoint,
  VOLCANO_DEFAULT_COLORS,
  classifyPoint,
  computePFloor,
  countClamped,
  summarize,
  autoDetectColumns,
  buildColorMap,
  buildSizeMap,
  buildPoints,
  ColorMap,
} from "./helpers";
import { ConfigureStep, PlotStep } from "./steps";
import { buildVolcanoRScript, buildVolcanoCsv } from "./reports";

const { useState, useEffect, useMemo, useCallback, useRef } = React;

// Initial visualisation state — persisted via auto-prefs.
const VIS_INIT_VOLCANO = {
  fcCutoff: 1,
  pCutoff: 0.05,
  topNUp: 10,
  topNDown: 10,
  showLabels: true,
  showRefLines: true,
  showAxes: true,
  pointRadius: 3,
  pointAlpha: 0.7,
  labelFontSize: 11,
  // Aesthetic mapping defaults (used when the colour-/size-map tiles
  // are toggled On). Column indices live in local state; these are the
  // style knobs that survive reloads.
  colorMapPalette: "viridis",
  colorMapInvert: false,
  sizeMapMinR: 2,
  sizeMapMaxR: 9,
  plotWidth: 800,
  colorUp: VOLCANO_DEFAULT_COLORS.up,
  colorDown: VOLCANO_DEFAULT_COLORS.down,
  colorNs: VOLCANO_DEFAULT_COLORS.ns,
  // Discrete-palette key driving the up/down/ns slot mapping. Default
  // "okabe-ito" keeps the existing VOLCANO_DEFAULT_COLORS visually
  // (PALETTE[5] = vermillion = up, PALETTE[4] = blue = down, neutral grey
  // = ns). Picking a palette maps `[0]` → up, `[1]` → down, last/neutral
  // → ns. The user can hand-edit any of the 3 slots afterward.
  discretePalette: "okabe-ito",
  xMin: null as number | null,
  xMax: null as number | null,
  yMin: null as number | null,
  yMax: null as number | null,
  plotTitle: "",
};

// ── App ────────────────────────────────────────────────────────────────

export function App() {
  const shell = usePlotToolState("volcano", VIS_INIT_VOLCANO);
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

  // Tool-local state — column picks, parsed data, derived points.
  const [parsed, setParsed] = useState<any>(null);
  const [xCol, setXCol] = useState(-1);
  const [yCol, setYCol] = useState(-1);
  const [labelCol, setLabelCol] = useState(-1);
  const [yIsAdjusted, setYIsAdjusted] = useState(false);
  const [rawText, setRawText] = useState<any>(null);
  const sepRef = useRef("");

  // Self-healing guard for the non-significant slot. The palette picker
  // (in ColorsTile) commits `colorNs = VOLCANO_DEFAULT_COLORS.ns` every
  // time it fires — but two scenarios leave a stale non-grey value in
  // `vis.colorNs`:
  //   1. A brief Phase-2 build mapped the palette's last hex into
  //      colorNs. Users who picked a palette under that build have a
  //      non-grey value persisted in localStorage.
  //   2. Native `<select>` doesn't fire onChange when you re-pick the
  //      already-selected value, so handlePalette can't run.
  // This effect re-pins colorNs to the canonical grey on every
  // discretePalette change AND once on mount, which heals both cases on
  // the first interaction (and on first load for stale state). Manual
  // ns edits via the per-row ColorInput stay sticky during the session
  // — the dep is `vis.discretePalette`, so editing colorNs alone
  // doesn't fire this — but they are not preserved across a palette
  // change or a page reload. That matches the spec: "non-significant
  // should always be a shade of grey by default, whatever the palette
  // selected".
  useEffect(() => {
    if (vis.colorNs !== VOLCANO_DEFAULT_COLORS.ns) {
      updVis({ colorNs: VOLCANO_DEFAULT_COLORS.ns });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis.discretePalette]);

  // Manually-selected points (Set of original-row indices). Click on a
  // point in the chart to add/remove it; when this set is non-empty the
  // top-N auto-labelling is replaced with exactly these picks (so the
  // user can call out specific features regardless of class). Cleared
  // by the "Clear" button in the Labels tile, by re-uploading, or by
  // changing column roles in the Configure step (since picked indices
  // would no longer make sense against new data).
  const [manualSelection, setManualSelection] = useState<Set<number>>(() => new Set());

  // Optional aesthetic mappings — colour-by-column and size-by-column.
  // No on/off toggle: the "— None —" entry in the tile's column dropdown
  // is the off state (col === -1 disables the mapping). The column index
  // is local state (it's dataset-specific), but palette and radius bounds
  // live in `vis` so the user's style preference persists across reloads.
  const [colorMapCol, setColorMapCol] = useState<number>(-1);
  const [sizeMapCol, setSizeMapCol] = useState<number>(-1);
  const togglePointSelection = useCallback((idx: number) => {
    setManualSelection((prev: Set<number>) => {
      const next = new Set<number>(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);
  // Search-by-name path: union the matched indices into the same set as
  // click-to-label. Same Clear button covers both.
  const addToManualSelection = useCallback((indices: number[]) => {
    if (!indices || indices.length === 0) return;
    setManualSelection((prev: Set<number>) => {
      const next = new Set<number>(prev);
      for (const i of indices) next.add(i);
      return next;
    });
  }, []);
  const clearManualSelection = useCallback(() => setManualSelection(new Set()), []);

  // ── Parsing ──────────────────────────────────────────────────────────

  const doParse = useCallback(
    (text: any, sep: any) => {
      sepRef.current = sep;
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const fixed = dc.text;
      const out = parseData(fixed, sep);
      setInjectionWarning(out.injectionWarnings);
      if (out.headers.length < 2 || out.data.length === 0) {
        setParseError(
          "The file appears empty or has fewer than two columns. Volcano expects at least a log2FC and a p-value column."
        );
        return;
      }
      setParseError(null);
      setRawText(fixed);
      setParsed(out);
      // Auto-pick column roles on first load.
      const guess = autoDetectColumns(out.headers);
      setXCol(guess.xCol >= 0 ? guess.xCol : 0);
      setYCol(guess.yCol >= 0 ? guess.yCol : Math.min(1, out.headers.length - 1));
      setLabelCol(guess.labelCol);
      setYIsAdjusted(guess.yIsAdjusted);
      // Drop any prior manual selection / aesthetic mappings — their
      // column indices reference the previous dataset and would point
      // at the wrong column (or no column) on the new shape.
      setManualSelection(new Set());
      setColorMapCol(-1);
      setSizeMapCol(-1);
      setStep("configure");
    },
    [setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: any, name: any) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [doParse, setFileName, sepOverride]
  );

  const onLoadExample = useCallback(() => {
    const ex = (window as any).__VOLCANO_EXAMPLE__;
    if (!ex) return;
    setSepOverride("\t");
    setFileName("volcano_example.tsv");
    doParse(ex, "\t");
  }, [doParse, setFileName, setSepOverride]);

  const resetAll = useCallback(() => {
    setRawText(null);
    setParsed(null);
    setXCol(-1);
    setYCol(-1);
    setLabelCol(-1);
    setYIsAdjusted(false);
    setFileName("");
    setInjectionWarning(null);
    setManualSelection(new Set());
    setColorMapCol(-1);
    setSizeMapCol(-1);
    setStep("upload");
  }, [setFileName, setInjectionWarning, setStep]);

  // ── Derived points + p-floor ─────────────────────────────────────────

  const points: VolcanoPoint[] = useMemo(() => {
    if (!parsed || xCol < 0 || yCol < 0) return [];
    return buildPoints(parsed.rawData, xCol, yCol, labelCol);
  }, [parsed, xCol, yCol, labelCol]);

  const pFloor = useMemo(() => computePFloor(points), [points]);
  const clampedCount = useMemo(() => countClamped(points), [points]);
  const summary = useMemo(
    () => summarize(points, vis.fcCutoff, vis.pCutoff),
    [points, vis.fcCutoff, vis.pCutoff]
  );

  const xLabel = parsed && xCol >= 0 ? parsed.headers[xCol] : "log2(fold change)";
  const yLabel = parsed && yCol >= 0 ? "−log10(" + parsed.headers[yCol] + ")" : "−log10(p-value)";

  // Derived aesthetic mappings — null when the tile is toggled Off,
  // populated otherwise. The chart consumes `colorByIdx` / `radiusByIdx`
  // maps directly: keyed by VolcanoPoint.idx (the original parsed-row
  // index). Memoised against parsed data + the column / palette knobs
  // so dragging a slider doesn't rebuild on every render.
  const colorMap: ColorMap = useMemo(() => {
    if (!parsed || colorMapCol < 0) return null;
    // shared.js declares `const COLOR_PALETTES` / `const PALETTE` /
    // `function interpolateColor` at script-top scope — `function` and
    // `var` attach to `window` in a classic <script> tag, but `const`
    // and `let` do not. Reach for the bare ambient globals (typed in
    // types/globals.d.ts) directly; `window.COLOR_PALETTES` is `undefined`
    // here and dereferencing it crashed the colour-mapping path.
    const baseStops = COLOR_PALETTES[vis.colorMapPalette] || COLOR_PALETTES.viridis;
    const stops = vis.colorMapInvert ? [...baseStops].reverse() : baseStops;
    // Restrict the mapping to features that pass the thresholds —
    // colouring noise dilutes the legend and the visual signal. The
    // chart enforces the same rule in its `fillFor` resolver, so even
    // if a stale colorByIdx entry leaked through it would be ignored
    // for ns points; filtering here keeps the type-detection /
    // legend / colourbar range consistent with what the user sees.
    const sigIndices: number[] = [];
    for (const pt of points) {
      const cls = classifyPoint(pt.log2fc, pt.p, vis.fcCutoff, vis.pCutoff);
      if (cls !== "ns") sigIndices.push(pt.idx);
    }
    return buildColorMap({
      rawData: parsed.rawData,
      pointIndices: sigIndices,
      col: colorMapCol,
      paletteStops: stops,
      paletteName: vis.colorMapPalette,
      discretePalette: PALETTE,
      interpolate: interpolateColor,
    });
  }, [
    parsed,
    colorMapCol,
    vis.colorMapPalette,
    vis.colorMapInvert,
    vis.fcCutoff,
    vis.pCutoff,
    points,
  ]);

  const sizeMap = useMemo(() => {
    if (!parsed || sizeMapCol < 0) return null;
    return buildSizeMap(
      parsed.rawData,
      points.map((p: any) => p.idx),
      sizeMapCol,
      vis.sizeMapMinR,
      vis.sizeMapMaxR
    );
  }, [parsed, sizeMapCol, vis.sizeMapMinR, vis.sizeMapMaxR, points]);

  // Column header names for the SVG legend titles. Empty when the
  // mapping is off (no legend rendered).
  const colorMapLabel = parsed && colorMapCol >= 0 ? parsed.headers[colorMapCol] : "";
  const sizeMapLabel = parsed && sizeMapCol >= 0 ? parsed.headers[sizeMapCol] : "";

  // ── Download handlers ────────────────────────────────────────────────

  const chartRef = useRef<any>(null);

  const onDownloadCsv = () => {
    const { headers, rows } = buildVolcanoCsv({
      points,
      fcCutoff: vis.fcCutoff,
      pCutoff: vis.pCutoff,
      yIsAdjusted,
    });
    downloadCsv(headers, rows, fileBaseName(fileName, "volcano") + "_classified.csv");
  };
  const onDownloadR = () => {
    const txt = buildVolcanoRScript({
      points,
      fcCutoff: vis.fcCutoff,
      pCutoff: vis.pCutoff,
      colors: { up: vis.colorUp, down: vis.colorDown, ns: vis.colorNs },
      xLabel,
      yLabel,
      plotTitle: vis.plotTitle,
      yIsAdjusted,
    });
    downloadText(txt, fileBaseName(fileName, "volcano") + ".R");
  };

  // ── Navigation guards ────────────────────────────────────────────────

  const canNavigate = (target: string) => {
    if (target === "upload") return true;
    if (target === "configure") return !!parsed;
    if (target === "plot") return !!parsed && xCol >= 0 && yCol >= 0;
    return false;
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <PlotToolShell
      state={shell}
      toolName="volcano"
      title="Volcano Plot"
      visInit={VIS_INIT_VOLCANO}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <div>
          <UploadPanel
            sepOverride={sepOverride}
            onSepChange={(v) => {
              setSepOverride(v);
              if (rawText) doParse(rawText, v);
            }}
            onFileLoad={handleFileLoad}
            onLoadExample={onLoadExample}
            exampleLabel="Synthetic DESeq2 output (200 features, mock plant transcriptomics)"
            hint="CSV · TSV · TXT · one row per feature · expects log2FC + p-value columns · 2 MB max"
          />
          <HowTo {...VOLCANO_HOWTO} />
        </div>
      )}

      {step === "configure" && parsed && (
        <ConfigureStep
          parsed={parsed}
          fileName={fileName}
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          yIsAdjusted={yIsAdjusted}
          setXCol={setXCol}
          setYCol={setYCol}
          setLabelCol={setLabelCol}
          setYIsAdjusted={setYIsAdjusted}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          chartRef={chartRef}
          parsed={parsed}
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          points={points}
          pFloor={pFloor}
          clampedCount={clampedCount}
          summary={summary}
          xLabel={xLabel}
          yLabel={yLabel}
          vis={vis}
          updVis={updVis}
          manualSelection={manualSelection}
          togglePointSelection={togglePointSelection}
          clearManualSelection={clearManualSelection}
          addToManualSelection={addToManualSelection}
          colorMapCol={colorMapCol}
          setColorMapCol={setColorMapCol}
          colorMap={colorMap}
          colorMapLabel={colorMapLabel}
          sizeMapCol={sizeMapCol}
          setSizeMapCol={setSizeMapCol}
          sizeMap={sizeMap}
          sizeMapLabel={sizeMapLabel}
          fileName={fileName}
          onDownloadCsv={onDownloadCsv}
          onDownloadR={onDownloadR}
          onReset={resetAll}
        />
      )}
    </PlotToolShell>
  );
}

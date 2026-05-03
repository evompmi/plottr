// Volcano plot — App orchestrator. Mirrors scatter's wiring (the
// closest tool in shape) but with three-class significance colouring,
// reference lines, p-value clamping, and top-N feature labels.
//
// Phase-1 scope: upload → configure (column-roles + thresholds) →
// plot (chart + sidebar). Click-to-label is deferred per the plan.
//
// Folder layout:
//   helpers.ts  — pure logic + tests live here
//   chart.tsx   — VolcanoChart (forwardRef SVG renderer)
//   reports.ts  — buildVolcanoRScript + buildVolcanoCsv (sanitised)
//   index.tsx   — this file (App + step content + sidebar tiles)
//
// All shared scaffold (PlotToolShell, usePlotToolState, FormulaInjection
// banner, etc.) come from the tools/_shell/ + shared.bundle.js pair we
// already use in every other tool.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { PlotSidebar } from "../_shell/PlotSidebar";
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
  ColorMap,
} from "./helpers";
import { VolcanoChart } from "./chart";
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
  sizeMapMinR: 2,
  sizeMapMaxR: 9,
  colorUp: VOLCANO_DEFAULT_COLORS.up,
  colorDown: VOLCANO_DEFAULT_COLORS.down,
  colorNs: VOLCANO_DEFAULT_COLORS.ns,
  xMin: null as number | null,
  xMax: null as number | null,
  yMin: null as number | null,
  yMax: null as number | null,
  plotTitle: "",
};

// ── Helpers ────────────────────────────────────────────────────────────

// Pull the typed point list out of parsed.rawData given the current
// column picks. Pure-ish (no React); kept here rather than in helpers.ts
// because it depends on Plöttr's parseData() output shape (a 2D string
// array indexed by column index).
function buildPoints(
  rawData: string[][],
  xCol: number,
  yCol: number,
  labelCol: number
): VolcanoPoint[] {
  const out: VolcanoPoint[] = [];
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const xRaw = row[xCol];
    const yRaw = row[yCol];
    if (xRaw == null || yRaw == null || xRaw === "" || yRaw === "") continue;
    const log2fc = isNumericValue(xRaw) ? toNumericValue(xRaw) : NaN;
    const p = isNumericValue(yRaw) ? toNumericValue(yRaw) : NaN;
    const label =
      labelCol >= 0 && row[labelCol] != null && row[labelCol] !== "" ? String(row[labelCol]) : null;
    out.push({ idx: i, log2fc, p, label });
  }
  return out;
}

// ── App ────────────────────────────────────────────────────────────────

function App() {
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
  const [parsed, setParsed] = useState(null);
  const [xCol, setXCol] = useState(-1);
  const [yCol, setYCol] = useState(-1);
  const [labelCol, setLabelCol] = useState(-1);
  const [yIsAdjusted, setYIsAdjusted] = useState(false);
  const [rawText, setRawText] = useState(null);
  const sepRef = useRef("");

  // Manually-selected points (Set of original-row indices). Click on a
  // point in the chart to add/remove it; when this set is non-empty the
  // top-N auto-labelling is replaced with exactly these picks (so the
  // user can call out specific features regardless of class). Cleared
  // by the "Clear" button in the Labels tile, by re-uploading, or by
  // changing column roles in the Configure step (since picked indices
  // would no longer make sense against new data).
  const [manualSelection, setManualSelection] = useState<Set<number>>(() => new Set());

  // Optional aesthetic mappings — colour-by-column and size-by-column.
  // No on/off toggle: the "— None —" entry in the tile's column
  // dropdown is the off state (col === -1 disables the mapping). The
  // column index is local state (it's dataset-specific), but palette
  // and radius bounds live in `vis` so the user's style preference
  // persists across reloads.
  const [colorMapCol, setColorMapCol] = useState<number>(-1);
  const [sizeMapCol, setSizeMapCol] = useState<number>(-1);
  const togglePointSelection = useCallback((idx: number) => {
    setManualSelection((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);
  const clearManualSelection = useCallback(() => setManualSelection(new Set()), []);

  // ── Parsing ──────────────────────────────────────────────────────────

  const doParse = useCallback(
    (text, sep) => {
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
    (text, name) => {
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
    const stops = COLOR_PALETTES[vis.colorMapPalette] || COLOR_PALETTES.viridis;
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
  }, [parsed, colorMapCol, vis.colorMapPalette, vis.fcCutoff, vis.pCutoff, points]);

  const radiusByIdx: Map<number, number> | null = useMemo(() => {
    if (!parsed || sizeMapCol < 0) return null;
    return buildSizeMap(
      parsed.rawData,
      points.map((p) => p.idx),
      sizeMapCol,
      vis.sizeMapMinR,
      vis.sizeMapMaxR
    );
  }, [parsed, sizeMapCol, vis.sizeMapMinR, vis.sizeMapMaxR, points]);

  // ── Download handlers ────────────────────────────────────────────────

  const chartRef = useRef(null);

  const onDownloadSvg = () => {
    if (!chartRef.current) return;
    downloadSvg(chartRef.current, fileBaseName(fileName, "volcano") + ".svg");
  };
  const onDownloadPng = () => {
    if (!chartRef.current) return;
    downloadPng(chartRef.current, fileBaseName(fileName, "volcano") + ".png", 2);
  };
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
          <div
            className="dv-panel"
            style={{
              marginTop: 16,
              padding: "16px 20px",
              background: "var(--info-bg)",
              border: "1.5px solid var(--info-border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              How volcano plots work
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 }}>
              One <strong>row</strong> = one feature (gene, protein, metabolite). Plöttr expects two
              numeric columns: <strong>log2 fold change</strong> on the X-axis and a{" "}
              <strong>p-value</strong> (raw or adjusted) on the Y-axis as −log10. An optional{" "}
              <strong>label</strong> column (gene symbol, feature name) drives top-N annotations.
              Common conventions are auto-detected: DESeq2 (<code>log2FoldChange</code>,{" "}
              <code>padj</code>), limma (<code>logFC</code>, <code>adj.P.Val</code>), edgeR (
              <code>logFC</code>, <code>FDR</code>).
            </p>
          </div>
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
          colorMapCol={colorMapCol}
          setColorMapCol={setColorMapCol}
          colorMap={colorMap}
          sizeMapCol={sizeMapCol}
          setSizeMapCol={setSizeMapCol}
          radiusByIdx={radiusByIdx}
          onDownloadSvg={onDownloadSvg}
          onDownloadPng={onDownloadPng}
          onDownloadCsv={onDownloadCsv}
          onDownloadR={onDownloadR}
          onReset={resetAll}
        />
      )}
    </PlotToolShell>
  );
}

// ── Configure step ─────────────────────────────────────────────────────
//
// Same shape as boxplot's ConfigureStep — coloured `AesBox`-style cards
// for column roles, required ones on top, optional below. Reuses the
// `--aes-*` CSS vars defined in theme.css so the colour palette is
// consistent with scatter / boxplot. NO back / plot buttons: the
// StepNavBar at the top of PlotToolShell IS the navigation. The user
// clicks "Plot" in the nav to advance, and `canNavigate` gates the
// transition (it forbids "plot" until xCol and yCol are both valid).

const VOLCANO_AES_THEMES = {
  // X axis (log2 fold change) — purple "shape" theme. Mirrors boxplot's
  // group-column tile colour so the "primary positional axis" idea is
  // visually consistent across tools.
  x: {
    bg: "var(--aes-shape-bg)",
    border: "var(--aes-shape-border)",
    header: "var(--aes-shape-header)",
    headerText: "var(--aes-shape-header-text)",
    label: "X axis · log₂ fold change",
  },
  // Y axis (p-value) — green "size" theme, same as boxplot's value-
  // column tile. The "primary measurement" slot.
  y: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Y axis · p-value (−log₁₀)",
  },
  // Label column — slate "color" theme, neutral / auxiliary feel for
  // an optional role.
  label: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "Feature label (optional)",
  },
  // Sidebar aesthetic boxes — matches scatter's "Color" and "Size"
  // aesthetic cards exactly (same `--aes-*` CSS vars, same labels) so
  // the visual language carries across tools. The configure-step
  // tiles above re-use the same CSS vars in different semantic roles
  // — visually identical, but they only ever appear on different
  // steps so there's no clash.
  colorMap: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "Color",
  },
  sizeMap: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Size",
  },
} as const;

function VolcanoAesBox({
  theme,
  children,
}: {
  theme: keyof typeof VOLCANO_AES_THEMES;
  children: React.ReactNode;
}) {
  const t = VOLCANO_AES_THEMES[theme];
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
      <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
        <span
          style={{
            color: t.headerText,
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          {t.label}
        </span>
      </div>
      <div style={{ padding: "12px 14px", minHeight: 40 }}>{children}</div>
    </div>
  );
}

function ConfigureStep({
  parsed,
  fileName,
  xCol,
  yCol,
  labelCol,
  yIsAdjusted,
  setXCol,
  setYCol,
  setLabelCol,
  setYIsAdjusted,
}) {
  const xValid = xCol >= 0;
  const yValid = yCol >= 0;
  return (
    <div>
      {/* Required roles — two coloured tiles on top, side-by-side on
          wide layouts, stacked on narrow. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <VolcanoAesBox theme="x">
          <select
            className="dv-select"
            style={{ width: "100%" }}
            value={xValid ? xCol : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return;
              setXCol(Number(raw));
            }}
          >
            {!xValid && <option value="">— choose a log₂FC column —</option>}
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            Numeric column with the log₂ fold change for each feature. DESeq2:{" "}
            <code>log2FoldChange</code>; limma / edgeR: <code>logFC</code>.
          </div>
        </VolcanoAesBox>
        <VolcanoAesBox theme="y">
          <select
            className="dv-select"
            style={{ width: "100%" }}
            value={yValid ? yCol : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return;
              setYCol(Number(raw));
            }}
          >
            {!yValid && <option value="">— choose a p-value column —</option>}
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              fontSize: 11,
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={yIsAdjusted}
              onChange={(e) => setYIsAdjusted(e.target.checked)}
            />
            This column is an <strong>adjusted</strong> p-value (FDR / BH / qvalue)
          </label>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            Plotted as −log₁₀(p). Auto-detect prefers an adjusted column when both raw and adjusted
            are present.
          </div>
        </VolcanoAesBox>
      </div>

      {/* Optional role — single tile, full width, after the required pair. */}
      <div style={{ marginBottom: 12 }}>
        <VolcanoAesBox theme="label">
          <select
            className="dv-select"
            style={{ width: "100%" }}
            value={labelCol}
            onChange={(e) => setLabelCol(parseInt(e.target.value))}
          >
            <option value={-1}>— none —</option>
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            Categorical column used to annotate the top-N most-significant features (gene symbol,
            protein name, accession). Skip if your data has no such column.
          </div>
        </VolcanoAesBox>
      </div>

      {/* Warning banner when required roles aren't assigned. The stepper
          itself blocks navigation to "plot" via canNavigate, but the
          banner gives the user a visible reason for it. */}
      {(!xValid || !yValid) && (
        <div
          className="dv-panel"
          style={{
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)", margin: 0 }}>
            Assign both a <strong>log₂FC column</strong> and a <strong>p-value column</strong> to
            unlock the Plot step in the navigation above.
          </p>
        </div>
      )}

      {/* Data preview at the bottom — same shape as boxplot's. */}
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName || "(pasted data)"}</strong> —{" "}
          {parsed.headers.length} cols × {parsed.rawData.length} rows
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsed.headers} rows={parsed.rawData} maxRows={8} />
      </div>
    </div>
  );
}

// ── Plot step ──────────────────────────────────────────────────────────

function PlotStep({
  chartRef,
  parsed,
  xCol,
  yCol,
  labelCol,
  points,
  pFloor,
  clampedCount,
  summary,
  xLabel,
  yLabel,
  vis,
  updVis,
  manualSelection,
  togglePointSelection,
  clearManualSelection,
  colorMapCol,
  setColorMapCol,
  colorMap,
  sizeMapCol,
  setSizeMapCol,
  radiusByIdx,
  onDownloadSvg,
  onDownloadPng,
  onDownloadCsv,
  onDownloadR,
  onReset,
}) {
  // Canonical plot-step layout (matches scatter / lineplot):
  //   1. Outer flex row, sidebar on the LEFT, chart pane on the right.
  //   2. PlotSidebar contains ActionsPanel ON TOP, then collapsible/control
  //      tiles below.
  //   3. ActionsPanel auto-emits ⬇ SVG and ⬇ PNG buttons; CSV and R go in
  //      `extraDownloads` so they sit alongside SVG / PNG in the same row.
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <PlotSidebar>
        <ActionsPanel
          onDownloadSvg={onDownloadSvg}
          onDownloadPng={onDownloadPng}
          onReset={onReset}
          extraDownloads={[
            {
              label: "CSV",
              title:
                "Download the per-feature classification table — feature, log2FC, p, −log10(p), class",
              onClick: onDownloadCsv,
            },
            {
              label: "R",
              title:
                "Download a self-contained ggplot2 R script that reproduces this volcano from the underlying data",
              onClick: onDownloadR,
            },
          ]}
        />
        <ThresholdsTile vis={vis} updVis={updVis} />
        <ColorsTile vis={vis} updVis={updVis} />
        <ColorMapTile
          parsed={parsed}
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          col={colorMapCol}
          setCol={setColorMapCol}
          colorMap={colorMap}
          vis={vis}
          updVis={updVis}
        />
        <SizeMapTile
          parsed={parsed}
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          col={sizeMapCol}
          setCol={setSizeMapCol}
          vis={vis}
          updVis={updVis}
        />
        <LabelsTile
          vis={vis}
          updVis={updVis}
          manualSelection={manualSelection}
          clearManualSelection={clearManualSelection}
        />
        <StyleTile vis={vis} updVis={updVis} />
      </PlotSidebar>

      <div
        style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}
      >
        {clampedCount > 0 && (
          <div
            role="status"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--warning-bg)",
              border: "1px solid var(--warning-border)",
              fontSize: 11,
              color: "var(--warning-text)",
            }}
          >
            ⚠️ {clampedCount} feature{clampedCount === 1 ? "" : "s"} had p = 0; clamped to a finite
            floor for display so the y-axis stays bounded.
          </div>
        )}
        <div
          style={{
            background: "var(--plot-card-bg)",
            border: "1.5px solid var(--plot-card-border)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <VolcanoChart
            ref={chartRef}
            points={points}
            pFloor={pFloor}
            fcCutoff={vis.fcCutoff}
            pCutoff={vis.pCutoff}
            xMin={vis.xMin}
            xMax={vis.xMax}
            yMin={vis.yMin}
            yMax={vis.yMax}
            xLabel={xLabel}
            yLabel={yLabel}
            title={vis.plotTitle}
            subtitle=""
            colors={{ up: vis.colorUp, down: vis.colorDown, ns: vis.colorNs }}
            pointRadius={vis.pointRadius}
            pointAlpha={vis.pointAlpha}
            showRefLines={vis.showRefLines}
            showLabels={vis.showLabels}
            topNUp={vis.topNUp}
            topNDown={vis.topNDown}
            labelFontSize={vis.labelFontSize}
            showAxes={vis.showAxes}
            manualSelection={manualSelection}
            onPointClick={togglePointSelection}
            colorByIdx={colorMap ? colorMap.colorByIdx : null}
            radiusByIdx={radiusByIdx}
            plotBg="#ffffff"
          />
        </div>
        <SummaryTile summary={summary} fcCutoff={vis.fcCutoff} pCutoff={vis.pCutoff} />
      </div>
    </div>
  );
}

// ── Sidebar tiles ──────────────────────────────────────────────────────
//
// Collapsible disclosure panel — same shape as scatter / lineplot /
// upset's ControlSection so the visual language stays consistent across
// every plot tool. Clicking the header toggles the body; the disclosure
// chevron flips via `dv-disclosure-open` (CSS rotation in
// components.css). After expand, scrollDisclosureIntoView ensures the
// newly-opened body lands inside the sticky sidebar's scroll viewport.

function ControlSection({
  title,
  defaultOpen = false,
  headerRight,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  // Optional slot for an inline control rendered to the right of the
  // section title — typically the on/off pill toggle for the section
  // (matches aequorin's "Summary barplot" pattern). Survives folds.
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ marginBottom: 0, padding: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "7px 10px",
          gap: 8,
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="dv-tile-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
            aria-hidden="true"
          />
          {title}
        </button>
        {headerRight}
      </div>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Canonical on/off selector — the `dv-seg` segmented pill-bar declared
// in components.css. Same widget power and molarity use for two-state
// pickers (mode / alpha / tails / separator). A row of buttons where
// the active one carries `dv-seg-btn-active`; one source of truth means
// a future tweak propagates to every tool without per-tile drift. Label
// sits above the pill-bar in `dv-label` typography for consistency
// with how power.tsx introduces each segmented control.
function ToggleRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="dv-label">{children}</span>
      <div className="dv-seg">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={"dv-seg-btn" + (checked ? " dv-seg-btn-active" : "")}
          style={{ fontSize: 12 }}
        >
          On
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={"dv-seg-btn" + (!checked ? " dv-seg-btn-active" : "")}
          style={{ fontSize: 12 }}
        >
          Off
        </button>
      </div>
    </div>
  );
}

function ThresholdsTile({ vis, updVis }) {
  // |log2FC| cutoff: numeric stepper (−/+ buttons + free-form entry).
  // p-value cutoff: discrete select with the conventional values
  // researchers actually use ({0.05, 0.01, 0.001}) plus "None" — the
  // sentinel for "no p threshold" is a stored cutoff of 1, which is
  // strictly greater than any real p-value, so `classifyPoint`'s
  // `p < pCutoff` test admits every point on the p axis. 1 also
  // round-trips through localStorage cleanly (Infinity / NaN don't).
  const onFcChange = (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    updVis({ fcCutoff: Math.max(0, Math.min(10, v)) });
  };
  const P_OPTIONS = [
    { value: 1, label: "None" },
    { value: 0.05, label: "0.05" },
    { value: 0.01, label: "0.01" },
    { value: 0.001, label: "0.001" },
  ];
  // Snap the persisted vis value to the closest option in the picker
  // (handles legacy values from before this control existed).
  const pPickValue = P_OPTIONS.find((o) => Math.abs(o.value - vis.pCutoff) < 1e-12)?.value ?? 0.05;
  return (
    <ControlSection title="Thresholds" defaultOpen>
      <label style={{ display: "block" }}>
        <span className="dv-label">|log2FC| cutoff</span>
        <NumberInput
          value={vis.fcCutoff}
          min={0}
          max={10}
          step={0.1}
          onChange={onFcChange}
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "block" }}>
        <span className="dv-label">p-value cutoff</span>
        {/* Same `dv-seg` segmented pill-bar power and molarity use for
            their alpha / tails / mode pickers — one canonical
            exclusive-selector look across the whole tool. Every option
            is a real value (1 = "no p threshold"); the active one
            carries `.dv-seg-btn-active`. */}
        <div className="dv-seg">
          {P_OPTIONS.map((o) => {
            const active = pPickValue === o.value;
            return (
              <button
                key={o.value}
                type="button"
                className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
                style={{ fontSize: 12 }}
                onClick={() => updVis({ pCutoff: o.value })}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </label>
      <ToggleRow checked={vis.showRefLines} onChange={(v) => updVis({ showRefLines: v })}>
        Show reference lines
      </ToggleRow>
    </ControlSection>
  );
}

function ColorsTile({ vis, updVis }) {
  return (
    <ControlSection title="Colours">
      <ColorRow label="Up-regulated" value={vis.colorUp} onChange={(v) => updVis({ colorUp: v })} />
      <ColorRow
        label="Down-regulated"
        value={vis.colorDown}
        onChange={(v) => updVis({ colorDown: v })}
      />
      <ColorRow
        label="Not significant"
        value={vis.colorNs}
        onChange={(v) => updVis({ colorNs: v })}
      />
    </ControlSection>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
      <ColorInput value={value} onChange={onChange} size={20} />
    </div>
  );
}

function LabelsTile({ vis, updVis, manualSelection, clearManualSelection }) {
  const manualCount = manualSelection ? manualSelection.size : 0;
  const hasManual = manualCount > 0;
  return (
    <ControlSection title="Labels" defaultOpen={hasManual}>
      <ToggleRow checked={vis.showLabels} onChange={(v) => updVis({ showLabels: v })}>
        Annotate top features
      </ToggleRow>
      {/* Manual-selection mode — when the user has clicked one or more
          points, we hide the auto-pick sliders (they're moot, the user
          is in charge) and surface a Clear button to drop back to
          auto. Mirrors heatmap's selection-clear pattern. */}
      {hasManual ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 6,
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--info-text)" }}>
            {manualCount} point{manualCount === 1 ? "" : "s"} clicked
          </span>
          <button
            onClick={clearManualSelection}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "4px 10px", fontSize: 11 }}
            title="Clear the manual selection — labelling falls back to the auto top-N picks"
          >
            Clear
          </button>
        </div>
      ) : (
        <span style={{ fontSize: 10, color: "var(--text-faint)", fontStyle: "italic" }}>
          ↳ Click any point on the chart to label it directly
        </span>
      )}
      <SliderControl
        label="Top up-regulated"
        value={vis.topNUp}
        displayValue={String(vis.topNUp)}
        min={0}
        max={50}
        step={1}
        onChange={(v) => updVis({ topNUp: Number(v) })}
      />
      <SliderControl
        label="Top down-regulated"
        value={vis.topNDown}
        displayValue={String(vis.topNDown)}
        min={0}
        max={50}
        step={1}
        onChange={(v) => updVis({ topNDown: Number(v) })}
      />
      <SliderControl
        label="Font size"
        value={vis.labelFontSize}
        displayValue={String(vis.labelFontSize)}
        min={8}
        max={16}
        step={1}
        onChange={(v) => updVis({ labelFontSize: Number(v) })}
      />
    </ControlSection>
  );
}

function StyleTile({ vis, updVis }) {
  return (
    <ControlSection title="Style">
      <SliderControl
        label="Point radius"
        value={vis.pointRadius}
        displayValue={vis.pointRadius.toFixed(1)}
        min={1}
        max={8}
        step={0.5}
        onChange={(v) => updVis({ pointRadius: Number(v) })}
      />
      <SliderControl
        label="Point alpha"
        value={vis.pointAlpha}
        displayValue={vis.pointAlpha.toFixed(2)}
        min={0.1}
        max={1}
        step={0.05}
        onChange={(v) => updVis({ pointAlpha: Number(v) })}
      />
      <ToggleRow checked={vis.showAxes} onChange={(v) => updVis({ showAxes: v })}>
        Show grid
      </ToggleRow>
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
          color: "var(--text)",
        }}
      >
        Plot title
        <input
          type="text"
          className="dv-input"
          value={vis.plotTitle}
          onChange={(e) => updVis({ plotTitle: e.target.value })}
          placeholder="(optional)"
        />
      </label>
    </ControlSection>
  );
}

// ── Aesthetic-mapping tiles ────────────────────────────────────────────
//
// Both tiles ride the aequorin "Summary barplot" pattern: an On / Off
// pill in the section header gates whether the mapping is live, and
// the section body only renders when On (so the controls don't clutter
// the sidebar in the default case).

function eligibleColumns(parsed, xCol, yCol, labelCol) {
  // Aesthetic mappings can use any column NOT already bound to a
  // primary role. The label column is allowed (a user might want to
  // colour by gene name AND show those names — fine, the chart will
  // just colour each labelled point with its discrete colour).
  const used = new Set<number>([xCol, yCol]);
  return (parsed?.headers || []).map((h, i) => ({ h, i })).filter(({ i }) => !used.has(i));
  void labelCol;
}

// Aesthetic boxes (Color / Size). Same flat-coloured `AesBox` shape
// scatter uses for its colour / size / shape pickers — always visible,
// no on/off toggle. The "— None —" entry in the column dropdown is
// the off state: when col === -1, the App's useMemo returns a null
// mapping and the chart falls back to the class palette / uniform
// radius. Themes (`color` slate, `size` green) match scatter so the
// visual language carries across tools.

function ColorMapTile({ parsed, xCol, yCol, labelCol, col, setCol, colorMap, vis, updVis }) {
  const candidates = eligibleColumns(parsed, xCol, yCol, labelCol);
  // Bare-global access — see the comment in App's colorMap useMemo for
  // why we don't go through `window`.
  const paletteNames = Object.keys(COLOR_PALETTES);
  return (
    <VolcanoAesBox theme="colorMap">
      <select
        className="dv-select"
        value={col === -1 ? "" : col}
        onChange={(e) => setCol(e.target.value === "" ? -1 : parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: colorMap ? 8 : 0 }}
      >
        <option value="">— None —</option>
        {candidates.map(({ h, i }) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
      {colorMap && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
            Detected:{" "}
            <strong style={{ color: colorMap.type === "continuous" ? "#7c3aed" : "#0369a1" }}>
              {colorMap.type === "continuous"
                ? "numeric (continuous)"
                : `categorical (${colorMap.legend.length} groups)`}
            </strong>
          </div>
          {colorMap.type === "continuous" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <select
                className="dv-select"
                value={vis.colorMapPalette}
                onChange={(e) => updVis({ colorMapPalette: e.target.value })}
                style={{ width: "100%", fontSize: 11 }}
              >
                {paletteNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                range: {colorMap.vmin.toPrecision(3)} → {colorMap.vmax.toPrecision(3)}
              </span>
            </div>
          )}
          {colorMap.type === "discrete" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 160,
                overflowY: "auto",
              }}
            >
              {colorMap.legend.map((entry) => (
                <div
                  key={entry.value}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: entry.color,
                      border: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </VolcanoAesBox>
  );
}

function SizeMapTile({ parsed, xCol, yCol, labelCol, col, setCol, vis, updVis }) {
  const candidates = eligibleColumns(parsed, xCol, yCol, labelCol);
  const active = col >= 0;
  return (
    <VolcanoAesBox theme="sizeMap">
      <select
        className="dv-select"
        value={col === -1 ? "" : col}
        onChange={(e) => setCol(e.target.value === "" ? -1 : parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: active ? 8 : 0 }}
      >
        <option value="">— None —</option>
        {candidates.map(({ h, i }) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
      {active && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SliderControl
            label="Min radius"
            value={vis.sizeMapMinR}
            displayValue={vis.sizeMapMinR.toFixed(1)}
            min={1}
            max={vis.sizeMapMaxR - 0.5}
            step={0.5}
            onChange={(v) => updVis({ sizeMapMinR: Number(v) })}
          />
          <SliderControl
            label="Max radius"
            value={vis.sizeMapMaxR}
            displayValue={vis.sizeMapMaxR.toFixed(1)}
            min={vis.sizeMapMinR + 0.5}
            max={20}
            step={0.5}
            onChange={(v) => updVis({ sizeMapMaxR: Number(v) })}
          />
          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
            Non-numeric / blank cells fall back to the default radius from the Style tile.
          </span>
        </div>
      )}
    </VolcanoAesBox>
  );
}

function SummaryTile({ summary, fcCutoff, pCutoff }) {
  return (
    <div
      className="dv-panel"
      style={{ padding: "10px 14px", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}
    >
      <span>
        <strong style={{ color: VOLCANO_DEFAULT_COLORS.up }}>↑ up</strong>: {summary.up}
      </span>
      <span>
        <strong style={{ color: VOLCANO_DEFAULT_COLORS.down }}>↓ down</strong>: {summary.down}
      </span>
      <span>
        <strong style={{ color: VOLCANO_DEFAULT_COLORS.ns }}>· ns</strong>: {summary.ns}
      </span>
      <span style={{ color: "var(--text-muted)" }}>
        of {summary.total} valid
        {summary.discarded > 0 ? ` (+${summary.discarded} discarded)` : ""}
      </span>
      <span style={{ color: "var(--text-faint)" }}>
        |log2FC| &gt; {fcCutoff} · p &lt; {pCutoff}
      </span>
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);

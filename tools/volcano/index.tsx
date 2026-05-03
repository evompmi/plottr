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
} from "./helpers";
import { VolcanoChart } from "./chart";
import { buildVolcanoRScript, buildVolcanoCsv } from "./reports";

const { useState, useEffect, useMemo, useCallback, useRef } = React;

// Initial visualisation state — persisted via auto-prefs.
const VIS_INIT_VOLCANO = {
  fcCutoff: 1,
  pCutoff: 0.05,
  topN: 10,
  showLabels: true,
  showRefLines: true,
  showAxes: true,
  pointRadius: 3,
  pointAlpha: 0.7,
  labelFontSize: 11,
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
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          yIsAdjusted={yIsAdjusted}
          setXCol={setXCol}
          setYCol={setYCol}
          setLabelCol={setLabelCol}
          setYIsAdjusted={setYIsAdjusted}
          onPlot={() => setStep("plot")}
          onBack={() => setStep("upload")}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          chartRef={chartRef}
          points={points}
          pFloor={pFloor}
          clampedCount={clampedCount}
          summary={summary}
          xLabel={xLabel}
          yLabel={yLabel}
          vis={vis}
          updVis={updVis}
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

function ConfigureStep({
  parsed,
  xCol,
  yCol,
  labelCol,
  yIsAdjusted,
  setXCol,
  setYCol,
  setLabelCol,
  setYIsAdjusted,
  onPlot,
  onBack,
}) {
  return (
    <div className="dv-panel" style={{ padding: "20px 24px" }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-muted)",
          marginBottom: 16,
        }}
      >
        Column roles
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            X axis: <strong>log2 fold change</strong>
          </span>
          <select
            value={xCol}
            onChange={(e) => setXCol(parseInt(e.target.value))}
            className="dv-select"
          >
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Y axis: <strong>p-value</strong> (rendered as −log10)
          </span>
          <select
            value={yCol}
            onChange={(e) => setYCol(parseInt(e.target.value))}
            className="dv-select"
          >
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Label column (optional)</span>
          <select
            value={labelCol}
            onChange={(e) => setLabelCol(parseInt(e.target.value))}
            className="dv-select"
          >
            <option value={-1}>— none —</option>
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--text-muted)",
            paddingBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={yIsAdjusted}
            onChange={(e) => setYIsAdjusted(e.target.checked)}
          />
          Y-axis column is an <strong>adjusted</strong> p-value (FDR / BH / qvalue)
        </label>
      </div>
      <div style={{ marginTop: 22, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onBack} className="dv-btn dv-btn-secondary">
          ← Back
        </button>
        <button onClick={onPlot} className="dv-btn dv-btn-primary" disabled={xCol < 0 || yCol < 0}>
          Plot →
        </button>
      </div>
      <DataPreview
        headers={parsed.headers}
        rows={parsed.rawData.slice(0, 8)}
        title="First 8 rows"
      />
    </div>
  );
}

// ── Plot step ──────────────────────────────────────────────────────────

function PlotStep({
  chartRef,
  points,
  pFloor,
  clampedCount,
  summary,
  xLabel,
  yLabel,
  vis,
  updVis,
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
        <LabelsTile vis={vis} updVis={updVis} />
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
            topN={vis.topN}
            labelFontSize={vis.labelFontSize}
            showAxes={vis.showAxes}
            plotBg="#ffffff"
          />
        </div>
        <SummaryTile summary={summary} fcCutoff={vis.fcCutoff} pCutoff={vis.pCutoff} />
      </div>
    </div>
  );
}

// ── Sidebar tiles ──────────────────────────────────────────────────────

function tileTitleStyle(): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontFamily: "inherit",
    marginBottom: 8,
  };
}

function ThresholdsTile({ vis, updVis }) {
  return (
    <div className="dv-panel" style={{ padding: 12 }}>
      <div style={tileTitleStyle()}>Thresholds</div>
      <SliderControl
        label="|log2FC| cutoff"
        value={vis.fcCutoff}
        displayValue={vis.fcCutoff.toFixed(2)}
        min={0}
        max={5}
        step={0.1}
        onChange={(v) => updVis({ fcCutoff: Number(v) })}
      />
      <SliderControl
        label="p-value cutoff"
        value={vis.pCutoff}
        displayValue={vis.pCutoff < 0.001 ? vis.pCutoff.toExponential(1) : vis.pCutoff.toFixed(3)}
        min={0.0001}
        max={0.5}
        step={0.0001}
        onChange={(v) => updVis({ pCutoff: Number(v) })}
      />
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 8,
        }}
      >
        <input
          type="checkbox"
          checked={vis.showRefLines}
          onChange={(e) => updVis({ showRefLines: e.target.checked })}
        />
        Show reference lines
      </label>
    </div>
  );
}

function ColorsTile({ vis, updVis }) {
  return (
    <div className="dv-panel" style={{ padding: 12 }}>
      <div style={tileTitleStyle()}>Colours</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <ColorRow
          label="Up-regulated"
          value={vis.colorUp}
          onChange={(v) => updVis({ colorUp: v })}
        />
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
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text)" }}>{label}</span>
      <ColorInput value={value} onChange={onChange} size={20} />
    </div>
  );
}

function LabelsTile({ vis, updVis }) {
  return (
    <div className="dv-panel" style={{ padding: 12 }}>
      <div style={tileTitleStyle()}>Labels</div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <input
          type="checkbox"
          checked={vis.showLabels}
          onChange={(e) => updVis({ showLabels: e.target.checked })}
        />
        Annotate top features
      </label>
      <SliderControl
        label="Top N"
        value={vis.topN}
        displayValue={String(vis.topN)}
        min={0}
        max={50}
        step={1}
        onChange={(v) => updVis({ topN: Number(v) })}
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
    </div>
  );
}

function StyleTile({ vis, updVis }) {
  return (
    <div className="dv-panel" style={{ padding: 12 }}>
      <div style={tileTitleStyle()}>Style</div>
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
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 6,
        }}
      >
        <input
          type="checkbox"
          checked={vis.showAxes}
          onChange={(e) => updVis({ showAxes: e.target.checked })}
        />
        Show grid
      </label>
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          marginTop: 8,
          fontSize: 11,
          color: "var(--text-muted)",
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
    </div>
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

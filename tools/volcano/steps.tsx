// Step components for the Volcano tool (ConfigureStep, PlotStep).
// Stateless presentational wrappers — all state lives in App via
// usePlotToolState or local hooks there. Shared UI (DataPreview,
// downloadCsv, fileBaseName, …) resolves through shared.bundle.js.
// AesBox / sidebar tiles come from ./controls.tsx; the SVG renderer
// comes from ./chart.tsx.

import {
  ChartDataTable,
  DataPreview,
  DetectedSeparatorBadge,
  DownloadTiles,
  PlotSidebar,
} from "../_shell";
import type { ChartDataTableRow } from "../_shell";
import { classifyPoint } from "./helpers";
import {
  VolcanoAesBox,
  ThresholdsTile,
  ColorsTile,
  ColorMapTile,
  SizeMapTile,
  LabelsTile,
  StyleTile,
  SummaryTile,
} from "./controls";
import type { ConfigureStepProps, PlotStepProps } from "./helpers";
import { VolcanoChart } from "./chart";
import { useT } from "./i18n";

const { useMemo } = React;

// Cap the accessible points table so a transcriptomics-scale input doesn't
// render tens of thousands of <tr> rows; the chart itself is unaffected.
const TABLE_MAX_ROWS = 2000;

import { fileBaseName } from "../_core/download";
// ── Configure step ─────────────────────────────────────────────────────
//
// Same shape as boxplot's ConfigureStep — coloured `AesBox`-style cards
// for column roles, required ones on top, optional below. Reuses the
// `--aes-*` CSS vars defined in theme.css so the colour palette is
// consistent with scatter / boxplot. NO back / plot buttons: the
// StepNavBar at the top of PlotToolShell IS the navigation. The user
// clicks "Plot" in the nav to advance, and `canNavigate` gates the
// transition (it forbids "plot" until xCol and yCol are both valid).
export function ConfigureStep({
  parsed,
  fileName,
  detectedSep,
  xCol,
  yCol,
  labelCol,
  yIsAdjusted,
  setXCol,
  setYCol,
  setLabelCol,
  setYIsAdjusted,
}: ConfigureStepProps) {
  const tr = useT();
  const xValid = xCol >= 0;
  const yValid = yCol >= 0;
  return (
    <div>
      {/* Three selection tiles on the same row — log₂FC, p-value, and
          the optional label column. Stack on narrow layouts. */}
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
              style={{ accentColor: "var(--cta-primary-bg)", margin: 0, flexShrink: 0 }}
            />
            <span dangerouslySetInnerHTML={{ __html: tr("volcano.cfg.adjusted") }} />
          </label>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("volcano.cfg.adjustedNote")}
          </div>
        </VolcanoAesBox>
        <VolcanoAesBox theme="label">
          <select
            className="dv-select"
            style={{ width: "100%" }}
            value={labelCol}
            onChange={(e) => setLabelCol(parseInt(e.target.value))}
          >
            <option value={-1}>{tr("volcano.cfg.labelNone")}</option>
            {parsed.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("volcano.cfg.labelNote")}
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
          <p
            style={{ fontSize: 12, color: "var(--warning-text)", margin: 0 }}
            dangerouslySetInnerHTML={{ __html: tr("volcano.cfg.assignWarn") }}
          />
        </div>
      )}

      {/* Data preview at the bottom — same shape as boxplot's. */}
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>
            {fileName || tr("volcano.cfg.pastedData")}
          </strong>
          {tr("volcano.cfg.colsRows", {
            cols: parsed.headers.length,
            rows: parsed.rawData.length,
          })}
          <DetectedSeparatorBadge sep={detectedSep} />
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          {tr("volcano.cfg.preview")}
        </p>
        <DataPreview headers={parsed.headers} rows={parsed.rawData} maxRows={8} />
      </div>
    </div>
  );
}

// ── Plot step ──────────────────────────────────────────────────────────
//
// Canonical plot-step layout (matches scatter / lineplot):
//   1. Outer flex row, sidebar on the LEFT, chart pane on the right.
//   2. PlotSidebar contains DownloadTiles ON TOP, then the control tiles.
//   3. DownloadTiles auto-emits ⬇ SVG and ⬇ PNG buttons; CSV and R go in
//      `extraDownloads` so they sit alongside SVG / PNG in the same row.
export function PlotStep({
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
  addToManualSelection,
  colorMapCol,
  setColorMapCol,
  colorMap,
  colorMapLabel,
  sizeMapCol,
  setSizeMapCol,
  sizeMap,
  sizeMapLabel,
  fileName,
  onDownloadCsv,
  onDownloadR,
  onReset,
  labelDensity,
  onLabelLayoutInfo,
}: PlotStepProps) {
  const tr = useT();

  // Accessible data-table rows: every point's label, log₂FC, p, and computed
  // significance class — so keyboard / screen-reader users get the values the
  // (often rasterised) point cloud can't expose. Capped to TABLE_MAX_ROWS.
  const tableRows = useMemo<ChartDataTableRow[]>(() => {
    const classLabel = (cls: string): string =>
      cls === "up"
        ? tr("volcano.class.up")
        : cls === "down"
          ? tr("volcano.class.down")
          : tr("volcano.class.ns");
    const shown = Math.min(points.length, TABLE_MAX_ROWS);
    const out: ChartDataTableRow[] = [];
    for (let i = 0; i < shown; i++) {
      const pt = points[i];
      const cls = classifyPoint(pt.log2fc, pt.p, vis.fcCutoff, vis.pCutoff);
      out.push({
        header: pt.label || tr("volcano.table.noLabel"),
        cells: [
          Number.isFinite(pt.log2fc) ? pt.log2fc.toFixed(3) : "",
          pt.p === 0 ? "0" : pt.p.toExponential(2),
          classLabel(cls),
        ],
      });
    }
    return out;
  }, [points, vis.fcCutoff, vis.pCutoff, tr]);
  const tableTruncated = points.length > TABLE_MAX_ROWS;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <PlotSidebar>
        <DownloadTiles
          chartRef={chartRef}
          fileStem={fileBaseName(fileName, "volcano")}
          onReset={onReset}
          extraDownloads={[
            {
              label: tr("volcano.dl.csv"),
              title: tr("volcano.dl.csvTitle"),
              onClick: onDownloadCsv,
            },
            {
              label: tr("volcano.dl.r"),
              title: tr("volcano.dl.rTitle"),
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
          points={points}
          labelCol={labelCol}
          addToManualSelection={addToManualSelection}
          labelDensity={labelDensity}
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
            ⚠️ {tr("volcano.steps.clamped", { count: clampedCount })}
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
            tickFontSize={vis.tickFontSize}
            manualSelection={manualSelection}
            onPointClick={togglePointSelection}
            colorMap={colorMap}
            colorMapLabel={colorMapLabel}
            sizeMap={sizeMap}
            sizeMapLabel={sizeMapLabel}
            plotWidth={vis.plotWidth}
            plotBg="#ffffff"
            onLabelLayoutInfo={onLabelLayoutInfo}
          />
        </div>
        <SummaryTile summary={summary} fcCutoff={vis.fcCutoff} pCutoff={vis.pCutoff} />
        <ChartDataTable
          summaryLabel={tr("volcano.table.summary")}
          caption={tr("volcano.table.caption", { n: points.length })}
          columnHeaders={[
            tr("volcano.table.colLabel"),
            tr("volcano.table.colFc"),
            tr("volcano.table.colP"),
            tr("volcano.table.colClass"),
          ]}
          rows={tableRows}
          note={
            tableTruncated
              ? tr("volcano.table.truncated", { shown: TABLE_MAX_ROWS, total: points.length })
              : null
          }
        />
      </div>
    </div>
  );
}

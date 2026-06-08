// Sidebar controls for the Heatmap tool — ActionsPanel (reset + CSV + R
// script downloads) followed by the Normalisation / Clustering / Colour
// scale / Cell borders / Labels collapsible sections. Everything is dumb
// UI: callbacks are handed down from App. The PaletteStrip preview is
// imported from ./chart so the sidebar's palette picker and the
// heatmap's colourbar stay visually in sync.

import { ActionsPanel, ColorInput, ControlSection, NumberInput, PlotSidebar } from "../_shell";
import { PaletteStrip } from "./chart";
import { buildHeatmapRScript, buildCsvExport } from "./reports";
import type { ClusterMode, ClusterModeControlProps, PlotControlsProps } from "./helpers";

import { COLOR_PALETTES, DIVERGING_PALETTES } from "../_core/color";
import { downloadCsv, downloadText, fileBaseName } from "../_core/download";
import { useT } from "./i18n";

export function ClusterModeControl({ label, mode, setMode, k, setK }: ClusterModeControlProps) {
  const tr = useT();
  const OPTIONS: Array<{ k: ClusterMode; label: string }> = [
    { k: "none", label: tr("heatmap.cluster.none") },
    { k: "hierarchical", label: tr("heatmap.cluster.hier") },
    { k: "kmeans", label: tr("heatmap.cluster.kmeans") },
  ];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div className="dv-seg" role="group" aria-label={tr("heatmap.cluster.modeAria", { label })}>
        {OPTIONS.map((o) => (
          <button
            key={o.k}
            type="button"
            aria-pressed={mode === o.k}
            className={"dv-seg-btn" + (mode === o.k ? " dv-seg-btn-active" : "")}
            onClick={() => setMode(o.k)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === "kmeans" && (
        <div style={{ fontSize: 11, marginTop: 6 }}>
          <div style={{ marginBottom: 2 }}>{tr("heatmap.cluster.k")}</div>
          <NumberInput
            value={k}
            step="1"
            min="2"
            max="20"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setK(Math.max(2, Math.min(20, Number.isFinite(v) ? v : 3)));
            }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

export function PlotControls({
  vis,
  updVis,
  cellBorder,
  updCellBorder,
  matrixRef,
  rawMatrix,
  resetAll,
  fileName,
  normalization,
  setNormalization,
  rowMode,
  setRowMode,
  colMode,
  setColMode,
  rowK,
  setRowK,
  colK,
  setColK,
  kmeansSeed,
  setKmeansSeed,
  distanceMetric,
  setDistanceMetric,
  linkageMethod,
  setLinkageMethod,
  autoVRange,
}: PlotControlsProps) {
  const tr = useT();
  const paletteKeys = Object.keys(COLOR_PALETTES);
  const anyHier = rowMode === "hierarchical" || colMode === "hierarchical";
  const anyKmeans = rowMode === "kmeans" || colMode === "kmeans";
  const baseName = fileBaseName(fileName, "heatmap");
  const NORM_OPTIONS: Array<{ k: "none" | "zrow" | "zcol" | "log2"; label: string }> = [
    { k: "none", label: tr("heatmap.norm.none") },
    { k: "zrow", label: tr("heatmap.norm.zrow") },
    { k: "zcol", label: tr("heatmap.norm.zcol") },
    { k: "log2", label: tr("heatmap.norm.log2") },
  ];
  const DIST_OPTIONS: Array<{ k: "euclidean" | "manhattan" | "correlation"; label: string }> = [
    { k: "euclidean", label: tr("heatmap.dist.euclidean") },
    { k: "manhattan", label: tr("heatmap.dist.manhattan") },
    { k: "correlation", label: tr("heatmap.dist.correlation") },
  ];
  const LINK_OPTIONS: Array<{ k: "average" | "complete" | "single"; label: string }> = [
    { k: "average", label: tr("heatmap.link.average") },
    { k: "complete", label: tr("heatmap.link.complete") },
    { k: "single", label: tr("heatmap.link.single") },
  ];
  return (
    <PlotSidebar sticky={false} width={280}>
      <ActionsPanel
        onReset={resetAll}
        extraDownloads={[
          {
            label: tr("heatmap.dl.csv"),
            title: tr("heatmap.dl.csvTitle"),
            onClick: () => {
              if (!matrixRef.current) return;
              const { headers, rows } = buildCsvExport(matrixRef.current);
              downloadCsv(headers, rows, `${baseName}_heatmap.csv`);
            },
          },
          {
            label: tr("heatmap.dl.r"),
            title: tr("heatmap.dl.rTitle"),
            onClick: () => {
              if (!rawMatrix || !rawMatrix.rowLabels.length) return;
              const script = buildHeatmapRScript({
                rawMatrix,
                normalization,
                rowMode,
                colMode,
                rowK,
                colK,
                kmeansSeed,
                distanceMetric,
                linkageMethod,
                palette: vis.palette,
                invertPalette: vis.invertPalette,
                vmin: vis.vmin,
                vmax: vis.vmax,
                plotTitle: vis.plotTitle,
                cellBorder,
              });
              downloadText(script, `${baseName}_heatmap.R`);
            },
          },
        ]}
      />

      <ControlSection title={tr("heatmap.sec.normalisation")}>
        <div className="dv-seg" role="group" aria-label={tr("heatmap.sec.normalisation")}>
          {NORM_OPTIONS.map((o) => (
            <button
              key={o.k}
              type="button"
              aria-pressed={normalization === o.k}
              className={"dv-seg-btn" + (normalization === o.k ? " dv-seg-btn-active" : "")}
              onClick={() => setNormalization(o.k)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </ControlSection>

      <ControlSection title={tr("heatmap.sec.clustering")} defaultOpen={true}>
        <ClusterModeControl
          label={tr("heatmap.cluster.rows")}
          mode={rowMode}
          setMode={setRowMode}
          k={rowK}
          setK={setRowK}
        />
        <ClusterModeControl
          label={tr("heatmap.cluster.columns")}
          mode={colMode}
          setMode={setColMode}
          k={colK}
          setK={setColK}
        />
        {anyHier && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              {tr("heatmap.dist.heading")}
            </div>
            <div className="dv-seg" role="group" aria-label={tr("heatmap.dist.aria")}>
              {DIST_OPTIONS.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  aria-pressed={distanceMetric === o.k}
                  className={"dv-seg-btn" + (distanceMetric === o.k ? " dv-seg-btn-active" : "")}
                  onClick={() => setDistanceMetric(o.k)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 4px" }}>
              {tr("heatmap.link.heading")}
            </div>
            <div className="dv-seg" role="group" aria-label={tr("heatmap.link.aria")}>
              {LINK_OPTIONS.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  aria-pressed={linkageMethod === o.k}
                  className={"dv-seg-btn" + (linkageMethod === o.k ? " dv-seg-btn-active" : "")}
                  onClick={() => setLinkageMethod(o.k)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {rowMode === "hierarchical" && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 4px" }}>
                  {tr("heatmap.dendro.rowHeading")}
                </div>
                <div className="dv-seg" role="group" aria-label={tr("heatmap.dendro.rowAria")}>
                  {(
                    [
                      [false, tr("heatmap.off")],
                      [true, tr("heatmap.on")],
                    ] as const
                  ).map(([value, label]) => {
                    const active = !!vis.showRowDendrogram === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        aria-pressed={active}
                        className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
                        onClick={() => updVis({ showRowDendrogram: value })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {colMode === "hierarchical" && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 4px" }}>
                  {tr("heatmap.dendro.colHeading")}
                </div>
                <div className="dv-seg" role="group" aria-label={tr("heatmap.dendro.colAria")}>
                  {(
                    [
                      [false, tr("heatmap.off")],
                      [true, tr("heatmap.on")],
                    ] as const
                  ).map(([value, label]) => {
                    const active = !!vis.showColDendrogram === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        aria-pressed={active}
                        className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
                        onClick={() => updVis({ showColDendrogram: value })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              {tr("heatmap.dendro.note")}
            </div>
          </div>
        )}
        {anyKmeans && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, marginBottom: 2 }}>{tr("heatmap.kmeans.seed")}</div>
            <NumberInput
              value={kmeansSeed}
              step="1"
              min="1"
              onChange={(e) => setKmeansSeed(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              {tr("heatmap.kmeans.seedNote")}
            </div>
          </div>
        )}
      </ControlSection>

      <ControlSection title={tr("heatmap.sec.colourScale")}>
        <label style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
          {tr("heatmap.colour.palette")}
          <select
            value={vis.palette}
            onChange={(e) => updVis({ palette: e.target.value })}
            style={{ width: "100%", fontSize: 11, margin: "2px 0 6px" }}
          >
            {paletteKeys.map((p) => (
              <option key={p} value={p}>
                {p}
                {DIVERGING_PALETTES.has(p) ? tr("heatmap.colour.diverging") : ""}
              </option>
            ))}
          </select>
          <PaletteStrip palette={vis.palette} invert={vis.invertPalette} />
        </label>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span className="dv-label" style={{ fontSize: 11, flexShrink: 0 }}>
            {tr("heatmap.colour.direction")}
          </span>
          <div className="dv-seg" role="group" aria-label={tr("heatmap.colour.directionAria")}>
            <button
              type="button"
              aria-pressed={!vis.invertPalette}
              className={"dv-seg-btn" + (!vis.invertPalette ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ invertPalette: false })}
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              {tr("heatmap.colour.normal")}
            </button>
            <button
              type="button"
              aria-pressed={vis.invertPalette}
              className={"dv-seg-btn" + (vis.invertPalette ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ invertPalette: true })}
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              {tr("heatmap.colour.inverted")}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
          <label style={{ fontSize: 11, flex: 1, display: "block" }}>
            <span className="dv-label">{tr("heatmap.colour.min")}</span>
            <NumberInput
              value={vis.vmin}
              step="0.1"
              onChange={(e) => updVis({ vmin: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ fontSize: 11, flex: 1, display: "block" }}>
            <span className="dv-label">{tr("heatmap.colour.max")}</span>
            <NumberInput
              value={vis.vmax}
              step="0.1"
              onChange={(e) => updVis({ vmax: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <button onClick={autoVRange} className="dv-btn dv-btn-secondary" style={{ fontSize: 11 }}>
          {tr("heatmap.colour.auto")}
        </button>
      </ControlSection>

      <ControlSection title={tr("heatmap.sec.cellBorders")}>
        <div className="dv-seg" role="group" aria-label={tr("heatmap.sec.cellBorders")}>
          <button
            type="button"
            aria-pressed={!cellBorder.on}
            className={"dv-seg-btn" + (!cellBorder.on ? " dv-seg-btn-active" : "")}
            onClick={() => updCellBorder({ on: false })}
          >
            {tr("heatmap.off")}
          </button>
          <button
            type="button"
            aria-pressed={cellBorder.on}
            className={"dv-seg-btn" + (cellBorder.on ? " dv-seg-btn-active" : "")}
            onClick={() => updCellBorder({ on: true })}
          >
            {tr("heatmap.on")}
          </button>
        </div>
        {cellBorder.on && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <ColorInput
              value={cellBorder.color}
              onChange={(c) => updCellBorder({ color: c })}
              size={18}
            />
            <label style={{ fontSize: 11, flex: 1 }}>
              {tr("heatmap.border.width")}
              <input
                type="number"
                value={cellBorder.width}
                min="0.25"
                step="0.25"
                max="2"
                onChange={(e) => updCellBorder({ width: parseFloat(e.target.value) || 0.5 })}
                style={{ width: "100%", fontSize: 11, marginTop: 2 }}
              />
            </label>
          </div>
        )}
      </ControlSection>

      <ControlSection title={tr("heatmap.sec.labels")}>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("heatmap.labels.title")}</span>
          <input
            type="text"
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("heatmap.labels.subtitle")}</span>
          <input
            type="text"
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("heatmap.labels.xAxis")}</span>
          <input
            type="text"
            value={vis.colAxisLabel}
            onChange={(e) => updVis({ colAxisLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("heatmap.labels.yAxis")}</span>
          <input
            type="text"
            value={vis.rowAxisLabel}
            onChange={(e) => updVis({ rowAxisLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            {tr("heatmap.labels.rowNames")}
          </div>
          <div className="dv-seg" role="group" aria-label={tr("heatmap.labels.rowNamesAria")}>
            <button
              type="button"
              aria-pressed={!vis.showRowLabels}
              className={"dv-seg-btn" + (!vis.showRowLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showRowLabels: false })}
            >
              {tr("heatmap.off")}
            </button>
            <button
              type="button"
              aria-pressed={vis.showRowLabels}
              className={"dv-seg-btn" + (vis.showRowLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showRowLabels: true })}
            >
              {tr("heatmap.on")}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            {tr("heatmap.labels.colNames")}
          </div>
          <div className="dv-seg" role="group" aria-label={tr("heatmap.labels.colNamesAria")}>
            <button
              type="button"
              aria-pressed={!vis.showColLabels}
              className={"dv-seg-btn" + (!vis.showColLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showColLabels: false })}
            >
              {tr("heatmap.off")}
            </button>
            <button
              type="button"
              aria-pressed={vis.showColLabels}
              className={"dv-seg-btn" + (vis.showColLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showColLabels: true })}
            >
              {tr("heatmap.on")}
            </button>
          </div>
        </div>
      </ControlSection>
    </PlotSidebar>
  );
}

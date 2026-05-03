// lineplot/controls.tsx — Plot-step sidebar. Owns the actions tile (SVG/PNG
// download, stats CSV, Start over) and the ControlSection-grouped tiles for
// labels, axis bounds, error-bar style, and per-group colour overrides.

import { PlotSidebar } from "../_shell/PlotSidebar";
import { ERROR_KINDS } from "./helpers";
import { ControlSection } from "./steps";

export function PlotControls({
  parsed,
  fileName,
  xCol,
  setXCol,
  yCol,
  setYCol,
  groupCol,
  setGroupCol,
  numericCols,
  categoricalCols,
  series,
  setGroupColor,
  vis,
  updVis,
  autoAxis,
  errorType,
  setErrorType,
  statsRows,
  svgRef,
  resetAll,
}: any) {
  const sv = (k: string) => (v: unknown) => updVis({ [k]: v });

  const downloadStatsCsv = () => {
    const headers = ["x", "test", "statistic", "p", "p_adj", "stars"];
    const rows = statsRows.map((r: any) => {
      const stat =
        r.result && !r.result.error
          ? r.result.t != null
            ? r.result.t
            : r.result.U != null
              ? r.result.U
              : r.result.F != null
                ? r.result.F
                : r.result.H != null
                  ? r.result.H
                  : ""
          : "";
      const p = r.result && !r.result.error ? r.result.p : "";
      const pAdj = r.pAdj != null ? r.pAdj : "";
      const stars = r.pAdj != null ? pStars(r.pAdj) : "";
      return [formatX(r.x), r.chosenTest || "", stat, p, pAdj, stars];
    });
    downloadCsv(headers, rows, `${fileBaseName(fileName, "lineplot")}_stats.csv`);
  };

  return (
    <PlotSidebar>
      <ActionsPanel
        onDownloadSvg={() =>
          downloadSvg(svgRef.current, `${fileBaseName(fileName, "lineplot")}_lineplot.svg`)
        }
        onDownloadPng={() =>
          downloadPng(svgRef.current, `${fileBaseName(fileName, "lineplot")}_lineplot.png`)
        }
        onReset={resetAll}
        extraDownloads={
          statsRows.length > 0
            ? [
                {
                  label: "Stats CSV",
                  title:
                    "Download the per-x summary statistics (n, mean, SD, SEM, 95% CI) for every group",
                  onClick: downloadStatsCsv,
                },
              ]
            : []
        }
      />

      {/* Permanent "Variables" panel — matches scatter's column-role picker
          pattern: always visible at the top of the sidebar, never collapsed.
          These selects define what the plot IS; hiding them behind a
          disclosure widget would be a UX downgrade. */}
      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          Variables
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "block" }}>
            <span className="dv-label">X axis</span>
            <select
              value={xCol}
              onChange={(e) => setXCol(parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              {numericCols.map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span className="dv-label">Y axis</span>
            <select
              value={yCol}
              onChange={(e) => setYCol(parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              {numericCols.map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span className="dv-label">Group by</span>
            <select
              value={groupCol == null ? "" : groupCol}
              onChange={(e) => setGroupCol(e.target.value === "" ? null : parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              <option value="">(single line)</option>
              {categoricalCols.map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <ControlSection title="Groups">
        {series.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
            No groups yet — pick a grouping column.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {series.map((s: any) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorInput value={s.color} onChange={(c) => setGroupColor(s.name, c)} />
                <span style={{ fontSize: 12, color: "var(--text)" }}>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </ControlSection>

      <ControlSection title="Error bars">
        <div className="dv-seg" role="group" aria-label="Error bar type">
          {ERROR_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className={"dv-seg-btn" + (errorType === k.value ? " dv-seg-btn-active" : "")}
              onClick={() => setErrorType(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </ControlSection>

      <ControlSection title="Axes">
        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">X min</span>
            <NumberInput
              value={vis.xMin != null ? vis.xMin : autoAxis.xMin}
              onChange={(e) => updVis({ xMin: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">X max</span>
            <NumberInput
              value={vis.xMax != null ? vis.xMax : autoAxis.xMax}
              onChange={(e) => updVis({ xMax: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">Y min</span>
            <NumberInput
              value={vis.yMin != null ? vis.yMin : autoAxis.yMin}
              onChange={(e) => updVis({ yMin: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">Y max</span>
            <NumberInput
              value={vis.yMax != null ? vis.yMax : autoAxis.yMax}
              onChange={(e) => updVis({ yMax: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
        </div>
      </ControlSection>

      <ControlSection title="Labels">
        <label style={{ display: "block" }}>
          <span className="dv-label">Title</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Subtitle</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">X label</span>
          <input
            value={vis.xLabel}
            onChange={(e) => updVis({ xLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Y label</span>
          <input
            value={vis.yLabel}
            onChange={(e) => updVis({ yLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title="Style">
        <BaseStyleControls
          plotBg={vis.plotBg}
          onPlotBgChange={(v) => updVis({ plotBg: v })}
          showGrid={vis.showGrid}
          onShowGridChange={(v) => updVis({ showGrid: v })}
          gridColor={vis.gridColor}
          onGridColorChange={(v) => updVis({ gridColor: v })}
        />
        <SliderControl
          label="Line width"
          value={vis.lineWidth}
          min={0.5}
          max={5}
          step={0.5}
          onChange={sv("lineWidth")}
        />
        <SliderControl
          label="Point radius"
          value={vis.pointRadius}
          min={0}
          max={10}
          step={0.5}
          onChange={sv("pointRadius")}
        />
        <SliderControl
          label="Error cap width"
          value={vis.errorCapWidth}
          min={0}
          max={20}
          step={1}
          onChange={sv("errorCapWidth")}
        />
      </ControlSection>
    </PlotSidebar>
  );
}

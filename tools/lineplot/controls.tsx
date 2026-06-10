// lineplot/controls.tsx — Plot-step sidebar. Owns the actions tile (SVG/PNG
// download, stats CSV, Start over) and the ControlSection-grouped tiles for
// labels, axis bounds, error-bar style, and per-group colour overrides.

import {
  BaseStyleControls,
  ColorInput,
  ControlSection,
  DiscretePaletteRow,
  DownloadTiles,
  NumberInput,
  PlotSidebar,
  SliderControl,
  applyDiscretePalette,
  testStatistic,
} from "../_shell";
import { ERROR_KINDS, formatX, round2 } from "./helpers";
import type { PerXRow, PlotControlsProps, Series } from "./helpers";
import { useT, type LineplotKey } from "./i18n";

import { downloadCsv, fileBaseName } from "../_core/download";
import { pStars } from "../_core/stats/format";

// Localized labels for the error-bar kinds (values stay the ErrorKind enum).
const ERROR_KIND_KEYS: Record<string, LineplotKey> = {
  none: "lineplot.err.none",
  sem: "lineplot.err.sem",
  sd: "lineplot.err.sd",
  ci95: "lineplot.err.ci95",
};

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
}: PlotControlsProps) {
  const tr = useT();
  // Dynamic key reducer dispatch. The cast narrows to `Partial<typeof vis>`
  // rather than `any` — `v: unknown` from SliderControl's onChange can't be
  // statically associated with `vis[k]`'s value type.
  const sv = (k: keyof typeof vis) => (v: unknown) => updVis({ [k]: v } as Partial<typeof vis>);

  const downloadStatsCsv = () => {
    const headers = ["x", "test", "statistic", "p", "p_adj", "stars"];
    const rows = statsRows.map((r: PerXRow): Array<string | number> => {
      const res = r.result;
      const stat: number | "" = testStatistic(res) ?? "";
      const p: number | "" = res && !res.error && res.p != null ? res.p : "";
      const pAdj: number | "" = r.pAdj != null ? r.pAdj : "";
      const stars = r.pAdj != null ? pStars(r.pAdj) : "";
      return [formatX(r.x), r.chosenTest || "", stat, p, pAdj, stars];
    });
    downloadCsv(headers, rows, `${fileBaseName(fileName, "lineplot")}_stats.csv`);
  };

  return (
    <PlotSidebar>
      <DownloadTiles
        chartRef={svgRef}
        fileStem={`${fileBaseName(fileName, "lineplot")}_lineplot`}
        onReset={resetAll}
        extraDownloads={
          statsRows.length > 0
            ? [
                {
                  label: tr("lineplot.dl.statsCsv"),
                  title: tr("lineplot.dl.statsCsvTitle"),
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
          {tr("lineplot.tile.variables")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "block" }}>
            <span className="dv-label">{tr("lineplot.var.xAxis")}</span>
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
            <span className="dv-label">{tr("lineplot.var.yAxis")}</span>
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
            <span className="dv-label">{tr("lineplot.var.groupBy")}</span>
            <select
              value={groupCol == null ? "" : groupCol}
              onChange={(e) => setGroupCol(e.target.value === "" ? null : parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              <option value="">{tr("lineplot.var.singleLine")}</option>
              {categoricalCols.map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <ControlSection title={tr("lineplot.sec.groups")}>
        {series.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
            {tr("lineplot.groups.empty")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <DiscretePaletteRow
              value={vis.discretePalette || "okabe-ito"}
              onChange={(next: string) => {
                updVis({ discretePalette: next });
                const names = series.map((s: Series) => s.name);
                updVis({ groupColors: applyDiscretePalette(next, names) });
              }}
              names={series.map((s: Series) => s.name)}
            />
            {series.map((s: Series) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorInput value={s.color} onChange={(c) => setGroupColor(s.name, c)} />
                <span style={{ fontSize: 12, color: "var(--text)" }}>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </ControlSection>

      <ControlSection title={tr("lineplot.sec.errorBars")}>
        <div className="dv-seg" role="group" aria-label={tr("lineplot.errorBars.aria")}>
          {ERROR_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={errorType === k.value}
              className={"dv-seg-btn" + (errorType === k.value ? " dv-seg-btn-active" : "")}
              onClick={() => setErrorType(k.value)}
            >
              {ERROR_KIND_KEYS[k.value] ? tr(ERROR_KIND_KEYS[k.value]) : k.label}
            </button>
          ))}
        </div>
      </ControlSection>

      <ControlSection title={tr("lineplot.sec.axes")}>
        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">{tr("lineplot.axes.xMin")}</span>
            <NumberInput
              value={vis.xMin != null ? vis.xMin : autoAxis.xMin}
              onChange={(e) => updVis({ xMin: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">{tr("lineplot.axes.xMax")}</span>
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
            <span className="dv-label">{tr("lineplot.axes.yMin")}</span>
            <NumberInput
              value={vis.yMin != null ? vis.yMin : autoAxis.yMin}
              onChange={(e) => updVis({ yMin: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">{tr("lineplot.axes.yMax")}</span>
            <NumberInput
              value={vis.yMax != null ? vis.yMax : autoAxis.yMax}
              onChange={(e) => updVis({ yMax: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <SliderControl
          label={tr("lineplot.axes.tickFontSize")}
          value={vis.tickFontSize}
          displayValue={vis.tickFontSize + " px"}
          min={11}
          max={22}
          step={1}
          onChange={sv("tickFontSize")}
        />
      </ControlSection>

      <ControlSection title={tr("lineplot.sec.labels")}>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("lineplot.labels.title")}</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("lineplot.labels.subtitle")}</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("lineplot.labels.xLabel")}</span>
          <input
            value={vis.xLabel}
            onChange={(e) => updVis({ xLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("lineplot.labels.yLabel")}</span>
          <input
            value={vis.yLabel}
            onChange={(e) => updVis({ yLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title={tr("lineplot.sec.style")}>
        <BaseStyleControls
          plotBg={vis.plotBg}
          onPlotBgChange={(v) => updVis({ plotBg: v })}
          showGrid={vis.showGrid}
          onShowGridChange={(v) => updVis({ showGrid: v })}
          gridColor={vis.gridColor}
          onGridColorChange={(v) => updVis({ gridColor: v })}
        />
        <SliderControl
          label={tr("lineplot.style.lineWidth")}
          value={vis.lineWidth}
          min={0.5}
          max={5}
          step={0.5}
          onChange={sv("lineWidth")}
        />
        <SliderControl
          label={tr("lineplot.style.pointRadius")}
          value={vis.pointRadius}
          min={0}
          max={10}
          step={0.5}
          onChange={sv("pointRadius")}
        />
        <SliderControl
          label={tr("lineplot.style.errorCapWidth")}
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

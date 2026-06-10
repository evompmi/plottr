// venn/controls.tsx — sidebar for the Plot step. Owns the Actions tile
// (download SVG/PNG/CSV/Regions/Reset), the Sets list (toggle / colour /
// rename / size readout), and the Display tile (proportional toggle, blend
// slider, opacity / outline / font / background).

import {
  ColorInput,
  DiscretePaletteRow,
  DownloadTiles,
  OnOffToggle,
  PlotSidebar,
  SliderControl,
  applyDiscretePalette,
} from "../_shell";
import { regionLabel, regionFilenamePart } from "./helpers";
import type { PlotControlsProps, Region, VennVis } from "./helpers";
import { useT } from "./i18n";

import { PALETTE } from "../_core/color";
import { downloadCsv, downloadCsvs, fileBaseName } from "../_core/download";
export function PlotControls({
  allSetNames,
  allSets,
  activeSetNames,
  activeSets,
  intersections,
  onToggleSet,
  setColors,
  onColorChange,
  onRename,
  vis,
  updVis,
  chartRef,
  resetAll,
  proportional,
  onProportionalChange,
  fileName,
}: PlotControlsProps) {
  const tr = useT();
  const baseName = fileBaseName(fileName, "venn");
  const sv = (k: keyof VennVis) => (v: unknown) => updVis({ [k]: v } as Partial<VennVis>);
  return (
    <PlotSidebar>
      <DownloadTiles
        chartRef={chartRef}
        fileStem={`${baseName}_venn`}
        onReset={resetAll}
        extraDownloads={[
          {
            label: tr("venn.dl.csv"),
            title: tr("venn.dl.csvTitle"),
            onClick: () => {
              const allItems = new Set<string>();
              for (const n of activeSetNames) {
                const s = allSets.get(n);
                if (!s) continue;
                for (const item of s) allItems.add(item);
              }
              const headers = ["Item", ...activeSetNames];
              const rows: Array<Array<string>> = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n: string) => (allSets.get(n)?.has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_venn_membership.csv`);
            },
          },
          {
            // One CSV per non-empty region. With several regions the browser
            // prompts once for a destination folder and writes them all there
            // (see `saveBlobs`). Empty regions are skipped (an empty CSV is
            // noise, not a useful record).
            label: tr("venn.dl.regions"),
            title: tr("venn.dl.regionsTitle"),
            onClick: () => {
              const nonEmpty = intersections.filter((r: Region) => r.size > 0);
              downloadCsvs(
                nonEmpty.map((r: Region) => {
                  const label = regionLabel(r.setNames, r.mask, activeSetNames);
                  return {
                    headers: ["Item"],
                    rows: r.items.map((it: string) => [it]),
                    filename: `${baseName}_venn_${regionFilenamePart(label)}.csv`,
                  };
                })
              );
            },
          },
        ]}
      />

      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          {tr("venn.tile.sets")}
        </p>
        <DiscretePaletteRow
          value={vis.discretePalette || "okabe-ito"}
          onChange={(next: string) => {
            updVis({
              discretePalette: next,
              setColors: applyDiscretePalette(next, allSetNames),
            });
          }}
          names={allSetNames}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {allSetNames.map((name: string, i: number) => {
            const active = activeSets.has(name);
            const canUncheck = activeSets.size > 2;
            return (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: active ? "var(--surface-sunken)" : "var(--surface-subtle)",
                  border: active ? "1px solid var(--border-strong)" : "1px solid var(--border)",
                  opacity: active ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={active && !canUncheck}
                  onChange={() => onToggleSet(name)}
                  style={{
                    accentColor: setColors[name] || PALETTE[i % PALETTE.length],
                    flexShrink: 0,
                  }}
                />
                <ColorInput
                  value={setColors[name] || PALETTE[i % PALETTE.length]}
                  onChange={(v) => onColorChange(name, v)}
                  size={20}
                />
                <input
                  key={name}
                  defaultValue={name}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: 600,
                    color: active ? "var(--text)" : "var(--text-faint)",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 3,
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--accent-primary)";
                    e.target.style.boxShadow = "var(--focus-ring)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border-strong)";
                    e.target.style.boxShadow = "none";
                    const nv = e.target.value.trim();
                    if (nv && nv !== name) {
                      if (!onRename(name, nv)) e.target.value = name;
                    } else if (!nv) e.target.value = name;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                <span
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({allSets.get(name)?.size ?? 0})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          {tr("venn.tile.display")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <span className="dv-label">{tr("venn.ctrl.proportionalAreas")}</span>
            <OnOffToggle
              value={proportional}
              onChange={onProportionalChange}
              ariaLabel={tr("venn.ctrl.proportionalAreas")}
            />
          </div>
          {proportional && (
            <SliderControl
              label={tr("venn.ctrl.propReadable")}
              value={vis.readabilityBlend}
              min={0}
              max={1}
              step={0.05}
              displayValue={`${Math.round(vis.readabilityBlend * 100)}%`}
              onChange={sv("readabilityBlend")}
            />
          )}
          <div>
            <div className="dv-label">{tr("venn.ctrl.title")}</div>
            <input
              value={vis.plotTitle}
              onChange={(e) => updVis({ plotTitle: e.target.value })}
              className="dv-input"
              style={{ width: "100%" }}
            />
          </div>
          <SliderControl
            label={tr("venn.ctrl.fillOpacity")}
            value={vis.fillOpacity}
            min={0.05}
            max={0.8}
            step={0.05}
            onChange={sv("fillOpacity")}
          />
          <div>
            <span className="dv-label">{tr("venn.ctrl.circleOutline")}</span>
            <OnOffToggle
              value={vis.showOutline}
              onChange={(v) => updVis({ showOutline: v })}
              ariaLabel={tr("venn.ctrl.circleOutline")}
            />
          </div>
          <SliderControl
            label={tr("venn.ctrl.fontSize")}
            value={vis.fontSize}
            min={8}
            max={24}
            step={1}
            onChange={sv("fontSize")}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="dv-label">{tr("venn.ctrl.background")}</span>
            <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
          </div>
        </div>
      </div>
    </PlotSidebar>
  );
}

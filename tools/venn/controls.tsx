// venn/controls.tsx — sidebar for the Plot step. Owns the Actions tile
// (download SVG/PNG/CSV/Regions/Reset), the Sets list (toggle / colour /
// rename / size readout), and the Display tile (proportional toggle, blend
// slider, opacity / outline / font / background).

import { PlotSidebar } from "../_shell/PlotSidebar";
import { DownloadTiles } from "../_shell/DownloadTiles";
import { regionLabel, regionFilenamePart } from "./helpers";

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
}: any) {
  const baseName = fileBaseName(fileName, "venn");
  const sv = (k: string) => (v: unknown) => updVis({ [k]: v });
  return (
    <PlotSidebar>
      <DownloadTiles
        chartRef={chartRef}
        fileStem={`${baseName}_venn`}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "CSV",
            title:
              "Download the membership matrix — one row per item, a 0/1 column for each active set (long/tidy format)",
            onClick: () => {
              const allItems = new Set();
              for (const n of activeSetNames) for (const item of allSets.get(n)) allItems.add(item);
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n: string) => (allSets.get(n).has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_venn_membership.csv`);
            },
          },
          {
            // One CSV per non-empty region. Browsers may prompt once to
            // allow multiple downloads from a single user gesture — accepting
            // is expected. Empty regions are skipped (an empty CSV is noise,
            // not a useful record).
            label: "Regions",
            title:
              "Download one CSV per non-empty region (fires multiple saves — your browser may ask once to allow them)",
            onClick: () => {
              const nonEmpty = intersections.filter((r: any) => r.size > 0);
              nonEmpty.forEach((r: any, i: number) => {
                const label = regionLabel(r.setNames, r.mask, activeSetNames);
                const name = `${baseName}_venn_${regionFilenamePart(label)}.csv`;
                // Stagger slightly so the browser reliably handles each as
                // its own download (a single synchronous loop of <a>.click()
                // can race inside some engines).
                setTimeout(
                  () =>
                    downloadCsv(
                      ["Item"],
                      r.items.map((it: string) => [it]),
                      name
                    ),
                  i * 40
                );
              });
            },
          },
        ]}
      />

      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          Sets
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
                    e.target.style.boxShadow = "0 0 0 2px rgba(100,143,255,0.2)";
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
                  ({allSets.get(name).size})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          Display
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <span className="dv-label">Proportional areas</span>
            <div
              style={{
                display: "flex",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-strong)",
              }}
            >
              {(["off", "on"] as const).map((mode) => {
                const active = mode === "on" ? proportional : !proportional;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onProportionalChange(mode === "on")}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      fontSize: 11,
                      fontWeight: active ? 700 : 400,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      border: "none",
                      background: active ? "var(--accent-primary)" : "var(--surface)",
                      color: active ? "var(--on-accent)" : "var(--text-muted)",
                      transition: "background 120ms ease, color 120ms ease",
                    }}
                  >
                    {mode === "off" ? "Off" : "On"}
                  </button>
                );
              })}
            </div>
          </div>
          {proportional && (
            <SliderControl
              label="Proportional ↔ Readable"
              value={vis.readabilityBlend}
              min={0}
              max={1}
              step={0.05}
              displayValue={`${Math.round(vis.readabilityBlend * 100)}%`}
              onChange={sv("readabilityBlend")}
            />
          )}
          <div>
            <div className="dv-label">Title</div>
            <input
              value={vis.plotTitle}
              onChange={(e) => updVis({ plotTitle: e.target.value })}
              className="dv-input"
              style={{ width: "100%" }}
            />
          </div>
          <SliderControl
            label="Fill opacity"
            value={vis.fillOpacity}
            min={0.05}
            max={0.8}
            step={0.05}
            onChange={sv("fillOpacity")}
          />
          <div>
            <span className="dv-label">Circle outline</span>
            <div
              style={{
                display: "flex",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-strong)",
              }}
            >
              {(["off", "on"] as const).map((mode) => {
                const active = mode === "on" ? vis.showOutline : !vis.showOutline;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updVis({ showOutline: mode === "on" })}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      fontSize: 11,
                      fontWeight: active ? 700 : 400,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      border: "none",
                      background: active ? "var(--accent-primary)" : "var(--surface)",
                      color: active ? "var(--on-accent)" : "var(--text-muted)",
                      transition: "background 120ms ease, color 120ms ease",
                    }}
                  >
                    {mode === "off" ? "Off" : "On"}
                  </button>
                );
              })}
            </div>
          </div>
          <SliderControl
            label="Font size"
            value={vis.fontSize}
            min={8}
            max={24}
            step={1}
            onChange={sv("fontSize")}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="dv-label">Background</span>
            <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
          </div>
        </div>
      </div>
    </PlotSidebar>
  );
}

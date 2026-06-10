// upset/controls.tsx — Plot-step sidebar. Owns the actions tile (SVG/PNG
// download, table/matrix/all-regions CSV exports, Compute stats workflow,
// universe-size override, Start over) and the ControlSection-grouped
// tiles for sort/filter/style/significance/labels.

import {
  ColorInput,
  ControlSection,
  DownloadTiles,
  NumberInput,
  OnOffToggle,
  PlotSidebar,
  SliderControl,
} from "../_shell";
import { intersectionLabel } from "./helpers";
import type { Intersection, PlotControlsProps, UpsetVis } from "./helpers";
import { BAR_FILL_ENRICHED, BAR_FILL_DEPLETED } from "./chart";
import { useT } from "./i18n";

import { downloadCsv, downloadCsvs, fileBaseName } from "../_core/download";

// ── PlotControls ────────────────────────────────────────────────────────────

export function PlotControls({
  activeSetNames,
  allSets,
  vis,
  updVis,
  chartRef,
  resetAll,
  fileName,
  intersections,
  computeAllIntersectionStats,
  clearIntersectionStats,
  computingStats,
  computeProgress,
  intersectionTestsCount,
  universeSize,
  setUniverseSize,
  universeOverridden,
  setUniverseOverridden,
  defaultUniverseSize,
  maxAllIntersectionSize,
  allIntersectionsCount,
}: PlotControlsProps) {
  const tr = useT();
  const baseName = fileBaseName(fileName, "upset");
  const sv = (k: keyof UpsetVis) => (v: unknown) => updVis({ [k]: v } as Partial<UpsetVis>);
  const universeValid =
    universeSize !== "" && Number.isFinite(Number(universeSize)) && Number(universeSize) > 0;
  return (
    <PlotSidebar>
      <DownloadTiles
        chartRef={chartRef}
        fileStem={`${baseName}_upset`}
        onReset={resetAll}
        extraDownloads={[
          {
            label: tr("upset.dl.table"),
            title: tr("upset.dl.tableTitle"),
            onClick: () => {
              const headers = ["Intersection", "Degree", "Size", ...activeSetNames];
              const rows = intersections.map((r: Intersection) => {
                const label = intersectionLabel(r.setIndices, activeSetNames);
                const flags = activeSetNames.map((_: unknown, i: number) =>
                  r.setIndices.includes(i) ? "1" : "0"
                );
                return [label, String(r.degree), String(r.size), ...flags];
              });
              downloadCsv(headers, rows, `${baseName}_upset_intersections.csv`);
            },
          },
          {
            label: tr("upset.dl.matrix"),
            title: tr("upset.dl.matrixTitle"),
            onClick: () => {
              const allItems = new Set<string>();
              for (const n of activeSetNames) {
                const s = allSets.get(n);
                if (!s) continue;
                for (const item of s) allItems.add(item);
              }
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n: string) => (allSets.get(n)?.has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_upset_membership.csv`);
            },
          },
          {
            label: tr("upset.dl.allRegions"),
            title: tr("upset.dl.allRegionsTitle"),
            onClick: () => {
              if (!intersections.length) return;
              const indexHeaders = ["Id", "Intersection", "Degree", "Size"];
              const indexRows = intersections.map((inter: Intersection, i: number) => [
                `I${i + 1}`,
                intersectionLabel(inter.setIndices, activeSetNames),
                String(inter.degree),
                String(inter.size),
              ]);
              // Index CSV + one CSV per intersection, saved as a single batch:
              // the browser prompts once for a destination folder and writes
              // every file there (see `saveBlobs`).
              downloadCsvs([
                { headers: indexHeaders, rows: indexRows, filename: `${baseName}_upset_index.csv` },
                ...intersections.map((inter: Intersection, i: number) => ({
                  headers: ["Item"],
                  rows: inter.items.map((item: string) => [item]),
                  filename: `${baseName}_upset_I${i + 1}.csv`,
                })),
              ]);
            },
          },
        ]}
      />

      <ControlSection title={tr("upset.sec.columns")} defaultOpen>
        <div>
          <span className="dv-label">{tr("upset.sort.label")}</span>
          <select
            value={vis.sortMode}
            onChange={(e) => updVis({ sortMode: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          >
            <option value="size-desc">{tr("upset.sort.sizeDesc")}</option>
            <option value="size-asc">{tr("upset.sort.sizeAsc")}</option>
            <option value="degree-desc">{tr("upset.sort.degreeDesc")}</option>
            <option value="degree-asc">{tr("upset.sort.degreeAsc")}</option>
            <option value="sets">{tr("upset.sort.sets")}</option>
          </select>
        </div>
        <label style={{ display: "block" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">{tr("upset.minSize")}</span>
            {maxAllIntersectionSize > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {tr("upset.maxInData", { n: maxAllIntersectionSize.toLocaleString() })}
              </span>
            )}
          </div>
          <NumberInput
            value={vis.minSize}
            min={0}
            max={maxAllIntersectionSize > 0 ? maxAllIntersectionSize : undefined}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const cap = maxAllIntersectionSize > 0 ? maxAllIntersectionSize : v;
              updVis({ minSize: Math.max(0, Math.min(cap, v)) });
            }}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("upset.minDegree")}</span>
          <NumberInput
            value={vis.minDegree}
            min={1}
            max={Math.max(1, activeSetNames.length)}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const cap = Math.max(1, activeSetNames.length);
              const clamped = Math.max(1, Math.min(cap, v));
              const patch: { minDegree: number; maxDegree?: number } = { minDegree: clamped };
              if (vis.maxDegree != null && clamped > vis.maxDegree) patch.maxDegree = clamped;
              updVis(patch);
            }}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">{tr("upset.maxDegree")}</span>
            {activeSetNames.length > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {tr("upset.maxInData", { n: activeSetNames.length.toLocaleString() })}
              </span>
            )}
          </div>
          <NumberInput
            value={vis.maxDegree ?? Math.max(1, activeSetNames.length)}
            min={1}
            max={Math.max(1, activeSetNames.length)}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const cap = Math.max(1, activeSetNames.length);
              const clamped = Math.max(1, Math.min(cap, v));
              const patch: { maxDegree: number; minDegree?: number } = { maxDegree: clamped };
              if (clamped < vis.minDegree) patch.minDegree = clamped;
              updVis(patch);
            }}
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title={tr("upset.sec.labels")}>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("upset.label.title")}</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">{tr("upset.label.subtitle")}</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title={tr("upset.sec.display")}>
        <SliderControl
          label={tr("upset.disp.barOpacity")}
          value={vis.barOpacity}
          min={0.3}
          max={1}
          step={0.05}
          onChange={sv("barOpacity")}
        />
        <SliderControl
          label={tr("upset.disp.dotSize")}
          value={vis.dotSize}
          min={3}
          max={12}
          step={1}
          onChange={sv("dotSize")}
        />
        <SliderControl
          label={tr("upset.disp.fontSize")}
          value={vis.fontSize}
          min={8}
          max={20}
          step={1}
          onChange={sv("fontSize")}
        />
        <div>
          <div className="dv-label">{tr("upset.disp.intersectionLabels")}</div>
          <OnOffToggle
            value={vis.showIntersectionLabels !== false}
            onChange={(v) => updVis({ showIntersectionLabels: v })}
            ariaLabel={tr("upset.disp.intersectionLabels")}
          />
        </div>
        <div>
          <div className="dv-label">{tr("upset.disp.setSizeLabels")}</div>
          <OnOffToggle
            value={vis.showSetSizeLabels !== false}
            onChange={(v) => updVis({ showSetSizeLabels: v })}
            ariaLabel={tr("upset.disp.setSizeLabels")}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="dv-label">{tr("upset.disp.background")}</span>
          <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
        </div>
      </ControlSection>

      <ControlSection title={tr("upset.sec.statistics")}>
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">{tr("upset.stat.universe")}</span>
            {universeOverridden && Number.isFinite(Number(defaultUniverseSize)) && (
              <button
                type="button"
                onClick={() => {
                  setUniverseOverridden(false);
                  setUniverseSize(defaultUniverseSize || "");
                }}
                style={{
                  fontSize: 10,
                  padding: "1px 8px",
                  background: "none",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                title={tr("upset.stat.resetUniverseTitle")}
              >
                {tr("upset.stat.resetUniverse", { n: defaultUniverseSize })}
              </button>
            )}
          </div>
          <NumberInput
            value={universeSize}
            min={1}
            step={1}
            onChange={(e) => {
              const v = e.target.value;
              setUniverseSize(v === "" ? "" : Number(v));
              setUniverseOverridden(true);
            }}
            style={{ width: "100%" }}
          />
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            {tr("upset.stat.universeNote")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="dv-label">{tr("upset.stat.intersectionStats")}</div>
          <button
            type="button"
            className="dv-btn dv-btn-primary"
            onClick={computeAllIntersectionStats}
            disabled={computingStats || !universeValid || allIntersectionsCount === 0}
            title={
              !universeValid
                ? tr("upset.stat.computeDisabledTitle")
                : computingStats
                  ? tr("upset.stat.computingTitle")
                  : tr("upset.stat.computeTitle", { n: allIntersectionsCount })
            }
            style={{
              fontSize: 12,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {computingStats ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    border: "2px solid currentColor",
                    borderRightColor: "transparent",
                    borderRadius: "50%",
                    animation: "dv-spin 0.9s linear infinite",
                  }}
                  aria-hidden="true"
                />
                {tr("upset.stat.computingProgress", {
                  done: computeProgress.done,
                  total: computeProgress.total,
                })}
              </>
            ) : intersectionTestsCount > 0 ? (
              tr("upset.stat.recompute", { n: allIntersectionsCount })
            ) : (
              tr("upset.stat.compute", { n: allIntersectionsCount })
            )}
          </button>
          {computingStats && computeProgress.total > 0 && (
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: "var(--border)",
                overflow: "hidden",
              }}
              aria-hidden="true"
            >
              <div
                style={{
                  height: "100%",
                  width: `${(computeProgress.done / computeProgress.total) * 100}%`,
                  background: "var(--accent-primary)",
                  transition: "width 120ms linear",
                }}
              />
            </div>
          )}
          {intersectionTestsCount > 0 && !computingStats && (
            <button
              type="button"
              onClick={clearIntersectionStats}
              className="dv-btn dv-btn-secondary"
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              {tr("upset.stat.clearCached", {
                n: intersectionTestsCount,
                count: intersectionTestsCount,
              })}
            </button>
          )}
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            {tr("upset.stat.computeNote")}
          </p>
          <style>{`@keyframes dv-spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        <div>
          <div className="dv-label">{tr("upset.stat.sigMarkers")}</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(
              [
                ["off", tr("upset.stat.off")],
                ["stars", tr("upset.stat.stars")],
                ["p-value", tr("upset.stat.pvalue")],
              ] as const
            ).map(([mode, label]) => {
              const current = vis.significanceDisplay || "off";
              const active = current === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ significanceDisplay: mode })}
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
                  {label}
                </button>
              );
            })}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            {tr("upset.stat.sigMarkersNote")}
          </p>
        </div>

        <div>
          <div className="dv-label">{tr("upset.stat.colorBars")}</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(
              [
                [false, tr("upset.stat.off")],
                [true, tr("upset.stat.on")],
              ] as const
            ).map(([value, label]) => {
              const active = !!vis.colorBarsBySignificance === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => updVis({ colorBarsBySignificance: value })}
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
                  {label}
                </button>
              );
            })}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            <span style={{ color: BAR_FILL_ENRICHED, fontWeight: 700 }}>
              {tr("upset.stat.green")}
            </span>
            {tr("upset.stat.colorBarsNote1")}
            <span style={{ color: BAR_FILL_DEPLETED, fontWeight: 700 }}>
              {tr("upset.stat.darkRed")}
            </span>
            {tr("upset.stat.colorBarsNote2")}
          </p>
        </div>
      </ControlSection>
    </PlotSidebar>
  );
}

// Wraps the scrollable plot card with edge fade overlays + a hint pill so a
// user who doesn't notice the browser's scrollbar still sees the content is
// scrollable. Measures the inner element with a ResizeObserver + onScroll.

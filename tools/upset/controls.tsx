// upset/controls.tsx — Plot-step sidebar. Owns the actions tile (SVG/PNG
// download, table/matrix/all-regions CSV exports, Compute stats workflow,
// universe-size override, Start over) and the ControlSection-grouped
// tiles for sort/filter/style/significance/labels.

import { PlotSidebar } from "../_shell/PlotSidebar";
import { DownloadTiles } from "../_shell/DownloadTiles";
import { intersectionLabel, intersectionShortLabel, intersectionFilenamePart } from "./helpers";
import { BAR_FILL_ENRICHED, BAR_FILL_DEPLETED } from "./chart";

const { useState, useRef, useEffect } = React;

export function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        className="dv-tile-title"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
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
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

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
}: any) {
  const baseName = fileBaseName(fileName, "upset");
  const sv = (k: string) => (v: unknown) => updVis({ [k]: v });
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
            label: "Table",
            title:
              "Download the currently-plotted intersection table (Intersection, Degree, Size, + per-set flags). Matches the plot exactly — reflects sort, Top N, Minimum/Maximum degree, and Minimum size filters.",
            onClick: () => {
              const headers = ["Intersection", "Degree", "Size", ...activeSetNames];
              const rows = intersections.map((r: any) => {
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
            label: "Matrix",
            title:
              "Download the membership matrix — one row per item, a 0/1 column for each active set",
            onClick: () => {
              const allItems = new Set<string>();
              for (const n of activeSetNames) for (const item of allSets.get(n)) allItems.add(item);
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n: string) => (allSets.get(n).has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_upset_membership.csv`);
            },
          },
          {
            label: "All regions",
            title:
              "One CSV per currently-plotted intersection (named _I1, _I2, … matching the on-plot identifiers) plus an _index.csv mapping Id → Intersection, Degree, Size. Your browser may ask once to allow multiple downloads.",
            onClick: () => {
              if (!intersections.length) return;
              const indexHeaders = ["Id", "Intersection", "Degree", "Size"];
              const indexRows = intersections.map((inter: any, i: number) => [
                `I${i + 1}`,
                intersectionLabel(inter.setIndices, activeSetNames),
                String(inter.degree),
                String(inter.size),
              ]);
              // Staggered downloads — without the gap, browsers tend to silently
              // drop everything after the first file when a synchronous loop
              // fires multiple <a>.click() events in the same tick.
              downloadCsv(indexHeaders, indexRows, `${baseName}_upset_index.csv`);
              intersections.forEach((inter: any, i: number) => {
                setTimeout(
                  () => {
                    downloadCsv(
                      ["Item"],
                      inter.items.map((item: string) => [item]),
                      `${baseName}_upset_I${i + 1}.csv`
                    );
                  },
                  40 * (i + 1)
                );
              });
            },
          },
        ]}
      />

      <ControlSection title="Columns" defaultOpen>
        <div>
          <span className="dv-label">Sort by</span>
          <select
            value={vis.sortMode}
            onChange={(e) => updVis({ sortMode: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          >
            <option value="size-desc">Size (largest first)</option>
            <option value="size-asc">Size (smallest first)</option>
            <option value="degree-desc">Degree (highest first)</option>
            <option value="degree-asc">Degree (lowest first)</option>
            <option value="sets">Set order</option>
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
            <span className="dv-label">Minimum intersection size</span>
            {maxAllIntersectionSize > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                max in data: {maxAllIntersectionSize.toLocaleString()}
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
          <span className="dv-label">Minimum degree</span>
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
            <span className="dv-label">Maximum degree</span>
            {activeSetNames.length > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                max in data: {activeSetNames.length.toLocaleString()}
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
      </ControlSection>

      <ControlSection title="Display">
        <SliderControl
          label="Bar opacity"
          value={vis.barOpacity}
          min={0.3}
          max={1}
          step={0.05}
          onChange={sv("barOpacity")}
        />
        <SliderControl
          label="Dot size"
          value={vis.dotSize}
          min={3}
          max={12}
          step={1}
          onChange={sv("dotSize")}
        />
        <SliderControl
          label="Font size"
          value={vis.fontSize}
          min={8}
          max={20}
          step={1}
          onChange={sv("fontSize")}
        />
        <div>
          <div className="dv-label">Intersection size labels</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["off", "on"] as const).map((mode) => {
              const on = vis.showIntersectionLabels !== false;
              const active = mode === "on" ? on : !on;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showIntersectionLabels: mode === "on" })}
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
        <div>
          <div className="dv-label">Set size labels</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["off", "on"] as const).map((mode) => {
              const on = vis.showSetSizeLabels !== false;
              const active = mode === "on" ? on : !on;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showSetSizeLabels: mode === "on" })}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="dv-label">Background</span>
          <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
        </div>
      </ControlSection>

      <ControlSection title="Statistics">
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">Universe size (N)</span>
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
                title="Revert to the union of uploaded items"
              >
                Reset to |∪|={defaultUniverseSize}
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
            Defaults to the union of uploaded items (|∪|). Override with the genome / proteome /
            predefined background for real enrichment analyses — a smaller universe inflates
            p-values.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="dv-label">Intersection statistics</div>
          <button
            type="button"
            className="dv-btn dv-btn-primary"
            onClick={computeAllIntersectionStats}
            disabled={computingStats || !universeValid || allIntersectionsCount === 0}
            title={
              !universeValid
                ? "Set a Universe size above before computing stats"
                : computingStats
                  ? "Computing…"
                  : `Run the SuperExactTest exact test for every one of the ${allIntersectionsCount} intersections in the active set selection and BH-adjust across them. Display filters (minimum size / degree) do NOT change which intersections are tested.`
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
                Computing {computeProgress.done}/{computeProgress.total}…
              </>
            ) : intersectionTestsCount > 0 ? (
              `Recompute stats (${allIntersectionsCount} intersections)`
            ) : (
              `Compute stats (${allIntersectionsCount} intersections)`
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
              Clear {intersectionTestsCount} cached{" "}
              {intersectionTestsCount === 1 ? "result" : "results"}
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
            Computes the exact Binomial p (upper tail, lower tail, and the headline two-sided =
            smaller tail × 2) per intersection, then BH-adjusts each family across every
            intersection in the active set selection. Display filters (minimum size / degree) only
            affect what's shown on the plot — they never change the BH family.
          </p>
          <style>{`@keyframes dv-spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        <div>
          <div className="dv-label">Significance markers</div>
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
                ["off", "Off"],
                ["stars", "Stars"],
                ["p-value", "p-value"],
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
            Only tested intersections are marked. Uses the two-sided p (smaller tail × 2, BH-
            adjusted across every test run this session), so both enrichment and depletion show up.
          </p>
        </div>

        <div>
          <div className="dv-label">Color bars by significance</div>
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
                [false, "Off"],
                [true, "On"],
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
            <span style={{ color: BAR_FILL_ENRICHED, fontWeight: 700 }}>Green</span> = enriched.{" "}
            <span style={{ color: BAR_FILL_DEPLETED, fontWeight: 700 }}>Dark red</span> = depleted.
            Both at two-sided p_adj &lt; 0.05, direction from the sign of observed − expected.
            Untested or non-significant bars stay black.
          </p>
        </div>
      </ControlSection>
    </PlotSidebar>
  );
}

// Wraps the scrollable plot card with edge fade overlays + a hint pill so a
// user who doesn't notice the browser's scrollbar still sees the content is
// scrollable. Measures the inner element with a ResizeObserver + onScroll.

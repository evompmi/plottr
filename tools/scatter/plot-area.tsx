// scatter/plot-area.tsx — PlotStep: composes the chart, the sidebar
// controls, and the per-row regression / filter / mapping panels.

import { ScatterChart } from "./chart";
import { PaletteStrip, ShapePreview } from "./shapes";
import { AesBox, ControlSection } from "./steps";
import { fmtTick, SHAPES } from "./helpers";
import { PlotSidebar } from "../_shell/PlotSidebar";
import { DownloadTiles } from "../_shell/DownloadTiles";

const { useState, useRef, useEffect } = React;

export function PlotStep({
  parsed,
  fileName,
  filteredData,
  filteredRawRows,
  activeColIdxs,
  xCol,
  setXCol,
  yCol,
  setYCol,
  numericCols,
  pointColor,
  setPointColor,
  pointSize,
  setPointSize,
  pointOpacity,
  setPointOpacity,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  colorMapCol,
  setColorMapCol,
  colorMapType,
  colorMapPalette,
  setColorMapPalette,
  colorMapDiscrete,
  setColorMapDiscrete,
  colorMapCategories,
  colorMapRange,
  sizeMapCol,
  setSizeMapCol,
  sizeMapType,
  sizeMapMin,
  setSizeMapMin,
  sizeMapMax,
  setSizeMapMax,
  sizeMapDiscrete,
  setSizeMapDiscrete,
  sizeMapCategories,
  sizeMapRange,
  shapeMapCol,
  setShapeMapCol,
  shapeMapCategories,
  shapeMapDiscrete,
  setShapeMapDiscrete,
  shapeWarning,
  vis,
  updVis,
  autoAxis,
  effAxis,
  refLines,
  addRefLine,
  updateRefLine,
  removeRefLine,
  regression,
  updRegression,
  regressionStats,
  filterState,
  setFilterState,
  filterableCols,
  uniqueVals,
  mappableCols,
  resetAll,
  svgRef,
  svgLegend,
}: any) {
  const hasColorMap = colorMapCol != null;
  const hasSizeMap = sizeMapCol != null;
  const hasShapeMap = shapeMapCol != null;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersPanelRef = useRef(null);
  useEffect(() => {
    if (!filtersOpen) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(filtersPanelRef.current));
  }, [filtersOpen]);
  const handleFilterToggle = (ci: number, v: string, vals: string[], checked: boolean) => {
    setFilterState((prev: Record<number, string[]>) => {
      const curr = prev[ci] || [];
      if (curr.length === 0) {
        return { ...prev, [ci]: vals.filter((x) => x !== v) };
      } else if (checked) {
        const next = [...curr, v];
        return { ...prev, [ci]: next.length === vals.length ? [] : next };
      } else {
        return { ...prev, [ci]: curr.filter((x) => x !== v) };
      }
    });
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* LEFT: controls panel */}
      <PlotSidebar>
        {/* Actions */}
        <DownloadTiles
          chartRef={svgRef}
          fileStem={`${fileBaseName(fileName, "scatter")}_scatter`}
          onReset={resetAll}
          extraDownloads={[
            {
              label: "CSV",
              title:
                "Download the filtered data table — only the columns and rows currently drawn on the plot",
              onClick: () =>
                downloadCsv(
                  activeColIdxs.map((i: number) => parsed.headers[i]),
                  filteredRawRows.map((r: any) => activeColIdxs.map((i: number) => r[i])),
                  `${fileBaseName(fileName, "scatter")}_scatter.csv`
                ),
            },
          ]}
        />

        {/* X / Y selection */}
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
          </div>
        </div>

        {/* Point defaults */}
        <ControlSection title="Point style" defaultOpen>
          {!hasColorMap && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Color</span>
              <ColorInput value={pointColor} onChange={setPointColor} size={22} />
            </div>
          )}
          {!hasSizeMap && (
            <SliderControl
              label="Size"
              value={pointSize}
              min={1}
              max={20}
              step={0.5}
              onChange={setPointSize}
            />
          )}
          <SliderControl
            label="Opacity"
            value={pointOpacity}
            displayValue={pointOpacity.toFixed(2)}
            min={0.05}
            max={1}
            step={0.05}
            onChange={setPointOpacity}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Stroke</span>
            <ColorInput value={strokeColor} onChange={setStrokeColor} size={20} />
          </div>
          <SliderControl
            label="Stroke width"
            value={strokeWidth}
            min={0}
            max={3}
            step={0.25}
            onChange={setStrokeWidth}
          />
        </ControlSection>

        {/* Regression / trend line */}
        <div className="dv-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: regression.on ? 10 : 0,
            }}
          >
            <p className="dv-tile-title" style={{ margin: 0 }}>
              Regression line
            </p>
            <div
              style={{
                display: "flex",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-strong)",
                flexShrink: 0,
              }}
            >
              {(["off", "on"] as const).map((mode) => {
                const active = mode === "on" ? regression.on : !regression.on;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updRegression({ on: mode === "on" })}
                    style={{
                      padding: "4px 12px",
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
          {regression.on && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {!regressionStats.valid && (
                <div style={{ fontSize: 11, color: "var(--danger-text)" }}>
                  Need ≥ 2 points with variation in X.
                </div>
              )}
              {regressionStats.valid && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                    padding: "6px 8px",
                    background: "var(--surface-subtle)",
                    borderRadius: 4,
                    border: "1px solid #eee",
                  }}
                >
                  <div>
                    slope: <strong>{fmtTick(regressionStats.slope)}</strong>
                  </div>
                  <div>
                    intercept: <strong>{fmtTick(regressionStats.intercept)}</strong>
                  </div>
                  <div>
                    R²:{" "}
                    <strong>
                      {Number.isFinite(regressionStats.r2)
                        ? regressionStats.r2.toFixed(4)
                        : "undefined"}
                    </strong>{" "}
                    &nbsp; n = {regressionStats.n}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Color</span>
                <ColorInput
                  value={regression.color}
                  onChange={(v) => updRegression({ color: v })}
                  size={22}
                />
              </div>
              <SliderControl
                label="Width"
                value={regression.strokeWidth}
                min={0.5}
                max={6}
                step={0.25}
                onChange={(v) => updRegression({ strokeWidth: v })}
              />
              <div>
                <span className="dv-label">Dashed</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? regression.dashed : !regression.dashed;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updRegression({ dashed: mode === "on" })}
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
                <span className="dv-label">Show equation &amp; R² on plot</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? regression.showStats : !regression.showStats;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updRegression({ showStats: mode === "on" })}
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
              {regression.showStats && (
                <div>
                  <div className="dv-label">Label position</div>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 6,
                      overflow: "hidden",
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    {(["tl", "tr", "bl", "br"] as const).map((pos) => {
                      const active = regression.position === pos;
                      const cx = pos === "tl" || pos === "bl" ? 6 : 18;
                      const cy = pos === "tl" || pos === "tr" ? 5 : 13;
                      const fg = active ? "var(--on-accent)" : "var(--text-muted)";
                      return (
                        <button
                          key={pos}
                          type="button"
                          title={
                            pos === "tl"
                              ? "top-left"
                              : pos === "tr"
                                ? "top-right"
                                : pos === "bl"
                                  ? "bottom-left"
                                  : "bottom-right"
                          }
                          onClick={() => updRegression({ position: pos })}
                          style={{
                            flex: 1,
                            padding: "5px 0 3px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            border: "none",
                            background: active ? "var(--accent-primary)" : "var(--surface)",
                            transition: "background 120ms ease, color 120ms ease",
                          }}
                        >
                          <svg width={24} height={18} viewBox="0 0 24 18" aria-hidden="true">
                            <rect
                              x={1}
                              y={1}
                              width={22}
                              height={16}
                              fill="none"
                              stroke={fg}
                              strokeWidth={1.2}
                              rx={1.5}
                            />
                            <circle cx={cx} cy={cy} r={2.2} fill={fg} />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reference lines */}
        <ControlSection title="Reference line">
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => addRefLine("h")}
              className="dv-btn dv-btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              + H
            </button>
            <button
              onClick={() => addRefLine("v")}
              className="dv-btn dv-btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              + V
            </button>
          </div>
          {refLines.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
              No reference lines.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {refLines.map((rl: any) => (
              <div
                key={rl.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "8px 10px",
                  background: "var(--surface-subtle)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: "var(--info-bg)",
                      color: "var(--info-text)",
                    }}
                  >
                    {rl.dir === "h" ? "Y =" : "X ="}
                  </span>
                  <NumberInput
                    value={rl.value}
                    step="any"
                    onChange={(e) => updateRefLine(rl.id, "value", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => removeRefLine(rl.id)}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 5,
                      fontSize: 12,
                      cursor: "pointer",
                      background: "var(--surface)",
                      border: "1px solid var(--danger-border)",
                      color: "var(--danger-text)",
                      fontFamily: "inherit",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <ColorInput
                  value={rl.color}
                  onChange={(v) => updateRefLine(rl.id, "color", v)}
                  size={22}
                />
                <SliderControl
                  label="Width"
                  value={rl.strokeWidth}
                  min={0.5}
                  max={6}
                  step={0.25}
                  onChange={(v) => updateRefLine(rl.id, "strokeWidth", v)}
                />
                <div>
                  <span className="dv-label">Dashed</span>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 6,
                      overflow: "hidden",
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    {(["off", "on"] as const).map((mode) => {
                      const active = mode === "on" ? rl.dashed : !rl.dashed;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => updateRefLine(rl.id, "dashed", mode === "on")}
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
                {rl.dashed && (
                  <select
                    value={rl.dashArray}
                    onChange={(e) => updateRefLine(rl.id, "dashArray", e.target.value)}
                    className="dv-select"
                    style={{ fontSize: 11, width: "100%" }}
                  >
                    <option value="7,4">— — —</option>
                    <option value="3,3">· · · ·</option>
                    <option value="12,4">—— ——</option>
                    <option value="10,4,2,4">— · — ·</option>
                    <option value="2,2">·· ··</option>
                  </select>
                )}
                <input
                  value={rl.label}
                  placeholder="label"
                  onChange={(e) => updateRefLine(rl.id, "label", e.target.value)}
                  className="dv-input-num"
                  style={{ width: "100%", textAlign: "left" }}
                />
                {rl.label && (
                  <select
                    value={rl.labelSide}
                    onChange={(e) => updateRefLine(rl.id, "labelSide", e.target.value)}
                    className="dv-select"
                    style={{ fontSize: 11, width: "100%" }}
                  >
                    {rl.dir === "h" ? (
                      <>
                        <option value="right">right</option>
                        <option value="left">left</option>
                      </>
                    ) : (
                      <>
                        <option value="top">top</option>
                        <option value="bottom">bottom</option>
                      </>
                    )}
                  </select>
                )}
              </div>
            ))}
          </div>
        </ControlSection>

        {/* ── Color aesthetic ── */}
        <AesBox theme="color">
          <select
            value={colorMapCol == null ? "" : colorMapCol}
            onChange={(e) =>
              setColorMapCol(e.target.value === "" ? null : parseInt(e.target.value))
            }
            className="dv-select"
            style={{ width: "100%", marginBottom: hasColorMap ? 8 : 0 }}
          >
            <option value="">— None —</option>
            {mappableCols
              .filter((i: number) => i !== sizeMapCol && i !== shapeMapCol)
              .map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
          </select>

          {hasColorMap && colorMapType && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Detected:{" "}
                <strong
                  style={{
                    color:
                      colorMapType === "continuous" ? "var(--accent-dna)" : "var(--accent-blue)",
                  }}
                >
                  {colorMapType === "continuous"
                    ? "numeric (continuous)"
                    : `categorical (${colorMapCategories.length} groups)`}
                </strong>
              </div>

              {colorMapType === "continuous" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <select
                    value={colorMapPalette}
                    onChange={(e) => setColorMapPalette(e.target.value)}
                    className="dv-select"
                    style={{ width: "100%", fontSize: 11 }}
                  >
                    {Object.keys(COLOR_PALETTES).map((p: any) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <PaletteStrip palette={colorMapPalette} />
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    range: {fmtTick(colorMapRange[0])} → {fmtTick(colorMapRange[1])}
                  </span>
                </div>
              )}

              {colorMapType === "discrete" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <DiscretePaletteRow
                    value={vis.discretePalette || "okabe-ito"}
                    onChange={(next: string) => {
                      updVis({ discretePalette: next });
                      setColorMapDiscrete(applyDiscretePalette(next, colorMapCategories));
                    }}
                    names={colorMapCategories}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 160,
                      overflowY: "auto",
                    }}
                  >
                    {colorMapCategories.map((cat: string, ci: number) => (
                      <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <ColorInput
                          value={colorMapDiscrete[cat] || PALETTE[ci % PALETTE.length]}
                          onChange={(v) =>
                            setColorMapDiscrete((prev: any) => ({ ...prev, [cat]: v }))
                          }
                          size={18}
                        />
                        <span style={{ fontSize: 12, color: "var(--text)" }}>{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </AesBox>

        {/* ── Size aesthetic ── */}
        <AesBox theme="size">
          <select
            value={sizeMapCol == null ? "" : sizeMapCol}
            onChange={(e) => setSizeMapCol(e.target.value === "" ? null : parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%", marginBottom: hasSizeMap ? 8 : 0 }}
          >
            <option value="">— None —</option>
            {mappableCols
              .filter((i: number) => i !== colorMapCol && i !== shapeMapCol)
              .map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
          </select>

          {hasSizeMap && sizeMapType && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Detected:{" "}
                <strong
                  style={{
                    color:
                      sizeMapType === "continuous" ? "var(--accent-dna)" : "var(--accent-blue)",
                  }}
                >
                  {sizeMapType === "continuous"
                    ? "numeric (continuous)"
                    : `categorical (${sizeMapCategories.length} groups)`}
                </strong>
              </div>

              {sizeMapType === "continuous" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <SliderControl
                    label="Min size"
                    value={sizeMapMin}
                    min={1}
                    max={20}
                    step={0.5}
                    onChange={setSizeMapMin}
                  />
                  <SliderControl
                    label="Max size"
                    value={sizeMapMax}
                    min={1}
                    max={30}
                    step={0.5}
                    onChange={setSizeMapMax}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    range: {fmtTick(sizeMapRange[0])} → {fmtTick(sizeMapRange[1])}
                  </span>
                </div>
              )}

              {sizeMapType === "discrete" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  {sizeMapCategories.map((cat: string) => {
                    const val = sizeMapDiscrete[cat] !== undefined ? sizeMapDiscrete[cat] : 5;
                    return (
                      <SliderControl
                        key={cat}
                        label={cat}
                        value={val}
                        min={1}
                        max={20}
                        step={0.5}
                        onChange={(v) => setSizeMapDiscrete((prev: any) => ({ ...prev, [cat]: v }))}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </AesBox>

        {/* ── Shape aesthetic ── */}
        <AesBox theme="shape">
          <select
            value={shapeMapCol == null ? "" : shapeMapCol}
            onChange={(e) =>
              setShapeMapCol(e.target.value === "" ? null : parseInt(e.target.value))
            }
            className="dv-select"
            style={{ width: "100%", marginBottom: hasShapeMap ? 8 : 0 }}
          >
            <option value="">— None —</option>
            {mappableCols
              .filter((i: number) => i !== colorMapCol && i !== sizeMapCol)
              .map((i: number) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
          </select>

          {hasShapeMap && (
            <>
              {shapeWarning && (
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "var(--danger-bg)",
                    border: "1px solid #fca5a5",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--danger-text)" }}>{shapeWarning}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                {shapeMapCategories.map((cat: string, ci: number) => (
                  <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length]}
                      onChange={(e) =>
                        setShapeMapDiscrete((prev: any) => ({ ...prev, [cat]: e.target.value }))
                      }
                      className="dv-select"
                      style={{ fontSize: 11, width: 90 }}
                    >
                      {SHAPES.map((s: any) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ShapePreview
                      shape={shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length]}
                      color="#666"
                    />
                    <span style={{ fontSize: 12, color: "var(--text)" }}>{cat}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </AesBox>

        {/* Axes */}
        <ControlSection title="Axes">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="dv-label">X min</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.xMin != null ? vis.xMin : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.xMin) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ xMin: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="dv-label">X max</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.xMax != null ? vis.xMax : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.xMax) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ xMax: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="dv-label">Y min</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.yMin != null ? vis.yMin : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.yMin) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ yMin: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="dv-label">Y max</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.yMax != null ? vis.yMax : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.yMax) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ yMax: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div>
              <div className="dv-label">X label</div>
              <input
                value={vis.xLabel}
                onChange={(e) => updVis({ xLabel: e.target.value })}
                className="dv-input-num"
                style={{ width: "100%", textAlign: "left" }}
              />
            </div>
            <div>
              <div className="dv-label">Y label</div>
              <input
                value={vis.yLabel}
                onChange={(e) => updVis({ yLabel: e.target.value })}
                className="dv-input-num"
                style={{ width: "100%", textAlign: "left" }}
              />
            </div>
            <div>
              <div className="dv-label">Title</div>
              <input
                value={vis.plotTitle}
                onChange={(e) => updVis({ plotTitle: e.target.value })}
                className="dv-input-num"
                style={{ width: "100%", textAlign: "left" }}
              />
            </div>
          </div>
        </ControlSection>

        {/* Style */}
        <ControlSection title="Style">
          <BaseStyleControls
            plotBg={vis.plotBg}
            onPlotBgChange={(v) => updVis({ plotBg: v })}
            showGrid={vis.showGrid}
            onShowGridChange={(v) => updVis({ showGrid: v })}
            gridColor={vis.gridColor}
            onGridColorChange={(v) => updVis({ gridColor: v })}
          />
        </ControlSection>

        {/* Filters (collapsible) */}
        {filterableCols.length > 0 && (
          <div ref={filtersPanelRef} className="dv-panel">
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <span
                className={"dv-disclosure" + (filtersOpen ? " dv-disclosure-open" : "")}
                aria-hidden="true"
              />
              <p className="dv-tile-title" style={{ margin: 0 }}>
                Filters
              </p>
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {filteredData.length} of {parsed.data.length} rows
              </span>
            </div>
            {filtersOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 10,
                  maxHeight: 300,
                  overflowY: "auto",
                }}
              >
                {filterableCols.map((ci: number) => {
                  const vals = uniqueVals(ci);
                  if (vals.length === 0 || vals.length > 30) return null;
                  const allowed = filterState[ci] || [];
                  const allChecked = allowed.length === 0;
                  return (
                    <div key={ci}>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                          {parsed.headers[ci]}
                        </span>
                        <button
                          onClick={() => setFilterState((prev: any) => ({ ...prev, [ci]: [] }))}
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 4,
                            cursor: "pointer",
                            border: "1px solid #ccc",
                            background: "var(--surface-sunken)",
                            color: "var(--text-muted)",
                            fontFamily: "inherit",
                          }}
                        >
                          all
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {vals.map((v: any) => {
                          const checked = allChecked || allowed.includes(v);
                          return (
                            <label
                              key={v}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: checked ? "var(--info-bg)" : "var(--surface-subtle)",
                                border: `1px solid ${checked ? "var(--info-border)" : "var(--border)"}`,
                                cursor: "pointer",
                                color: checked ? "var(--info-text)" : "var(--text-faint)",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => handleFilterToggle(ci, v, vals, e.target.checked)}
                                style={{ accentColor: "var(--cta-primary-bg)", margin: 0 }}
                              />
                              {v}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </PlotSidebar>

      {/* RIGHT: chart area */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          <ScatterChart
            ref={svgRef}
            data={filteredData}
            rawData={filteredRawRows}
            xCol={xCol}
            yCol={yCol}
            xMin={effAxis.xMin}
            xMax={effAxis.xMax}
            yMin={effAxis.yMin}
            yMax={effAxis.yMax}
            xLabel={vis.xLabel}
            yLabel={vis.yLabel}
            title={vis.plotTitle}
            plotBg={vis.plotBg}
            showGrid={vis.showGrid}
            gridColor={vis.gridColor}
            refLines={refLines}
            regression={regression}
            regressionStats={regressionStats}
            pointColor={pointColor}
            pointSize={pointSize}
            pointOpacity={pointOpacity}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            colorMapCol={colorMapCol}
            colorMapType={colorMapType}
            colorMapPalette={colorMapPalette}
            colorMapDiscrete={colorMapDiscrete}
            colorMapRange={colorMapRange}
            sizeMapCol={sizeMapCol}
            sizeMapType={sizeMapType}
            sizeMapMin={sizeMapMin}
            sizeMapMax={sizeMapMax}
            sizeMapDiscrete={sizeMapDiscrete}
            sizeMapRange={sizeMapRange}
            shapeMapCol={shapeMapCol}
            shapeMapDiscrete={shapeMapDiscrete}
            svgLegend={svgLegend}
          />
        </div>
      </div>
    </div>
  );
}

// Sidebar plot controls for the aequorin tool: ControlSection + SubHeading
// primitives and the full PlotControls panel (conditions tile, axes,
// labels, style, summary-barplot sub-panel). ConditionEditor lives beside
// PlotPanel in ./plot-area — it is imported here and consumed from the
// Conditions tile. Shared UI (ActionsPanel, SliderControl, BaseStyleControls,
// ColorInput, NumberInput, scrollDisclosureIntoView) resolves through
// shared.bundle.js; TIME_UNITS comes from ./helpers.

import { PlotSidebar } from "../_shell/PlotSidebar";
import { TIME_UNITS, convertTime } from "./helpers";
import { ConditionEditor } from "./plot-area";

const { useState, useRef, useEffect } = React;

export function ControlSection({
  title,
  defaultOpen = false,
  headerRight,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ marginBottom: 0, padding: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "7px 10px",
          gap: 8,
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="dv-tile-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            padding: 0,
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
        {headerRight}
      </div>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function SubHeading({ children }: { children?: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "10px 0 2px",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-muted)",
        paddingLeft: 8,
        borderLeft: "3px solid var(--accent-primary)",
      }}
    >
      {children}
    </p>
  );
}

export function PlotControls({
  conditions,
  setConditions,
  vis,
  updVis,
  plotPanelRef,
  downloadCalibrated,
  resetAll,
}) {
  // X start / X end are stored in `vis` as row indices (integers — used to
  // slice calData rows downstream). The chart converts them to display-unit
  // time via `displayX = xRow * timeStep * convFactor`. The input fields
  // here mirror the same conversion so what the user types matches the
  // axis they see, and switching Display unit re-renders the input value
  // in the new unit. Round-trip is row → display → row; storage stays as
  // row indices so saved prefs and the `Math.floor(vis.xStart)` slicing
  // logic at index.tsx:179 keep working.
  const ts = vis.timeStep || 1;
  const bUnit = vis.baseUnit || "s";
  const dUnit = vis.displayUnit || bUnit;
  const tsConv = ts * convertTime(1, bUnit, dUnit);
  const tsConvSafe = tsConv || 1;
  const displayXStart = vis.xStart * tsConv;
  const displayXEnd = vis.xEnd * tsConv;
  const unitLabel = (TIME_UNITS.find((u) => u.key === dUnit) || { key: dUnit }).key;

  return (
    <PlotSidebar>
      {/* Actions tile */}
      <ActionsPanel
        onDownloadSvg={() => {
          plotPanelRef.current?.downloadMain();
        }}
        onDownloadPng={() => {
          plotPanelRef.current?.downloadMainPng();
        }}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "CSV",
            title:
              "Download calibrated [Ca²⁺] over time — one row per time-point, one column per sample (calibration applied)",
            onClick: () => downloadCalibrated(),
          },
        ]}
      />

      {/* Conditions */}
      <ControlSection title="Conditions" defaultOpen>
        <ConditionEditor conditions={conditions} onChange={setConditions} />
      </ControlSection>

      {/* Axes */}
      <ControlSection title="Axes">
        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">X start ({unitLabel})</span>
            <NumberInput
              value={displayXStart}
              onChange={(e) => updVis({ xStart: Number(e.target.value) / tsConvSafe })}
              style={{ width: "100%" }}
              step="any"
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">X end ({unitLabel})</span>
            <NumberInput
              value={displayXEnd}
              onChange={(e) => updVis({ xEnd: Number(e.target.value) / tsConvSafe })}
              style={{ width: "100%" }}
              step="any"
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">Y min</span>
            <NumberInput
              value={vis.yMin}
              onChange={(e) => updVis({ yMin: Number(e.target.value), autoYRange: false })}
              style={{ width: "100%" }}
              step="0.1"
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">Y max</span>
            <NumberInput
              value={vis.yMax}
              onChange={(e) => updVis({ yMax: Number(e.target.value), autoYRange: false })}
              style={{ width: "100%" }}
              step="0.1"
            />
          </label>
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            onClick={() => updVis({ autoYRange: true })}
            disabled={vis.autoYRange !== false}
            title={
              vis.autoYRange === false
                ? "Re-enable auto-scaling of Y to the visible X window"
                : "Auto-scaling is on — Y follows the visible X window"
            }
            style={{ height: 28, padding: "0 10px", whiteSpace: "nowrap" }}
          >
            {vis.autoYRange === false ? "Auto" : "Auto ✓"}
          </button>
        </div>
        <SliderControl
          label="Smooth (±pts)"
          value={vis.smoothWidth}
          displayValue={`${vis.smoothWidth} pts`}
          min={0}
          max={20}
          step={1}
          onChange={(v) => updVis({ smoothWidth: v })}
        />
        <label style={{ display: "block" }}>
          <span className="dv-label">Display unit</span>
          <select
            value={vis.displayUnit}
            onChange={(e) => updVis({ displayUnit: e.target.value })}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {TIME_UNITS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      </ControlSection>

      {/* Labels */}
      <ControlSection title="Labels">
        <label style={{ display: "block" }}>
          <span className="dv-label">Title</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input-num"
            style={{ width: "100%", textAlign: "left" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Subtitle</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input-num"
            style={{ width: "100%", textAlign: "left" }}
          />
        </label>
      </ControlSection>

      {/* Style controls */}
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
          onChange={(v) => updVis({ lineWidth: v })}
        />
        <SliderControl
          label="SD opacity"
          value={vis.ribbonOpacity}
          displayValue={vis.ribbonOpacity.toFixed(2)}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updVis({ ribbonOpacity: v })}
        />
      </ControlSection>

      {/* Barplot controls */}
      <ControlSection
        title="Summary barplot"
        headerRight={
          <div
            style={{
              display: "flex",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
            title="Barplot of the sum (Σ) of plotted values per condition"
          >
            {(["off", "on"] as const).map((mode) => {
              const active = mode === "on" ? vis.showInset : !vis.showInset;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showInset: mode === "on" })}
                  style={{
                    padding: "2px 8px",
                    fontSize: 10,
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
        }
      >
        {vis.showInset && (
          <>
            <SubHeading>Layout</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "block" }}>
                <span className="dv-label">Y min</span>
                <input
                  value={vis.insetYMinCustom}
                  onChange={(e) => updVis({ insetYMinCustom: e.target.value })}
                  className="dv-input-num"
                  style={{ width: "100%", textAlign: "left" }}
                  placeholder="auto"
                />
              </label>
              <label style={{ display: "block" }}>
                <span className="dv-label">Y max</span>
                <input
                  value={vis.insetYMaxCustom}
                  onChange={(e) => updVis({ insetYMaxCustom: e.target.value })}
                  className="dv-input-num"
                  style={{ width: "100%", textAlign: "left" }}
                  placeholder="auto"
                />
              </label>
              <div>
                <span className="dv-label">Grid</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? vis.insetShowGrid : !vis.insetShowGrid;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updVis({ insetShowGrid: mode === "on" })}
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
              {vis.insetShowGrid && (
                <label style={{ display: "block" }}>
                  <span className="dv-label">Grid color</span>
                  <ColorInput
                    value={vis.insetGridColor}
                    onChange={(v) => updVis({ insetGridColor: v })}
                    size={24}
                  />
                </label>
              )}
              <SliderControl
                label="X label angle"
                value={vis.insetXLabelAngle}
                displayValue={`${vis.insetXLabelAngle}°`}
                min={-90}
                max={0}
                step={5}
                onChange={(v) => updVis({ insetXLabelAngle: v })}
              />
            </div>

            <SliderControl
              label="Bar width"
              value={vis.insetBarWidth}
              displayValue={`${vis.insetBarWidth}%`}
              min={20}
              max={100}
              step={5}
              onChange={(v) => updVis({ insetBarWidth: v })}
            />
            <SliderControl
              label="Bar gap"
              value={vis.insetBarGap}
              displayValue={`${vis.insetBarGap}%`}
              min={0}
              max={80}
              step={5}
              onChange={(v) => updVis({ insetBarGap: v })}
            />
            <SliderControl
              label="Bar fill opacity"
              value={vis.insetFillOpacity}
              displayValue={vis.insetFillOpacity.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => updVis({ insetFillOpacity: v })}
            />
            <div>
              <span className="dv-label">Bar outline</span>
              <div
                style={{
                  display: "flex",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border-strong)",
                }}
              >
                {(["off", "on"] as const).map((mode) => {
                  const active = mode === "on" ? vis.insetShowBarOutline : !vis.insetShowBarOutline;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updVis({ insetShowBarOutline: mode === "on" })}
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
            {vis.insetShowBarOutline && (
              <>
                <SliderControl
                  label="Outline width"
                  value={vis.insetBarStrokeWidth}
                  displayValue={vis.insetBarStrokeWidth.toFixed(1)}
                  min={0.2}
                  max={4}
                  step={0.1}
                  onChange={(v) => updVis({ insetBarStrokeWidth: v })}
                />
                <label style={{ display: "block" }}>
                  <span className="dv-label">Outline color</span>
                  <ColorInput
                    value={vis.insetBarOutlineColor}
                    onChange={(v) => updVis({ insetBarOutlineColor: v })}
                    size={24}
                  />
                </label>
              </>
            )}

            <SubHeading>Error bars</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <span className="dv-label">Type</span>
                <div className="dv-seg" role="group" aria-label="Error bars">
                  {(["none", "sem", "sd", "ci95"] as const).map((mode) => {
                    const active = vis.insetErrorType === mode;
                    const label =
                      mode === "none"
                        ? "None"
                        : mode === "sem"
                          ? "SEM"
                          : mode === "sd"
                            ? "SD"
                            : "95% CI";
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
                        onClick={() => updVis({ insetErrorType: mode })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {vis.insetErrorType !== "none" && (
                <SliderControl
                  label="Error stroke width"
                  value={vis.insetErrorStrokeWidth}
                  min={0.2}
                  max={3}
                  step={0.1}
                  onChange={(v) => updVis({ insetErrorStrokeWidth: v })}
                />
              )}
            </div>

            <SubHeading>Points</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <span className="dv-label">Show</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? vis.insetShowPoints : !vis.insetShowPoints;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updVis({ insetShowPoints: mode === "on" })}
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
              {vis.insetShowPoints && (
                <>
                  <label style={{ display: "block" }}>
                    <span className="dv-label">Color</span>
                    <ColorInput
                      value={vis.insetPointColor}
                      onChange={(v) => updVis({ insetPointColor: v })}
                      size={24}
                    />
                  </label>
                  <SliderControl
                    label="Size"
                    value={vis.insetPointSize}
                    displayValue={vis.insetPointSize}
                    min={1}
                    max={6}
                    step={0.5}
                    onChange={(v) => updVis({ insetPointSize: v })}
                  />
                </>
              )}
            </div>
          </>
        )}
      </ControlSection>
    </PlotSidebar>
  );
}

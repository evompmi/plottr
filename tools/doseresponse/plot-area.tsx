// doseresponse/plot-area.tsx — composes the chart with the sidebar
// (column-role pickers, model + transform options, parameter lock editor,
// style / axis controls, per-condition palette).

import { DoseResponseChart } from "./chart";
import { ControlSection } from "./steps";
import { ToggleRow, SegmentedRow } from "./controls";
import {
  CURVE_PALETTE,
  DEFAULT_PARAM_LOCKS,
  DoseResponseModel,
  DoseUnit,
  NormalisationMode,
  PARAM_KEYS,
  ParamKey,
  ParamLocks,
  PlotStepProps,
  WeightingMode,
  ZeroDoseMode,
  fmtEC50,
  fmtNum,
} from "./helpers";
import {
  BaseStyleControls,
  ColorInput,
  DownloadTiles,
  NumberInput,
  PlotSidebar,
  SliderControl,
} from "../_shell";

const MODEL_OPTS: ReadonlyArray<{ value: DoseResponseModel; label: string }> = [
  { value: "4PL", label: "4PL" },
  { value: "3PL", label: "3PL (Hill = 1)" },
];
const DOSE_UNIT_OPTS: ReadonlyArray<{ value: DoseUnit; label: string }> = [
  { value: "raw", label: "Raw conc." },
  { value: "log10", label: "log₁₀" },
];
const ZERO_DOSE_OPTS: ReadonlyArray<{ value: ZeroDoseMode; label: string }> = [
  { value: "drop", label: "Drop" },
  { value: "reference", label: "Off-axis" },
  { value: "floor", label: "Floor" },
];
const NORM_OPTS: ReadonlyArray<{ value: NormalisationMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "pct-max", label: "% max" },
  { value: "min-max", label: "min–max" },
  { value: "user", label: "Custom" },
];
const WEIGHT_OPTS: ReadonlyArray<{ value: WeightingMode; label: string }> = [
  { value: "equal", label: "Equal" },
  { value: "inv-y2", label: "1/Y²" },
  { value: "inv-sd2", label: "1/SD²" },
];

function applyModel(model: DoseResponseModel, locks: ParamLocks): ParamLocks {
  if (model === "3PL") {
    return {
      ...locks,
      hillSlope: { fixed: true, value: 1, lower: null, upper: null },
    };
  }
  return locks;
}

export function PlotStep({
  parsed,
  fileName,
  numericCols,
  textCols,
  roles,
  setRoles,
  rows,
  conditions,
  conditionFits,
  sharedTests,
  vis,
  updVis,
  autoAxis,
  effAxis,
  resetAll,
  svgRef,
  svgLegend,
}: PlotStepProps) {
  const updateLock = (key: ParamKey, patch: Partial<ParamLocks[ParamKey]>) => {
    const next: ParamLocks = {
      ...vis.paramLocks,
      [key]: { ...vis.paramLocks[key], ...patch },
    };
    updVis({ paramLocks: next });
  };
  const setModel = (m: DoseResponseModel) => {
    updVis({ model: m, paramLocks: applyModel(m, vis.paramLocks) });
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <PlotSidebar>
        <DownloadTiles
          chartRef={svgRef}
          fileStem={`${fileBaseName(fileName, "doseresponse")}_doseresponse`}
          onReset={resetAll}
          extraDownloads={[
            {
              label: "CSV",
              title:
                "Download the input rows currently feeding the fit (post-filter, pre-transform).",
              onClick: () => {
                const headers = ["dose", "response", "replicate", "condition"];
                const rowsOut = rows.map((r) => [
                  r.dose,
                  r.response,
                  r.replicate ?? "",
                  r.condition,
                ]);
                downloadCsv(
                  headers,
                  rowsOut,
                  `${fileBaseName(fileName, "doseresponse")}_doseresponse.csv`
                );
              },
            },
          ]}
        />

        <div className="dv-panel">
          <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
            Variables
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "block" }}>
              <span className="dv-label">Dose</span>
              <select
                value={roles.doseCol}
                onChange={(e) => setRoles({ ...roles, doseCol: parseInt(e.target.value) })}
                className="dv-select"
                style={{ width: "100%" }}
              >
                {numericCols.map((i) => (
                  <option key={i} value={i}>
                    {parsed.headers[i]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span className="dv-label">Response</span>
              <select
                value={roles.responseCol}
                onChange={(e) => setRoles({ ...roles, responseCol: parseInt(e.target.value) })}
                className="dv-select"
                style={{ width: "100%" }}
              >
                {numericCols.map((i) => (
                  <option key={i} value={i}>
                    {parsed.headers[i]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span className="dv-label">Condition (optional)</span>
              <select
                value={roles.conditionCol == null ? "" : roles.conditionCol}
                onChange={(e) =>
                  setRoles({
                    ...roles,
                    conditionCol: e.target.value === "" ? null : parseInt(e.target.value),
                  })
                }
                className="dv-select"
                style={{ width: "100%" }}
              >
                <option value="">— None —</option>
                {[
                  ...textCols,
                  ...numericCols.filter((i) => i !== roles.doseCol && i !== roles.responseCol),
                ].map((i) => (
                  <option key={i} value={i}>
                    {parsed.headers[i]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span className="dv-label">Replicate (optional)</span>
              <select
                value={roles.replicateCol == null ? "" : roles.replicateCol}
                onChange={(e) =>
                  setRoles({
                    ...roles,
                    replicateCol: e.target.value === "" ? null : parseInt(e.target.value),
                  })
                }
                className="dv-select"
                style={{ width: "100%" }}
              >
                <option value="">— None —</option>
                {[...textCols, ...numericCols].map((i) => (
                  <option key={i} value={i}>
                    {parsed.headers[i]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <ControlSection title="Fit options" defaultOpen>
          <SegmentedRow label="Model" options={MODEL_OPTS} value={vis.model} onChange={setModel} />
          <SegmentedRow
            label="Dose units"
            options={DOSE_UNIT_OPTS}
            value={vis.doseUnit}
            onChange={(v) => updVis({ doseUnit: v })}
          />
          <SegmentedRow
            label="Zero-dose handling"
            options={ZERO_DOSE_OPTS}
            value={vis.zeroDoseMode}
            onChange={(v) => updVis({ zeroDoseMode: v })}
          />
          <SegmentedRow
            label="Normalisation"
            options={NORM_OPTS}
            value={vis.normalisation}
            onChange={(v) => updVis({ normalisation: v })}
          />
          {vis.normalisation === "user" && (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="dv-label">Baseline</div>
                <NumberInput
                  value={vis.normalisationBaseline ?? 0}
                  step="any"
                  onChange={(e) =>
                    updVis({
                      normalisationBaseline: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="dv-label">Top</div>
                <NumberInput
                  value={vis.normalisationTop ?? 100}
                  step="any"
                  onChange={(e) =>
                    updVis({
                      normalisationTop: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}
          <SegmentedRow
            label="Weighting"
            options={WEIGHT_OPTS}
            value={vis.weighting}
            onChange={(v) => updVis({ weighting: v })}
          />
        </ControlSection>

        <ControlSection title="Parameter constraints">
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
            Fix a parameter, or set lower / upper bounds. Most common: fix Top = 100, Bottom = 0
            when data are pre-normalised.
          </div>
          {PARAM_KEYS.map((key) => {
            const lk = vis.paramLocks[key];
            const disabled = vis.model === "3PL" && key === "hillSlope";
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "6px 8px",
                  background: "var(--surface-subtle)",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={lk.fixed}
                      disabled={disabled}
                      onChange={(e) => updateLock(key, { fixed: e.target.checked })}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{key}</span>
                  </label>
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    {disabled ? "fixed at 1 by 3PL" : lk.fixed ? "fixed" : "free"}
                  </span>
                </div>
                {lk.fixed && (
                  <NumberInput
                    value={lk.value ?? 0}
                    step="any"
                    onChange={(e) =>
                      updateLock(key, {
                        value: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    style={{ width: "100%" }}
                  />
                )}
                {!lk.fixed && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="lower"
                      value={lk.lower ?? ""}
                      onChange={(e) =>
                        updateLock(key, {
                          lower: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="dv-input-num"
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="upper"
                      value={lk.upper ?? ""}
                      onChange={(e) =>
                        updateLock(key, {
                          upper: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="dv-input-num"
                      style={{ flex: 1 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => updVis({ paramLocks: applyModel(vis.model, DEFAULT_PARAM_LOCKS) })}
          >
            Reset all
          </button>
        </ControlSection>

        <ControlSection title="Display">
          <ToggleRow
            label="95% CI ribbon"
            value={vis.showCIBand}
            onChange={(v) => updVis({ showCIBand: v })}
          />
          <SliderControl
            label="CI opacity"
            value={vis.ciBandOpacity}
            displayValue={vis.ciBandOpacity.toFixed(2)}
            min={0.05}
            max={0.5}
            step={0.01}
            onChange={(v) => updVis({ ciBandOpacity: v })}
          />
          <ToggleRow
            label="Residuals strip"
            value={vis.showResidualsStrip}
            onChange={(v) => updVis({ showResidualsStrip: v })}
          />
          <ToggleRow
            label="In-SVG parameter table"
            value={vis.showParamTable}
            onChange={(v) => updVis({ showParamTable: v })}
          />
          <SliderControl
            label="Point size"
            value={vis.pointSize}
            min={2}
            max={10}
            step={0.5}
            onChange={(v) => updVis({ pointSize: v })}
          />
          <SliderControl
            label="Point opacity"
            value={vis.pointOpacity}
            displayValue={vis.pointOpacity.toFixed(2)}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => updVis({ pointOpacity: v })}
          />
          <SliderControl
            label="Curve width"
            value={vis.curveStrokeWidth}
            min={1}
            max={4}
            step={0.25}
            onChange={(v) => updVis({ curveStrokeWidth: v })}
          />
        </ControlSection>

        {conditions.length > 0 && (
          <ControlSection title="Per-condition colors">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {conditions.map((c, i) => (
                <div key={c} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <ColorInput
                    value={vis.conditionColors[c] || CURVE_PALETTE[i % CURVE_PALETTE.length]}
                    onChange={(v) =>
                      updVis({ conditionColors: { ...vis.conditionColors, [c]: v } })
                    }
                    size={20}
                  />
                  <span style={{ fontSize: 12, color: "var(--text)" }}>{c}</span>
                </div>
              ))}
            </div>
          </ControlSection>
        )}

        <ControlSection title="Axes">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="dv-label">X min (log₁₀)</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.xMin != null ? vis.xMin : ""}
                  placeholder={`auto (${fmtNum(autoAxis.xMin, 3)})`}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ xMin: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="dv-label">X max (log₁₀)</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.xMax != null ? vis.xMax : ""}
                  placeholder={`auto (${fmtNum(autoAxis.xMax, 3)})`}
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
                  placeholder={`auto (${fmtNum(autoAxis.yMin, 3)})`}
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
                  placeholder={`auto (${fmtNum(autoAxis.yMax, 3)})`}
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

        {/* Per-condition fit summary + warnings */}
        {conditionFits.length > 0 && (
          <div className="dv-panel">
            <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
              Fit summary
            </p>
            {conditionFits.map((cf) => (
              <div
                key={cf.conditionIdx}
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "var(--surface-subtle)",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{cf.condition}</div>
                {!cf.fit.valid && (
                  <div style={{ color: "var(--danger-text)" }}>{cf.fit.reason}</div>
                )}
                {cf.fit.valid && (
                  <>
                    <div>
                      EC50: <strong>{fmtEC50(cf.fit.ec50)}</strong>
                    </div>
                    <div>
                      Hill: <strong>{fmtNum(cf.fit.params.hillSlope, 3)}</strong> · Top:{" "}
                      <strong>{fmtNum(cf.fit.params.top, 3)}</strong> · Bottom:{" "}
                      <strong>{fmtNum(cf.fit.params.bottom, 3)}</strong>
                    </div>
                    <div>
                      R² = {Number.isFinite(cf.fit.r2) ? cf.fit.r2.toFixed(4) : "—"} · n ={" "}
                      {cf.fit.n} · iters = {cf.fit.iterations}
                    </div>
                  </>
                )}
                {cf.fit.warnings.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      marginTop: 4,
                      color: "var(--warning-text)",
                      background: "var(--warning-bg)",
                      borderRadius: 3,
                      padding: "2px 5px",
                    }}
                  >
                    ⚠ {w.message}
                  </div>
                ))}
              </div>
            ))}
            {sharedTests.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "var(--info-bg)",
                  borderRadius: 4,
                  border: "1px solid var(--info-border)",
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--info-text)", marginBottom: 4 }}>
                  Shared-parameter F-tests
                </div>
                {sharedTests.map((t) => (
                  <div key={t.paramKey}>
                    {t.paramKey === "logEC50" ? "Shared EC50" : "Shared Hill"}:{" "}
                    {t.failed
                      ? "fit unavailable"
                      : `F(${t.df1.toFixed(0)}, ${t.df2.toFixed(0)}) = ${fmtNum(t.F, 3)}, p = ${formatP(t.p)} ${t.pStars}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PlotSidebar>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          <DoseResponseChart
            ref={svgRef}
            conditionFits={conditionFits}
            sharedTests={sharedTests}
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
            showCIBand={vis.showCIBand}
            ciBandOpacity={vis.ciBandOpacity}
            showResidualsStrip={vis.showResidualsStrip}
            showParamTable={vis.showParamTable}
            conditionColors={vis.conditionColors}
            pointSize={vis.pointSize}
            pointOpacity={vis.pointOpacity}
            curveStrokeWidth={vis.curveStrokeWidth}
            alpha={vis.alpha}
            svgLegend={svgLegend}
          />
        </div>
      </div>
    </div>
  );
}

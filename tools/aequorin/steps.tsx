// Step components for the aequorin tool (HowToSection, UploadStep,
// ConfigureStep). Stateless presentational wrappers — all state lives in
// App via usePlotToolState or local hooks there. No sibling-module
// imports; shared UI (UploadPanel, DataPreview, NumberInput, …) and
// globals (toolIcon, flashSaved, TIME_UNITS) resolve through
// shared.bundle.js and ./helpers respectively.

import { TIME_UNITS } from "./helpers";
import type { ConfigureStepProps, UploadStepProps } from "./helpers";
import { HowTo } from "../_shell/HowTo";
import { AEQUORIN_HOWTO } from "./howto";

export function HowToSection() {
  return <HowTo {...AEQUORIN_HOWTO} />;
}

export function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          setSepOverride(v);
          if (rawText) doParse(rawText, v);
        }}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        hint="CSV · TSV · TXT · DAT — one column per sample, one row per time-point · 2 MB max"
      />
      <HowToSection />
    </div>
  );
}

// Themed tile for the Configure step — same AesBox shape boxplot / scatter /
// lineplot / volcano use, so the visual language stays consistent across
// tools. The header band carries an uppercase title in `--on-accent`; the
// body sits on the matching `--aes-*-bg` panel. Two themes:
//   "calibration" — slate, reusing scatter's "color" palette.
//   "time"        — emerald, reusing scatter's "size" palette.
const AQ_AES_THEMES = {
  calibration: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "Aequorin calibration",
  },
  time: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Time axis",
  },
};

function AqAesBox({
  theme,
  children,
}: {
  theme: "calibration" | "time";
  children?: React.ReactNode;
}) {
  const t = AQ_AES_THEMES[theme];
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1.5px solid ${t.border}`,
        background: t.bg,
        flex: "1 1 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
        <span
          style={{
            color: t.headerText,
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          {t.label}
        </span>
      </div>
      <div style={{ padding: "12px 14px", flex: 1 }}>{children}</div>
    </div>
  );
}

export function ConfigureStep({
  parsed,
  formula,
  setFormula,
  Kr,
  setKr,
  Ktr,
  setKtr,
  Kd,
  setKd,
  hillN,
  setHillN,
  vis,
  updVis,
  fileName,
  calData,
  columnEnabled,
  downloadCalibrated,
}: ConfigureStepProps) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <AqAesBox theme="calibration">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div className="dv-label">Formula</div>
              <select
                value={formula}
                onChange={(e) => setFormula(e.target.value as typeof formula)}
                className="dv-select"
              >
                <option value="none">None (raw data)</option>
                <option value="allen-blinks">Allen &amp; Blinks (1978)</option>
                <option value="hill">Hill equilibrium</option>
                <option value="generalized">Generalised Allen &amp; Blinks</option>
              </select>
            </div>
            {(formula === "allen-blinks" || formula === "generalized") && (
              <div>
                <div className="dv-label">Kr</div>
                <NumberInput
                  value={Kr}
                  onChange={(e) => setKr(Number(e.target.value))}
                  step="0.1"
                />
              </div>
            )}
            {(formula === "allen-blinks" || formula === "generalized") && (
              <div>
                <div className="dv-label">Ktr</div>
                <NumberInput
                  value={Ktr}
                  onChange={(e) => setKtr(Number(e.target.value))}
                  step="1"
                />
              </div>
            )}
            {formula === "hill" && (
              <div>
                <div className="dv-label">Kd (µM)</div>
                <NumberInput
                  value={Kd}
                  onChange={(e) => setKd(Number(e.target.value))}
                  step="0.5"
                  min="0.1"
                />
              </div>
            )}
            {formula === "generalized" && (
              <div>
                <div className="dv-label">n (Hill exp.)</div>
                <NumberInput
                  value={hillN}
                  onChange={(e) => setHillN(Number(e.target.value))}
                  step="0.5"
                  min="1"
                />
              </div>
            )}
          </div>
        </AqAesBox>
        <AqAesBox theme="time">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div>
              <div className="dv-label">Time step (per row)</div>
              <NumberInput
                value={vis.timeStep}
                onChange={(e) => updVis({ timeStep: Number(e.target.value) || 1 })}
                style={{ width: 132 }}
                min="0.001"
                step="any"
              />
            </div>
            <div>
              <div className="dv-label">Base unit</div>
              <select
                value={vis.baseUnit}
                onChange={(e) => updVis({ baseUnit: e.target.value })}
                className="dv-select"
              >
                {TIME_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            {parsed && (
              <div style={{ fontSize: 12, color: "var(--text-faint)", paddingBottom: 4 }}>
                Range: 0 – {(parsed.data.length * vis.timeStep).toFixed(3)} {vis.baseUnit}
              </div>
            )}
          </div>
        </AqAesBox>
      </div>
      <div className="dv-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            Loaded <strong style={{ color: "var(--text)" }}>{fileName}</strong> —{" "}
            {parsed.headers.length} samples × {parsed.data.length} time-points
          </p>
          <button
            onClick={(e) => {
              downloadCalibrated();
              flashSaved(e.currentTarget);
            }}
            className="dv-btn dv-btn-dl"
            style={{ marginLeft: "auto", flexShrink: 0 }}
          >
            ⬇ CSV
          </button>
        </div>
        {calData &&
          parsed &&
          (() => {
            const ei = parsed.headers
              .map((_: unknown, i: number) => i)
              .filter((i: number) => columnEnabled[i] !== false);
            return (
              <div style={{ marginTop: 8 }}>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Preview — {formula === "none" ? "raw data" : "calibrated data"} · {ei.length} of{" "}
                  {parsed.headers.length} columns (first 15 rows):
                </p>
                <DataPreview
                  headers={ei.map((i: number) => parsed.headers[i])}
                  rows={calData
                    .slice(0, 15)
                    .map((r: Array<number | null>) =>
                      ei.map((i: number) => (r[i] != null ? r[i] : ""))
                    )}
                  maxRows={15}
                />
              </div>
            );
          })()}
      </div>
    </div>
  );
}

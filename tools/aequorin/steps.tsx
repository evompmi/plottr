// Step components for the aequorin tool (HowToSection, UploadStep,
// ConfigureStep). Stateless presentational wrappers — all state lives in
// App via usePlotToolState or local hooks there. No sibling-module
// imports; shared UI (UploadPanel, DataPreview, NumberInput, …) and
// globals (toolIcon, flashSaved, TIME_UNITS) resolve through
// shared.bundle.js and ./helpers respectively.

import { TIME_UNITS } from "./helpers";
import type { CalibrationFormula, ConfigureStepProps, UploadStepProps } from "./helpers";
import { DataPreview, DetectedSeparatorBadge, HowTo, NumberInput, UploadPanel } from "../_shell";
import { AEQUORIN_HOWTO } from "./howto";

import { flashSaved } from "../_core/download";
// Render a coefficient as a clean numeric string for the formula
// preview. Strips trailing zeros (so a default Kr of 7 reads as "7"
// not "7.0000"); falls back to scientific notation for very small /
// very large values so a typo like Kd = 1e9 doesn't blow out the
// preview line. Non-finite inputs render as "?" so the preview
// still produces a recognisable shape if the user types nonsense.
function fmtCoef(v: number): string {
  if (!Number.isFinite(v)) return "?";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-3) return v.toExponential(2);
  return parseFloat(v.toFixed(4)).toString();
}

// CSS-stacked fraction. `num` / `den` are inline React fragments; the
// wrapper uses inline-flex so the fraction sits inside the surrounding
// math-style text run alongside `=` and other operators. `currentColor`
// on the divider keeps it themed without an extra prop.
function Frac({ num, den }: { num: React.ReactNode; den: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        verticalAlign: "middle",
        margin: "0 4px",
        lineHeight: 1.2,
      }}
    >
      <span style={{ padding: "0 6px" }}>{num}</span>
      <span
        style={{
          borderTop: "1px solid currentColor",
          padding: "1px 6px 0",
          width: "100%",
          textAlign: "center",
        }}
      >
        {den}
      </span>
    </span>
  );
}

// Small italic-f used throughout the preview as the rundown-fraction
// variable. Pulled into a constant so the JSX stays readable.
const ITAL_F = <span style={{ fontStyle: "italic" }}>f</span>;

// Render the chosen calibration formula with the user's current
// parameter values substituted into the symbolic expression — e.g.
// Allen & Blinks with Ktr=118 / Kr=7 renders as ((1 + 118)·f^(1/3) − 1)
// over (7·(1 − f^(1/3))). The substituted form (rather than a fully-
// evaluated `119`) keeps the connection between the K-inputs above
// and where they land in the math visible.
function CalibrationFormulaPreview({
  formula,
  Kr,
  Ktr,
  Kd,
  hillN,
}: {
  formula: CalibrationFormula;
  Kr: number;
  Ktr: number;
  Kd: number;
  hillN: number;
}) {
  if (formula === "none") return null;

  // Exponent denominator string — 1/3 for the fixed-cube-root forms,
  // 1/n with the user's n for the generalised form. Non-integer n is
  // formatted through fmtCoef so a Hill exponent of 2.5 reads as "1/2.5".
  const expDen = formula === "generalized" ? fmtCoef(hillN) : "3";
  const exp = <sup style={{ fontSize: "0.72em", lineHeight: 0 }}>1/{expDen}</sup>;

  let body: React.ReactNode;
  if (formula === "allen-blinks") {
    body = (
      <>
        [Ca²⁺] =
        <Frac
          num={
            <>
              (1 + {fmtCoef(Ktr)})·{ITAL_F}
              {exp} − 1
            </>
          }
          den={
            <>
              {fmtCoef(Kr)}·(1 − {ITAL_F}
              {exp})
            </>
          }
        />
      </>
    );
  } else if (formula === "hill") {
    body = (
      <>
        [Ca²⁺] = {fmtCoef(Kd)} · (
        <Frac num={ITAL_F} den={<>1 − {ITAL_F}</>} />)
        <sup style={{ fontSize: "0.72em", lineHeight: 0 }}>1/3</sup>
      </>
    );
  } else if (formula === "generalized") {
    body = (
      <>
        [Ca²⁺] =
        <Frac
          num={
            <>
              (1 + {fmtCoef(Ktr)})·{ITAL_F}
              {exp} − 1
            </>
          }
          den={
            <>
              {fmtCoef(Kr)}·(1 − {ITAL_F}
              {exp})
            </>
          }
        />
      </>
    );
  } else {
    return null;
  }

  return (
    <div
      aria-label="Calibration formula with your parameter values substituted"
      style={{
        marginTop: 12,
        padding: "10px 14px",
        background: "var(--surface-subtle)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        With your values
      </span>
      <span
        style={{
          fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
          fontSize: 15,
          color: "var(--text)",
          display: "inline-flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {body}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-faint)",
          marginLeft: "auto",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontStyle: "italic" }}>f</span> ={" "}
        <span style={{ fontStyle: "italic" }}>L</span>(
        <span style={{ fontStyle: "italic" }}>t</span>) / Σ
        <span style={{ fontStyle: "italic" }}>L</span>
      </span>
    </div>
  );
}

export function HowToSection() {
  return <HowTo {...AEQUORIN_HOWTO} />;
}

export function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  handleTextPaste,
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
        onTextPaste={handleTextPaste}
        autoDetect
        onLoadExample={onLoadExample}
        exampleSummary={{
          title: "Aequorin Ca²⁺ time-course",
          subtitle: "Mutant vs WT response to a CO7 elicitor pulse",
          buttonLabel: "Plot this example →",
        }}
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
  detectedSep,
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
          <CalibrationFormulaPreview formula={formula} Kr={Kr} Ktr={Ktr} Kd={Kd} hillN={hillN} />
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
            <DetectedSeparatorBadge sep={detectedSep} />
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

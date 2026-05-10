// doseresponse/steps.tsx — UploadStep, ConfigureStep, and the
// ControlSection disclosure helper used by both the configure step and the
// plot-step sidebar.

import { DataPreview, HowTo, UploadPanel, scrollDisclosureIntoView } from "../_shell";
import { DOSERESPONSE_HOWTO } from "./howto";
import { SegmentedRow } from "./controls";
import type {
  DoseResponseModel,
  DoseResponseVis,
  DoseRoleAssignment,
  DoseUnit,
  NormalisationMode,
  UpdVis,
  UploadStepProps,
  ZeroDoseMode,
} from "./helpers";

const { useState, useRef, useEffect } = React;

export function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
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
        exampleLabel="Synthetic 4PL: Control vs Antagonist (32 rows, 8 doses, 2 replicates)"
        hint="CSV · TSV · TXT — one row per observation: dose, response, [replicate], [condition] · 2 MB max"
      />
      <HowTo {...DOSERESPONSE_HOWTO} />
    </div>
  );
}

const MODEL_OPTS = [
  { value: "4PL" as const, label: "4PL" },
  { value: "3PL" as const, label: "3PL (Hill = 1)" },
];
const DOSE_UNIT_OPTS = [
  { value: "raw" as const, label: "Raw concentration" },
  { value: "log10" as const, label: "log₁₀-transformed" },
];
const ZERO_DOSE_OPTS = [
  { value: "drop" as const, label: "Drop" },
  { value: "reference" as const, label: "Off-axis" },
  { value: "floor" as const, label: "Floor" },
];
const NORM_OPTS = [
  { value: "none" as const, label: "None" },
  { value: "pct-max" as const, label: "% of max" },
  { value: "min-max" as const, label: "min–max" },
  { value: "user" as const, label: "User-supplied" },
];

export interface ConfigureStepProps {
  parsed: ParseDataResult;
  numericCols: number[];
  textCols: number[];
  roles: DoseRoleAssignment;
  setRoles: (r: DoseRoleAssignment) => void;
  vis: DoseResponseVis;
  updVis: UpdVis;
  onContinue: () => void;
}

export function ConfigureStep({
  parsed,
  numericCols,
  textCols,
  roles,
  setRoles,
  vis,
  updVis,
  onContinue,
}: ConfigureStepProps) {
  const setModel = (m: DoseResponseModel) => {
    if (m === "3PL") {
      updVis({
        model: m,
        paramLocks: {
          ...vis.paramLocks,
          hillSlope: { fixed: true, value: 1, lower: null, upper: null },
        },
      });
    } else {
      updVis({
        model: m,
        paramLocks: {
          ...vis.paramLocks,
          hillSlope: { fixed: false, value: null, lower: null, upper: null },
        },
      });
    }
  };

  const numericHeaderHint = numericCols.length < 2;
  const continueDisabled = numericHeaderHint || roles.doseCol === roles.responseCol;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <DataPreview headers={parsed.headers} rows={parsed.rawData} maxRows={8} />

      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 10px" }}>
          Variables
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
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
        {numericHeaderHint && (
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--danger-text)",
            }}
          >
            Need at least two numeric columns (one for dose, one for response).
          </p>
        )}
        {!numericHeaderHint && roles.doseCol === roles.responseCol && (
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--danger-text)",
            }}
          >
            Dose and Response must be different columns.
          </p>
        )}
      </div>

      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 10px" }}>
          Fit options
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SegmentedRow label="Model" options={MODEL_OPTS} value={vis.model} onChange={setModel} />
          <SegmentedRow
            label="Dose units"
            options={DOSE_UNIT_OPTS}
            value={vis.doseUnit}
            onChange={(v: DoseUnit) => updVis({ doseUnit: v })}
          />
          <SegmentedRow
            label="Zero-dose handling"
            options={ZERO_DOSE_OPTS}
            value={vis.zeroDoseMode}
            onChange={(v: ZeroDoseMode) => updVis({ zeroDoseMode: v })}
          />
          <SegmentedRow
            label="Response normalisation"
            options={NORM_OPTS}
            value={vis.normalisation}
            onChange={(v: NormalisationMode) => updVis({ normalisation: v })}
          />
        </div>
        <p
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--text-faint)",
            lineHeight: 1.5,
          }}
        >
          These choices affect how the curve is fitted. Display options (CI ribbon, residuals strip,
          parameter constraints, axis labels) live in the Plot-step sidebar so you can tweak them
          while watching the chart.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="dv-btn dv-btn-primary"
          disabled={continueDisabled}
          onClick={onContinue}
          data-testid="continue-to-plot"
          style={{ minWidth: 140 }}
        >
          Continue → Plot
        </button>
      </div>
    </div>
  );
}

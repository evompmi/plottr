// molarity.jsx — editable source. Run `npm run build` to compile to molarity.js
// Do NOT edit the .js file directly.

import { PageHeader, useIsMobile, FILE_LIMIT_BYTES } from "./_shell";
import { parseRaw } from "./_core/csv";
import { downloadCsv } from "./_core/download";
import "./molarity-app/i18n";
import { useT } from "./molarity-app/i18n";
import {
  type Unit,
  CONC_UNITS,
  VOL_UNITS,
  MASS_UNITS,
  formatResult,
  solveMolarity,
  solveDilution,
  computeLigationInsertNg,
  computeBatchMass,
} from "./molarity-app/helpers";
const { useState, useMemo, useCallback } = React;

// ── Numeric input with unit selector ────────────────────────────────────────

function UnitInput({
  label,
  value,
  onValueChange,
  unit,
  onUnitChange,
  units,
  disabled,
  placeholder,
  compact,
}: {
  label: React.ReactNode;
  value: string;
  onValueChange: (v: string) => void;
  unit: string;
  onUnitChange: (u: string) => void;
  units: Unit[];
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
        flexWrap: compact ? "wrap" : "nowrap",
      }}
    >
      <label
        className="dv-label"
        style={{
          width: compact ? "100%" : 150,
          flexShrink: 0,
          marginBottom: compact ? 2 : 0,
          fontWeight: 600,
          fontSize: compact ? 11 : undefined,
        }}
      >
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder || ""}
        className="dv-input"
        style={{
          width: compact ? 0 : 130,
          flex: compact ? 1 : undefined,
          minWidth: compact ? 80 : undefined,
          fontSize: 13,
          textAlign: "left",
          background: disabled ? "var(--success-bg)" : undefined,
          fontWeight: 400,
        }}
      />
      <select
        value={unit}
        onChange={(e) => onUnitChange(e.target.value)}
        className="dv-select"
        style={{ minWidth: 60 }}
      >
        {units.map((u) => (
          <option key={u.label} value={u.label}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Molarity Mode ───────────────────────────────────────────────────────────

function MolarityMode({ compact }: { compact?: boolean }) {
  const tr = useT();
  const [mw, setMw] = useState("");
  const [mass, setMass] = useState("");
  const [massUnit, setMassUnit] = useState("g");
  const [vol, setVol] = useState("");
  const [volUnit, setVolUnit] = useState("mL");
  const [conc, setConc] = useState("");
  const [concUnit, setConcUnit] = useState("mM");
  const [solveFor, setSolveFor] = useState("conc");

  const result = useMemo(
    () => solveMolarity({ solveFor, mw, mass, massUnit, vol, volUnit, conc, concUnit }),
    [mw, mass, massUnit, vol, volUnit, conc, concUnit, solveFor]
  );

  const fields = [
    { key: "mw", label: tr("molarity.mol.field.mw") },
    { key: "mass", label: tr("molarity.mol.field.mass") },
    { key: "volume", label: tr("molarity.mol.field.volume") },
    { key: "conc", label: tr("molarity.mol.field.conc") },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: compact ? "column" : "row",
          gap: 10,
          marginBottom: 16,
          alignItems: compact ? undefined : "stretch",
        }}
      >
        <div
          className="dv-panel"
          style={{
            flex: compact ? undefined : "0 0 calc((100% - 20px) / 3)",
            marginBottom: 0,
            display: "flex",
            flexDirection: compact ? "row" : "column",
            ...(compact ? { flexWrap: "wrap", gap: 6, alignItems: "center" } : {}),
          }}
        >
          <p
            style={{
              margin: compact ? "0 8px 0 0" : "0 0 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-muted)",
              ...(compact ? { width: "100%", marginBottom: 4 } : {}),
            }}
          >
            {tr("molarity.solveFor")}
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: compact ? "row" : "column",
              gap: 6,
              flexWrap: compact ? "wrap" : undefined,
            }}
          >
            {fields.map((f) => (
              <button
                key={f.key}
                onClick={() => setSolveFor(f.key)}
                style={{
                  padding: compact ? "5px 10px" : "6px 16px",
                  borderRadius: 6,
                  fontSize: compact ? 11 : 12,
                  fontWeight: 600,
                  background: solveFor === f.key ? "var(--step-active-bg)" : "var(--surface)",
                  color: solveFor === f.key ? "var(--on-accent)" : "var(--text-faint)",
                  border:
                    "1px solid " +
                    (solveFor === f.key ? "var(--step-active-border)" : "var(--border-strong)"),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dv-panel" style={{ flex: 1, marginBottom: 0 }}>
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-muted)",
            }}
          >
            {tr("molarity.inputs")}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: compact ? "wrap" : "nowrap",
            }}
          >
            <label
              className="dv-label"
              style={{
                width: compact ? "100%" : 150,
                flexShrink: 0,
                marginBottom: compact ? 2 : 0,
                fontWeight: 600,
                fontSize: compact ? 11 : undefined,
              }}
            >
              {tr("molarity.mol.mwLabel")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={solveFor === "mw" ? "" : mw}
              onChange={(e) => setMw(e.target.value)}
              disabled={solveFor === "mw"}
              placeholder={solveFor === "mw" ? tr("molarity.calculated") : ""}
              className="dv-input"
              style={{
                width: compact ? 0 : 130,
                flex: compact ? 1 : undefined,
                minWidth: compact ? 80 : undefined,
                fontSize: 13,
                textAlign: "left",
                background: solveFor === "mw" ? "var(--success-bg)" : undefined,
                fontWeight: 400,
              }}
            />
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>g/mol</span>
          </div>

          <UnitInput
            label={tr("molarity.mol.field.mass")}
            compact={compact}
            value={solveFor === "mass" ? "" : mass}
            onValueChange={setMass}
            unit={massUnit}
            onUnitChange={setMassUnit}
            units={MASS_UNITS}
            disabled={solveFor === "mass"}
            placeholder={solveFor === "mass" ? tr("molarity.calculated") : ""}
          />
          <UnitInput
            label={tr("molarity.mol.field.volume")}
            value={solveFor === "volume" ? "" : vol}
            onValueChange={setVol}
            unit={volUnit}
            onUnitChange={setVolUnit}
            units={VOL_UNITS}
            disabled={solveFor === "volume"}
            placeholder={solveFor === "volume" ? tr("molarity.calculated") : ""}
            compact={compact}
          />
          <UnitInput
            label={tr("molarity.mol.field.conc")}
            value={solveFor === "conc" ? "" : conc}
            onValueChange={setConc}
            unit={concUnit}
            onUnitChange={setConcUnit}
            units={CONC_UNITS}
            disabled={solveFor === "conc"}
            placeholder={solveFor === "conc" ? tr("molarity.calculated") : ""}
            compact={compact}
          />

          {result && (
            <div
              style={{
                background: "var(--success-bg)",
                borderRadius: 8,
                border: "1px solid var(--success-border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                marginTop: 10,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, color: "var(--success-text)" }}>
                {formatResult(result.value)}
              </span>
              <span style={{ fontSize: 14, color: "var(--success-text)", fontWeight: 600 }}>
                {result.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dilution Mode ───────────────────────────────────────────────────────────

function DilutionMode({ compact }: { compact?: boolean }) {
  const tr = useT();
  const [c1, setC1] = useState("");
  const [c1Unit, setC1Unit] = useState("mM");
  const [v1, setV1] = useState("");
  const [v1Unit, setV1Unit] = useState("µL");
  const [c2, setC2] = useState("");
  const [c2Unit, setC2Unit] = useState("µM");
  const [v2, setV2] = useState("");
  const [v2Unit, setV2Unit] = useState("mL");
  const [solveFor, setSolveFor] = useState("v1");

  const result = useMemo(
    () => solveDilution({ solveFor, c1, c1Unit, v1, v1Unit, c2, c2Unit, v2, v2Unit }),
    [c1, c1Unit, v1, v1Unit, c2, c2Unit, v2, v2Unit, solveFor]
  );

  const fields = [
    { key: "c1", label: tr("molarity.dil.field.c1") },
    { key: "v1", label: tr("molarity.dil.field.v1") },
    { key: "c2", label: tr("molarity.dil.field.c2") },
    { key: "v2", label: tr("molarity.dil.field.v2") },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: compact ? "column" : "row",
          gap: 10,
          marginBottom: 16,
          alignItems: compact ? undefined : "stretch",
        }}
      >
        <div
          className="dv-panel"
          style={{
            flex: compact ? undefined : "0 0 calc((100% - 20px) / 3)",
            marginBottom: 0,
            display: "flex",
            flexDirection: compact ? "row" : "column",
            ...(compact ? { flexWrap: "wrap", gap: 6, alignItems: "center" } : {}),
          }}
        >
          <p
            style={{
              margin: compact ? "0 0 4px" : "0 0 6px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-muted)",
              ...(compact ? { width: "100%" } : {}),
            }}
          >
            {tr("molarity.dil.equation")}
          </p>
          {!compact && (
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-faint)" }}>
              {tr("molarity.solveFor")}
            </p>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: compact ? "row" : "column",
              gap: 6,
              flexWrap: compact ? "wrap" : undefined,
            }}
          >
            {fields.map((f) => (
              <button
                key={f.key}
                onClick={() => setSolveFor(f.key)}
                style={{
                  padding: compact ? "5px 10px" : "6px 16px",
                  borderRadius: 6,
                  fontSize: compact ? 11 : 12,
                  fontWeight: 600,
                  background: solveFor === f.key ? "var(--step-active-bg)" : "var(--surface)",
                  color: solveFor === f.key ? "var(--on-accent)" : "var(--text-faint)",
                  border:
                    "1px solid " +
                    (solveFor === f.key ? "var(--step-active-border)" : "var(--border-strong)"),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dv-panel" style={{ flex: 1, marginBottom: 0 }}>
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-muted)",
            }}
          >
            {tr("molarity.inputs")}
          </p>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--accent-primary)",
            }}
          >
            {tr("molarity.dil.stock")}
          </p>
          <UnitInput
            label={tr("molarity.dil.c1")}
            value={solveFor === "c1" ? "" : c1}
            onValueChange={setC1}
            unit={c1Unit}
            onUnitChange={setC1Unit}
            units={CONC_UNITS}
            disabled={solveFor === "c1"}
            placeholder={solveFor === "c1" ? tr("molarity.calculated") : ""}
            compact={compact}
          />
          <UnitInput
            label={tr("molarity.dil.v1")}
            value={solveFor === "v1" ? "" : v1}
            onValueChange={setV1}
            unit={v1Unit}
            onUnitChange={setV1Unit}
            units={VOL_UNITS}
            disabled={solveFor === "v1"}
            placeholder={solveFor === "v1" ? tr("molarity.calculated") : ""}
            compact={compact}
          />
          <p
            style={{
              margin: "12px 0 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--accent-primary)",
            }}
          >
            {tr("molarity.dil.final")}
          </p>
          <UnitInput
            label={tr("molarity.dil.c2")}
            value={solveFor === "c2" ? "" : c2}
            onValueChange={setC2}
            unit={c2Unit}
            onUnitChange={setC2Unit}
            units={CONC_UNITS}
            disabled={solveFor === "c2"}
            placeholder={solveFor === "c2" ? tr("molarity.calculated") : ""}
            compact={compact}
          />
          <UnitInput
            label={tr("molarity.dil.v2")}
            value={solveFor === "v2" ? "" : v2}
            onValueChange={setV2}
            unit={v2Unit}
            onUnitChange={setV2Unit}
            units={VOL_UNITS}
            disabled={solveFor === "v2"}
            placeholder={solveFor === "v2" ? tr("molarity.calculated") : ""}
            compact={compact}
          />

          {result && (
            <div
              style={{
                background: "var(--success-bg)",
                borderRadius: 8,
                border: "1px solid var(--success-border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                marginTop: 10,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, color: "var(--success-text)" }}>
                {formatResult(result.value)}
              </span>
              <span style={{ fontSize: 14, color: "var(--success-text)", fontWeight: 600 }}>
                {result.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Batch Mode ──────────────────────────────────────────────────────────────

const BATCH_EXAMPLE = `Name\tMW\tConcentration\tVolume
NaCl\t58.44\t150 mM\t500 mL
Sucrose\t342.3\t0.5 M\t1 L
Kanamycin\t484.5\t50 mg/mL\t100 mL`;

function BatchMode() {
  const tr = useT();
  const [raw, setRaw] = useState("");
  const [sepOverride, setSepOverride] = useState("");
  type MolarityRow = {
    name: string;
    error?: string;
    mw?: number;
    conc?: string;
    vol?: string;
    massG?: number;
    massDisplay?: string;
  };
  const [results, setResults] = useState<MolarityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compute = useCallback(() => {
    setError(null);
    setResults(null);
    if (!raw.trim()) {
      setError(tr("molarity.batch.errPaste"));
      return;
    }
    // Match the documented ingest-size policy (FileDropZone / UploadPanel):
    // hard-reject pastes over 2 MB before parsing.
    const bytes = new Blob([raw]).size;
    if (bytes > FILE_LIMIT_BYTES) {
      setError(tr("molarity.batch.errTooLarge", { mb: (bytes / 1024 / 1024).toFixed(1) }));
      return;
    }

    const { headers, rows } = parseRaw(raw, sepOverride);
    if (rows.length === 0) {
      setError(tr("molarity.batch.errNoRows"));
      return;
    }
    if (headers.length < 4) {
      setError(tr("molarity.batch.errCols"));
      return;
    }

    const errMsg = {
      mw: "molarity.batch.errInvalidMw",
      vol: "molarity.batch.errInvalidVol",
      conc: "molarity.batch.errCannotParseConc",
    } as const;
    const output: MolarityRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = r[0] || tr("molarity.batch.rowFallback", { n: i + 1 });
      const res = computeBatchMass(r[1], r[2], r[3]);
      if (!res.ok) {
        output.push({ name, error: tr(errMsg[res.errorCode], { v: res.value }) });
        continue;
      }
      output.push({
        name,
        mw: res.mw,
        conc: res.conc,
        vol: res.vol,
        massG: res.massG,
        massDisplay: res.massDisplay,
      });
    }

    setResults(output);
  }, [raw, sepOverride, tr]);

  const csvExport = useCallback(() => {
    if (!results) return;
    const hdrs = ["Name", "MW (g/mol)", "Target concentration", "Target volume", "Mass to weigh"];
    const csvRows = results.map((r) =>
      r.error
        ? [r.name, "", "", "", "ERROR: " + r.error]
        : [r.name, r.mw ?? "", r.conc ?? "", r.vol ?? "", r.massDisplay ?? ""]
    );
    downloadCsv(hdrs, csvRows, "prep-sheet.csv");
  }, [results]);

  return (
    <div>
      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          {tr("molarity.batch.instruction")}
        </p>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--text-faint)" }}>
          {tr("molarity.batch.unitsNote")}
        </p>
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-primary)" }}>
            {tr("molarity.batch.separator")}
          </span>
          <div className="dv-seg">
            {(
              [
                ["", tr("molarity.batch.autoDetect")],
                [",", tr("molarity.batch.comma")],
                [";", tr("molarity.batch.semicolon")],
                ["\t", tr("molarity.batch.tab")],
              ] as const
            ).map(([val, label]) => {
              const active = sepOverride === val;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSepOverride(val)}
                  aria-pressed={active}
                  className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
                  style={{ flex: "0 0 auto", padding: "4px 10px" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={BATCH_EXAMPLE}
          rows={8}
          style={{
            width: "100%",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 10,
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            resize: "vertical",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <button onClick={compute} className="dv-btn dv-btn-primary">
            {tr("molarity.batch.calculate")}
          </button>
          <button onClick={() => setRaw(BATCH_EXAMPLE)} className="dv-btn dv-btn-secondary">
            {tr("molarity.batch.loadExample")}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--danger-text)", fontWeight: 600 }}>
            {error}
          </span>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="dv-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              {tr("molarity.batch.prepSheet")}
            </p>
            <button
              onClick={csvExport}
              className="dv-btn dv-btn-dl"
              style={{ marginLeft: "auto", flexShrink: 0 }}
            >
              ⬇ CSV
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border-strong)" }}>
                  {[
                    tr("molarity.batch.col.name"),
                    tr("molarity.batch.col.mw"),
                    tr("molarity.batch.col.conc"),
                    tr("molarity.batch.col.vol"),
                    tr("molarity.batch.col.mass"),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 10px",
                        textAlign: "left",
                        color: "var(--text-muted)",
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--text)" }}>
                      {r.name}
                    </td>
                    {r.error ? (
                      <td
                        colSpan={4}
                        style={{
                          padding: "6px 10px",
                          color: "var(--danger-text)",
                          fontStyle: "italic",
                        }}
                      >
                        {r.error}
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: "6px 10px" }}>{r.mw} g/mol</td>
                        <td style={{ padding: "6px 10px" }}>{r.conc}</td>
                        <td style={{ padding: "6px 10px" }}>{r.vol}</td>
                        <td
                          style={{
                            padding: "6px 10px",
                            fontWeight: 700,
                            color: "var(--success-text)",
                          }}
                        >
                          {r.massDisplay}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ligation Mode ───────────────────────────────────────────────────────────

function LigationMode({ compact }: { compact?: boolean }) {
  const tr = useT();
  const [vectorBp, setVectorBp] = useState("");
  const [vectorNg, setVectorNg] = useState("");
  const [insertBp, setInsertBp] = useState("");
  const [ratioVector, setRatioVector] = useState("1");
  const [ratioInsert, setRatioInsert] = useState("3");

  const result = useMemo(
    () => computeLigationInsertNg({ vectorBp, vectorNg, insertBp, ratioVector, ratioInsert }),
    [vectorBp, vectorNg, insertBp, ratioVector, ratioInsert]
  );

  // Override-only style object — `dv-input` className supplies the base.
  const fieldStyle: React.CSSProperties = {
    width: 130,
    fontSize: 13,
    textAlign: "right",
  };

  return (
    <div>
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          {tr("molarity.lig.title")}
        </p>
        <p style={{ margin: "0 0 0", fontSize: 11, color: "var(--text-faint)" }}>
          {tr("molarity.lig.formula")}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: compact ? "column" : "row",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="dv-panel" style={{ flex: 1, marginBottom: 0, padding: 12 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "var(--accent-dna)" }}
          >
            {tr("molarity.lig.vector")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <label className="dv-label" style={{ marginBottom: 0, fontWeight: 600, fontSize: 11 }}>
              {tr("molarity.lig.length")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={vectorBp}
              onChange={(e) => setVectorBp(e.target.value)}
              className="dv-input"
              style={{ ...fieldStyle, width: 90, fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>bp</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label className="dv-label" style={{ marginBottom: 0, fontWeight: 600, fontSize: 11 }}>
              {tr("molarity.lig.amount")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={vectorNg}
              onChange={(e) => setVectorNg(e.target.value)}
              className="dv-input"
              style={{ ...fieldStyle, width: 90, fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>ng</span>
          </div>
        </div>

        <div className="dv-panel" style={{ flex: 1, marginBottom: 0, padding: 12 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "var(--accent-dna)" }}
          >
            {tr("molarity.lig.insert")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label className="dv-label" style={{ marginBottom: 0, fontWeight: 600, fontSize: 11 }}>
              {tr("molarity.lig.length")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={insertBp}
              onChange={(e) => setInsertBp(e.target.value)}
              className="dv-input"
              style={{ ...fieldStyle, width: 90, fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>bp</span>
          </div>
        </div>

        <div className="dv-panel" style={{ flex: 1, marginBottom: 0, padding: 12 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "var(--accent-dna)" }}
          >
            {tr("molarity.lig.molarRatio")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <label
              className="dv-label"
              style={{
                marginBottom: 0,
                fontWeight: 600,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              {tr("molarity.lig.vector")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={ratioVector}
              onChange={(e) => setRatioVector(e.target.value)}
              className="dv-input"
              style={{ ...fieldStyle, width: 60, fontSize: 12 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label
              className="dv-label"
              style={{
                marginBottom: 0,
                fontWeight: 600,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              {tr("molarity.lig.insert")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={ratioInsert}
              onChange={(e) => setRatioInsert(e.target.value)}
              className="dv-input"
              style={{ ...fieldStyle, width: 60, fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {result !== null && (
        <div
          className="dv-panel"
          style={{
            background: "var(--success-bg)",
            borderColor: "var(--success-border)",
            padding: "16px 20px",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 11,
              color: "var(--success-text)",
              fontWeight: 600,
            }}
          >
            {tr("molarity.lig.needed")}
          </p>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--success-text)" }}>
            {formatResult(result)}
          </span>
          <span
            style={{ fontSize: 14, color: "var(--success-text)", fontWeight: 600, marginLeft: 8 }}
          >
            ng
          </span>
        </div>
      )}
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

function ModeButton({
  label,
  desc,
  active,
  accentColor,
  activeBg,
  onClick,
  style: extraStyle,
}: {
  label: React.ReactNode;
  desc: React.ReactNode;
  active: boolean;
  accentColor: string;
  activeBg: string;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const isActive = active;
  const showAccent = isActive || hovered;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "12px 8px",
        borderRadius: 10,
        border: showAccent ? `2px solid ${accentColor}` : "1px solid var(--border)",
        background: isActive ? activeBg : "var(--surface)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "center",
        transition: "all 0.2s ease",
        transform: hovered && !isActive ? "translateY(-4px)" : "none",
        boxShadow: hovered && !isActive ? `0 6px 16px ${accentColor}26` : "none",
        ...extraStyle,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: showAccent ? accentColor : "var(--text-muted)",
          transition: "color 0.2s ease",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{desc}</div>
    </button>
  );
}

export function App() {
  const tr = useT();
  const [mode, setMode] = useState("molarity");
  const compact = useIsMobile();

  const chemModes = [
    {
      key: "molarity",
      label: tr("molarity.mode.molarity"),
      desc: tr("molarity.mode.molarity.desc"),
    },
    {
      key: "dilution",
      label: tr("molarity.mode.dilution"),
      desc: tr("molarity.mode.dilution.desc"),
    },
    { key: "batch", label: tr("molarity.mode.batch"), desc: tr("molarity.mode.batch.desc") },
  ];

  const dnaModes = [
    {
      key: "ligation",
      label: tr("molarity.mode.ligation"),
      desc: tr("molarity.mode.ligation.desc"),
    },
  ];

  const chemColor = "var(--cta-primary-bg)";
  const dnaColor = "var(--cta-dna-bg)";

  return (
    <div
      style={{ maxWidth: 720, margin: "0 auto", padding: compact ? "16px 10px 80px" : "32px 20px" }}
    >
      <PageHeader toolName="molarity" title="Calculator" />

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: chemColor,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {tr("molarity.section.solutions")}
        </span>
        <span style={{ flex: 1, height: 1, background: chemColor, opacity: 0.3 }} />
      </div>
      <div style={{ display: "flex", gap: compact ? 6 : 10, marginBottom: 16, flexWrap: "wrap" }}>
        {chemModes.map((m) => (
          <ModeButton
            key={m.key}
            label={m.label}
            desc={m.desc}
            active={mode === m.key}
            accentColor={chemColor}
            activeBg="var(--info-bg)"
            onClick={() => setMode(m.key)}
            style={{ flex: compact ? "1 1 calc(50% - 6px)" : 1, minWidth: compact ? 0 : undefined }}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: dnaColor,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {tr("molarity.section.dna")}
        </span>
        <span style={{ flex: 1, height: 1, background: dnaColor, opacity: 0.3 }} />
      </div>
      <div style={{ display: "flex", gap: compact ? 6 : 10, marginBottom: 24 }}>
        {dnaModes.map((m) => (
          <ModeButton
            key={m.key}
            label={m.label}
            desc={m.desc}
            active={mode === m.key}
            accentColor={dnaColor}
            activeBg="var(--surface-subtle)"
            onClick={() => setMode(m.key)}
            style={{
              flex: compact ? 1 : "0 1 auto",
              width: compact
                ? undefined
                : `calc(${100 / chemModes.length}% - ${(10 * (chemModes.length - 1)) / chemModes.length}px)`,
            }}
          />
        ))}
      </div>

      {mode === "molarity" && <MolarityMode compact={compact} />}
      {mode === "dilution" && <DilutionMode compact={compact} />}
      {mode === "batch" && <BatchMode />}
      {mode === "ligation" && <LigationMode compact={compact} />}
    </div>
  );
}

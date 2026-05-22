// tools/factorial/steps.tsx — UploadStep / ConfigureStep / ReportStep
// wrappers. Configure step embeds a tool-local FactorialRoleEditor
// (the shared `_shell/ColumnRoleEditor` is hardcoded to
// group/value/filter/ignore and not extensible — see slice 2 scope
// notes); ReportStep composes the formatted `Report` from report.tsx
// with the sidebar `DisplayTiles` + `DownloadTiles` from controls.tsx.

import { DataPreview, DetectedSeparatorBadge, HowTo, PlotSidebar, UploadPanel } from "../_shell";
import type { TwoWayANOVAResult } from "../_core/stats/types";
import {
  FACTORIAL_ROLE_COLORS,
  type DesignSummary,
  type FactorialRole,
  type FactorialVis,
  summarizeDesign,
  validateDesign,
} from "./helpers";
import { Report } from "./report";
import { DisplayTiles, DownloadTiles, HandoffTile } from "./controls";
import { FACTORIAL_HOWTO } from "./howto";

const { useMemo } = React;

// ── Upload step ─────────────────────────────────────────────────────────────

interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  handleFileLoad: (text: string, fileName: string) => void;
  handleTextPaste: (text: string, fileName: string) => void;
  onLoadExample: () => void;
}

export function UploadStep({
  sepOverride,
  setSepOverride,
  handleFileLoad,
  handleTextPaste,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onTextPaste={handleTextPaste}
        autoDetect
        onLoadExample={onLoadExample}
        exampleSummary={{
          title: "Plant growth — water × genotype",
          subtitle: "2 × 2 balanced — drug effect depends on genotype",
          buttonLabel: "Load this example →",
        }}
        hint="CSV · TSV · TXT — long format with 3 columns: factorA, factorB, value · 2 MB max"
      />
      <HowTo {...FACTORIAL_HOWTO} />
    </div>
  );
}

// ── Configure step ──────────────────────────────────────────────────────────

interface FactorialRoleEditorProps {
  headers: string[];
  rows: string[][];
  colRoles: FactorialRole[];
  colNames: string[];
  onRoleChange: (i: number, role: FactorialRole) => void;
  onNameChange: (i: number, name: string) => void;
}

// Local role editor — mirrors the visual style of `_shell/ColumnRoleEditor`
// but with the FactorialRole union. Kept tool-local because the shared
// editor's role list is hardcoded; factorial would have to bend it.
function FactorialRoleEditor(props: FactorialRoleEditorProps) {
  const { headers, rows, colRoles, colNames, onRoleChange, onNameChange } = props;
  return (
    <div className="dv-panel">
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
        }}
      >
        Column roles
      </p>
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 11,
          color: "var(--text-faint)",
          lineHeight: 1.4,
        }}
      >
        Exactly one{" "}
        <span style={{ color: FACTORIAL_ROLE_COLORS.factorA, fontWeight: 600 }}>factor A</span>, one{" "}
        <span style={{ color: FACTORIAL_ROLE_COLORS.factorB, fontWeight: 600 }}>factor B</span>, and
        one <span style={{ color: FACTORIAL_ROLE_COLORS.value, fontWeight: 600 }}>value</span>{" "}
        (numeric). Picking a role on another column replaces the previous holder.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(["factorA", "factorB", "value", "ignore"] as FactorialRole[]).map((r) => (
          <span
            key={r}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              background: FACTORIAL_ROLE_COLORS[r],
              color: r === "ignore" ? "var(--text-muted)" : "var(--on-accent)",
              fontWeight: 600,
            }}
          >
            {r}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {headers.map((_h, i) => {
          const seen: Record<string, boolean> = {};
          const u: string[] = [];
          rows.forEach((r) => {
            const v = r[i];
            if (!seen[v]) {
              seen[v] = true;
              u.push(v);
            }
          });
          const preview = u.slice(0, 5).join(", ") + (u.length > 5 ? ` … (${u.length})` : "");
          return (
            <div
              key={"col-" + i}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--surface)",
                borderRadius: 6,
                border: `2px solid ${FACTORIAL_ROLE_COLORS[colRoles[i]] || "var(--border-strong)"}`,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  minWidth: 20,
                  fontSize: 12,
                }}
              >
                #{i + 1}
              </span>
              <input
                value={colNames[i]}
                onChange={(e) => onNameChange(i, e.target.value)}
                className="dv-input"
                style={{ width: 140, fontWeight: 600 }}
              />
              <select
                value={colRoles[i]}
                onChange={(e) => onRoleChange(i, e.target.value as FactorialRole)}
                className="dv-input"
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  color: FACTORIAL_ROLE_COLORS[colRoles[i]],
                }}
              >
                <option value="factorA">factor A</option>
                <option value="factorB">factor B</option>
                <option value="value">value</option>
                <option value="ignore">ignore</option>
              </select>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {preview}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Cell-count grid preview. Colour-codes each cell: green when n ≥ 2,
// yellow when n = 1 (single replicate — low power), red when empty
// (interaction non-estimable).
function CellCountGrid({ summary }: { summary: DesignSummary }) {
  const { levelsA, levelsB, cellCounts } = summary;
  const cellBg = (n: number): string => {
    if (n === 0) return "var(--danger-bg)";
    if (n === 1) return "var(--warning-bg)";
    return "var(--success-bg)";
  };
  const cellFg = (n: number): string => {
    if (n === 0) return "var(--danger-text)";
    if (n === 1) return "var(--warning-text)";
    return "var(--success-text)";
  };
  return (
    <div className="dv-panel">
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
        Cell counts ({summary.levelsA.length} × {summary.levelsB.length} design, N = {summary.N})
      </p>
      <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 8px" }}></th>
            {levelsB.map((b) => (
              <th
                key={b}
                style={{
                  padding: "4px 10px",
                  fontWeight: 700,
                  color: FACTORIAL_ROLE_COLORS.factorB,
                  textAlign: "center",
                }}
              >
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levelsA.map((a, i) => (
            <tr key={a}>
              <td
                style={{
                  padding: "4px 10px",
                  fontWeight: 700,
                  color: FACTORIAL_ROLE_COLORS.factorA,
                }}
              >
                {a}
              </td>
              {levelsB.map((b, j) => {
                const n = cellCounts[i * levelsB.length + j];
                return (
                  <td
                    key={b}
                    style={{
                      padding: "6px 12px",
                      textAlign: "center",
                      fontWeight: 600,
                      background: cellBg(n),
                      color: cellFg(n),
                      border: "1px solid var(--border)",
                      minWidth: 40,
                    }}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ConfigureStepProps {
  fileName: string;
  parsedHeaders: string[];
  parsedRows: string[][];
  colRoles: FactorialRole[];
  colNames: string[];
  detectedSep: string;
  onRoleChange: (i: number, role: FactorialRole) => void;
  onNameChange: (i: number, name: string) => void;
  summary: DesignSummary | null;
  validationError: string | null;
}

export function ConfigureStep(props: ConfigureStepProps) {
  const {
    fileName,
    parsedHeaders,
    parsedRows,
    colRoles,
    colNames,
    detectedSep,
    onRoleChange,
    onNameChange,
    summary,
    validationError,
  } = props;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {fileName && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <strong>File:</strong> {fileName}
        </div>
      )}
      <DetectedSeparatorBadge sep={detectedSep} />
      <DataPreview headers={parsedHeaders} rows={parsedRows} />
      <FactorialRoleEditor
        headers={parsedHeaders}
        rows={parsedRows}
        colRoles={colRoles}
        colNames={colNames}
        onRoleChange={onRoleChange}
        onNameChange={onNameChange}
      />
      {summary && <CellCountGrid summary={summary} />}
      {validationError && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
            border: "1px solid var(--danger-border)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {validationError}
        </div>
      )}
      {!validationError && summary && summary.singletonCells > 0 && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--warning-bg)",
            color: "var(--warning-text)",
            border: "1px solid var(--warning-border)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {summary.singletonCells} cell{summary.singletonCells === 1 ? "" : "s"} have only n = 1
          observation — low power, but estimable. Add replicates if you can.
        </div>
      )}
    </div>
  );
}

// ── Report step ─────────────────────────────────────────────────────────────

interface ReportStepProps {
  result: TwoWayANOVAResult;
  factorAName: string;
  factorBName: string;
  valueName: string;
  fileStem: string;
  longRows: Array<{ a: string; b: string; v: number }>;
  diagnostics: {
    perCellShapiro: Array<{ levelA: string; levelB: string; W: number; p: number; n: number }>;
    levene: { F: number; df1: number; df2: number; p: number } | null;
  };
  vis: FactorialVis;
  updVis: (patch: Partial<FactorialVis>) => void;
}

export function ReportStep(props: ReportStepProps) {
  const {
    result,
    factorAName,
    factorBName,
    valueName,
    fileStem,
    longRows,
    diagnostics,
    vis,
    updVis,
  } = props;
  const diagnosticsBlock = useMemo(() => {
    if (!vis.showDiagnostics) return null;
    return { ...diagnostics, alphaNormality: vis.alphaNormality };
  }, [vis.showDiagnostics, vis.alphaNormality, diagnostics]);
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <PlotSidebar>
        <DisplayTiles vis={vis} updVis={updVis} />
        <DownloadTiles
          fileStem={fileStem}
          factorAName={factorAName}
          factorBName={factorBName}
          valueName={valueName}
          rows={longRows}
          result={result}
        />
        <HandoffTile
          factorAName={factorAName}
          factorBName={factorBName}
          valueName={valueName}
          longRows={longRows}
          fileStem={fileStem}
        />
      </PlotSidebar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Report
          result={result}
          factorAName={factorAName}
          factorBName={factorBName}
          valueName={valueName}
          diagnostics={diagnosticsBlock}
          showCellMeans={vis.showCellMeans}
        />
      </div>
    </div>
  );
}

// Re-export for app.tsx convenience.
export { summarizeDesign, validateDesign };

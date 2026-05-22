// tools/factorial/controls.tsx — sidebar tiles for the Report step:
// display toggles (cell means, diagnostics, alphaNormality), the
// CSV / R-script / TXT download trio, and the "Drill into Group Plot"
// cross-tool handoff. No SVG / PNG download — this is a stats-only tool,
// the canonical artefact is the formatted report.

import { downloadText } from "../_core/download";
import { SliderControl, navigateToTool, setHandoff } from "../_shell";
import type { TwoWayANOVAResult } from "../_core/stats/types";
import { buildCsv, buildRScript, buildTextReport } from "./reports";
import { buildHandoffPayload } from "./handoff";
import type { FactorialVis } from "./helpers";

const { useState } = React;

interface DownloadTilesProps {
  fileStem: string;
  factorAName: string;
  factorBName: string;
  valueName: string;
  rows: Array<{ a: string; b: string; v: number }>;
  result: TwoWayANOVAResult;
}

// Square download tiles, vertically stacked. Matches the per-tool
// DownloadTiles look-and-feel used by plot tools but with three buttons
// (CSV, R, TXT) instead of the SVG/PNG/CSV/R combo.
export function DownloadTiles(props: DownloadTilesProps) {
  const { fileStem, factorAName, factorBName, valueName, rows, result } = props;
  const input = { fileStem, factorAName, factorBName, valueName, rows, result };

  const tileStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: 6,
    padding: "14px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        style={tileStyle}
        onClick={() => downloadText(buildCsv(input), `${fileStem}_factorial.csv`)}
      >
        <span style={{ fontSize: 18 }}>CSV</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
          Cell means + ANOVA table
        </span>
      </button>
      <button
        type="button"
        style={tileStyle}
        onClick={() => downloadText(buildRScript(input), `${fileStem}_factorial.R`)}
      >
        <span style={{ fontSize: 18 }}>R script</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
          car::Anova(type = 2) cross-check
        </span>
      </button>
      <button
        type="button"
        style={tileStyle}
        onClick={() => downloadText(buildTextReport(input), `${fileStem}_factorial.txt`)}
      >
        <span style={{ fontSize: 18 }}>TXT report</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
          Formatted, paste-ready
        </span>
      </button>
    </div>
  );
}

interface DisplayTilesProps {
  vis: FactorialVis;
  updVis: (patch: Partial<FactorialVis>) => void;
}

export function DisplayTiles({ vis, updVis }: DisplayTilesProps) {
  const labelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text)",
    cursor: "pointer",
    userSelect: "none",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={vis.showCellMeans}
          onChange={(e) => updVis({ showCellMeans: e.target.checked })}
        />
        <span>Show cell-means table</span>
      </label>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={vis.showDiagnostics}
          onChange={(e) => updVis({ showDiagnostics: e.target.checked })}
        />
        <span>Show diagnostics (Shapiro, Levene)</span>
      </label>
      <SliderControl
        label="alphaNormality"
        value={vis.alphaNormality}
        min={0.001}
        max={0.1}
        step={0.001}
        onChange={(v: number) => updVis({ alphaNormality: v })}
      />
    </div>
  );
}

// ── Drill into Group Plot ───────────────────────────────────────────────────
//
// Cross-tool handoff: rebuilds the long-format CSV with one factor as
// the group axis and the other as the filter column, ships it to the
// Group Plot tool. The role mapping defaults to factor A → group,
// factor B → filter (per the slice-2 scope lock); the user can swap
// before confirming.

interface HandoffTileProps {
  factorAName: string;
  factorBName: string;
  valueName: string;
  longRows: Array<{ a: string; b: string; v: number }>;
  fileStem: string;
}

export function HandoffTile(props: HandoffTileProps) {
  const { factorAName, factorBName, valueName, longRows, fileStem } = props;
  const [groupFactor, setGroupFactor] = useState<"A" | "B">("A");
  const groupName = groupFactor === "A" ? factorAName : factorBName;
  const filterName = groupFactor === "A" ? factorBName : factorAName;

  const drillDown = (): void => {
    const payload = buildHandoffPayload({
      factorAName,
      factorBName,
      valueName,
      longRows,
      fileStem,
      groupFactor,
    });
    setHandoff(payload);
    navigateToTool("boxplot");
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-faint)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 700,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <span style={labelStyle}>Drill into specific cells</span>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
        Open this dataset in <strong>Group Plot</strong> for per-cell post-hoc comparisons.
      </p>
      <div
        style={{
          fontSize: 12,
          color: "var(--text)",
          padding: "8px 10px",
          background: "var(--surface-subtle)",
          borderRadius: 4,
        }}
      >
        Group axis: <strong>{groupName}</strong>
        <br />
        Filter on: <strong>{filterName}</strong>
      </div>
      <button
        type="button"
        onClick={() => setGroupFactor(groupFactor === "A" ? "B" : "A")}
        style={{
          fontSize: 11,
          padding: "4px 8px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-muted)",
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        ⇄ Swap factors
      </button>
      <button
        type="button"
        onClick={drillDown}
        style={{
          padding: "10px 12px",
          background: "var(--accent-primary)",
          color: "var(--on-accent)",
          border: "none",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Open in Group Plot →
      </button>
    </div>
  );
}

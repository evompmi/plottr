// tools/factorial/controls.tsx — sidebar tiles for the Report step:
// display toggles (cell means, diagnostics, alphaNormality) and the
// CSV / R-script / TXT download trio. No SVG / PNG download — this is a
// stats-only tool, the canonical artefact is the formatted report.

import { downloadText } from "../_core/download";
import { SliderControl } from "../_shell";
import type { TwoWayANOVAResult } from "../_core/stats/types";
import { buildCsv, buildRScript, buildTextReport } from "./reports";
import type { FactorialVis } from "./helpers";

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

// lineplot/steps.tsx — UploadStep + ConfigureStep panels, plus the small
// ControlSection disclosure helper used inside the Plot step's sidebar
// and the LpAesBox themed wrapper used in the configure-step grid.

import type { UploadStepProps, ConfigureStepProps } from "./helpers";
import { HowTo } from "../_shell/HowTo";
import { LINEPLOT_HOWTO } from "./howto";

const { useState, useRef, useEffect } = React;

// ── ControlSection (disclosure panel) ──────────────────────────────────────

export function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
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

// ── UploadStep ─────────────────────────────────────────────────────────────

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
        exampleLabel="Bacterial growth curves (3 strains × 5 timepoints × 3 reps)"
        hint="CSV · TSV · TXT — one row per observation, columns for X, Y, and grouping · 2 MB max"
      />
      <HowTo {...LINEPLOT_HOWTO} />
    </div>
  );
}

// ── ConfigureStep ──────────────────────────────────────────────────────────
// Preview the parsed table and confirm the column roles before plotting.

// Role-colour themes. Reuse scatter's `--aes-*` CSS vars so the configure-
// step cards feel visually related to scatter's aesthetic selectors —
// slate (X), emerald (Y), purple (Group). Adds the theme-aware light/dark
// palette for free (vars defined per-theme in tools/theme.css).
const LP_AES_THEMES = {
  x: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "X axis",
  },
  y: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Y axis",
  },
  group: {
    bg: "var(--aes-shape-bg)",
    border: "var(--aes-shape-border)",
    header: "var(--aes-shape-header)",
    headerText: "var(--aes-shape-header-text)",
    label: "Group by",
  },
};

function LpAesBox({ theme, children }: { theme: "x" | "y" | "group"; children?: React.ReactNode }) {
  const t = LP_AES_THEMES[theme];
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
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
      <div style={{ padding: "12px 14px", minHeight: 40 }}>{children}</div>
    </div>
  );
}

export function ConfigureStep({
  parsed,
  fileName,
  xCol,
  setXCol,
  yCol,
  setYCol,
  groupCol,
  setGroupCol,
  numericCols,
  categoricalCols,
}: ConfigureStepProps) {
  const canPlot = xCol != null && yCol != null && numericCols.length >= 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <LpAesBox theme="x">
          <select
            value={xCol ?? ""}
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
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            Numeric column plotted along the X axis.
          </div>
        </LpAesBox>
        <LpAesBox theme="y">
          <select
            value={yCol ?? ""}
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
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            Numeric column plotted along the Y axis.
          </div>
        </LpAesBox>
        <LpAesBox theme="group">
          <select
            value={groupCol == null ? "" : groupCol}
            onChange={(e) => setGroupCol(e.target.value === "" ? null : parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            <option value="">— None (single line) —</option>
            {categoricalCols.map((i: number) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            Categorical column used to split the data into coloured lines.
          </div>
        </LpAesBox>
      </div>
      {!canPlot && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--warning-text)" }}>
          Need at least two numeric columns to plot.
        </p>
      )}

      <div className="dv-panel" style={{ marginBottom: 0 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>
          Loaded <strong style={{ color: "var(--text)" }}>{fileName || "pasted data"}</strong> —{" "}
          {parsed.rawData.length} rows × {parsed.headers.length} columns
        </p>
        <DataPreview headers={parsed.headers} rows={parsed.rawData} maxRows={10} />
      </div>
    </div>
  );
}

// lineplot/steps.tsx — UploadStep + ConfigureStep panels, plus the small
// ControlSection disclosure helper used inside the Plot step's sidebar
// and the LpAesBox themed wrapper used in the configure-step grid.

import type { UploadStepProps, ConfigureStepProps } from "./helpers";

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
      <HowToCard
        toolName="lineplot"
        title="Line Plot — How to use"
        subtitle="Upload → Preview & pick X / Y / Group → Plot with per-x statistics"
      >
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
            gridColumn: "1/-1",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Data layout
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 }}>
            <strong>Long format</strong> — one <strong>row</strong> per observation, with a numeric{" "}
            <strong>X</strong>, a numeric <strong>Y</strong>, and a categorical{" "}
            <strong>group</strong> column. Replicates share the same (X, group) pair. Replicates are
            averaged to build the line; their spread becomes the error bar.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Error bars
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Pick <strong>SEM</strong> (default), <strong>SD</strong>, or <strong>95% CI</strong>. CI
            uses the <em>t</em> quantile at <em>n−1</em> degrees of freedom. Error bars only render
            when a group has ≥ 2 replicates at that X.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Per-x statistics
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            At every X shared by ≥ 2 groups, the right test is picked automatically (<em>t</em> /
            Welch / Mann-Whitney; ANOVA / Welch-ANOVA / Kruskal-Wallis). P-values are{" "}
            <strong>BH-adjusted</strong> across the X-axis; stars mark significant points.
          </p>
        </div>

        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "Long-format (x, y, group)",
            "SEM / SD / 95% CI",
            "Per-x test auto-routing",
            "BH-adjusted significance stars",
            "Decision trace & R export",
            "100% browser-side",
          ].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--surface)",
                border: "1px solid var(--info-border)",
                color: "var(--text-muted)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </HowToCard>
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

// Building blocks for a tool's statistics column (the workspace inspector),
// so every tool's results read the same way: compact mono tables, a stars
// badge, check / cross assumption rows, selectable per-set rows, and the
// analysis-exports footer. `InspectorSection` (one titled block) lives in
// `WorkspaceLayout.tsx` next to the column itself.

import { pStars } from "../_core/stats/format";

// Inline styles for the inspector's compact tables: first column left-
// aligned text, the rest right-aligned numbers, hairline row dividers.
export const inspectorTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};
export const inspectorTh: React.CSSProperties = {
  fontWeight: 500,
  padding: "4px 0 4px 8px",
  color: "var(--text-faint)",
  textAlign: "right",
  whiteSpace: "nowrap",
};
export const inspectorTd: React.CSSProperties = {
  padding: "6px 0 6px 8px",
  borderTop: "1px solid var(--border-subtle)",
  color: "var(--text)",
  textAlign: "right",
  whiteSpace: "nowrap",
};
// Merge onto the first cell of a row (labels, wrapping allowed).
export const inspectorFirstCol: React.CSSProperties = {
  paddingLeft: 0,
  textAlign: "left",
  whiteSpace: "normal",
};

// ✓ / ✗ / – marker for an assumption row (true / false / unknown).
export function Verdict({ ok }: { ok: boolean | null | undefined }) {
  const color =
    ok === true ? "var(--step-ready)" : ok === false ? "var(--danger-text)" : "var(--text-faint)";
  const d = ok === true ? "M5 12l5 5L20 7" : ok === false ? "M6 6l12 12M18 6L6 18" : "M6 12h12";
  return (
    <span style={{ color, display: "inline-flex" }}>
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </span>
  );
}

// One assumption check: marker, label, and a mono value on the right.
export function AssumptionRow({
  ok,
  label,
  value,
  title,
}: {
  ok: boolean | null | undefined;
  label: React.ReactNode;
  value?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="dv-assumption-row" title={title}>
      <Verdict ok={ok} />
      <span>{label}</span>
      <span className="dv-mono-faint">{value}</span>
    </div>
  );
}

// Significance stars on a tinted chip (green when p < 0.05).
export function StarsBadge({ p }: { p: number | null | undefined }) {
  if (p == null || !Number.isFinite(p)) return null;
  const sig = p < 0.05;
  return (
    <span
      className="dv-stars-badge"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: "var(--radius-sm)",
        padding: "2px 6px",
        color: sig ? "var(--success-text)" : "var(--text-faint)",
        background: sig ? "var(--success-bg)" : "var(--surface-sunken)",
      }}
    >
      {pStars(p)}
    </span>
  );
}

// The headline of a result section: test name (display serif) + stars,
// then the statistic parts in mono ("F(2, 45.51) = 37.326", "p = …").
export function ResultHeadline({
  name,
  p,
  parts,
  error,
}: {
  name: React.ReactNode;
  p: number | null | undefined;
  parts: string[];
  error?: boolean;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.2,
          }}
        >
          {name}
        </span>
        <StarsBadge p={p} />
      </div>
      <div
        data-testid="inspector-result-line"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: error ? "var(--danger-text)" : "var(--text)",
          display: "flex",
          gap: "4px 16px",
          flexWrap: "wrap",
        }}
      >
        {parts.map((part, i) => (
          <span key={i}>{part}</span>
        ))}
      </div>
    </>
  );
}

// A selectable row in a multi-set list (one per facet / x value / cell):
// name, a muted detail, p and stars. Opens the set's sections when clicked.
export function SetRow({
  name,
  detail,
  p,
  pText,
  open,
  onToggle,
}: {
  name: React.ReactNode;
  detail?: React.ReactNode;
  p: number | null | undefined;
  pText?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="dv-set-row" aria-expanded={open} onClick={onToggle}>
      <span style={{ fontWeight: 600, textAlign: "left" }}>{name}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "left" }}>{detail}</span>
      <span className="dv-mono-faint">{pText ?? "—"}</span>
      <StarsBadge p={p} />
    </button>
  );
}

// The opened detail of a SetRow, marked by an accent rule on the left.
export function SetDetail({ children }: { children: React.ReactNode }) {
  return <div style={{ borderLeft: "3px solid var(--accent-primary)" }}>{children}</div>;
}

// Footer of the inspector: "Analysis exports" + its buttons (R script,
// Methods, report), all secondary buttons of equal weight.
export function InspectorExports({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="dv-inspector-exports"
      style={{
        padding: "16px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--surface-subtle)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

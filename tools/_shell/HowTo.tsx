// Shared "How to use" tile for the upload step of every plot tool.
//
// Wraps the existing `HowToCard` (collapsible header + tool icon, lives
// in shared-ui.js) and renders a uniform body — three required sub-
// cards (Purpose / Data layout / Display) plus an optional Tips card —
// driven by a `HowToContent` object passed by the caller. That moves
// per-tool prose out of long `steps.tsx` / `index.tsx` files and into
// tiny per-tool `howto.tsx` constants, and keeps the visual depth
// consistent across tools (no more wall-of-text in one place + one-
// liner in another).
//
// The rendering layer (sub-card header style, grid layout, pill list)
// lives here. Tool-specific content lives in `tools/<tool>/howto.tsx`.

import type { ReactNode } from "react";

export interface HowToContent {
  /** Drives the tool icon + the collapsible's localStorage key. */
  toolName: string;
  /** First-line title — e.g. "Volcano Plot — How to use". */
  title: string;
  /** One-line "TL;DR" subtitle below the title. */
  subtitle: string;
  /** What is this tool for, in user-language? Keep to 1–2 sentences. */
  purpose: ReactNode;
  /** What shape of data does it accept? Keep to 1–2 sentences. */
  dataLayout: ReactNode;
  /** Key display options + tool-specific specifics. 2–3 sentences. */
  display: ReactNode;
  /**
   * Optional tips / power-user hints (e.g. "click points to label").
   * When present, renders as a 4th full-width sub-card below the trio.
   */
  tips?: ReactNode;
  /**
   * Optional capability tags. Renders as a wrapped pill list at the
   * bottom — short label per pill, no styling overrides. Skip for
   * tools that don't need a marketing-style summary.
   */
  capabilities?: string[];
}

// Sub-card visuals — kept in lockstep across tools so a user moving
// between volcano and lineplot doesn't perceive a different "depth"
// of help. Header label style + body padding mirror the existing
// HowToCard sub-card pattern (lineplot was the canonical one).
function SubCard({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 10,
        padding: "14px 18px",
        border: "1.5px solid var(--info-border)",
        gridColumn: fullWidth ? "1/-1" : undefined,
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
        {label}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>{children}</div>
    </div>
  );
}

export function HowTo(props: HowToContent) {
  return (
    <HowToCard toolName={props.toolName} title={props.title} subtitle={props.subtitle}>
      <SubCard label="Purpose" fullWidth>
        {props.purpose}
      </SubCard>
      <SubCard label="Data layout">{props.dataLayout}</SubCard>
      <SubCard label="Display">{props.display}</SubCard>
      {props.tips && (
        <SubCard label="Tips" fullWidth>
          {props.tips}
        </SubCard>
      )}
      {props.capabilities && props.capabilities.length > 0 && (
        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {props.capabilities.map((t) => (
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
      )}
    </HowToCard>
  );
}

// Collapsible sidebar tile — the canonical disclosure section every plot
// tool's control panel is built from. Previously each tool kept its own
// byte-identical copy; this is the single shared implementation.
//
// The header row carries the `dv-disclosure` chevron + title and an optional
// `headerRight` slot (e.g. a section-level on/off pill) that stays visible
// when the body is folded. With no `headerRight` the row renders exactly like
// the plain "button is the whole header" variant the simpler tools used, so
// this is a drop-in replacement for both shapes.

import { scrollDisclosureIntoView } from "./scroll-helpers";

const { useState, useRef, useEffect } = React;

export interface ControlSectionProps {
  title: React.ReactNode;
  defaultOpen?: boolean;
  /** Optional inline control rendered to the right of the title; survives folds. */
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}

export function ControlSection({
  title,
  defaultOpen = false,
  headerRight,
  children,
}: ControlSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "7px 10px",
          gap: 8,
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="dv-tile-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            padding: 0,
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
        {headerRight}
      </div>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

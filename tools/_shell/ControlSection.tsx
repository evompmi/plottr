// Collapsible sidebar tile — the canonical disclosure section every plot
// tool's control panel is built from. Previously each tool kept its own
// byte-identical copy; this is the single shared implementation.
//
// The header row carries the `dv-disclosure` chevron + title and an optional
// `headerRight` slot (e.g. a section-level on/off pill) that stays visible
// when the body is folded. With no `headerRight` the row renders exactly like
// the plain "button is the whole header" variant the simpler tools used, so
// this is a drop-in replacement for both shapes.
//
// Inside a `ControlTabs` panel the section is always open and renders as a
// plain titled group (no chevron, no card): the tab already does the
// grouping, so a second level of folding would only hide controls.

import { ControlTabsContext } from "./ControlTabs";
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
  const inTabs = React.useContext(ControlTabsContext);
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  // Reveal a section the user just opened — not the ones that start open,
  // or every default-open tile would scroll the sidebar on mount and hide
  // its top.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  if (inTabs) {
    return (
      <section className="dv-ctrl-group">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
          <h3 className="dv-tile-title" style={{ margin: 0, flex: 1 }}>
            {title}
          </h3>
          {headerRight}
        </div>
        {children}
      </section>
    );
  }
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

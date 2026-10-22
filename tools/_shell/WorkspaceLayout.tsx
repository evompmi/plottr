// `WorkspaceLayout` — the plot step's three-column workspace:
//
//   controls (tabs)  |  figure canvas  |  inspector (statistics)
//
// The columns fill the window below the app bar and each scrolls on its
// own, so the figure stays in view while the controls or the statistics
// are scrolled. The figure sits as a white "sheet" on a dotted canvas,
// with an optional toolbar row above it for quick display toggles. Tools
// without statistics leave `inspector` out and get two columns.
//
// `inspectorToggle` (the tool id) makes the statistics column opt-in: it
// starts as a slim labelled rail on the right edge and opens on click; the
// choice is remembered per tool. The column stays mounted while hidden —
// stats panels emit the plot's significance marks from their effects, so
// letters / brackets keep working with the column closed.

import { useShellT } from "./i18n";

const { useState, useRef, useEffect, useId } = React;

export interface WorkspaceLayoutProps {
  controls: React.ReactNode;
  figure: React.ReactNode;
  // Quick display controls shown above the figure (e.g. significance marks).
  toolbar?: React.ReactNode;
  // Statistics column; omitted → two columns.
  inspector?: React.ReactNode;
  // Accessible names for the side columns.
  controlsLabel: string;
  inspectorLabel?: string;
  // Tool id: collapse the inspector to a rail until the user opens it.
  inspectorToggle?: string;
}

const inspectorKey = (tool: string): string => "plottr-inspector-" + tool;
function readInspectorOpen(tool: string): boolean {
  try {
    return localStorage.getItem(inspectorKey(tool)) === "open";
  } catch {
    return false;
  }
}
function writeInspectorOpen(tool: string, open: boolean): void {
  try {
    localStorage.setItem(inspectorKey(tool), open ? "open" : "closed");
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

const COLUMN_HEIGHT = "calc(100vh - var(--dv-sticky-top, 56px))";

export function WorkspaceLayout({
  controls,
  figure,
  toolbar,
  inspector,
  controlsLabel,
  inspectorLabel,
  inspectorToggle,
}: WorkspaceLayoutProps) {
  const tr = useShellT();
  const hasInspector = inspector != null && inspector !== false;
  const collapsible = hasInspector && !!inspectorToggle;
  const [open, setOpen] = useState(() =>
    inspectorToggle ? readInspectorOpen(inspectorToggle) : true
  );
  const inspectorId = useId();
  const railRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  // Move focus with the toggle, but only after a click — not on first paint.
  const focusAfter = useRef(false);
  useEffect(() => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    (open ? hideRef : railRef).current?.focus();
  }, [open]);
  const toggle = (next: boolean) => {
    focusAfter.current = true;
    setOpen(next);
    if (inspectorToggle) writeInspectorOpen(inspectorToggle, next);
  };
  const shown = !collapsible || open;
  return (
    <div
      className="dv-workspace"
      data-columns={hasInspector && shown ? 3 : 2}
      style={{ display: "flex", alignItems: "stretch", height: COLUMN_HEIGHT, minHeight: 480 }}
    >
      <aside
        aria-label={controlsLabel}
        className="dv-workspace-controls"
        style={{
          flex: "0 0 312px",
          minWidth: 0,
          overflowY: "auto",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Column headings for the outline (the section titles inside are h3). */}
        <h2 className="dv-sr-only">{controlsLabel}</h2>
        {controls}
      </aside>
      <div
        className="dv-workspace-canvas"
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--canvas-bg)",
          backgroundImage: "radial-gradient(var(--canvas-dot) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {toolbar && (
          <div
            className="dv-workspace-toolbar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              padding: "12px 20px",
            }}
          >
            {toolbar}
          </div>
        )}
        <div
          className="dv-workspace-figure"
          style={{
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: toolbar ? "4px 24px 40px" : "24px 24px 40px",
          }}
        >
          {figure}
        </div>
      </div>
      {collapsible && !open && (
        <button
          ref={railRef}
          type="button"
          className="dv-inspector-rail"
          aria-expanded={false}
          aria-controls={inspectorId}
          onClick={() => toggle(true)}
          aria-label={tr("shell.inspector.show", { name: inspectorLabel || "" })}
        >
          <span className="dv-inspector-rail-pill">
            <ChevronIcon dir="left" />
            <span className="dv-inspector-rail-label">{inspectorLabel}</span>
          </span>
        </button>
      )}
      {hasInspector && (
        <aside
          id={inspectorId}
          aria-label={inspectorLabel}
          className="dv-workspace-inspector"
          // Hidden, not unmounted: the panel keeps feeding the plot's marks.
          hidden={!shown}
          style={{
            flex: "0 0 380px",
            minWidth: 0,
            overflowY: "auto",
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
          }}
        >
          {collapsible ? (
            <div className="dv-inspector-head">
              <h2 className="dv-tile-title" style={{ margin: 0 }}>
                {inspectorLabel}
              </h2>
              <button
                ref={hideRef}
                type="button"
                className="dv-btn dv-btn-secondary"
                aria-expanded={true}
                aria-controls={inspectorId}
                onClick={() => toggle(false)}
                style={{
                  padding: "2px 10px",
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                {tr("shell.inspector.hide")}
                <ChevronIcon dir="right" />
              </button>
            </div>
          ) : (
            inspectorLabel && <h2 className="dv-sr-only">{inspectorLabel}</h2>
          )}
          {inspector}
        </aside>
      )}
    </div>
  );
}

// One titled block of the inspector column (Omnibus test, Post-hoc, …).
// `collapsible` turns the title into a disclosure button (for repeated
// blocks such as qPCR's one-per-gene statistics); `right` stays visible
// either way, so a collapsed block still shows its summary badge.
export function InspectorSection({
  label,
  right,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  label: React.ReactNode;
  // Optional control on the label row (e.g. a test picker or a toggle).
  right?: React.ReactNode;
  children?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const bodyId = React.useId();
  return (
    <section
      className="dv-inspector-section"
      style={{
        padding: collapsible && !open ? "12px 20px" : "18px 20px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h3 className="dv-tile-title" style={{ margin: 0, flex: collapsible ? 1 : undefined }}>
          {collapsible ? (
            <button
              type="button"
              className="dv-inspector-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
            >
              <span
                className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
                aria-hidden="true"
              />
              {label}
            </button>
          ) : (
            label
          )}
        </h3>
        {right}
      </div>
      {collapsible
        ? open && (
            <div id={bodyId} style={{ display: "contents" }}>
              {children}
            </div>
          )
        : children}
    </section>
  );
}

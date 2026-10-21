// `WorkspaceLayout` — the plot step's three-column workspace:
//
//   controls (tabs)  |  figure canvas  |  inspector (statistics)
//
// The columns fill the window below the app bar and each scrolls on its
// own, so the figure stays in view while the controls or the statistics
// are scrolled. The figure sits as a white "sheet" on a dotted canvas,
// with an optional toolbar row above it for quick display toggles. Tools
// without statistics leave `inspector` out and get two columns.

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
}

const COLUMN_HEIGHT = "calc(100vh - var(--dv-sticky-top, 56px))";

export function WorkspaceLayout({
  controls,
  figure,
  toolbar,
  inspector,
  controlsLabel,
  inspectorLabel,
}: WorkspaceLayoutProps) {
  const hasInspector = inspector != null && inspector !== false;
  return (
    <div
      className="dv-workspace"
      data-columns={hasInspector ? 3 : 2}
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
      {hasInspector && (
        <aside
          aria-label={inspectorLabel}
          className="dv-workspace-inspector"
          style={{
            flex: "0 0 380px",
            minWidth: 0,
            overflowY: "auto",
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
          }}
        >
          {inspectorLabel && <h2 className="dv-sr-only">{inspectorLabel}</h2>}
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

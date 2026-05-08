// Shared sidebar frame for every plot tool: a fixed-width column that hosts
// the ActionsPanel and all collapsible control tiles. Sticky by default so
// the controls follow the viewport while the plot scrolls; opt out with
// `sticky={false}` for tools whose sidebar is short enough that sticky
// scrolling would be distracting.

interface PlotSidebarProps {
  children: React.ReactNode;
  sticky?: boolean;
  width?: number;
}

export function PlotSidebar({ children, sticky = true, width = 279 }: PlotSidebarProps) {
  return (
    <div
      // The `dv-sidebar` class lets components.css zero
      // `margin-bottom` on direct `.dv-panel` children. Without it,
      // bare `<div className="dv-panel">` tiles inherit the CSS-level
      // 16px margin-bottom and stack on top of the flex `gap: 10` —
      // giving 26px between bare panels but 10px between ControlSections
      // (which override the margin inline). The class makes the
      // between-panel spacing uniformly 10px regardless of tile type.
      className="dv-sidebar"
      style={{
        width,
        flexShrink: 0,
        ...(sticky
          ? {
              position: "sticky",
              top: 24,
              maxHeight: "calc(100vh - 90px)",
              overflowY: "auto",
            }
          : {}),
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

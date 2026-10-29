// Configure-step card for one column role (X axis, value column, label, …)
// or a block of set-up fields (RLU calibration, time axis). A plain
// `dv-panel` like the other Configure panels, titled with the same mono
// section label (`dv-tile-title`) the plot sidebar uses. Several cards sit
// side by side in the tool's own grid; the card drops `dv-panel`'s bottom
// margin so the grid gap alone spaces them.

export interface RoleCardProps {
  title: React.ReactNode;
  children?: React.ReactNode;
}

export function RoleCard({ title, children }: RoleCardProps) {
  return (
    <section
      className="dv-panel"
      style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <h2 className="dv-tile-title" style={{ margin: 0 }}>
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

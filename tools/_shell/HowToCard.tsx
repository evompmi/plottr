// `HowToCard` — collapsible "How to use" card shared across every plot
// tool's upload step. Open state persists under `dv-howto-<toolName>`
// in localStorage; open by default on first visit, then follows
// whatever the user last chose.

const h = React.createElement;

const { useState, useMemo } = React;

interface HowToCardProps {
  toolName: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

export function HowToCard(props: HowToCardProps) {
  const { toolName, title, subtitle, children } = props;
  const storageKey = "dv-howto-" + toolName;
  const initialOpen = useMemo(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {
      /* ignore */
    }
    return true;
  }, [storageKey]);
  const [open, setOpen] = useState(initialOpen);
  const bodyId = "dv-howto-body-" + toolName;
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return h(
    "section",
    {
      style: {
        marginTop: 24,
        borderRadius: 14,
        overflow: "hidden",
        border: "2px solid var(--howto-border)",
        boxShadow: "var(--howto-shadow)",
      },
    },
    h(
      "button",
      {
        type: "button",
        onClick: toggle,
        "aria-expanded": open ? "true" : "false",
        "aria-controls": bodyId,
        style: {
          width: "100%",
          background: "linear-gradient(135deg,var(--howto-header-from),var(--howto-header-to))",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
        },
      },
      toolIcon(toolName, 24, { circle: true }),
      h(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        h("div", { style: { color: "var(--on-accent)", fontWeight: 700, fontSize: 15 } }, title),
        subtitle
          ? h(
              "div",
              { style: { color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 } },
              subtitle
            )
          : null
      ),
      h(
        "span",
        {
          "aria-hidden": "true",
          style: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--on-accent)",
            transition: "transform .18s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
          },
        },
        h(
          "svg",
          { width: 22, height: 22, viewBox: "0 0 24 24", style: { display: "block" } },
          h("path", {
            d: "M9 5l7 7-7 7",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2.6,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          })
        )
      )
    ),
    open
      ? h(
          "div",
          {
            id: bodyId,
            style: {
              background: "var(--info-bg)",
              padding: "20px 24px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            },
          },
          children
        )
      : null
  );
}

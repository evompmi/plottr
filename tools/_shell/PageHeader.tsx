// `PageHeader` — top-of-tool header with the tool icon, title, and
// optional middle (e.g. step nav) and right (e.g. PrefsPanel) slots.
// The landing page owns the theme toggle in its top bar — we don't
// render a second one here.

const h = React.createElement;

interface PageHeaderProps {
  toolName: string;
  title: React.ReactNode;
  middle?: React.ReactNode;
  right?: React.ReactNode;
}

export function PageHeader(props: PageHeaderProps) {
  const vbar = (key: string) =>
    h("div", {
      key,
      "aria-hidden": "true",
      style: {
        flex: "0 0 auto",
        width: 1,
        alignSelf: "stretch",
        background: "var(--border-strong)",
      },
    });
  const rowChildren: React.ReactNode[] = [
    h(
      "h1",
      {
        key: "title",
        style: {
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text)",
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
        },
      },
      toolIcon(props.toolName),
      props.title
    ),
  ];
  if (props.middle) {
    rowChildren.push(vbar("vbar-middle"));
    rowChildren.push(
      h(
        "div",
        {
          key: "middle",
          style: { flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center" },
        },
        props.middle
      )
    );
  } else {
    rowChildren.push(h("div", { key: "spacer", style: { flex: "1 1 auto" } }));
  }
  if (props.right) {
    rowChildren.push(vbar("vbar-right"));
    rowChildren.push(
      h(
        "div",
        {
          key: "right",
          style: { flex: "0 0 auto", display: "flex", alignItems: "center" },
        },
        props.right
      )
    );
  }
  return h(
    "div",
    {
      style: {
        marginBottom: 28,
        borderBottom: "1px solid var(--border-strong)",
        paddingBottom: 16,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 16,
          minHeight: 40,
        },
      },
      rowChildren
    )
  );
}

// `CommaFixBanner` — yellow status banner shown when the parser auto-
// converted decimal commas to dots during ingest. `commaFixed` is the
// boolean toggle, `commaFixCount` is the number of values fixed.

import { useShellT } from "./i18n";

const h = React.createElement;

interface CommaFixBannerProps {
  commaFixed: boolean;
  commaFixCount: number;
}

export function CommaFixBanner(props: CommaFixBannerProps) {
  const tr = useShellT();
  if (!props.commaFixed) return null;
  return h(
    "div",
    {
      className: "dv-panel",
      role: "status",
      style: {
        background: "var(--warning-bg)",
        borderColor: "var(--warning-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
      },
    },
    h("span", { style: { fontSize: 18 }, "aria-hidden": "true" }, "🔄"),
    h(
      "div",
      { style: { flex: 1 } },
      h(
        "p",
        { style: { margin: 0, fontSize: 12, color: "var(--warning-text)", fontWeight: 600 } },
        tr("shell.commaFix.title")
      ),
      h(
        "p",
        {
          style: { margin: "2px 0 0", fontSize: 11, color: "var(--warning-text)", opacity: 0.85 },
        },
        tr("shell.commaFix.detail", { count: props.commaFixCount })
      )
    )
  );
}

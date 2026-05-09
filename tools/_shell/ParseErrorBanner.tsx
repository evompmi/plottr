// `ParseErrorBanner` — red alert banner shown when the parser raises
// an error string. Renders nothing when `error` is null/undefined.

const h = React.createElement;

interface ParseErrorBannerProps {
  error: string | null | undefined;
}

export function ParseErrorBanner(props: ParseErrorBannerProps) {
  if (!props.error) return null;
  return h(
    "div",
    {
      role: "alert",
      style: {
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--danger-bg)",
        border: "1px solid var(--danger-border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      },
    },
    h("span", { style: { fontSize: 16 }, "aria-hidden": "true" }, "🚫"),
    h(
      "span",
      { style: { fontSize: 12, color: "var(--danger-text)", fontWeight: 600 } },
      props.error
    )
  );
}

// `StatsTable` — summary stats table (n / mean / median / SD / SEM /
// min / max per group) used in the output step of group-plot tools.
//
// `PALETTE` is read off the ambient browser globals.

import { PALETTE } from "../_core/color";

import type { GroupStats } from "../_core/descriptive";
const h = React.createElement;

interface StatsTableProps {
  stats: GroupStats[] | null | undefined;
  groupLabel: string;
}

export function StatsTable({ stats, groupLabel }: StatsTableProps) {
  if (!stats || stats.length === 0) return null;
  const headers = ["Group", "n", "Mean", "Median", "SD", "SEM", "Min", "Max"];
  return h(
    "div",
    { className: "dv-panel" },
    h(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" } },
      `Summary — grouped by "${groupLabel}"`
    ),
    h(
      "div",
      { style: { overflowX: "auto" } },
      h(
        "table",
        { style: { borderCollapse: "collapse", fontSize: 12, width: "100%" } },
        h(
          "thead",
          null,
          h(
            "tr",
            { style: { borderBottom: "2px solid var(--border-strong)" } },
            headers.map((hdr) =>
              h(
                "th",
                {
                  key: hdr,
                  style: {
                    padding: "4px 10px",
                    textAlign: "left",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                  },
                },
                hdr
              )
            )
          )
        ),
        h(
          "tbody",
          null,
          stats.map((s, i) =>
            h(
              "tr",
              { key: s.name, style: { borderBottom: "1px solid var(--border)" } },
              h(
                "td",
                {
                  style: {
                    padding: "4px 10px",
                    fontWeight: 600,
                    color: PALETTE[i % PALETTE.length],
                  },
                },
                s.name
              ),
              h("td", { style: { padding: "4px 10px" } }, s.n),
              h("td", { style: { padding: "4px 10px" } }, s.mean != null ? s.mean.toFixed(4) : "—"),
              h(
                "td",
                { style: { padding: "4px 10px" } },
                s.median != null ? s.median.toFixed(4) : "—"
              ),
              h("td", { style: { padding: "4px 10px" } }, s.sd != null ? s.sd.toFixed(4) : "—"),
              h("td", { style: { padding: "4px 10px" } }, s.sem != null ? s.sem.toFixed(4) : "—"),
              h("td", { style: { padding: "4px 10px" } }, s.min != null ? s.min.toFixed(4) : "—"),
              h("td", { style: { padding: "4px 10px" } }, s.max != null ? s.max.toFixed(4) : "—")
            )
          )
        )
      )
    )
  );
}

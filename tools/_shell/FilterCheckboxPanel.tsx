// `FilterCheckboxPanel` — per-column filter grid for the filter step.
// Renders one panel per categorical / filter column with checkboxes
// for each unique value (and All / None bulk-toggles). Numeric
// columns get a placeholder note instead.
//
// `isNumericValue` is read off the ambient browser globals.

import { isNumericValue } from "../_core/numeric";

import type { ColumnRole } from "../_core/csv";
const h = React.createElement;

interface FilterCheckboxPanelProps {
  headers: string[];
  colNames: string[];
  colRoles: ColumnRole[];
  filters: Record<number, FilterEntry>;
  filteredCount: number;
  totalCount: number;
  onToggle: (i: number, value: string) => void;
  onToggleAll: (i: number, allOn: boolean) => void;
}

export function FilterCheckboxPanel(props: FilterCheckboxPanelProps) {
  const headers = props.headers;
  const colNames = props.colNames;
  const colRoles = props.colRoles;
  const filters = props.filters;
  const filteredCount = props.filteredCount;
  const totalCount = props.totalCount;
  const onToggle = props.onToggle;
  const onToggleAll = props.onToggleAll;
  return h(
    "div",
    {
      style: {
        flex: 1,
        borderRadius: 10,
        padding: 16,
        border: "1px solid var(--info-border)",
        background: "var(--info-bg)",
        display: "flex",
        flexDirection: "column",
      },
    },
    h(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--info-text)" } },
      "Filter rows (" + filteredCount + "/" + totalCount + ")"
    ),
    h(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch", flex: 1 } },
      headers.map((_hdr, i) => {
        // Hide the value column's tile here too: it was assigned in Configure
        // and is guaranteed to stay (rows are kept if their value is numeric);
        // a filter tile adds no affordance and the old "numeric — use axis
        // range in plot" placeholder was pure noise.
        if (colRoles[i] === "ignore" || colRoles[i] === "value") return null;
        const u: string[] = filters[i] ? Array.from(filters[i].unique) : [];
        const isNumCol = u.length > 0 && u.filter((v) => isNumericValue(v)).length / u.length > 0.5;
        if (isNumCol && colRoles[i] !== "filter") {
          return h(
            "div",
            {
              key: "col-" + i,
              style: {
                minWidth: 140,
                flex: 1,
                background: "var(--surface)",
                borderRadius: 6,
                border: "1px solid var(--border)",
                padding: 10,
              },
            },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
              h(
                "p",
                { style: { fontSize: 11, fontWeight: 600, color: "var(--text)", margin: 0 } },
                colNames[i]
              ),
              h(
                "button",
                {
                  onClick: () => onToggleAll(i, true),
                  style: {
                    fontSize: 9,
                    padding: "2px 6px",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "var(--text-muted)",
                  },
                },
                "All"
              )
            ),
            h(
              "p",
              {
                style: {
                  fontSize: 10,
                  color: "var(--text-faint)",
                  margin: "4px 0 0",
                  fontStyle: "italic",
                },
              },
              "numeric — use axis range in plot"
            )
          );
        }
        return h(
          "div",
          {
            key: "col-" + i,
            style: {
              minWidth: 140,
              flex: 1,
              background: "var(--surface)",
              borderRadius: 6,
              border: "1px solid var(--border)",
              padding: 10,
            },
          },
          h(
            "p",
            { style: { fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 } },
            colNames[i]
          ),
          h(
            "div",
            { style: { display: "flex", gap: 6, marginBottom: 4 } },
            h(
              "button",
              {
                onClick: () => onToggleAll(i, true),
                style: {
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--text-muted)",
                },
              },
              "All"
            ),
            h(
              "button",
              {
                onClick: () => onToggleAll(i, false),
                style: {
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--text-muted)",
                },
              },
              "None"
            )
          ),
          u.map((v) => {
            const checked = !!(filters[i] && filters[i].included && filters[i].included.has(v));
            return h(
              "label",
              {
                key: v,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  marginBottom: 2,
                },
              },
              h("input", {
                type: "checkbox",
                checked,
                onChange: () => onToggle(i, v),
                style: { accentColor: "var(--cta-primary-bg)" },
              }),
              v || h("em", { style: { color: "var(--text-faint)" } }, "(empty)")
            );
          })
        );
      })
    )
  );
}

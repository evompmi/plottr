// `ColumnRoleEditor` — column-role assignment editor for the long-format
// pipeline. Lets the user mark each column as group / value / filter /
// ignore and rename the header. Used in the configure step of every
// long-format-aware plot tool (boxplot, lineplot, scatter, aequorin).
//
// Kept in `React.createElement` form for diff minimality (same
// precedent as svg-legend, ui, stats-tile).
//
// `roleColors` is read off the ambient browser globals (`tools/shared.js`
// stays in the plain-JS bundle).

import { roleColors } from "../_core/color";
import { useShellT } from "./i18n";

import type { ColumnRole } from "../_core/csv";
const h = React.createElement;

// Display labels for the four column roles; the <option> value attrs keep
// the English ColumnRole enum so the role logic is locale-independent.
const ROLE_LABEL_KEYS = {
  group: "shell.roles.group",
  value: "shell.roles.value",
  filter: "shell.roles.filter",
  ignore: "shell.roles.ignore",
} as const;

interface ColumnRoleEditorProps {
  headers: string[];
  rows: string[][];
  colRoles: ColumnRole[];
  colNames: string[];
  onRoleChange: (i: number, role: ColumnRole) => void;
  onNameChange: (i: number, name: string) => void;
}

export function ColumnRoleEditor(props: ColumnRoleEditorProps) {
  const tr = useShellT();
  const roleLabel = (r: string): string =>
    r in ROLE_LABEL_KEYS ? tr(ROLE_LABEL_KEYS[r as keyof typeof ROLE_LABEL_KEYS]) : r;
  const headers = props.headers;
  const rows = props.rows;
  const colRoles = props.colRoles;
  const colNames = props.colNames;
  const onRoleChange = props.onRoleChange;
  const onNameChange = props.onNameChange;
  return h(
    "div",
    { className: "dv-panel" },
    h(
      "p",
      { style: { margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" } },
      tr("shell.cols.heading")
    ),
    h(
      "p",
      {
        style: {
          margin: "0 0 10px",
          fontSize: 11,
          color: "var(--text-faint)",
          lineHeight: 1.4,
        },
      },
      tr("shell.cols.help.exactlyOne"),
      h("span", { style: { color: roleColors.group, fontWeight: 600 } }, roleLabel("group")),
      tr("shell.cols.help.xAxisAndOne"),
      h("span", { style: { color: roleColors.value, fontWeight: 600 } }, roleLabel("value")),
      tr("shell.cols.help.numericPicking"),
      h("span", { style: { color: roleColors.group, fontWeight: 600 } }, roleLabel("group")),
      tr("shell.cols.help.or"),
      h("span", { style: { color: roleColors.value, fontWeight: 600 } }, roleLabel("value")),
      tr("shell.cols.help.demotesTo"),
      h("span", { style: { color: roleColors.filter, fontWeight: 600 } }, roleLabel("filter")),
      tr("shell.cols.help.period")
    ),
    h(
      "div",
      { style: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" } },
      Object.entries(roleColors).map((entry) => {
        const r = entry[0];
        const c = entry[1];
        return h(
          "span",
          {
            key: r,
            style: {
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              background: c,
              color: r === "ignore" ? "var(--text-muted)" : "var(--on-accent)",
              fontWeight: 600,
            },
          },
          roleLabel(r)
        );
      })
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 8 } },
      headers.map((_h, i) => {
        const u: string[] = [];
        const seen: Record<string, boolean> = {};
        rows.forEach((r) => {
          const v = r[i];
          if (!seen[v]) {
            seen[v] = true;
            u.push(v);
          }
        });
        const pv = u.slice(0, 5).join(", ") + (u.length > 5 ? " … (" + u.length + ")" : "");
        return h(
          "div",
          {
            key: "col-" + i,
            style: {
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "8px 12px",
              background: "var(--surface)",
              borderRadius: 6,
              border: "2px solid " + (roleColors[colRoles[i]] || "var(--border-strong)"),
            },
          },
          h(
            "span",
            { style: { fontWeight: 700, color: "var(--text)", minWidth: 20, fontSize: 12 } },
            "#" + (i + 1)
          ),
          h("input", {
            value: colNames[i],
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onNameChange(i, e.target.value),
            className: "dv-input",
            style: { width: 120, fontWeight: 600 },
          }),
          h(
            "select",
            {
              value: colRoles[i],
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                onRoleChange(i, e.target.value as ColumnRole),
              className: "dv-input",
              style: {
                cursor: "pointer",
                fontWeight: 600,
                color: roleColors[colRoles[i]],
              },
            },
            h("option", { value: "group" }, roleLabel("group")),
            h("option", { value: "value" }, roleLabel("value")),
            h("option", { value: "filter" }, roleLabel("filter")),
            h("option", { value: "ignore" }, roleLabel("ignore"))
          ),
          h(
            "span",
            {
              style: {
                fontSize: 10,
                color: "var(--text-faint)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            pv
          )
        );
      })
    )
  );
}

// Long-format pipeline shared components — column-role editor, filter
// checkbox grid, rename / reorder panel, stats table, group-colour
// editor, base style controls. All used in the configure / filter /
// output steps of every long-format-aware plot tool (boxplot,
// lineplot, scatter, aequorin).
//
// Pre-2026-05 these lived in `tools/shared-long-format.js` (plain-JS,
// React.createElement) loaded as globals via the shared bundle. Now a
// typed module — kept in `React.createElement` form (no JSX
// conversion) because the components are dense markup and a wholesale
// JSX rewrite would balloon the diff for no functional change.
//
// `roleColors`, `isNumericValue`, `PALETTE`, and `GroupStats` /
// `ColumnRole` / `FilterEntry` types are read off the ambient browser
// globals (`tools/shared.js` stays in the plain-JS bundle).

import { ColorInput } from "./color-input";

const h = React.createElement;

// ── ColumnRoleEditor ────────────────────────────────────────────────

interface ColumnRoleEditorProps {
  headers: string[];
  rows: string[][];
  colRoles: ColumnRole[];
  colNames: string[];
  onRoleChange: (i: number, role: ColumnRole) => void;
  onNameChange: (i: number, name: string) => void;
}

export function ColumnRoleEditor(props: ColumnRoleEditorProps) {
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
      "Column roles"
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
      "Exactly one ",
      h("span", { style: { color: roleColors.group, fontWeight: 600 } }, "group"),
      " (x-axis) and one ",
      h("span", { style: { color: roleColors.value, fontWeight: 600 } }, "value"),
      " (numeric) column. Picking ",
      h("span", { style: { color: roleColors.group, fontWeight: 600 } }, "group"),
      " or ",
      h("span", { style: { color: roleColors.value, fontWeight: 600 } }, "value"),
      " on another column demotes the previous one to ",
      h("span", { style: { color: roleColors.filter, fontWeight: 600 } }, "filter"),
      "."
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
          r
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
            h("option", { value: "group" }, "group"),
            h("option", { value: "value" }, "value"),
            h("option", { value: "filter" }, "filter"),
            h("option", { value: "ignore" }, "ignore")
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

// ── FilterCheckboxPanel ─────────────────────────────────────────────

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

// ── RenameReorderPanel ──────────────────────────────────────────────

interface RenameReorderPanelProps {
  headers: string[];
  colNames: string[];
  colRoles: ColumnRole[];
  filters: Record<number, FilterEntry>;
  valueRenames: Record<number, Record<string, string>>;
  // Map { [colIdx]: { order, onReorder } } — every column whose index appears
  // here gets a drag handle and per-column independent reorder state. Columns
  // absent from the map are rendered as rename-only.
  orderableCols?: Record<number, { order: string[]; onReorder: (newOrder: string[]) => void }>;
  applyRename: (i: number, value: string) => string;
  onRenameVal: (i: number, origValue: string, newValue: string) => void;
  // Drag state is scoped per column so dragging on one column doesn't
  // highlight a row in a neighbouring column with the same positional index.
  dragState: { col: number; idx: number } | null;
  onDragStart: (state: { col: number; idx: number }) => void;
  onDragEnd: () => void;
}

export function RenameReorderPanel(props: RenameReorderPanelProps) {
  const headers = props.headers;
  const colNames = props.colNames;
  const colRoles = props.colRoles;
  const filters = props.filters;
  const valueRenames = props.valueRenames;
  const orderableCols = props.orderableCols || {};
  const applyRename = props.applyRename;
  const onRenameVal = props.onRenameVal;
  const dragState = props.dragState;
  const onDragStart = props.onDragStart;
  const onDragEnd = props.onDragEnd;
  return h(
    "div",
    {
      style: {
        flex: 1,
        borderRadius: 10,
        padding: 16,
        border: "1px solid var(--border)",
        background: "var(--surface-subtle)",
      },
    },
    h(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" } },
      "Rename values & reorder groups ",
      h(
        "span",
        { style: { fontSize: 10, color: "var(--text-faint)", fontWeight: 400 } },
        "(drag ☰ to reorder groups on plot)"
      )
    ),
    h(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap" } },
      headers.map((_hdr, i) => {
        if (colRoles[i] !== "group" && colRoles[i] !== "filter") return null;
        const u: string[] = (filters[i] ? Array.from(filters[i].unique) : []).filter(
          (v) => filters[i] && filters[i].included && filters[i].included.has(v)
        );
        const colOrder = orderableCols[i];
        const isOrderable = !!colOrder;
        const renamedU = u.map((v) => ({ orig: v, renamed: applyRename(i, v) }));
        const orderedU =
          isOrderable && colOrder.order
            ? colOrder.order
                .map((g) => renamedU.find((x) => x.renamed === g))
                .filter((x): x is { orig: string; renamed: string } => Boolean(x))
            : renamedU;
        const displayList = orderedU.length > 0 ? orderedU : renamedU;
        const dragIdxForCol = dragState && dragState.col === i ? dragState.idx : null;
        return h(
          "div",
          {
            key: "col-" + i,
            style: {
              minWidth: 200,
              background: "var(--surface)",
              borderRadius: 6,
              border: "1px solid var(--border)",
              padding: 10,
            },
          },
          h(
            "p",
            { style: { fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 6 } },
            colNames[i]
          ),
          displayList.map((item, vi) => {
            const v = item.orig;
            return h(
              "div",
              {
                key: v,
                draggable: isOrderable,
                onDragStart: () => onDragStart({ col: i, idx: vi }),
                onDragOver: (e: { preventDefault(): void }) => {
                  e.preventDefault();
                },
                onDrop: () => {
                  if (!isOrderable || dragIdxForCol === null || dragIdxForCol === vi) {
                    onDragEnd();
                    return;
                  }
                  const cur = displayList.map((x) => x.renamed);
                  const moved = cur[dragIdxForCol];
                  cur.splice(dragIdxForCol, 1);
                  cur.splice(vi, 0, moved);
                  colOrder!.onReorder(cur);
                  onDragEnd();
                },
                onDragEnd: () => onDragEnd(),
                style: {
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  marginBottom: 3,
                  padding: "3px 4px",
                  borderRadius: 4,
                  background: dragIdxForCol === vi ? "var(--info-bg)" : "transparent",
                  cursor: isOrderable ? "grab" : "default",
                  borderLeft: isOrderable
                    ? "3px solid var(--accent-primary)"
                    : "3px solid transparent",
                },
              },
              isOrderable
                ? h(
                    "span",
                    { style: { fontSize: 11, color: "var(--text-faint)", cursor: "grab" } },
                    "☰"
                  )
                : null,
              h(
                "span",
                {
                  style: {
                    fontSize: 10,
                    color: "var(--text-muted)",
                    minWidth: 55,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                v || "(empty)"
              ),
              h("span", { style: { fontSize: 10, color: "var(--text-faint)" } }, "→"),
              h("input", {
                value: valueRenames[i] && valueRenames[i][v] != null ? valueRenames[i][v] : v,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  onRenameVal(i, v, e.target.value),
                className: "dv-input",
                style: { width: 100, fontSize: 11 },
              })
            );
          })
        );
      })
    )
  );
}

// ── StatsTable ──────────────────────────────────────────────────────

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

// ── GroupColorEditor ────────────────────────────────────────────────

interface GroupColorEditorGroup {
  name: string;
  color: string;
  displayName?: string;
  enabled?: boolean;
  stats?: { n: number } | null;
}

interface GroupColorEditorProps {
  groups: GroupColorEditorGroup[];
  onColorChange: (i: number, color: string) => void;
  onNameChange?: (i: number, name: string) => void;
  onToggle?: (i: number) => void;
}

export function GroupColorEditor(props: GroupColorEditorProps) {
  const groups = props.groups;
  const onColorChange = props.onColorChange;
  const onNameChange = props.onNameChange;
  const onToggle = props.onToggle;
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 4 } },
    groups.map((g, i) => {
      const enabled = g.enabled !== false;
      const children: React.ReactNode[] = [];
      if (onToggle) {
        children.push(
          h("input", {
            key: "cb",
            type: "checkbox",
            checked: enabled,
            onChange: () => onToggle(i),
            style: { accentColor: g.color, flexShrink: 0, cursor: "pointer" },
          })
        );
      }
      children.push(
        h(ColorInput, {
          key: "clr",
          value: g.color,
          onChange: (c: string) => onColorChange(i, c),
          size: 18,
        })
      );
      children.push(
        h("input", {
          key: "nm",
          value: g.displayName || g.name,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onNameChange) onNameChange(i, e.target.value);
          },
          style: {
            flex: 1,
            minWidth: 0,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 4,
            color: "var(--text)",
            padding: "2px 4px",
            fontSize: 11,
            fontFamily: "inherit",
          },
        })
      );
      children.push(
        h(
          "span",
          { key: "n", style: { color: "var(--text-faint)", fontSize: 10, flexShrink: 0 } },
          "n=" + (g.stats ? g.stats.n : 0)
        )
      );
      return h(
        "div",
        {
          key: g.name,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 12,
            background: enabled ? "var(--surface-sunken)" : "var(--surface-subtle)",
            opacity: enabled ? 1 : 0.4,
            border: "1px solid var(--border-strong)",
          },
        },
        children
      );
    })
  );
}

// ── BaseStyleControls ───────────────────────────────────────────────

interface BaseStyleControlsProps {
  plotBg: string;
  onPlotBgChange: (hex: string) => void;
  showGrid: boolean;
  onShowGridChange: (v: boolean) => void;
  gridColor: string;
  onGridColorChange: (hex: string) => void;
}

export function BaseStyleControls(props: BaseStyleControlsProps) {
  const plotBg = props.plotBg;
  const onPlotBgChange = props.onPlotBgChange;
  const showGrid = props.showGrid;
  const onShowGridChange = props.onShowGridChange;
  const gridColor = props.gridColor;
  const onGridColorChange = props.onGridColorChange;
  const children: React.ReactNode[] = [
    h(
      "div",
      {
        key: "bg",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
      h("span", { className: "dv-label" }, "Background"),
      h(ColorInput, { value: plotBg, onChange: onPlotBgChange, size: 24 })
    ),
    h(
      "div",
      { key: "grid" },
      h("span", { className: "dv-label" }, "Grid"),
      h(
        "div",
        {
          style: {
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
          },
        },
        ["off", "on"].map((mode) => {
          const active = mode === "on" ? showGrid : !showGrid;
          return h(
            "button",
            {
              key: mode,
              type: "button",
              onClick: () => onShowGridChange(mode === "on"),
              style: {
                flex: 1,
                padding: "4px 0",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                fontFamily: "inherit",
                cursor: "pointer",
                border: "none",
                background: active ? "var(--accent-primary)" : "var(--surface)",
                color: active ? "var(--on-accent)" : "var(--text-muted)",
                transition: "background 120ms ease, color 120ms ease",
              },
            },
            mode === "off" ? "Off" : "On"
          );
        })
      )
    ),
  ];
  if (showGrid) {
    children.push(
      h(
        "div",
        {
          key: "gc",
          style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
        },
        h("span", { className: "dv-label" }, "Grid color"),
        h(ColorInput, { value: gridColor, onChange: onGridColorChange, size: 24 })
      )
    );
  }
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, children);
}

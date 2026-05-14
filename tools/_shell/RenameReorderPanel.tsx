import type { ColumnRole } from "../_core/csv";

// `RenameReorderPanel` — per-column rename + drag-to-reorder list. Used
// in the configure step of long-format tools to (a) rename observed
// values for plot display, (b) reorder groups along a categorical axis.
// Drag state is scoped per column so dragging on one column doesn't
// highlight rows in a sibling column with the same positional index.

const h = React.createElement;

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

// `ValueListPanel` — the filter step's one place to keep, rename and order
// the values of every group / filter column, in the same row idiom as
// qPCR's Groups list: one card per column, one row per value with a
// "keep" checkbox, an inline rename field, the row count and ↑ / ↓ to set
// the order on the plot. Every value keeps its slot whether it is kept or
// filtered out (dimmed), so unticking never moves a row under the pointer.
//
// Order is stored on renamed labels: `fullOrder` lists every label (the
// list order, handed back to `onReorder`), `order` only the kept ones (the
// plot order). Two values renamed to the same label merge into one group
// and move together.

import type { ColumnRole } from "../_core/csv";
import { roleTextColors } from "../_core/color";
import { useShellT } from "./i18n";

const { useMemo } = React;

interface ValueListPanelProps {
  headers: string[];
  colNames: string[];
  colRoles: ColumnRole[];
  filters: Record<number, FilterEntry>;
  // Parsed rows, unfiltered — the source of each value's row count.
  rows: string[][];
  valueRenames: Record<number, Record<string, string>>;
  orderableCols?: Record<
    number,
    { order: string[]; fullOrder?: string[]; onReorder: (newOrder: string[]) => void }
  >;
  applyRename: (i: number, value: string) => string;
  filteredCount: number;
  totalCount: number;
  onToggle: (i: number, value: string) => void;
  onToggleAll: (i: number, allOn: boolean) => void;
  onRenameVal: (i: number, origValue: string, newValue: string) => void;
}

const ROLE_LABEL_KEYS = {
  group: "shell.roles.group",
  filter: "shell.roles.filter",
} as const;

const arrowBtn: React.CSSProperties = { padding: "1px 7px", fontSize: 12, lineHeight: "18px" };
const bulkBtn: React.CSSProperties = { padding: "1px 8px", fontSize: 11, lineHeight: "18px" };

// Group and filter columns get a card; value / ignored columns don't.
function listedCols(
  headers: string[],
  colRoles: ColumnRole[],
  filters: Record<number, FilterEntry>
): number[] {
  return headers
    .map((_h, i) => i)
    .filter((i) => (colRoles[i] === "group" || colRoles[i] === "filter") && !!filters[i]);
}

export function ValueListPanel(props: ValueListPanelProps) {
  const tr = useShellT();
  const {
    headers,
    colNames,
    colRoles,
    filters,
    rows,
    valueRenames,
    applyRename,
    filteredCount,
    totalCount,
    onToggle,
    onToggleAll,
    onRenameVal,
  } = props;
  const orderableCols = props.orderableCols || {};
  const cols = listedCols(headers, colRoles, filters);

  // Rows per raw value, for every listed column.
  const counts = useMemo(() => {
    const out: Record<number, Map<string, number>> = {};
    const listed = listedCols(headers, colRoles, filters);
    for (const i of listed) out[i] = new Map();
    for (const r of rows) {
      for (const i of listed) {
        const m = out[i];
        m.set(r[i], (m.get(r[i]) || 0) + 1);
      }
    }
    return out;
  }, [rows, headers, colRoles, filters]);

  const empty = tr("shell.rename.empty");

  return (
    <div className="dv-panel" style={{ marginBottom: 16 }} data-testid="value-list-panel">
      <h2 style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
        {tr("shell.values.heading")}
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
          {" · "}
          {tr("shell.values.kept", { shown: filteredCount, total: totalCount })}
        </span>
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-faint)" }}>
        {tr("shell.values.hint")}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {cols.map((i) => {
          const f = filters[i];
          const unique = Array.from(f.unique);
          const kept = unique.filter((v) => f.included.has(v));
          const dropped = unique.filter((v) => !f.included.has(v));
          const col = orderableCols[i];
          // Every raw value under its label, labels in list order.
          const byLabel = new Map<string, string[]>();
          for (const v of unique) {
            const label = applyRename(i, v);
            const list = byLabel.get(label);
            if (list) list.push(v);
            else byLabel.set(label, [v]);
          }
          const stored = col ? col.fullOrder || col.order : [];
          const labels = [
            ...stored.filter((l) => byLabel.has(l)),
            ...[...byLabel.keys()].filter((l) => !stored.includes(l)),
          ];
          const moveLabel = (from: number, to: number) => {
            if (!col || to < 0 || to >= labels.length) return;
            const next = labels.slice();
            const [m] = next.splice(from, 1);
            next.splice(to, 0, m);
            col.onReorder(next);
          };
          const role = colRoles[i] as keyof typeof ROLE_LABEL_KEYS;
          const name = colNames[i] || headers[i];
          return (
            <section
              key={i}
              data-testid={`value-list-${i}`}
              aria-label={name}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                background: "var(--surface)",
                padding: "10px 12px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  {name}
                </h3>
                <span style={{ fontSize: 11, fontWeight: 600, color: roleTextColors[role] }}>
                  {tr(ROLE_LABEL_KEYS[role])}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {tr("shell.values.colKept", { kept: kept.length, total: unique.length })}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="dv-btn dv-btn-secondary"
                  style={bulkBtn}
                  disabled={dropped.length === 0}
                  onClick={() => onToggleAll(i, true)}
                  aria-label={tr("shell.values.allFor", { name })}
                >
                  {tr("shell.filter.all")}
                </button>
                <button
                  type="button"
                  className="dv-btn dv-btn-secondary"
                  style={bulkBtn}
                  disabled={kept.length === 0}
                  onClick={() => onToggleAll(i, false)}
                  aria-label={tr("shell.values.noneFor", { name })}
                >
                  {tr("shell.filter.none")}
                </button>
              </div>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  maxHeight: 420,
                  overflowY: "auto",
                }}
              >
                {labels.flatMap((label, li) => {
                  const raws = byLabel.get(label) || [];
                  return raws.map((v, k) => (
                    <ValueRow
                      key={v}
                      raw={v}
                      shown={valueRenames[i] && valueRenames[i][v] != null ? valueRenames[i][v] : v}
                      count={counts[i]?.get(v) || 0}
                      merged={raws.length > 1}
                      included={f.included.has(v)}
                      empty={empty}
                      onToggle={() => onToggle(i, v)}
                      onRename={(nv) => onRenameVal(i, v, nv)}
                      // Arrows on the first row of a label move the whole label.
                      up={col && k === 0 ? () => moveLabel(li, li - 1) : undefined}
                      down={col && k === 0 ? () => moveLabel(li, li + 1) : undefined}
                      isFirst={li === 0}
                      isLast={li === labels.length - 1}
                    />
                  ));
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ValueRow({
  raw,
  shown,
  count,
  merged,
  included,
  empty,
  onToggle,
  onRename,
  up,
  down,
  isFirst,
  isLast,
}: {
  raw: string;
  shown: string;
  count: number;
  merged: boolean;
  included: boolean;
  empty: string;
  onToggle: () => void;
  onRename: (v: string) => void;
  up?: () => void;
  down?: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const tr = useShellT();
  const rawLabel = raw || empty;
  const renamed = shown !== raw;
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <input
        type="checkbox"
        checked={included}
        onChange={onToggle}
        aria-label={tr("shell.values.keep", { name: rawLabel })}
        style={{ accentColor: "var(--cta-primary-bg)", margin: 0 }}
      />
      <input
        className="dv-input"
        value={shown}
        placeholder={rawLabel}
        onChange={(e) => onRename(e.target.value)}
        aria-label={tr("shell.rename.to", { name: rawLabel })}
        // A dropped value stays in its slot, struck through (not faded, so
        // it keeps text contrast).
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          ...(included
            ? null
            : {
                color: "var(--text-faint)",
                textDecoration: "line-through",
                background: "var(--surface-subtle)",
              }),
        }}
      />
      {(renamed || merged) && (
        <span
          title={rawLabel}
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            maxWidth: 90,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {merged
            ? tr("shell.values.merged", { name: rawLabel })
            : tr("shell.values.was", { name: rawLabel })}
        </span>
      )}
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-faint)",
          minWidth: 40,
          textAlign: "right",
        }}
      >
        n={count}
      </span>
      {up || down ? (
        <>
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            style={arrowBtn}
            disabled={isFirst}
            onClick={up}
            aria-label={tr("shell.values.up", { name: shown || rawLabel })}
          >
            ↑
          </button>
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            style={arrowBtn}
            disabled={isLast}
            onClick={down}
            aria-label={tr("shell.values.down", { name: shown || rawLabel })}
          >
            ↓
          </button>
        </>
      ) : (
        // Keep the column of arrows aligned for rows that can't move.
        <span aria-hidden="true" style={{ width: 62, flexShrink: 0 }} />
      )}
    </li>
  );
}

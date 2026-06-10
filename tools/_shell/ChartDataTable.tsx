// `ChartDataTable` — a collapsible, semantic data table rendered beneath a
// chart so keyboard and screen-reader users can read the underlying values.
//
// Charts here are SVG (often a single rasterised <image> for heatmap cells /
// large point clouds), so the pixels carry no per-value DOM a screen reader
// or keyboard can reach. This disclosure is the accessible equivalent: a real
// <table> with `scope`-ed headers that any assistive tech navigates natively,
// no custom key-handling to get subtly wrong. Collapsed by default so it
// doesn't clutter the sighted view; the chart itself stays the primary
// surface. Callers pass already-translated strings and a truncation `note`
// when the data is too large to render in full (see the per-tool caps).

const { useId } = React;

export interface ChartDataTableRow {
  // Optional row header — rendered as `<th scope="row">` (e.g. a heatmap row
  // label or a volcano point label). Omit for tables with no row dimension.
  header?: string;
  cells: string[];
}

interface ChartDataTableProps {
  // Text on the <summary> toggle (e.g. "Show values as table").
  summaryLabel: string;
  // Accessible <caption> describing the table contents.
  caption: string;
  // Column headers — rendered as `<th scope="col">`.
  columnHeaders: string[];
  rows: ChartDataTableRow[];
  // Shown above the table when the data was truncated to a cap; null when the
  // table is complete.
  note?: string | null;
}

export function ChartDataTable({
  summaryLabel,
  caption,
  columnHeaders,
  rows,
  note,
}: ChartDataTableProps) {
  const captionId = useId();
  return (
    <details className="dv-panel" style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
        {summaryLabel}
      </summary>
      {note && (
        <p role="note" style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
      <div style={{ overflow: "auto", maxHeight: 420, marginTop: 8 }}>
        <table
          aria-labelledby={captionId}
          style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}
        >
          <caption
            id={captionId}
            style={{
              captionSide: "top",
              textAlign: "left",
              fontSize: 11,
              color: "var(--text-muted)",
              padding: "0 0 6px",
            }}
          >
            {caption}
          </caption>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border-strong)" }}>
              {columnHeaders.map((hdr, i) => (
                <th
                  key={i}
                  scope="col"
                  style={{
                    padding: "4px 10px",
                    textAlign: i === 0 ? "left" : "right",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    position: "sticky",
                    top: 0,
                    background: "var(--surface)",
                  }}
                >
                  {hdr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid var(--border)" }}>
                {row.header != null && (
                  <th
                    scope="row"
                    style={{
                      padding: "3px 10px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.header}
                  </th>
                )}
                {row.cells.map((c, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "3px 10px",
                      textAlign: "right",
                      fontFamily: "monospace",
                      color: "var(--text)",
                    }}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

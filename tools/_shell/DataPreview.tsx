// `DataPreview` — compact table preview for parsed CSV/TSV data, used in
// every tool's upload + configure steps. Renders the first `maxRows` rows
// (default 10) plus a "… N more" footer when truncated.

interface DataPreviewProps {
  headers: string[];
  // Cell values are coerced to strings at render time; accept strings,
  // numbers, or null / empty for sparse rows.
  rows: Array<Array<string | number | null | "">>;
  // Maximum rows rendered before the "… N more" footer kicks in. Defaults to 10.
  maxRows?: number;
}

export function DataPreview({ headers, rows, maxRows }: DataPreviewProps) {
  const limit = maxRows || 10;
  const d = rows.slice(0, limit);
  return (
    <div
      style={{
        overflowX: "auto",
        fontSize: 11,
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
        <thead>
          <tr style={{ background: "var(--surface-sunken)" }}>
            <th
              style={{
                padding: "5px 8px",
                border: "1px solid var(--border)",
                color: "var(--text-faint)",
                fontSize: 10,
              }}
            >
              #
            </th>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: "5px 8px",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.map((r, ri) => (
            <tr key={ri}>
              <td
                style={{
                  padding: "3px 8px",
                  border: "1px solid var(--border)",
                  color: "var(--text-faint)",
                  fontSize: 10,
                }}
              >
                {ri + 1}
              </td>
              {r.map((v, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "3px 8px",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? (
        <p
          style={{
            padding: 6,
            fontSize: 11,
            color: "var(--text-faint)",
            textAlign: "center",
          }}
        >
          {`… ${rows.length - limit} more (${rows.length} total)`}
        </p>
      ) : null}
    </div>
  );
}

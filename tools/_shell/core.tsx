// `DataPreview` table + `ErrorBoundary` class component shared across every
// tool's upload / configure / plot pipeline. Pre-2026-05 migration these
// lived in `tools/shared-core.js` (plain-JS, React.createElement) loaded via
// the shared bundle; now imported as a typed module.

interface DataPreviewProps {
  headers: string[];
  // Cell values are coerced to strings at render time, so accept the same
  // permissive shape the pre-migration `DataPreview` ambient declaration had:
  // strings, numbers, or null/empty for sparse rows.
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

interface ErrorBoundaryProps {
  // Optional human-readable name for the failing tool — surfaced in the
  // error UI ("This tool" used as a fallback).
  toolName?: string;
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: { componentStack?: string } | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    this.setState({ info });
    if (typeof console !== "undefined" && console.error) {
      console.error("Tool crashed:", error, info);
    }
  }
  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    const info = this.state.info;
    const msg = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : msg;
    const compStack = info && info.componentStack ? info.componentStack : "";
    const details = stack + (compStack ? "\n\nComponent stack:" + compStack : "");
    const reload = () => {
      if (typeof window !== "undefined" && window.location) window.location.reload();
    };
    const copy = () => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(details).catch(() => {});
      }
    };
    const toolName = this.props.toolName || "This tool";
    return (
      <div
        role="alert"
        style={{
          maxWidth: 720,
          margin: "40px auto",
          padding: 24,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "var(--text)",
        }}
      >
        <h2 style={{ marginTop: 0, color: "var(--danger-text)", fontSize: 20 }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          {toolName +
            " hit an unexpected error and can't continue. Your data is still on your machine — nothing was sent anywhere. Try reloading; if it keeps crashing, use “Copy error details” and open an issue."}
        </p>
        <pre
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            color: "var(--danger-text)",
            overflow: "auto",
            maxHeight: 200,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {msg}
        </pre>
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
            Technical details
          </summary>
          <pre
            style={{
              background: "var(--surface-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 12,
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "auto",
              maxHeight: 300,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginTop: 8,
            }}
          >
            {details}
          </pre>
        </details>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={reload} className="dv-btn dv-btn-primary">
            Reload tool
          </button>
          <button type="button" onClick={copy} className="dv-btn dv-btn-secondary">
            Copy error details
          </button>
        </div>
      </div>
    );
  }
}

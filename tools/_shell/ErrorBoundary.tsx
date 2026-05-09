// `ErrorBoundary` — class component that catches render-time exceptions
// from a tool's React subtree and shows a recovery card with reload +
// copy-error-details buttons. Wired in `tools/_app/App.tsx` so a crashed
// tool doesn't take the whole SPA down.

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

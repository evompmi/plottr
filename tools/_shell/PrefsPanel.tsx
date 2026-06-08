// Save / Load / Reset controls for plot render settings — rendered as a
// single gear icon in PageHeader that toggles a small popover with the three
// actions + any error message. The click-to-reveal design keeps power-user
// chrome out of the header until asked for. Style tweaks still auto-persist
// to localStorage in the background (see `usePlotToolState.ts` →
// `loadAutoPrefs` / `saveAutoPrefs`); these buttons cover the explicit
// save-to-file / load-from-file / reset flow.

import { clearAutoPrefs, exportPrefsFile, importPrefsFile } from "./prefs-store";
import { useShellT } from "./i18n";

const { useState, useRef, useEffect } = React;

interface PrefsPanelProps<T extends object> {
  // Tool name, matches the localStorage key written by `loadAutoPrefs`.
  tool: string;
  // Current vis state (passed verbatim into the exported JSON file).
  vis: T;
  // Defaults — used as the whitelist when validating an imported file.
  visInit: T;
  // Reducer dispatch; supports a `_reset: true` sentinel handled by
  // `usePlotToolState`'s reducer.
  updVis: (patch: Partial<T> | { _reset: true }) => void;
}

export function PrefsPanel<T extends object>({ tool, vis, visInit, updVis }: PrefsPanelProps<T>) {
  const tr = useShellT();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click or Escape while the popover is open.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSave = () => {
    exportPrefsFile(tool, vis);
    setError("");
    setOpen(false);
  };
  const handleLoad = () => {
    importPrefsFile<T>(tool, visInit, (merged, errMsg) => {
      if (errMsg || !merged) {
        // Keep popover open to show the error inline.
        setError(errMsg ?? tr("shell.prefs.loadError"));
        setOpen(true);
        return;
      }
      updVis(merged);
      setError("");
      setOpen(false);
    });
  };
  const handleReset = () => {
    updVis({ _reset: true });
    clearAutoPrefs(tool);
    setError("");
    setOpen(false);
  };

  const menuBtnStyle = {
    padding: "6px 10px",
    fontSize: 12,
    lineHeight: 1.2,
    textAlign: "left" as const,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-label={tr("shell.prefs.title")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={tr("shell.prefs.title")}
        style={{
          width: 40,
          height: 40,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: open ? "var(--surface-sunken)" : "transparent",
          border: "1px solid var(--border)",
          borderRadius: 6,
          cursor: "pointer",
          color: "var(--text-muted)",
        }}
      >
        {/* Gear glyph — feather-style, painted through currentColor so it
            inherits the button's themed text color. */}
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx={12} cy={12} r={3} />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-lg)",
            padding: 8,
            zIndex: 30,
            minWidth: 200,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              padding: "2px 4px 4px",
            }}
          >
            {tr("shell.prefs.title")}
          </span>
          <button
            role="menuitem"
            onClick={handleSave}
            className="dv-btn dv-btn-dl"
            style={menuBtnStyle}
            title={tr("shell.prefs.saveTitle")}
          >
            {tr("shell.prefs.save")}
          </button>
          <button
            role="menuitem"
            onClick={handleLoad}
            className="dv-btn dv-btn-dl"
            style={menuBtnStyle}
            title={tr("shell.prefs.loadTitle")}
          >
            {tr("shell.prefs.load")}
          </button>
          <button
            role="menuitem"
            onClick={handleReset}
            className="dv-btn dv-btn-danger"
            style={menuBtnStyle}
            title={tr("shell.prefs.resetTitle")}
          >
            {tr("shell.prefs.reset")}
          </button>
          {error && (
            <p
              style={{
                margin: "4px 4px 0",
                fontSize: 11,
                color: "var(--danger-text)",
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

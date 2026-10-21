// Export bar shown in the app bar on the plot step: Start over, a "More"
// menu holding every download other than the figure (PNG first, then CSV,
// tables, …), and the SVG figure export last as the primary button. Start over asks for a second click (within
// 4 s) before it clears the session, since it discards the loaded data.

import { flashSaved } from "../_core/download";
import { useShellT } from "./i18n";
import type { PlotActionsEntry } from "./plot-actions";

const { useEffect, useRef, useState } = React;

interface PlotActionsBarProps {
  // Ref the shell keeps current; handlers are read from it at click time.
  entryRef: React.MutableRefObject<PlotActionsEntry | null>;
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function PlotActionsBar({ entryRef }: PlotActionsBarProps) {
  const tr = useShellT();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return undefined;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);
  const entry = entryRef.current;
  if (!entry) return null;
  // Original indices are kept so a click re-reads the live entry.
  const indexed = entry.downloads.map((d, i) => ({ d, i }));
  const extra = indexed.filter(({ d }) => d.label !== "SVG");
  const svg = indexed.find(({ d }) => d.label === "SVG") || null;
  const runDownload = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const cur = entryRef.current;
    const target = cur && cur.downloads[i];
    if (!target) return;
    target.onClick(e);
    flashSaved(e.currentTarget);
  };
  const btnStyle: React.CSSProperties = {
    minHeight: "var(--control-h)",
    padding: "0 14px",
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };
  return (
    <div
      role="toolbar"
      aria-label={tr("shell.actions.title")}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}
    >
      <button
        type="button"
        title={tr("shell.actions.resetTitle")}
        className={confirming ? "dv-btn dv-btn-danger" : "dv-btn dv-btn-secondary"}
        style={{ width: "auto", minHeight: "var(--control-h)", whiteSpace: "nowrap" }}
        aria-live="polite"
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setConfirming(false);
          const cur = entryRef.current;
          if (cur) cur.onReset();
        }}
      >
        {confirming ? tr("shell.actions.confirmReset") : tr("shell.actions.startOver")}
      </button>
      <span
        aria-hidden="true"
        style={{ width: 1, height: 24, background: "var(--border)", margin: "0 2px" }}
      />
      {extra.length > 0 && (
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            ref={moreRef}
            type="button"
            className="dv-btn dv-btn-dl"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((x) => !x)}
            style={btnStyle}
          >
            {tr("shell.actions.more")}
          </button>
          {menuOpen && (
            <div
              role="menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setMenuOpen(false);
                  moreRef.current?.focus();
                }
              }}
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 40,
                minWidth: 180,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                padding: 6,
              }}
            >
              {extra.map(({ d, i }) => (
                <button
                  key={d.label + i}
                  type="button"
                  role="menuitem"
                  className="dv-switcher-item"
                  title={d.title || undefined}
                  onClick={(e) => runDownload(i, e)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {svg && (
        <button
          type="button"
          title={svg.d.title || undefined}
          className="dv-btn dv-btn-primary"
          style={btnStyle}
          aria-label={tr("shell.actions.downloadSvg")}
          onClick={(e) => runDownload(svg.i, e)}
        >
          <DownloadIcon />
          {/* Narrow windows show just "SVG" (components.css); the name stays. */}
          <span className="dv-label-long">{tr("shell.actions.downloadSvg")}</span>
          <span className="dv-label-short">SVG</span>
        </button>
      )}
    </div>
  );
}

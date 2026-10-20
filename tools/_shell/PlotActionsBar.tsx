// Export bar shown in the app bar on the plot step: Start over, then one
// button per download the tool's `ActionsPanel` registered (PNG / CSV / …),
// with the SVG figure export last as the primary button. Start over asks
// for a second click (within 4 s) before it clears the session, since it
// discards the loaded data.

import { flashSaved } from "../_core/download";
import { useShellT } from "./i18n";
import type { PlotActionsEntry } from "./plot-actions";

const { useEffect, useState } = React;

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
  const entry = entryRef.current;
  if (!entry) return null;
  // Original indices are kept so the click handler re-reads the live entry.
  const indexed = entry.downloads.map((d, i) => ({ d, i }));
  const ordered = [
    ...indexed.filter(({ d }) => d.label !== "SVG"),
    ...indexed.filter(({ d }) => d.label === "SVG"),
  ];
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
      {ordered.map(({ d, i }) => {
        const primary = d.label === "SVG";
        return (
          <button
            key={d.label + i}
            type="button"
            title={d.title || undefined}
            className={primary ? "dv-btn dv-btn-primary" : "dv-btn dv-btn-dl"}
            style={{
              minHeight: "var(--control-h)",
              padding: "0 14px",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
            onClick={(e) => {
              const cur = entryRef.current;
              const target = cur && cur.downloads[i];
              if (!target) return;
              target.onClick(e);
              flashSaved(e.currentTarget);
            }}
          >
            {primary && <DownloadIcon />}
            {primary ? tr("shell.actions.downloadSvg") : d.label}
          </button>
        );
      })}
    </div>
  );
}

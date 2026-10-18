// Export bar shown in the page header on the plot step: one compact chip per
// download the tool's `ActionsPanel` registered (SVG / PNG / CSV / R / …),
// then Start over. Start over asks for a second click (within 4 s) before it
// clears the session, since it discards the loaded data.

import { flashSaved } from "../_core/download";
import { useShellT } from "./i18n";
import type { PlotActionsEntry } from "./plot-actions";

const { useEffect, useState } = React;

interface PlotActionsBarProps {
  // Ref the shell keeps current; handlers are read from it at click time.
  entryRef: React.MutableRefObject<PlotActionsEntry | null>;
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
  return (
    <div
      role="toolbar"
      aria-label={tr("shell.actions.title")}
      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}
    >
      {entry.downloads.map((d, i) => (
        <button
          key={d.label + i}
          type="button"
          title={d.title || undefined}
          className="dv-btn dv-btn-dl"
          style={{ padding: "5px 10px", fontSize: 12, whiteSpace: "nowrap" }}
          onClick={(e) => {
            const cur = entryRef.current;
            const target = cur && cur.downloads[i];
            if (!target) return;
            target.onClick(e);
            flashSaved(e.currentTarget);
          }}
        >
          {"⬇ " + d.label}
        </button>
      ))}
      <button
        type="button"
        title={tr("shell.actions.resetTitle")}
        className={confirming ? "dv-btn dv-btn-danger" : "dv-btn dv-btn-secondary"}
        style={{ padding: "5px 10px", fontSize: 12, whiteSpace: "nowrap", marginLeft: 6 }}
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
        {confirming ? tr("shell.actions.confirmReset") : "↺ " + tr("shell.actions.startOver")}
      </button>
    </div>
  );
}

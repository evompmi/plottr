// Plot-step actions registry. `ActionsPanel` (rendered inside each tool's
// sidebar) reports its downloads + reset handler here instead of drawing a
// sidebar tile, and `PlotToolShell` renders them as one export bar in the
// page header — the same place, in the same order, in every tool.
//
// Handlers are read from a ref at click time, so the per-render closures a
// tool passes stay fresh without re-rendering the header on every keystroke;
// the header only re-renders when the visible labels change.

export interface PlotActionDownload {
  label: string;
  title?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export interface PlotActionsEntry {
  downloads: PlotActionDownload[];
  onReset: () => void;
}

export interface PlotActionsRegistry {
  set: (entry: PlotActionsEntry | null) => void;
}

export const PlotActionsContext = React.createContext<PlotActionsRegistry | null>(null);

// Signature of what the header shows — changes only when a label, a title,
// or the button count changes.
export function plotActionsSignature(entry: PlotActionsEntry | null): string {
  if (!entry) return "";
  return entry.downloads.map((d) => d.label + "\u0001" + (d.title || "")).join("\u0002");
}

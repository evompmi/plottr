// `ActionsPanel` — the plot step's downloads (SVG / PNG / + any
// `extraDownloads` like CSV/TXT/R) and Start-over. Inside `PlotToolShell`
// it renders nothing itself: it hands the list to the shell, which shows it
// as the export bar in the page header (`plot-actions.ts`). Outside a shell
// it falls back to a sidebar tile — a wrapping row of download chips and a
// full-width Start-over button. Every button gets a native `title` tooltip;
// SVG/PNG/Start-over carry fixed built-in strings, each `extraDownloads`
// entry passes its own `title`.

import { flashSaved } from "../_core/download";
import { useShellT } from "./i18n";
import { PlotActionsContext, type PlotActionDownload } from "./plot-actions";

const h = React.createElement;
const { useContext, useEffect, useLayoutEffect } = React;

export type ActionsPanelDownload = PlotActionDownload;

interface ActionsPanelProps {
  onDownloadSvg?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDownloadPng?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  extraDownloads?: ActionsPanelDownload[];
  onReset: () => void;
}

export function ActionsPanel(props: ActionsPanelProps) {
  const tr = useShellT();
  const downloads: ActionsPanelDownload[] = [];
  if (props.onDownloadSvg) {
    downloads.push({
      label: "SVG",
      title: tr("shell.actions.svgTitle"),
      onClick: props.onDownloadSvg,
    });
  }
  if (props.onDownloadPng) {
    downloads.push({
      label: "PNG",
      title: tr("shell.actions.pngTitle"),
      onClick: props.onDownloadPng,
    });
  }
  if (props.extraDownloads) {
    props.extraDownloads.forEach((d) => downloads.push(d));
  }
  const registry = useContext(PlotActionsContext);
  // Re-register every render so the shell always calls the latest closures.
  useLayoutEffect(() => {
    if (registry) registry.set({ downloads, onReset: props.onReset });
  });
  useEffect(() => {
    if (!registry) return undefined;
    return () => registry.set(null);
  }, [registry]);
  if (registry) return null;
  const dlButtons = downloads.map((d, i) =>
    h(
      "button",
      {
        key: "dl" + i,
        title: d.title || undefined,
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          d.onClick(e);
          flashSaved(e.currentTarget);
        },
        className: "dv-btn dv-btn-dl",
        style: { flex: "1 1 0" },
      },
      "⬇ " + d.label
    )
  );
  return h(
    "div",
    { className: "dv-panel" },
    h(
      "p",
      {
        className: "dv-tile-title",
        style: { margin: "0 0 8px" },
      },
      tr("shell.actions.title")
    ),
    dlButtons.length > 0
      ? h(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 8,
            },
          },
          dlButtons
        )
      : null,
    h(
      "button",
      {
        onClick: props.onReset,
        title: tr("shell.actions.resetTitle"),
        className: "dv-btn dv-btn-danger",
      },
      "↺ " + tr("shell.actions.startOver")
    )
  );
}

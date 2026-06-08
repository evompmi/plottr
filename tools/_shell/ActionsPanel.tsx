// `ActionsPanel` — actions tile for the plot step. Renders a wrapping
// row of unified download chips (SVG / PNG / + any `extraDownloads`
// like CSV/TXT/R) followed by a full-width Start-over button. Each
// chip flex-grows so 1/2/3 fit evenly; a 4th wraps. Every button gets
// a native `title` tooltip; SVG/PNG/Start-over carry fixed built-in
// strings, each `extraDownloads` entry passes its own `title`.

import { flashSaved } from "../_core/download";
import { useShellT } from "./i18n";

const h = React.createElement;

export interface ActionsPanelDownload {
  label: string;
  title?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

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

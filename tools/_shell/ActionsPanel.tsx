// `ActionsPanel` — actions tile for the plot step. Renders a wrapping
// row of unified download chips (SVG / PNG / + any `extraDownloads`
// like CSV/TXT/R) followed by a full-width Start-over button. Each
// chip flex-grows so 1/2/3 fit evenly; a 4th wraps. Every button gets
// a native `title` tooltip; SVG/PNG/Start-over carry fixed built-in
// strings, each `extraDownloads` entry passes its own `title`.

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
  const downloads: ActionsPanelDownload[] = [];
  if (props.onDownloadSvg) {
    downloads.push({
      label: "SVG",
      title: "Download the plot as SVG — vector graphics, editable in Inkscape or Illustrator",
      onClick: props.onDownloadSvg,
    });
  }
  if (props.onDownloadPng) {
    downloads.push({
      label: "PNG",
      title: "Download the plot as PNG — 2× raster at the plot's native resolution",
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
      "Actions"
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
        title: "Clear all data, controls, and current session — returns to the upload step",
        className: "dv-btn dv-btn-danger",
      },
      "↺ Start over"
    )
  );
}

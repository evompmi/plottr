// _shell/DownloadTiles.tsx — typed wrapper around the shared ActionsPanel
// that auto-builds the SVG and PNG download callbacks from a chart ref +
// a file stem. Replaces the inline
//   onDownloadSvg={() => downloadSvg(chartRef.current, `${stem}.svg`)}
//   onDownloadPng={() => downloadPng(chartRef.current, `${stem}.png`, 2)}
// boilerplate that every plot tool's controls / plot-area used to repeat.
//
// Tools with simple "one chart → one SVG + one PNG" semantics (lineplot,
// scatter, upset, venn, volcano) consume this directly. Three plot tools
// keep using ActionsPanel directly because their export shape doesn't fit
// the (single chartRef, single fileStem) contract:
//   - boxplot — when facetByCol >= 0, downloads one file per facet via
//     facetRefs (multi-file bundle).
//   - aequorin — fans out across combined / faceted / barplot refs through
//     useImperativeHandle on PlotPanel.
//   - heatmap — the SVG/PNG buttons live inside the plot panel header next
//     to the matrix; the sidebar tile carries only CSV / R-script / reset,
//     with no primary downloads to auto-build.
//
// `pngScale` defaults to 2 — matches what every existing call site
// passed. Override only if a tool needs higher / lower resolution.
//
// `extraDownloads` is the same `{label, title, onClick}` shape that
// ActionsPanel takes; passed through unchanged so tool-specific CSV /
// stats / R-script chips compose with the standard SVG/PNG pair.

import { ActionsPanel, type ActionsPanelDownload } from "./ActionsPanel";

import { downloadPng, downloadSvg } from "../_core/download";
interface DownloadTilesProps {
  chartRef: React.RefObject<SVGSVGElement | null>;
  fileStem: string;
  pngScale?: number;
  extraDownloads?: ActionsPanelDownload[];
  onReset: () => void;
}

export function DownloadTiles({
  chartRef,
  fileStem,
  pngScale = 2,
  extraDownloads,
  onReset,
}: DownloadTilesProps) {
  return (
    <ActionsPanel
      onDownloadSvg={() => downloadSvg(chartRef.current, `${fileStem}.svg`)}
      onDownloadPng={() => downloadPng(chartRef.current, `${fileStem}.png`, pngScale)}
      onReset={onReset}
      extraDownloads={extraDownloads}
    />
  );
}

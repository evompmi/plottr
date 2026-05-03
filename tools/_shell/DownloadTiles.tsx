// _shell/DownloadTiles.tsx — typed wrapper around the shared ActionsPanel
// that auto-builds the SVG and PNG download callbacks from a chart ref +
// a file stem. Replaces the inline
//   onDownloadSvg={() => downloadSvg(chartRef.current, `${stem}.svg`)}
//   onDownloadPng={() => downloadPng(chartRef.current, `${stem}.png`, 2)}
// boilerplate that every plot tool's controls / plot-area used to repeat.
//
// Tools with simple "one chart → one SVG + one PNG" semantics (heatmap,
// lineplot, scatter, upset, venn, volcano) consume this directly. Tools
// with multi-chart / multi-format export (boxplot's faceted SVG bundle,
// aequorin's combined + barplot + facets) keep using ActionsPanel
// directly because the per-tool callback shape doesn't fit the common
// case.
//
// `pngScale` defaults to 2 — matches what every existing call site
// passed. Override only if a tool needs higher / lower resolution.
//
// `extraDownloads` is the same `{label, title, onClick}` shape that
// ActionsPanel takes; passed through unchanged so tool-specific CSV /
// stats / R-script chips compose with the standard SVG/PNG pair.

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

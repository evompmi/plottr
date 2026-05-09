// Detail-view tile (zoomed heatmap of the current row / column selection)
// and the accompanying CSV preview card beneath it. Both are rendered next
// to the main HeatmapChart when the user has committed a brush / dendrogram
// / k-means-strip selection. Consumes HeatmapChart from ./chart and
// buildCsvExport from ./reports; pure helpers (pruneDendroTree) come from
// ./helpers.

import { HeatmapChart } from "./chart";
import { DataPreview } from "../_shell/core";
import {
  pruneDendroTree,
  ClusterResult,
  DataMatrix,
  DetailPreviewCardProps,
  DetailViewProps,
} from "./helpers";
import { buildCsvExport } from "./reports";

const { useMemo, useRef } = React;

// Detail-view dendrogram stroke width. Was previously user-selectable via
// a thin/medium/bold segment control; the control was retired because
// the choice had no real workflow value (the detail plot's row pitch is
// already enlarged for readability, so a thicker stroke didn't change
// what users could see). 1.5 matches the prior "medium" default.
const DETAIL_DENDRO_STROKE_WIDTH = 1.5;

export function DetailView({
  rawMatrix,
  normalized,
  detailRowOrder,
  detailColOrder,
  mainRowCluster,
  mainColCluster,
  vis,
  cellBorder,
  detailChartRef,
  fileName,
  clusterId,
}: DetailViewProps) {
  // Detail tile is now an independent sibling next to the main plot rather
  // than stacked beneath it, so it no longer mirrors the main's width,
  // column offsets, dendrogram band, or legend length. Row height is still
  // enlarged — that's the "zoom" semantic, giving each selected row enough
  // pixels for a readable label (floor 14 px, cap 28 px). Cell width is
  // left to HeatmapChart's default (based on detail's own column count).
  const detailRowCount = detailRowOrder.length;
  const baseCellH = Math.max(14, Math.min(28, Math.floor(720 / Math.max(1, detailRowCount))));
  const base = fileBaseName(fileName || "heatmap") || "heatmap";
  const mainRowIsKmeans = mainRowCluster && mainRowCluster.mode === "kmeans";
  const mainColIsKmeans = mainColCluster && mainColCluster.mode === "kmeans";
  const mainRowIsHier =
    mainRowCluster && mainRowCluster.mode === "hierarchical" && mainRowCluster.tree;
  const mainColIsHier =
    mainColCluster && mainColCluster.mode === "hierarchical" && mainColCluster.tree;
  // Build per-axis cluster objects to forward to the detail HeatmapChart.
  // For hierarchical mode: prune the main's tree down to just the selected
  // leaves, so the detail draws a proper subtree dendrogram at its own cell
  // width — merge heights preserved, elided sibling clades skipped. For
  // k-means: forward as-is (the strip + inter-cluster gap math both need
  // the original `clusters` array, which is indexed by original leaf idx).
  // Null when neither applies (so HeatmapChart reserves no dendro band).
  const detailRowCluster = useMemo<ClusterResult | null>(() => {
    if (mainRowIsKmeans) return mainRowCluster;
    if (mainRowIsHier && mainRowCluster && mainRowCluster.mode === "hierarchical") {
      const pruned = pruneDendroTree(mainRowCluster.tree, new Set(detailRowOrder));
      return pruned ? { mode: "hierarchical", tree: pruned, order: detailRowOrder } : null;
    }
    return null;
  }, [mainRowCluster, mainRowIsKmeans, mainRowIsHier, detailRowOrder]);
  const detailColCluster = useMemo<ClusterResult | null>(() => {
    if (mainColIsKmeans) return mainColCluster;
    if (mainColIsHier && mainColCluster && mainColCluster.mode === "hierarchical") {
      const pruned = pruneDendroTree(mainColCluster.tree, new Set(detailColOrder));
      return pruned ? { mode: "hierarchical", tree: pruned, order: detailColOrder } : null;
    }
    return null;
  }, [mainColCluster, mainColIsKmeans, mainColIsHier, detailColOrder]);
  // Respect the per-axis "show dendrogram" prefs on the detail view too —
  // otherwise the user hides dendrograms on the main plot for a clean
  // figure but still sees them when zooming in.
  const detailRowDendroVisible =
    mainRowIsHier && detailRowCluster && vis.showRowDendrogram !== false;
  const detailColDendroVisible =
    mainColIsHier && detailColCluster && vis.showColDendrogram !== false;
  const detailShowDendrogram = detailRowDendroVisible || detailColDendroVisible;

  // When the selection came from a k-means cluster-strip click we tag the
  // downloaded filenames with the 1-based cluster id so a user can tell
  // cluster-1 and cluster-3 exports apart on disk without re-opening them.
  const clusterSuffix = clusterId != null ? `_cluster${clusterId + 1}` : "";

  const downloadButton = (
    label: string,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  ) => (
    <button
      onClick={(e) => {
        onClick(e);
        flashSaved(e.currentTarget);
      }}
      className="dv-btn dv-btn-dl"
      style={{ padding: "4px 10px", fontSize: 11 }}
    >
      ⬇ {label}
    </button>
  );

  return (
    <div
      className="dv-panel dv-plot-card"
      style={{
        padding: 20,
        background: "var(--plot-card-bg)",
        borderColor: "var(--plot-card-border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {downloadButton("SVG", () =>
          downloadSvg(detailChartRef.current, `${base}_heatmap${clusterSuffix}_detail.svg`)
        )}
        {downloadButton("PNG", () =>
          downloadPng(detailChartRef.current, `${base}_heatmap${clusterSuffix}_detail.png`, 2)
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <HeatmapChart
          ref={detailChartRef}
          rowLabels={rawMatrix.rowLabels}
          colLabels={rawMatrix.colLabels}
          matrix={normalized}
          rawMatrix={rawMatrix.matrix}
          rowOrder={detailRowOrder}
          colOrder={detailColOrder}
          rowCluster={detailRowCluster}
          colCluster={detailColCluster}
          showClusterStrip={!!detailShowDendrogram}
          showRowDendrogram={vis.showRowDendrogram !== false}
          showColDendrogram={vis.showColDendrogram !== false}
          showKmeansStrip={!!(mainRowIsKmeans || mainColIsKmeans)}
          dendrogramStrokeWidth={DETAIL_DENDRO_STROKE_WIDTH}
          vmin={vis.vmin}
          vmax={vis.vmax}
          palette={vis.palette}
          invertPalette={vis.invertPalette}
          cellBorder={cellBorder}
          plotTitle={vis.plotTitle ? `${vis.plotTitle} — detail` : undefined}
          plotSubtitle={vis.plotSubtitle}
          rowAxisLabel={vis.rowAxisLabel}
          colAxisLabel={vis.colAxisLabel}
          showRowLabels={vis.showRowLabels}
          showColLabels={vis.showColLabels}
          interactive={false}
          baseCellH={baseCellH}
        />
      </div>
    </div>
  );
}

export function DetailPreviewCard({
  rawMatrix,
  normalized,
  detailRowOrder,
  detailColOrder,
  fileName,
  clusterId,
}: DetailPreviewCardProps) {
  const base = fileBaseName(fileName || "heatmap") || "heatmap";
  const clusterSuffix = clusterId != null ? `_cluster${clusterId + 1}` : "";
  const nR = detailRowOrder.length;
  const nC = detailColOrder.length;
  const tableHeaders = [""].concat(detailColOrder.map((ci) => rawMatrix.colLabels[ci]));
  const tableRows = detailRowOrder.map((ri) => {
    const cells = detailColOrder.map((ci) => {
      const v = rawMatrix.matrix[ri][ci];
      return Number.isFinite(v) ? String(v) : "";
    });
    return [rawMatrix.rowLabels[ri]].concat(cells);
  });
  // Holds the export-ready matrix shape; written to in render so the
  // download buttons see the latest data on click.
  interface DetailMatrixRefData {
    rowLabels: string[];
    colLabels: string[];
    matrix: DataMatrix;
    rowOrder: number[];
    colOrder: number[];
  }
  const detailMatrixRef = useRef<DetailMatrixRefData | null>(null);
  detailMatrixRef.current = {
    rowLabels: rawMatrix.rowLabels,
    colLabels: rawMatrix.colLabels,
    matrix: normalized,
    rowOrder: detailRowOrder,
    colOrder: detailColOrder,
  };
  // CsvExportOpts requires rowClusterIds + colClusterIds; the detail
  // preview never carries cluster colour strips, so both are null here.
  const csvOpts = { ...detailMatrixRef.current!, rowClusterIds: null, colClusterIds: null };

  return (
    <div
      className="dv-panel dv-plot-card"
      style={{
        padding: 16,
        background: "var(--plot-card-bg)",
        borderColor: "var(--plot-card-border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
          Selection data — {nR} row{nR === 1 ? "" : "s"} × {nC} col{nC === 1 ? "" : "s"}
        </div>
        <button
          onClick={(e) => {
            if (!detailMatrixRef.current) return;
            const { headers, rows } = buildCsvExport(csvOpts);
            downloadCsv(headers, rows, `${base}_heatmap${clusterSuffix}_detail.csv`);
            flashSaved(e.currentTarget);
          }}
          className="dv-btn dv-btn-dl"
          style={{ padding: "4px 10px", fontSize: 11, marginLeft: "auto", flexShrink: 0 }}
        >
          ⬇ CSV
        </button>
      </div>
      <DataPreview headers={tableHeaders} rows={tableRows} maxRows={50} />
      {nR > 50 && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
          Showing first 50 of {nR} rows. Download CSV for the full selection.
        </p>
      )}
    </div>
  );
}

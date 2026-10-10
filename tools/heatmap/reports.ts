// Pure string-builders for the Heatmap tool — no React / DOM dependency.
// `buildHeatmapRScript` emits a self-contained .R file that reproduces
// the currently plotted heatmap with pheatmap (matrix literal +
// normalisation + clustering + palette all inlined). `buildCsvExport`
// turns the currently plotted (post-normalisation, post-reordering)
// matrix into the headers + rows arrays expected by `downloadCsv`.

import { sanitizeRString, formatRNumber, wrapRItems } from "../_shell/r-export";
import { COLOR_PALETTES, DIVERGING_PALETTES } from "../_core/color";

import type {
  CellBorderState,
  ClusterMode,
  DataMatrix,
  DistanceMetric,
  LinkageMethod,
  Normalization,
  RawMatrix,
} from "./helpers";

export interface HeatmapRScriptOpts {
  rawMatrix: RawMatrix;
  normalization: Normalization;
  rowMode: ClusterMode;
  colMode: ClusterMode;
  rowK: number;
  colK: number;
  kmeansSeed: number;
  distanceMetric: DistanceMetric;
  linkageMethod: LinkageMethod;
  palette: string;
  invertPalette: boolean;
  vmin: number;
  vmax: number;
  plotTitle: string;
  cellBorder: CellBorderState;
}

export function buildHeatmapRScript({
  rawMatrix,
  normalization,
  rowMode,
  colMode,
  rowK,
  colK,
  kmeansSeed,
  distanceMetric,
  linkageMethod,
  palette,
  invertPalette,
  vmin,
  vmax,
  plotTitle,
  cellBorder,
}: HeatmapRScriptOpts): string {
  const { rowLabels, colLabels, matrix } = rawMatrix;
  const rowNamesR = wrapRItems(rowLabels.map((l) => `"${sanitizeRString(l)}"`));
  const colNamesR = wrapRItems(colLabels.map((l) => `"${sanitizeRString(l)}"`));
  const flat: number[] = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) flat.push(matrix[r][c]);
  }
  // One matrix row per source line where it fits; wrapRItems re-wraps
  // any row too wide to stay within R_MAX_LINE.
  const dataLiteral = wrapRItems(flat.map(formatRNumber), colLabels.length || 8);
  const paletteBase = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const stops = invertPalette ? [...paletteBase].reverse() : paletteBase;
  const stopsR = "c(" + stops.map((c) => `"${c}"`).join(", ") + ")";

  // pheatmap speaks "correlation" directly; map our metric accordingly.
  const pheatmapDist =
    distanceMetric === "correlation" ? "correlation" : distanceMetric || "euclidean";

  const lines: string[] = [];
  lines.push("# Plöttr — Heatmap R script export");
  lines.push("# Generated " + new Date().toISOString());
  lines.push("#");
  lines.push("# Reproduces the normalisation + hierarchical clustering");
  lines.push("# you saw in the browser tool, using the {pheatmap} package.");
  lines.push("# To swap in your own data, replace the matrix block below with:");
  lines.push('#   mat <- as.matrix(read.csv("your_file.csv", row.names = 1,');
  lines.push("#                             check.names = FALSE))");
  lines.push("");
  lines.push('if (!requireNamespace("pheatmap", quietly = TRUE))');
  lines.push('  install.packages("pheatmap")');
  lines.push("library(pheatmap)");
  lines.push("");
  lines.push("# ── Raw data ───────────────────────────────────────────────────────────────");
  lines.push("row_labels <- " + rowNamesR);
  lines.push("col_labels <- " + colNamesR);
  lines.push("mat <- matrix(");
  lines.push("  " + dataLiteral + ",");
  lines.push("  nrow = length(row_labels),");
  lines.push("  byrow = TRUE,");
  lines.push("  dimnames = list(row_labels, col_labels)");
  lines.push(")");
  lines.push("");
  lines.push("# ── Normalisation ──────────────────────────────────────────────────────────");
  lines.push('# Toolbox setting: "' + normalization + '"');
  if (normalization === "zrow") {
    lines.push("# Z-score by row: (x - rowMean) / rowSD");
    lines.push("mat <- t(scale(t(mat)))");
  } else if (normalization === "zcol") {
    lines.push("# Z-score by column: (x - colMean) / colSD");
    lines.push("mat <- scale(mat)");
  } else if (normalization === "log2") {
    lines.push("# log2(x + 1) — gentle compression for right-skewed data");
    lines.push("mat <- log2(mat + 1)");
  } else {
    lines.push("# No normalisation — plot raw values.");
  }
  lines.push("");
  lines.push("# ── Clustering ─────────────────────────────────────────────────────────────");
  const rowUsesK = rowMode === "kmeans";
  const colUsesK = colMode === "kmeans";
  lines.push("# Rows: " + rowMode + (rowUsesK ? ` (k = ${rowK})` : ""));
  lines.push("# Columns: " + colMode + (colUsesK ? ` (k = ${colK})` : ""));
  if (rowUsesK || colUsesK) {
    lines.push("# K-means reorders the matrix by cluster id before plotting; pheatmap then");
    lines.push("# renders the rows/columns as-is (cluster_rows = FALSE for the k-means axis).");
    lines.push("set.seed(" + (kmeansSeed || 1) + ")");
    if (rowUsesK) {
      lines.push(
        "row_km <- kmeans(mat, centers = " +
          rowK +
          ', nstart = 8, iter.max = 100, algorithm = "Hartigan-Wong")'
      );
      lines.push("row_order <- order(row_km$cluster)");
      lines.push("mat <- mat[row_order, , drop = FALSE]");
      lines.push("row_clusters <- row_km$cluster[row_order]");
    }
    if (colUsesK) {
      lines.push(
        "col_km <- kmeans(t(mat), centers = " +
          colK +
          ', nstart = 8, iter.max = 100, algorithm = "Hartigan-Wong")'
      );
      lines.push("col_order <- order(col_km$cluster)");
      lines.push("mat <- mat[, col_order, drop = FALSE]");
      lines.push("col_clusters <- col_km$cluster[col_order]");
    }
  }
  if (rowMode === "hierarchical" || colMode === "hierarchical") {
    lines.push(
      '# Hierarchical settings: distance = "' +
        (distanceMetric || "euclidean") +
        '", linkage = "' +
        (linkageMethod || "average") +
        '"'
    );
  }
  lines.push("");
  lines.push("# ── Colour scale ───────────────────────────────────────────────────────────");
  lines.push(
    "# Palette: " +
      palette +
      (DIVERGING_PALETTES.has(palette) ? " (diverging)" : " (sequential)") +
      (invertPalette ? " — inverted" : "")
  );
  lines.push("palette_stops <- " + stopsR);
  lines.push("heat_colors <- colorRampPalette(palette_stops)(100)");
  if (DIVERGING_PALETTES.has(palette) && vmin < 0 && vmax > 0) {
    // Two-slope scale, as in the browser tool: the palette's neutral middle
    // colour is pinned to 0, each side of 0 gets half the colours.
    lines.push("# Two-slope breaks: the palette's neutral middle colour sits at 0.");
    lines.push(
      "breaks <- c(seq(" +
        formatRNumber(vmin) +
        ", 0, length.out = 51), seq(0, " +
        formatRNumber(vmax) +
        ", length.out = 51)[-1])"
    );
  } else {
    lines.push(
      "breaks <- seq(" + formatRNumber(vmin) + ", " + formatRNumber(vmax) + ", length.out = 101)"
    );
  }
  lines.push("");
  // pheatmap paints values outside `breaks` with its grey NA colour, while the
  // browser tool saturates them to the end colours. Clip before plotting —
  // but cluster on the unclipped matrix first, so the dendrograms still match.
  const rowHier = rowMode === "hierarchical";
  const colHier = colMode === "hierarchical";
  lines.push("# ── Clip to the colour range ───────────────────────────────────────────────");
  lines.push("# Cells beyond the colour range take the end colours, as in the browser");
  lines.push("# tool (pheatmap would otherwise paint them grey).");
  if (rowHier || colHier) {
    lines.push("# Clustering runs on the unclipped values first, so the dendrograms match.");
    lines.push(
      "hc_dist <- function(x) " +
        (pheatmapDist === "correlation"
          ? "as.dist(1 - cor(t(x)))"
          : 'dist(x, method = "' + pheatmapDist + '")')
    );
    const method = '"' + (linkageMethod || "average") + '"';
    if (rowHier) lines.push("row_tree <- hclust(hc_dist(mat), method = " + method + ")");
    if (colHier) lines.push("col_tree <- hclust(hc_dist(t(mat)), method = " + method + ")");
  }
  lines.push(
    "mat_plot <- pmin(pmax(mat, " + formatRNumber(vmin) + "), " + formatRNumber(vmax) + ")"
  );
  lines.push("");
  lines.push("# ── Plot ───────────────────────────────────────────────────────────────────");
  lines.push("pheatmap(");
  lines.push("  mat_plot,");
  // K-means already reordered the matrix — let pheatmap render that axis as-is.
  lines.push("  cluster_rows = " + (rowHier ? "row_tree" : "FALSE") + ",");
  lines.push("  cluster_cols = " + (colHier ? "col_tree" : "FALSE") + ",");
  lines.push("  color = heat_colors,");
  lines.push("  breaks = breaks,");
  const borderR = cellBorder && cellBorder.on ? `"${cellBorder.color}"` : "NA";
  lines.push("  border_color = " + borderR + ",");
  if (plotTitle) {
    lines.push('  main = "' + sanitizeRString(plotTitle) + '",');
  }
  if (rowUsesK) {
    lines.push("  annotation_row = data.frame(cluster = factor(row_clusters),");
    lines.push("                              row.names = rownames(mat)),");
  }
  if (colUsesK) {
    lines.push("  annotation_col = data.frame(cluster = factor(col_clusters),");
    lines.push("                              row.names = colnames(mat)),");
  }
  lines.push("  show_rownames = TRUE,");
  lines.push("  show_colnames = TRUE");
  lines.push(")");
  lines.push("");
  return lines.join("\n");
}

export interface CsvExportOpts {
  rowLabels: string[];
  colLabels: string[];
  matrix: DataMatrix;
  rowOrder: number[];
  colOrder: number[];
  rowClusterIds: number[] | null;
  colClusterIds: number[] | null;
}

export interface CsvExport {
  headers: string[];
  rows: string[][];
}

export function buildCsvExport({
  rowLabels,
  colLabels,
  matrix,
  rowOrder,
  colOrder,
  rowClusterIds,
  colClusterIds,
}: CsvExportOpts): CsvExport {
  const hasRowClusters = Array.isArray(rowClusterIds);
  const hasColClusters = Array.isArray(colClusterIds);
  const headers = [""]
    .concat(colOrder.map((i) => colLabels[i]))
    .concat(hasRowClusters ? ["cluster"] : []);
  const rows = rowOrder.map((ri) => {
    const cells = colOrder.map((ci) => {
      const v = matrix[ri][ci];
      return Number.isFinite(v) ? String(v) : "";
    });
    const base = [rowLabels[ri]].concat(cells);
    if (hasRowClusters && rowClusterIds) {
      const cid = rowClusterIds[ri];
      base.push(cid != null ? String(cid + 1) : "");
    }
    return base;
  });
  if (hasColClusters && colClusterIds) {
    const clusterRow = ["cluster"]
      .concat(
        colOrder.map((ci) => (colClusterIds[ci] != null ? String(colClusterIds[ci] + 1) : ""))
      )
      .concat(hasRowClusters ? [""] : []);
    rows.unshift(clusterRow);
  }
  return { headers, rows };
}

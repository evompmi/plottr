// Pure helpers for the heatmap tool — normalisation, dendrogram layout/prune,
// colorbar tick formatting, and dendrogram/selection colour constants. These
// have no React / DOM dependency and are separately testable (tests/helpers/
// heatmap-loader.js loads this file directly). JSX-bearing helpers
// (PaletteStrip, HeatmapChart, …) stay in tools/heatmap.tsx.

// `DataMatrix` is the shape of `parsed.data` for the heatmap tool: rows
// keyed by row label, columns keyed by column label. Cells are `number`
// (parsed from numeric tokens) or `NaN` for non-numeric / missing cells —
// the chart renders NaN as `NAN_FILL` instead of dropping the cell.
export type DataMatrix = number[][];

// ── Normalisation helpers ────────────────────────────────────────────────────

export function finiteMean(arr: number[]): number {
  let s = 0,
    n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      s += arr[i];
      n++;
    }
  }
  return n ? s / n : NaN;
}

export function finiteSD(arr: number[], mean: number): number {
  let s = 0,
    n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      const d = arr[i] - mean;
      s += d * d;
      n++;
    }
  }
  return n > 1 ? Math.sqrt(s / (n - 1)) : 0;
}

export function normalizeMatrix(matrix: DataMatrix, mode: Normalization): DataMatrix {
  const nRows = matrix.length;
  if (nRows === 0) return matrix;
  const nCols = matrix[0].length;

  if (mode === "zrow") {
    return matrix.map((row) => {
      const m = finiteMean(row);
      const sd = finiteSD(row, m);
      if (!Number.isFinite(m) || sd === 0) return row.slice();
      return row.map((v) => (Number.isFinite(v) ? (v - m) / sd : NaN));
    });
  }
  if (mode === "zcol") {
    const out = matrix.map((r) => r.slice());
    for (let ci = 0; ci < nCols; ci++) {
      const col = new Array<number>(nRows);
      for (let ri = 0; ri < nRows; ri++) col[ri] = matrix[ri][ci];
      const m = finiteMean(col);
      const sd = finiteSD(col, m);
      if (!Number.isFinite(m) || sd === 0) continue;
      for (let ri = 0; ri < nRows; ri++) {
        out[ri][ci] = Number.isFinite(matrix[ri][ci]) ? (matrix[ri][ci] - m) / sd : NaN;
      }
    }
    return out;
  }
  if (mode === "log2") {
    return matrix.map((row) =>
      row.map((v) => (Number.isFinite(v) && v > -1 ? Math.log2(v + 1) : NaN))
    );
  }
  return matrix;
}

export function autoRange(matrix: DataMatrix, diverging: boolean): [number, number] {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const v = matrix[i][j];
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m || 0, m || 1];
  }
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

// ── Dendrogram constants & layout ────────────────────────────────────────────

export const DENDRO_STROKE = "#555555";
export const DENDRO_HOVER_STROKE = "#0072B2"; // Okabe-Ito blue — stands out against the grey default.
export const NAN_FILL = "#e0e0e0";
export const SELECTION_STROKE = "#111111";
export const HIGHLIGHT_STROKE = "#111111";

// Walk an hclust tree producing BOTH the segment list for drawing AND the
// per-internal-node records for hit-testing. Each segment is tagged with the
// [xMin, xMax] leaf-order span of the internal node that emitted it, so we can
// cheaply decide later whether it belongs to a hovered subtree: segment.xMin ≥
// hoverNode.xMin && segment.xMax ≤ hoverNode.xMax. Kept local (not in stats.js)
// because only the heatmap view needs the hover metadata.

// Each emitted segment carries the [xMin, xMax] leaf-order span of the
// internal node that produced it (used by the hover handlers to decide
// whether a segment belongs to the hovered subtree).
export interface DendroLayoutSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  xMin: number;
  xMax: number;
}

export interface DendroLayoutNode {
  height: number;
  leaves: number[];
  xMin: number;
  xMax: number;
}

export interface DendroLayout {
  segments: DendroLayoutSegment[];
  nodes: DendroLayoutNode[];
  maxHeight: number;
}

interface DendroWalkResult {
  x: number;
  h: number;
  leaves: number[];
  xMin: number;
  xMax: number;
}

export function buildDendroLayout(tree: HClustNode | null | undefined): DendroLayout {
  if (!tree) return { segments: [], nodes: [], maxHeight: 0 };
  const segments: DendroLayoutSegment[] = [];
  const nodes: DendroLayoutNode[] = [];
  let leafIdx = 0;
  let maxHeight = 0;
  function walk(node: HClustNode): DendroWalkResult {
    if (!node.left && !node.right) {
      const pos = leafIdx++;
      return { x: pos, h: 0, leaves: [node.index ?? -1], xMin: pos, xMax: pos };
    }
    const L = walk(node.left as HClustNode);
    const R = walk(node.right as HClustNode);
    const h = node.height;
    if (h > maxHeight) maxHeight = h;
    const leaves = L.leaves.concat(R.leaves);
    const xMin = Math.min(L.xMin, R.xMin);
    const xMax = Math.max(L.xMax, R.xMax);
    segments.push({ x1: L.x, y1: L.h, x2: L.x, y2: h, xMin, xMax });
    segments.push({ x1: R.x, y1: R.h, x2: R.x, y2: h, xMin, xMax });
    segments.push({ x1: L.x, y1: h, x2: R.x, y2: h, xMin, xMax });
    nodes.push({ height: h, leaves, xMin, xMax });
    return { x: (L.x + R.x) / 2, h, leaves, xMin, xMax };
  }
  walk(tree);
  return { segments, nodes, maxHeight };
}

// Prune an hclust tree down to the leaves whose original indices are in
// `keepSet`. Returns the pruned subtree, or `null` if pruning leaves fewer
// than two leaves (a single-leaf "tree" has no internal merges, so there's
// no dendrogram to draw). Internal nodes that retain only one child are
// collapsed to that child, so the returned tree has no unary internals;
// original merge heights are preserved, giving a true subtree dendrogram
// of the selection — edges skip over elided sibling clades but the
// heights still reflect the original clustering distances.
export function pruneDendroTree(
  tree: HClustNode | null | undefined,
  keepSet: Set<number>
): HClustNode | null {
  function rec(node: HClustNode | null | undefined): HClustNode | null {
    if (!node) return null;
    if (!node.left && !node.right) {
      return node.index != null && keepSet.has(node.index) ? node : null;
    }
    const L = rec(node.left);
    const R = rec(node.right);
    if (!L && !R) return null;
    if (!L) return R;
    if (!R) return L;
    return {
      index: -1,
      left: L,
      right: R,
      height: node.height,
      size: (L.size || 1) + (R.size || 1),
    };
  }
  const pruned = rec(tree);
  if (!pruned || (!pruned.left && !pruned.right)) return null;
  return pruned;
}

// Okabe-Ito categorical palette for k-means cluster-id colour strips.
export const CLUSTER_PALETTE = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#999999",
  "#88CCEE",
  "#AA4499",
];

// ── Colorbar tick formatting ─────────────────────────────────────────────────

export function fmtColorbarTick(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toExponential(1);
  if (abs < 1) return v.toFixed(2);
  return v.toFixed(1);
}

// ── Vis state + prop interfaces ─────────────────────────────────────────────
//
// Mirrors the runtime shape of `VIS_INIT_HEATMAP` in index.tsx — declared
// here so the prop bags can reference it without a circular import.

export interface HeatmapVis {
  palette: string;
  invertPalette: boolean;
  vmin: number;
  vmax: number;
  plotTitle: string;
  plotSubtitle: string;
  colAxisLabel: string;
  rowAxisLabel: string;
  showRowLabels: boolean;
  showColLabels: boolean;
  showRowDendrogram: boolean;
  showColDendrogram: boolean;
}

export type UpdVis = (patch: Partial<HeatmapVis> | { _reset: true }) => void;

export interface CellBorderState {
  on: boolean;
  color: string;
  width: number;
}
export type UpdCellBorder = (patch: Partial<CellBorderState> | { _reset: true }) => void;

export interface RawMatrix {
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
}

export type ClusterMode = "none" | "hierarchical" | "kmeans";
export type Normalization = "none" | "zrow" | "zcol" | "log2";
export type DistanceMetric = "euclidean" | "manhattan" | "correlation";
export type LinkageMethod = "average" | "complete" | "single" | "ward";

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export interface ClusterModeControlProps {
  label: string;
  mode: ClusterMode;
  setMode: (m: ClusterMode) => void;
  k: number;
  setK: (k: number) => void;
}

export interface ControlSectionProps {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

// `matrixRef` is a ref to the materialised CSV-export shape — it carries
// the post-normalisation matrix + row/col orders + (optional) cluster ids
// so the CSV download tile can serialize the exact view the user sees.
// app.tsx writes into the ref from a useEffect; the ref's value is `null`
// before the first effect runs.
export interface MatrixExportRef {
  rowLabels: string[];
  colLabels: string[];
  matrix: DataMatrix;
  rowOrder: number[];
  colOrder: number[];
  rowClusterIds: number[] | null;
  colClusterIds: number[] | null;
}

// ── PaletteStrip props ─────────────────────────────────────────────────────

export interface PaletteStripProps {
  palette: string;
  invert?: boolean;
  height?: number;
}

// ── Selection + brush types ────────────────────────────────────────────────

// Selection is keyed on ORIGINAL rawMatrix indices, not on rowOrder /
// colOrder, so cluster changes don't invalidate the user's selection.
// `null` on an axis means "all rows / cols on that axis".
export interface HeatmapSelection {
  rows: number[] | null;
  cols: number[] | null;
  // When the selection came from a cluster-strip click, `clusterId` (0-based)
  // and `clusterAxis` annotate which cluster on which axis was picked.
  clusterId: number | null;
  clusterAxis: "row" | "col" | null;
}

// Brush coordinates are in display space (rowOrder / colOrder positions).
// app.tsx maps them through rowOrder / colOrder before setting selection.
export interface BrushBox {
  riMin: number;
  riMax: number;
  ciMin: number;
  ciMax: number;
}

// `axis` + a cluster meta object (passed by the dendrogram-branch click and
// the cluster-strip click handlers).
export interface AxisClusterMeta {
  clusterId?: number;
}

// Result shape of `rowCluster` / `colCluster` useMemo in app.tsx —
// hierarchical clustering yields a tree + leaf order; k-means yields per-row
// cluster ids + leaf order. Mode is the discriminant.
export type ClusterResult =
  | { mode: "hierarchical"; tree: HClustNode; order: number[] }
  | { mode: "kmeans"; clusters: number[]; order: number[]; k: number };

// ── Chart props ────────────────────────────────────────────────────────────

export interface HeatmapChartProps {
  rowLabels: string[];
  colLabels: string[];
  matrix: DataMatrix;
  rowOrder: number[];
  colOrder: number[];
  rowCluster: ClusterResult | null;
  colCluster: ClusterResult | null;
  vmin: number;
  vmax: number;
  palette: string;
  invertPalette?: boolean;
  cellBorder: CellBorderState;
  plotTitle?: string;
  plotSubtitle?: string;
  rowAxisLabel?: string;
  colAxisLabel?: string;
  showRowLabels?: boolean;
  showColLabels?: boolean;
  showRowDendrogram?: boolean;
  showColDendrogram?: boolean;
  // Interactive props (main view only — detail view leaves them undefined).
  interactive?: boolean;
  selection?: HeatmapSelection | null;
  onBrushEnd?: (box: BrushBox) => void;
  onAxisSelect?: (
    axis: "row" | "col",
    indices: number[] | null,
    meta?: AxisClusterMeta | null
  ) => void;
  onClearSelection?: () => void;
  // The pre-normalisation matrix — passed as a raw `DataMatrix` (not the
  // full `RawMatrix` envelope) so the chart's hover tooltip can show the
  // original value alongside the normalised one. Optional because the
  // detail view doesn't always pass it through.
  rawMatrix?: DataMatrix;
  // Cell-size + colourbar overrides for the detail view.
  baseCellW?: number;
  baseCellH?: number;
  baseColorbarH?: number;
  baseDendroSizeLeft?: number;
  baseDendroSizeTop?: number;
  baseColLabelH?: number;
  baseRowLabelW?: number;
  cellOffsetCols?: number;
  cellOffsetRows?: number;
  basePlotW?: number;
  basePlotH?: number;
  colGapStartPx?: number;
  rowGapStartPx?: number;
  showClusterStrip?: boolean;
  showKmeansStrip?: boolean;
  dendrogramStrokeWidth?: number;
}

// ── plot-area (detail view + preview card) props ──────────────────────────

export interface DetailViewProps {
  rawMatrix: RawMatrix;
  normalized: DataMatrix;
  detailRowOrder: number[];
  detailColOrder: number[];
  mainRowCluster: ClusterResult | null;
  mainColCluster: ClusterResult | null;
  vis: HeatmapVis;
  cellBorder: CellBorderState;
  detailChartRef: React.MutableRefObject<SVGSVGElement | null>;
  fileName: string;
  // 0-based cluster id when the selection came from a cluster-strip click,
  // null when it came from a brush / dendrogram-branch click. Used to tag
  // download filenames with `_cluster1` / `_cluster2` etc.
  clusterId: number | null;
}

export interface DetailPreviewCardProps {
  rawMatrix: RawMatrix;
  normalized: DataMatrix;
  detailRowOrder: number[];
  detailColOrder: number[];
  fileName: string;
  clusterId: number | null;
}

export interface PlotControlsProps {
  vis: HeatmapVis;
  updVis: UpdVis;
  cellBorder: CellBorderState;
  updCellBorder: UpdCellBorder;
  matrixRef: React.MutableRefObject<MatrixExportRef | null>;
  rawMatrix: RawMatrix;
  resetAll: () => void;
  fileName: string;
  normalization: Normalization;
  setNormalization: (n: Normalization) => void;
  rowMode: ClusterMode;
  setRowMode: (m: ClusterMode) => void;
  colMode: ClusterMode;
  setColMode: (m: ClusterMode) => void;
  rowK: number;
  setRowK: (k: number) => void;
  colK: number;
  setColK: (k: number) => void;
  kmeansSeed: number;
  setKmeansSeed: (s: number) => void;
  distanceMetric: DistanceMetric;
  setDistanceMetric: (m: DistanceMetric) => void;
  linkageMethod: LinkageMethod;
  setLinkageMethod: (m: LinkageMethod) => void;
  autoVRange: () => void;
}

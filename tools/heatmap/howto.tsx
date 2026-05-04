import type { HowToContent } from "../_shell/HowTo";

export const HEATMAP_HOWTO: HowToContent = {
  toolName: "heatmap",
  title: "Heatmap — How to use",
  subtitle: "Numeric matrix with optional row / column clustering",
  purpose: (
    <>
      Visualise a 2D numeric matrix (genes × samples, taxa × conditions, distance matrix). Reorder
      rows + columns by hierarchical or k-means clustering to surface structure.
    </>
  ),
  dataLayout: (
    <>
      Wide matrix — first column holds the row labels (genes / features), the header row holds the
      column labels (samples / conditions), the rest is a numeric grid. Missing values are
      tolerated.
    </>
  ),
  display: (
    <>
      Pick a <strong>palette</strong> (continuous viridis-family or diverging), optional{" "}
      <strong>z-score</strong> / <strong>log₂</strong> normalisation per row or column, and
      independent row / column clustering modes (<strong>hierarchical</strong> with linkage +
      distance metric, or <strong>k-means</strong> with explicit k). Drag-select any region for a
      zoomed detail view.
    </>
  ),
};

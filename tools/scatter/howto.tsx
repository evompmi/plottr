import type { HowToContent } from "../_shell/HowTo";

export const SCATTER_HOWTO: HowToContent = {
  toolName: "scatter",
  title: "Scatter Plot — How to use",
  subtitle: "XY scatter with optional colour / size / shape mapping",
  purpose: (
    <>
      Plot one numeric column against another. Map a third (or fourth, or fifth) column to point
      colour, size, or shape to surface multivariate structure in a single view.
    </>
  ),
  dataLayout: (
    <>
      One row per point. At least two <strong>numeric</strong> columns (the X and Y axes). Extra
      columns — categorical or numeric — become aesthetic mappings or filters.
    </>
  ),
  display: (
    <>
      Optional colour-by-column (continuous gradient or discrete swatches), size-by-column, and
      shape-by-column. Add <strong>reference lines</strong> at fixed X / Y values, overlay a{" "}
      <strong>linear regression</strong> with R² + p-value. Filter rows by any categorical column.
    </>
  ),
};

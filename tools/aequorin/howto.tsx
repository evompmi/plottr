import type { HowToContent } from "../_shell/HowTo";

export const AEQUORIN_HOWTO: HowToContent = {
  toolName: "aequorin",
  title: "RLU timecourse — How to use",
  subtitle:
    "Plot any time-series of replicates (luminescence, fluorescence, OD, …) with replicate-derived error ribbons",
  purpose: (
    <>
      Plot a measurement against time, one trace per condition, with replicate spread shown as a
      ribbon. Calibration is optional — leave the formula on <strong>None</strong> for raw data, or
      pick an aequorin / Ca²⁺ formula when you have luminescence to convert.
    </>
  ),
  dataLayout: (
    <>
      Wide format — one column per sample, one row per time-point. Numeric matrix; no time-axis
      column required (rows are evenly-spaced; you set the per-row time step + base unit).{" "}
      <strong>Columns sharing the same header are pooled as replicates of one condition</strong> —
      the chart plots their <strong>mean ± SD</strong> ribbon automatically. Rename headers to
      change which samples group together.
    </>
  ),
  display: (
    <>
      Each unique header becomes a coloured trace; same-name columns collapse into a mean ± SD
      ribbon under it. View the combined chart or a faceted small-multiples grid. Optional aequorin
      calibration (<strong>Allen &amp; Blinks</strong>, <strong>Hill</strong>, generalised) converts
      raw luminescence to [Ca²⁺]. Optional inset bar plot of integrated Σ-area per condition.
    </>
  ),
};

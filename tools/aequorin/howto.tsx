import type { HowToContent } from "../_shell/HowTo";

export const AEQUORIN_HOWTO: HowToContent = {
  toolName: "aequorin",
  title: "Aequorin Calibration — How to use",
  subtitle: "Calibrate raw luminescence to [Ca²⁺] and plot the time course",
  purpose: (
    <>
      Convert raw aequorin luminescence (RLU vs time) to free cytosolic [Ca²⁺] using the standard
      calibration formulas, then plot the time course with replicate-derived error ribbons.
    </>
  ),
  dataLayout: (
    <>
      Wide format — one column per replicate / sample, one row per time-point. Numeric matrix; no
      time-axis column required (rows are evenly-spaced; you set the per-row time step + base unit).
    </>
  ),
  display: (
    <>
      Pick a calibration formula (<strong>Allen &amp; Blinks</strong>, <strong>Hill</strong>, or
      generalised) with the relevant constants. Group replicates into named conditions, then view
      the combined chart or a faceted small-multiples grid. Optional inset bar plot of integrated
      Σ-area per condition.
    </>
  ),
};

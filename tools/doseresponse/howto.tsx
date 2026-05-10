import type { HowToContent } from "../_shell";

export const DOSERESPONSE_HOWTO: HowToContent = {
  toolName: "doseresponse",
  title: "EC50 / IC50 — Dose–Response — How to use",
  subtitle: "4-parameter logistic (variable-slope Hill) fit, multi-curve comparison",
  purpose: (
    <>
      Fit dose–response curves and read off <strong>EC50</strong> / <strong>IC50</strong>,
      <strong> Hill slope</strong>, and Top/Bottom plateaus with 95% confidence intervals. Overlay
      curves for multiple conditions and ask whether they share an EC50 or a Hill slope via an
      extra-sum-of-squares <strong>F-test</strong>.
    </>
  ),
  dataLayout: (
    <>
      One row per observation, in long-tidy format:{" "}
      <code>dose, response, [replicate], [condition]</code>. Doses are entered as raw concentrations
      (M, µM, nM…) by default — the tool log-transforms them internally. A <em>condition</em> column
      is optional but unlocks multi-curve overlay and the shared-parameter F-test.
    </>
  ),
  display: (
    <>
      Pick the model variant (4PL by default; 3PL fixes Hill = 1), zero-dose handling, response
      normalisation, and weighting. Optionally fix individual parameters (e.g. constrain{" "}
      <strong>Top = 100</strong> when data are pre-normalised). Toggle the 95% CI ribbon, the
      residuals diagnostic strip, and the in-SVG parameter table from the sidebar.
    </>
  ),
};

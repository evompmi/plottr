import type { HowToContent } from "../_shell/HowTo";

export const LINEPLOT_HOWTO: HowToContent = {
  toolName: "lineplot",
  title: "Line Plot — How to use",
  subtitle: "Mean ± error per group across an x-axis, with per-x significance",
  purpose: (
    <>
      Plot how a measurement evolves across an x-axis variable (time, dose, concentration), one line
      per group. Replicates at the same X are averaged and their spread becomes the error bar.
    </>
  ),
  dataLayout: (
    <>
      Long format — one row per observation, with a numeric <strong>X</strong>, a numeric{" "}
      <strong>Y</strong>, and a categorical <strong>group</strong> column. Replicates share the same
      (X, group) pair. Error bars only render when a group has ≥ 2 replicates at that X.
    </>
  ),
  display: (
    <>
      Pick <strong>SEM</strong> (default), <strong>SD</strong>, or <strong>95% CI</strong> for error
      ribbons. At every X shared by ≥ 2 groups the right test is auto-routed (t / Welch /
      Mann-Whitney; ANOVA / Welch-ANOVA / Kruskal-Wallis); p-values are <strong>BH-adjusted</strong>{" "}
      across the X-axis and significance stars overlay the chart.
    </>
  ),
};

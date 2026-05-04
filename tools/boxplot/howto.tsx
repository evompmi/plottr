import type { HowToContent } from "../_shell/HowTo";

export const BOXPLOT_HOWTO: HowToContent = {
  toolName: "boxplot",
  title: "Group Plot — How to use",
  subtitle: "Compare a numeric measurement across categorical groups",
  purpose: (
    <>
      Side-by-side comparison of a numeric measurement across two or more groups (genotypes,
      treatments, conditions). Routes the right statistical test for the data shape and overlays the
      result.
    </>
  ),
  dataLayout: (
    <>
      <strong>Long</strong> (preferred) — one row per observation, with a categorical{" "}
      <strong>group</strong> column and a numeric <strong>value</strong> column.{" "}
      <strong>Wide</strong> (one column per group) is auto-detected and reshaped on the fly.
      Optional extra columns become filters / facets / sub-groups.
    </>
  ),
  display: (
    <>
      Switch between <strong>box</strong> / <strong>violin</strong> / <strong>raincloud</strong> /{" "}
      <strong>bar</strong>. Significance is computed automatically (<em>t</em> / Welch /
      Mann-Whitney for k = 2; ANOVA / Welch-ANOVA / Kruskal-Wallis with Tukey / Games-Howell / Dunn
      post-hoc for k ≥ 3) and rendered as brackets or compact-letter display.
    </>
  ),
  tips: (
    <>
      Pick a <strong>Color by</strong> column to map a second categorical to point colour;{" "}
      <strong>Facet by</strong> splits the chart into a small-multiples grid;{" "}
      <strong>Subgroup by</strong> nests a second factor inside each group's box.
    </>
  ),
};

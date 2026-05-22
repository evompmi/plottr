import type { HowToContent } from "../_shell";

export const FACTORIAL_HOWTO: HowToContent = {
  toolName: "factorial",
  title: "Factorial Analysis — How to use",
  subtitle: "Two-factor (A × B) ANOVA with Type II sums of squares — no chart, just the report",
  purpose: (
    <>
      Test two crossed factors and their <strong>interaction</strong> in one pass — &ldquo;does drug
      effect depend on genotype?&rdquo; is the killer question Group Plot can&apos;t answer because
      it only tests one factor at a time.
    </>
  ),
  dataLayout: (
    <>
      <strong>Long format</strong>, one row per observation. Pick three columns in the Configure
      step: <strong>factor A</strong>, <strong>factor B</strong>, and <strong>value</strong>{" "}
      (numeric). Other columns can be set to <em>filter</em> or <em>ignore</em>.
    </>
  ),
  display: (
    <>
      The Report step shows the ANOVA table (F, p, η²_p per term), a hint when the interaction is
      significant, per-cell Shapiro-Wilk + Levene diagnostics, and the cell-means table. Download as{" "}
      <strong>CSV</strong> (cell means + ANOVA table), <strong>R script</strong> (cross-checks via{" "}
      <code>car::Anova(type = 2)</code>), or <strong>TXT</strong> (formatted, paste-ready).
    </>
  ),
  tips: (
    <>
      <strong>Why Type II SS?</strong> For balanced designs it equals Type I (no difference). For
      unbalanced data — common in wet-lab work after drop-outs — Type II doesn&apos;t depend on
      contrast coding for the main effects and matches <code>car::Anova(type = 2)</code>. The tool
      caps at 2 factors by design: high-order interactions (3+ way) get hard to interpret and need
      cell counts most wet-lab experiments can&apos;t fill.
    </>
  ),
  capabilities: [
    "2-factor ANOVA",
    "Type II sums of squares",
    "Interaction test",
    "Partial η²",
    "Shapiro / Levene diagnostics",
    "Balanced or unbalanced",
    "R / CSV / TXT export",
  ],
};

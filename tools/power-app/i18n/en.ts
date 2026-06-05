// English catalog for the Power Analysis calculator (namespace "power").

import type { Catalog } from "../../_core/i18n";

const en = {
  // Page
  "power.title": "Power Analysis",

  // Test registry — labels + questions + sample-size labels
  "power.test.tInd.label": "Two-sample t-test",
  "power.test.tInd.question":
    "How many subjects per group to detect a difference between two independent groups?",
  "power.test.tInd.nLabel": "n per group",
  "power.test.tPaired.label": "Paired t-test",
  "power.test.tPaired.question":
    "How many pairs to detect a difference between matched measurements?",
  "power.test.tPaired.nLabel": "n (pairs)",
  "power.test.tOne.label": "One-sample t-test",
  "power.test.tOne.question":
    "How many observations to detect a deviation from a known reference value?",
  "power.test.tOne.nLabel": "n",
  "power.test.anova.label": "One-way ANOVA",
  "power.test.anova.question":
    "How many subjects per group to detect differences among k group means?",
  "power.test.anova.nLabel": "n per group",
  "power.test.correlation.label": "Correlation",
  "power.test.correlation.question":
    "How many observations to detect a non-zero Pearson correlation?",
  "power.test.correlation.nLabel": "n (total)",
  "power.test.chi2.label": "Chi-square test",
  "power.test.chi2.question": "How many observations for a goodness-of-fit or independence test?",
  "power.test.chi2.nLabel": "n (total)",

  // Total-N readout under the result
  "power.totalN.twoSample": "Total N = {total} ({n} per group × 2)",
  "power.totalN.anova": "Total N = {total} ({n} per group × {k} groups)",

  // Effect-size category badges
  "power.size.small": "small",
  "power.size.medium": "medium",
  "power.size.large": "large",
  "power.size.effectSuffix": "effect",

  // Effect-size panel
  "power.es.helperTab": "From my data",
  "power.es.directTab": "Direct value",
  "power.es.expectedR": "Expected correlation |r|",
  "power.es.rNote": "How strong a linear relationship do you expect?",
  "power.es.mean1": "Expected mean — group 1",
  "power.es.mean2": "Expected mean — group 2",
  "power.es.commonSd": "Common standard deviation",
  "power.es.compute": "Compute effect size",
  "power.es.tIndNote":
    "Use pilot data or literature values. The SD should be the pooled within-group SD.",
  "power.es.meanDiff": "Expected mean difference",
  "power.es.deviationRef": "Expected deviation from reference",
  "power.es.sdPairedDiff": "SD of paired differences",
  "power.es.sd": "Standard deviation",
  "power.es.groupMeans": "Expected group means (comma-separated)",
  "power.es.withinSd": "Within-group standard deviation",
  "power.es.anovaNote":
    "Enter the means you expect for each treatment group, and the common within-group SD (from pilot data or literature).",
  "power.es.baselineProps": "Baseline proportions (what the theory predicts)",
  "power.es.actualProps": "Actual proportions (what you think is really happening)",
  "power.es.chi2Note":
    "Use ratios (3:1) or proportions (0.75, 0.25). Common for Mendelian segregation tests.",
  "power.es.directF": "Effect size (f)",
  "power.es.directW": "Effect size (w)",
  "power.es.directD": "Effect size (d)",
  "power.es.formulaF": "f = SD of group means / within-group SD",
  "power.es.formulaW": "w = √(Σ (p_obs − p_exp)² / p_exp)",
  "power.es.formulaD": "d = |difference in means| / pooled SD",
  "power.es.computed": "Effect size = ",

  // Power curve chart
  "power.curve.title": "Power curve",
  "power.curve.desc": "Statistical power as a function of sample size",
  "power.curve.yAxis": "Power (1 − β)",

  // Main controls
  "power.ctrl.statisticalTest": "Statistical test",
  "power.ctrl.whatToFind": "What do you need to find?",
  "power.ctrl.sampleSize": "Sample size",
  "power.ctrl.power": "Power",
  "power.ctrl.expectedEffect": "Expected effect size",
  "power.ctrl.significance": "Significance level (α)",
  "power.ctrl.desiredPower": "Desired power (1 − β)",
  "power.ctrl.standardTitle": "0.80 (standard)",
  "power.ctrl.direction": "Direction of the test",
  "power.ctrl.twoSided": "Two-sided",
  "power.ctrl.oneSided": "One-sided",
  "power.ctrl.directionNote":
    "Two-sided: the difference could go either way. One-sided: you expect a specific direction.",
  "power.ctrl.numGroups": "Number of groups",
  "power.ctrl.df": "Degrees of freedom",
  "power.ctrl.dfNote": "Goodness-of-fit: categories − 1.<br/>Independence: (rows−1)(cols−1).",

  // Result
  "power.result.requiredN": "Required {nLabel}",
  "power.result.statisticalPower": "Statistical power",
  "power.result.rTitle":
    "Download a runnable R script reproducing this power calculation with the pwr package",

  // Explainer
  "power.explain.heading": "What do these numbers mean?",
  "power.explain.body":
    '<b>Power</b> is the probability that you will correctly reject the null hypothesis (i.e. to claim a result is significant). A power of 0.80 (the dashed line) means an 80% chance of success — this is the standard minimum. Higher is better but costs more subjects.<br/><br/><b>Significance level (α)</b> is the risk of a false positive — concluding there is an effect when there is none. The standard α&nbsp;=&nbsp;0.05 means you accept a 5% chance of a false alarm. Lowering α (e.g. to 0.01) makes you more conservative but requires more subjects to keep power high.<br/><br/><b>Sample size ({nLabel})</b> is the number of observations you need to collect. More subjects give you more power to detect a given effect.<br/><br/><b>Effect size</b> measures how large the real difference or relationship is, scaled by variability. Use the "From my data" tab to compute it from values you expect (e.g. group means and standard deviation from pilot data or published studies).',
  "power.explain.tInd":
    "For a <b>two-sample t-test</b>, the effect size (Cohen's d) is the difference between the two group means divided by their common standard deviation. A d of 0.2 is small, 0.5 is medium, and 0.8 is large.",
  "power.explain.tPaired":
    "For a <b>paired t-test</b>, the effect size (Cohen's d) is the expected mean of the paired differences divided by the standard deviation of those differences.",
  "power.explain.tOne":
    "For a <b>one-sample t-test</b>, the effect size (Cohen's d) is how far the true mean deviates from the reference value, divided by the standard deviation.",
  "power.explain.anova":
    "For <b>ANOVA</b>, the effect size (Cohen's f) captures how spread out the group means are relative to within-group variability. An f of 0.10 is small, 0.25 is medium, and 0.40 is large.",
  "power.explain.correlation":
    "For <b>correlation</b>, the effect size is simply the expected Pearson r. An r of 0.1 is small, 0.3 is medium, and 0.5 is large.",
  "power.explain.chi2":
    "For a <b>chi-square test</b>, the effect size (Cohen's w) measures how far the observed category proportions deviate from expected. A w of 0.1 is small, 0.3 is medium, and 0.5 is large.<br/><br/>Degrees of freedom:<br/>&bull; Goodness-of-fit: <b>df = categories − 1</b><br/>&bull; Independence: <b>df = (rows − 1) × (cols − 1)</b>",
} as const satisfies Catalog;

export default en;
export type PowerKey = keyof typeof en;

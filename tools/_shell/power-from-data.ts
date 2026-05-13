// `computePowerFromData` — n-needed-for-80%-power from observed data,
// dispatched per test family (t-tests / ANOVA / KW). Forward-looking
// replication planning: given the effect size we just saw, how many
// samples per group would a future study need to reach 80% power at
// each α? For rank-based tests (Mann-Whitney / Kruskal-Wallis) we
// report the parametric analog as an approximation — flagged in the
// returned `approximate` flag.
//
// The pre-2026-05-13 version of this module also returned an `achieved`
// power per row (computed by feeding the observed effect size back
// through powerTwoSample / powerAnova at the OBSERVED sample size).
// That is the classic Hoenig & Heisey 2001 anti-pattern: post-hoc /
// observed power is a deterministic transformation of the p-value, so
// it adds zero information beyond what p already tells the reader.
// Worse, presented as a coloured "% achieved" cell, it nudges users
// toward interpreting non-significant tests as "underpowered" when
// the more honest framing is "we observed effect size X; for that
// effect, a replication would need n=Y." That's what this module now
// returns. See conversation history 2026-05-13 + the H&H 2001 paper
// for the methodology pivot.

declare const sampleMean: (xs: number[]) => number;
declare const sampleSD: (xs: number[]) => number;
declare const powerTwoSample: (d: number, n: number, alpha: number, tails: number) => number;
declare const powerAnova: (f: number, n: number, alpha: number, k: number) => number;
declare const cohenDCI: (
  d: number,
  n1: number,
  n2: number,
  conf?: number
) => { lo: number; hi: number };

export interface PowerFromDataRow {
  alpha: number;
  nForTarget: number | null;
}

// 95 % CI on the effect size (Cohen's d / d_av). Present for two-group
// parametric tests (Student / Welch), null for ANOVA k≥3 and rank-based
// tests where a single closed-form CI on the effect isn't as clean —
// callers can either bootstrap or rely on the existing point estimate
// for those cases.
export interface PowerFromDataResult {
  effectLabel: string;
  effect: number;
  effectCI: { lo: number; hi: number } | null;
  rows: PowerFromDataRow[];
  targetPower: number;
  nLabel: string;
  approximate: boolean;
}

export function computePowerFromData(
  chosenTest: string | null | undefined,
  values: number[][] | null | undefined
): PowerFromDataResult | null {
  if (!chosenTest || !values || values.length < 2) return null;
  const alphas = [0.05, 0.01, 0.001];
  const target = 0.8;

  if (chosenTest === "studentT" || chosenTest === "welchT" || chosenTest === "mannWhitney") {
    const x = values[0];
    const y = values[1];
    const n1 = x.length;
    const n2 = y.length;
    if (n1 < 2 || n2 < 2) return null;
    const m1 = sampleMean(x);
    const m2 = sampleMean(y);
    const s1 = sampleSD(x);
    const s2 = sampleSD(y);
    // Effect-size denominator picks based on the chosen test's
    // variance assumption (Lakens 2013):
    //   - Student's t / Mann-Whitney: pooled SD (d_s). Both assume
    //     a single common variance; the pooled estimator is the
    //     maximum-likelihood denominator consistent with that.
    //   - Welch's t: mean of unpooled SDs (d_av). Welch denies the
    //     equal-variance assumption; the pooled denominator embeds
    //     it back and is methodologically inconsistent. d_av takes
    //     each group's SD on its own merits, symmetric in both.
    // Label changes too so users can tell which denominator was used.
    let denom: number;
    let label: string;
    if (chosenTest === "welchT") {
      denom = (s1 + s2) / 2;
      label = "Cohen's d_av";
    } else {
      denom = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
      label = "Cohen's d";
    }
    // d / d_av return the absolute magnitude here for the power-curve
    // input. The CI is computed on the *signed* d (so direction is
    // preserved when the panel displays "d = -2.05, 95% CI [-2.50, -1.58]").
    const dAbs = denom > 0 ? Math.abs(m1 - m2) / denom : 0;
    const dSigned = denom > 0 ? (m1 - m2) / denom : 0;
    const effectCI =
      chosenTest === "mannWhitney"
        ? null // MWU is rank-based; the d analog has no clean closed-form CI
        : denom > 0
          ? cohenDCI(dSigned, n1, n2)
          : null;
    const rows = alphas.map((alpha) => {
      let needed: number | null = null;
      if (dAbs > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerTwoSample(dAbs, n, alpha, 2) >= target) {
            needed = n;
            break;
          }
        }
      }
      return { alpha, nForTarget: needed };
    });
    return {
      effectLabel: label,
      effect: dSigned,
      effectCI,
      rows,
      targetPower: target,
      nLabel: "per group",
      approximate: chosenTest === "mannWhitney",
    };
  }

  if (
    chosenTest === "oneWayANOVA" ||
    chosenTest === "welchANOVA" ||
    chosenTest === "kruskalWallis"
  ) {
    const kk = values.length;
    if (kk < 2) return null;
    const means = values.map(sampleMean);
    if (values.some((v) => v.length < 2)) return null;
    let ssW = 0;
    let totalN = 0;
    let weightedSum = 0;
    for (let i = 0; i < kk; i++) {
      const m = means[i];
      const ni = values[i].length;
      for (let j = 0; j < ni; j++) ssW += (values[i][j] - m) * (values[i][j] - m);
      totalN += ni;
      weightedSum += ni * m;
    }
    // Cohen's f via η²-based formula (the canonical noncentrality
    // input for powerAnova, equivalent to `effectsize::cohens_f` in R):
    //   f = sqrt(η² / (1 - η²)) = sqrt(ssB / ssW)
    // where ssB is weighted by group sizes around the *weighted* grand
    // mean. Plöttr's `fFromGroupMeans(means, sd)` global uses an
    // unweighted SD_means / SD_pooled form that's equivalent at equal n
    // but diverges by ~10 % at unequal n (e.g. ChickWeight Diet 1–4
    // post-hoc). Doing the computation inline here keeps the global
    // backward-compatible for `power-app.tsx`'s a-priori calculator
    // (which assumes equal n by design) while ensuring post-hoc
    // replication-planning matches R `effectsize::cohens_f` to FP
    // precision on real observed data.
    const grandMean = totalN > 0 ? weightedSum / totalN : 0;
    let ssB = 0;
    for (let i = 0; i < kk; i++) {
      ssB += values[i].length * (means[i] - grandMean) * (means[i] - grandMean);
    }
    const f = ssW > 0 ? Math.sqrt(ssB / ssW) : 0;
    const rows = alphas.map((alpha) => {
      let needed: number | null = null;
      if (f > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerAnova(f, n, alpha, kk) >= target) {
            needed = n;
            break;
          }
        }
      }
      return { alpha, nForTarget: needed };
    });
    return {
      effectLabel: "Cohen's f",
      effect: f,
      effectCI: null,
      rows,
      targetPower: target,
      nLabel: "per group",
      approximate: chosenTest === "kruskalWallis",
    };
  }

  return null;
}

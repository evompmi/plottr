// `computePowerFromData` — achieved power + n-needed-for-80%-power from
// observed data, dispatched per test family (t-tests / ANOVA / KW). For
// rank-based tests (Mann-Whitney / Kruskal-Wallis) we report the
// parametric analog as an approximation — flagged in the returned
// `approximate` flag.
//
// Computed at α = 0.05, 0.01, 0.001; target power = 0.80.
//
// Pre-2026-05 lived in `_shell/stats-tile.tsx`; split here so per-tool
// stats panels (lineplot/aequorin/boxplot) can import the math without
// pulling in the full StatsTile component.

declare const sampleMean: (xs: number[]) => number;
declare const sampleSD: (xs: number[]) => number;
declare const fFromGroupMeans: (means: number[], pooledSD: number) => number;
declare const powerTwoSample: (d: number, n: number, alpha: number, tails: number) => number;
declare const powerAnova: (f: number, n: number, alpha: number, k: number) => number;

export interface PowerFromDataRow {
  alpha: number;
  achieved: number;
  nForTarget: number | null;
}

export interface PowerFromDataResult {
  effectLabel: string;
  effect: number;
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
    const sp = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
    const d = sp > 0 ? Math.abs(m1 - m2) / sp : 0;
    const nh = 2 / (1 / n1 + 1 / n2);
    const nEff = Math.max(2, Math.round(nh));
    const rows = alphas.map((alpha) => {
      const achieved = powerTwoSample(d, nEff, alpha, 2);
      let needed: number | null = null;
      if (d > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerTwoSample(d, n, alpha, 2) >= target) {
            needed = n;
            break;
          }
        }
      }
      return { alpha, achieved, nForTarget: needed };
    });
    return {
      effectLabel: "Cohen's d",
      effect: d,
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
    const ns = values.map((v) => v.length);
    if (ns.some((n) => n < 2)) return null;
    let ssW = 0;
    let dfW = 0;
    for (let i = 0; i < kk; i++) {
      const m = means[i];
      for (let j = 0; j < values[i].length; j++) ssW += (values[i][j] - m) * (values[i][j] - m);
      dfW += values[i].length - 1;
    }
    const sp = dfW > 0 ? Math.sqrt(ssW / dfW) : 0;
    const f = fFromGroupMeans(means, sp);
    const nh = kk / ns.reduce((a, b) => a + 1 / b, 0);
    const nEff = Math.max(2, Math.round(nh));
    const rows = alphas.map((alpha) => {
      const achieved = powerAnova(f, nEff, alpha, kk);
      let needed: number | null = null;
      if (f > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerAnova(f, n, alpha, kk) >= target) {
            needed = n;
            break;
          }
        }
      }
      return { alpha, achieved, nForTarget: needed };
    });
    return {
      effectLabel: "Cohen's f",
      effect: f,
      rows,
      targetPower: target,
      nLabel: "per group",
      approximate: chosenTest === "kruskalWallis",
    };
  }

  return null;
}

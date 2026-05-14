// stats/posthoc.ts — studentized-range distribution, all-pairs post-hocs,
// p-adjust, compact-letter-display, and the auto test-picker (`selectTest`).
//
// Layout:
//   10. Studentized range distribution — _wprob, ptukey, qtukey
//   11. Post-hoc tests                  — Tukey HSD, Games-Howell, Dunn, BH
//   12. Compact letter display
//   13. Automatic test selection        — selectTest

import { _gaussLegendre, chi2inv, gammaln, normcdf, normsf } from "./dist";
import { formatP } from "./format";
import {
  leveneTest,
  oneWayANOVA,
  rankWithTies,
  sampleMean,
  sampleVariance,
  shapiroWilk,
} from "./tests";
import type {
  DunnPair,
  DunnResult,
  GamesHowellPair,
  GamesHowellResult,
  NormalityResult,
  SelectTestKind,
  SelectTestPostHoc,
  SelectTestResult,
  TukeyPair,
  TukeyResult,
} from "./types";

// ── 10. Studentized range distribution ─────────────────────────────────────

// P(range of k standard normals > w). Tail-accurate companion to `_wprob`.
export function _wprob_upper(w: number, k: number): number {
  if (w <= 0) return 1;
  const gl = _gaussLegendre(48);
  const peak = -w / 2;
  const lo = Math.min(-8, peak - 8);
  const hi = Math.max(8, peak + 8);
  const half = (hi - lo) / 2,
    mid = (hi + lo) / 2;
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    const phiU = invSqrt2Pi * Math.exp(-0.5 * u * u);
    const a = normsf(u);
    const aMinusB = normsf(u + w);
    if (a <= 0 || aMinusB <= 0) continue;
    const b = a - aMinusB;
    let geoSum = 0;
    let term = Math.pow(a, k - 2);
    const ratio = b / a;
    for (let j = 0; j < k - 1; j++) {
      geoSum += term;
      term *= ratio;
    }
    const integrand = k * phiU * aMinusB * geoSum;
    sum += half * gl.weights[i] * integrand;
  }
  return Math.max(0, Math.min(1, sum));
}

// P(range of k standard normals ≤ w).
export function _wprob(w: number, k: number): number {
  if (w <= 0) return 0;
  const gl = _gaussLegendre(48);
  const lo = -8,
    hi = 8;
  const half = (hi - lo) / 2,
    mid = (hi + lo) / 2;
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    const phiU = invSqrt2Pi * Math.exp(-0.5 * u * u);
    let diff: number;
    if (u >= 0) {
      diff = normsf(u) - normsf(u + w);
    } else if (u + w <= 0) {
      diff = normcdf(u + w) - normcdf(u);
    } else {
      diff = normcdf(u + w) - normcdf(u);
    }
    if (diff <= 0) continue;
    const term = k * phiU * Math.pow(diff, k - 1);
    sum += half * gl.weights[i] * term;
  }
  return Math.max(0, Math.min(1, sum));
}

// P(Q ≤ q | k groups, df error degrees of freedom)
export function ptukey(q: number, k: number, df: number): number {
  if (q <= 0) return 0;
  if (k < 2 || df < 1) return NaN;
  const gl = _gaussLegendre(48);
  const chiLo = chi2inv(1e-10, df);
  const chiHi = chi2inv(1 - 1e-10, df);
  const yLo = 0.5 * Math.log(Math.max(chiLo, 1e-300) / df);
  const yHi = 0.5 * Math.log(chiHi / df);
  const halfDf = df / 2;
  const logConst = Math.log(2) + halfDf * Math.log(halfDf) - gammaln(halfDf);
  const halfW = (yHi - yLo) / 2;
  const midW = (yHi + yLo) / 2;
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const y = midW + halfW * gl.nodes[i];
    const s = Math.exp(y);
    const logFS = logConst + df * y - (df * s * s) / 2;
    const fSds = Math.exp(logFS);
    if (!Number.isFinite(fSds) || fSds === 0) continue;
    sum += halfW * gl.weights[i] * fSds * _wprob(q * s, k);
  }
  return Math.max(0, Math.min(1, sum));
}

// P(Q > q | k groups, df error degrees of freedom).
export function ptukey_upper(q: number, k: number, df: number): number {
  if (q <= 0) return 1;
  if (k < 2 || df < 1) return NaN;
  const gl = _gaussLegendre(48);
  const chiLo = chi2inv(1e-10, df);
  const chiHi = chi2inv(1 - 1e-10, df);
  const yLo = 0.5 * Math.log(Math.max(chiLo, 1e-300) / df);
  const yHi = 0.5 * Math.log(chiHi / df);
  const halfDf = df / 2;
  const logConst = Math.log(2) + halfDf * Math.log(halfDf) - gammaln(halfDf);
  const halfW = (yHi - yLo) / 2;
  const midW = (yHi + yLo) / 2;
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const y = midW + halfW * gl.nodes[i];
    const s = Math.exp(y);
    const logFS = logConst + df * y - (df * s * s) / 2;
    const fSds = Math.exp(logFS);
    if (!Number.isFinite(fSds) || fSds === 0) continue;
    sum += halfW * gl.weights[i] * fSds * _wprob_upper(q * s, k);
  }
  return Math.max(0, Math.min(1, sum));
}

export function qtukey(p: number, k: number, df: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (k < 2 || df < 1) return NaN;
  let lo = 0.01,
    hi = 100;
  for (let i = 0; i < 20 && ptukey(hi, k, df) < p; i++) {
    lo = hi;
    hi *= 2;
  }
  if (ptukey(hi, k, df) < p) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (ptukey(mid, k, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7 * (Math.abs(lo) + 1)) break;
  }
  return (lo + hi) / 2;
}

// ── 11. Post-hoc tests ──────────────────────────────────────────────────────

export function tukeyHSD(groups: number[][], opts: { alpha?: number } = {}): TukeyResult {
  const alpha = opts.alpha != null ? opts.alpha : 0.05;
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const anova = oneWayANOVA(groups);
  if (anova.error) return { pairs: [], error: anova.error };
  const dfErr = anova.df2;
  const mse = (anova.ssWithin as number) / dfErr;
  if (mse === 0) {
    return {
      pairs: [],
      k,
      df: dfErr,
      mse,
      error: "Cannot compute Tukey HSD — zero within-group variance (data essentially constant)",
    };
  }
  const means = groups.map(sampleMean);
  const ns = groups.map((g) => g.length);
  const qCrit = qtukey(1 - alpha, k, dfErr);
  const inPathologicalEnvelope = dfErr <= 2 && 1 - alpha >= 0.95 && k >= 10;
  let qCritWarning: string | null = null;
  if (!Number.isFinite(qCrit)) {
    qCritWarning = `Tukey HSD CI bounds unavailable — qtukey(${1 - alpha}, k=${k}, df=${dfErr}) returned NaN (outside the bracket-expansion envelope). p-values are still reliable; the per-pair lwr / upr are NaN.`;
  } else if (inPathologicalEnvelope) {
    qCritWarning = `Tukey HSD CI bounds approximate — qtukey(${1 - alpha}, k=${k}, df=${dfErr}) lies in the studentized-range design envelope (df ≤ 2 with k ≥ 10 at 1−α ≥ 0.95), where the reference (R, SciPy) disagree by ~5 % with each other. p-values stay reliable; the per-pair lwr / upr are accurate to within ~5 %. Consider Games-Howell (Welch-aware, less sensitive to small df) if this matches your real data.`;
  }
  const pairs: TukeyPair[] = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const diff = means[j] - means[i];
      const se = Math.sqrt((mse * (1 / ns[i] + 1 / ns[j])) / 2);
      const q = Math.abs(diff) / se;
      const p = ptukey_upper(q, k, dfErr);
      const margin = qCrit * se;
      pairs.push({
        i,
        j,
        diff,
        se,
        q,
        p,
        lwr: diff - margin,
        upr: diff + margin,
      });
    }
  }
  const result: TukeyResult = { pairs, k, df: dfErr, mse };
  if (qCritWarning) result.warning = qCritWarning;
  return result;
}

export function gamesHowell(groups: number[][]): GamesHowellResult {
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const means = groups.map(sampleMean);
  const vars_ = groups.map(sampleVariance);
  const ns = groups.map((g) => g.length);
  if (vars_.some((v) => v === 0)) {
    return {
      pairs: [],
      k,
      error: "Cannot compute Games-Howell — at least one group has zero variance",
    };
  }
  const pairs: GamesHowellPair[] = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const vi = vars_[i] / ns[i];
      const vj = vars_[j] / ns[j];
      const se = Math.sqrt(vi + vj);
      const diff = means[j] - means[i];
      const q = Math.abs(diff) / (se / Math.SQRT2);
      const num = (vi + vj) * (vi + vj);
      const den = (vi * vi) / (ns[i] - 1) + (vj * vj) / (ns[j] - 1);
      const df = num / den;
      const p = ptukey_upper(q, k, df);
      pairs.push({ i, j, diff, se, q, df, p });
    }
  }
  return { pairs, k };
}

export function bhAdjust(ps: number[]): number[] {
  const m = ps.length;
  const order: [number, number][] = ps
    .map((p, i): [number, number] => [p, i])
    .sort((a, b) => a[0] - b[0]);
  const adj = new Array(m);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const [p, origIdx] = order[rank - 1];
    const q = (p * m) / rank;
    running = Math.min(running, q);
    adj[origIdx] = Math.min(1, running);
  }
  return adj;
}

export function dunnTest(groups: number[][]): DunnResult {
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const all: number[] = [];
  const owner: number[] = [];
  for (let i = 0; i < k; i++) {
    for (const v of groups[i]) {
      all.push(v);
      owner.push(i);
    }
  }
  const N = all.length;
  const { ranks, tieCorrection } = rankWithTies(all);
  const meanR = new Array(k).fill(0);
  const ns = groups.map((g) => g.length);
  const sumR = new Array(k).fill(0);
  for (let idx = 0; idx < N; idx++) sumR[owner[idx]] += ranks[idx];
  for (let i = 0; i < k; i++) meanR[i] = sumR[i] / ns[i];
  const sigma2 = (N * (N + 1)) / 12 - tieCorrection / (12 * (N - 1));
  const rawPs: number[] = [];
  const pairs: DunnPair[] = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const se = Math.sqrt(sigma2 * (1 / ns[i] + 1 / ns[j]));
      const z = (meanR[i] - meanR[j]) / se;
      const p = 2 * normsf(Math.abs(z));
      pairs.push({ i, j, z, p });
      rawPs.push(p);
    }
  }
  const adj = bhAdjust(rawPs);
  for (let i = 0; i < pairs.length; i++) pairs[i].pAdj = adj[i];
  return { pairs, method: "Benjamini-Hochberg" };
}

// ── 12. Compact letter display ──────────────────────────────────────────────

export function compactLetterDisplay(
  pairs: { i: number; j: number; p: number; pAdj?: number | null }[],
  k: number,
  alpha = 0.05
): string[] {
  if (k <= 0) return [];
  let letters: Set<number>[] = [new Set(Array.from({ length: k }, (_, i) => i))];
  for (const pr of pairs) {
    const p = pr.pAdj != null ? pr.pAdj : pr.p;
    if (!Number.isFinite(p) || p >= alpha) continue;
    const { i, j } = pr;
    const newLetters: Set<number>[] = [];
    for (const L of letters) {
      if (L.has(i) && L.has(j)) {
        const L1 = new Set(L);
        L1.delete(i);
        const L2 = new Set(L);
        L2.delete(j);
        if (L1.size > 0) newLetters.push(L1);
        if (L2.size > 0) newLetters.push(L2);
      } else {
        newLetters.push(L);
      }
    }
    const filtered: Set<number>[] = [];
    for (const L of newLetters) {
      let absorbed = false;
      for (const M of newLetters) {
        if (L === M) continue;
        if (L.size < M.size) {
          let sub = true;
          for (const v of L) {
            if (!M.has(v)) {
              sub = false;
              break;
            }
          }
          if (sub) {
            absorbed = true;
            break;
          }
        }
      }
      if (!absorbed && !filtered.some((F) => F.size === L.size && [...F].every((v) => L.has(v)))) {
        filtered.push(L);
      }
    }
    letters = filtered;
  }
  letters.sort((A, B) => Math.min(...A) - Math.min(...B));
  const labels = "abcdefghijklmnopqrstuvwxyz";
  const out: string[] = Array.from({ length: k }, () => "");
  for (let li = 0; li < letters.length; li++) {
    const lbl = labels[li] || `[${li}]`;
    for (const g of letters[li]) out[g] += lbl;
  }
  return out;
}

// ── 13. Automatic test selection ────────────────────────────────────────────

export function selectTest(
  groups: number[][],
  opts: { alphaNormality?: number; alphaVariance?: number } = {}
): SelectTestResult {
  const alphaN = opts.alphaNormality != null ? opts.alphaNormality : 0.05;
  const alphaV = opts.alphaVariance != null ? opts.alphaVariance : 0.05;
  const k = groups.length;
  if (k < 2) {
    return { error: "≥2 groups required", k };
  }

  const normality: NormalityResult[] = groups.map((g, i) => {
    if (g.length < 3) {
      return { group: i, n: g.length, W: null, p: null, normal: null, note: "n<3" };
    }
    const sw = shapiroWilk(g);
    if (sw.error) {
      return { group: i, n: g.length, W: null, p: null, normal: null, note: sw.error };
    }
    return { group: i, n: g.length, W: sw.W, p: sw.p, normal: sw.p >= alphaN };
  });
  const allKnownNormal = normality.every((r) => r.normal === true);
  const flagged = normality.filter((r) => r.normal === false);
  const anyFlagged = flagged.length > 0;

  const lev = leveneTest(groups);
  const equalVar = lev.error ? null : lev.p >= alphaV;

  const test: SelectTestKind = k === 2 ? "welchT" : "welchANOVA";
  const postHoc: SelectTestPostHoc = k === 2 ? null : "gamesHowell";

  const baseDefault =
    k === 2
      ? "Default pick: Welch's t-test. Welch's t is the recommended default for two independent groups (Rasch, Kubinger & Moder 2011; Zimmerman 2004) — it does not assume equal variances and matches Student's t closely when variances are in fact equal."
      : "Default pick: Welch's ANOVA with Games-Howell post-hoc. Welch's ANOVA is the recommended default for k ≥ 3 independent groups (Delacre et al. 2019; Rasch et al. 2011) — it does not assume equal variances across groups and matches one-way ANOVA closely when variances are in fact equal.";

  const swNarrative = ((): string => {
    if (flagged.length === 0 && allKnownNormal) {
      return "Shapiro-Wilk did not reject normality in any group at α = " + alphaN + ".";
    }
    if (flagged.length > 0) {
      const labels = flagged
        .map((r) => `group ${r.group + 1} (W=${(r.W as number).toFixed(3)}, p=${formatP(r.p)})`)
        .join(", ");
      return `Shapiro-Wilk flagged ${flagged.length} of ${k} group(s) as non-normal at α = ${alphaN}: ${labels}.`;
    }
    return "Shapiro-Wilk could not run on every group (n < 3 in at least one).";
  })();

  const levNarrative = lev.error
    ? `Levene (Brown-Forsythe) could not run: ${lev.error}.`
    : equalVar === false
      ? `Levene (Brown-Forsythe) rejected equal variances (F=${lev.F.toFixed(3)}, p=${formatP(lev.p)}); Welch handles this without further intervention.`
      : `Levene (Brown-Forsythe) did not reject equal variances (F=${lev.F.toFixed(3)}, p=${formatP(lev.p)}); Welch is still the safe default and matches the equal-variance test closely here.`;

  let suggestion: SelectTestResult["suggestion"];
  let suggestionNarrative = "";
  if (anyFlagged) {
    suggestion = {
      test: k === 2 ? "mannWhitney" : "kruskalWallis",
      postHoc: k === 2 ? null : "dunn",
      reason:
        "Shapiro-Wilk flagged at least one group as non-normal. Plöttr keeps Welch as the default (pre-screening with SW is a known anti-pattern) but a rank-based test may be more appropriate for genuinely heavy-tailed data.",
    };
    suggestionNarrative = ` If the non-normality looks substantive (heavy tails, strong skew, ordinal data), consider switching to ${suggestion.test === "mannWhitney" ? "Mann-Whitney U" : "Kruskal-Wallis + Dunn (BH)"} from the test dropdown.`;
  }

  const overrideHint =
    " You can override this pick from the stats panel's per-test dropdown; the trace below shows the diagnostics the recommendation is based on.";

  const reason = `${baseDefault} ${swNarrative} ${levNarrative}${suggestionNarrative}${overrideHint}`;

  const out: SelectTestResult = {
    k,
    normality,
    allNormal: allKnownNormal,
    levene: lev.error
      ? { error: lev.error }
      : { F: lev.F, df1: lev.df1, df2: lev.df2, p: lev.p, equalVar },
    recommendation: { test, postHoc, reason },
  };
  if (suggestion) out.suggestion = suggestion;
  return out;
}

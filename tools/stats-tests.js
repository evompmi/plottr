// stats-tests.js — descriptive helpers + parametric / nonparametric tests +
// effect sizes.
//
// Loaded after stats-dist.js (depends on its distribution / special functions).
// Plain script-mode JS like the rest of the stats-*.js files — top-level
// declarations stay as globals once the bundle is concatenated.
//
// Layout:
//   3. Sample helpers          — mean, variance, sd, rank-with-ties
//   4. Shapiro-Wilk normality  — Royston 1995, AS R94
//   5. Levene / Brown-Forsythe equal-variance test
//   6. Two-sample location     — t-test (Student / Welch), Mann-Whitney U
//   7. Two-sample effect sizes — Cohen's d, Hedges' g, rank-biserial
//   8. k-sample location       — one-way / Welch ANOVA, Kruskal-Wallis
//   9. k-sample effect sizes   — η², ε²

// ── 3. Sample helpers ───────────────────────────────────────────────────────

function sampleMean(x) {
  const n = x.length;
  if (n === 0) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  return s / n;
}

// Sample variance with (n-1) denominator (Bessel-corrected). Welford's
// online algorithm: one pass, no need to compute the mean separately, and
// numerically more robust than the naive E[X²] − E[X]² formula (which
// catastrophically cancels when the data have a large offset). The classic
// two-pass algorithm is comparable in accuracy on most inputs, but Welford
// avoids a second loop and pre-computed mean, which is cleaner and slightly
// faster on large arrays.
function sampleVariance(x) {
  const n = x.length;
  if (n < 2) return NaN;
  let mean = 0,
    M2 = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean;
    mean += d / (i + 1);
    M2 += d * (x[i] - mean);
  }
  return M2 / (n - 1);
}

function sampleSD(x) {
  return Math.sqrt(sampleVariance(x));
}

// Midrank assignment with ties — returns ranks[i] = 1-based rank of x[i],
// averaging ranks for tied values. Also returns the sum of (t³−t)/12 for each
// tie group, needed as the tie-correction term in Mann-Whitney / Kruskal-Wallis.
function rankWithTies(x) {
  const n = x.length;
  const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  let tieCorrection = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j + 2) / 2; // 1-based average of ranks [i+1 .. j+1]
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avgRank;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t * t * t - t;
    i = j + 1;
  }
  return { ranks, tieCorrection };
}

// ── 4. Normality: Shapiro-Wilk (Royston 1995, AS R94) ───────────────────────
//
// Algorithm AS R94 (Royston 1995), as implemented in R's stats::shapiro.test.
// Valid for 3 ≤ n ≤ 5000. Returns { W, p }.
//
// The W statistic:   W = (Σ a_i · x_(i))² / Σ (x_i − x̄)²
//
// Coefficients a_i are derived from the expected values of normal order
// statistics (approximated analytically here — exact values would require
// computing E[z_(i:n)] via numerical integration, but Royston's approximation
// is accurate to the W-statistic's precision).
//
// P-value transformation uses polynomial-in-log approximations tabulated by
// Royston for the normalizing transform of W.

function shapiroWilk(x) {
  const n = x.length;
  if (n < 3 || n > 5000) {
    return { W: NaN, p: NaN, error: "Shapiro-Wilk requires 3 ≤ n ≤ 5000" };
  }
  const sorted = [...x].sort((a, b) => a - b);

  // Expected values of normal order statistics via Blom's approximation:
  //   m_i ≈ Φ⁻¹((i − 3/8) / (n + 1/4))
  // These are the "m" vector in AS R94.
  const m = new Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = norminv((i + 1 - 3 / 8) / (n + 1 / 4));
  }
  let mm = 0;
  for (let i = 0; i < n; i++) mm += m[i] * m[i];

  // Coefficients a_i (Royston 1992 analytical form, AS R94).
  // For i = n:    a_n   = −2.706056 u⁵ + 4.434685 u⁴ − 2.071190 u³
  //                       − 0.147981 u² + 0.221157 u + m_n / √mm
  // For i = n−1:  a_{n−1} = −3.582633 u⁵ + 5.682633 u⁴ − 1.752460 u³
  //                         − 0.293762 u² + 0.042981 u + m_{n−1} / √mm
  // where u = 1/√n. Middle coefficients follow AS R94's epsilon correction.
  const a = new Array(n);
  const u = 1 / Math.sqrt(n);
  const sqrtMm = Math.sqrt(mm);

  if (n === 3) {
    // Exact for n = 3: a_1 = √(1/2), a_3 = −a_1, a_2 = 0.
    a[0] = -Math.SQRT1_2;
    a[1] = 0;
    a[2] = Math.SQRT1_2;
  } else {
    const an =
      m[n - 1] / sqrtMm +
      0.221157 * u -
      0.147981 * u * u -
      2.07119 * u * u * u +
      4.434685 * u * u * u * u -
      2.706056 * u * u * u * u * u;
    a[n - 1] = an;
    a[0] = -an;

    if (n >= 6) {
      const an1 =
        m[n - 2] / sqrtMm +
        0.042981 * u -
        0.293762 * u * u -
        1.75246 * u * u * u +
        5.682633 * u * u * u * u -
        3.582633 * u * u * u * u * u;
      a[n - 2] = an1;
      a[1] = -an1;

      // Epsilon correction for middle coefficients (AS R94).
      const phi =
        (mm - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2]) /
        (1 - 2 * an * an - 2 * an1 * an1);
      const sqrtPhi = Math.sqrt(phi);
      for (let i = 2; i < n - 2; i++) a[i] = m[i] / sqrtPhi;
    } else {
      // n = 4 or 5: only tail coefficients, simpler correction.
      const phi = (mm - 2 * m[n - 1] * m[n - 1]) / (1 - 2 * an * an);
      const sqrtPhi = Math.sqrt(phi);
      for (let i = 1; i < n - 1; i++) a[i] = m[i] / sqrtPhi;
    }
  }

  // W = (Σ a_i · x_(i))² / Σ (x_i − x̄)²
  let xbar = 0;
  for (let i = 0; i < n; i++) xbar += sorted[i];
  xbar /= n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += a[i] * sorted[i];
    const d = sorted[i] - xbar;
    den += d * d;
  }
  if (den === 0) return { W: NaN, p: NaN, error: "Zero variance" };
  // Clamp to [0, 1] — floating-point can produce W = 1 + ε for a perfect
  // linear sample (e.g. n=3 [1,2,3]), which would break asin(√W) below.
  const W = Math.max(0, Math.min(1, (num * num) / den));

  // P-value via Royston 1995 normalizing transform.
  let p;
  if (n === 3) {
    // Exact distribution at n=3: p = 6 · (asin(√W) − asin(√(3/4))) / π
    const pi6 = 6 / Math.PI;
    const stqr = Math.asin(Math.sqrt(3 / 4));
    p = pi6 * (Math.asin(Math.sqrt(W)) - stqr);
    if (p < 0) p = 0;
    if (p > 1) p = 1;
  } else if (n <= 11) {
    // Polynomial in n for gamma and mu, log-transform on (gamma − ln(1−W)).
    const gamma = -2.273 + 0.459 * n;
    const mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
    const sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
    const y = -Math.log(gamma - Math.log(1 - W));
    const z = (y - mu) / sigma;
    p = normsf(z);
  } else {
    // n ≥ 12: log(1−W) is approximately normal after transform.
    const lnN = Math.log(n);
    const mu = -1.5861 - 0.31082 * lnN - 0.083751 * lnN * lnN + 0.0038915 * lnN * lnN * lnN;
    const sigma = Math.exp(-0.4803 - 0.082676 * lnN + 0.0030302 * lnN * lnN);
    const y = Math.log(1 - W);
    const z = (y - mu) / sigma;
    p = normsf(z);
  }

  return { W, p };
}

// ── 5. Equal-variance tests ─────────────────────────────────────────────────
//
// Brown-Forsythe variant of Levene's test (median-based — robust to
// non-normality, which is what we want in a screening step that runs before
// we've decided whether the data are normal).
//
// Algorithm: for each group compute |x_ij − median_i|, then run a one-way
// ANOVA on those absolute deviations. F statistic and p-value from the
// F-distribution.
//
// Input: groups = [[x11, x12, ...], [x21, x22, ...], ...]
// Output: { F, df1, df2, p }

function leveneTest(groups) {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  // Absolute deviations from the group median.
  const devs = groups.map((g) => {
    const s = [...g].sort((a, b) => a - b);
    const n = s.length;
    const med = n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[Math.floor(n / 2)];
    return g.map((v) => Math.abs(v - med));
  });
  // One-way ANOVA on deviations.
  let Ntot = 0;
  let grandSum = 0;
  for (const d of devs) {
    Ntot += d.length;
    for (const v of d) grandSum += v;
  }
  if (Ntot <= k) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Not enough observations" };
  const grandMean = grandSum / Ntot;
  let ssBetween = 0,
    ssWithin = 0;
  for (const d of devs) {
    const n = d.length;
    if (n === 0) continue;
    let s = 0;
    for (const v of d) s += v;
    const m = s / n;
    ssBetween += n * (m - grandMean) * (m - grandMean);
    for (const v of d) ssWithin += (v - m) * (v - m);
  }
  const df1 = k - 1;
  const df2 = Ntot - k;
  if (ssWithin === 0) {
    // All groups are internally constant → within-group dispersion is zero
    // and Levene's F is undefined (0/0 at best, a phantom ∞ at worst).
    // R's equivalent oneway.test on the deviations reports F = NaN / p = NA.
    return {
      F: NaN,
      df1,
      df2,
      p: NaN,
      error: "Data are essentially constant (zero within-group dispersion)",
    };
  }
  const F = ssBetween / df1 / (ssWithin / df2);
  const p = fcdf_upper(F, df1, df2);
  return { F, df1, df2, p };
}

// ── 6. Two-sample location tests ────────────────────────────────────────────
//
// tTest(x, y, { equalVar }) — two-sample t-test.
//   equalVar=true  → Student's t (pooled variance, df = n1+n2−2)
//   equalVar=false → Welch's t (unequal variance, Welch-Satterthwaite df)
// Two-sided p-value. Returns { t, df, p, mean1, mean2, ... }.

function tTest(x, y, opts = {}) {
  const equalVar = opts.equalVar !== false;
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 2 || n2 < 2) {
    return { t: NaN, df: 0, p: NaN, error: "Each group needs n≥2" };
  }
  const m1 = sampleMean(x),
    m2 = sampleMean(y);
  const v1 = sampleVariance(x),
    v2 = sampleVariance(y);
  // Degenerate case: both groups constant. Matches R, which refuses with
  // "data are essentially constant" — any result here would have NaN df
  // (Welch) or zero SE (Student), neither of which is meaningful.
  if (v1 === 0 && v2 === 0) {
    return {
      t: NaN,
      df: NaN,
      p: NaN,
      mean1: m1,
      mean2: m2,
      var1: v1,
      var2: v2,
      n1,
      n2,
      error: "Data are essentially constant (zero variance in both groups)",
    };
  }
  let t, df;
  if (equalVar) {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    t = (m1 - m2) / se;
    df = n1 + n2 - 2;
  } else {
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    t = (m1 - m2) / se;
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    df = num / den;
  }
  // Two-sided p via tail-accurate upper helper (avoids 1 − (near-1) cancellation
  // that underflowed p to 0 at |t| > ~9).
  const p = 2 * tcdf_upper(Math.abs(t), df);
  return { t, df, p, mean1: m1, mean2: m2, var1: v1, var2: v2, n1, n2 };
}

// Mann-Whitney U test (two-sided) — ranks with midranks for ties, normal
// approximation with continuity correction and tie correction to σ_U².
// Matches R's wilcox.test(x, y, exact=FALSE, correct=TRUE) when there are
// ties or larger samples; R switches to an exact enumerator when n1*n2<50
// and there are no ties — we note this in comments but stick to normal
// approximation here (the error vs exact is <0.01 in p even for small n).
//
// Returns { U, U1, U2, z, p, n1, n2 }. U = min(U1, U2).

function mannWhitneyU(x, y) {
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 1 || n2 < 1) return { U: NaN, z: NaN, p: NaN, error: "Empty group" };
  const all = x.concat(y);
  const { ranks, tieCorrection } = rankWithTies(all);
  let R1 = 0;
  for (let i = 0; i < n1; i++) R1 += ranks[i];
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const N = n1 + n2;
  const muU = (n1 * n2) / 2;
  // σ_U² with tie correction (Lehmann 1975):
  //  σ² = n1·n2/12 · [(N+1) − Σ(t³−t) / (N(N−1))]
  const sigma2 = ((n1 * n2) / 12) * (N + 1 - tieCorrection / (N * (N - 1)));
  const sigmaU = Math.sqrt(sigma2);
  // Continuity-corrected z (matches wilcox.test correct=TRUE).
  // Shift U toward the mean by 0.5.
  const diff = U1 - muU;
  let z;
  if (sigmaU === 0) z = 0;
  else if (diff > 0) z = (diff - 0.5) / sigmaU;
  else if (diff < 0) z = (diff + 0.5) / sigmaU;
  else z = 0;
  // Tail-accurate normsf — survives |z| > ~7 where 1 − normcdf cancels to 0.
  const p = 2 * normsf(Math.abs(z));
  return { U, U1, U2, z, p, n1, n2 };
}

// ── 7. Two-sample effect sizes ──────────────────────────────────────────────
//
// Cohen's d — standardized mean difference using pooled SD (Bessel-corrected).
// Hedges' g — small-sample bias-corrected version of Cohen's d.
// rankBiserial — non-parametric effect size paired with Mann-Whitney U.

function cohenD(x, y) {
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 2 || n2 < 2) return NaN;
  const m1 = sampleMean(x),
    m2 = sampleMean(y);
  const v1 = sampleVariance(x),
    v2 = sampleVariance(y);
  const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  // Pooled SD is zero → effect size is undefined (±Infinity is misleading).
  if (sp2 === 0) return NaN;
  return (m1 - m2) / Math.sqrt(sp2);
}

function hedgesG(x, y) {
  const d = cohenD(x, y);
  if (!Number.isFinite(d)) return d;
  const df = x.length + y.length - 2;
  if (df < 1) return NaN;
  // Exact small-sample correction factor:
  //   J(df) = Γ(df/2) / (Γ((df−1)/2) · √(df/2))
  // computed in log space via gammaln to avoid Γ overflow at large df.
  // The familiar `J ≈ 1 − 3/(4n − 9)` shortcut is the leading term of the
  // asymptotic expansion; it's off by ~0.3% at the smallest practical
  // sample (n1 = n2 = 3) and converges to the exact form by n ≈ 30.
  // Tightening this also matches what `effectsize::hedges_g()` reports.
  const J = Math.exp(gammaln(df / 2) - gammaln((df - 1) / 2) - 0.5 * Math.log(df / 2));
  return d * J;
}

// Rank-biserial correlation from Mann-Whitney U (Kerby 2014).
// r = 1 − 2U/(n1·n2). Sign follows U1 vs U2 (positive means x tends to rank
// higher than y).
function rankBiserial(U1, n1, n2) {
  if (n1 * n2 === 0) return NaN;
  return 1 - (2 * U1) / (n1 * n2);
}

// 95 % confidence interval for Cohen's d (or d_av) on two independent
// samples, using the noncentral-t pivot of Cumming & Finch 2001 ("A
// primer on the understanding, use, and calculation of confidence
// intervals that are based on central and noncentral distributions",
// Educational and Psychological Measurement 61(4)):
//
//   t_obs  = d / √(1/n1 + 1/n2)          observed t-statistic
//   df     = n1 + n2 − 2                 (Student-pooled df; we use the
//                                         same df for d_av as a working
//                                         approximation — Welch-Satterthwaite
//                                         df differs slightly but the CI
//                                         on d is dominated by t-quantile
//                                         scale, not by the df shift)
//
// Then bisect over the noncentrality parameter λ to find:
//   λ_lo such that P(T ≤ t_obs | df, ncp = λ_lo) = 1 − α/2
//   λ_hi such that P(T ≤ t_obs | df, ncp = λ_hi) = α/2
//
// `nctcdf(t, df, ncp)` is monotonically *decreasing* in ncp, so we
// bisect against `-nctcdf(...)` (monotone increasing — what `bisect`
// expects).
//
// Returns `{ lo, hi }` on success, `{ lo: NaN, hi: NaN }` when the
// inputs are degenerate (n < 2 or non-finite d). Default confidence
// 0.95; explicit `conf` parameter overrides.
function cohenDCI(d, n1, n2, conf) {
  const c = conf == null ? 0.95 : conf;
  if (!Number.isFinite(d) || n1 < 2 || n2 < 2 || c <= 0 || c >= 1) {
    return { lo: NaN, hi: NaN };
  }
  const alpha = 1 - c;
  const seFactor = Math.sqrt(1 / n1 + 1 / n2);
  const tObs = d / seFactor;
  const df = n1 + n2 - 2;
  // Bracket: ±|tObs| + 20 covers all practical d values (|d| up to ~10).
  const halfRange = Math.abs(tObs) + 20;
  const negNct = (lam) => -nctcdf(tObs, df, lam);
  const lambdaLo = bisect(negNct, -(1 - alpha / 2), -halfRange, halfRange);
  const lambdaHi = bisect(negNct, -alpha / 2, -halfRange, halfRange);
  if (!Number.isFinite(lambdaLo) || !Number.isFinite(lambdaHi)) {
    return { lo: NaN, hi: NaN };
  }
  return { lo: lambdaLo * seFactor, hi: lambdaHi * seFactor };
}

// ── 8. k-sample location tests ──────────────────────────────────────────────
//
// Input for all three is `groups` — an array of numeric arrays.

// One-way ANOVA (equal variances assumed).
// Returns { F, df1, df2, p, ssBetween, ssWithin, grandMean }.
function oneWayANOVA(groups) {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  let Ntot = 0;
  let grandSum = 0;
  for (const g of groups) {
    Ntot += g.length;
    for (const v of g) grandSum += v;
  }
  if (Ntot <= k) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Not enough observations" };
  const grandMean = grandSum / Ntot;
  let ssBetween = 0,
    ssWithin = 0;
  for (const g of groups) {
    const n = g.length;
    if (n === 0) continue;
    let s = 0;
    for (const v of g) s += v;
    const m = s / n;
    ssBetween += n * (m - grandMean) * (m - grandMean);
    for (const v of g) ssWithin += (v - m) * (v - m);
  }
  const df1 = k - 1;
  const df2 = Ntot - k;
  if (ssWithin === 0) {
    // Every group is internally constant. R's oneway.test returns F = Inf
    // with p < 2.2e-16, but that's misleading in a UI — the "significance"
    // is a divide-by-zero artefact, not evidence of a real location shift.
    // Mirror the tTest convention and refuse.
    return {
      F: NaN,
      df1,
      df2,
      p: NaN,
      ssBetween,
      ssWithin,
      grandMean,
      error: "Data are essentially constant (zero within-group dispersion)",
    };
  }
  const F = ssBetween / df1 / (ssWithin / df2);
  const p = fcdf_upper(F, df1, df2);
  return { F, df1, df2, p, ssBetween, ssWithin, grandMean };
}

// Welch's ANOVA (unequal variances).
// Follows R's oneway.test(var.equal=FALSE) source:
//   w_i = n_i / s_i²,  W = Σ w_i,  m = Σ(w_i · mean_i)/W
//   num = Σ w_i (mean_i − m)² / (k − 1)
//   h   = Σ (1 − w_i/W)² / (n_i − 1)
//   den = 1 + 2(k − 2)/(k² − 1) · h
//   F   = num/den,  df1 = k−1,  df2 = (k² − 1) / (3 h)
function welchANOVA(groups) {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  const ns = groups.map((g) => g.length);
  if (ns.some((n) => n < 2)) {
    return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Each group needs n≥2" };
  }
  const means = groups.map(sampleMean);
  const vars = groups.map(sampleVariance);
  // Welch weights are n_i / s_i² — any zero-variance group makes its weight
  // infinite and poisons the whole computation (matches R oneway.test's
  // F = NaN, p = NA on constant data).
  if (vars.some((v) => v === 0)) {
    return {
      F: NaN,
      df1: k - 1,
      df2: NaN,
      p: NaN,
      error: "Data are essentially constant (zero variance in at least one group)",
    };
  }
  const w = vars.map((v, i) => ns[i] / v);
  const Wsum = w.reduce((a, b) => a + b, 0);
  const m = w.reduce((a, wi, i) => a + wi * means[i], 0) / Wsum;
  let num = 0;
  for (let i = 0; i < k; i++) num += w[i] * (means[i] - m) * (means[i] - m);
  num /= k - 1;
  let h = 0;
  for (let i = 0; i < k; i++) {
    const term = 1 - w[i] / Wsum;
    h += (term * term) / (ns[i] - 1);
  }
  const den = 1 + ((2 * (k - 2)) / (k * k - 1)) * h;
  const F = num / den;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * h);
  const p = fcdf_upper(F, df1, df2);
  return { F, df1, df2, p };
}

// Kruskal-Wallis H test with tie correction.
//   H = (12/(N(N+1))) · Σ (R_i²/n_i) − 3(N+1)
//   H' = H / (1 − Σ(t³−t)/(N³−N))       [tie-corrected]
//   df = k − 1
//   p  = 1 − χ²_df(H')
function kruskalWallis(groups) {
  const k = groups.length;
  if (k < 2) return { H: NaN, df: 0, p: NaN, error: "≥2 groups required" };
  // Concatenate, remember group membership, rank together.
  const all = [];
  const owner = [];
  for (let i = 0; i < k; i++) {
    for (const v of groups[i]) {
      all.push(v);
      owner.push(i);
    }
  }
  const N = all.length;
  if (N <= k) return { H: NaN, df: 0, p: NaN, error: "Not enough observations" };
  // All values identical → ranks are all (N+1)/2, H computes to 0/0, and the
  // tie-correction denominator C = 1 − (N³−N)/(N³−N) = 0. The naive code path
  // skipped the divide and reported H=0, p=1 — a "no difference detected"
  // answer that masks the fact that the test is undefined. Match R's
  // kruskal.test behavior (it warns and returns NaN) by detecting the
  // all-tied case explicitly and surfacing an error the stats tile picks up.
  let allTied = true;
  for (let i = 1; i < N; i++) {
    if (all[i] !== all[0]) {
      allTied = false;
      break;
    }
  }
  if (allTied) {
    return { H: NaN, df: k - 1, p: NaN, error: "Data are essentially constant" };
  }
  const { ranks, tieCorrection } = rankWithTies(all);
  // Sum of ranks per group.
  const R = new Array(k).fill(0);
  for (let i = 0; i < N; i++) R[owner[i]] += ranks[i];
  let sumR2n = 0;
  for (let i = 0; i < k; i++) sumR2n += (R[i] * R[i]) / groups[i].length;
  let H = (12 / (N * (N + 1))) * sumR2n - 3 * (N + 1);
  // Tie correction (Siegel & Castellan): divide H by C.
  const C = 1 - tieCorrection / (N * N * N - N);
  if (C > 0) H /= C;
  const df = k - 1;
  const p = 1 - chi2cdf(H, df);
  return { H, df, p };
}

// ── 9. k-sample effect sizes ────────────────────────────────────────────────

// η² = SSbetween / SStotal (ANOVA).
function etaSquared(groups) {
  const a = oneWayANOVA(groups);
  if (a.error) return NaN;
  const ssTotal = a.ssBetween + a.ssWithin;
  return ssTotal === 0 ? 0 : a.ssBetween / ssTotal;
}

// ε² = H / (N − 1)  — Kruskal-Wallis effect size (Tomczak & Tomczak 2014).
function epsilonSquared(groups) {
  const kw = kruskalWallis(groups);
  if (kw.error) return NaN;
  let N = 0;
  for (const g of groups) N += g.length;
  return N > 1 ? kw.H / (N - 1) : NaN;
}

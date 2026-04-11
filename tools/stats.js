// stats.js — statistical distribution functions and tests.
//
// Loaded as a plain <script> tag in tool HTML (like shared.js /
// shared-components.js); exposes everything as globals. Tools and tests
// consume these names without imports.
//
// Layout:
//   1. Distribution functions       — normal, gamma, beta, t, F, chi-square,
//                                     noncentral t/F/chi-square
//   2. Generic helpers              — bisect
//   3. Sample helpers               — mean, variance, sd (sample), rank-with-ties
//   4. Normality tests              — Shapiro-Wilk (Royston 1995, AS R94)
//
// All new functions are benchmarked against R output in tests/stats.test.js
// with the same ±0.5% tolerance bar used for the power tool.

// ── 1. Distribution functions ───────────────────────────────────────────────

// Normal CDF — Abramowitz & Stegun 26.2.17 (max error 7.5e-8)
function normcdf(x) {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327; // 1/sqrt(2*pi)
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * Math.exp(-0.5 * x * x) * poly;
  return x > 0 ? p : 1 - p;
}

// Inverse normal CDF — Peter Acklam's rational approximation (max error 1.15e-9)
function norminv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425,
    pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

// Log gamma — Lanczos approximation
function gammaln(x) {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized incomplete beta function I_x(a, b) via continued fraction
function betai(a, b, x) {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lnBeta = gammaln(a) + gammaln(b) - gammaln(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(a, b, x)) / a;
  }
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}

// Continued fraction for incomplete beta (Lentz's method)
function betacf(a, b, x) {
  const maxIter = 200,
    eps = 3e-14;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

// Regularized incomplete gamma function P(a, x) — series expansion
function gammainc(a, x) {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x > a + 1) return 1 - gammainc_upper(a, x);
  let sum = 1 / a,
    term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 3e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

// Upper regularized incomplete gamma Q(a,x) = 1 - P(a,x) via continued fraction
function gammainc_upper(a, x) {
  let f = x + 1 - a,
    c = 1 / 1e-30,
    d = 1 / f,
    h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    const bn = x + 2 * i + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

// t-distribution CDF
function tcdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? 1 - p : p;
}

// Inverse t CDF (bisection)
function tinv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -50,
    hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tcdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

// F-distribution CDF
function fcdf(f, d1, d2) {
  if (f <= 0) return 0;
  return betai(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2));
}

// Chi-square CDF
function chi2cdf(x, k) {
  if (x <= 0) return 0;
  return gammainc(k / 2, x / 2);
}

// Inverse chi-square CDF (bisection)
function chi2inv(p, k) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0,
    hi = k + 10 * Math.sqrt(2 * k);
  while (chi2cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chi2cdf(mid, k) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

// Gauss-Legendre quadrature nodes and weights (computed once, cached)
let _glCache;
function _gaussLegendre(n) {
  if (_glCache && _glCache.n === n) return _glCache;
  const nodes = new Array(n),
    weights = new Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      let pm1 = 1,
        p = x;
      for (let j = 2; j <= n; j++) {
        const pp = ((2 * j - 1) * x * p - (j - 1) * pm1) / j;
        pm1 = p;
        p = pp;
      }
      const dp = (n * (x * p - pm1)) / (x * x - 1);
      const dx = p / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    let pm1 = 1,
      p = x;
    for (let j = 2; j <= n; j++) {
      const pp = ((2 * j - 1) * x * p - (j - 1) * pm1) / j;
      pm1 = p;
      p = pp;
    }
    const dp = (n * (x * p - pm1)) / (x * x - 1);
    const w = 2 / ((1 - x * x) * dp * dp);
    nodes[i] = -x;
    nodes[n - 1 - i] = x;
    weights[i] = w;
    weights[n - 1 - i] = w;
  }
  return (_glCache = { nodes, weights, n });
}

// Noncentral t CDF — Gauss-Legendre quadrature of chi-square mixture.
// P(T ≤ t | ν, δ) = ∫₀^∞ Φ(t√(s/ν) − δ) · f_χ²(s; ν) ds
// Substitution u = √s removes density singularity for small ν, giving:
// = ∫₀^∞ Φ(tu/√ν − δ) · 2u^{ν−1} e^{−u²/2} / (2^{ν/2} Γ(ν/2)) du
function nctcdf(t, df, delta) {
  if (Math.abs(delta) < 1e-14) return tcdf(t, df);
  const halfDf = df / 2;
  const logC = halfDf * Math.log(2) + gammaln(halfDf);
  const sqrtDf = Math.sqrt(df);
  const uLo = Math.max(0, sqrtDf - 8);
  const uHi = sqrtDf + 8;
  const gl = _gaussLegendre(48);
  const half = (uHi - uLo) / 2,
    mid = (uHi + uLo) / 2;
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    if (u <= 0) continue;
    const logH = Math.log(2) + (df - 1) * Math.log(u) - (u * u) / 2 - logC;
    sum += half * gl.weights[i] * normcdf((t * u) / sqrtDf - delta) * Math.exp(logH);
  }
  return Math.max(0, Math.min(1, sum));
}

// Noncentral F survival P(F' > f) — Poisson mixture
// F' = (χ²_{d1+2J}/d1) / (χ²_{d2}/d2), J~Poisson(λ/2)
// P(F'>f) = Σ_j P(J=j) × P(F(d1+2j, d2) > f × d1/(d1+2j))
// Starts at Poisson mode to avoid underflow for large λ.
function ncf_sf(f, d1, d2, lambda) {
  if (f <= 0) return 1;
  if (lambda <= 0) return 1 - fcdf(f, d1, d2);
  const halfLam = lambda / 2;
  const jMode = Math.max(0, Math.floor(halfLam));

  function sfTerm(j) {
    const d1j = d1 + 2 * j;
    return 1 - fcdf((f * d1) / d1j, d1j, d2);
  }

  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * sfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + 500; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * sfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && contrib < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * sfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && contrib < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// Noncentral chi-square CDF — Poisson mixture (starts at mode to avoid underflow)
function ncchi2cdf(x, k, lambda) {
  if (x <= 0) return 0;
  if (lambda <= 0) return chi2cdf(x, k);
  const halfLam = lambda / 2;
  const jMode = Math.max(0, Math.floor(halfLam));

  function cdfTerm(j) {
    return gammainc(k / 2 + j, x / 2);
  }

  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * cdfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + 500; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * cdfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && contrib < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * cdfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && contrib < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// ── 2. Generic helpers ──────────────────────────────────────────────────────

// Generic bisection solver: find x in [lo, hi] such that fn(x) ≈ target
function bisect(fn, target, lo, hi, tol = 1e-6, maxIter = 200) {
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}

// ── 3. Sample helpers ───────────────────────────────────────────────────────

function sampleMean(x) {
  const n = x.length;
  if (n === 0) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  return s / n;
}

// Sample variance with (n-1) denominator (Bessel-corrected)
function sampleVariance(x) {
  const n = x.length;
  if (n < 2) return NaN;
  const m = sampleMean(x);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - m;
    s += d * d;
  }
  return s / (n - 1);
}

function sampleSD(x) {
  return Math.sqrt(sampleVariance(x));
}

// Midrank assignment with ties — returns ranks[i] = 1-based rank of x[i],
// averaging ranks for tied values. Also returns the sum of (t³−t)/12 for each
// tie group, needed as the tie-correction term in Mann-Whitney / Kruskal-Wallis.
function rankWithTies(x) {
  const n = x.length;
  const idx = x.map((v, i) => [v, i]).sort((a, b) => a - b);
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
    p = 1 - normcdf(z);
  } else {
    // n ≥ 12: log(1−W) is approximately normal after transform.
    const lnN = Math.log(n);
    const mu = -1.5861 - 0.31082 * lnN - 0.083751 * lnN * lnN + 0.0038915 * lnN * lnN * lnN;
    const sigma = Math.exp(-0.4803 - 0.082676 * lnN + 0.0030302 * lnN * lnN);
    const y = Math.log(1 - W);
    const z = (y - mu) / sigma;
    p = 1 - normcdf(z);
  }

  return { W, p };
}

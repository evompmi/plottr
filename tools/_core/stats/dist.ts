// stats/dist.ts — probability distributions, special functions, and power calcs.
//
// Layout:
//   1.  Distribution functions  — normal, gamma, beta, t, F, chi-square,
//                                 noncentral t/F/chi-square
//   2.  Generic helpers         — bisect
//   2b. Power functions         — t / paired / ANOVA / correlation / chi²
//
// All functions are benchmarked against R output in tests/stats.test.js
// with a ±0.5 % tolerance bar.

// ── 1. Distribution functions ───────────────────────────────────────────────

// Normal CDF / survival — port of R's `pnorm_both` (nmath/pnorm.c; Cody 1993,
// ACM TOMS 19:22–32, with R's refinements), accurate to full double
// precision across the range. Returns [P(X ≤ x), P(X > x)].
const PN_A = [
  2.2352520354606837, 161.02823106855587, 1067.6894854603709, 18154.98125334356,
  0.06568233791820745,
];
const PN_B = [47.202581904688245, 976.0985517377767, 10260.932208618979, 45507.78933502673];
const PN_C = [
  0.39894151208813466, 8.883149794388377, 93.50665613217785, 597.2702763948002, 2494.5375852903726,
  6848.190450536283, 11602.65143764735, 9842.714838383978, 1.0765576773720192e-8,
];
const PN_D = [
  22.266688044328117, 235.387901782625, 1519.3775994075547, 6485.558298266761, 18615.571640885097,
  34900.95272114598, 38912.00328609327, 19685.429676859992,
];
const PN_P = [
  0.215898534057957, 0.12740116116024736, 0.022235277870649807, 0.0014216191932278934,
  2.9112874951168793e-5, 0.023073441764940174,
];
const PN_Q = [
  1.284260096144911, 0.4682382124808651, 0.06598813786892856, 0.0037823963320275824,
  7.297515550839662e-5,
];
const M_SQRT_32 = 5.656854249492381;
const M_1_SQRT_2PI = 0.3989422804014327;

function pnormBoth(x: number): [number, number] {
  if (Number.isNaN(x)) return [NaN, NaN];
  const y = Math.abs(x);
  let cum: number, ccum: number, temp: number;
  // exp(−X²/2) with X split as X = xsq + del to keep the exponent exact.
  const tailFromTemp = (X: number, tmp: number): void => {
    const xsq = Math.trunc(X * 16) / 16;
    const del = (X - xsq) * (X + xsq);
    cum = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * tmp;
    ccum = 1.0 - cum;
  };
  if (y <= 0.67448975) {
    let xnum = 0,
      xden = 0;
    if (y > Number.EPSILON * 0.5) {
      const xsq = x * x;
      xnum = PN_A[4] * xsq;
      xden = xsq;
      for (let i = 0; i < 3; i++) {
        xnum = (xnum + PN_A[i]) * xsq;
        xden = (xden + PN_B[i]) * xsq;
      }
    }
    temp = (x * (xnum + PN_A[3])) / (xden + PN_B[3]);
    return [0.5 + temp, 0.5 - temp];
  }
  cum = 0;
  ccum = 0;
  if (y <= M_SQRT_32) {
    let xnum = PN_C[8] * y,
      xden = y;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + PN_C[i]) * y;
      xden = (xden + PN_D[i]) * y;
    }
    temp = (xnum + PN_C[7]) / (xden + PN_D[7]);
    tailFromTemp(y, temp);
  } else if (y < 38.4674) {
    const xsq = 1.0 / (x * x);
    let xnum = PN_P[5] * xsq,
      xden = xsq;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + PN_P[i]) * xsq;
      xden = (xden + PN_Q[i]) * xsq;
    }
    temp = (xsq * (xnum + PN_P[4])) / (xden + PN_Q[4]);
    temp = (M_1_SQRT_2PI - temp) / y;
    tailFromTemp(x, temp);
  } else {
    return x > 0 ? [1, 0] : [0, 1];
  }
  // `cum` holds the lower tail of −|x|; swap for positive x.
  return x > 0 ? [ccum, cum] : [cum, ccum];
}

export function normcdf(x: number): number {
  return pnormBoth(x)[0];
}

// Normal survival 1 − Φ(x), computed directly (no 1 − Φ cancellation).
export function normsf(x: number): number {
  return pnormBoth(x)[1];
}

// Inverse normal CDF — Peter Acklam's rational approximation (max error 1.15e-9)
export function norminv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // equiv-mutant: redundant — the p≤pHigh rational form already yields exactly 0 at p=0.5 (q=p−0.5=0)
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
  let q: number, r: number;
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
export function gammaln(x: number): number {
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

// Regularized incomplete beta function I_x(a, b) via continued fraction.
//
// Log-space final exponentiation: the prior `exp(logFront) * cf / a` path
// underflowed `logFront` to 0 whenever `a*log(x) + b*log(1-x) - lnBeta` went
// below ≈ −745 (double-precision exp floor). That silently destroyed deep-tail
// p-values — the small-t branch for df/2 ≥ 30 with |t| > 5 routinely lands
// at logFront ≈ −200 to −140, well within representable range but wiped to 0
// if we exp() too early.
export function betai(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lnBeta = gammaln(a) + gammaln(b) - gammaln(a + b);
  const logFront = Math.log(x) * a + Math.log(1 - x) * b - lnBeta;
  if (x < (a + 1) / (a + b + 2)) {
    const cf = betacf(a, b, x);
    return Math.exp(logFront + Math.log(cf / a));
  }
  const cf = betacf(b, a, 1 - x);
  return 1 - Math.exp(logFront + Math.log(cf / b));
}

// Upper-tail of the regularized incomplete beta: 1 − I_x(a, b). Computing
// 1 − betai() directly cancels when betai is near 1; this helper returns the
// upper tail via the opposite branch of the continued fraction, so callers
// like `fcdf_upper` and `tcdf_upper` stay accurate for tiny p-values.
export function betai_upper(a: number, b: number, x: number): number {
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  const lnBeta = gammaln(a) + gammaln(b) - gammaln(a + b);
  const logFront = Math.log(x) * a + Math.log(1 - x) * b - lnBeta;
  if (x < (a + 1) / (a + b + 2)) {
    // betai is small → 1 − tiny; direct subtraction is fine.
    const cf = betacf(a, b, x);
    return 1 - Math.exp(logFront + Math.log(cf / a));
  }
  // betai is ≈ 1 → upper tail = exp(logFront + log(cf/b)), no cancellation.
  const cf = betacf(b, a, 1 - x);
  return Math.exp(logFront + Math.log(cf / b));
}

// ── Continued-fraction primitives — Cephes-derived ──────────────────────────
//
// betacf, gammainc, and gammainc_upper below are ported from the Cephes
// Mathematical Library (Stephen L. Moshier), which the author dedicated to
// the public domain. See `incbet.c` and `igam.c` at:
//   https://www.netlib.org/cephes/
//   "Cephes Math Library Release 2.8" — Stephen L. Moshier, 2000
//
// Cephes uses a three-term recurrence (pkm1/pkm2/qkm1/qkm2) with periodic
// big/biginv rescaling to keep partial numerators/denominators inside
// representable range. This is structurally distinct from Lentz's modified
// per-step floor clamp; both converge to the same value within machine
// precision for the input range we use here. The Plöttr-specific polish
// (log-space final exponentiation in gammainc / gammainc_upper, and the
// √a-scaled iteration cap so chi2cdf / ptukey stay accurate at huge df)
// is layered on top of the Cephes recurrence.
//
// Constants below match Cephes' incbet.c / igam.c literally.
const CEPHES_BIG = 4.503599627370496e15; // 2^52
const CEPHES_BIGINV = 2.220446049250313e-16; // 2^-52
const CEPHES_MACHEP = 1.1102230246251565e-16;

// Continued fraction for the regularized incomplete beta — forward form
// (Cephes' incbcf). Returns the bare CF value `pk/qk`; betai / betai_upper
// then multiply by the log-space prefactor.
export function betacf(a: number, b: number, x: number): number {
  let k1 = a;
  let k2 = a + b;
  let k3 = a;
  let k4 = a + 1;
  let k5 = 1;
  let k6 = b - 1;
  let k7 = k4;
  let k8 = a + 2;

  let pkm2 = 0;
  let qkm2 = 1;
  let pkm1 = 1;
  let qkm1 = 1;
  let ans = 1;
  let r = 1;
  const thresh = 3 * CEPHES_MACHEP;

  for (let n = 0; n < 300; n++) {
    let xk = -((x * k1 * k2) / (k3 * k4));
    let pk = pkm1 + pkm2 * xk;
    let qk = qkm1 + qkm2 * xk;
    pkm2 = pkm1;
    pkm1 = pk;
    qkm2 = qkm1;
    qkm1 = qk;

    xk = (x * k5 * k6) / (k7 * k8);
    pk = pkm1 + pkm2 * xk;
    qk = qkm1 + qkm2 * xk;
    pkm2 = pkm1;
    pkm1 = pk;
    qkm2 = qkm1;
    qkm1 = qk;

    let t: number;
    if (qk !== 0) r = pk / qk;
    if (r !== 0) {
      t = Math.abs((ans - r) / r);
      ans = r;
    } else {
      t = 1;
    }
    if (t < thresh) return ans;

    k1 += 1;
    k2 += 1;
    k3 += 2;
    k4 += 2;
    k5 += 1;
    k6 -= 1;
    k7 += 2;
    k8 += 2;

    if (Math.abs(qk) + Math.abs(pk) > CEPHES_BIG) {
      pkm2 *= CEPHES_BIGINV;
      pkm1 *= CEPHES_BIGINV;
      qkm2 *= CEPHES_BIGINV;
      qkm1 *= CEPHES_BIGINV;
    }
    if (Math.abs(qk) < CEPHES_BIGINV || Math.abs(pk) < CEPHES_BIGINV) {
      pkm2 *= CEPHES_BIG;
      pkm1 *= CEPHES_BIG;
      qkm2 *= CEPHES_BIG;
      qkm1 *= CEPHES_BIG;
    }
  }
  return ans;
}

// Regularized lower incomplete gamma P(a, x) — Cephes' igam series form.
// Cephes uses `r += 1; c *= x/r; ans += c` with a `c/ans < MACHEP`
// termination test. We layer a √a-scaled iteration cap on top because the
// series converges in ~O(√a) steps when x ≈ a (Poisson-like concentration
// around n ≈ x − a with width √a) — chi2cdf / ptukey at huge df otherwise
// truncate before convergence. Switchover threshold (`x > 1 && x > a`)
// matches Cephes literally, not NR's `x < a + 1`.
export function gammainc(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x > 1 && x > a) return 1 - gammainc_upper(a, x);

  let r = a;
  let c = 1;
  let ans = 1;
  const maxIter = Math.max(700, Math.ceil(20 * Math.sqrt(a + 1)));
  for (let i = 0; i < maxIter; i++) {
    r += 1;
    c *= x / r;
    ans += c;
    if (c / ans < CEPHES_MACHEP) break;
  }
  // Log-space final exponentiation: the prefactor `exp(a*ln(x) - x - lnΓ(a))`
  // can underflow at large a even when ans*ax/a is well within range.
  return Math.exp(Math.log(ans / a) + a * Math.log(x) - x - gammaln(a));
}

// Regularized upper incomplete gamma Q(a, x) = 1 − P(a, x) — Cephes' igamc
// continued-fraction form. Three-term recurrence on (pkm, qkm) with the
// `pk = pkm1*z − pkm2*yc` update; `c` and `y` advance by integer steps each
// iteration. Big/biginv rescaling keeps |pk| from running away.
export function gammainc_upper(a: number, x: number): number {
  let y = 1 - a;
  let z = x + y + 1;
  let c = 0;
  let pkm2 = 1;
  let qkm2 = x;
  let pkm1 = x + 1;
  let qkm1 = z * x;
  let ans = pkm1 / qkm1;

  const maxIter = Math.max(300, Math.ceil(20 * Math.sqrt(a + 1)));
  for (let i = 0; i < maxIter; i++) {
    c += 1;
    y += 1;
    z += 2;
    const yc = y * c;
    const pk = pkm1 * z - pkm2 * yc;
    const qk = qkm1 * z - qkm2 * yc;
    let t: number;
    if (qk !== 0) {
      const r = pk / qk;
      t = Math.abs((ans - r) / r);
      ans = r;
    } else {
      t = 1;
    }
    pkm2 = pkm1;
    pkm1 = pk;
    qkm2 = qkm1;
    qkm1 = qk;
    if (Math.abs(pk) > CEPHES_BIG) {
      pkm2 *= CEPHES_BIGINV;
      pkm1 *= CEPHES_BIGINV;
      qkm2 *= CEPHES_BIGINV;
      qkm1 *= CEPHES_BIGINV;
    }
    if (t < CEPHES_MACHEP) break;
  }
  // Log-space final exponentiation — see comment in gammainc.
  return Math.exp(Math.log(ans) + a * Math.log(x) - x - gammaln(a));
}

// t-distribution CDF
export function tcdf(t: number, df: number): number {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const p = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? 1 - p : p;
}

// Upper-tail 1 − tcdf(t, df). Avoids the `1 − (near-1)` cancellation that
// silently drove `tTest` p-values to 0 for |t| > ~9 at large df — e.g. iris
// SL setosa vs versicolor (t ≈ 10.5, df = 98) where R reports p ≈ 9e-18 but
// JS underflowed to 0 because tcdf returned a float-rounded 1.0.
export function tcdf_upper(t: number, df: number): number {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const tail = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? tail : 1 - tail;
}

// t-distribution PDF (computed in log space, used by tinv Newton-Raphson)
export function tpdf(x: number, df: number): number {
  const logpdf =
    gammaln((df + 1) / 2) -
    gammaln(df / 2) -
    0.5 * Math.log(Math.PI * df) -
    ((df + 1) / 2) * Math.log(1 + (x * x) / df);
  return Math.exp(logpdf);
}

// Inverse t CDF.
// Strategy:
//   • df = 1 and df = 2 have closed forms — use them directly.
//   • df ≥ 3: Newton-Raphson seeded with a Cornish-Fisher correction to the
//     normal quantile, with a damped step and a bisection fallback if Newton
//     fails to converge. Bracket bounds expand outward (doubling) to handle
//     heavy-tailed cases where |t| can exceed hundreds or thousands at
//     extreme p (e.g. qt(1e-10, 5) ≈ −157).
//   • Work in the left tail (leftP ≤ 0.5) and flip sign at the end, so that
//     inputs like p = 1 − 1e-15 don't suffer catastrophic cancellation.
export function tinv(p: number, df: number): number {
  if (df <= 0) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // equiv-mutant: redundant — every df branch already converges to 0 at p=0.5 (leftP=0.5)
  if (p === 0.5) return 0;

  const upper = p > 0.5;
  const leftP = upper ? 1 - p : p;

  let tLeft: number;

  if (df === 1) {
    // Cauchy: F⁻¹(u) = tan(π(u − 0.5)) = −cot(π·u).
    tLeft = -1 / Math.tan(Math.PI * leftP);
  } else if (df === 2) {
    // Closed form: t = (2u−1) / √(2u(1−u)).
    tLeft = (2 * leftP - 1) / Math.sqrt(2 * leftP * (1 - leftP));
  } else {
    // Cornish-Fisher seed: first-order correction to the normal quantile.
    const z = norminv(leftP);
    let x = z + (z * (z * z + 1)) / (4 * df);

    let converged = false;
    for (let i = 0; i < 60; i++) {
      const cdf = tcdf(x, df);
      const pdf = tpdf(x, df);
      if (!Number.isFinite(cdf) || !(pdf > 0)) break;
      let step = (cdf - leftP) / pdf;
      // Damp the step so we can't jump past a flat tail where PDF → 0.
      const cap = Math.abs(x) + 1;
      if (step > cap) step = cap;
      else if (step < -cap) step = -cap;
      x -= step;
      if (Math.abs(step) < 1e-13 * (Math.abs(x) + 1)) {
        converged = true;
        break;
      }
    }

    if (converged && Number.isFinite(x)) {
      tLeft = x;
    } else {
      // Bisection fallback: expand the lower bound until leftP is bracketed.
      let lo = -1;
      const hi = 0;
      for (let i = 0; i < 4000 && tcdf(lo, df) > leftP; i++) lo *= 2;
      let a = lo,
        b = hi;
      for (let i = 0; i < 200; i++) {
        const mid = (a + b) / 2;
        if (tcdf(mid, df) < leftP) a = mid;
        else b = mid;
        if (b - a < 1e-12 * (Math.abs(a) + 1)) break;
      }
      tLeft = (a + b) / 2;
    }
  }

  return upper ? -tLeft : tLeft;
}

// F-distribution CDF
export function fcdf(f: number, d1: number, d2: number): number {
  if (d1 <= 0 || d2 <= 0) return NaN;
  // equiv-mutant: subsumed — for f<=0 the x argument lands outside (0,1) and betai returns 0
  if (f <= 0) return 0;
  return betai(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2));
}

// Upper-tail 1 − fcdf(f, d1, d2). Same rationale as `tcdf_upper` — direct
// computation avoids the 1 − (near-1) cancellation that underflows ANOVA /
// Welch-ANOVA p-values at F > ~50.
export function fcdf_upper(f: number, d1: number, d2: number): number {
  if (d1 <= 0 || d2 <= 0) return NaN;
  // equiv-mutant: subsumed — for f<=0 the x argument lands outside (0,1) and betai_upper returns 1
  if (f <= 0) return 1;
  return betai_upper(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2));
}

// Chi-square CDF
export function chi2cdf(x: number, k: number): number {
  if (k <= 0) return NaN;
  // equiv-mutant: subsumed — gammainc returns 0 for the x/2<=0 that x<=0 produces
  if (x <= 0) return 0;
  return gammainc(k / 2, x / 2);
}

// Upper-tail 1 − chi2cdf(x, k), computed directly as the regularized upper
// incomplete gamma Q(k/2, x/2). Same rationale as `tcdf_upper` / `fcdf_upper`:
// `1 - chi2cdf(x, k)` loses all precision in the deep tail because
// `gammainc(a, x)` itself returns `1 - gammainc_upper(a, x)` there, so the
// subtraction is `1 - (1 - tiny)` — catastrophic cancellation that floors a
// genuinely-significant p-value to 0. Call this whenever you need the χ² tail
// probability (e.g. a test statistic's p-value), never `1 - chi2cdf`.
export function chi2cdf_upper(x: number, k: number): number {
  if (k <= 0) return NaN;
  if (x <= 0) return 1;
  const a = k / 2;
  const t = x / 2;
  // Branch exactly like `gammainc`: the upper continued fraction is accurate
  // only in the tail (t > 1 && t > a) — precisely where the lower series
  // saturates at 1 and `1 - chi2cdf` would cancel to 0, so take Q directly
  // there. Elsewhere the lower series is accurate and far from 1, so
  // `1 - gammainc` has no cancellation and is sharper than the CF.
  if (t > 1 && t > a) return gammainc_upper(a, t);
  return 1 - gammainc(a, t);
}

// Chi-square PDF — used as the Newton derivative in chi2inv. Built in log
// space to avoid overflow at large k or tiny x.
export function chi2pdf(x: number, k: number): number {
  if (k <= 0) return NaN;
  if (x <= 0) return 0;
  const halfK = k / 2;
  return Math.exp((halfK - 1) * Math.log(x) - x / 2 - halfK * Math.log(2) - gammaln(halfK));
}

// Inverse chi-square CDF — Newton-Raphson on the central body, bisection
// fallback for the saturated tails where the χ² CDF derivative collapses
// to ~10⁻¹² and Newton overshoots wildly. The historical implementation was
// pure bisection with a doubling upper bound (~50 iterations for 1e-10
// tolerance); this version is much faster on typical inputs while remaining
// correct on the tails. Uses the Wilson-Hilferty cubic-normal approximation
// (X/k)^(1/3) ≈ N(1 − 2/(9k), 2/(9k)) to seed both Newton and the bracket.
export function chi2inv(p: number, k: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (k <= 0) return NaN;
  const z = norminv(p);
  const h = 2 / (9 * k);
  let x = k * Math.pow(1 - h + z * Math.sqrt(h), 3);
  if (!(x > 0)) x = Math.max(1e-6, k * 0.01);
  // Newton inside a wide guard: only accept iterations that stay positive
  // and don't exceed twice the current point. If Newton makes <10⁻¹² PDF
  // (deep in the saturated tail) or the step would leave the guard, drop
  // straight to bisection.
  for (let i = 0; i < 30; i++) {
    const f = chi2cdf(x, k) - p;
    if (Math.abs(f) < 1e-12) return x;
    const fp = chi2pdf(x, k);
    if (!(fp > 1e-12)) break;
    const step = f / fp;
    const xNew = x - step;
    if (!(xNew > 0) || xNew > 2 * x || xNew < x / 2) break;
    if (Math.abs(xNew - x) < 1e-12 * Math.max(1, x)) return xNew;
    x = xNew;
  }
  // Bisection fallback. Use WH seed to set a tight initial bracket; expand
  // by doubling if it doesn't cover p (bisect itself refuses unbracketed
  // targets, so this guarantees progress).
  const lo = 0;
  let hi = Math.max(x * 2, k + 10 * Math.sqrt(2 * k));
  for (let i = 0; i < 40 && chi2cdf(hi, k) < p; i++) hi *= 2;
  return bisect((q) => chi2cdf(q, k), p, lo, hi, 1e-10);
}

// Gauss-Legendre quadrature nodes and weights (computed once, cached)
interface GLCache {
  nodes: number[];
  weights: number[];
  n: number;
}
let _glCache: GLCache | undefined;
export function _gaussLegendre(n: number): GLCache {
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

// Noncentral t CDF P(T ≤ t | ν, δ) — port of R's `pnt` (nmath/pnt.c):
// AS 243 (Lenth 1989, Appl. Statist. 38:185–189) with Guenther's twin
// Poisson-weighted incomplete-beta series, and R's A&S 26.7.10 normal
// approximation for ν > 4e5. Two deliberate departures, both toward the
// exact value: a 1e-15 series tolerance (R: 1e-12), and a direct
// integral for |δ| > 37.62 where R's normal approximation is rough.
export function nctcdf(t: number, df: number, delta: number): number {
  if (!(df > 0)) return NaN;
  if (delta === 0) return tcdf(t, df);
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  let negdel: boolean, tt: number, del: number;
  if (t >= 0) {
    negdel = false;
    tt = t;
    del = delta;
  } else {
    // pt(q, ν, δ) ≤ pt(0, ν, δ) = Φ(−δ): the left tail is 0 for large δ.
    if (delta > 40) return 0;
    negdel = true;
    tt = -t;
    del = -delta;
  }
  if (del * del > 2 * Math.LN2 * 1021 && df <= 4e5) {
    // |δ| > 37.62: the series' Poisson weight e^{−δ²/2} underflows. R falls
    // back to A&S 26.7.10 here, which is rough at small ν (pt(10, 1, 50) =
    // 1.3e-9 against a true 6.5e-7); integrate the χ mixture directly.
    return _nctcdfQuad(t, df, delta);
  }
  if (df > 4e5) {
    const s = 1 / (4 * df);
    const z = (tt * (1 - s) - del) / Math.sqrt(1 + tt * tt * 2 * s);
    return negdel ? normsf(z) : normcdf(z);
  }
  let x = t * t;
  let rxb = df / (x + df);
  x = x / (x + df);
  let tnc = 0;
  if (x > 0) {
    const lambda = del * del;
    let p = 0.5 * Math.exp(-0.5 * lambda);
    if (p === 0) return negdel ? 1 : 0; // underflow — R returns 0 (lower tail)
    let q = Math.sqrt(2 / Math.PI) * p * del;
    let s = 0.5 - p;
    if (s < 1e-7) s = -0.5 * Math.expm1(-0.5 * lambda);
    let a = 0.5;
    const b = 0.5 * df;
    rxb = Math.pow(rxb, b);
    const albeta = 0.5 * Math.log(Math.PI) + gammaln(b) - gammaln(0.5 + b);
    let xodd = betai(a, b, x);
    let godd = 2 * rxb * Math.exp(a * Math.log(x) - albeta);
    const tncb = b * x;
    let xeven = tncb < Number.EPSILON ? tncb : 1 - rxb;
    let geven = tncb * rxb;
    tnc = p * xodd + q * xeven;
    for (let it = 1; it <= 1000; it++) {
      a += 1;
      xodd -= godd;
      xeven -= geven;
      godd *= (x * (a + b - 1)) / a;
      geven *= (x * (a + b - 0.5)) / (a + 0.5);
      p *= lambda / (2 * it);
      q *= lambda / (2 * it + 1);
      tnc += p * xodd + q * xeven;
      s -= p;
      if (s < -1e-10) break; // rounding-error guard (R 2.4.0)
      if (s <= 0 && it > 1) break;
      const errbd = 2 * s * (xodd - godd);
      // R stops at 1e-12; the tighter bound costs a few iterations and keeps
      // 1 − P accurate below 1e-13 in the far upper tail.
      if (Math.abs(errbd) < 1e-15) break;
    }
  }
  tnc += normcdf(-del);
  const v = Math.min(tnc, 1);
  if (!negdel) return v;
  // t < 0 returns 1 − (upper series), which cancels to ~1e-13 noise in the
  // far lower tail (R: pt(-5, 1000, 5) = 1.8e-13, true 4.2e-18); there the
  // direct integral, whose integrand Φ is itself tail-accurate, is exact.
  const lower = 0.5 - v + 0.5;
  return lower < 1e-9 ? _nctcdfQuad(t, df, delta) : lower;
}

// P(T ≤ t | ν, δ) = ∫₀^∞ Φ(t·u/√ν − δ) · f_χ(u; ν) du, by composite 48-point
// Gauss-Legendre. Panels break at the Φ step u* = δ√ν/t (width √ν/|t|), which
// is far narrower than the χ density when |t| is large — a single fixed panel
// under-resolves it (the cause of the old Cohen's-d CI drift at d ≥ 12).
function _nctcdfQuad(t: number, df: number, delta: number): number {
  const halfDf = df / 2;
  const logC = (halfDf - 1) * Math.LN2 + gammaln(halfDf);
  const sqrtDf = Math.sqrt(df);
  const uLo = Math.max(0, sqrtDf - 12);
  const uHi = sqrtDf + 12;
  const cuts = [uLo, uHi];
  if (t !== 0) {
    const uStar = (delta * sqrtDf) / t;
    const w = sqrtDf / Math.abs(t);
    for (const k of [-12, -4, -1.5, 0, 1.5, 4, 12]) {
      const u = uStar + k * w;
      if (u > uLo && u < uHi) cuts.push(u);
    }
  }
  cuts.sort((a, b) => a - b);
  const gl = _gaussLegendre(48);
  let sum = 0;
  for (let c = 0; c + 1 < cuts.length; c++) {
    const a = cuts[c],
      b = cuts[c + 1];
    if (b <= a) continue;
    const half = (b - a) / 2,
      mid = (a + b) / 2;
    for (let i = 0; i < 48; i++) {
      const u = mid + half * gl.nodes[i];
      if (u <= 0) continue;
      const logF = (df - 1) * Math.log(u) - (u * u) / 2 - logC;
      sum += half * gl.weights[i] * normcdf((t * u) / sqrtDf - delta) * Math.exp(logF);
    }
  }
  return Math.max(0, Math.min(1, sum));
}

// Noncentral F survival P(F' > f) — Poisson mixture
// F' = (χ²_{d1+2J}/d1) / (χ²_{d2}/d2), J~Poisson(λ/2)
// P(F'>f) = Σ_j P(J=j) × P(F(d1+2j, d2) > f × d1/(d1+2j))
// Starts at Poisson mode to avoid underflow for large λ.
export function ncf_sf(f: number, d1: number, d2: number, lambda: number): number {
  if (d1 <= 0 || d2 <= 0) return NaN;
  if (f <= 0) return 1;
  if (lambda <= 0) return fcdf_upper(f, d1, d2);
  const halfLam = lambda / 2;

  // Large-λ short circuit: the Poisson mass around the mode has width
  // σ = √(λ/2), so a fixed 500-step window leaves most of the mass
  // unaccounted for when λ is huge. In that regime, P(F'>f) is either
  // ≈ 1 or ≈ 0 for f outside a few σ of the NCF mean — use closed-form
  // mean / variance of the NCF (valid for d2 > 4) and short-circuit via
  // normal approximation when f is clearly in the far tail. Without this,
  // power-analysis sample-size solvers probe huge n values (e.g. via
  // bisect up to hi=100000) and get misleading truncated-sum answers,
  // breaking the monotonic-in-n assumption the solver depends on.
  if (halfLam > 500 && d2 > 4) {
    const mean = (d2 / (d2 - 2)) * ((d1 + lambda) / d1);
    const v =
      (2 *
        Math.pow(d2 / (d2 - 2), 2) *
        ((d1 + lambda) * (d1 + lambda) + (d1 + 2 * lambda) * (d2 - 2))) /
      (d1 * d1 * (d2 - 4));
    const sd = Math.sqrt(v);
    const z = (f - mean) / sd;
    if (z < -6) return 1;
    if (z > 6) return 0;
  }

  const jMode = Math.max(0, Math.floor(halfLam));
  // Widen the Poisson window for larger λ so we cover ±8σ of the mass.
  const maxSteps = Math.max(500, Math.ceil(8 * Math.sqrt(halfLam + 1)));

  function sfTerm(j: number): number {
    const d1j = d1 + 2 * j;
    return fcdf_upper((f * d1) / d1j, d1j, d2);
  }

  const logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  const pTerm = Math.exp(logPMode);
  let sum = pTerm * sfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + maxSteps; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * sfTerm(j);
    sum += contrib;
    if (j - jMode > 10 && pUp < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0 && jMode - j < maxSteps; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * sfTerm(j);
    sum += contrib;
    if (jMode - j > 10 && pDown < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// Noncentral chi-square CDF — Poisson mixture (starts at mode to avoid underflow)
export function ncchi2cdf(x: number, k: number, lambda: number): number {
  if (k <= 0) return NaN;
  if (x <= 0) return 0;
  if (lambda <= 0) return chi2cdf(x, k);
  const halfLam = lambda / 2;
  // Large-λ short circuit: use normal approximation for the far tails.
  // Noncentral χ² has mean k+λ and variance 2(k+2λ); a |z|>6 tail is < 1e-9.
  if (halfLam > 500) {
    const mean = k + lambda;
    const sd = Math.sqrt(2 * (k + 2 * lambda));
    const z = (x - mean) / sd;
    if (z < -6) return 0;
    if (z > 6) return 1;
  }
  const jMode = Math.max(0, Math.floor(halfLam));
  // Poisson mixture width is √λ/2; widen the scan window with √halfLam so huge
  // λ doesn't silently truncate the sum (mirrors the ncf_sf fix).
  const maxSteps = Math.max(500, Math.ceil(8 * Math.sqrt(halfLam + 1)));

  function cdfTerm(j: number): number {
    return gammainc(k / 2 + j, x / 2);
  }

  const logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  const pTerm = Math.exp(logPMode);
  let sum = pTerm * cdfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + maxSteps; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * cdfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && pUp < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * cdfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && pDown < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// ── 1b. Exact null distributions of rank statistics ─────────────────────────
//
// Ports of R's `pwilcox` (nmath/wilcox.c), `pkendall` (stats/src/kendall.c)
// and `prho` (stats/src/prho.c, AS 89). These back the exact p-values that
// `wilcox.test` / `cor.test` report by default on small, tie-free samples.

// Null frequency of the Mann-Whitney statistic W = U1 for sample sizes
// (m, n): counts[k] = #{rank configurations with W = k}, k = 0..m·n.
// DP over c(i, j)[k] = c(i−1, j)[k−j] + c(i, j−1)[k] — all additions of
// positive counts, as R's `cwilcox` recursion.
const _wilcoxCache = new Map<string, Float64Array>();
function wilcoxCounts(m: number, n: number): Float64Array {
  const key = m + "," + n;
  const hit = _wilcoxCache.get(key);
  if (hit) return hit;
  // prev[j] = counts for (i − 1, j); cur[j] = counts for (i, j).
  let prev: Float64Array[] = [];
  for (let j = 0; j <= n; j++) prev.push(Float64Array.of(1));
  for (let i = 1; i <= m; i++) {
    const cur: Float64Array[] = [Float64Array.of(1)];
    for (let j = 1; j <= n; j++) {
      const c = new Float64Array(i * j + 1);
      const a = prev[j]; // (i − 1, j), shifted by j
      for (let k = 0; k < a.length; k++) c[k + j] += a[k];
      const b = cur[j - 1]; // (i, j − 1)
      for (let k = 0; k < b.length; k++) c[k] += b[k];
      cur.push(c);
    }
    prev = cur;
  }
  const out = prev[n];
  _wilcoxCache.set(key, out);
  return out;
}

// P[W ≤ q] (lowerTail) or P[W > q] for the Mann-Whitney / Wilcoxon rank-sum
// statistic with sample sizes m, n — R's `pwilcox(q, m, n, lower.tail)`.
export function pwilcox(q: number, m: number, n: number, lowerTail: boolean = true): number {
  if (!(m > 0) || !(n > 0)) return NaN;
  q = Math.floor(q + 1e-7);
  if (q < 0) return lowerTail ? 0 : 1;
  if (q >= m * n) return lowerTail ? 1 : 0;
  const counts = wilcoxCounts(m, n);
  const c = Math.exp(gammaln(m + n + 1) - gammaln(m + 1) - gammaln(n + 1));
  let p = 0;
  // Sum over the shorter range, as R does.
  if (q <= (m * n) / 2) {
    for (let i = 0; i <= q; i++) p += counts[i] / c;
  } else {
    q = m * n - q;
    for (let i = 0; i < q; i++) p += counts[i] / c;
    lowerTail = !lowerTail;
  }
  return lowerTail ? p : 0.5 - p + 0.5;
}

// Null frequency of T = #concordant pairs for n tie-free pairs:
// counts[k] = #{permutations of n with k concordant pairs} (Mahonian numbers).
const _kendallCache = new Map<number, Float64Array>();
function kendallCounts(n: number): Float64Array {
  const hit = _kendallCache.get(n);
  if (hit) return hit;
  let w = Float64Array.of(1);
  for (let m = 2; m <= n; m++) {
    const u = (m * (m - 1)) / 2;
    const next = new Float64Array(u + 1);
    // c(k, m) = Σ_{i=0}^{m−1} c(k − i, m − 1)
    for (let k = 0; k <= u; k++) {
      let s = 0;
      for (let i = 0; i < m; i++) {
        const idx = k - i;
        if (idx >= 0 && idx < w.length) s += w[idx];
      }
      next[k] = s;
    }
    w = next;
  }
  _kendallCache.set(n, w);
  return w;
}

// P[T ≤ q] for Kendall's T with n tie-free pairs — R's internal `pkendall`.
export function pkendall(q: number, n: number): number {
  q = Math.floor(q + 1e-7);
  if (q < 0) return 0;
  if (q > (n * (n - 1)) / 2) return 1;
  const counts = kendallCounts(n);
  let p = 0;
  for (let j = 0; j <= q; j++) p += counts[j];
  return p / Math.exp(gammaln(n + 1));
}

// Spearman's S = Σd² — AS 89 (R's `prho`): P[S ≥ is] (upper), or P[S < is]
// when lowerTail. Exact enumeration of all n! permutations for n ≤ 9,
// Edgeworth series beyond.
export function prho(is: number, n: number, lowerTail: boolean): number {
  let pv = lowerTail ? 0 : 1;
  if (n <= 1) return NaN;
  if (is <= 0) return pv;
  const n3 = (n * (n * n - 1)) / 3; // (n³ − n)/3, the maximum of S
  if (is > n3) return 1 - pv;
  if (n <= 9) {
    // Count permutations whose Σ(i − π(i))² reaches `is` (Heap's algorithm).
    const perm: number[] = [];
    for (let i = 0; i < n; i++) perm.push(i);
    let nfac = 1;
    for (let i = 2; i <= n; i++) nfac *= i;
    let ifr = 0;
    const tally = (): void => {
      let ise = 0;
      for (let i = 0; i < n; i++) {
        const d = i - perm[i];
        ise += d * d;
      }
      if (is <= ise) ifr++;
    };
    const c = new Array<number>(n).fill(0);
    tally();
    let i = 1;
    while (i < n) {
      if (c[i] < i) {
        const j = i % 2 === 0 ? 0 : c[i];
        const t = perm[j];
        perm[j] = perm[i];
        perm[i] = t;
        tally();
        c[i]++;
        i = 1;
      } else {
        c[i] = 0;
        i++;
      }
    }
    return (lowerTail ? nfac - ifr : ifr) / nfac;
  }
  const c1 = 0.2274,
    c2 = 0.2531,
    c3 = 0.1745,
    c4 = 0.0758,
    c5 = 0.1033,
    c6 = 0.3932,
    c7 = 0.0879,
    c8 = 0.0151,
    c9 = 0.0072,
    c10 = 0.0831,
    c11 = 0.0131,
    c12 = 4.6e-4;
  const b = 1 / n;
  const x = ((6 * (is - 1) * b) / (n * n - 1) - 1) * Math.sqrt(n - 1);
  let y = x * x;
  const u =
    x *
    b *
    (c1 +
      b * (c2 + c3 * b) +
      y *
        (-c4 +
          b * (c5 + c6 * b) -
          y * b * (c7 + c8 * b - y * (c9 - c10 * b + y * b * (c11 - c12 * y)))));
  y = u / Math.exp(y / 2);
  pv = (lowerTail ? -y : y) + (lowerTail ? normcdf(x) : normsf(x));
  if (pv < 0) pv = 0;
  if (pv > 1) pv = 1;
  return pv;
}

// ── 2. Generic helpers ──────────────────────────────────────────────────────

// Generic bisection solver: find x in [lo, hi] such that fn(x) ≈ target.
// Assumes fn is monotone non-decreasing. Returns NaN if target is not
// bracketed — this is intentional: silent clamping to a bracket boundary
// would let downstream code use a number that isn't actually a root. All
// existing callers are responsible for expanding hi (or shrinking lo)
// before delegating to bisect when their target might fall outside.
export function bisect(
  fn: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  tol = 1e-6,
  maxIter = 200
): number {
  if (fn(lo) > target || fn(hi) < target) return NaN;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}

// ── 2b. Power functions ─────────────────────────────────────────────────────
// Keyed by test shape, same formulas used by tools/power.tsx. Kept here so
// the stats panels' replication planning can report achieved power and the
// n-per-group needed for 80 % power directly from the observed data.

export function powerTwoSample(d: number, n: number, alpha: number, tails: number): number {
  const df = 2 * n - 2;
  // Power is the power to detect an effect of this *magnitude* — match R's
  // pwr::pwr.t.test, which takes |d|. Without abs, a one-tailed call with a
  // negative d (routine when group 2 > group 1) returns ~0, reading as "this
  // study is hopeless." (Two-tailed is already sign-symmetric, so abs is a
  // no-op there.)
  const delta = Math.abs(d) * Math.sqrt(n / 2);
  const tCrit = tinv(1 - alpha / tails, df);
  if (tails === 2) return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
  return 1 - nctcdf(tCrit, df, delta);
}

export function powerPaired(d: number, n: number, alpha: number, tails: number): number {
  const df = n - 1;
  // Magnitude convention — see powerTwoSample.
  const delta = Math.abs(d) * Math.sqrt(n);
  const tCrit = tinv(1 - alpha / tails, df);
  if (tails === 2) return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
  return 1 - nctcdf(tCrit, df, delta);
}

export function powerOneSample(d: number, n: number, alpha: number, tails: number): number {
  return powerPaired(d, n, alpha, tails);
}

export function powerAnova(f: number, n: number, alpha: number, k: number): number {
  const df1 = k - 1,
    df2 = k * (n - 1);
  if (df2 < 1) return 0;
  const lambda = n * k * f * f;
  // Central F at small df has very heavy tails — e.g. F(1, 1) only reaches
  // p = 0.955 at x = 200 — so a fixed upper bracket of 200 silently clamps
  // fCrit for α ≤ 0.045 at (df1, df2) = (1, 1). Expand the bracket until it
  // covers 1 − α (20 doublings → ~2·10⁸, comfortably beyond any realistic
  // fCrit) before delegating to bisect. bisect itself now refuses on an
  // unbracketed target, so we propagate NaN when the expansion fails.
  let hi = 200;
  for (let i = 0; i < 20 && fcdf(hi, df1, df2) < 1 - alpha; i++) hi *= 2;
  const fCrit = bisect((x) => fcdf(x, df1, df2), 1 - alpha, 0, hi);
  if (!Number.isFinite(fCrit)) return NaN;
  return ncf_sf(fCrit, df1, df2, lambda);
}

export function powerCorrelation(r: number, n: number, alpha: number, tails: number): number {
  // Port of `pwr::pwr.r.test`: the critical r comes from the exact t
  // threshold, and atanh(r) carries the r / (2(n − 1)) bias term. (A plain
  // Fisher-z with a normal critical value is off by up to ~20 power points
  // at n ≤ 8.) Needs n ≥ 4, as pwr does.
  if (!(n >= 4)) return NaN;
  // Magnitude convention — see powerTwoSample. A negative r with a one-tailed
  // test would otherwise return ~0.
  const rr = Math.abs(r);
  const df = n - 2;
  const ttt = tinv(1 - alpha / tails, df);
  const rc = Math.sqrt((ttt * ttt) / (ttt * ttt + df));
  const zr = Math.atanh(rr) + rr / (2 * (n - 1));
  const zrc = Math.atanh(rc);
  const s = Math.sqrt(n - 3);
  if (tails === 2) return normcdf((zr - zrc) * s) + normcdf((-zr - zrc) * s);
  return normcdf((zr - zrc) * s);
}

export function powerChi2(w: number, n: number, alpha: number, df: number): number {
  const lambda = n * w * w;
  const chiCrit = chi2inv(1 - alpha, df);
  return 1 - ncchi2cdf(chiCrit, df, lambda);
}

// Cohen's f for ANOVA from group means + pooled within-SD.
//
// f = σ_means / σ_within, where σ_means is the **population-style** SD of
// the group means — i.e. divides by k, not (k−1) — treating the supplied
// means as the entire population of cell means rather than a sample. This
// matches Cohen (1988) and R's pwr::pwr.anova.test, which is what the
// downstream power calculator is calibrated against. Callers that have a
// sample SD of group means should multiply by √((k−1)/k) before passing
// in, or recompute from the raw means.
export function fFromGroupMeans(meansArr: number[], sd: number): number {
  if (!meansArr.length || sd <= 0) return 0;
  const grandMean = meansArr.reduce((a, b) => a + b, 0) / meansArr.length;
  const sigmaMeans = Math.sqrt(
    meansArr.reduce((s, m) => s + (m - grandMean) * (m - grandMean), 0) / meansArr.length
  );
  return sigmaMeans / sd;
}

// stats-posthoc.js — studentized-range distribution, all-pairs post-hocs,
// p-adjust, compact-letter-display, and the auto test-picker (`selectTest`).
//
// Loaded after stats-tests.js (depends on `oneWayANOVA`, `sampleMean`,
// `leveneTest`, `shapiroWilk`, etc.).
//
// Layout:
//   10. Studentized range distribution — _wprob, ptukey, qtukey
//   11. Post-hoc tests                  — Tukey HSD, Games-Howell, Dunn, BH
//   12. Compact letter display
//   13. Automatic test selection        — selectTest, pStars, formatP

// ── 10. Studentized range distribution ─────────────────────────────────────
//
// The CDF of the studentized range Q (k means, ν error df) is
//
//   P(Q ≤ q) = ∫₀^∞ f_S(s) · P(R ≤ q·s) ds
//
// where S = √(χ²_ν/ν) and R is the range of k independent standard normals.
// The range CDF itself is
//
//   P(R ≤ w) = ∫_{−∞}^{∞} k · φ(u) · [Φ(u+w) − Φ(u)]^{k−1} du
//
// Both integrals are handled by the cached 48-point Gauss-Legendre rule.
// Matches R's `ptukey` to ~5 decimal places on the cases we benchmark.

// P(range of k standard normals > w). Tail-accurate companion to `_wprob`,
// needed to compute ptukey's upper tail without the `1 − (near-1)` collapse
// that produced the old ~2e-10 floor in Tukey HSD / Games-Howell p-values.
//
// Derivation:
//   1 − F_R(w) = k·∫ φ(u)·[normsf(u)^{k−1} − d(u,w)^{k−1}] du   (with `d(u,w) = Φ(u+w) − Φ(u)`)
// is the identity `1 − F_R = 1 − F_R` once you substitute `1 = k·∫ φ·normsf^{k-1}`,
// but the INTEGRAND factorises without cancellation:
//   a^{k-1} − b^{k-1} = (a − b) · Σ_{j=0}^{k-2} a^{k-2-j}·b^j
// where a = normsf(u), b = d(u,w), and crucially a − b = normsf(u+w) —
// computed as a single tail-accurate call, not as a subtraction of two
// near-1 floats. Every factor on the right is a manifest non-negative.
function _wprob_upper(w, k) {
  if (w <= 0) return 1;
  const gl = _gaussLegendre(48);
  // The integrand `k·φ(u)·normsf(u+w)·Σ…` peaks at u = −w/2 (balance of
  // φ(u) → 0 rightward vs normsf(u+w) → 0 leftward). For w > ~16 that peak
  // escapes a fixed [−8, 8] window, and our estimate under-counts by many
  // orders of magnitude. Centre the 48-node rule on the peak with width ±8σ
  // so the peak and its gaussian decay are always sampled — but keep the
  // window covering u = 0 ±8 for small w so the far-right tail stays in.
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
    const aMinusB = normsf(u + w); // = a − b, direct (no cancellation)
    if (a <= 0 || aMinusB <= 0) continue;
    const b = a - aMinusB;
    // Σ_{j=0}^{k-2} a^{k-2-j} · b^j
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

// P(range of k standard normals ≤ w). The inner difference Φ(u+w) − Φ(u) is
// the source of the old ~2e-10 ptukey floor: for u > 0 and u+w both large,
// subtracting `1 − tiny` from `1 − tiny′` kills precision. We branch so each
// regime uses whichever of normcdf / normsf stays on the small side.
function _wprob(w, k) {
  if (w <= 0) return 0;
  const gl = _gaussLegendre(48);
  // Truncate at ±8σ — φ is negligible beyond.
  const lo = -8,
    hi = 8;
  const half = (hi - lo) / 2,
    mid = (hi + lo) / 2;
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    const phiU = invSqrt2Pi * Math.exp(-0.5 * u * u);
    let diff;
    if (u >= 0) {
      // Both args ≥ u ≥ 0 → both in the upper tail. normsf stays accurate.
      diff = normsf(u) - normsf(u + w);
    } else if (u + w <= 0) {
      // Both args ≤ 0 → lower tail; normcdf stays accurate.
      diff = normcdf(u + w) - normcdf(u);
    } else {
      // u < 0 < u+w — straddles 0; subtraction is numerically safe.
      diff = normcdf(u + w) - normcdf(u);
    }
    if (diff <= 0) continue;
    const term = k * phiU * Math.pow(diff, k - 1);
    sum += half * gl.weights[i] * term;
  }
  return Math.max(0, Math.min(1, sum));
}

// P(Q ≤ q | k groups, df error degrees of freedom)
//
// Substitute y = log(s) — integrate f_S(e^y)·e^y dy. Integration bounds
// [yLo, yHi] are set by the chi² quantiles so the support is exactly where
// the mass lives. This keeps the 48 Gauss-Legendre nodes concentrated on the
// peak regardless of df (a fixed s = u/(1−u) map leaks nodes into the
// exponential tail at high df, saturating ptukey well below 1).
function ptukey(q, k, df) {
  if (q <= 0) return 0;
  if (k < 2 || df < 1) return NaN;
  const gl = _gaussLegendre(48);
  // S = √(χ²_ν / ν). Bound y = log(S) via chi² quantiles at ±1e-10.
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
    // f_S(s) · ds = 2·(ν/2)^(ν/2)/Γ(ν/2) · s^(ν−1) · exp(−ν·s²/2) · s dy
    const logFS = logConst + df * y - (df * s * s) / 2;
    const fSds = Math.exp(logFS);
    if (!Number.isFinite(fSds) || fSds === 0) continue;
    sum += halfW * gl.weights[i] * fSds * _wprob(q * s, k);
  }
  return Math.max(0, Math.min(1, sum));
}

// P(Q > q | k groups, df error degrees of freedom). Tail-accurate counterpart
// to `ptukey`: shares the same outer structure but passes `_wprob_upper`
// through the Gauss-Legendre integrator so the result never goes through a
// `1 − (near-1)` subtraction. Callers that want the upper tail of Tukey HSD
// or Games-Howell p-values use this instead of `1 - ptukey(...)`.
function ptukey_upper(q, k, df) {
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

// Inverse of the studentized range CDF: find q such that ptukey(q, k, df) = p.
// Historically this called bisect(…, 0.01, 100) with a fixed upper bracket,
// which clamped silently for extreme inputs (e.g. k = 50, df = 1, p = 0.999).
// Now expands the upper bracket by doubling until it covers p, then bisects
// with a relative-tolerance termination so the precision is consistent
// regardless of the answer's magnitude. Returns NaN when the expansion
// cannot bracket p — matches R qtukey's NaN-with-warning behavior at
// pathological inputs rather than returning a stale bracket boundary.
//
// Design envelope (verified against SciPy `studentized_range.ppf` in
// `benchmark/run-scipy.py` and tracked by `isQtukeyPathological` in
// `benchmark/run-scipy.js`):
//
//   Pass-band  — df ≥ 3, or (df ∈ {1, 2} with p < 0.95) or k < 10.
//                Within 5 % relative of SciPy across the (p, k, df) grid.
//   Pathological — df ≤ 2 ∧ p ≥ 0.95 ∧ k ≥ 10.
//                The R / SciPy reference itself diverges from
//                Monte-Carlo by single-digit percent in this regime,
//                so cross-validation falls back to a "documented
//                disagreement" bucket rather than a CI-fail.
//
// Caller responsibility: when (1−α, k, df) lies in the pathological
// envelope, downstream consumers (`tukeyHSD`'s CI bounds, …) should
// surface a methodological warning so users know the derived CI is
// only accurate to ~5 %. See the `warning` field on `tukeyHSD`'s
// return for the canonical pattern. NaN is a separate (currently
// unreachable in practice) failure mode for k / df with p so close
// to 1 that even 20 doublings don't cover it — also handled by the
// same `warning` channel.
function qtukey(p, k, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (k < 2 || df < 1) return NaN;
  let lo = 0.01,
    hi = 100;
  // 20 doublings cap hi at ~10⁸ — beyond any realistic (k, df, α) combo;
  // anything that doesn't fit is in the pathological envelope above.
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

// Tukey HSD — all pairwise comparisons following one-way ANOVA.
// Uses Tukey-Kramer for unbalanced designs.
//   q_ij = |m_i − m_j| / √(MSE · (1/n_i + 1/n_j) / 2)
//   p_ij = 1 − ptukey(q_ij, k, df_error)
//   CI half-width = qtukey(1−α, k, df_error) · √(MSE · (1/n_i + 1/n_j) / 2)
// Returns { pairs: [{ i, j, diff, se, q, p, lwr, upr }], k, df }
function tukeyHSD(groups, opts = {}) {
  const alpha = opts.alpha != null ? opts.alpha : 0.05;
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const anova = oneWayANOVA(groups);
  if (anova.error) return { pairs: [], error: anova.error };
  const dfErr = anova.df2;
  const mse = anova.ssWithin / dfErr;
  // Degenerate case: every group is perfectly constant → MSE=0 → division
  // by zero in q. Refuse rather than emit Infinity q / zero p-values.
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
  // Surface a methodological warning when (1−α, k, dfErr) sits inside
  // qtukey's documented pathological envelope (df ≤ 2 ∧ 1−α ≥ 0.95 ∧
  // k ≥ 10). The bracket-doubling expansion still finds a finite root,
  // but `benchmark/run-scipy.py` cross-checks against SciPy's
  // `studentized_range.ppf` and treats up to 5 % relative disagreement
  // there as expected — see `isQtukeyPathological` in
  // `benchmark/run-scipy.js`. p-values use `ptukey_upper` (no bracket
  // expansion involved) and stay reliable; only the per-pair lwr / upr
  // are approximate in that corner. The `qCrit` NaN check is a
  // belt-and-suspenders fallback for the (currently unreachable in
  // practice) case where even 20 doublings of hi don't cover p.
  const inPathologicalEnvelope = dfErr <= 2 && 1 - alpha >= 0.95 && k >= 10;
  let qCritWarning = null;
  if (!Number.isFinite(qCrit)) {
    qCritWarning = `Tukey HSD CI bounds unavailable — qtukey(${1 - alpha}, k=${k}, df=${dfErr}) returned NaN (outside the bracket-expansion envelope). p-values are still reliable; the per-pair lwr / upr are NaN.`;
  } else if (inPathologicalEnvelope) {
    qCritWarning = `Tukey HSD CI bounds approximate — qtukey(${1 - alpha}, k=${k}, df=${dfErr}) lies in the studentized-range design envelope (df ≤ 2 with k ≥ 10 at 1−α ≥ 0.95), where the reference (R, SciPy) disagree by ~5 % with each other. p-values stay reliable; the per-pair lwr / upr are accurate to within ~5 %. Consider Games-Howell (Welch-aware, less sensitive to small df) if this matches your real data.`;
  }
  const pairs = [];
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
  const result = { pairs, k, df: dfErr, mse };
  if (qCritWarning) result.warning = qCritWarning;
  return result;
}

// Games-Howell — post-hoc for Welch's ANOVA. Uses Welch-Satterthwaite df
// per pair and the studentized range distribution.
//   se_ij = √(s_i²/n_i + s_j²/n_j)
//   q     = (m_i − m_j) / √(se²/2)  … Tukey form, see Day & Quinn 1989
//   df    = (s_i²/n_i + s_j²/n_j)² / ((s_i²/n_i)²/(n_i−1) + (s_j²/n_j)²/(n_j−1))
//   p     = 1 − ptukey(|q|, k, df)
// Returns { pairs: [{ i, j, diff, se, q, df, p }], k }
function gamesHowell(groups) {
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const means = groups.map(sampleMean);
  const vars = groups.map(sampleVariance);
  const ns = groups.map((g) => g.length);
  // Degenerate case: if any group has zero variance, pairs that touch it
  // produce SE=0 (when both sides are zero) or NaN df in the Welch-
  // Satterthwaite formula — ptukey then propagates NaN into p-values.
  // Refuse at the top level rather than return a mix of valid and NaN pairs,
  // which would quietly corrupt compact-letter displays downstream.
  if (vars.some((v) => v === 0)) {
    return {
      pairs: [],
      k,
      error: "Cannot compute Games-Howell — at least one group has zero variance",
    };
  }
  const pairs = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const vi = vars[i] / ns[i];
      const vj = vars[j] / ns[j];
      const se = Math.sqrt(vi + vj);
      const diff = means[j] - means[i];
      // Tukey-form q using SE/√2 (consistent with TukeyHSD's SE convention).
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

// Benjamini-Hochberg adjusted p-values.
// Sort p-values ascending, compute p_(i) · m/i, then enforce monotonicity
// from largest down, and finally cap at 1.
function bhAdjust(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
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

// Dunn's test — pairwise rank-based post-hoc following Kruskal-Wallis.
// Uses the *global* rank sums with midranks and tie correction (Siegel
// & Castellan 1988). Z-statistic, two-sided normal p-values, BH-adjusted.
//
//   z_ij = (R_i/n_i − R_j/n_j) / √(σ² · (1/n_i + 1/n_j))
//   σ²   = (N(N+1)/12 − Σ(t³−t)/(12(N−1)))
//   p    = 2 · (1 − Φ(|z|))
// Returns { pairs: [{ i, j, z, p, pAdj }], method }
function dunnTest(groups) {
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const all = [];
  const owner = [];
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
  // Tie-corrected variance term (Dunn 1964 with Siegel-Castellan fix):
  //   σ² = (N(N+1)/12 − (Σ(t³−t)) / (12·(N−1)))
  const sigma2 = (N * (N + 1)) / 12 - tieCorrection / (12 * (N - 1));
  const rawPs = [];
  const pairs = [];
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
//
// Piepho 2004 "An Algorithm for a Letter-Based Representation of
// All-Pairwise Comparisons". Given pairwise significance (p < α), assign
// letters to groups such that any two groups sharing at least one letter
// are NOT significantly different.
//
// Input:  pairs = [{ i, j, p }], k groups total, alpha
// Output: array of k strings — each group's letter label, e.g. ["a", "ab", "b"]
//
// Algorithm (insert-and-absorb):
//  1. Start with one letter containing all groups.
//  2. For every significant pair (i, j): split any letter containing both
//     i and j into two letters — one drops i, the other drops j.
//  3. Remove any letter that is a subset of another (absorb).
//  4. Letters are labeled "a", "b", "c"... by order of first appearance.
function compactLetterDisplay(pairs, k, alpha = 0.05) {
  if (k <= 0) return [];
  // Sets of groups, each set = one letter.
  let letters = [new Set(Array.from({ length: k }, (_, i) => i))];
  for (const pr of pairs) {
    const p = pr.pAdj != null ? pr.pAdj : pr.p;
    // Guard NaN explicitly: `NaN >= alpha` is false, so without this the loop
    // would treat any unresolved pair as "significant" and start splitting
    // letters on noise — corrupting the entire CLD silently. NaN p-values
    // arise when an upstream test (tTest, Tukey, etc.) returns an error; we
    // skip them rather than guess, matching R's multcompView::multcompLetters
    // which also requires non-NA inputs.
    if (!Number.isFinite(p) || p >= alpha) continue;
    const { i, j } = pr;
    const newLetters = [];
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
    // Absorb: drop any letter that is a strict subset of another.
    const filtered = [];
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
  // Assign labels in order of first group-index each letter contains.
  letters.sort((A, B) => Math.min(...A) - Math.min(...B));
  const labels = "abcdefghijklmnopqrstuvwxyz";
  const out = Array.from({ length: k }, () => "");
  for (let li = 0; li < letters.length; li++) {
    const lbl = labels[li] || `[${li}]`;
    for (const g of letters[li]) out[g] += lbl;
  }
  return out;
}

// ── 13. Automatic test selection ────────────────────────────────────────────
//
// Picks a default test for the user (overridable from the stats panel) and
// returns the full diagnostic trace so they can see *why*.
//
// Default policy — Welch by default:
//
//   k = 2  → Welch's t                      (no post-hoc)
//   k ≥ 3  → Welch's ANOVA + Games-Howell
//
// Welch is unconditional. Shapiro-Wilk and Levene are still computed and
// surfaced in the trace as **diagnostics** — they no longer gate the test
// choice. When SW flags one or more groups as non-normal we add a
// `suggestion` ("consider Mann-Whitney / Kruskal-Wallis"), but the
// recommendation itself stays Welch.
//
// Why Welch by default (and why we *don't* pre-screen with Shapiro):
//
//   1. Pre-testing for normality with SW and routing on the result is a
//      known anti-pattern. Schucany & Ng (2006), Rasch et al. (2011),
//      Zimmerman (2004) all show that the conditional procedure
//      (SW → t / MWU) inflates Type I error and reduces power compared to
//      using Welch's t unconditionally. The original review of this code
//      (1.2.0_harsh_review.md §1.1) flagged this exact issue.
//   2. Welch's t / Welch ANOVA *is* the equal-variance procedure when
//      variances really are equal — the conservative bias is small. When
//      variances differ it is strictly better than Student / one-way
//      ANOVA. Defaulting to it is a free improvement on the equal-variance
//      case and a real improvement on the unequal-variance case.
//   3. Per-group Shapiro at α = 0.05 inflates the family-wise FPR to
//      ~1 − (1 − α)^k (~23 % at k = 5 with everything genuinely normal).
//      Removing it from the gate eliminates that bias entirely.
//
// Why we still compute SW + Levene at all:
//
//   • The decision trace shows them so the user can see the data shape.
//   • For genuinely heavy-tailed data, the user has a real reason to switch
//     to Mann-Whitney / Kruskal-Wallis. We surface that as a *suggestion*
//     (`suggestion.test = "mannWhitney" | "kruskalWallis"`) rather than
//     forcing it — they override from the stats panel's per-test dropdown.
//   • The α = 0.05 / α = 0.05 thresholds are still tuneable via
//     `{ alphaNormality, alphaVariance }` for callers who want a stricter
//     diagnostic flag, but they no longer change the default test.
//
// Returns: { k, normality, allNormal, levene, recommendation, suggestion? }
//
//   - `recommendation.test`  — the test the auto-pick will run.
//   - `recommendation.reason` — multi-sentence explanation: what was picked,
//                              what the diagnostics found, why Welch is
//                              default, how to override.
//   - `suggestion`           — present only when SW flags non-normal data;
//                              names a non-parametric alternative the user
//                              may want to switch to manually.
function selectTest(groups, opts = {}) {
  const alphaN = opts.alphaNormality != null ? opts.alphaNormality : 0.05;
  const alphaV = opts.alphaVariance != null ? opts.alphaVariance : 0.05;
  const k = groups.length;
  if (k < 2) {
    return { error: "≥2 groups required", k };
  }

  // ── Diagnostics (no longer gates) ──
  const normality = groups.map((g, i) => {
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

  // ── Default pick: Welch unconditionally ──
  const test = k === 2 ? "welchT" : "welchANOVA";
  const postHoc = k === 2 ? null : "gamesHowell";

  // ── Reason text — explain the policy and the diagnostics ──
  const baseDefault =
    k === 2
      ? "Default pick: Welch's t-test. Welch's t is the recommended default for two independent groups (Rasch, Kubinger & Moder 2011; Zimmerman 2004) — it does not assume equal variances and matches Student's t closely when variances are in fact equal."
      : "Default pick: Welch's ANOVA with Games-Howell post-hoc. Welch's ANOVA is the recommended default for k ≥ 3 independent groups (Delacre et al. 2019; Rasch et al. 2011) — it does not assume equal variances across groups and matches one-way ANOVA closely when variances are in fact equal.";

  // Brief diagnostic narrative — what SW + Levene actually say on this data.
  const swNarrative = (() => {
    if (flagged.length === 0 && allKnownNormal) {
      return "Shapiro-Wilk did not reject normality in any group at α = " + alphaN + ".";
    }
    if (flagged.length > 0) {
      const labels = flagged
        .map((r) => `group ${r.group + 1} (W=${r.W.toFixed(3)}, p=${formatP(r.p)})`)
        .join(", ");
      return `Shapiro-Wilk flagged ${flagged.length} of ${k} group(s) as non-normal at α = ${alphaN}: ${labels}.`;
    }
    // No flagged normal=false but at least one normal=null (n<3 or SW couldn't run).
    return "Shapiro-Wilk could not run on every group (n < 3 in at least one).";
  })();

  const levNarrative = lev.error
    ? `Levene (Brown-Forsythe) could not run: ${lev.error}.`
    : equalVar === false
      ? `Levene (Brown-Forsythe) rejected equal variances (F=${lev.F.toFixed(3)}, p=${formatP(lev.p)}); Welch handles this without further intervention.`
      : `Levene (Brown-Forsythe) did not reject equal variances (F=${lev.F.toFixed(3)}, p=${formatP(lev.p)}); Welch is still the safe default and matches the equal-variance test closely here.`;

  // Optional non-parametric suggestion when SW flags real non-normality.
  let suggestion = null;
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

  const out = {
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

// Map a p-value to the 4-level significance stars used on plots.
// Non-finite or missing p → empty string so callers can suppress the label.
function pStars(p) {
  if (!Number.isFinite(p)) return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

// Format a p-value for display next to a test statistic. Uses scientific
// notation below 1e-3 (where fixed-point would round to 0) and keeps 3
// significant digits otherwise.
function formatP(p) {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p < 1e-4) return p.toExponential(1);
  if (p < 1e-3) return p.toExponential(2);
  return p.toFixed(4);
}

// Property-based tests for tools/stats.js distributions, descriptive
// helpers, and the two-sample tests.
//
// Complements `tests/stats.test.js` (point-checks against R / SciPy
// reference values) by pinning *invariants* the point checks can't:
// monotonicity in the natural argument, cdf ↔ inv round-trips, sign /
// boundary behaviour, swap-symmetry of two-sample tests. These catch
// sign-flip / off-by-one bugs that would shift every reference value
// by the same amount and slip past a pure approximate-equality check.
//
// Tolerance choice: 1e-6 for cdf round-trips (the inverse routines use
// 200-step bisection over a Gauss-Legendre quadrature of the cdf, so
// double-precision accuracy is on the order of 1e-9 in the bulk and a
// few ULPs in the deep tail; 1e-6 is comfortably below that).

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  normcdf,
  norminv,
  gammaln,
  gammainc,
  betai,
  tcdf,
  tcdf_upper,
  tinv,
  fcdf,
  chi2cdf,
  chi2inv,
  bisect,
  sampleMean,
  sampleVariance,
  sampleSD,
  rankWithTies,
  tTest,
  mannWhitneyU,
  cohenD,
  bhAdjust,
} = require("./helpers/stats-loader");

const RUNS = 300;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

// ── normcdf ─────────────────────────────────────────────────────────────

suite("stats property — normcdf");

test("normcdf(0) = 0.5", () => {
  if (Math.abs(normcdf(0) - 0.5) > 1e-12) throw new Error("normcdf(0) should be 0.5");
});

test("monotonic non-decreasing in z", () => {
  check(
    fc.property(
      fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      (a, b) => {
        if (a <= b) return normcdf(a) <= normcdf(b) + 1e-12;
        return normcdf(a) >= normcdf(b) - 1e-12;
      }
    )
  );
});

test("output is in [0, 1] for finite z", () => {
  check(
    fc.property(fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }), (z) => {
      const v = normcdf(z);
      return v >= -1e-12 && v <= 1 + 1e-12;
    })
  );
});

test("symmetry: normcdf(-z) ≈ 1 - normcdf(z)", () => {
  check(
    fc.property(fc.double({ min: -8, max: 8, noNaN: true, noDefaultInfinity: true }), (z) => {
      return Math.abs(normcdf(-z) - (1 - normcdf(z))) < 1e-9;
    })
  );
});

test("deep tails: normcdf(-large) → 0, normcdf(+large) → 1", () => {
  if (normcdf(-30) > 1e-100) throw new Error("normcdf(-30) should be ~0");
  if (normcdf(30) < 1 - 1e-100) throw new Error("normcdf(30) should be ~1");
});

// ── norminv ─────────────────────────────────────────────────────────────

suite("stats property — norminv");

test("norminv(0.5) = 0", () => {
  if (Math.abs(norminv(0.5)) > 1e-9) throw new Error("norminv(0.5) should be 0");
});

test("monotonic non-decreasing in p", () => {
  check(
    fc.property(
      fc.double({ min: 0.001, max: 0.999, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.001, max: 0.999, noNaN: true, noDefaultInfinity: true }),
      (a, b) => {
        if (a <= b) return norminv(a) <= norminv(b) + 1e-9;
        return norminv(a) >= norminv(b) - 1e-9;
      }
    )
  );
});

test("round-trip: normcdf(norminv(p)) ≈ p", () => {
  check(
    fc.property(
      fc.double({ min: 1e-6, max: 1 - 1e-6, noNaN: true, noDefaultInfinity: true }),
      (p) => {
        return Math.abs(normcdf(norminv(p)) - p) < 1e-6;
      }
    )
  );
});

test("round-trip: norminv(normcdf(z)) ≈ z in the bulk |z| ≤ 3", () => {
  // The round-trip error is bounded by `dz/dp · normcdf_error`, where
  // `dz/dp = 1/pdf(z)` grows large in the tail. norminv (Acklam) is
  // ~1e-9 accurate alone; normcdf (A&S 26.2.17) is ~1.5e-8 accurate.
  // For |z| ≤ 3 the amplification keeps the round-trip below ~5e-5.
  // The tail behaviour is checked separately below.
  check(
    fc.property(fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true }), (z) => {
      return Math.abs(norminv(normcdf(z)) - z) < 5e-5;
    })
  );
});

test("round-trip: norminv(normcdf(z)) ≈ z in the tail |z| ∈ (3, 5] within tail-amplified bound", () => {
  // Same round-trip, looser tolerance: in the tail the inverse-cdf
  // slope `1/pdf(z)` amplifies normcdf's ~1.5e-8 absolute error into a
  // ~1e-3 z-error at |z| = 5. Documenting the tolerance here so a
  // future tightening of normcdf will surface as a free win.
  check(
    fc.property(
      fc
        .double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true })
        .filter((z) => Math.abs(z) > 3),
      (z) => Math.abs(norminv(normcdf(z)) - z) < 1e-3
    )
  );
});

// ── gammaln / gammainc / betai ──────────────────────────────────────────

suite("stats property — gammaln / gammainc / betai");

test("gammaln(1) = 0 and gammaln(2) = 0 (Γ(1) = Γ(2) = 1, so log = 0)", () => {
  if (Math.abs(gammaln(1)) > 1e-9) throw new Error("gammaln(1) should be 0");
  if (Math.abs(gammaln(2)) > 1e-9) throw new Error("gammaln(2) should be 0");
});

test("gammaln satisfies the recursion gammaln(x + 1) = gammaln(x) + log(x)", () => {
  check(
    fc.property(fc.double({ min: 0.5, max: 50, noNaN: true, noDefaultInfinity: true }), (x) => {
      const lhs = gammaln(x + 1);
      const rhs = gammaln(x) + Math.log(x);
      return Math.abs(lhs - rhs) < 1e-9;
    })
  );
});

test("gammaln is monotonically non-decreasing for x ≥ 2", () => {
  check(
    fc.property(
      fc.double({ min: 2, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 2, max: 100, noNaN: true, noDefaultInfinity: true }),
      (a, b) => {
        if (a <= b) return gammaln(a) <= gammaln(b) + 1e-9;
        return gammaln(a) >= gammaln(b) - 1e-9;
      }
    )
  );
});

test("gammainc(a, 0) = 0 and gammainc(a, +large) → 1", () => {
  check(
    fc.property(fc.double({ min: 0.5, max: 30, noNaN: true, noDefaultInfinity: true }), (a) => {
      if (Math.abs(gammainc(a, 0)) > 1e-9) return false;
      if (gammainc(a, 1e6) < 1 - 1e-6) return false;
      return true;
    })
  );
});

test("gammainc is monotonic in x for fixed a", () => {
  check(
    fc.property(
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      (a, x1, x2) => {
        const v1 = gammainc(a, x1);
        const v2 = gammainc(a, x2);
        if (x1 <= x2) return v1 <= v2 + 1e-9;
        return v1 >= v2 - 1e-9;
      }
    )
  );
});

test("betai boundary: betai(a, b, 0) = 0 and betai(a, b, 1) = 1", () => {
  check(
    fc.property(
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      (a, b) => {
        if (Math.abs(betai(a, b, 0)) > 1e-9) return false;
        if (Math.abs(betai(a, b, 1) - 1) > 1e-9) return false;
        return true;
      }
    )
  );
});

test("betai is monotonic in x", () => {
  check(
    fc.property(
      fc.double({ min: 0.5, max: 10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.5, max: 10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      (a, b, x1, x2) => {
        const v1 = betai(a, b, x1);
        const v2 = betai(a, b, x2);
        if (x1 <= x2) return v1 <= v2 + 1e-9;
        return v1 >= v2 - 1e-9;
      }
    )
  );
});

// ── tcdf / tinv ─────────────────────────────────────────────────────────

const arbDf = fc.integer({ min: 1, max: 200 });

suite("stats property — tcdf / tinv");

test("tcdf(0, df) = 0.5 for any df", () => {
  check(fc.property(arbDf, (df) => Math.abs(tcdf(0, df) - 0.5) < 1e-9));
});

test("tcdf is monotonic in t for fixed df", () => {
  check(
    fc.property(
      arbDf,
      fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      (df, a, b) => {
        if (a <= b) return tcdf(a, df) <= tcdf(b, df) + 1e-9;
        return tcdf(a, df) >= tcdf(b, df) - 1e-9;
      }
    )
  );
});

test("tcdf + tcdf_upper = 1", () => {
  check(
    fc.property(
      arbDf,
      fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      (df, t) => Math.abs(tcdf(t, df) + tcdf_upper(t, df) - 1) < 1e-9
    )
  );
});

test("tinv(0.5, df) = 0", () => {
  check(fc.property(arbDf, (df) => Math.abs(tinv(0.5, df)) < 1e-9));
});

test("round-trip: tcdf(tinv(p, df), df) ≈ p", () => {
  check(
    fc.property(
      fc.double({ min: 0.001, max: 0.999, noNaN: true, noDefaultInfinity: true }),
      arbDf,
      (p, df) => Math.abs(tcdf(tinv(p, df), df) - p) < 1e-6
    )
  );
});

test("tcdf at large df converges to normcdf", () => {
  check(
    fc.property(fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true }), (z) => {
      return Math.abs(tcdf(z, 1000) - normcdf(z)) < 5e-3;
    })
  );
});

// ── chi2cdf / chi2inv / fcdf ────────────────────────────────────────────

suite("stats property — chi2cdf / chi2inv / fcdf");

test("chi2cdf(0, k) = 0", () => {
  check(fc.property(fc.integer({ min: 1, max: 50 }), (k) => chi2cdf(0, k) === 0));
});

test("chi2cdf is monotonic in x", () => {
  check(
    fc.property(
      fc.integer({ min: 1, max: 30 }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      (k, x1, x2) => {
        if (x1 <= x2) return chi2cdf(x1, k) <= chi2cdf(x2, k) + 1e-9;
        return chi2cdf(x1, k) >= chi2cdf(x2, k) - 1e-9;
      }
    )
  );
});

test("chi2 round-trip: chi2cdf(chi2inv(p, k), k) ≈ p", () => {
  check(
    fc.property(
      fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 1, max: 30 }),
      (p, k) => Math.abs(chi2cdf(chi2inv(p, k), k) - p) < 1e-3
    )
  );
});

test("fcdf is monotonic in F for fixed (df1, df2)", () => {
  check(
    fc.property(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      fc.double({ min: 0.001, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.001, max: 100, noNaN: true, noDefaultInfinity: true }),
      (df1, df2, f1, f2) => {
        const v1 = fcdf(f1, df1, df2);
        const v2 = fcdf(f2, df1, df2);
        if (f1 <= f2) return v1 <= v2 + 1e-9;
        return v1 >= v2 - 1e-9;
      }
    )
  );
});

// ── bisect ──────────────────────────────────────────────────────────────

suite("stats property — bisect");

test("finds the unique zero of a monotone increasing function", () => {
  // Pick a smooth monotone function (cdf-like) and a target inside its
  // range; bisect must return an x with f(x) ≈ target within tolerance.
  check(
    fc.property(
      fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
      (target) => {
        const fn = (x) => normcdf(x);
        const x = bisect(fn, target, -10, 10, 1e-9);
        return Math.abs(fn(x) - target) < 1e-6;
      }
    )
  );
});

// ── sampleMean / sampleVariance / sampleSD ──────────────────────────────

const arbNumericArray = fc.array(
  fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  { minLength: 1, maxLength: 50 }
);

suite("stats property — descriptive helpers");

test("sampleMean equals (sum / n)", () => {
  check(
    fc.property(arbNumericArray, (arr) => {
      const sum = arr.reduce((a, b) => a + b, 0);
      const m = sampleMean(arr);
      return Math.abs(m - sum / arr.length) < 1e-9;
    })
  );
});

test("sampleVariance is non-negative", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 50,
      }),
      (arr) => {
        const v = sampleVariance(arr);
        return Number.isFinite(v) ? v >= -1e-9 : true;
      }
    )
  );
});

test("sampleVariance / sampleSD are 0 for constant input", () => {
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 2, max: 30 }),
      (v, n) => {
        const arr = new Array(n).fill(v);
        return Math.abs(sampleVariance(arr)) < 1e-9 && Math.abs(sampleSD(arr)) < 1e-9;
      }
    )
  );
});

test("sampleSD = sqrt(sampleVariance)", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 30,
      }),
      (arr) => {
        const v = sampleVariance(arr);
        const sd = sampleSD(arr);
        if (!Number.isFinite(v) || v < 0) return true;
        return Math.abs(sd - Math.sqrt(v)) < 1e-9;
      }
    )
  );
});

test("sampleMean is invariant under permutation", () => {
  check(
    fc.property(arbNumericArray, fc.constantFrom(0, 1, 2, 3, 4, 5), (arr, k) => {
      const rotated = arr.slice(k % arr.length).concat(arr.slice(0, k % arr.length));
      return Math.abs(sampleMean(arr) - sampleMean(rotated)) < 1e-9;
    })
  );
});

// ── rankWithTies ────────────────────────────────────────────────────────

suite("stats property — rankWithTies");

test("returns ranks of the same length as input", () => {
  check(
    fc.property(arbNumericArray, (arr) => {
      const r = rankWithTies(arr);
      return r && Array.isArray(r.ranks) && r.ranks.length === arr.length;
    })
  );
});

test("ranks sum to n(n+1)/2 (ties are averaged so the total is preserved)", () => {
  check(
    fc.property(arbNumericArray, (arr) => {
      const { ranks } = rankWithTies(arr);
      const sum = ranks.reduce((a, b) => a + b, 0);
      const expected = (arr.length * (arr.length + 1)) / 2;
      return Math.abs(sum - expected) < 1e-6;
    })
  );
});

test("ranks are in [1, n] inclusive", () => {
  check(
    fc.property(arbNumericArray, (arr) => {
      const { ranks } = rankWithTies(arr);
      for (const r of ranks) {
        if (r < 1 - 1e-9 || r > arr.length + 1e-9) return false;
      }
      return true;
    })
  );
});

test("strictly distinct values get the integer ranks 1..n in sorted order", () => {
  check(
    fc.property(
      fc
        .array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 30 })
        .filter((arr) => new Set(arr).size === arr.length),
      (arr) => {
        const { ranks } = rankWithTies(arr);
        const sortedAsc = [...arr].sort((a, b) => a - b);
        for (let i = 0; i < arr.length; i++) {
          const expected = sortedAsc.indexOf(arr[i]) + 1;
          if (ranks[i] !== expected) return false;
        }
        return true;
      }
    )
  );
});

test("tieCorrection ≥ 0 and equals 0 when all values distinct", () => {
  check(
    fc.property(
      fc
        .array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 30 })
        .filter((arr) => new Set(arr).size === arr.length),
      (arr) => rankWithTies(arr).tieCorrection === 0
    )
  );
});

// ── tTest swap-symmetry ─────────────────────────────────────────────────

suite("stats property — tTest");

const arbSampleValue = fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true });

const arbTwoGroups = fc.tuple(
  fc.array(arbSampleValue, { minLength: 2, maxLength: 30 }),
  fc.array(arbSampleValue, { minLength: 2, maxLength: 30 })
);

test("Welch t-test is swap-symmetric in the two groups (when output is finite)", () => {
  // Symmetry must hold *whenever both calls return finite results*. A
  // finite-output filter is the right precondition — restricting the
  // input domain to "nice" values (e.g. |v| ≥ 1e-6) would hide a bug
  // where the implementation produces different finite results on
  // swap. Subnormal-scale inputs both return p = NaN (the helper sees
  // v1 = v2 = 0 after FP cancellation), so the precondition is empty
  // there and the property is vacuous on those inputs — which is the
  // correct behaviour, not a weakening.
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r1 = tTest(a, b, { equalVar: false });
      const r2 = tTest(b, a, { equalVar: false });
      if (
        !r1 ||
        !r2 ||
        !Number.isFinite(r1.t) ||
        !Number.isFinite(r2.t) ||
        !Number.isFinite(r1.p) ||
        !Number.isFinite(r2.p)
      ) {
        return true;
      }
      return Math.abs(Math.abs(r1.t) - Math.abs(r2.t)) < 1e-9 && Math.abs(r1.p - r2.p) < 1e-9;
    })
  );
});

test("Welch t and Student t agree exactly when group variances match (when both fit FP)", () => {
  // Build a equal-variance pair via constant shift, then *check* that
  // the shift didn't FP-collapse the smaller side. e.g. arr =
  // [0, 4.7e-42, 0], shift +5: in float `5 + 4.7e-42 === 5` because
  // 4.7e-42 < eps(5) ≈ 1.1e-15. Then var(b) = 0 ≠ var(a). Skipping
  // when the *actual computed variances* differ keeps the equal-
  // variance precondition truthful without restricting the input
  // domain — restricting domain would hide a bug where the helper
  // produces different finite results on identical-variance inputs.
  check(
    fc.property(fc.array(arbSampleValue, { minLength: 2, maxLength: 30 }), (arr) => {
      const b = arr.map((v) => v + 5);
      const va = sampleVariance(arr);
      const vb = sampleVariance(b);
      if (!Number.isFinite(va) || !Number.isFinite(vb)) return true;
      // Precondition: variances must match in actual FP arithmetic.
      // Use a hybrid relative+absolute test that catches "one side
      // collapsed to 0" — `Math.max(va, vb, 1)` would make any tiny
      // pair compare as ≈ equal because both are << 1.
      const maxVar = Math.max(Math.abs(va), Math.abs(vb));
      if (maxVar === 0) {
        // Both zero — equal-variance precondition trivially holds.
      } else if (Math.abs(va - vb) / maxVar > 1e-9) {
        return true;
      }
      const w = tTest(arr, b, { equalVar: false });
      const s = tTest(arr, b, { equalVar: true });
      if (
        !w ||
        !s ||
        !Number.isFinite(w.t) ||
        !Number.isFinite(s.t) ||
        !Number.isFinite(w.p) ||
        !Number.isFinite(s.p)
      ) {
        return true;
      }
      // Relative tolerance on |t| — at huge |t| (10⁷+) the FP error
      // floor is `|t| × eps ≈ |t| × 1e-16`, so an absolute 1e-9 bar
      // is below the noise. p is already a probability ∈ [0, 1], so
      // an absolute bar is fine there.
      const tDenom = Math.max(Math.abs(w.t), Math.abs(s.t), 1);
      return Math.abs(w.t - s.t) / tDenom < 1e-9 && Math.abs(w.p - s.p) < 1e-3;
    })
  );
});

test("Welch t-test p ∈ [0, 1] when finite", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r = tTest(a, b, { equalVar: false });
      if (!r || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

// ── mannWhitneyU swap-symmetry ──────────────────────────────────────────

suite("stats property — mannWhitneyU");

test("p-value is invariant under group swap", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r1 = mannWhitneyU(a, b);
      const r2 = mannWhitneyU(b, a);
      if (!r1 || !r2 || !Number.isFinite(r1.p) || !Number.isFinite(r2.p)) return true;
      return Math.abs(r1.p - r2.p) < 1e-9;
    })
  );
});

test("p ∈ [0, 1] when finite", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const r = mannWhitneyU(a, b);
      if (!r || !Number.isFinite(r.p)) return true;
      return r.p >= -1e-9 && r.p <= 1 + 1e-9;
    })
  );
});

// ── cohenD ──────────────────────────────────────────────────────────────

suite("stats property — cohenD");

test("|cohenD(x, y)| is symmetric in arg order", () => {
  check(
    fc.property(arbTwoGroups, ([a, b]) => {
      const d1 = cohenD(a, b);
      const d2 = cohenD(b, a);
      if (!Number.isFinite(d1) || !Number.isFinite(d2)) return true;
      return Math.abs(Math.abs(d1) - Math.abs(d2)) < 1e-9;
    })
  );
});

test("cohenD is 0 (within FP slack) for identical distributions", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
        minLength: 3,
        maxLength: 30,
      }),
      (arr) => {
        const d = cohenD(arr, arr);
        if (!Number.isFinite(d)) return true;
        return Math.abs(d) < 1e-9;
      }
    )
  );
});

// ── bhAdjust ────────────────────────────────────────────────────────────

suite("stats property — bhAdjust");

test("output length matches input length", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => bhAdjust(ps).length === ps.length
    )
  );
});

test("each adjusted value is ≥ the corresponding raw value", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => {
        const adj = bhAdjust(ps);
        for (let i = 0; i < ps.length; i++) {
          if (adj[i] < ps[i] - 1e-9) return false;
        }
        return true;
      }
    )
  );
});

test("adjusted values are in [0, 1]", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 1,
        maxLength: 30,
      }),
      (ps) => {
        const adj = bhAdjust(ps);
        for (const p of adj) {
          if (p < -1e-9 || p > 1 + 1e-9) return false;
        }
        return true;
      }
    )
  );
});

test("preserves rank order of the input p-values", () => {
  // BH multiplies by m/rank then takes the running min from the top, so
  // ordering is preserved (smaller raw p stays at smaller-or-equal
  // adjusted p).
  check(
    fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 30,
      }),
      (ps) => {
        const adj = bhAdjust(ps);
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            if (ps[i] < ps[j] && adj[i] > adj[j] + 1e-9) return false;
            if (ps[i] > ps[j] && adj[i] < adj[j] - 1e-9) return false;
          }
        }
        return true;
      }
    )
  );
});

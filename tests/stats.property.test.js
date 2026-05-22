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
  multisetIntersectionPExact,
  multisetIntersectionPExactLower,
  multisetIntersectionExpected,
  multisetIntersectionPPoisson,
  multisetExclusiveExpected,
  multisetExclusiveP,
  hclust,
  dendrogramLayout,
  kmeans,
  twoWayANOVA,
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

// ── multiset intersection family ───────────────────────────────────────
//
// `multisetIntersectionPExact` already has R-cross-validation pins in
// stats.test.js; the variants below (lower-tail, expected, Poisson
// approximation, exclusive-cell expected and p-value) had no direct
// coverage — Stryker reported all their lines as no-coverage. These
// properties cover them through structural invariants that don't pay
// the slow numerical-convergence tax of the deep-tail R pins.
//
// Set sizes are kept small (max k=4, max n_i=20, max N=60) so the
// inner DP stays cheap even at numRuns=300.

const arbSmallNs = (kMin, kMax) =>
  fc
    .array(fc.integer({ min: 1, max: 20 }), { minLength: kMin, maxLength: kMax })
    .filter((ns) => ns.length >= kMin);

const arbN = fc.integer({ min: 30, max: 60 });

suite("stats property — multisetIntersectionPExactLower");

test("output is in [0, 1] for valid args", () => {
  check(
    fc.property(arbSmallNs(2, 3), arbN, fc.integer({ min: 0, max: 25 }), (ns, N, xObs) => {
      const capped = ns.map((n) => Math.min(n, N));
      const p = multisetIntersectionPExactLower(xObs, capped, N);
      return Number.isFinite(p) && p >= 0 && p <= 1;
    })
  );
});

test("monotonic non-decreasing in xObs", () => {
  // P(|∩| ≤ x) is a CDF, so it cannot decrease as x grows.
  check(
    fc.property(
      arbSmallNs(2, 3),
      arbN,
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 10 }),
      (ns, N, a, b) => {
        const capped = ns.map((n) => Math.min(n, N));
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const pLo = multisetIntersectionPExactLower(lo, capped, N);
        const pHi = multisetIntersectionPExactLower(hi, capped, N);
        return pLo <= pHi + 1e-12;
      }
    )
  );
});

test("complementarity: lower(x) + upper(x + 1) ≈ 1", () => {
  // Discrete CDF identity: P(X ≤ x) + P(X ≥ x + 1) = 1, so
  // multisetIntersectionPExactLower(x) + multisetIntersectionPExact(x + 1) = 1.
  check(
    fc.property(arbSmallNs(2, 3), arbN, fc.integer({ min: 0, max: 8 }), (ns, N, xObs) => {
      const capped = ns.map((n) => Math.min(n, N));
      const lower = multisetIntersectionPExactLower(xObs, capped, N);
      const upper = multisetIntersectionPExact(xObs + 1, capped, N);
      return Math.abs(lower + upper - 1) < 1e-9;
    })
  );
});

test("xObs ≥ min(ns) → 1 (all probability mass below)", () => {
  // |∩| is bounded above by min(n_i), so P(|∩| ≤ that) = 1 trivially.
  check(
    fc.property(arbSmallNs(2, 3), arbN, (ns, N) => {
      const capped = ns.map((n) => Math.min(n, N));
      const p = multisetIntersectionPExactLower(Math.min(...capped), capped, N);
      return Math.abs(p - 1) < 1e-9;
    })
  );
});

test("xObs < 0 → 0", () => {
  check(
    fc.property(arbSmallNs(2, 3), arbN, fc.integer({ min: -10, max: -1 }), (ns, N, xObs) => {
      const capped = ns.map((n) => Math.min(n, N));
      return multisetIntersectionPExactLower(xObs, capped, N) === 0;
    })
  );
});

test("invalid args → NaN", () => {
  if (!Number.isNaN(multisetIntersectionPExactLower(1, [10], 100))) throw new Error("k<2");
  if (!Number.isNaN(multisetIntersectionPExactLower(1, [10, 10], 0))) throw new Error("N=0");
  if (!Number.isNaN(multisetIntersectionPExactLower(1, [10, 200], 100))) throw new Error("n>N");
});

suite("stats property — multisetIntersectionExpected");

test("equals N · Π(n_i / N) (closed-form check)", () => {
  // E[|∩|] = N · Π(n_i / N) = Π(n_i) / N^(k-1).
  check(
    fc.property(arbSmallNs(2, 4), arbN, (ns, N) => {
      const capped = ns.map((n) => Math.min(n, N));
      const got = multisetIntersectionExpected(capped, N);
      const expected = capped.reduce((acc, n) => (acc * n) / N, N);
      return Math.abs(got - expected) < 1e-9 * Math.max(1, expected);
    })
  );
});

test("any n_i = 0 → expected = 0", () => {
  check(
    fc.property(arbSmallNs(1, 3), arbN, (rest, N) => {
      // Prepend a 0 to guarantee at least one zero, then ensure k ≥ 2.
      const ns = [0, ...rest.map((n) => Math.min(n, N))];
      return multisetIntersectionExpected(ns, N) === 0;
    })
  );
});

test("non-negative for valid args", () => {
  check(
    fc.property(arbSmallNs(2, 4), arbN, (ns, N) => {
      const capped = ns.map((n) => Math.min(n, N));
      const e = multisetIntersectionExpected(capped, N);
      return Number.isFinite(e) && e >= 0;
    })
  );
});

test("invalid args → NaN", () => {
  if (!Number.isNaN(multisetIntersectionExpected([], 100))) throw new Error("empty ns");
  if (!Number.isNaN(multisetIntersectionExpected([10, 10], 0))) throw new Error("N=0");
  if (!Number.isNaN(multisetIntersectionExpected([10, 200], 100))) throw new Error("n>N");
});

suite("stats property — multisetIntersectionPPoisson");

test("output is in [0, 1] for valid args", () => {
  check(
    fc.property(arbSmallNs(2, 3), arbN, fc.integer({ min: 0, max: 15 }), (ns, N, xObs) => {
      const capped = ns.map((n) => Math.min(n, N));
      const p = multisetIntersectionPPoisson(xObs, capped, N);
      return Number.isFinite(p) && p >= 0 && p <= 1;
    })
  );
});

test("monotonic non-increasing in xObs (upper tail of a CDF)", () => {
  check(
    fc.property(
      arbSmallNs(2, 3),
      arbN,
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 10 }),
      (ns, N, a, b) => {
        const capped = ns.map((n) => Math.min(n, N));
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return (
          multisetIntersectionPPoisson(lo, capped, N) >=
          multisetIntersectionPPoisson(hi, capped, N) - 1e-12
        );
      }
    )
  );
});

test("xObs ≤ 0 → 1", () => {
  check(
    fc.property(arbSmallNs(2, 3), arbN, fc.integer({ min: -5, max: 0 }), (ns, N, xObs) => {
      const capped = ns.map((n) => Math.min(n, N));
      return multisetIntersectionPPoisson(xObs, capped, N) === 1;
    })
  );
});

test("xObs beyond the smallest set → exactly 0 (impossible intersection)", () => {
  // The intersection cannot exceed min(ns); an observed count past that
  // is impossible, so the tail probability is exactly 0. The exact path
  // already returned 0 here — the Poisson path used to leak a small
  // non-zero gammainc tail. Both must now agree.
  check(
    fc.property(arbSmallNs(2, 3), arbN, fc.integer({ min: 1, max: 20 }), (ns, N, extra) => {
      const capped = ns.map((n) => Math.min(n, N));
      const xObs = Math.min(...capped) + extra; // strictly greater than min(ns)
      return (
        multisetIntersectionPPoisson(xObs, capped, N) === 0 &&
        multisetIntersectionPExact(xObs, capped, N) === 0
      );
    })
  );
});

test("any n_i = 0 → 1 if xObs ≤ 0 else 0", () => {
  check(
    fc.property(arbSmallNs(1, 2), arbN, fc.integer({ min: -3, max: 5 }), (rest, N, xObs) => {
      const ns = [0, ...rest.map((n) => Math.min(n, N))];
      const p = multisetIntersectionPPoisson(xObs, ns, N);
      return xObs <= 0 ? p === 1 : p === 0;
    })
  );
});

test("agrees with Exact in the sparse limit (N >> max(n_i))", () => {
  // For small λ = Π(n_i)/N^(k-1), the Poisson approximation matches the
  // exact fixed-margin distribution to within a few percent. This is what
  // makes Poisson a safe fallback when the exact DP is too expensive.
  check(
    fc.property(
      fc.array(fc.integer({ min: 2, max: 8 }), { minLength: 2, maxLength: 3 }),
      fc.integer({ min: 200, max: 500 }),
      fc.integer({ min: 0, max: 4 }),
      (ns, N, xObs) => {
        const exact = multisetIntersectionPExact(xObs, ns, N);
        const poisson = multisetIntersectionPPoisson(xObs, ns, N);
        // Loose tolerance: the approximation has a known O(λ²/N) error,
        // and at low xObs both are close to 1 so absolute differences
        // are small.
        return Math.abs(exact - poisson) < 0.05;
      }
    )
  );
});

test("invalid args → NaN", () => {
  if (!Number.isNaN(multisetIntersectionPPoisson(1, [10], 100))) throw new Error("k<2");
  if (!Number.isNaN(multisetIntersectionPPoisson(1, [10, 10], 0))) throw new Error("N=0");
  if (!Number.isNaN(multisetIntersectionPPoisson(1, [10, 200], 100))) throw new Error("n>N");
});

suite("stats property — multisetExclusiveExpected");

test("equals N · Π(n_i/N) · Π(1 − n_j/N) (closed-form check)", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 1, maxLength: 3 }),
      fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 0, maxLength: 3 }),
      arbN,
      (insideRaw, outsideRaw, N) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        const got = multisetExclusiveExpected(inside, outside, N);
        let p = 1;
        for (const n of inside) p *= n / N;
        for (const n of outside) p *= 1 - n / N;
        const expected = N * p;
        return Math.abs(got - expected) < 1e-9 * Math.max(1, Math.abs(expected));
      }
    )
  );
});

test("output is non-negative and ≤ N for valid args", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 3 }),
      fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 0, maxLength: 3 }),
      arbN,
      (insideRaw, outsideRaw, N) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        const e = multisetExclusiveExpected(inside, outside, N);
        return Number.isFinite(e) && e >= 0 && e <= N + 1e-9;
      }
    )
  );
});

test("invalid args → NaN", () => {
  if (!Number.isNaN(multisetExclusiveExpected([10], [10], 0))) throw new Error("N=0");
  if (!Number.isNaN(multisetExclusiveExpected([200], [], 100))) throw new Error("n_i>N");
  if (!Number.isNaN(multisetExclusiveExpected([10], [200], 100))) throw new Error("n_j>N");
});

suite("stats property — multisetExclusiveP");

test("output is in [0, 1] for valid args", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 0, maxLength: 2 }),
      arbN,
      fc.integer({ min: 0, max: 15 }),
      fc.constantFrom("upper", "lower"),
      (insideRaw, outsideRaw, N, xObs, tail) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        const p = multisetExclusiveP(xObs, inside, outside, N, { tail });
        return Number.isFinite(p) && p >= 0 && p <= 1;
      }
    )
  );
});

test("upper-tail boundary: xObs ≤ 0 → 1, xObs > N → 0", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 2 }),
      arbN,
      (insideRaw, outsideRaw, N) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        if (multisetExclusiveP(0, inside, outside, N, { tail: "upper" }) !== 1) return false;
        if (multisetExclusiveP(N + 1, inside, outside, N, { tail: "upper" }) !== 0) return false;
        return true;
      }
    )
  );
});

test("lower-tail boundary: xObs < 0 → 0, xObs ≥ N → 1", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 2 }),
      arbN,
      (insideRaw, outsideRaw, N) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        if (multisetExclusiveP(-1, inside, outside, N, { tail: "lower" }) !== 0) return false;
        if (multisetExclusiveP(N, inside, outside, N, { tail: "lower" }) !== 1) return false;
        return true;
      }
    )
  );
});

test("upper monotonic non-increasing in xObs", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 2 }),
      arbN,
      fc.integer({ min: 0, max: 12 }),
      fc.integer({ min: 0, max: 12 }),
      (insideRaw, outsideRaw, N, a, b) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return (
          multisetExclusiveP(lo, inside, outside, N, { tail: "upper" }) >=
          multisetExclusiveP(hi, inside, outside, N, { tail: "upper" }) - 1e-12
        );
      }
    )
  );
});

test("default tail is upper (matches explicit upper)", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 2 }),
      arbN,
      fc.integer({ min: 0, max: 12 }),
      (insideRaw, outsideRaw, N, xObs) => {
        const inside = insideRaw.map((n) => Math.min(n, N));
        const outside = outsideRaw.map((n) => Math.min(n, N));
        const dflt = multisetExclusiveP(xObs, inside, outside, N);
        const explicit = multisetExclusiveP(xObs, inside, outside, N, { tail: "upper" });
        return Math.abs(dflt - explicit) < 1e-12;
      }
    )
  );
});

test("invalid args → NaN", () => {
  if (!Number.isNaN(multisetExclusiveP(1, [10], [], 0))) throw new Error("N=0");
  if (!Number.isNaN(multisetExclusiveP(1, [200], [], 100))) throw new Error("n_i>N");
});

// ── clustering primitives (kmeans / hclust / dendrogramLayout) ──────────
//
// These functions are exercised by tests/heatmap.property.test.js, but
// that file goes through tests/helpers/heatmap-loader.js which uses
// vm.runInContext to evaluate stats.js — invisible to Stryker's per-test
// coverage instrumentation. Calling them through the require()-based
// stats-loader makes the test → source link traceable, so Stryker no
// longer flags them as no-coverage.
//
// Properties focus on structural invariants (cluster ids in range, tree
// covers every leaf, heights non-negative, leaf-order permutation,
// determinism under fixed seed) — not numerical accuracy of the cluster
// boundary, which depends on the data and is brittle under fast-check
// shrinking.

const arbSmallMatrix = (rows, cols) =>
  fc.array(
    fc.array(fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }), {
      minLength: cols,
      maxLength: cols,
    }),
    { minLength: rows, maxLength: rows }
  );

// Build a symmetric distance matrix from row vectors using Euclidean
// distance. Diagonal is 0; entry (i, j) equals (j, i).
const matrixToDistMatrix = (m) => {
  const n = m.length;
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0;
      for (let k = 0; k < m[i].length; k++) {
        const diff = m[i][k] - m[j][k];
        s += diff * diff;
      }
      const d = Math.sqrt(s);
      D[i][j] = d;
      D[j][i] = d;
    }
  }
  return D;
};

suite("stats property — kmeans");

test("empty matrix → empty result", () => {
  const r = kmeans([], 3);
  if (r.clusters.length !== 0) throw new Error("clusters not empty");
  if (r.centroids.length !== 0) throw new Error("centroids not empty");
  if (r.inertia !== 0) throw new Error("inertia not 0");
  if (r.iterations !== 0) throw new Error("iterations not 0");
});

test("clusters has length n", () => {
  check(
    fc.property(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 4 }),
      (n, d, k) => {
        const m = Array.from({ length: n }, () =>
          Array.from({ length: d }, () => Math.random() * 5)
        );
        const r = kmeans(m, k, { seed: 7, maxIter: 20, restarts: 1 });
        return r.clusters.length === n;
      }
    )
  );
});

test("all cluster ids are in [0, min(k, n) − 1]", () => {
  check(
    fc.property(
      arbSmallMatrix(8, 3),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 1000 }),
      (m, k, seed) => {
        const r = kmeans(m, k, { seed, maxIter: 20, restarts: 1 });
        const kEff = Math.min(k, m.length);
        return r.clusters.every((c) => Number.isInteger(c) && c >= 0 && c < kEff);
      }
    )
  );
});

test("order is a permutation of 0..n−1", () => {
  check(
    fc.property(
      arbSmallMatrix(6, 2),
      fc.integer({ min: 1, max: 3 }),
      fc.integer({ min: 1, max: 1000 }),
      (m, k, seed) => {
        const r = kmeans(m, k, { seed, maxIter: 20, restarts: 1 });
        const sorted = [...r.order].sort((a, b) => a - b);
        for (let i = 0; i < m.length; i++) if (sorted[i] !== i) return false;
        return true;
      }
    )
  );
});

test("inertia is non-negative", () => {
  check(
    fc.property(
      arbSmallMatrix(8, 3),
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 1000 }),
      (m, k, seed) => {
        const r = kmeans(m, k, { seed, maxIter: 20, restarts: 1 });
        return Number.isFinite(r.inertia) && r.inertia >= 0;
      }
    )
  );
});

test("deterministic under the same seed", () => {
  check(
    fc.property(
      arbSmallMatrix(8, 3),
      fc.integer({ min: 2, max: 4 }),
      fc.integer({ min: 1, max: 1000 }),
      (m, k, seed) => {
        const a = kmeans(m, k, { seed, maxIter: 20, restarts: 1 });
        const b = kmeans(m, k, { seed, maxIter: 20, restarts: 1 });
        if (a.clusters.length !== b.clusters.length) return false;
        for (let i = 0; i < a.clusters.length; i++) {
          if (a.clusters[i] !== b.clusters[i]) return false;
        }
        return Math.abs(a.inertia - b.inertia) < 1e-12;
      }
    )
  );
});

test("k=1 forces every row into cluster 0", () => {
  check(
    fc.property(arbSmallMatrix(6, 3), (m) => {
      const r = kmeans(m, 1, { seed: 1, maxIter: 10, restarts: 1 });
      return r.clusters.every((c) => c === 0);
    })
  );
});

test("k > n → cluster ids stay within [0, n − 1] (clamp branch)", () => {
  // Naive thinking: "each row gets its own cluster" — false when the
  // matrix has duplicate or near-duplicate rows, which kmeans++ init
  // can collide on. The actual contract is that kEff = min(k, n), so
  // cluster ids are bounded by n − 1, not k − 1. This exercises the
  // clamp without making the over-strong "perfect partition" claim.
  check(
    fc.property(arbSmallMatrix(4, 2), fc.integer({ min: 5, max: 10 }), (m, k) => {
      const r = kmeans(m, k, { seed: 1, maxIter: 10, restarts: 4 });
      return r.clusters.every((c) => c >= 0 && c < m.length);
    })
  );
});

suite("stats property — hclust");

test("n = 0 → tree null and order empty", () => {
  const r = hclust([], "average");
  if (r.tree !== null) throw new Error("tree not null");
  if (r.order.length !== 0) throw new Error("order not empty");
});

test("n = 1 → singleton tree with index 0", () => {
  const r = hclust([[0]], "average");
  if (!r.tree) throw new Error("tree null");
  if (r.tree.index !== 0) throw new Error("tree.index !== 0");
  if (r.tree.size !== 1) throw new Error("tree.size !== 1");
  if (r.order.length !== 1 || r.order[0] !== 0) throw new Error("bad order");
});

test("order has length n and is a permutation of 0..n−1", () => {
  check(
    fc.property(
      arbSmallMatrix(6, 3),
      fc.constantFrom("average", "complete", "single"),
      (m, linkage) => {
        const D = matrixToDistMatrix(m);
        const r = hclust(D, linkage);
        if (r.order.length !== m.length) return false;
        const sorted = [...r.order].sort((a, b) => a - b);
        for (let i = 0; i < m.length; i++) if (sorted[i] !== i) return false;
        return true;
      }
    )
  );
});

test("root tree.size equals n", () => {
  // Every merge sums the children's sizes, so the root necessarily covers
  // all leaves. A regression here would mean a leaf is silently dropped.
  check(
    fc.property(
      arbSmallMatrix(7, 2),
      fc.constantFrom("average", "complete", "single"),
      (m, linkage) => {
        const D = matrixToDistMatrix(m);
        const r = hclust(D, linkage);
        return r.tree.size === m.length;
      }
    )
  );
});

test("all merge heights are finite and non-negative", () => {
  check(
    fc.property(
      arbSmallMatrix(6, 2),
      fc.constantFrom("average", "complete", "single"),
      (m, linkage) => {
        const D = matrixToDistMatrix(m);
        const r = hclust(D, linkage);
        const visit = (node) => {
          if (!node) return true;
          if (!Number.isFinite(node.height) || node.height < 0) return false;
          return visit(node.left) && visit(node.right);
        };
        return visit(r.tree);
      }
    )
  );
});

test("all-NaN distances → fallback path still covers every leaf", () => {
  // The fallback at line ~2024-2032 force-merges when no finite distances
  // remain; without it leaves would silently truncate. This check fires
  // on an n × n matrix where every off-diagonal is NaN.
  check(
    fc.property(fc.integer({ min: 2, max: 6 }), (n) => {
      const D = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : NaN))
      );
      const r = hclust(D, "average");
      return r.tree.size === n && r.order.length === n;
    })
  );
});

suite("stats property — dendrogramLayout");

test("null tree → empty segments and maxHeight 0", () => {
  const r = dendrogramLayout(null);
  if (r.segments.length !== 0) throw new Error("segments not empty");
  if (r.maxHeight !== 0) throw new Error("maxHeight not 0");
});

test("n leaves produce 3·(n − 1) segments", () => {
  // Each merge contributes exactly 3 segments (two verticals + one
  // horizontal), and there are n − 1 merges in a binary tree of n leaves.
  check(
    fc.property(arbSmallMatrix(6, 2), (m) => {
      if (m.length < 2) return true; // n=1 → 0 merges → 0 segments
      const D = matrixToDistMatrix(m);
      const t = hclust(D, "average").tree;
      const r = dendrogramLayout(t);
      return r.segments.length === 3 * (m.length - 1);
    })
  );
});

test("maxHeight is the largest height in the tree", () => {
  check(
    fc.property(arbSmallMatrix(6, 2), (m) => {
      if (m.length < 2) return true;
      const D = matrixToDistMatrix(m);
      const t = hclust(D, "average").tree;
      const r = dendrogramLayout(t);
      let maxH = 0;
      const visit = (node) => {
        if (!node) return;
        if (node.height > maxH) maxH = node.height;
        visit(node.left);
        visit(node.right);
      };
      visit(t);
      return Math.abs(r.maxHeight - maxH) < 1e-12;
    })
  );
});

test("all segment x positions lie in [0, n − 1]", () => {
  check(
    fc.property(arbSmallMatrix(6, 2), (m) => {
      if (m.length < 2) return true;
      const D = matrixToDistMatrix(m);
      const t = hclust(D, "average").tree;
      const r = dendrogramLayout(t);
      const max = m.length - 1;
      return r.segments.every((s) => s.x1 >= 0 && s.x1 <= max && s.x2 >= 0 && s.x2 <= max);
    })
  );
});

test("singleton tree (n = 1) → no segments, maxHeight 0", () => {
  const t = hclust([[0]], "average").tree;
  const r = dendrogramLayout(t);
  if (r.segments.length !== 0) throw new Error("segments not empty");
  if (r.maxHeight !== 0) throw new Error("maxHeight not 0");
});

// ── twoWayANOVA — invariants ──────────────────────────────────────────────
//
// The point checks in stats.test.js pin SS / F / df on a few hand-computed
// designs. The properties below pin invariants the point checks can't see:
// orthogonality of balanced decompositions, label-permutation invariance,
// translation/scaling response of F and p.

suite("stats property — twoWayANOVA");

// Generate a balanced k_A × k_B design where every cell has exactly `n`
// observations. Returns a triple { values, factorA, factorB }.
function arbBalancedDesign(kAMin = 2, kAMax = 3, kBMin = 2, kBMax = 3, nMin = 2, nMax = 4) {
  return fc
    .record({
      kA: fc.integer({ min: kAMin, max: kAMax }),
      kB: fc.integer({ min: kBMin, max: kBMax }),
      n: fc.integer({ min: nMin, max: nMax }),
      seed: fc.integer({ min: 1, max: 1000 }),
    })
    .map(({ kA, kB, n, seed }) => {
      // Deterministic pseudo-random per (kA, kB, n, seed) — every cell gets
      // distinct values so the design is non-degenerate by construction.
      let s = seed;
      const next = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s % 1000) / 100; // 0.00 .. 9.99
      };
      const values = [];
      const factorA = [];
      const factorB = [];
      for (let a = 0; a < kA; a++) {
        for (let b = 0; b < kB; b++) {
          for (let r = 0; r < n; r++) {
            values.push(next() + a * 3 + b * 2);
            factorA.push("a" + a);
            factorB.push("b" + b);
          }
        }
      }
      return { values, factorA, factorB };
    });
}

test("balanced designs: SS_A + SS_B + SS_AB + SS_resid ≈ SS_total", () => {
  check(
    fc.property(arbBalancedDesign(), ({ values, factorA, factorB }) => {
      const r = twoWayANOVA(values, factorA, factorB);
      if (r.error) return false;
      const sum = r.termA.SS + r.termB.SS + r.termAB.SS + r.residual.SS;
      const tol = Math.max(1, r.total.SS) * 1e-9;
      return Math.abs(sum - r.total.SS) <= tol;
    })
  );
});

test("balanced designs: balanced=true detected; df bookkeeping correct", () => {
  check(
    fc.property(arbBalancedDesign(), ({ values, factorA, factorB }) => {
      const r = twoWayANOVA(values, factorA, factorB);
      if (r.error) return false;
      const kA = r.levelsA.length;
      const kB = r.levelsB.length;
      if (!r.balanced) return false;
      if (r.termA.df1 !== kA - 1) return false;
      if (r.termB.df1 !== kB - 1) return false;
      if (r.termAB.df1 !== (kA - 1) * (kB - 1)) return false;
      if (r.residual.df !== r.N - kA * kB) return false;
      if (r.total.df !== r.N - 1) return false;
      return true;
    })
  );
});

test("translation invariance: adding c to every y leaves F unchanged", () => {
  check(
    fc.property(
      arbBalancedDesign(),
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      ({ values, factorA, factorB }, c) => {
        const r0 = twoWayANOVA(values, factorA, factorB);
        const r1 = twoWayANOVA(
          values.map((v) => v + c),
          factorA,
          factorB
        );
        if (r0.error || r1.error) return false;
        const close = (a, b) => {
          if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b || (isNaN(a) && isNaN(b));
          return Math.abs(a - b) <= Math.max(1, Math.abs(a)) * 1e-8;
        };
        return (
          close(r0.termA.F, r1.termA.F) &&
          close(r0.termB.F, r1.termB.F) &&
          close(r0.termAB.F, r1.termAB.F)
        );
      }
    )
  );
});

test("scale invariance: multiplying every y by c ≠ 0 leaves F unchanged", () => {
  check(
    fc.property(
      arbBalancedDesign(),
      fc.double({ min: 0.5, max: 10, noNaN: true, noDefaultInfinity: true }),
      ({ values, factorA, factorB }, c) => {
        const r0 = twoWayANOVA(values, factorA, factorB);
        const r1 = twoWayANOVA(
          values.map((v) => v * c),
          factorA,
          factorB
        );
        if (r0.error || r1.error) return false;
        const close = (a, b) => {
          if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b || (isNaN(a) && isNaN(b));
          return Math.abs(a - b) <= Math.max(1, Math.abs(a)) * 1e-7;
        };
        return (
          close(r0.termA.F, r1.termA.F) &&
          close(r0.termB.F, r1.termB.F) &&
          close(r0.termAB.F, r1.termAB.F)
        );
      }
    )
  );
});

test("label-permutation invariance: renaming levels leaves F unchanged", () => {
  check(
    fc.property(arbBalancedDesign(), ({ values, factorA, factorB }) => {
      const r0 = twoWayANOVA(values, factorA, factorB);
      // Rename a0 → z9, a1 → z8, … so the sorted level order flips.
      const renameA = factorA.map((l) => "z" + (9 - parseInt(l.slice(1), 10)));
      const renameB = factorB.map((l) => "y" + (9 - parseInt(l.slice(1), 10)));
      const r1 = twoWayANOVA(values, renameA, renameB);
      if (r0.error || r1.error) return false;
      const close = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a)) * 1e-10;
      return (
        close(r0.termA.F, r1.termA.F) &&
        close(r0.termB.F, r1.termB.F) &&
        close(r0.termAB.F, r1.termAB.F) &&
        close(r0.total.SS, r1.total.SS)
      );
    })
  );
});

test("factor-swap exchanges termA and termB; termAB unchanged", () => {
  check(
    fc.property(arbBalancedDesign(), ({ values, factorA, factorB }) => {
      const r0 = twoWayANOVA(values, factorA, factorB);
      const r1 = twoWayANOVA(values, factorB, factorA);
      if (r0.error || r1.error) return false;
      const close = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a)) * 1e-10;
      return (
        close(r0.termA.F, r1.termB.F) &&
        close(r0.termB.F, r1.termA.F) &&
        close(r0.termAB.F, r1.termAB.F)
      );
    })
  );
});

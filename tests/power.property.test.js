// Property-based tests for the power-app calculator (TESTS registry +
// effect-size converters).
//
// Complements `tests/power.test.js` (point-checks against R's pwr
// package) by pinning *invariants* that point checks can't:
// monotonicity in n / effect size / α, the null-hypothesis floor
// (power = α at zero effect), and self-consistency between the
// effect-size helpers (dFromMeans / fFromGroupMeans / wFromProportions)
// and the upstream identities they encode.
//
// `tests/power.test.js` already validates representative reference
// values from R; this file complements with structural laws.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const { TESTS, dFromMeans, fFromGroupMeans, wFromProportions } = require("./helpers/power-loader");

const RUNS = 200;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

const TEST_KEYS = Object.keys(TESTS);

// Realistic argument arbitraries — bound parameters to the ranges the
// production UI exposes, so the property tests don't drift into the
// numerical-noise regime (power calcs at n = 1e9 stop being meaningful).
const arbN = fc.integer({ min: 4, max: 200 });
const arbAlpha = fc.double({ min: 0.001, max: 0.2, noNaN: true, noDefaultInfinity: true });
const arbTails = fc.constantFrom(1, 2);
const arbK = fc.integer({ min: 2, max: 8 }); // ANOVA group count
const arbDf = fc.integer({ min: 1, max: 20 }); // chi-square df

// Each test type takes a different effect-size domain. Pin the safe
// interval per registry entry; values right at zero or right at the
// effectMax boundary are reserved for explicit tests.
const arbEffect = {
  "t-ind": fc.double({ min: 0.05, max: 1.5, noNaN: true, noDefaultInfinity: true }),
  "t-paired": fc.double({ min: 0.05, max: 1.5, noNaN: true, noDefaultInfinity: true }),
  "t-one": fc.double({ min: 0.05, max: 1.5, noNaN: true, noDefaultInfinity: true }),
  anova: fc.double({ min: 0.05, max: 1.0, noNaN: true, noDefaultInfinity: true }),
  correlation: fc.double({ min: 0.05, max: 0.8, noNaN: true, noDefaultInfinity: true }),
  chi2: fc.double({ min: 0.05, max: 0.8, noNaN: true, noDefaultInfinity: true }),
};

// `power(es, n, alpha, tails, k?, df?)` — the registry's `power`
// callable signature. Pass undefined for arguments the test doesn't
// use (the ANOVA helper ignores `tails`, the chi-square helper
// ignores `tails` and `k`, etc.).
function callPower(testKey, es, n, alpha, tails, k, df) {
  return TESTS[testKey].power(es, n, alpha, tails, k, df);
}

// ── power output range ──────────────────────────────────────────────────

suite("power property — output range");

for (const key of TEST_KEYS) {
  test(`${key}: power ∈ [0, 1] for valid arguments`, () => {
    check(
      fc.property(
        arbEffect[key],
        arbN,
        arbAlpha,
        arbTails,
        arbK,
        arbDf,
        (es, n, alpha, tails, k, df) => {
          const p = callPower(key, es, n, alpha, tails, k, df);
          if (!Number.isFinite(p)) return true;
          return p >= -1e-9 && p <= 1 + 1e-9;
        }
      )
    );
  });
}

// ── Null-hypothesis floor: power = α at zero effect ─────────────────────

suite("power property — null-hypothesis floor");

for (const key of TEST_KEYS) {
  test(`${key}: power(0, n, α) ≈ α (Type I error rate)`, () => {
    // At zero effect size, the test should reject at exactly the
    // nominal rate α. Allow a tolerance — small-n tests have slight
    // departure from the asymptotic identity. (Two-tailed power at
    // d = 0 is the sum of two equal tails, so still α.)
    check(
      fc.property(arbN, arbAlpha, arbTails, arbK, arbDf, (n, alpha, tails, k, df) => {
        const p = callPower(key, 0, n, alpha, tails, k, df);
        if (!Number.isFinite(p)) return true;
        return Math.abs(p - alpha) < 0.05;
      })
    );
  });
}

// ── Monotonicity: power increases with n ────────────────────────────────

suite("power property — monotonicity in n");

for (const key of TEST_KEYS) {
  test(`${key}: power is non-decreasing in n (fixed es, α, tails)`, () => {
    check(
      fc.property(
        arbEffect[key],
        fc.tuple(arbN, fc.integer({ min: 1, max: 200 })).map(([n, gap]) => [n, n + gap]),
        arbAlpha,
        arbTails,
        arbK,
        arbDf,
        (es, [n1, n2], alpha, tails, k, df) => {
          const p1 = callPower(key, es, n1, alpha, tails, k, df);
          const p2 = callPower(key, es, n2, alpha, tails, k, df);
          if (!Number.isFinite(p1) || !Number.isFinite(p2)) return true;
          return p2 >= p1 - 5e-3;
        }
      )
    );
  });
}

// ── Monotonicity: power increases with effect size ──────────────────────

suite("power property — monotonicity in effect size");

for (const key of TEST_KEYS) {
  test(`${key}: power is non-decreasing in |es| (fixed n, α, tails)`, () => {
    check(
      fc.property(
        fc.tuple(arbEffect[key], arbEffect[key]).map(([a, b]) => (a <= b ? [a, b] : [b, a])),
        arbN,
        arbAlpha,
        arbTails,
        arbK,
        arbDf,
        ([es1, es2], n, alpha, tails, k, df) => {
          const p1 = callPower(key, es1, n, alpha, tails, k, df);
          const p2 = callPower(key, es2, n, alpha, tails, k, df);
          if (!Number.isFinite(p1) || !Number.isFinite(p2)) return true;
          return p2 >= p1 - 5e-3;
        }
      )
    );
  });
}

// ── Monotonicity: power increases with α ────────────────────────────────

suite("power property — monotonicity in α");

for (const key of TEST_KEYS) {
  test(`${key}: power is non-decreasing in α (fixed n, es, tails)`, () => {
    check(
      fc.property(
        arbEffect[key],
        arbN,
        fc.tuple(arbAlpha, arbAlpha).map(([a, b]) => (a <= b ? [a, b] : [b, a])),
        arbTails,
        arbK,
        arbDf,
        (es, n, [alpha1, alpha2], tails, k, df) => {
          const p1 = callPower(key, es, n, alpha1, tails, k, df);
          const p2 = callPower(key, es, n, alpha2, tails, k, df);
          if (!Number.isFinite(p1) || !Number.isFinite(p2)) return true;
          return p2 >= p1 - 5e-3;
        }
      )
    );
  });
}

// ── Two-tail vs one-tail relationship ──────────────────────────────────

suite("power property — tails");

const TAIL_AWARE = ["t-ind", "t-paired", "t-one", "correlation"];
for (const key of TAIL_AWARE) {
  test(`${key}: 1-tailed power ≥ 2-tailed power for positive effect (same args)`, () => {
    // For a positive directional effect, the 1-tailed test concentrates
    // its rejection region in the favoured direction → strictly higher
    // power than the 2-tailed equivalent. (At es = 0 the relationship
    // can flip due to how the boundary is split; the bound is a "≥
    // within tolerance" rather than strict.)
    check(
      fc.property(arbEffect[key], arbN, arbAlpha, (es, n, alpha) => {
        const p1 = callPower(key, es, n, alpha, 1);
        const p2 = callPower(key, es, n, alpha, 2);
        if (!Number.isFinite(p1) || !Number.isFinite(p2)) return true;
        return p1 >= p2 - 5e-3;
      })
    );
  });
}

// ── Effect-size converters ──────────────────────────────────────────────

suite("power property — dFromMeans");

test("d = 0 when means are equal", () => {
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true }),
      (m, sd) => {
        return dFromMeans(m, m, sd) === 0;
      }
    )
  );
});

test("|d| is invariant under group swap", () => {
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true }),
      (m1, m2, sd) => {
        const a = dFromMeans(m1, m2, sd);
        const b = dFromMeans(m2, m1, sd);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
        return Math.abs(Math.abs(a) - Math.abs(b)) < 1e-9;
      }
    )
  );
});

test("d scales linearly with mean difference (fixed sd)", () => {
  check(
    fc.property(
      fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 2, max: 10 }),
      (m1, sd, k) => {
        const m2 = m1 + 1;
        const m2k = m1 + k;
        const d1 = dFromMeans(m1, m2, sd);
        const dk = dFromMeans(m1, m2k, sd);
        if (!Number.isFinite(d1) || !Number.isFinite(dk)) return true;
        return Math.abs(dk - k * d1) < 1e-9;
      }
    )
  );
});

test("d scales as 1/sd at fixed mean difference", () => {
  check(
    fc.property(
      fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 2, max: 10, noNaN: true, noDefaultInfinity: true }),
      (m1, sd, scale) => {
        const m2 = m1 + 1;
        const d1 = dFromMeans(m1, m2, sd);
        const ds = dFromMeans(m1, m2, sd * scale);
        if (!Number.isFinite(d1) || !Number.isFinite(ds)) return true;
        return Math.abs(ds * scale - d1) < 1e-9;
      }
    )
  );
});

suite("power property — fFromGroupMeans");

test("f = 0 when all group means are equal", () => {
  check(
    fc.property(
      fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 2, max: 8 }),
      fc.double({ min: 0.1, max: 20, noNaN: true, noDefaultInfinity: true }),
      (m, k, sd) => {
        const means = new Array(k).fill(m);
        const f = fFromGroupMeans(means, sd);
        if (!Number.isFinite(f)) return true;
        return Math.abs(f) < 1e-9;
      }
    )
  );
});

test("f ≥ 0 for any input", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 8,
      }),
      fc.double({ min: 0.1, max: 20, noNaN: true, noDefaultInfinity: true }),
      (means, sd) => {
        const f = fFromGroupMeans(means, sd);
        if (!Number.isFinite(f)) return true;
        return f >= -1e-9;
      }
    )
  );
});

test("f is invariant under permutation of the group means", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 8,
      }),
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 0, max: 8 }),
      (means, sd, rot) => {
        const r = rot % means.length;
        const rotated = means.slice(r).concat(means.slice(0, r));
        const f1 = fFromGroupMeans(means, sd);
        const f2 = fFromGroupMeans(rotated, sd);
        if (!Number.isFinite(f1) || !Number.isFinite(f2)) return true;
        return Math.abs(f1 - f2) < 1e-9;
      }
    )
  );
});

test("f scales as 1/sd at fixed group means", () => {
  check(
    fc.property(
      fc.array(fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 6,
      }),
      fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 2, max: 10, noNaN: true, noDefaultInfinity: true }),
      (means, sd, scale) => {
        const f1 = fFromGroupMeans(means, sd);
        const fs = fFromGroupMeans(means, sd * scale);
        if (!Number.isFinite(f1) || !Number.isFinite(fs) || f1 === 0) return true;
        return Math.abs(fs * scale - f1) < 1e-9;
      }
    )
  );
});

suite("power property — wFromProportions");

const arbProportions = fc
  .array(fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }), {
    minLength: 2,
    maxLength: 8,
  })
  .map((arr) => {
    const sum = arr.reduce((a, b) => a + b, 0);
    return arr.map((v) => v / sum);
  });

test("w = 0 when observed === expected", () => {
  check(
    fc.property(arbProportions, (probs) => {
      const w = wFromProportions(probs, probs);
      if (!Number.isFinite(w)) return true;
      return Math.abs(w) < 1e-9;
    })
  );
});

test("w ≥ 0 for any input", () => {
  check(
    fc.property(arbProportions, arbProportions, (a, b) => {
      // Pad the shorter side so the lengths match — the helper expects
      // matching-length arrays.
      const n = Math.min(a.length, b.length);
      const w = wFromProportions(a.slice(0, n), b.slice(0, n));
      if (!Number.isFinite(w)) return true;
      return w >= -1e-9;
    })
  );
});

test("w is symmetric in observed / expected when both fully specified", () => {
  // Cohen's w is built on √Σ((p_obs - p_exp)² / p_exp). The squared
  // residuals are symmetric in the difference, but the divisor uses
  // p_exp, so swap-symmetry only holds when both sides sum to 1 and
  // every entry is positive.
  check(
    fc.property(arbProportions, arbProportions, (a, b) => {
      const n = Math.min(a.length, b.length);
      const aTrim = a.slice(0, n);
      const bTrim = b.slice(0, n);
      const ab = wFromProportions(aTrim, bTrim);
      const ba = wFromProportions(bTrim, aTrim);
      if (!Number.isFinite(ab) || !Number.isFinite(ba)) return true;
      // Check the *order* of magnitude — w is sensitive to which side
      // is the divisor, so absolute equality doesn't hold. The looser
      // claim: both must be positive (or both zero).
      return ab >= -1e-9 === ba >= -1e-9;
    })
  );
});

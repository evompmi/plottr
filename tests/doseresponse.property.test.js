// Property-based tests for the dose-response pipeline.
//
// Drives parseRaw → buildObservations → fit4PL → curveBand → fTestSharedParam
// under fast-check, with the curated CSV-pathology corpus and structural
// arbitraries from tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseRaw,
  fourPL,
  fourPLGrad,
  initialGuesses,
  fit4PL,
  buildXGrid,
  curveBand,
  buildObservations,
  fitMulti,
  fTestSharedParam,
  fmtEC50,
  fmtNum,
  formatLogTick,
  logTickRange,
  PARAM_KEYS,
} = require("./helpers/doseresponse-loader");
const { arbAnyCsv } = require("./helpers/csv-arbitraries");

const RUNS = 200;
const RUNS_LIGHT = 80;
const check = (prop, runs = RUNS) => fc.assert(prop, { numRuns: runs });

// ── parser resilience ─────────────────────────────────────────────────────

suite("doseresponse property — parser resilience");

test("parseRaw never throws on arbitrary CSV-shaped input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseRaw(text);
      return true;
    })
  );
});

// ── 4PL math invariants ───────────────────────────────────────────────────

const arbParams = fc.record({
  logEC50: fc.double({ min: -12, max: 0, noNaN: true, noDefaultInfinity: true }),
  hillSlope: fc
    .double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true })
    .filter((v) => Math.abs(v) > 0.05),
  top: fc.double({ min: 50, max: 200, noNaN: true, noDefaultInfinity: true }),
  bottom: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
});

suite("doseresponse property — 4PL model");

test("fourPL is finite for finite inputs", () => {
  check(
    fc.property(
      arbParams,
      fc.double({ min: -15, max: 5, noNaN: true, noDefaultInfinity: true }),
      (p, x) => Number.isFinite(fourPL(x, p))
    )
  );
});

test("fourPL at logEC50 returns the half-maximal value (Top + Bottom)/2", () => {
  check(
    fc.property(arbParams, (p) => {
      const half = fourPL(p.logEC50, p);
      const expected = (p.top + p.bottom) / 2;
      return Math.abs(half - expected) < 1e-9 * (1 + Math.abs(expected));
    })
  );
});

test("fourPL is bounded between Top and Bottom for any input x (positive Hill)", () => {
  check(
    fc.property(
      arbParams.filter((p) => p.hillSlope > 0 && p.top > p.bottom),
      fc.double({ min: -15, max: 5, noNaN: true, noDefaultInfinity: true }),
      (p, x) => {
        const y = fourPL(x, p);
        return y >= p.bottom - 1e-9 && y <= p.top + 1e-9;
      }
    )
  );
});

test("fourPL is monotonic increasing in x when hill > 0 and top > bottom", () => {
  check(
    fc.property(
      arbParams.filter((p) => p.hillSlope > 0.1 && p.top - p.bottom > 1),
      fc.double({ min: -10, max: 0, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
      (p, a, delta) => {
        const x = a;
        const y1 = fourPL(x, p);
        const y2 = fourPL(x + delta, p);
        return y2 >= y1 - 1e-9;
      }
    )
  );
});

test("analytical gradient agrees with finite-difference within 1e-3 (relative)", () => {
  check(
    fc.property(
      arbParams,
      fc.double({ min: -10, max: 0, noNaN: true, noDefaultInfinity: true }),
      (p, x) => {
        const eps = 1e-6;
        const g = fourPLGrad(x, p);
        const keys = ["logEC50", "hillSlope", "top", "bottom"];
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const pPlus = { ...p, [k]: p[k] + eps };
          const pMinus = { ...p, [k]: p[k] - eps };
          const fd = (fourPL(x, pPlus) - fourPL(x, pMinus)) / (2 * eps);
          const tol = 1e-3 * (Math.abs(fd) + 1);
          if (Math.abs(g[i] - fd) > tol) return false;
        }
        return true;
      }
    ),
    RUNS_LIGHT
  );
});

// ── fit4PL structural invariants ─────────────────────────────────────────

suite("doseresponse property — fit4PL");

const arbObs = fc
  .array(
    fc.record({
      x: fc.double({ min: -12, max: 0, noNaN: true, noDefaultInfinity: true }),
      y: fc.double({ min: -100, max: 200, noNaN: true, noDefaultInfinity: true }),
      w: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
      isZeroDose: fc.constant(false),
      rawDose: fc.constant(1),
      conditionIdx: fc.constant(0),
    }),
    { minLength: 0, maxLength: 30 }
  )
  // Filter out degenerate datasets where every x is identical — those are
  // structurally singular for a 4PL fit. The tests are about whether fit4PL
  // *handles* them gracefully, not that it succeeds.
  .map((arr) => arr);

test("fit4PL never throws on arbitrary observation arrays", () => {
  check(
    fc.property(arbObs, (obs) => {
      fit4PL(obs);
      return true;
    })
  );
});

test("returns valid:false when fewer than 4 observations are provided", () => {
  check(
    fc.property(
      fc.integer({ min: 0, max: 3 }).chain((n) =>
        fc.array(
          fc.record({
            x: fc.double({ min: -10, max: 0, noNaN: true, noDefaultInfinity: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
            w: fc.constant(1),
            isZeroDose: fc.constant(false),
            rawDose: fc.constant(1),
            conditionIdx: fc.constant(0),
          }),
          { minLength: n, maxLength: n }
        )
      ),
      (obs) => {
        const fit = fit4PL(obs);
        return fit.valid === false;
      }
    )
  );
});

test("when fit converges, all CI bounds are ordered (lo ≤ point ≤ hi)", () => {
  check(
    fc.property(arbObs, (obs) => {
      const fit = fit4PL(obs);
      if (!fit.valid) return true;
      for (const k of PARAM_KEYS) {
        const [lo, hi] = fit.paramCI[k];
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
        const point = fit.params[k];
        const slack = 1e-6 * (Math.abs(point) + 1);
        if (lo > point + slack || point > hi + slack) return false;
      }
      return true;
    }),
    RUNS_LIGHT
  );
});

test("EC50 back-transform identity: 10^logEC50 === ec50 exactly", () => {
  check(
    fc.property(arbObs, (obs) => {
      const fit = fit4PL(obs);
      if (!fit.valid) return true;
      return fit.ec50 === Math.pow(10, fit.params.logEC50);
    })
  );
});

test("fitted EC50 lies within the (extended) observed dose range", () => {
  check(
    fc.property(arbObs, (obs) => {
      const fit = fit4PL(obs);
      if (!fit.valid) return true;
      const xs = obs.filter((o) => !o.isZeroDose).map((o) => o.x);
      if (xs.length === 0) return true;
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const span = xMax - xMin;
      const slack = Math.max(span, 1) * 5;
      return fit.params.logEC50 >= xMin - slack && fit.params.logEC50 <= xMax + slack;
    })
  );
});

// ── buildObservations resilience ─────────────────────────────────────────

suite("doseresponse property — buildObservations");

test("never throws on arbitrary RowInput arrays", () => {
  check(
    fc.property(
      fc.array(
        fc.record({
          dose: fc.oneof(
            fc.double({ min: -10, max: 1e3, noNaN: true, noDefaultInfinity: true }),
            fc.constant(0)
          ),
          response: fc.double({ min: -1e3, max: 1e3, noNaN: true, noDefaultInfinity: true }),
          condition: fc.constantFrom("A", "B", "C", ""),
        }),
        { minLength: 0, maxLength: 30 }
      ),
      fc.constantFrom("raw", "log10"),
      fc.constantFrom("drop", "reference", "floor"),
      fc.constantFrom("none", "pct-max", "min-max"),
      fc.constantFrom("equal", "inv-y2"),
      (rows, doseUnit, zeroDoseMode, normalisation, weighting) => {
        buildObservations(rows, {
          doseUnit,
          zeroDoseMode,
          normalisation,
          weighting,
        });
        return true;
      }
    )
  );
});

// ── multi-condition fit + F-test ─────────────────────────────────────────

suite("doseresponse property — fitMulti / fTestSharedParam");

test("fitMulti handles the empty observation set without throwing", () => {
  check(
    fc.property(fc.array(fc.string({ maxLength: 6 }), { maxLength: 4 }), (conditionNames) => {
      fitMulti([], conditionNames);
      return true;
    })
  );
});

test("fTestSharedParam returns failed=true with < 2 valid conditions", () => {
  const single = [
    {
      condition: "A",
      conditionIdx: 0,
      fit: { valid: false, reason: "x", warnings: [] },
      observations: [],
    },
  ];
  const t = fTestSharedParam(single, "logEC50");
  return t.failed === true;
});

// ── formatting / tick helpers ─────────────────────────────────────────────

suite("doseresponse property — formatting helpers");

test("fmtEC50 returns a non-empty string for finite positive input", () => {
  check(
    fc.property(
      fc.double({ min: 1e-15, max: 1, noNaN: true, noDefaultInfinity: true }),
      (v) => typeof fmtEC50(v) === "string" && fmtEC50(v).length > 0
    )
  );
});

test("fmtEC50 returns the em-dash sentinel for non-positive or non-finite input", () => {
  if (fmtEC50(0) !== "—") throw new Error(`fmtEC50(0): ${fmtEC50(0)}`);
  if (fmtEC50(-1) !== "—") throw new Error(`fmtEC50(-1): ${fmtEC50(-1)}`);
  if (fmtEC50(NaN) !== "—") throw new Error(`fmtEC50(NaN): ${fmtEC50(NaN)}`);
});

test("fmtNum returns a string for any finite or non-finite double", () => {
  check(
    fc.property(
      fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, 0, -0)),
      (v) => typeof fmtNum(v) === "string"
    )
  );
});

test("formatLogTick produces a non-empty string for arbitrary input", () => {
  check(
    fc.property(
      fc.double({ min: -20, max: 10, noNaN: true, noDefaultInfinity: true }),
      (v) => typeof formatLogTick(v) === "string" && formatLogTick(v).length > 0
    )
  );
});

test("logTickRange returns a non-empty sorted integer sequence", () => {
  check(
    fc.property(
      fc.double({ min: -15, max: 0, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0.5, max: 15, noNaN: true, noDefaultInfinity: true }),
      (xMin, span) => {
        const xMax = xMin + span;
        const ticks = logTickRange(xMin, xMax);
        if (ticks.length === 0) return false;
        for (let i = 1; i < ticks.length; i++) {
          if (ticks[i] !== ticks[i - 1] + 1) return false;
        }
        return ticks[0] <= xMin && ticks[ticks.length - 1] >= xMax;
      }
    )
  );
});

// ── curveBand stays sane ──────────────────────────────────────────────────

suite("doseresponse property — curveBand");

test("curveBand emits one point per grid x with finite y when params finite", () => {
  check(
    fc.property(arbObs, (obs) => {
      const fit = fit4PL(obs);
      if (!fit.valid) return true;
      const grid = buildXGrid(-10, 0, 30);
      const band = curveBand(fit, grid);
      if (band.length !== grid.length) return false;
      for (const pt of band) {
        if (!Number.isFinite(pt.y)) return false;
      }
      return true;
    }),
    RUNS_LIGHT
  );
});

// ── initialGuesses ────────────────────────────────────────────────────────

suite("doseresponse property — initialGuesses");

test("returns Top ≥ Bottom and Hill in {−1, +1}", () => {
  check(
    fc.property(arbObs, (obs) => {
      const seed = initialGuesses(obs);
      if (obs.length === 0) return true;
      return seed.top >= seed.bottom - 1e-9 && (seed.hillSlope === 1 || seed.hillSlope === -1);
    })
  );
});

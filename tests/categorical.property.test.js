// Property-based tests for tools/_core/stats/categorical.ts. Complements the
// R point-checks in categorical.test.js with invariants: the pruned network
// enumeration for R×C Fisher must equal brute-force enumeration on every
// small table, p-values must be invariant to row / column order and
// transposition, Wilson bounds must bracket p̂ and mirror under x ↔ n − x,
// Holm must be monotone and dominate the raw p-values.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  wilsonCI,
  holmAdjust,
  binomTest,
  fisherExact,
  chiSquareIndependence,
  multinomialExactGOF,
  logFactorial,
} = require("./helpers/stats-loader");

const RUNS = 200;
const RUNS_HEAVY = 80;
const check = (prop, runs = RUNS) => fc.assert(prop, { numRuns: runs });

// Brute-force two-sided Fisher p: enumerate every table with the observed
// margins, sum P(table) over tables with P ≤ P(observed) × (1 + 1e-7).
function bruteFisher(t) {
  const r = t.map((row) => row.reduce((a, b) => a + b, 0));
  const c = t[0].map((_, j) => t.reduce((a, row) => a + row[j], 0));
  const N = r.reduce((a, b) => a + b, 0);
  const K = r.reduce((a, v) => a + logFactorial(v), 0) + c.reduce((a, v) => a + logFactorial(v), 0);
  const logP = (tab) =>
    K -
    logFactorial(N) -
    tab.reduce((a, row) => a + row.reduce((b, v) => b + logFactorial(v), 0), 0);
  const obs = logP(t);
  let sum = 0;
  const nr = r.length;
  const nc = c.length;
  const tab = r.map(() => new Array(nc).fill(0));
  const colLeft = c.slice();
  const fill = (i, j, rowLeft) => {
    if (i === nr - 1) {
      for (let jj = 0; jj < nc; jj++) tab[i][jj] = colLeft[jj];
      const lp = logP(tab);
      if (lp <= obs + Math.log1p(1e-7)) sum += Math.exp(lp);
      return;
    }
    if (j === nc - 1) {
      if (rowLeft > colLeft[j]) return;
      tab[i][j] = rowLeft;
      colLeft[j] -= rowLeft;
      fill(i + 1, 0, r[i + 1]);
      colLeft[j] += rowLeft;
      return;
    }
    for (let v = 0; v <= Math.min(rowLeft, colLeft[j]); v++) {
      tab[i][j] = v;
      colLeft[j] -= v;
      fill(i, j + 1, rowLeft - v);
      colLeft[j] += v;
    }
  };
  fill(0, 0, r[0]);
  return Math.min(1, sum);
}

// Small R×C tables with non-zero margins.
const arbTable = (maxR, maxC, maxCell) =>
  fc
    .tuple(fc.integer({ min: 2, max: maxR }), fc.integer({ min: 2, max: maxC }))
    .chain(([nr, nc]) =>
      fc.array(fc.array(fc.integer({ min: 0, max: maxCell }), { minLength: nc, maxLength: nc }), {
        minLength: nr,
        maxLength: nr,
      })
    )
    .filter(
      (t) =>
        t.every((row) => row.some((v) => v > 0)) &&
        t[0].every((_, j) => t.some((row) => row[j] > 0))
    );

const transpose = (t) => t[0].map((_, j) => t.map((row) => row[j]));
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-300);

suite("fisherExact — network enumeration equals brute force");

test("R×C exact p equals brute-force enumeration", () => {
  check(
    fc.property(arbTable(3, 4, 6), (t) => {
      const got = fisherExact(t);
      return got.method === "exact" && near(got.p, bruteFisher(t), 1e-9);
    }),
    RUNS_HEAVY
  );
});

test("p in (0, 1] and invariant to transposition and row / column reversal", () => {
  check(
    fc.property(arbTable(3, 4, 8), (t) => {
      const p = fisherExact(t).p;
      if (!(p > 0 && p <= 1)) return false;
      const rowsRev = t.slice().reverse();
      const colsRev = t.map((row) => row.slice().reverse());
      return (
        near(fisherExact(transpose(t)).p, p, 1e-9) &&
        near(fisherExact(rowsRev).p, p, 1e-9) &&
        near(fisherExact(colsRev).p, p, 1e-9)
      );
    }),
    RUNS_HEAVY
  );
});

test("2×2 odds-ratio CI brackets the estimate", () => {
  check(
    fc.property(arbTable(2, 2, 25), (t) => {
      const r = fisherExact(t);
      if (Number.isNaN(r.oddsRatio)) return true; // degenerate support (one margin zero)
      return r.orCI[0] <= r.oddsRatio && r.oddsRatio <= r.orCI[1];
    })
  );
});

suite("chiSquareIndependence");

test("X² and p invariant to transposition; df = (r − 1)(c − 1)", () => {
  check(
    fc.property(arbTable(4, 4, 30), (t) => {
      const a = chiSquareIndependence(t);
      const b = chiSquareIndependence(transpose(t));
      return (
        near(b.X2, a.X2, 1e-12) &&
        a.df === (t.length - 1) * (t[0].length - 1) &&
        a.cramersV >= 0 &&
        a.cramersV <= 1 + 1e-12
      );
    })
  );
});

suite("wilsonCI");

test("bounds within [0, 1], bracket p̂, mirror under x ↔ n − x", () => {
  check(
    fc.property(
      fc
        .integer({ min: 1, max: 2000 })
        .chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n))),
      ([x, n]) => {
        const a = wilsonCI(x, n);
        const b = wilsonCI(n - x, n);
        return (
          a.lower >= 0 &&
          a.upper <= 1 &&
          a.lower <= a.p &&
          a.p <= a.upper &&
          Math.abs(a.lower - (1 - b.upper)) < 1e-12 &&
          Math.abs(a.upper - (1 - b.lower)) < 1e-12
        );
      }
    )
  );
});

suite("holmAdjust");

test("adjusted ≥ raw, ≤ 1, order-preserving", () => {
  check(
    fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 30 }), (ps) => {
      const adj = holmAdjust(ps);
      for (let i = 0; i < ps.length; i++) {
        if (adj[i] < ps[i] || adj[i] > 1) return false;
        for (let j = 0; j < ps.length; j++) if (ps[i] <= ps[j] && adj[i] > adj[j]) return false;
      }
      return true;
    })
  );
});

suite("Exact goodness of fit");

test("binomTest in [0, 1]; k = 2 multinomial equals binomTest", () => {
  check(
    fc.property(
      fc
        .integer({ min: 1, max: 300 })
        .chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n))),
      fc.integer({ min: 1, max: 15 }),
      fc.integer({ min: 1, max: 15 }),
      ([x, n], a, b) => {
        const p = binomTest(x, n, a / (a + b)).p;
        const g = multinomialExactGOF([x, n - x], [a, b]);
        return p >= 0 && p <= 1 && g.p === p && g.method === "exact";
      }
    )
  );
});

test("exact multinomial p in (0, 1] and invariant to category order", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 3, maxLength: 4 }),
      fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 4, maxLength: 4 }),
      (obs, ratioFull) => {
        if (obs.every((v) => v === 0)) return true;
        const ratio = ratioFull.slice(0, obs.length);
        const p = multinomialExactGOF(obs, ratio).p;
        const q = multinomialExactGOF(obs.slice().reverse(), ratio.slice().reverse()).p;
        return p > 0 && p <= 1 && near(q, p, 1e-9);
      }
    ),
    RUNS_HEAVY
  );
});

// Counts / proportions kernel (tools/_core/stats/categorical.ts) pinned to R.
//
// Reference values: R 4.5 — prop.test(correct = FALSE)$conf.int,
// binom.test, p.adjust("holm"), fisher.test, chisq.test (+ $stdres), and
// for the exact multinomial goodness-of-fit a brute-force dmultinom
// enumeration with the same "≤ observed × (1 + 1e-7)" rule. The 2×2 odds
// ratio and its CI are pinned to a replica of fisher.test's internals run
// with uniroot(tol = 1e-14): R's own fisher.test stops uniroot at ~1.2e-4,
// so its printed estimate differs from the exact root in the 4th–5th digit.

const { suite, test, assert, eq, summary } = require("./harness");
const {
  wilsonCI,
  qnormPrecise,
  holmAdjust,
  binomTest,
  chiSquareIndependence,
  chiSquareGOF,
  multinomialExactGOF,
  multinomialOutcomeCount,
  fisherExact,
  selectCountsTest,
  pairwiseFisher,
  logFactorial,
  expectedCounts,
} = require("./helpers/stats-loader");

// Relative closeness (absolute for exact zeros).
function rel(actual, expected, tol, msg) {
  const err = expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);
  if (!(err <= tol)) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected ${expected}, got ${actual} (rel err ${err} > ${tol})`
    );
  }
}

suite("qnormPrecise (AS 241)");

test("matches R qnorm to ~1 ulp", () => {
  rel(qnormPrecise(0.975), 1.95996398454005338, 1e-15);
  rel(qnormPrecise(1e-10), -6.36134090240405659, 1e-15);
  rel(qnormPrecise(0.3), -0.52440051270804078, 1e-15);
  eq(qnormPrecise(0.5), 0);
  eq(qnormPrecise(0), -Infinity);
  eq(qnormPrecise(1), Infinity);
  assert(Number.isNaN(qnormPrecise(1.5)));
});

suite("wilsonCI vs prop.test(correct = FALSE)$conf.int");

test("interior cases", () => {
  const cases = [
    [3, 17, 0.0619112663762099, 0.410294585688341],
    [41, 48, 0.728328234752537, 0.927517506733963],
    [500, 1000, 0.469069600368104, 0.530930399631896],
  ];
  for (const [x, n, lo, hi] of cases) {
    const ci = wilsonCI(x, n);
    rel(ci.lower, lo, 1e-13, `${x}/${n} lower`);
    rel(ci.upper, hi, 1e-13, `${x}/${n} upper`);
    eq(ci.p, x / n);
  }
});

test("edge cases x = 0, x = n, n = 1 pin the bound to 0 / 1", () => {
  let ci = wilsonCI(0, 10);
  eq(ci.lower, 0);
  rel(ci.upper, 0.277532799862889, 1e-13);
  ci = wilsonCI(10, 10);
  rel(ci.lower, 0.722467200137111, 1e-13);
  eq(ci.upper, 1);
  ci = wilsonCI(1, 1);
  rel(ci.lower, 0.206549314377238, 1e-13);
  eq(ci.upper, 1);
});

test("90 % level", () => {
  const ci = wilsonCI(3, 17, 0.9);
  rel(ci.lower, 0.0728144665470645, 1e-13);
  rel(ci.upper, 0.368966978069026, 1e-13);
});

test("invalid input → NaN", () => {
  for (const [x, n] of [
    [5, 3],
    [-1, 3],
    [1.5, 3],
    [0, 0],
  ]) {
    const ci = wilsonCI(x, n);
    assert(Number.isNaN(ci.p) && Number.isNaN(ci.lower) && Number.isNaN(ci.upper), `${x}/${n}`);
  }
  assert(Number.isNaN(wilsonCI(1, 3, 1).lower));
});

suite("holmAdjust vs p.adjust(, 'holm')");

test("ties and monotone step-down", () => {
  const adj = holmAdjust([0.01, 0.04, 0.03, 0.005, 0.2, 0.04]);
  const r = [0.05, 0.12, 0.12, 0.03, 0.2, 0.12];
  adj.forEach((v, i) => rel(v, r[i], 1e-14, `idx ${i}`));
});

test("caps at 1, NaN passes through and is not counted", () => {
  const adj = holmAdjust([0.6, NaN, 0.5]);
  eq(adj[0], 1);
  assert(Number.isNaN(adj[1]));
  eq(adj[2], 1);
  eq(holmAdjust([0.01, NaN])[0], 0.01);
  eq(holmAdjust([]).length, 0);
});

suite("binomTest vs binom.test");

test("two-sided p", () => {
  const cases = [
    [7, 20, 0.5, 0.263175964355469],
    [3, 40, 0.25, 0.00934714841794021],
    [682, 925, 0.75, 0.382491559574852],
    [0, 10, 0.3, 0.038839603299999984],
    [10, 10, 0.3, 5.90489999999999e-6],
  ];
  for (const [x, n, p0, p] of cases) rel(binomTest(x, n, p0).p, p, 1e-11, `${x}/${n} p0=${p0}`);
});

test("x equal to the mean → 1; degenerate p0", () => {
  eq(binomTest(5, 10, 0.5).p, 1);
  eq(binomTest(0, 10, 0).p, 1);
  eq(binomTest(1, 10, 0).p, 0);
  eq(binomTest(10, 10, 1).p, 1);
  eq(binomTest(9, 10, 1).p, 0);
  assert(Number.isNaN(binomTest(11, 10, 0.5).p));
});

suite("chiSquareIndependence vs chisq.test");

test("4×2 colonisation table: X², p, stdres, Cramér's V", () => {
  const r = chiSquareIndependence([
    [41, 7],
    [3, 43],
    [9, 41],
    [37, 10],
  ]);
  rel(r.X2, 94.5366311029731, 1e-13);
  rel(r.p, 2.32217354512001e-20, 1e-10);
  eq(r.df, 3);
  const sr = [6.14294934404979, -6.33103820630506, -4.80110464959162, 4.99877861005001];
  sr.forEach((v, i) => {
    rel(r.stdres[i][0], v, 1e-13, `stdres ${i}`);
    rel(r.stdres[i][1], -v, 1e-13, `stdres ${i} col 2`);
  });
  rel(r.cramersV, Math.sqrt(94.5366311029731 / 191), 1e-13);
  eq(r.yates, false);
  eq(r.nExpectedBelow5, 0);
});

test("HairEyeColor (summed over Sex): X², p, V", () => {
  const hec = [
    [68, 20, 15, 5],
    [119, 84, 54, 29],
    [26, 17, 14, 14],
    [7, 94, 10, 16],
  ];
  const r = chiSquareIndependence(hec);
  rel(r.X2, 138.289841626008, 1e-13);
  rel(r.p, 2.32528678709884e-25, 1e-9);
  rel(r.cramersV, 0.279044623342658, 1e-13);
  eq(r.df, 9);
});

test("Yates correction (2×2 only), R's min(0.5, |O − E|)", () => {
  const r = chiSquareIndependence(
    [
      [10, 3],
      [2, 15],
    ],
    { correct: true }
  );
  rel(r.X2, 10.4581447963801, 1e-13);
  rel(r.p, 0.00122109851631151, 1e-11);
  eq(r.yates, true);
  // |O − E| = 2.5 everywhere → YATES = 0.5
  rel(
    chiSquareIndependence(
      [
        [20, 25],
        [30, 25],
      ],
      { correct: true }
    ).X2,
    0.646464646464646,
    1e-13
  );
  // ignored beyond 2×2
  eq(
    chiSquareIndependence(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      { correct: true }
    ).yates,
    false
  );
});

test("zero margins / bad tables → error", () => {
  assert(
    chiSquareIndependence([
      [0, 0],
      [1, 2],
    ]).error
  );
  assert(chiSquareIndependence([[1, 2]]).error);
  assert(
    chiSquareIndependence([
      [1, 2.5],
      [1, 2],
    ]).error
  );
});

suite("Goodness of fit");

test("chiSquareGOF: Mendel 1866 vs 9:3:3:1", () => {
  const g = chiSquareGOF([315, 108, 101, 32], [9, 3, 3, 1]);
  rel(g.X2, 0.470023980815348, 1e-13);
  rel(g.p, 0.925425895103616, 1e-12);
  eq(g.df, 3);
  [0.19235116909125, 0.4074567821627, -0.353129211207673, -0.481803167866243].forEach((v, i) =>
    rel(g.stdres[i], v, 1e-12, `stdres ${i}`)
  );
});

test("multinomialExactGOF vs dmultinom enumeration", () => {
  rel(multinomialExactGOF([25, 8, 7, 0], [9, 3, 3, 1]).p, 0.440592220341748, 1e-12);
  rel(multinomialExactGOF([12, 20, 8], [1, 2, 1]).p, 0.684920526516214, 1e-12);
  rel(multinomialExactGOF([40, 5, 15], [12, 3, 1]).p, 3.12687910414575e-6, 1e-11);
  rel(multinomialExactGOF([98, 37, 22, 19], [9, 3, 3, 1]).p, 0.0208630959252767, 1e-11);
  eq(multinomialExactGOF([98, 37, 22, 19], [9, 3, 3, 1]).method, "exact");
});

test("k = 2 reduces to binom.test", () => {
  const g = multinomialExactGOF([3, 37], [1, 3]);
  rel(g.p, 0.00934714841794021, 1e-11);
  eq(g.method, "exact");
});

test("outcome space above the cap → χ² fallback, flagged", () => {
  eq(multinomialOutcomeCount(556, 4), 28956759);
  const g = multinomialExactGOF([315, 108, 101, 32], [9, 3, 3, 1]);
  eq(g.method, "chi2");
  eq(g.fallback, true);
  rel(g.p, 0.925425895103616, 1e-12);
});

test("invalid ratios / counts → error", () => {
  assert(chiSquareGOF([1, 2], [1, 0]).error);
  assert(chiSquareGOF([1, 2, 3], [1, 2]).error);
  assert(chiSquareGOF([0, 0], [1, 1]).error);
  assert(multinomialExactGOF([1.5, 2], [1, 1]).error);
});

suite("fisherExact 2×2 vs fisher.test");

test("p, conditional-MLE odds ratio and 95 % CI", () => {
  const cases = [
    [
      [
        [10, 3],
        [2, 15],
      ],
      0.000536724119143437,
      21.3053175567504,
      2.75338278824932,
      301.462337971516,
    ],
    [
      [
        [3, 1],
        [1, 3],
      ],
      0.485714285714286,
      6.40831965819966,
      0.211735595446578,
      626.243530588813,
    ],
    [
      [
        [41, 7],
        [3, 43],
      ],
      8.58303088366989e-16,
      76.7836717948393,
      17.9998505747495,
      493.532967372086,
    ],
  ];
  for (const [t, p, or, lo, hi] of cases) {
    const r = fisherExact(t);
    rel(r.p, p, 1e-11, "p");
    rel(r.oddsRatio, or, 1e-10, "OR");
    rel(r.orCI[0], lo, 1e-10, "CI lower");
    rel(r.orCI[1], hi, 1e-10, "CI upper");
    eq(r.method, "exact");
  }
});

test("zero cells: OR 0 / ∞ with an open CI end", () => {
  const r0 = fisherExact([
    [0, 7],
    [5, 3],
  ]);
  eq(r0.oddsRatio, 0);
  eq(r0.orCI[0], 0);
  const rInf = fisherExact([
    [7, 0],
    [3, 5],
  ]);
  eq(rInf.oddsRatio, Infinity);
  eq(rInf.orCI[1], Infinity);
});

suite("fisherExact R×C vs fisher.test");

test("exact network enumeration", () => {
  rel(
    fisherExact([
      [5, 3, 1],
      [2, 6, 2],
      [1, 2, 7],
    ]).p,
    0.0359057427471307,
    1e-11
  );
  rel(
    fisherExact([
      [3, 2, 1, 0],
      [4, 5, 1, 2],
    ]).p,
    0.904977375565605,
    1e-11
  );
  const big = fisherExact([
    [17, 5, 4],
    [30, 21, 14],
    [6, 4, 4],
    [2, 24, 2],
  ]);
  eq(big.method, "exact");
  rel(big.p, 3.49983243939925e-6, 1e-10);
});

test("empty rows / columns are dropped without changing p", () => {
  rel(
    fisherExact([
      [5, 3, 0, 1],
      [2, 6, 0, 2],
      [0, 0, 0, 0],
      [1, 2, 0, 7],
    ]).p,
    0.0359057427471307,
    1e-11
  );
  eq(
    fisherExact([
      [5, 0, 0],
      [3, 0, 0],
      [0, 0, 0],
    ]).p,
    1
  );
});

test("work budget exceeded → seeded Monte-Carlo, R's (1 + hits) / (B + 1)", () => {
  const t = [
    [17, 5, 4],
    [30, 21, 14],
    [6, 4, 4],
    [2, 24, 2],
  ];
  const a = fisherExact(t, { maxWork: 10, B: 2000, seed: 7 });
  const b = fisherExact(t, { maxWork: 10, B: 2000, seed: 7 });
  eq(a.method, "monteCarlo");
  eq(a.B, 2000);
  eq(a.p, b.p); // deterministic for a given seed
  // Exact p ≈ 3.5e-6 → essentially no simulated table is as extreme.
  assert(a.p <= 3 / 2001, `simulated p ${a.p}`);
  // p = (1 + hits) / (B + 1) with an integer hit count
  assert(Math.abs(a.p * 2001 - Math.round(a.p * 2001)) < 1e-9, "p is (1 + hits) / 2001");
  rel(a.mcSE, Math.sqrt((a.p * (1 - a.p)) / 2000), 1e-12);
});

test("Monte-Carlo estimate agrees with the exact p within sampling error", () => {
  // F2 families × 4 phenotype classes; exact p (R fisher.test) 0.107720443249.
  const t = [
    [315, 108, 101, 32],
    [141, 44, 52, 13],
    [98, 37, 22, 19],
  ];
  const mc = fisherExact(t, { maxWork: 10, B: 20000, seed: 1 });
  eq(mc.method, "monteCarlo");
  assert(Math.abs(mc.p - 0.107720443249) < 4 * mc.mcSE, `p ${mc.p} ± ${mc.mcSE}`);
});

test("invalid tables → error", () => {
  assert(fisherExact([[1, 2]]).error);
  assert(
    fisherExact([
      [1, -2],
      [1, 2],
    ]).error
  );
});

suite("selectCountsTest");

test("2×2 always Fisher", () => {
  const s = selectCountsTest([
    [100, 120],
    [90, 140],
  ]);
  eq(s.test, "fisher");
  eq(s.reason, "twoByTwo");
});

test("Cochran's rule decides larger tables", () => {
  const ok = selectCountsTest([
    [41, 7],
    [3, 43],
    [9, 41],
    [37, 10],
  ]);
  eq(ok.test, "chi2");
  eq(ok.reason, "cochranOk");
  eq(ok.nCells, 8);
  const bad = selectCountsTest([
    [5, 3, 1],
    [2, 6, 2],
    [1, 2, 7],
  ]);
  eq(bad.test, "fisher");
  eq(bad.reason, "cochranFail");
  eq(bad.nExpectedBelow5, 9);
  rel(bad.minExpected, (9 * 8) / 29, 1e-14);
});

test("20 % boundary: 2 of 10 cells below 5 is still χ²", () => {
  // Expected counts below 5 only in the small row's two smallest cells.
  const t = [
    [30, 30, 30, 30, 30],
    [30, 30, 30, 30, 30],
  ];
  eq(selectCountsTest(t).test, "chi2");
  const E = expectedCounts([
    [2, 3],
    [8, 7],
  ]);
  rel(E[0][0], 2.5, 1e-15);
});

suite("pairwiseFisher");

test("matches R pairwise fisher.test + p.adjust", () => {
  const t = [
    [41, 7],
    [3, 43],
    [9, 41],
    [37, 10],
  ];
  const holm = pairwiseFisher(t, "holm");
  const pRaw = [
    8.583030883669983e-16, 7.961704035472236e-12, 0.4334686147719547, 0.12454135749356282,
    2.9602640505433203e-13, 1.4375018260492675e-9,
  ];
  // R: p.adjust(p_raw, "holm") / "BH"
  const pHolm = [5.149819e-15, 3.184682e-11, 4.334686e-1, 2.490827e-1, 1.480132e-12, 4.312505e-9];
  const pBH = [5.149819e-15, 1.592341e-11, 4.334686e-1, 1.494496e-1, 8.880792e-13, 2.156253e-9];
  holm.forEach((pr, k) => {
    rel(pr.p, pRaw[k], 1e-10, `raw ${k}`);
    rel(pr.pAdj, pHolm[k], 1e-6, `holm ${k}`);
  });
  eq(holm.map((p) => `${p.i}-${p.j}`).join(","), "0-1,0-2,0-3,1-2,1-3,2-3");
  pairwiseFisher(t, "bh").forEach((pr, k) => rel(pr.pAdj, pBH[k], 1e-6, `bh ${k}`));
});

test("pair with a single non-empty column → p = 1", () => {
  const pairs = pairwiseFisher([
    [5, 0],
    [3, 0],
    [0, 4],
  ]);
  eq(pairs[0].p, 1);
});

suite("logFactorial");

test("table and gammaln branch agree with exact values", () => {
  eq(logFactorial(0), 0);
  eq(logFactorial(1), 0);
  rel(logFactorial(10), Math.log(3628800), 1e-15);
  rel(logFactorial(200000), 2241221.5510813072, 1e-12);
});

summary();

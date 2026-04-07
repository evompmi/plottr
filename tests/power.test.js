// Power analysis statistical function tests.
// Validates distribution functions and power calculations against known values.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const vm = require("vm");
const fs = require("fs");

// Load power.js into a vm context with minimal React stubs
const code = fs.readFileSync(require("path").join(__dirname, "../tools/power.js"), "utf-8");
const ctx = {
  React: {
    createElement: () => null,
    useState: () => [null, () => {}],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
    forwardRef: (fn) => fn,
  },
  ReactDOM: { render: () => {} },
  document: { getElementById: () => ({}) },
  // Globals from shared.js
  sec: {}, lbl: {}, inpN: {}, selStyle: {}, btnDownload: {}, btnPrimary: {},
  toolIcon: () => null, makeTicks: (min, max, n) => {
    const step = (max - min) / n;
    const ticks = [];
    for (let i = 0; i <= n; i++) ticks.push(min + step * i);
    return ticks;
  },
  downloadSvg: () => {},
  PageHeader: () => null,
  computeLegendHeight: () => 0,
};
vm.createContext(ctx);
// Append a line that copies TESTS to context so we can access it
vm.runInContext(code + "\nthis.TESTS = TESTS;", ctx);

// Extract functions from context
const { normcdf, norminv, gammaln, betai, tcdf, tinv, fcdf, chi2cdf, chi2inv,
        nctcdf, ncfcdf, ncchi2cdf, gammainc, bisect, TESTS } = ctx;

// ── Normal distribution ────────────────────────────────────────────────────

suite("normcdf");

test("normcdf(0) = 0.5", () => {
  approx(normcdf(0), 0.5);
});

test("normcdf standard values", () => {
  approx(normcdf(1), 0.8413, 0.001);
  approx(normcdf(-1), 0.1587, 0.001);
  approx(normcdf(1.96), 0.975, 0.001);
  approx(normcdf(-1.96), 0.025, 0.001);
  approx(normcdf(2.576), 0.995, 0.001);
});

suite("norminv");

test("norminv round-trips with normcdf", () => {
  [0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975].forEach(p => {
    approx(normcdf(norminv(p)), p, 0.0001);
  });
});

test("norminv(0.975) ≈ 1.96", () => {
  approx(norminv(0.975), 1.96, 0.001);
});

// ── Gamma / Beta functions ─────────────────────────────────────────────────

suite("gammaln");

test("gammaln(1) = 0 (0! = 1)", () => {
  approx(gammaln(1), 0, 0.0001);
});

test("gammaln(5) = ln(24)", () => {
  approx(gammaln(5), Math.log(24), 0.0001);
});

test("gammaln(0.5) = ln(√π)", () => {
  approx(gammaln(0.5), Math.log(Math.sqrt(Math.PI)), 0.0001);
});

suite("betai");

test("betai boundary values", () => {
  approx(betai(1, 1, 0), 0);
  approx(betai(1, 1, 1), 1);
  approx(betai(1, 1, 0.5), 0.5);
});

test("betai(2, 3, 0.5) ≈ 0.6875", () => {
  // I(0.5; 2,3) = 11/16 = 0.6875
  approx(betai(2, 3, 0.5), 0.6875, 0.001);
});

// ── t-distribution ─────────────────────────────────────────────────────────

suite("tcdf");

test("tcdf(0, any_df) = 0.5", () => {
  approx(tcdf(0, 10), 0.5);
  approx(tcdf(0, 100), 0.5);
});

test("tcdf approaches normcdf for large df", () => {
  approx(tcdf(1.96, 10000), normcdf(1.96), 0.001);
});

test("tcdf known values", () => {
  // t(10): P(T ≤ 2.228) ≈ 0.975
  approx(tcdf(2.228, 10), 0.975, 0.002);
  // t(30): P(T ≤ 2.042) ≈ 0.975
  approx(tcdf(2.042, 30), 0.975, 0.002);
});

suite("tinv");

test("tinv round-trips with tcdf", () => {
  [0.025, 0.05, 0.5, 0.95, 0.975].forEach(p => {
    approx(tcdf(tinv(p, 20), 20), p, 0.001);
  });
});

// ── F-distribution ─────────────────────────────────────────────────────────

suite("fcdf");

test("fcdf(0, d1, d2) = 0", () => {
  approx(fcdf(0, 3, 20), 0);
});

test("fcdf known values", () => {
  // F(3, 20): P(F ≤ 3.10) ≈ 0.95
  approx(fcdf(3.10, 3, 20), 0.95, 0.01);
});

// ── Chi-square distribution ────────────────────────────────────────────────

suite("chi2cdf");

test("chi2cdf known values", () => {
  // χ²(1): P(X ≤ 3.841) ≈ 0.95
  approx(chi2cdf(3.841, 1), 0.95, 0.01);
  // χ²(5): P(X ≤ 11.07) ≈ 0.95
  approx(chi2cdf(11.07, 5), 0.95, 0.01);
});

test("chi2inv round-trips", () => {
  approx(chi2cdf(chi2inv(0.95, 4), 4), 0.95, 0.001);
});

// ── Power calculations ─────────────────────────────────────────────────────

suite("Power — two-sample t-test");

test("d=0.5, n=64, α=0.05, 2-tailed ≈ 0.80", () => {
  // Classic textbook: n≈64/group for d=0.5, α=0.05, power=0.80
  const pw = TESTS["t-ind"].power(0.5, 64, 0.05, 2);
  approx(pw, 0.80, 0.03);
});

test("d=0.8, n=26, α=0.05, 2-tailed ≈ 0.80", () => {
  // n≈26/group for d=0.8
  const pw = TESTS["t-ind"].power(0.8, 26, 0.05, 2);
  approx(pw, 0.80, 0.04);
});

test("d=0.2, n=394, α=0.05, 2-tailed ≈ 0.80", () => {
  const pw = TESTS["t-ind"].power(0.2, 394, 0.05, 2);
  approx(pw, 0.80, 0.03);
});

test("power increases with n", () => {
  const p1 = TESTS["t-ind"].power(0.5, 20, 0.05, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p3 = TESTS["t-ind"].power(0.5, 100, 0.05, 2);
  assert(p1 < p2, "power should increase with n");
  assert(p2 < p3, "power should increase with n");
});

test("power increases with effect size", () => {
  const p1 = TESTS["t-ind"].power(0.2, 50, 0.05, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p3 = TESTS["t-ind"].power(0.8, 50, 0.05, 2);
  assert(p1 < p2, "power should increase with effect size");
  assert(p2 < p3, "power should increase with effect size");
});

suite("Power — paired t-test");

test("d=0.5, n=34, α=0.05, 2-tailed ≈ 0.80", () => {
  const pw = TESTS["t-paired"].power(0.5, 34, 0.05, 2);
  approx(pw, 0.80, 0.04);
});

suite("Power — one-way ANOVA");

test("f=0.25, k=3, n=53, α=0.05 ≈ 0.80", () => {
  // Medium effect, 3 groups: n≈53/group
  const pw = TESTS["anova"].power(0.25, 53, 0.05, 2, 3);
  approx(pw, 0.80, 0.05);
});

test("power increases with n for ANOVA", () => {
  const p1 = TESTS["anova"].power(0.25, 20, 0.05, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 60, 0.05, 2, 3);
  assert(p1 < p2, "ANOVA power should increase with n");
});

suite("Power — correlation");

test("r=0.3, n=85, α=0.05, 2-tailed ≈ 0.80", () => {
  const pw = TESTS["correlation"].power(0.3, 85, 0.05, 2);
  approx(pw, 0.80, 0.04);
});

suite("Power — chi-square");

test("w=0.3, df=1, n=88, α=0.05 ≈ 0.80", () => {
  const pw = TESTS["chi2"].power(0.3, 88, 0.05, 2, 0, 1);
  approx(pw, 0.80, 0.05);
});

test("power increases with n for chi-square", () => {
  const p1 = TESTS["chi2"].power(0.3, 30, 0.05, 2, 0, 1);
  const p2 = TESTS["chi2"].power(0.3, 100, 0.05, 2, 0, 1);
  assert(p1 < p2, "chi2 power should increase with n");
});

// ── Bisection solver ───────────────────────────────────────────────────────

suite("bisect");

test("finds sqrt(2)", () => {
  const r = bisect(x => x * x, 2, 0, 2);
  approx(r, Math.SQRT2, 0.0001);
});

test("finds sample size for t-test", () => {
  const fn = n => TESTS["t-ind"].power(0.5, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.80, 2, 500, 0.5));
  assert(n >= 60 && n <= 70, `expected ~64, got ${n}`);
});

summary();

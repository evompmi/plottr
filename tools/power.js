const { useState, useMemo, useCallback, useRef, forwardRef } = React;
function normcdf(x) {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * Math.exp(-0.5 * x * x) * poly;
  return x > 0 ? p : 1 - p;
}
function norminv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239
  ];
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572
  ];
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function gammaln(x) {
  const g = 7;
  const coef = [
    0.9999999999998099,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9984369578019572e-21,
    15056327351493116e-23
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betai(a, b, x) {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lnBeta = gammaln(a) + gammaln(b) - gammaln(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(a, b, x) / a;
  }
  return 1 - front * betacf(b, a, 1 - x) / b;
}
function betacf(a, b, x) {
  const maxIter = 200, eps = 3e-14;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
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
function gammainc(a, x) {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x > a + 1) return 1 - gammainc_upper(a, x);
  let sum = 1 / a, term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 3e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}
function gammainc_upper(a, x) {
  let f = x + 1 - a, c = 1 / 1e-30, d = 1 / f, h = d;
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
function tcdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? 1 - p : p;
}
function tinv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -50, hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tcdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}
function fcdf(f, d1, d2) {
  if (f <= 0) return 0;
  return betai(d1 / 2, d2 / 2, d1 * f / (d1 * f + d2));
}
function chi2cdf(x, k) {
  if (x <= 0) return 0;
  return gammainc(k / 2, x / 2);
}
function chi2inv(p, k) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0, hi = k + 10 * Math.sqrt(2 * k);
  while (chi2cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chi2cdf(mid, k) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}
function nctcdf(t, df, delta) {
  const z = (t * Math.sqrt(1 - 1 / (4 * df)) - delta) / Math.sqrt(1 + t * t / (2 * df));
  return normcdf(z);
}
function ncf_sf(f, d1, d2, lambda) {
  if (f <= 0) return 1;
  if (lambda <= 0) return 1 - fcdf(f, d1, d2);
  const halfLam = lambda / 2;
  let sum = 0;
  let poissonTerm = Math.exp(-halfLam);
  for (let j = 0; j < 200; j++) {
    if (j > 0) poissonTerm *= halfLam / j;
    const d1j = d1 + 2 * j;
    const fAdj = f * d1 / d1j;
    const contrib = poissonTerm * (1 - fcdf(fAdj, d1j, d2));
    sum += contrib;
    if (j > 5 && contrib < 1e-14) break;
  }
  return sum;
}
function ncchi2cdf(x, k, lambda) {
  if (x <= 0) return 0;
  if (lambda <= 0) return chi2cdf(x, k);
  const halfLam = lambda / 2;
  let sum = 0;
  let poissonTerm = Math.exp(-halfLam);
  for (let j = 0; j < 200; j++) {
    if (j > 0) poissonTerm *= halfLam / j;
    const contrib = poissonTerm * gammainc(k / 2 + j, x / 2);
    sum += contrib;
    if (j > 5 && contrib < 1e-14) break;
  }
  return sum;
}
function bisect(fn, target, lo, hi, tol = 1e-6, maxIter = 200) {
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}
const TESTS = {
  "t-ind": {
    label: "Independent two-sample t-test",
    desc: "Compare means of two independent groups",
    effectLabel: "Cohen's d",
    effectHint: "d = |\u03BC\u2081 \u2212 \u03BC\u2082| / \u03C3_pooled",
    nLabel: "n per group",
    benchmarks: { small: 0.2, medium: 0.5, large: 0.8 },
    power(d, n, alpha, tails) {
      const df = 2 * n - 2;
      const delta = d * Math.sqrt(n / 2);
      const tCrit = tinv(1 - alpha / tails, df);
      if (tails === 2) {
        return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
      }
      return 1 - nctcdf(tCrit, df, delta);
    }
  },
  "t-paired": {
    label: "Paired t-test",
    desc: "Compare means of paired/matched observations",
    effectLabel: "Cohen's d",
    effectHint: "d = |\u03BC_diff| / \u03C3_diff",
    nLabel: "n (pairs)",
    benchmarks: { small: 0.2, medium: 0.5, large: 0.8 },
    power(d, n, alpha, tails) {
      const df = n - 1;
      const delta = d * Math.sqrt(n);
      const tCrit = tinv(1 - alpha / tails, df);
      if (tails === 2) {
        return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
      }
      return 1 - nctcdf(tCrit, df, delta);
    }
  },
  "t-one": {
    label: "One-sample t-test",
    desc: "Compare mean to a known value",
    effectLabel: "Cohen's d",
    effectHint: "d = |\u03BC \u2212 \u03BC\u2080| / \u03C3",
    nLabel: "n",
    benchmarks: { small: 0.2, medium: 0.5, large: 0.8 },
    power(d, n, alpha, tails) {
      const df = n - 1;
      const delta = d * Math.sqrt(n);
      const tCrit = tinv(1 - alpha / tails, df);
      if (tails === 2) {
        return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
      }
      return 1 - nctcdf(tCrit, df, delta);
    }
  },
  "anova": {
    label: "One-way ANOVA",
    desc: "Compare means across k groups",
    effectLabel: "Cohen's f",
    effectHint: "f = \u03C3_means / \u03C3_within",
    nLabel: "n per group",
    benchmarks: { small: 0.1, medium: 0.25, large: 0.4 },
    hasGroups: true,
    power(f, n, alpha, _tails, k) {
      const df1 = k - 1;
      const df2 = k * (n - 1);
      const lambda = n * k * f * f;
      const fCrit = bisect((x) => fcdf(x, df1, df2), 1 - alpha, 0, 200);
      return ncf_sf(fCrit, df1, df2, lambda);
    }
  },
  "correlation": {
    label: "Correlation (Pearson r)",
    desc: "Test whether a correlation differs from zero",
    effectLabel: "|r|",
    effectHint: "Expected absolute correlation",
    nLabel: "n (total)",
    benchmarks: { small: 0.1, medium: 0.3, large: 0.5 },
    effectMax: 0.99,
    power(r, n, alpha, tails) {
      const zr = Math.atanh(r);
      const se = 1 / Math.sqrt(Math.max(1, n - 3));
      const zCrit = norminv(1 - alpha / tails);
      if (tails === 2) {
        return normcdf(Math.abs(zr) / se - zCrit) + normcdf(-Math.abs(zr) / se - zCrit);
      }
      return normcdf(zr / se - zCrit);
    }
  },
  "chi2": {
    label: "Chi-square test",
    desc: "Goodness-of-fit or independence",
    effectLabel: "Cohen's w",
    effectHint: "w = \u221A(\u03A3 (p_obs \u2212 p_exp)\xB2 / p_exp)",
    nLabel: "n (total)",
    benchmarks: { small: 0.1, medium: 0.3, large: 0.5 },
    hasDf: true,
    power(w, n, alpha, _tails, _k, df) {
      const lambda = n * w * w;
      const chiCrit = chi2inv(1 - alpha, df);
      return 1 - ncchi2cdf(chiCrit, df, lambda);
    }
  }
};
const PowerCurve = forwardRef(function PowerCurve2({ testKey, params, solveFor, result }, ref) {
  const test = TESTS[testKey];
  if (!test) return null;
  const VBW = 520, VBH = 320;
  const M = { top: 30, right: 20, bottom: 50, left: 55 };
  const w = VBW - M.left - M.right;
  const h = VBH - M.top - M.bottom;
  const { d, n, alpha, tails, k, df } = params;
  let xVar, xLabel, xRange, curvePoints;
  if (solveFor === "n" || solveFor === "power") {
    xVar = "n";
    xLabel = test.nLabel;
    const maxN = Math.max(200, result && solveFor === "n" ? result * 2.5 : 200);
    const minN = testKey === "anova" ? 2 : testKey === "correlation" ? 4 : 2;
    xRange = [minN, Math.ceil(maxN)];
    const steps = 100;
    curvePoints = [];
    for (let i = 0; i <= steps; i++) {
      const xn = xRange[0] + (xRange[1] - xRange[0]) * i / steps;
      const ni = Math.max(minN, Math.round(xn));
      const pw = test.power(d, ni, alpha, tails, k, df);
      curvePoints.push({ x: ni, y: Math.min(1, Math.max(0, pw)) });
    }
  } else {
    xVar = "d";
    xLabel = test.effectLabel;
    const eMax = test.effectMax || (testKey === "anova" ? 1 : 2);
    xRange = [0.01, eMax];
    const steps = 100;
    curvePoints = [];
    for (let i = 0; i <= steps; i++) {
      const xd = xRange[0] + (xRange[1] - xRange[0]) * i / steps;
      const pw = test.power(xd, n, alpha, tails, k, df);
      curvePoints.push({ x: xd, y: Math.min(1, Math.max(0, pw)) });
    }
  }
  const sx = (v) => M.left + (v - xRange[0]) / (xRange[1] - xRange[0]) * w;
  const sy = (v) => M.top + (1 - v) * h;
  const pathD = curvePoints.map(
    (p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`
  ).join(" ");
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const xTicks = makeTicks(xRange[0], xRange[1], 6);
  let marker = null;
  if (result != null && isFinite(result)) {
    if (xVar === "n") {
      const my = test.power(d, Math.round(result), alpha, tails, k, df);
      marker = { x: sx(result), y: sy(Math.min(1, Math.max(0, my))) };
    } else {
      const my = test.power(result, n, alpha, tails, k, df);
      marker = { x: sx(result), y: sy(Math.min(1, Math.max(0, my))) };
    }
  }
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${VBW} ${VBH}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": "Power curve"
    },
    /* @__PURE__ */ React.createElement("title", null, "Power curve"),
    /* @__PURE__ */ React.createElement("desc", null, "Statistical power as a function of ", xLabel),
    /* @__PURE__ */ React.createElement("rect", { x: M.left, y: M.top, width: w, height: h, fill: "#fafafa" }),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("line", { key: `yg${t}`, x1: M.left, x2: M.left + w, y1: sy(t), y2: sy(t), stroke: "#e8e8e8", strokeWidth: "0.5" })),
    /* @__PURE__ */ React.createElement(
      "line",
      {
        x1: M.left,
        x2: M.left + w,
        y1: sy(0.8),
        y2: sy(0.8),
        stroke: "#D55E00",
        strokeWidth: "1",
        strokeDasharray: "6,3",
        opacity: "0.6"
      }
    ),
    /* @__PURE__ */ React.createElement("text", { x: M.left + w + 3, y: sy(0.8) + 3, fontSize: "9", fill: "#D55E00", fontFamily: "sans-serif" }, "0.80"),
    /* @__PURE__ */ React.createElement("path", { d: pathD, fill: "none", stroke: "#0072B2", strokeWidth: "2.5", strokeLinejoin: "round" }),
    marker && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement(
      "line",
      {
        x1: marker.x,
        x2: marker.x,
        y1: M.top,
        y2: M.top + h,
        stroke: "#E69F00",
        strokeWidth: "1",
        strokeDasharray: "4,2"
      }
    ), /* @__PURE__ */ React.createElement("circle", { cx: marker.x, cy: marker.y, r: "5", fill: "#E69F00", stroke: "#fff", strokeWidth: "1.5" })),
    /* @__PURE__ */ React.createElement("rect", { x: M.left, y: M.top, width: w, height: h, fill: "none", stroke: "#333", strokeWidth: "1" }),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("text", { key: `yl${t}`, x: M.left - 8, y: sy(t) + 4, textAnchor: "end", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, t.toFixed(1))),
    /* @__PURE__ */ React.createElement(
      "text",
      {
        x: 14,
        y: M.top + h / 2,
        textAnchor: "middle",
        fontSize: "12",
        fill: "#333",
        fontFamily: "sans-serif",
        transform: `rotate(-90,14,${M.top + h / 2})`
      },
      "Power (1 \u2212 \u03B2)"
    ),
    xTicks.map((t) => /* @__PURE__ */ React.createElement("text", { key: `xl${t}`, x: sx(t), y: M.top + h + 18, textAnchor: "middle", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, xVar === "n" ? Math.round(t) : t.toFixed(2))),
    /* @__PURE__ */ React.createElement("text", { x: M.left + w / 2, y: VBH - 6, textAnchor: "middle", fontSize: "12", fill: "#333", fontFamily: "sans-serif" }, xLabel)
  );
});
function EffectSizeGuide({ testKey }) {
  const test = TESTS[testKey];
  if (!test || !test.benchmarks) return null;
  const { small, medium, large } = test.benchmarks;
  return /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" } }, "Cohen's benchmarks for ", test.effectLabel), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16 } }, [["Small", small], ["Medium", medium], ["Large", large]].map(([label, val]) => /* @__PURE__ */ React.createElement("div", { key: label, style: { textAlign: "center", flex: 1, background: "#fff", borderRadius: 6, padding: "6px 8px", border: "1px solid #e0e0e0" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#888" } }, label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 700, color: "#333" } }, val)))));
}
function App() {
  const [testKey, setTestKey] = useState("t-ind");
  const [solveFor, setSolveFor] = useState("n");
  const [effectSize, setEffectSize] = useState("0.5");
  const [nInput, setNInput] = useState("30");
  const [alphaInput, setAlphaInput] = useState("0.05");
  const [powerInput, setPowerInput] = useState("0.80");
  const [tails, setTails] = useState(2);
  const [kInput, setKInput] = useState("3");
  const [dfInput, setDfInput] = useState("1");
  const chartRef = useRef();
  const test = TESTS[testKey];
  const d = parseFloat(effectSize) || 0;
  const n = parseInt(nInput) || 2;
  const alpha = parseFloat(alphaInput) || 0.05;
  const power = parseFloat(powerInput) || 0.8;
  const k = parseInt(kInput) || 3;
  const df = parseInt(dfInput) || 1;
  const result = useMemo(() => {
    try {
      const minN = testKey === "correlation" ? 4 : 2;
      if (solveFor === "n") {
        if (d <= 0 || alpha <= 0 || alpha >= 1 || power <= 0 || power >= 1) return null;
        const fn = (ni) => {
          const nn = Math.max(minN, Math.round(ni));
          return test.power(d, nn, alpha, tails, k, df);
        };
        return Math.ceil(bisect(fn, power, minN, 1e5, 0.5));
      }
      if (solveFor === "power") {
        if (d <= 0 || n < minN || alpha <= 0 || alpha >= 1) return null;
        return test.power(d, n, alpha, tails, k, df);
      }
      if (solveFor === "effect") {
        if (n < minN || alpha <= 0 || alpha >= 1 || power <= 0 || power >= 1) return null;
        const eMax = test.effectMax || 5;
        const fn = (es) => test.power(es, n, alpha, tails, k, df);
        return bisect(fn, power, 1e-3, eMax);
      }
      if (solveFor === "alpha") {
        if (d <= 0 || n < minN || power <= 0 || power >= 1) return null;
        const fn = (a) => test.power(d, n, a, tails, k, df);
        return bisect((a) => fn(a), power, 1e-4, 0.5);
      }
    } catch (e) {
      return null;
    }
    return null;
  }, [testKey, solveFor, d, n, alpha, power, tails, k, df]);
  const resultText = useMemo(() => {
    if (result == null) return "\u2014";
    if (solveFor === "n") return `${result}`;
    if (solveFor === "power") return `${(result * 100).toFixed(1)}%`;
    if (solveFor === "effect") return result.toFixed(4);
    if (solveFor === "alpha") return result.toFixed(5);
    return "\u2014";
  }, [result, solveFor]);
  const resultLabel = {
    n: `Required ${test.nLabel}`,
    power: "Statistical power",
    effect: `Detectable ${test.effectLabel}`,
    alpha: "Significance level"
  }[solveFor];
  const handleTestChange = useCallback((e) => {
    const key = e.target.value;
    setTestKey(key);
    if (key === "anova" || key === "chi2") setTails(2);
  }, []);
  const handleDownload = useCallback(() => {
    if (!chartRef.current) return;
    downloadSvg(chartRef.current, "power-curve.svg");
  }, []);
  const inputStyle = { ...inpN, width: "100%" };
  const radioStyle = (active) => ({
    padding: "5px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    border: active ? "2px solid #0072B2" : "2px solid #ddd",
    background: active ? "#e8f4fd" : "#fff",
    fontWeight: active ? 700 : 400,
    color: active ? "#0072B2" : "#555",
    fontFamily: "sans-serif"
  });
  return /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 960, margin: "0 auto", padding: "32px 24px" } }, /* @__PURE__ */ React.createElement(PageHeader, { title: "Power Analysis", icon: toolIcon("power") }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 310, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Statistical test"), /* @__PURE__ */ React.createElement("select", { value: testKey, onChange: handleTestChange, style: { ...selStyle, width: "100%" } }, Object.entries(TESTS).map(([key, t]) => /* @__PURE__ */ React.createElement("option", { key, value: key }, t.label))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", marginTop: 4 } }, test.desc)), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { ...lbl, marginBottom: 6 } }, "Solve for"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } }, [
    ["n", test.nLabel],
    ["power", "Power"],
    ["effect", test.effectLabel],
    ["alpha", "\u03B1"]
  ].map(([key, label]) => /* @__PURE__ */ React.createElement("div", { key, style: radioStyle(solveFor === key), onClick: () => setSolveFor(key) }, label)))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.5px" } }, "Parameters"), /* @__PURE__ */ React.createElement("div", { style: { opacity: solveFor === "effect" ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, test.effectLabel), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0.01",
      step: "0.1",
      value: effectSize,
      onChange: (e) => setEffectSize(e.target.value),
      disabled: solveFor === "effect",
      style: inputStyle
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#999", marginTop: 2 } }, test.effectHint)), /* @__PURE__ */ React.createElement("div", { style: { opacity: solveFor === "n" ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, test.nLabel), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "2",
      step: "1",
      value: nInput,
      onChange: (e) => setNInput(e.target.value),
      disabled: solveFor === "n",
      style: inputStyle
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { opacity: solveFor === "alpha" ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Significance level (\u03B1)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0.001",
      max: "0.5",
      step: "0.01",
      value: alphaInput,
      onChange: (e) => setAlphaInput(e.target.value),
      disabled: solveFor === "alpha",
      style: inputStyle
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { opacity: solveFor === "power" ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Desired power (1 \u2212 \u03B2)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0.01",
      max: "0.999",
      step: "0.05",
      value: powerInput,
      onChange: (e) => setPowerInput(e.target.value),
      disabled: solveFor === "power",
      style: inputStyle
    }
  )), testKey !== "anova" && testKey !== "chi2" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Tails"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, [1, 2].map((t) => /* @__PURE__ */ React.createElement("div", { key: t, style: radioStyle(tails === t), onClick: () => setTails(t) }, t, "-tailed")))), test.hasGroups && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Number of groups (k)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "2",
      max: "20",
      step: "1",
      value: kInput,
      onChange: (e) => setKInput(e.target.value),
      style: inputStyle
    }
  )), test.hasDf && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Degrees of freedom"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      max: "100",
      step: "1",
      value: dfInput,
      onChange: (e) => setDfInput(e.target.value),
      style: inputStyle
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#999", marginTop: 2 } }, "(r\u22121)(c\u22121) for independence, k\u22121 for goodness-of-fit")))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 360, display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 16, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#777", marginBottom: 4 } }, resultLabel), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, fontWeight: 700, color: result != null ? "#0072B2" : "#ccc", fontFamily: "monospace" } }, resultText), solveFor === "n" && result != null && test.hasGroups && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#888", marginTop: 4 } }, "Total N = ", result * k, " (", result, " per group \xD7 ", k, " groups)"), solveFor === "n" && result != null && testKey === "t-ind" && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#888", marginTop: 4 } }, "Total N = ", result * 2, " (", result, " per group \xD7 2 groups)")), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12 } }, /* @__PURE__ */ React.createElement(
    PowerCurve,
    {
      ref: chartRef,
      testKey,
      params: { d, n, alpha, tails, k, df },
      solveFor,
      result
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: handleDownload, style: btnDownload }, "Download SVG"))), /* @__PURE__ */ React.createElement(EffectSizeGuide, { testKey }), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" } }, "Interpretation"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#555", lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement("b", null, "Power"), " is the probability of correctly rejecting H\u2080 when H\u2081 is true (i.e., detecting an effect that genuinely exists). Convention: aim for power \u2265 0.80.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("b", null, "\u03B1"), " is the probability of a Type I error (false positive). Convention: \u03B1 = 0.05.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("b", null, "Effect size"), " quantifies the magnitude of the effect you expect or want to detect. Use pilot data or domain knowledge when possible; Cohen's benchmarks are a last resort.")))));
}
ReactDOM.render(React.createElement(App), document.getElementById("root"));

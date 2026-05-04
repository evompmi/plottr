// Pure calibration, condition-detection, smoothing, and SVG-path helpers for
// the Aequorin tool. No React / DOM dependency — separately testable
// (tests/helpers/aequorin-loader.js loads this file directly). Keep chart
// components and step UI out; they belong in the sibling modules under
// tools/aequorin/ (chart.tsx, stats-panel.tsx, reports.ts, plot-area.tsx,
// steps.tsx, controls.tsx, index.tsx).

import { CHART_MARGIN, buildLineD } from "../_shell/chart-layout";
export { buildLineD };

// ── Calibration defaults ─────────────────────────────────────────────────────
//
// These values are the kinetic rate constants for native shrimp aequorin in
// solution, as determined experimentally and tabulated by Allen & Blinks:
//
//   Allen, D. G., & Blinks, J. R. (1978). "Calcium transients in aequorin-
//   injected frog cardiac muscle." Nature 273(5663): 509-513.
//
//   • KR  = 7     — rate constant for the calcium-bound luminescent state
//   • KTR = 118   — turnover rate from the triggered complex
//
// The Hill variant (Kd) and the adjustable Hill exponent (n) come from the
// equilibrium treatment later adopted for plant aequorin:
//
//   Knight, M. R., Campbell, A. K., Smith, S. M., & Trewavas, A. J. (1991).
//     "Transgenic plant aequorin reports the effects of touch and cold-shock
//     and elicitors on cytoplasmic calcium." Nature 352(6335): 524-526.
//
//   Plieth, C. (2006). "Aequorin as a reporter gene." Methods in Molecular
//     Biology 323: 307-327.
//
//   • KD         = 7   — dissociation constant for the Hill-equilibrium form
//   • HILL_N     = 3   — the canonical triple-Ca²⁺-binding Hill coefficient
//
// These defaults are what plant-science papers almost always report; changing
// them silently shifts every downstream [Ca²⁺] value. `tests/aequorin.test.js`
// pins the (input, DEFAULT_*) → output map so a "tidy" edit can't drift them
// without a test failure.
export const DEFAULT_KR = 7;
export const DEFAULT_KTR = 118;
export const DEFAULT_KD = 7;
export const DEFAULT_HILL_N = 3;

// ── Time units ───────────────────────────────────────────────────────────────

export const TIME_UNITS = [
  { key: "ms", label: "milliseconds" },
  { key: "s", label: "seconds" },
  { key: "min", label: "minutes" },
  { key: "h", label: "hours" },
  { key: "d", label: "days" },
  { key: "w", label: "weeks" },
  { key: "mo", label: "months" },
  { key: "yr", label: "years" },
];

export const TO_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  min: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2629800,
  yr: 31557600,
};

export function convertTime(value: any, fromUnit: any, toUnit: any) {
  if (fromUnit === toUnit) return value;
  return (value * TO_SECONDS[fromUnit]) / TO_SECONDS[toUnit];
}

// ── Formula labels / equations ───────────────────────────────────────────────

export const FORMULA_DEFS = {
  none: {
    label: "No calibration",
    eq: "Raw luminescence values plotted as-is",
  },
  "allen-blinks": {
    label: "Allen & Blinks (1978)",
    eq: "[Ca²⁺] = ((1+Ktr)·f^⅓ − 1) / (Kr·(1−f^⅓))",
  },
  hill: {
    label: "Hill equilibrium",
    eq: "[Ca²⁺] = Kd · (f/(1−f))^⅓  where f = L/ΣL",
  },
  generalized: {
    label: "Generalised Allen & Blinks",
    eq: "[Ca²⁺] = ((1+Ktr)·f^(1/n) − 1) / (Kr·(1−f^(1/n)))",
  },
};

// ── Calibration ──────────────────────────────────────────────────────────────

// Allen & Blinks (1978):
//   [Ca²⁺] = ((1 + Ktr) · f^⅓ − 1) / (Kr · (1 − f^⅓))    with f = L(t) / ΣL
//
// Standard rate-constant form for native shrimp aequorin in solution. f is the
// fraction of the cell's remaining aequorin pool consumed at time t (rundown
// fraction); the cube root reflects the three Ca²⁺-binding sites.
//
//   Allen, D. G., & Blinks, J. R. (1978). "Calcium transients in aequorin-
//     injected frog cardiac muscle." Nature 273(5663): 509-513.
//
// Defaults: Kr = 7, Ktr = 118 (DEFAULT_KR / DEFAULT_KTR above).
export function calibrate(headers: any, data: any, Kr: any, Ktr: any) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal: any[] = [];
  for (let r = 0; r < nRows; r++) {
    const row: any[] = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const cbrt = Math.cbrt(v / totals[c]);
      const denom = Kr * (1 - cbrt);
      row.push(denom === 0 ? null : ((1 + Ktr) * cbrt - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

// Hill equilibrium:
//   [Ca²⁺] = Kd · (f / (1 − f))^⅓    with f = L(t) / ΣL
//
// Equilibrium-binding treatment adopted for plant aequorin. The cube root is
// the canonical triple-Ca²⁺-binding Hill coefficient (n = 3); Kd is the
// apparent dissociation constant of the Ca²⁺–aequorin complex.
//
//   Knight, M. R., Campbell, A. K., Smith, S. M., & Trewavas, A. J. (1991).
//     "Transgenic plant aequorin reports the effects of touch and cold-shock
//     and elicitors on cytoplasmic calcium." Nature 352(6335): 524-526.
//
//   Plieth, C. (2006). "Aequorin as a reporter gene." Methods in Molecular
//     Biology 323: 307-327.
//
// Default: Kd = 7 (DEFAULT_KD above). Note: published Kd values for plant
// aequorin vary between groups; this default is what plant-science papers
// most commonly report — change it if your reference uses a different value.
export function calibrateHill(headers: any, data: any, Kd: any) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal: any[] = [];
  for (let r = 0; r < nRows; r++) {
    const row: any[] = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const f = v / totals[c];
      if (f >= 1) {
        row.push(null);
        continue;
      }
      row.push(Kd * Math.cbrt(f / (1 - f)));
    }
    cal.push(row);
  }
  return cal;
}

// Generalised Allen & Blinks:
//   [Ca²⁺] = ((1 + Ktr) · f^(1/n) − 1) / (Kr · (1 − f^(1/n)))    with f = L(t) / ΣL
//
// Same rate-constant form as Allen & Blinks (1978) above, with the cube root
// replaced by an adjustable Hill exponent n. Setting n = 3 recovers the
// standard Allen & Blinks expression exactly. The generalised exponent treatment
// is described in:
//
//   Plieth, C. (2006). "Aequorin as a reporter gene." Methods in Molecular
//     Biology 323: 307-327.
//
// Defaults: Kr = 7, Ktr = 118, n = 3 (DEFAULT_KR / DEFAULT_KTR / DEFAULT_HILL_N).
export function calibrateGeneralized(headers: any, data: any, Kr: any, Ktr: any, n: any) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal: any[] = [];
  for (let r = 0; r < nRows; r++) {
    const row: any[] = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const fn = Math.pow(v / totals[c], 1 / n);
      const denom = Kr * (1 - fn);
      row.push(denom === 0 ? null : ((1 + Ktr) * fn - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

export function detectConditions(
  headers: any,
  poolReplicates = true,
  columnEnabled: any = null,
  paletteName: string = "okabe-ito"
) {
  const nameOcc: Record<string, number> = {};
  const repNums = headers.map((h: any) => {
    nameOcc[h] = (nameOcc[h] || 0) + 1;
    return nameOcc[h];
  });
  if (poolReplicates) {
    const pm: Record<string, number[]> = {};
    headers.forEach((h: any, i: number) => {
      if (columnEnabled && columnEnabled[i] === false) return;
      if (!pm[h]) pm[h] = [];
      pm[h].push(i);
    });
    const entries = Object.entries(pm);
    const seed = resolveDiscretePalette(paletteName, entries.length);
    return entries.map(([name, colIndices], idx) => ({
      prefix: name,
      label: name,
      color: seed[idx % Math.max(1, seed.length)] || PALETTE[idx % PALETTE.length],
      colIndices,
    }));
  } else {
    const items = headers
      .map((h: any, i: number) => ({ h, i, rep: repNums[i] }))
      .filter(({ i }: any) => !columnEnabled || columnEnabled[i] !== false);
    const seed = resolveDiscretePalette(paletteName, items.length);
    return items.map(({ h, i, rep }: any, ci: number) => ({
      prefix: `${h}__col${i}`,
      label: `${h}_rep${rep}`,
      color: seed[ci % Math.max(1, seed.length)] || PALETTE[ci % PALETTE.length],
      colIndices: [i],
    }));
  }
}

export function smooth(arr: any, w: any) {
  if (w <= 0) return arr;
  return arr.map((_: any, i: number) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) {
      if (arr[j] != null) {
        sum += arr[j];
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

// ── SVG path builders ────────────────────────────────────────────────────────

export function buildAreaD(pts: any) {
  const valid = pts.filter((p: any) => p.yHi != null && p.yLo != null);
  if (valid.length < 2) return "";
  const fwd = valid.map((p: any) => `${p.x.toFixed(2)},${p.yHi.toFixed(2)}`);
  const rev = valid
    .slice()
    .reverse()
    .map((p: any) => `${p.x.toFixed(2)},${p.yLo.toFixed(2)}`);
  return "M" + fwd.join("L") + "L" + rev.join("L") + "Z";
}

// ── Chart layout constant ────────────────────────────────────────────────────
// Re-exported from `_shell/chart-layout.ts` (audit M7 — was byte-identical
// with lineplot's `MARGIN`).
export const MARGIN = CHART_MARGIN;

// ── Auto Y-axis range over a visible x-window ────────────────────────────────
// Returns { yMin, yMax } padded ±10% (lower clamped at 0, both rounded to
// 2 decimal places — matches the prior inline logic in index.tsx). Returns
// `null` when calData is empty / window contains no finite values, so the
// caller can short-circuit instead of pushing NaN through updVis.
//
// Pure for testability: the React layer (useLayoutEffect in index.tsx) calls
// this and pushes the result into vis.{yMin,yMax}. Pre-existing values in
// vis.* (e.g. rehydrated from auto-prefs of a previous session) are
// irrelevant — this function is keyed only on the actual data, so the
// chart never paints with a stale persisted range.
export function computeAutoYRange(calData: any, xStart: any, xEnd: any) {
  if (!calData || calData.length === 0) return null;
  const r0 = Math.max(0, Math.floor(xStart));
  const r1 = Math.min(calData.length - 1, Math.ceil(xEnd));
  let lo = Infinity,
    hi = -Infinity;
  for (let r = r0; r <= r1; r++) {
    const row = calData[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v != null && Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return null;
  const round2 = (v: any) => Math.round(v * 100) / 100;
  return { yMin: round2(Math.max(0, lo * 0.9)), yMax: round2(hi * 1.1) };
}

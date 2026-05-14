// _core/descriptive.ts — sample-level descriptive stats (mean / SD / SEM /
// CI95 / quartiles / kde) and the per-group convenience wrapper.
//
// Carved out of `_core/shared.ts` in v1.6.x. Depends on `_core/stats/dist`
// for `tinv` (CI95 t-critical) and `_core/numeric` for the isNumeric guard
// in `computeGroupStats`.

import { isNumericValue, toNumericValue } from "./numeric";
import { tinv } from "./stats/dist";

export interface ComputeStatsResult {
  mean: number;
  sd: number;
  sem: number;
  ci95: number;
  n: number;
  min: number;
  max: number;
  median: number;
}

export function computeStats(arr: number[]): ComputeStatsResult | null {
  const n = arr.length;
  if (n === 0) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const sd = Math.sqrt(variance);
  const sem = n > 1 ? sd / Math.sqrt(n) : 0;
  // Two-sided t-critical × SEM at 95 %. Matches lineplot's per-x CI.
  const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return { mean, sd, sem, ci95, n, min, max, median };
}

export interface QuartilesResult {
  min: number;
  max: number;
  q1: number;
  med: number;
  q3: number;
  iqr: number;
  wLo: number;
  wHi: number;
  n: number;
}

export function quartiles(arr: number[]): QuartilesResult | null {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return null;
  const q = (p: number): number => {
    const i = p * (n - 1),
      lo = Math.floor(i),
      hi = Math.min(Math.ceil(i), n - 1);
    return lo === hi ? s[lo] : s[lo] * (hi - i) + s[hi] * (i - lo);
  };
  const q1 = q(0.25),
    med = q(0.5),
    q3 = q(0.75),
    iqr = q3 - q1;
  return {
    min: s[0],
    max: s[n - 1],
    q1,
    med,
    q3,
    iqr,
    wLo: Math.min(s.find((v) => v >= q1 - 1.5 * iqr) ?? s[0], q1),
    wHi: Math.max([...s].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? s[n - 1], q3),
    n,
  };
}

export interface KdePoint {
  x: number;
  d: number;
}

export function kde(values: number[], nPoints: number = 50): KdePoint[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0],
    max = sorted[n - 1];
  const iqr = n >= 4 ? sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)] : max - min;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const bw = 1.06 * Math.min(std, (iqr || 1) / 1.34) * n ** -0.2 || 1;
  const pad = bw * 2;
  const lo = min - pad,
    hi = max + pad;
  const step = (hi - lo) / (nPoints - 1);
  const pts: KdePoint[] = [];
  for (let i = 0; i < nPoints; i++) {
    const x = lo + i * step;
    let density = 0;
    for (let j = 0; j < n; j++) {
      const z = (x - values[j]) / bw;
      density += Math.exp(-0.5 * z * z);
    }
    density /= n * bw * Math.sqrt(2 * Math.PI);
    pts.push({ x, d: density });
  }
  return pts;
}

export interface GroupStats {
  name: string;
  n: number;
  mean: number | null;
  sd: number | null;
  sem: number | null;
  ci95?: number;
  min: number | null;
  max: number | null;
  median: number | null;
}

export function computeGroupStats(groups: Record<string, unknown[]>): GroupStats[] {
  return Object.entries(groups).map(([name, vals]) => {
    const nums = vals.filter((v) => v !== "" && isNumericValue(v)).map(toNumericValue);
    const stats = computeStats(nums);
    if (!stats)
      return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
    return { name, ...stats };
  });
}

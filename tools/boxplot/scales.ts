// Pure y-domain, band-scale, value-scale, ticks, and tick-format helpers
// for the boxplot chart.
//
// `computeYDomain` is the most involved piece — it handles three plot
// regimes (bar / box-style / violin-or-raincloud), bypasses the raw
// dMin/dMax in bar mode (where 0 anchors the baseline and stats.mean ± err
// drives the top), and adjusts for log scales. The band and value scales
// are returned as closures bound over the relevant geometry; mirror the
// original chart.tsx code byte-for-byte so the visual result is identical.

import type { BoxplotGroup } from "./helpers";
import type { ChartMargins } from "./layout";

import { makeLogTicks, makeTicks } from "../_core/scale";
// ── Y-domain ────────────────────────────────────────────────────────────────

export interface YDomainInput {
  allV: number[];
  groups: BoxplotGroup[];
  isBar: boolean;
  plotStyle: string;
  errorType: string;
  getKde: (allValues: number[]) => Array<{ x: number; d: number }>;
  yMinP: number | null;
  yMaxP: number | null;
  yScale: string | null | undefined;
}

export interface YDomainResult {
  dMin: number;
  dMax: number;
  yMin: number;
  yMax: number;
  isLog: boolean;
  logFn: ((v: number) => number) | null;
  logBase: number;
  safeLog: (v: number) => number;
}

// Caller is responsible for the `allV.length === 0 → early return null`
// guard upstream; this function assumes a non-empty value array.
export function computeYDomain(opts: YDomainInput): YDomainResult {
  const { allV, groups, isBar, plotStyle, errorType, getKde, yMinP, yMaxP, yScale } = opts;

  let dMin = Math.min(...allV);
  let dMax = Math.max(...allV);
  if (isBar) {
    // Bar mode pins the data range to 0..max(mean+err) so the bar baseline
    // anchors at 0 and the error-bar caps don't push past the y-axis. The
    // original raw dMin/dMax over allV is overwritten by the per-group
    // mean/sd/sem/ci95 walk below.
    dMin = 0;
    dMax = 0;
    for (const g of groups) {
      if (!g.stats) continue;
      const errVal =
        errorType === "none"
          ? 0
          : errorType === "sd"
            ? g.stats.sd
            : errorType === "ci95"
              ? g.stats.ci95
              : g.stats.sem;
      const top = g.stats.mean + errVal;
      if (top > dMax) dMax = top;
      if (g.stats.mean < dMin) dMin = g.stats.mean;
      if (g.stats.max > dMax) dMax = g.stats.max;
      if (g.stats.min < dMin) dMin = g.stats.min;
    }
  } else if (plotStyle === "violin" || plotStyle === "raincloud") {
    // Violin / raincloud: KDE tails can extend past the raw data extrema.
    // Widen the domain to the kernel support so the violin shape doesn't
    // get clipped at its own outermost density bins.
    for (const g of groups) {
      if (g.allValues.length >= 2) {
        const pts = getKde(g.allValues);
        const kMin = pts[0].x;
        const kMax = pts[pts.length - 1].x;
        if (kMin < dMin) dMin = kMin;
        if (kMax > dMax) dMax = kMax;
      }
    }
  }

  const pad = (dMax - dMin) * 0.08 || 1;
  // User-supplied yMin/yMax overrides win unconditionally; otherwise auto-
  // pad. Bar mode floors at 0 when the data is non-negative so bars
  // genuinely start from the baseline rather than from a small padded
  // negative.
  let yMin = yMinP != null ? yMinP : isBar ? (dMin >= 0 ? 0 : dMin - pad) : dMin - pad;
  let yMax = yMaxP != null ? yMaxP : dMax + pad;

  const isLog = !!(yScale && yScale !== "linear");
  const logFn =
    yScale === "log2"
      ? Math.log2
      : yScale === "log10"
        ? Math.log10
        : yScale === "ln"
          ? Math.log
          : null;
  const logBase = yScale === "log2" ? 2 : yScale === "log10" ? 10 : yScale === "ln" ? Math.E : 0;
  const safeLog = (v: number): number => (logFn && v > 0 ? logFn(v) : logFn ? logFn(1e-10) : v);

  if (isLog) {
    // Log scale demands strictly positive yMin. Use the smallest positive
    // value / 2 as a floor (standard ggplot2-style heuristic); fall back to
    // a sensible base-dependent default when no positive values exist.
    const posVals = allV.filter((v) => v > 0);
    if (posVals.length > 0) {
      const smallestPos = Math.min(...posVals);
      if (yMin <= 0) yMin = smallestPos / 2;
    } else {
      yMin = logBase === 2 ? 0.5 : 0.1;
    }
    if (yMax <= yMin) yMax = yMin * 10;
  }

  return { dMin, dMax, yMin, yMax, isLog, logFn, logBase, safeLog };
}

// ── Band scale ──────────────────────────────────────────────────────────────

// `bx(i)` maps a 0-based category index to its band centre in chart coords.
// Adds the cumulative subgroup-separator gap when present so each subgroup's
// first band sits past the dashed separator.

export interface BandScaleInput {
  M: ChartMargins;
  hz: boolean;
  bandW: number;
  cumulGap: number[] | null;
}

export function makeBandScale(opts: BandScaleInput): (i: number) => number {
  const { M, hz, bandW, cumulGap } = opts;
  return (i: number): number => {
    const base = (hz ? M.top : M.left) + i * bandW + bandW / 2;
    return cumulGap ? base + cumulGap[i] : base;
  };
}

// ── Value scale ─────────────────────────────────────────────────────────────

// `sy(v)` maps a data-space y value to chart-space pixel coords. Two
// branches: log-scale path applies `safeLog` to the value (clamped at
// yMin so log of a non-positive doesn't blow up); linear path uses the
// straight ratio. Both flip the orientation in non-hz mode so that
// "bigger" values render higher up on screen (`M.top + (1 - frac) * h`).

export interface ValueScaleInput {
  yMin: number;
  yMax: number;
  isLog: boolean;
  safeLog: (v: number) => number;
  M: ChartMargins;
  w: number;
  h: number;
  hz: boolean;
}

export function makeValueScale(opts: ValueScaleInput): (v: number) => number {
  const { yMin, yMax, isLog, safeLog, M, w, h, hz } = opts;
  return isLog
    ? (v: number) => {
        const lv = safeLog(Math.max(v, yMin));
        const lMin = safeLog(yMin);
        const lMax = safeLog(yMax);
        const frac = (lv - lMin) / (lMax - lMin || 1);
        return hz ? M.left + frac * w : M.top + (1 - frac) * h;
      }
    : (v: number) => {
        const frac = (v - yMin) / (yMax - yMin || 1);
        return hz ? M.left + frac * w : M.top + (1 - frac) * h;
      };
}

// ── Y-axis ticks ────────────────────────────────────────────────────────────

// Linear: 8 evenly-spaced "nice" tick values, all major. Log: every order
// of magnitude is major plus 2..9 minor decade ticks (driven by
// `makeLogTicks` in shared.js).

export interface YTicksInput {
  yMin: number;
  yMax: number;
  isLog: boolean;
  logBase: number;
}

export function computeYTicks(opts: YTicksInput): Array<{ value: number; major: boolean }> {
  const { yMin, yMax, isLog, logBase } = opts;
  return isLog
    ? makeLogTicks(yMin, yMax, logBase)
    : makeTicks(yMin, yMax, 8).map((v) => ({ value: v, major: true }));
}

// ── Tick formatter ──────────────────────────────────────────────────────────

// Linear: scientific-notation for tiny values that would round to 0 in fixed
// notation; integer string when t is whole; 2-decimal otherwise. Log: prefer
// integer string at major ticks ≥ 1; precision-2 between 0.01 and 1; sci
// notation below 0.01.

export function makeTickFormatter(isLog: boolean): (t: number) => string {
  return (t: number): string => {
    if (!isLog) {
      return Math.abs(t) < 0.01 && t !== 0
        ? t.toExponential(1)
        : t % 1 === 0
          ? String(t)
          : t.toFixed(2);
    }
    if (t >= 1 && t === Math.round(t)) return String(t);
    if (t >= 0.01) return t.toPrecision(2);
    return t.toExponential(1);
  };
}

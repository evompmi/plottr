// _core/scale.ts — axis tick generators (linear + log).
//
export function niceStep(range: number, approxN: number): number {
  const rough = range / approxN;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = rough / mag;
  if (nice <= 1) return mag;
  if (nice <= 2) return 2 * mag;
  if (nice <= 5) return 5 * mag;
  return 10 * mag;
}

export function makeTicks(min: number, max: number, approxN: number): number[] {
  const step = niceStep(max - min || 1, approxN);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    const tick = parseFloat(v.toPrecision(10));
    if (tick <= max + step * 1e-9) ticks.push(tick);
  }
  return ticks;
}

export interface LogTick {
  value: number;
  major: boolean;
}

export function makeLogTicks(dataMin: number, dataMax: number, base: number): LogTick[] {
  let lo = dataMin;
  let hi = dataMax;
  if (!isFinite(lo) || lo <= 0) lo = base === 2 ? 0.5 : 0.1;
  if (!isFinite(hi) || hi <= lo) hi = lo * 1000;
  const logFn = base === 2 ? Math.log2 : base === 10 ? Math.log10 : Math.log;
  const logMin = Math.floor(logFn(lo));
  const logMax = Math.ceil(logFn(hi));
  const decades = logMax - logMin;
  const ticks: LogTick[] = [];
  for (let exp = logMin; exp <= logMax; exp++) {
    const v = Math.pow(base, exp);
    if (v >= lo * 0.99 && v <= hi * 1.01) ticks.push({ value: v, major: true });
    if (base === 10) {
      const muls = [2, 3, 4, 5, 6, 7, 8, 9];
      for (const mul of muls) {
        const sv = mul * Math.pow(base, exp);
        if (sv >= lo * 0.99 && sv <= hi * 1.01) ticks.push({ value: sv, major: false });
      }
    } else if (base === 2 && decades <= 8) {
      const mid = Math.pow(base, exp) * 1.5;
      if (mid >= lo * 0.99 && mid <= hi * 1.01) ticks.push({ value: mid, major: false });
    }
  }
  ticks.sort((a, b) => a.value - b.value);
  return ticks;
}

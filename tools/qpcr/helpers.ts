// qPCR relative quantification — pure parsing, maths and typed prop
// interfaces. No React, no DOM: loaded by tests/helpers/qpcr-loader.js.
//
// One formula covers 2^−ΔΔCt (Livak & Schmittgen 2001, doi:10.1006/
// meth.2001.1262) and efficiency-corrected ratios (Pfaffl 2001, doi:10.1093/
// nar/29.9.e45) with several reference genes combined by geometric mean
// (Vandesompele et al. 2002, doi:10.1186/gb-2002-3-7-research0034). Per
// biological sample s and gene g, with E_g the amplification factor (2 = 100 %):
//
//   q(s,g)  = −Ct̄(s,g) · log2(E_g)            log2 relative quantity
//   q_ref(s) = mean over reference genes of q   log2 of their geometric mean
//   ΔCt(s,T) = q_ref(s) − q(s,T)                = Ct_T − mean(Ct_ref) when E = 2
//   L(s,T)  = mean_control(ΔCt) − ΔCt(s,T)      = −ΔΔCt; fold change = 2^L
//
// Without a calibrator group ("refs" normalisation) the control mean is
// replaced by 0: L = −ΔCt and 2^L = 2^−ΔCt, the expression relative to the
// reference genes alone (Schmittgen & Livak 2008, doi:10.1038/nprot.2008.73).
//
// Statistics run on ΔCt (log scale), never on 2^L: fold changes are skewed
// and the calibrator group is forced to average 1, which distorts its
// variance. ΔCt and −ΔΔCt differ only by a sign and a constant, so tests on
// either give identical p-values.

import { isNumericValue, toNumericValue } from "../_core/numeric";
import {
  compactLetterDisplay,
  formatP,
  pStars,
  sampleMean,
  sampleSD,
  selectTest,
  tinv,
} from "../_core/stats";
import { postHocForTest, runPostHoc, runTest } from "../_shell/stats-dispatch";
import type { PostHocResult, TestResult } from "../_shell/stats-dispatch";

// ── Types ───────────────────────────────────────────────────────────────

export interface Well {
  sample: string;
  group: string;
  gene: string;
  // null = no amplification ("Undetermined", "NA", blank, ">40", …)
  ct: number | null;
}

export type QpcrLayout = "long" | "wide";

export interface LongColumns {
  sample: number;
  group: number;
  gene: number;
  ct: number;
}

export interface WideColumns {
  sample: number;
  group: number;
  genes: number[];
}

export type QpcrParseError =
  | { kind: "empty" }
  | { kind: "missingRole"; role: "sample" | "group" | "gene" | "ct" }
  | { kind: "noGenes" }
  | { kind: "groupConflict"; sample: string; groups: string[] };

export interface QpcrParsed {
  wells: Well[];
  genes: string[];
  groups: string[];
  // Wells whose Ct was missing / undetermined.
  missingCt: number;
}

export interface QpcrParseResult {
  data: QpcrParsed | null;
  error: QpcrParseError | null;
}

export type YScale = "log2" | "linear" | "ddct";
export type QpcrChartStyle = "bar" | "dot" | "box";
export type AnnotationMode = "none" | "cld" | "brackets";
export type ErrorBarType = "none" | "sem" | "sd" | "ci95";
// "control": 2^−ΔΔCt, fold change vs a calibrator group.
// "refs": 2^−ΔCt, relative to the reference genes only (no calibrator).
export type Normalization = "control" | "refs";

export interface QpcrVis {
  yScale: YScale;
  chartStyle: QpcrChartStyle;
  showPoints: boolean;
  errorBar: ErrorBarType;
  // Draw the calibrator group's column (only meaningful with normalize ===
  // "control"). Hidden → its comparisons become "vs control" stars.
  showCalibrator: boolean;
  annotation: AnnotationMode;
  showNs: boolean;
  discretePalette: string;
  horizontal: boolean;
  pointSize: number;
  jitterWidth: number; // fraction of the bar / box width
  fillOpacity: number;
  // Value-axis bounds in the units the tick labels show (fold change on the
  // log2 axis); "" = automatic. Shared by every gene panel.
  yMin: string;
  yMax: string;
  yLabel: string; // "" = automatic title for the chosen scale
  barOutline: boolean;
  barOutlineWidth: number;
  barWidthFrac: number;
  facetWidth: number;
  facetHeight: number;
  facetCols: number;
  xLabelAngle: number;
  tickFontSize: number;
  plotTitle: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
}

// ── Column detection & parsing ──────────────────────────────────────────

const RE_SAMPLE =
  /^(sample|sample[ _-]?(name|id)|bio(logical)?[ _-]?rep(licate)?|plant|individual|replicate|rep)$/i;
const RE_GROUP = /^(group|condition|treatment|genotype|line|cond)$/i;
const RE_GENE = /^(gene|target|target[ _-]?name|primer|assay|detector)$/i;
const RE_CT = /^(c[tq]|ct[ _-]?value|cq[ _-]?value|c[tq][ _-]?mean|threshold[ _-]?cycle)$/i;

const MISSING_CT =
  /^(|na|n\/a|nan|undetermined|undet\.?|no[ _-]?ct|no[ _-]?cq|none|-|—|–|n\.d\.?|nd)$/i;

// Ct cell → number, or null when the well did not amplify. Values written
// as ">40" (censored) also count as missing.
export function parseCt(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (MISSING_CT.test(s) || s.startsWith(">")) return null;
  if (!isNumericValue(s)) return null;
  const v = toNumericValue(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function colIndex(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(String(h ?? "").trim()));
}

function isMostlyCt(rows: string[][], c: number): boolean {
  let num = 0;
  let total = 0;
  for (const r of rows) {
    const v = String(r[c] ?? "").trim();
    if (v === "") continue;
    total++;
    if (isNumericValue(v) || MISSING_CT.test(v) || v.startsWith(">")) num++;
  }
  return total > 0 && num / total >= 0.8;
}

export interface LayoutGuess {
  layout: QpcrLayout;
  long: LongColumns;
  wide: WideColumns;
}

// Long when a gene column and a Ct column are recognisable, wide otherwise
// (sample, group, then one Ct column per gene).
export function detectLayout(headers: string[], rows: string[][]): LayoutGuess {
  const gene = colIndex(headers, RE_GENE);
  const ct = colIndex(headers, RE_CT);
  let sample = colIndex(headers, RE_SAMPLE);
  let group = colIndex(headers, RE_GROUP);
  const used = new Set([gene, ct].filter((i) => i >= 0));
  const free = headers.map((_, i) => i).filter((i) => !used.has(i));
  if (sample < 0) sample = free.find((i) => i !== group && !isMostlyCt(rows, i)) ?? -1;
  if (group < 0) group = free.find((i) => i !== sample && !isMostlyCt(rows, i)) ?? -1;
  const geneCols = headers
    .map((_, i) => i)
    .filter((i) => i !== sample && i !== group && isMostlyCt(rows, i));
  const layout: QpcrLayout = gene >= 0 && ct >= 0 ? "long" : "wide";
  return {
    layout,
    long: { sample, group, gene, ct },
    wide: { sample, group, genes: geneCols },
  };
}

function finish(wells: Well[]): QpcrParseResult {
  if (wells.length === 0) return { data: null, error: { kind: "empty" } };
  // A sample id may repeat across groups (e.g. "1", "2" in every group); the
  // biological sample is the (group, sample) pair. Different groups for the
  // same id are therefore allowed and treated as different samples.
  const genes = [...new Set(wells.map((w) => w.gene))];
  if (genes.length < 2) return { data: null, error: { kind: "noGenes" } };
  const groups = [...new Set(wells.map((w) => w.group))];
  const missingCt = wells.filter((w) => w.ct === null).length;
  return { data: { wells, genes, groups, missingCt }, error: null };
}

export function parseLong(rows: string[][], cols: LongColumns): QpcrParseResult {
  for (const role of ["sample", "group", "gene", "ct"] as const) {
    if (cols[role] < 0) return { data: null, error: { kind: "missingRole", role } };
  }
  const wells: Well[] = [];
  for (const r of rows) {
    const sample = String(r[cols.sample] ?? "").trim();
    const group = String(r[cols.group] ?? "").trim();
    const gene = String(r[cols.gene] ?? "").trim();
    if (!sample || !group || !gene) continue;
    wells.push({ sample, group, gene, ct: parseCt(r[cols.ct]) });
  }
  return finish(wells);
}

export function parseWide(headers: string[], rows: string[][], cols: WideColumns): QpcrParseResult {
  if (cols.sample < 0) return { data: null, error: { kind: "missingRole", role: "sample" } };
  if (cols.group < 0) return { data: null, error: { kind: "missingRole", role: "group" } };
  if (cols.genes.length < 2) return { data: null, error: { kind: "noGenes" } };
  const wells: Well[] = [];
  for (const r of rows) {
    const sample = String(r[cols.sample] ?? "").trim();
    const group = String(r[cols.group] ?? "").trim();
    if (!sample || !group) continue;
    for (const c of cols.genes) {
      wells.push({ sample, group, gene: String(headers[c]).trim(), ct: parseCt(r[c]) });
    }
  }
  return finish(wells);
}

// ── Technical replicates ────────────────────────────────────────────────

// Technical replicates more than this many cycles apart (SD) are flagged.
export const TECH_SD_WARN = 0.5;

export interface GeneCt {
  mean: number; // NaN when every replicate is missing
  sd: number; // NaN when fewer than 2 values
  n: number; // replicates with a Ct
  nMissing: number;
}

export interface Sample {
  key: string; // group + "\u0000" + sample
  sample: string;
  group: string;
  ct: Record<string, GeneCt>;
}

export function sampleKey(group: string, sample: string): string {
  return group + "\u0000" + sample;
}

export function aggregateTechReps(wells: Well[]): Sample[] {
  const map = new Map<
    string,
    { sample: string; group: string; vals: Map<string, (number | null)[]> }
  >();
  for (const w of wells) {
    const key = sampleKey(w.group, w.sample);
    let s = map.get(key);
    if (!s) {
      s = { sample: w.sample, group: w.group, vals: new Map() };
      map.set(key, s);
    }
    const arr = s.vals.get(w.gene) ?? [];
    arr.push(w.ct);
    s.vals.set(w.gene, arr);
  }
  return [...map.entries()].map(([key, s]) => {
    const ct: Record<string, GeneCt> = {};
    for (const [gene, arr] of s.vals) {
      const xs = arr.filter((v): v is number => v !== null);
      ct[gene] = {
        mean: xs.length ? sampleMean(xs) : NaN,
        sd: xs.length >= 2 ? sampleSD(xs) : NaN,
        n: xs.length,
        nMissing: arr.length - xs.length,
      };
    }
    return { key, sample: s.sample, group: s.group, ct };
  });
}

export interface NoisyRep {
  sample: string;
  group: string;
  gene: string;
  sd: number;
}

export function noisyTechReps(samples: Sample[], limit = TECH_SD_WARN): NoisyRep[] {
  const out: NoisyRep[] = [];
  for (const s of samples) {
    for (const [gene, c] of Object.entries(s.ct)) {
      if (Number.isFinite(c.sd) && c.sd > limit) {
        out.push({ sample: s.sample, group: s.group, gene, sd: c.sd });
      }
    }
  }
  return out;
}

// ── Efficiency ──────────────────────────────────────────────────────────

// "1.95" → 1.95; "95", "95 %", "95%" → 1.95. Accepts amplification factors
// in (1, 3) — 0 % to 200 % efficiency. Null otherwise.
export function parseEfficiency(raw: string): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s*%$/, "")
    .replace(",", ".");
  if (!isNumericValue(s)) return null;
  const v = toNumericValue(s);
  if (!Number.isFinite(v)) return null;
  const isPercent = /%/.test(String(raw)) || v >= 3;
  const E = isPercent ? 1 + v / 100 : v;
  return E > 1 && E < 3 ? E : null;
}

export function efficiencyPercent(E: number): number {
  return (E - 1) * 100;
}

// ── Standard curve ──────────────────────────────────────────────────────

export interface StdPoint {
  gene: string;
  quantity: number;
  ct: number;
}

export interface StdCurve {
  gene: string;
  n: number;
  slope: number;
  intercept: number;
  r2: number;
  E: number; // 10^(−1/slope)
  percent: number;
  // Outside 90–110 % efficiency, or R² < 0.98 — common MIQE-style checks.
  effOutOfRange: boolean;
  lowR2: boolean;
}

export const STD_R2_MIN = 0.98;

// Ordinary least squares y = a + b·x.
function ols(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}

// Ct regressed on log10(quantity), per gene. Needs ≥ 3 points over ≥ 2
// distinct quantities; genes without enough points are omitted.
export function standardCurves(points: StdPoint[]): StdCurve[] {
  const byGene = new Map<string, StdPoint[]>();
  for (const p of points) {
    if (!(p.quantity > 0) || !Number.isFinite(p.ct)) continue;
    const arr = byGene.get(p.gene) ?? [];
    arr.push(p);
    byGene.set(p.gene, arr);
  }
  const out: StdCurve[] = [];
  for (const [gene, pts] of byGene) {
    const xs = pts.map((p) => Math.log10(p.quantity));
    if (pts.length < 3 || new Set(xs).size < 2) continue;
    const { slope, intercept, r2 } = ols(
      xs,
      pts.map((p) => p.ct)
    );
    const E = Math.pow(10, -1 / slope);
    const percent = efficiencyPercent(E);
    out.push({
      gene,
      n: pts.length,
      slope,
      intercept,
      r2,
      E,
      percent,
      effOutOfRange: !(percent >= 90 && percent <= 110),
      lowR2: r2 < STD_R2_MIN,
    });
  }
  return out;
}

export function parseStandardCurve(headers: string[], rows: string[][]): StdPoint[] {
  const gene = colIndex(headers, RE_GENE);
  const ct = colIndex(headers, RE_CT);
  const qty = colIndex(
    headers,
    /^(quantity|qty|dilution|conc(entration)?|copies|amount|input|template)$/i
  );
  const g = gene >= 0 ? gene : 0;
  const q = qty >= 0 ? qty : 1;
  const c = ct >= 0 ? ct : 2;
  const out: StdPoint[] = [];
  for (const r of rows) {
    const name = String(r[g] ?? "").trim();
    const quantity = isNumericValue(r[q]) ? toNumericValue(r[q]) : NaN;
    const ctv = parseCt(r[c]);
    if (name && Number.isFinite(quantity) && ctv !== null)
      out.push({ gene: name, quantity, ct: ctv });
  }
  return out;
}

// ── ΔCt / −ΔΔCt ─────────────────────────────────────────────────────────

export interface QpcrConfig {
  refs: string[];
  targets: string[];
  // Amplification factor per gene (2 = 100 %); missing → 2.
  eff: Record<string, number>;
  normalize: Normalization;
  control: string; // ignored when normalize === "refs"
  groupOrder: string[];
}

export interface SampleResult {
  sample: string;
  group: string;
  ctTarget: number;
  ctRefs: number[];
  dCt: number; // log2 units
  L: number; // −ΔΔCt ("control") or −ΔCt ("refs")
}

export interface GroupSummary {
  group: string;
  n: number;
  meanDCt: number;
  sdDCt: number;
  meanL: number; // log2 fold change vs control (control → 0), or −mean ΔCt ("refs")
  // 95 % t-CI of the group's mean L (needs n ≥ 2)
  lo: number;
  hi: number;
}

export interface VsControl {
  group: string;
  log2fc: number; // mean L(group) − mean L(control)
  // Welch 95 % CI of that difference (log2 units)
  lo: number;
  hi: number;
}

export interface GeneAnalysis {
  gene: string;
  rows: SampleResult[];
  // Samples left out because the target or a reference had no Ct.
  dropped: { sample: string; group: string }[];
  // Groups in display order with ≥ 1 sample.
  groups: string[];
  dCtByGroup: number[][];
  calibrator: number; // mean control ΔCt; 0 when normalize === "refs"
  summaries: GroupSummary[];
  vsControl: VsControl[];
  controlMissing: boolean;
}

const effOf = (cfg: QpcrConfig, g: string): number => cfg.eff[g] ?? 2;

export function computeGene(samples: Sample[], cfg: QpcrConfig, gene: string): GeneAnalysis {
  const rows: SampleResult[] = [];
  const dropped: { sample: string; group: string }[] = [];
  const log2E = (g: string): number => Math.log2(effOf(cfg, g));
  for (const s of samples) {
    if (!cfg.groupOrder.includes(s.group)) continue;
    const t = s.ct[gene];
    const refCts = cfg.refs.map((r) => s.ct[r]?.mean ?? NaN);
    if (!t || !Number.isFinite(t.mean) || refCts.some((v) => !Number.isFinite(v))) {
      dropped.push({ sample: s.sample, group: s.group });
      continue;
    }
    const qT = -t.mean * log2E(gene);
    const qRef = cfg.refs.reduce((a, r, i) => a - refCts[i] * log2E(r), 0) / cfg.refs.length;
    rows.push({
      sample: s.sample,
      group: s.group,
      ctTarget: t.mean,
      ctRefs: refCts,
      dCt: qRef - qT,
      L: NaN,
    });
  }
  const relToControl = cfg.normalize === "control";
  const ctrl = rows.filter((r) => r.group === cfg.control).map((r) => r.dCt);
  const controlMissing = relToControl && ctrl.length === 0;
  const calibrator = !relToControl ? 0 : controlMissing ? NaN : sampleMean(ctrl);
  for (const r of rows) r.L = calibrator - r.dCt;
  const groups = cfg.groupOrder.filter((g) => rows.some((r) => r.group === g));
  const dCtByGroup = groups.map((g) => rows.filter((r) => r.group === g).map((r) => r.dCt));
  const summaries: GroupSummary[] = groups.map((g, i) => {
    const d = dCtByGroup[i];
    const n = d.length;
    const meanDCt = sampleMean(d);
    const sdDCt = n >= 2 ? sampleSD(d) : NaN;
    const meanL = calibrator - meanDCt;
    const half = n >= 2 ? tinv(0.975, n - 1) * (sdDCt / Math.sqrt(n)) : NaN;
    return { group: g, n, meanDCt, sdDCt, meanL, lo: meanL - half, hi: meanL + half };
  });
  const ci = relToControl ? groups.indexOf(cfg.control) : -1;
  const vsControl: VsControl[] = [];
  if (ci >= 0) {
    const c = dCtByGroup[ci];
    groups.forEach((g, i) => {
      if (i === ci) return;
      vsControl.push({ group: g, ...welchDiffCI(c, dCtByGroup[i]) });
    });
  }
  return {
    gene,
    rows,
    dropped,
    groups,
    dCtByGroup,
    calibrator,
    summaries,
    vsControl,
    controlMissing,
  };
}

// Custom axis bound typed in the units the axis labels show → plotted axis
// value: fold change on the log2 axis (must be > 0, stored as log2), fold
// change on the linear axis, −ΔΔCt / −ΔCt as is. Null when blank / invalid.
export function parseAxisBound(text: string, scale: YScale): number | null {
  const s = String(text ?? "")
    .trim()
    .replace(",", ".");
  if (s === "" || !isNumericValue(s)) return null;
  const v = toNumericValue(s);
  if (!Number.isFinite(v)) return null;
  if (scale === "log2") return v > 0 ? Math.log2(v) : null;
  return v;
}

// Error-bar bounds on the L (log2) scale: mean ± SD, ± SEM, or the 95 % t-CI.
// Null when the bar cannot be drawn (n < 2). Back-transformed to a linear
// axis the bars become asymmetric (geometric SD / SEM).
export function errorBounds(
  s: GroupSummary,
  type: ErrorBarType
): { lo: number; hi: number } | null {
  if (type === "none" || s.n < 2 || !Number.isFinite(s.sdDCt)) return null;
  if (type === "ci95") return { lo: s.lo, hi: s.hi };
  const half = type === "sd" ? s.sdDCt : s.sdDCt / Math.sqrt(s.n);
  return { lo: s.meanL - half, hi: s.meanL + half };
}

// Welch 95 % CI for mean(control ΔCt) − mean(group ΔCt) = log2 fold change.
export function welchDiffCI(
  control: number[],
  group: number[]
): { log2fc: number; lo: number; hi: number } {
  const n1 = control.length;
  const n2 = group.length;
  const log2fc = sampleMean(control) - sampleMean(group);
  if (n1 < 2 || n2 < 2) return { log2fc, lo: NaN, hi: NaN };
  const v1 = sampleSD(control) ** 2 / n1;
  const v2 = sampleSD(group) ** 2 / n2;
  const se = Math.sqrt(v1 + v2);
  if (se === 0) return { log2fc, lo: log2fc, hi: log2fc };
  const df = (v1 + v2) ** 2 / (v1 ** 2 / (n1 - 1) + v2 ** 2 / (n2 - 1));
  const half = tinv(0.975, df) * se;
  return { log2fc, lo: log2fc - half, hi: log2fc + half };
}

// ── geNorm stability (Vandesompele et al. 2002) ─────────────────────────

// M_j = mean over k ≠ j of SD_s(log2 Q_j − log2 Q_k), over samples with a Ct
// for every reference. Lower = more stable. With two references both M
// values are equal (the paper notes such a pair cannot be ranked).
export function genormM(
  samples: Sample[],
  refs: string[],
  eff: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  if (refs.length < 2) return out;
  const q = samples
    .map((s) => refs.map((r) => -(s.ct[r]?.mean ?? NaN) * Math.log2(eff[r] ?? 2)))
    .filter((v) => v.every(Number.isFinite));
  refs.forEach((r, j) => {
    const vs = refs
      .map((_, k) => (k === j || q.length < 2 ? NaN : sampleSD(q.map((row) => row[j] - row[k]))))
      .filter((v) => !Number.isNaN(v));
    out[r] = vs.length ? sampleMean(vs) : NaN;
  });
  return out;
}

// ── Statistics on ΔCt ───────────────────────────────────────────────────

export interface GeneStats {
  // Groups with n ≥ 2 (others cannot enter a test), as indices into the
  // gene's display groups.
  tested: number[];
  rec: ReturnType<typeof selectTest> | null;
  chosenTest: string | null;
  testResult: TestResult | null;
  postHocName: string | null;
  postHocResult: PostHocResult | null;
}

export function runGeneStats(g: GeneAnalysis, override: string | null): GeneStats {
  const tested = g.dCtByGroup.map((v, i) => (v.length >= 2 ? i : -1)).filter((i) => i >= 0);
  const values = tested.map((i) => g.dCtByGroup[i]);
  if (values.length < 2) {
    return {
      tested,
      rec: null,
      chosenTest: null,
      testResult: null,
      postHocName: null,
      postHocResult: null,
    };
  }
  const rec = selectTest(values);
  const k = values.length;
  const validOverride =
    override &&
    ((k === 2 && ["studentT", "welchT", "mannWhitney"].includes(override)) ||
      (k > 2 && ["oneWayANOVA", "welchANOVA", "kruskalWallis"].includes(override)))
      ? override
      : null;
  const chosenTest = validOverride ?? rec.recommendation?.test ?? null;
  const testResult = chosenTest ? runTest(chosenTest, values) : null;
  const postHocName = k > 2 ? postHocForTest(chosenTest) : null;
  const postHocResult = postHocName ? runPostHoc(postHocName, values) : null;
  return { tested, rec, chosenTest, testResult, postHocName, postHocResult };
}

// Result line in Group Plot's format (boxplot formatBpResultLine).
export function formatResultLine(test: string | null, res: TestResult | null): string {
  if (!test || !res) return "—";
  if (res.error) return "⚠ " + res.error;
  const n = (v: number | undefined): number => (typeof v === "number" ? v : NaN);
  if (test === "studentT" || test === "welchT")
    return `t(${n(res.df).toFixed(2)}) = ${n(res.t).toFixed(3)},  p = ${formatP(res.p)}`;
  if (test === "mannWhitney" && res.exact)
    return `U = ${n(res.U).toFixed(1)},  p = ${formatP(res.p)} (exact)`;
  if (test === "mannWhitney")
    return `U = ${n(res.U).toFixed(1)},  z = ${n(res.z).toFixed(3)},  p = ${formatP(res.p)}`;
  if (test === "oneWayANOVA" || test === "welchANOVA")
    return `F(${res.df1}, ${n(res.df2).toFixed(2)}) = ${n(res.F).toFixed(3)},  p = ${formatP(res.p)}`;
  if (test === "kruskalWallis")
    return `H(${n(res.df)}) = ${n(res.H).toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

export interface BracketSpec {
  i: number;
  j: number;
  label: string;
}

// Indices and per-group arrays refer to the gene's *visible* groups
// (visibleGene): every display group, minus a hidden calibrator.
export interface GeneAnnotation {
  brackets: BracketSpec[];
  cld: string[]; // per visible group ("" when not shown)
  vsControl: string[]; // per visible group: stars vs the hidden calibrator
}

// The gene as drawn: the calibrator `hidden` (if any) dropped from groups,
// summaries and replicate points. Statistics are untouched.
export function visibleGene(g: GeneAnalysis, hidden: string | null): GeneAnalysis {
  if (hidden === null || !g.groups.includes(hidden)) return g;
  return {
    ...g,
    groups: g.groups.filter((x) => x !== hidden),
    summaries: g.summaries.filter((s) => s.group !== hidden),
    rows: g.rows.filter((r) => r.group !== hidden),
  };
}

// Same rules as Group Plot's computeBpAnnotationSpec: two groups → one
// bracket from the test; more → letters or brackets from the post-hoc
// (adjusted p). With the calibrator `hidden`, its comparisons become
// "vs control" stars above the other groups, brackets between the visible
// groups stay, and letters fall back to that layout (a letter display
// without the calibrator would drop every comparison against it).
export function geneAnnotation(
  g: GeneAnalysis,
  st: GeneStats,
  mode: AnnotationMode,
  showNs: boolean,
  hidden: string | null = null
): GeneAnnotation {
  const hide = hidden !== null && g.groups.includes(hidden) ? hidden : null;
  const shown = visibleGene(g, hide).groups;
  const empty = (): GeneAnnotation => ({
    brackets: [],
    cld: shown.map(() => ""),
    vsControl: shown.map(() => ""),
  });
  if (mode === "none" || st.tested.length < 2) return empty();
  const map = st.tested;
  let pairs: { i: number; j: number; p: number }[];
  if (map.length === 2) {
    const p = st.testResult && !st.testResult.error ? st.testResult.p : undefined;
    if (p === undefined) return empty();
    pairs = [{ i: map[0], j: map[1], p }];
  } else {
    const ph = st.postHocResult;
    if (!ph || ph.error) return empty();
    if (mode === "cld" && hide === null) {
      const out = empty();
      compactLetterDisplay(ph.pairs, map.length).forEach((l, i) => (out.cld[map[i]] = l));
      return out;
    }
    pairs = ph.pairs.map((pr) => ({
      i: map[pr.i],
      j: map[pr.j],
      p: pr.pAdj != null ? pr.pAdj : pr.p,
    }));
  }
  const out = empty();
  const idx = (i: number): number => shown.indexOf(g.groups[i]);
  for (const pr of pairs) {
    if (!showNs && pr.p >= 0.05) continue;
    const a = g.groups[pr.i];
    const b = g.groups[pr.j];
    if (a === hide || b === hide) out.vsControl[idx(a === hide ? pr.j : pr.i)] = pStars(pr.p);
    else out.brackets.push({ i: idx(pr.i), j: idx(pr.j), label: pStars(pr.p) });
  }
  return out;
}

// ── Export rows ──────────────────────────────────────────────

export function sampleRowsForCsv(
  genes: GeneAnalysis[],
  normalize: Normalization
): {
  headers: string[];
  rows: (string | number)[][];
} {
  const headers = [
    "gene",
    "group",
    "sample",
    "ct_target",
    "ct_reference_mean",
    "delta_ct",
    ...(normalize === "control"
      ? ["neg_delta_delta_ct", "fold_change"]
      : ["neg_delta_ct", "relative_expression"]),
  ];
  const rows: (string | number)[][] = [];
  for (const g of genes) {
    for (const r of g.rows) {
      rows.push([
        g.gene,
        r.group,
        r.sample,
        r.ctTarget,
        sampleMean(r.ctRefs),
        r.dCt,
        r.L,
        Math.pow(2, r.L),
      ]);
    }
  }
  return { headers, rows };
}

// ── Auto-configuration ──────────────────────────────────────────────────

const REF_HINT =
  /^(act|actin|ubq|ubiquitin|ubc|ef1|eef1|tub|tubulin|gapd|gapdh|pp2a|pp2aa3|18s|rrna|cyp|sand|tip41|ef-1|elf|hprt|b2m|ywhaz|rpl|hmbs|sdha|ipp2|pex4|mon1|tip4)/i;
const CONTROL_HINT =
  /^(ctrl|control|mock|wt|wild[ -]?type|col-?0|untreated|vehicle|dmso|t0|0h|0 h|day ?0|ref)$/i;

export function guessRefs(genes: string[]): string[] {
  const refs = genes.filter((g) => REF_HINT.test(g));
  return refs.length > 0 && refs.length < genes.length ? refs : [genes[0]];
}

export function guessControl(groups: string[]): string {
  return groups.find((g) => CONTROL_HINT.test(g.trim())) ?? groups[0] ?? "";
}

// ── Prop interfaces ─────────────────────────────────────────────────────

export interface QpcrChartProps {
  genes: GeneAnalysis[];
  annotations: GeneAnnotation[];
  colors: string[]; // per display group (union order)
  groupOrder: string[];
  normalize: Normalization;
  control: string;
  yScale: YScale;
  chartStyle: QpcrChartStyle;
  showPoints: boolean;
  errorBar: ErrorBarType;
  showCalibrator: boolean;
  horizontal: boolean;
  pointSize: number;
  jitterWidth: number;
  fillOpacity: number;
  yMin: string;
  yMax: string;
  yLabel: string;
  barOutline: boolean;
  barOutlineWidth: number;
  barWidthFrac: number;
  facetWidth: number;
  facetHeight: number;
  facetCols: number;
  xLabelAngle: number;
  tickFontSize: number;
  title: string;
  plotBg: string;
  showGrid: boolean;
  gridColor: string;
}

export interface GeneRow {
  name: string;
  role: "ref" | "target" | "ignore";
  effText: string;
  nWells: number;
  nMissing: number;
}

export interface QpcrStatsPanelProps {
  genes: GeneAnalysis[];
  stats: GeneStats[];
  normalize: Normalization;
  control: string;
  overrides: Record<string, string | null>;
  onOverride: (gene: string, test: string | null) => void;
  vis: QpcrVis;
  updVis: (patch: Partial<QpcrVis>) => void;
  onDownloadReport: () => void;
  onDownloadR: () => void;
}

export interface TileProps {
  vis: QpcrVis;
  updVis: (patch: Partial<QpcrVis>) => void;
}

export interface ChartTileProps extends TileProps {
  normalize: Normalization;
}

export interface OrderItem {
  name: string;
  include: boolean;
}

export interface ColorItem {
  name: string;
  color: string;
}

export interface ColorsTileProps extends TileProps {
  items: ColorItem[];
  onColorChange: (name: string, color: string) => void;
  onPaletteChange: () => void;
}

export interface StdCurvePanelProps {
  text: string;
  setText: (v: string) => void;
  curves: StdCurve[];
  onApply: (curves: StdCurve[]) => void;
}

export interface ConfigureStepProps {
  fileName: string;
  detectedSep: string;
  headers: string[];
  layout: QpcrLayout;
  setLayout: (l: QpcrLayout) => void;
  longCols: LongColumns;
  setLongCols: (c: LongColumns) => void;
  wideCols: WideColumns;
  setWideCols: (c: WideColumns) => void;
  data: QpcrParsed | null;
  parseError: QpcrParseError | null;
  geneRows: GeneRow[];
  setGeneRole: (gene: string, role: GeneRow["role"]) => void;
  setGeneEff: (gene: string, text: string) => void;
  groupOrder: OrderItem[];
  setGroupOrder: (o: OrderItem[]) => void;
  normalize: Normalization;
  setNormalize: (n: Normalization) => void;
  control: string;
  setControl: (g: string) => void;
  noisy: NoisyRep[];
  genorm: Record<string, number>;
  stdText: string;
  setStdText: (v: string) => void;
  stdCurves: StdCurve[];
  onApplyStd: (curves: StdCurve[]) => void;
}

export interface PlotStepProps {
  chartRef: React.RefObject<SVGSVGElement>;
  genes: GeneAnalysis[];
  stats: GeneStats[];
  annotations: GeneAnnotation[];
  colors: string[];
  groupOrder: string[];
  normalize: Normalization;
  control: string;
  vis: QpcrVis;
  updVis: (patch: Partial<QpcrVis>) => void;
  overrides: Record<string, string | null>;
  onOverride: (gene: string, test: string | null) => void;
  onGroupColor: (name: string, color: string) => void;
  onPaletteChange: () => void;
  fileName: string;
  onDownloadCsv: () => void;
  onDownloadReport: () => void;
  onDownloadR: () => void;
  onReset: () => void;
  dropped: number;
}

// Pure helpers for the Volcano tool. All exports are deterministic, no
// React, no DOM, and no shared-bundle globals **except** through the
// `isNumericValue` / `toNumericValue` pair already declared in
// types/globals.d.ts (and pre-loaded into the test vm context by
// tests/helpers/volcano-loader.js). Same boundary every other tool's
// helpers.ts honours — TypeScript compiles standalone, the loader picks
// up the shared script-tag globals.
//
// The volcano shape is dead simple: each input row is one feature with a
// log2-fold-change ("log2FC") and a p-value. We classify each row into
// up / down / ns based on user-set cutoffs, score-rank for top-N
// labelling, and lay labels out with a greedy collision-avoid pass.
// Everything that touches the rendering layer is in chart.tsx; this
// module never imports a React or DOM API.
//
// The colour palette lives here too as a const because the R-script
// exporter needs it to emit a matching ggplot2 scale_color_manual call.

// Okabe-Ito-aligned defaults: deep blue (PALETTE[4]) for down-regulated,
// vermillion (PALETTE[5]) for up-regulated, neutral mid-grey for the
// non-significant majority. Chosen to (a) be colourblind-distinguishable
// (Okabe-Ito is the canonical safe palette) and (b) match the
// conventional volcano-plot signal direction (warm = up, cool = down).
// The `ns` grey is #737373 (3.27:1 against white) — just over WCAG 2.1
// SC 1.4.11's 3:1 minimum for non-text graphical objects. NS dots
// typically dominate the chart (~80–95 % of all points); going much
// darker would visually overwhelm the up/down dots, so we sit just
// over the contrast threshold rather than well above it.
import { isNumericValue, toNumericValue } from "../_core/numeric";
import type { ParseDataResult } from "../_core/csv";

export const VOLCANO_DEFAULT_COLORS = {
  up: "#D55E00",
  down: "#0072B2",
  ns: "#737373",
} as const;

export type VolcanoClass = "up" | "down" | "ns";

// One row of input. `idx` is the row's original parsed-data index so the
// chart can highlight back into the source on hover / click.
export interface VolcanoPoint {
  idx: number;
  log2fc: number;
  p: number; // raw p-value (0 < p ≤ 1 typically; 0 is allowed and clamped)
  label: string | null;
  // −log₁₀(p) as read from a log-scale column (see `PScale`). Set only
  // for log-scale input, where it is the y position: `p` (10^−v) is
  // kept for the cutoff and class, and underflows to 0 past v ≈ 323.
  nlog10?: number;
  // The file's own significance call (a mapped yes / no column), when
  // one is mapped. Overrides the cutoffs in `classifyVolcanoPoint`.
  call?: boolean;
}

// How the p-value column is written: raw p, −log₁₀(p) (positive, the
// usual "already log-transformed" export) or log₁₀(p) (≤ 0, sign kept).
export type PScale = "p" | "neglog10" | "log10";

// Why `detectPScale` picked a log scale — drives the Configure note.
// `above1`: a value > 1 (no p-value can be). `negative`: a value < 0.
// `header`: values fit p, but the column name says log.
export type PScaleReason = "above1" | "negative" | "header" | null;

const LOG_HEADER_RE = /log/i;

// Guess the p-value column's scale from its values, then its header.
// Values decide when they can't be p-values (> 1, or < 0); otherwise a
// "log" in the header (`-log10(padj)`, `mlog10p`, `log10_FDR`) does.
export function detectPScale(
  values: string[],
  header: string
): { scale: PScale; reason: PScaleReason } {
  let above1 = false;
  let negative = false;
  let negativeCount = 0;
  let positiveCount = 0;
  for (const raw of values) {
    if (raw == null || raw === "" || !isNumericValue(raw)) continue;
    const v = toNumericValue(raw);
    if (!Number.isFinite(v)) continue;
    if (v > 1) above1 = true;
    if (v < 0) {
      negative = true;
      negativeCount++;
    } else if (v > 0) positiveCount++;
  }
  // Mostly-negative values read as log₁₀(p) even if a stray value
  // tops 1; otherwise anything above 1 means −log₁₀(p).
  if (negative && negativeCount >= positiveCount) return { scale: "log10", reason: "negative" };
  if (above1) return { scale: "neglog10", reason: "above1" };
  if (negative) return { scale: "log10", reason: "negative" };
  if (LOG_HEADER_RE.test(String(header))) return { scale: "neglog10", reason: "header" };
  return { scale: "p", reason: null };
}

// y position of a point: the column's own −log₁₀ for log-scale input,
// else −log₁₀(p) with the p = 0 floor.
export function pointNegLog10(pt: VolcanoPoint, pFloor: number): number {
  if (pt.nlog10 !== undefined && Number.isFinite(pt.nlog10)) return pt.nlog10;
  return negLog10P(pt.p, pFloor);
}

// Result of classifying a point against user-set cutoffs. Pure function:
// `up` requires *both* `log2fc > +fcCutoff` AND `p < pCutoff`, mirror for
// `down`. Anything else (sub-threshold |log2FC|, or above-threshold p) is
// `ns` — that's the convention every -omics paper uses.
export function classifyPoint(
  log2fc: number,
  p: number,
  fcCutoff: number,
  pCutoff: number
): VolcanoClass {
  if (!Number.isFinite(log2fc) || !Number.isFinite(p)) return "ns";
  const sigByP = p < pCutoff;
  if (!sigByP) return "ns";
  if (log2fc > fcCutoff) return "up";
  if (log2fc < -fcCutoff) return "down";
  return "ns";
}

// Class of one point: the file's own call when a significance column is
// mapped (significant → up / down by the sign of log₂FC), else the
// cutoffs. Every classifier in the tool goes through here.
export function classifyVolcanoPoint(
  pt: VolcanoPoint,
  fcCutoff: number,
  pCutoff: number
): VolcanoClass {
  if (pt.call === undefined) return classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
  if (!pt.call || !Number.isFinite(pt.log2fc)) return "ns";
  if (pt.log2fc > 0) return "up";
  if (pt.log2fc < 0) return "down";
  return "ns";
}

// ── Significance-call column ────────────────────────────────────────────
//
// A two-category column with the file's own calls: yes / no, + / −,
// + / empty, true / false, 1 / 0, significant / ns. `parseCall` returns
// null for anything else, so a column of other values can't be read
// as calls by accident.

const CALL_TRUE = new Set(["yes", "y", "true", "t", "1", "+", "*", "sig", "significant"]);
const CALL_FALSE = new Set([
  "no",
  "n",
  "false",
  "f",
  "0",
  "-",
  "−",
  "",
  "null",
  "na",
  "nan",
  "ns",
  "n.s.",
  "not significant",
  "non-significant",
  "nonsignificant",
]);

export function parseCall(raw: string | null | undefined): boolean | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (CALL_TRUE.has(v)) return true;
  if (CALL_FALSE.has(v)) return false;
  return null;
}

// Values of a column that `parseCall` can't read (distinct, first few),
// so the Configure step can say why a picked column isn't usable.
export function unreadableCalls(values: string[], max = 3): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (parseCall(v) !== null) continue;
    const s = String(v).trim();
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const CALL_PATTERNS = [
  /^(is[\s_.-]?)?sig(nif(icant|icance)?)?$/i,
  /^(de|deg|diff[\s_.-]?exp(ressed)?)$/i,
];

// Auto-pick a significance column: a matching name whose every value
// reads as a call, at least one of them significant. -1 when none.
export function detectCallColumn(headers: string[], rawData: string[][]): number {
  for (let i = 0; i < headers.length; i++) {
    if (!CALL_PATTERNS.some((re) => re.test(String(headers[i]).trim()))) continue;
    let anyTrue = false;
    let ok = true;
    for (const row of rawData) {
      const c = parseCall(row[i]);
      if (c === null) {
        ok = false;
        break;
      }
      if (c) anyTrue = true;
    }
    if (ok && anyTrue) return i;
  }
  return -1;
}

// ── Boundary implied by the significance calls ──────────────────────────
//
// Score s = |x|·y (y = −log₁₀ p) of every called point. Over a set of
// points, lo = largest score among non-significant ones, hi = smallest
// among significant ones. lo < hi means the curve y = c/|x| with
// lo < c < hi separates the calls; it is drawn at c = (lo + hi)/2 with a
// band from lo to hi. lo ≥ hi: no single curve separates them.
//
// Calls are usually made symmetrically (two-sided tests, one |log₂FC|
// threshold), so both sides are pooled first: one c, mirrored, which
// lets a sparse side borrow its constraint from the other. Only when no
// symmetric curve fits are the sides fitted separately (the calls look
// asymmetric). A fit needs MIN_CALLS_PER_SIDE calls of each kind, and is
// drawn only over the |x| span of the points it was fitted on
// (`absFrom` … `absTo`), never extrapolated past the data.

export const MIN_CALLS_PER_SIDE = 3;

export type BoundarySide =
  | {
      status: "ok";
      lo: number;
      hi: number;
      c: number;
      nSig: number;
      nNs: number;
      absFrom: number;
      absTo: number;
    }
  | { status: "overlap"; lo: number; hi: number; nSig: number; nNs: number }
  | { status: "tooFew"; nSig: number; nNs: number };

// `symmetric`: one curve fits both sides (up and down carry the same fit).
// `perSide`: no symmetric curve fits, at least one side fits on its own.
// `none`: neither; `pooled` and the sides say why.
export interface ImpliedBoundary {
  mode: "symmetric" | "perSide" | "none";
  pooled: BoundarySide;
  up: BoundarySide;
  down: BoundarySide;
}

// Fit over the points on one side (sign ±1) or both (sign 0).
function fitBoundary(points: VolcanoPoint[], pFloor: number, sign: 1 | -1 | 0): BoundarySide {
  let lo = -Infinity;
  let hi = Infinity;
  let nSig = 0;
  let nNs = 0;
  let absFrom = Infinity;
  let absTo = 0;
  for (const pt of points) {
    if (pt.call === undefined || !Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) continue;
    if (pt.log2fc === 0) continue;
    if (sign !== 0 && Math.sign(pt.log2fc) !== sign) continue;
    const y = pointNegLog10(pt, pFloor);
    if (!Number.isFinite(y)) continue;
    const ax = Math.abs(pt.log2fc);
    if (ax < absFrom) absFrom = ax;
    if (ax > absTo) absTo = ax;
    const s = ax * y;
    if (pt.call) {
      nSig++;
      if (s < hi) hi = s;
    } else {
      nNs++;
      if (s > lo) lo = s;
    }
  }
  if (nSig < MIN_CALLS_PER_SIDE || nNs < MIN_CALLS_PER_SIDE) {
    return { status: "tooFew", nSig, nNs };
  }
  if (lo < hi && hi > 0) {
    const c = (Math.max(lo, 0) + hi) / 2;
    return { status: "ok", lo, hi, c, nSig, nNs, absFrom, absTo };
  }
  return { status: "overlap", lo, hi, nSig, nNs };
}

export function computeImpliedBoundary(points: VolcanoPoint[], pFloor: number): ImpliedBoundary {
  const pooled = fitBoundary(points, pFloor, 0);
  if (pooled.status === "ok") return { mode: "symmetric", pooled, up: pooled, down: pooled };
  const up = fitBoundary(points, pFloor, 1);
  const down = fitBoundary(points, pFloor, -1);
  const mode = up.status === "ok" || down.status === "ok" ? "perSide" : "none";
  return { mode, pooled, up, down };
}

// Smallest non-zero, finite p-value across the dataset, divided by 10.
// Used to clamp `p === 0` to a finite y-coordinate so the chart doesn't
// emit -log10(0) = Infinity. /10 buffer keeps clamped points visibly
// "off the top" without ballooning the y-axis range. Returns 1e-300 as
// a defensible floor when the dataset has no non-zero p (degenerate).
export function computePFloor(points: VolcanoPoint[]): number {
  let minNonZero = Infinity;
  for (const pt of points) {
    if (Number.isFinite(pt.p) && pt.p > 0 && pt.p < minNonZero) {
      minNonZero = pt.p;
    }
  }
  if (!Number.isFinite(minNonZero)) return 1e-300;
  return minNonZero / 10;
}

// p → -log10(p), with `0` → -log10(pFloor). Non-finite or negative input
// returns 0 (so the point sits at the bottom of the y-axis rather than
// off the chart). The clamp is reported separately by `countClamped` so
// the UI can surface a "N points had p = 0; clamped for display" notice.
export function negLog10P(p: number, pFloor: number): number {
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p === 0) return -Math.log10(pFloor);
  return -Math.log10(p);
}

// ── Search points by label ──────────────────────────────────────────────
//
// User feature: paste a comma- / newline-separated list of feature names
// (genes, proteins, …) and highlight the matching points. The chart's
// existing manual-selection infrastructure already renders a black ring +
// leader line + label for any index in `manualSelection: Set<number>`, so
// this helper just resolves a query to a list of `VolcanoPoint.idx` values
// the App can union into that set. Pure (no React, no DOM, no globals)
// so it loads cleanly under tests/helpers/volcano-loader.js.
//
// Match semantics — case-insensitive substring per token:
//   "AT1G"            → matches every point whose label contains "AT1G"
//   "AT1G01010,AT2G02020"
//   "AT1G01010\nAT2G"  (mixed comma + newline)
//   Tokens are trimmed; empty tokens are skipped; duplicates dedup.
//   Points with `label == null` are skipped silently.
//
// Performance: callers with large datasets should pass `labelLowerCache`
// — a precomputed `points.map(p => p.label?.toLocaleLowerCase() ?? null)`
// memo'd on the points reference — to avoid re-lowercasing every label
// per keystroke. The 2-arg overload computes the cache inline (fine for
// one-off / non-debounced calls).

export interface LabelMatchResult {
  matched: number[]; // unique VolcanoPoint.idx values, in points order
  unmatchedTokens: string[]; // tokens that matched zero points (in input order, deduped)
}

export function matchPointsByLabel(
  points: VolcanoPoint[],
  query: string,
  labelLowerCache?: Array<string | null>
): LabelMatchResult {
  if (typeof query !== "string") return { matched: [], unmatchedTokens: [] };
  // Split on commas + any newline variant; trim; drop empties; dedup
  // (case-folded) so the user can paste sloppily without duplicate work.
  const rawTokens = query.split(/[,\r\n]+/);
  const seen = new Set<string>();
  const tokens: string[] = [];
  const tokensLower: string[] = [];
  for (const raw of rawTokens) {
    const t = raw.trim();
    if (!t) continue;
    const tl = t.toLocaleLowerCase();
    if (seen.has(tl)) continue;
    seen.add(tl);
    tokens.push(t);
    tokensLower.push(tl);
  }
  if (tokens.length === 0) return { matched: [], unmatchedTokens: [] };

  const cache: Array<string | null> =
    labelLowerCache && labelLowerCache.length === points.length
      ? labelLowerCache
      : points.map((pt) => (pt.label == null ? null : pt.label.trim().toLocaleLowerCase()));

  const matchedIdx = new Set<number>();
  const tokenHit: boolean[] = new Array(tokens.length).fill(false);

  for (let i = 0; i < points.length; i++) {
    const lab = cache[i];
    if (lab == null || lab.length === 0) continue;
    for (let ti = 0; ti < tokensLower.length; ti++) {
      if (lab.includes(tokensLower[ti])) {
        matchedIdx.add(points[i].idx);
        tokenHit[ti] = true;
        // Don't break — other tokens for this row may also be the user's
        // intent; we still need to flag them as "found" so they're not
        // surfaced as unmatched.
      }
    }
  }

  const matched: number[] = [];
  for (const pt of points) {
    if (matchedIdx.has(pt.idx)) matched.push(pt.idx);
  }
  const unmatchedTokens: string[] = [];
  for (let ti = 0; ti < tokens.length; ti++) {
    if (!tokenHit[ti]) unmatchedTokens.push(tokens[ti]);
  }
  return { matched, unmatchedTokens };
}

export function countClamped(points: VolcanoPoint[]): number {
  let n = 0;
  // Log-scale input carries its own y (`nlog10`), so p = 0 from
  // underflow is not clamped.
  for (const pt of points) if (pt.p === 0 && pt.nlog10 === undefined) n++;
  return n;
}

// Group counts for the stats summary tile (and for the R-script
// `# Toolbox reported: …` comment). Excludes points with non-finite
// log2FC or p so the user can see the "discarded" count too.
export interface VolcanoSummary {
  up: number;
  down: number;
  ns: number;
  total: number; // total *valid* points (excludes discarded)
  discarded: number;
}

export function summarize(
  points: VolcanoPoint[],
  fcCutoff: number,
  pCutoff: number
): VolcanoSummary {
  let up = 0,
    down = 0,
    ns = 0,
    discarded = 0;
  for (const pt of points) {
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) {
      discarded++;
      continue;
    }
    const cls = classifyVolcanoPoint(pt, fcCutoff, pCutoff);
    if (cls === "up") up++;
    else if (cls === "down") down++;
    else ns++;
  }
  return { up, down, ns, total: up + down + ns, discarded };
}

// ── Auto-detect column roles ────────────────────────────────────────────
//
// On first parse we try to guess which column is log2FC, which is the
// p-value, and which (if any) is the label. The user can always override
// from the configure step.
//
// Rules of thumb derived from common -omics tool outputs:
//   DESeq2:   gene, baseMean, log2FoldChange, lfcSE, stat, pvalue, padj
//   limma:    Gene, logFC, AveExpr, t, P.Value, adj.P.Val, B
//   edgeR:    Gene, logFC, logCPM, F, PValue, FDR
//   MaxQuant: Gene names, Log2 fold change, p-value, q-value
// We prefer the *adjusted* p-value when we can find one (padj / adj.P.Val
// / FDR / qvalue), since that's the column users actually want to plot
// against in 99% of cases. Falls back to the raw p-value if no adjusted
// column exists.

const X_PATTERNS = [
  /^log2foldchange$/i,
  /^log2fc$/i,
  /^logfc$/i,
  /^log2[\s_-]?fold[\s_-]?change$/i,
  /^log2[\s_-]?fc$/i,
  /^foldchange$/i,
  /^fold[\s_-]?change$/i,
  /^fc$/i,
  /log2.*fold/i,
  /log.*fc/i,
  /fold.*change/i,
];

// Adjusted p-value patterns checked first so they win over raw p-value.
const Y_ADJ_PATTERNS = [
  /^padj$/i,
  /^p[\s_.-]?adj$/i,
  /^adj[\s_.-]?p[\s_.-]?val$/i,
  /^adjusted[\s_.-]?p[\s_.-]?value$/i,
  /^fdr$/i,
  /^q[\s_.-]?value$/i,
  /^qvalue$/i,
  /^q[\s_.-]?val$/i,
];
const Y_RAW_PATTERNS = [/^p[\s_.-]?value$/i, /^pvalue$/i, /^p[\s_.-]?val$/i, /^pval$/i, /^p$/i];
// Log-scale p columns (`-log10(padj)`, `mlog10_FDR`, `log10.pvalue`):
// adjusted first, then raw, both after the plain names above.
const Y_ADJ_LOG_PATTERNS = [/log.*(p[\s_.-]?adj|adj|fdr|q[\s_.-]?val)/i];
const Y_RAW_LOG_PATTERNS = [/log.*p[\s_.-]?val/i, /^[-−]?log[\s_.-]?10[\s_.(-]*p\)?$/i];

const LABEL_PATTERNS = [
  /^gene$/i,
  /^gene[\s_.-]?name$/i,
  /^gene[\s_.-]?symbol$/i,
  /^symbol$/i,
  /^protein$/i,
  /^feature$/i,
  /^feature[\s_.-]?id$/i,
  /^feature[\s_.-]?name$/i,
  /^name$/i,
  /^id$/i,
];

function findFirstMatch(headers: string[], patterns: RegExp[]): number {
  for (const re of patterns) {
    for (let i = 0; i < headers.length; i++) {
      if (re.test(String(headers[i]).trim())) return i;
    }
  }
  return -1;
}

export interface AutoDetectResult {
  xCol: number; // log2FC column index, or -1
  yCol: number; // p-value column index, or -1
  labelCol: number; // optional label column index, or -1
  yIsAdjusted: boolean;
}

export function autoDetectColumns(headers: string[]): AutoDetectResult {
  const xCol = findFirstMatch(headers, X_PATTERNS);
  let yCol = findFirstMatch(headers, Y_ADJ_PATTERNS);
  if (yCol < 0) yCol = findFirstMatch(headers, Y_ADJ_LOG_PATTERNS);
  const yIsAdjusted = yCol >= 0;
  if (yCol < 0) yCol = findFirstMatch(headers, Y_RAW_PATTERNS);
  if (yCol < 0) yCol = findFirstMatch(headers, Y_RAW_LOG_PATTERNS);
  const labelCol = findFirstMatch(headers, LABEL_PATTERNS);
  return { xCol, yCol, labelCol, yIsAdjusted };
}

// ── Top-N picking & label layout ────────────────────────────────────────
//
// Score = |log2FC| × -log10(p). This combined score is what most volcano
// plots use to pick "top hits to label" — a point that's far from origin
// in both axes is more interesting than one extreme on a single axis.
// Non-significant points are excluded by default; users almost never
// want to label noise.
//
// Up- and down-regulated features are picked independently with their
// own per-class N counts, so a dataset that's heavily skewed one way
// (e.g. 200 up-hits and 5 down-hits) doesn't crowd out the few rare
// hits in the smaller class. The chart caller defaults to nUp = nDown
// = 10 but exposes the two as separate sliders.

export interface ScoredPoint {
  idx: number; // index into the ORIGINAL points array
  score: number;
  cls: VolcanoClass; // "up" or "down" (ns is filtered out before scoring)
}

export function pickTopLabels(
  points: VolcanoPoint[],
  nUp: number,
  nDown: number,
  fcCutoff: number,
  pCutoff: number,
  pFloor: number
): ScoredPoint[] {
  const ups: ScoredPoint[] = [];
  const downs: ScoredPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) continue;
    if (!pt.label) continue;
    const cls = classifyVolcanoPoint(pt, fcCutoff, pCutoff);
    if (cls === "ns") continue;
    const score = Math.abs(pt.log2fc) * pointNegLog10(pt, pFloor);
    if (cls === "up") ups.push({ idx: i, score, cls });
    else downs.push({ idx: i, score, cls });
  }
  ups.sort((a, b) => b.score - a.score);
  downs.sort((a, b) => b.score - a.score);
  const out: ScoredPoint[] = [];
  if (nUp > 0) for (const e of ups.slice(0, nUp)) out.push(e);
  if (nDown > 0) for (const e of downs.slice(0, nDown)) out.push(e);
  return out;
}

// ── Leader-line label layout ────────────────────────────────────────────
//
// For each picked point, try 12 candidate angles around the source
// (every 30°, starting from 12-o'clock and fanning outward) at a fixed
// `LEADER_DISTANCE` from the source centre. The first angle that
// satisfies ALL of these constraints wins:
//
//   1. label bbox stays inside the layout `bounds` (the chart caller
//      passes a bbox bigger than the inner data plot so labels can
//      legitimately spill into the chart's chrome margin)
//   2. label bbox doesn't overlap any already-placed label
//   3. label bbox doesn't enclose any data point — text never sits on
//      top of a dot
//   4. the dashed leader line, drawn from the *outer ring edge* of the
//      source dot (not the dot itself) to the *nearest edge midpoint*
//      of the label bbox, doesn't pass within `obs.r` of any other
//      data point
//   5. that leader doesn't cross any already-placed leader either —
//      crossed leaders are visually noisy and ambiguous
//
// The leader entering the bbox at its *closest edge midpoint* (rather
// than the centre) means a gene name placed to the right of its dot
// has the leader join the left edge of the text, giving a clean "bracket"
// look instead of a line tunneling under the letters.
//
// If no candidate angle satisfies all five constraints, fall back to
// "12-o'clock" and flag `forced: true` so the chart can render the
// leader anyway. With a generous `bounds` (margin extension) and 12
// angles, the forced path is rare — typically only for points piled in
// a tight cluster against the plot edge.

export interface ObstaclePoint {
  x: number;
  y: number;
  r: number;
}

// Uniform bucket grid over the obstacle points. A label candidate can only
// collide with points near its box or its leader, so each candidate visits
// the few cells around them instead of every point — with 30 000 genes the
// full scans froze the page for seconds while the label-count slider moved.
// The collision tests themselves are unchanged and run on every point that
// could pass them, so the counts (and the chosen placements) are identical.
export interface ObstacleGrid {
  cell: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  cells: ObstaclePoint[][];
  // Points whose radius isn't finite can't be bounded to a cell range; they
  // are tested against every candidate, as before.
  unbounded: ObstaclePoint[];
  maxR: number;
}

const GRID_CELL_PX = 16;
const GRID_MAX_CELLS_PER_AXIS = 512;

export function buildObstacleGrid(obstacles: ObstaclePoint[]): ObstacleGrid {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxR = 0;
  const unbounded: ObstaclePoint[] = [];
  const placeable: ObstaclePoint[] = [];
  for (const o of obstacles) {
    // A point with a non-finite coordinate fails every collision test.
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    if (!Number.isFinite(o.r)) {
      unbounded.push(o);
      continue;
    }
    placeable.push(o);
    if (o.x < minX) minX = o.x;
    if (o.x > maxX) maxX = o.x;
    if (o.y < minY) minY = o.y;
    if (o.y > maxY) maxY = o.y;
    if (o.r > maxR) maxR = o.r;
  }
  if (placeable.length === 0) {
    return { cell: 1, minX: 0, minY: 0, cols: 0, rows: 0, cells: [], unbounded, maxR: 0 };
  }
  const cell = Math.max(
    GRID_CELL_PX,
    (maxX - minX) / GRID_MAX_CELLS_PER_AXIS,
    (maxY - minY) / GRID_MAX_CELLS_PER_AXIS
  );
  const cols = Math.floor((maxX - minX) / cell) + 1;
  const rows = Math.floor((maxY - minY) / cell) + 1;
  const cells: ObstaclePoint[][] = Array.from({ length: cols * rows }, () => []);
  for (const o of placeable) {
    const cx = Math.floor((o.x - minX) / cell);
    const cy = Math.floor((o.y - minY) / cell);
    cells[cy * cols + cx].push(o);
  }
  return { cell, minX, minY, cols, rows, cells, unbounded, maxR };
}

// Calls `visit` once for every point that could lie in the rectangle
// [x0, x1] × [y0, y1] (whole cells, so a superset), plus every unbounded
// point.
export function forEachObstacleNear(
  grid: ObstacleGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (o: ObstaclePoint) => void
): void {
  for (const o of grid.unbounded) visit(o);
  if (grid.cols === 0) return;
  // One cell of slack on each side keeps float rounding at a boundary from
  // dropping a point.
  const c0 = Math.max(0, Math.floor((x0 - grid.minX) / grid.cell) - 1);
  const c1 = Math.min(grid.cols - 1, Math.floor((x1 - grid.minX) / grid.cell) + 1);
  const r0 = Math.max(0, Math.floor((y0 - grid.minY) / grid.cell) - 1);
  const r1 = Math.min(grid.rows - 1, Math.floor((y1 - grid.minY) / grid.cell) + 1);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const bucket = grid.cells[cy * grid.cols + cx];
      for (let k = 0; k < bucket.length; k++) visit(bucket[k]);
    }
  }
}

// The chart caller passes a `LayoutBounds` rect that is typically
// slightly larger than the inner data-plot area, so labels can legally
// land in the chart's outer margin where there are no data points to
// collide with. Using a rect (not just plotW / plotH) lets the bounds
// have negative origin — labels sitting *above* the inner plot in
// inner-coordinate space are kosher when y < 0.
export interface LayoutBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutInput {
  pointPx: { x: number; y: number };
  text: string;
  charWidth: number; // pixels per char at the chosen font size
  lineHeight: number; // pixels
  pointRadius: number; // radius of the source dot
  ringRadius: number; // radius of the black selection ring drawn outside the dot — leader starts here
}

export interface PlacedLabel {
  pointPx: { x: number; y: number };
  textPx: { x: number; y: number }; // baseline anchor for `text-anchor="middle"`
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
  // The dashed leader runs from leaderStart (on the *ring edge* of the
  // source point, away from the label) to leaderEnd (the closest edge
  // midpoint of the label bbox). Always populated.
  leaderStart: { x: number; y: number };
  leaderEnd: { x: number; y: number };
  forced: boolean; // true ⇒ all candidate angles collided; placement may overlap
}

// Layout search space. Each candidate is (angle, distance) — the
// algorithm tries every angle at the nearest distance first, then
// progressively farther distances. With 24 angles × 4 distances = 96
// candidates per label, dense plots have *much* more wiggle room than
// the original 12-angles-at-one-distance design (the user complaint).
// Angles are listed in preference order: 12 o'clock first (volcano
// significance points up), fanning outward through the upper hemisphere
// before reaching the lower hemisphere — labels above the data are the
// natural reading direction for top-N hits.
const LEADER_DISTANCES = [38, 56, 80, 108]; // px from source centre to label centre
const LABEL_BBOX_PAD = 1; // halo around each obstacle keeps text from kissing dot edges
const LABEL_ANGLES_DEG = [
  // Upper hemisphere first (12 o'clock outward), 15° apart.
  -90, -75, -105, -60, -120, -45, -135, -30, -150, -15, -165, 0, 180,
  // Lower hemisphere, same spacing.
  15, 165, 30, 150, 45, 135, 60, 120, 75, 105, 90,
];

function within(
  bbox: { x: number; y: number; w: number; h: number },
  bounds: LayoutBounds
): boolean {
  return (
    bbox.x >= bounds.x &&
    bbox.y >= bounds.y &&
    bbox.x + bbox.w <= bounds.x + bounds.w &&
    bbox.y + bbox.h <= bounds.y + bounds.h
  );
}

// Closest-point distance from segment (x1,y1)→(x2,y2) to a circle's
// centre, returning true iff the segment passes within `r` of (cx, cy).
function lineSegmentIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t: number;
  if (len2 < 1e-9) {
    t = 0;
  } else {
    t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const ddx = cx - px;
  const ddy = cy - py;
  return ddx * ddx + ddy * ddy <= r * r;
}

// Standard 2D segment-segment intersection: returns true iff the open
// segments AB and CD share an interior point. Co-linear overlap is
// reported as non-intersecting (the leader-vs-leader check tolerates
// touch-only cases for points sharing a source edge).
function lineSegmentsIntersect(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number
): boolean {
  const d1x = ax2 - ax1;
  const d1y = ay2 - ay1;
  const d2x = bx2 - bx1;
  const d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false; // parallel
  const dx = bx1 - ax1;
  const dy = by1 - ay1;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  // Strict inequality at the endpoints so two leaders sharing a source
  // pixel (e.g. labels for two points right on top of each other) don't
  // register as crossing each other.
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

// Project (sx, sy) onto the bbox, returning the closest point on the
// bbox boundary. Used to anchor the leader on the side of the text
// nearest the source — gives a visual "bracket" when the label sits to
// one side of the dot.
function nearestPointOnBbox(
  bbox: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number
): { x: number; y: number } {
  const nx = Math.max(bbox.x, Math.min(sx, bbox.x + bbox.w));
  const ny = Math.max(bbox.y, Math.min(sy, bbox.y + bbox.h));
  return { x: nx, y: ny };
}

function pointInPaddedRect(
  px: number,
  py: number,
  bbox: { x: number; y: number; w: number; h: number },
  pad: number
): boolean {
  return (
    px >= bbox.x - pad &&
    px <= bbox.x + bbox.w + pad &&
    py >= bbox.y - pad &&
    py <= bbox.y + bbox.h + pad
  );
}

// Penalty weights for the smart-fallback path. A clean placement scores
// 0 (all constraints satisfied) and short-circuits the fallback. When no
// clean candidate exists, every (angle, distance) is scored by these
// weights and the least-bad wins — replaces the previous always-12-
// o'clock fallback, which produced visible label piles when multiple
// labels' clean candidates were all blocked.
//
// Weight ordering (most → least bad):
//   - bbox-on-dot: text sitting directly on a data point is unreadable.
//   - leader-on-dot or leader-vs-leader: visually confusing but the text
//     itself stays legible.
//   - bbox-vs-bbox overlap: legible if mild; the overlap area gives a
//     graceful penalty proportional to how much text gets obscured.
const PENALTY_BBOX_ON_POINT = 200;
const PENALTY_LEADER_ON_POINT = 50;
const PENALTY_LEADER_CROSS = 50;
const PENALTY_BBOX_OVERLAP_PER_100PX2 = 1;

// Single-candidate evaluator: build the bbox / leader at the given
// (angleDeg, distance) and tally the constraint penalty against the
// already-placed labels. Returns null if the candidate spills past
// `bounds` (hard reject, never refined into); else returns the
// placement + penalty pair.
//
// Extracted so both the coarse search in findBestPlacement and the
// sub-degree refinement (refineForcedAngle) call the same evaluator.
function evaluateCandidate(
  inp: LayoutInput,
  grid: ObstacleGrid,
  bounds: LayoutBounds,
  placed: PlacedLabel[],
  angleDeg: number,
  distance: number
): { placement: PlacedLabel; penalty: number } | null {
  const w = inp.charWidth * inp.text.length;
  const h = inp.lineHeight;
  const sx = inp.pointPx.x;
  const sy = inp.pointPx.y;
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const labelCx = sx + distance * cosA;
  const labelCy = sy + distance * sinA;
  const bbox = { x: labelCx - w / 2, y: labelCy - h / 2, w, h };

  if (!within(bbox, bounds)) return null;

  const startX = sx + inp.ringRadius * cosA;
  const startY = sy + inp.ringRadius * sinA;
  const leaderEnd = nearestPointOnBbox(bbox, sx, sy);

  let labelOverlapArea = 0;
  for (const p of placed) {
    const ix1 = Math.max(bbox.x, p.bbox.x);
    const iy1 = Math.max(bbox.y, p.bbox.y);
    const ix2 = Math.min(bbox.x + bbox.w, p.bbox.x + p.bbox.w);
    const iy2 = Math.min(bbox.y + bbox.h, p.bbox.y + p.bbox.h);
    if (ix2 > ix1 && iy2 > iy1) {
      labelOverlapArea += (ix2 - ix1) * (iy2 - iy1);
    }
  }

  let bboxHitsPointCount = 0;
  const bboxReach = grid.maxR + LABEL_BBOX_PAD;
  forEachObstacleNear(
    grid,
    bbox.x - bboxReach,
    bbox.y - bboxReach,
    bbox.x + bbox.w + bboxReach,
    bbox.y + bbox.h + bboxReach,
    (obs) => {
      const ox = obs.x - sx;
      const oy = obs.y - sy;
      if (ox * ox + oy * oy < 1) return;
      if (pointInPaddedRect(obs.x, obs.y, bbox, obs.r + LABEL_BBOX_PAD)) {
        bboxHitsPointCount++;
      }
    }
  );

  let leaderHitsPointCount = 0;
  const leaderReach = grid.maxR + 0.5;
  forEachObstacleNear(
    grid,
    Math.min(startX, leaderEnd.x) - leaderReach,
    Math.min(startY, leaderEnd.y) - leaderReach,
    Math.max(startX, leaderEnd.x) + leaderReach,
    Math.max(startY, leaderEnd.y) + leaderReach,
    (obs) => {
      const ox = obs.x - sx;
      const oy = obs.y - sy;
      if (ox * ox + oy * oy < 1) return;
      if (
        lineSegmentIntersectsCircle(
          startX,
          startY,
          leaderEnd.x,
          leaderEnd.y,
          obs.x,
          obs.y,
          obs.r + 0.5
        )
      ) {
        leaderHitsPointCount++;
      }
    }
  );

  let leaderCrossCount = 0;
  for (const p of placed) {
    if (
      lineSegmentsIntersect(
        startX,
        startY,
        leaderEnd.x,
        leaderEnd.y,
        p.leaderStart.x,
        p.leaderStart.y,
        p.leaderEnd.x,
        p.leaderEnd.y
      )
    ) {
      leaderCrossCount++;
    }
  }

  const penalty =
    labelOverlapArea * (PENALTY_BBOX_OVERLAP_PER_100PX2 / 100) +
    leaderCrossCount * PENALTY_LEADER_CROSS +
    leaderHitsPointCount * PENALTY_LEADER_ON_POINT +
    bboxHitsPointCount * PENALTY_BBOX_ON_POINT;

  return {
    placement: {
      pointPx: { x: sx, y: sy },
      textPx: { x: labelCx, y: labelCy + h / 4 },
      bbox,
      text: inp.text,
      leaderStart: { x: startX, y: startY },
      leaderEnd,
      forced: false,
    },
    penalty,
  };
}

// Sub-degree refinement around a coarse forced placement. The coarse
// search uses a fixed 15° grid (24 angles); a forced winner at -105°
// might have a strictly-better placement at -97° that the grid missed.
// This walks ±7.5° in 5 evenly-spaced fine angles, picks the lowest
// penalty, and recurses one level (3 angles ±3.75°) around the winner.
//
// Only kicks in for forced placements — clean ones already have
// penalty 0 and can't be improved. Total cost: ~8 extra evaluations
// per forced label.
const REFINE_RANGE_DEG = 7.5;
const REFINE_STEPS_LEVEL_1 = 5;
const REFINE_STEPS_LEVEL_2 = 3;

function refineForcedAngle(
  inp: LayoutInput,
  grid: ObstacleGrid,
  bounds: LayoutBounds,
  placed: PlacedLabel[],
  baseAngleDeg: number,
  baseDistance: number,
  basePenalty: number,
  baseCandidate: PlacedLabel
): { placement: PlacedLabel; penalty: number } {
  let best = { placement: baseCandidate, penalty: basePenalty };

  // Level 1: coarse fine-grained sweep ±REFINE_RANGE_DEG.
  let bestLevel1Angle = baseAngleDeg;
  for (let i = 0; i < REFINE_STEPS_LEVEL_1; i++) {
    const offset = -REFINE_RANGE_DEG + (2 * REFINE_RANGE_DEG * i) / (REFINE_STEPS_LEVEL_1 - 1);
    const angleDeg = baseAngleDeg + offset;
    if (Math.abs(offset) < 1e-9) continue; // skip the base — already evaluated
    const result = evaluateCandidate(inp, grid, bounds, placed, angleDeg, baseDistance);
    if (result && result.penalty < best.penalty) {
      best = result;
      bestLevel1Angle = angleDeg;
    }
  }

  // Level 2: tighter sweep around level-1 winner ±REFINE_RANGE_DEG/2.
  // No-op when level 1 didn't improve — bestLevel1Angle is still the
  // base, which we already evaluated at level 1.
  if (bestLevel1Angle === baseAngleDeg) return best;
  const half = REFINE_RANGE_DEG / 2;
  for (let i = 0; i < REFINE_STEPS_LEVEL_2; i++) {
    const offset = -half + (2 * half * i) / (REFINE_STEPS_LEVEL_2 - 1);
    if (Math.abs(offset) < 1e-9) continue;
    const angleDeg = bestLevel1Angle + offset;
    const result = evaluateCandidate(inp, grid, bounds, placed, angleDeg, baseDistance);
    if (result && result.penalty < best.penalty) {
      best = result;
    }
  }
  return best;
}

// Single-label search: walk the candidate (angle, distance) grid given
// the labels already placed, return the placement with lowest penalty.
// Penalty == 0 means clean (no constraint violations). Forced
// placements get a sub-degree refinement pass around the coarse
// winner — cheap precision boost when the 15° angle grid doesn't land
// on the true minimum.
function findBestPlacement(
  inp: LayoutInput,
  grid: ObstacleGrid,
  bounds: LayoutBounds,
  placed: PlacedLabel[]
): { placement: PlacedLabel; penalty: number } {
  let chosen: PlacedLabel | null = null;
  let bestForced: {
    penalty: number;
    candidate: PlacedLabel;
    angleDeg: number;
    distance: number;
  } | null = null;

  distanceLoop: for (const dist of LEADER_DISTANCES) {
    for (const deg of LABEL_ANGLES_DEG) {
      const result = evaluateCandidate(inp, grid, bounds, placed, deg, dist);
      if (!result) continue;

      if (result.penalty < 1e-9) {
        chosen = result.placement;
        break distanceLoop;
      }

      if (!bestForced || result.penalty < bestForced.penalty) {
        bestForced = {
          penalty: result.penalty,
          candidate: result.placement,
          angleDeg: deg,
          distance: dist,
        };
      }
    }
  }

  if (chosen) return { placement: chosen, penalty: 0 };
  if (bestForced) {
    // Sub-degree refinement around the coarse forced winner. May find
    // a placement with strictly lower penalty (e.g. a label that
    // needed 4 px lateral movement to clear an overlap can now find
    // it; the 15° coarse grid steps ~10 px laterally at the nearest
    // distance, missing such fits).
    const refined = refineForcedAngle(
      inp,
      grid,
      bounds,
      placed,
      bestForced.angleDeg,
      bestForced.distance,
      bestForced.penalty,
      bestForced.candidate
    );
    return {
      placement: { ...refined.placement, forced: true },
      penalty: refined.penalty,
    };
  }
  // Last-resort fallback: no in-bounds candidate at all (caller passed
  // bounds smaller than the label can fit). Plant at 12 o'clock anyway,
  // marked forced; the caller sees a visibly broken result and should
  // widen `bounds`.
  const w = inp.charWidth * inp.text.length;
  const h = inp.lineHeight;
  const sx = inp.pointPx.x;
  const sy = inp.pointPx.y;
  const rad = (-90 * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const labelCx = sx + LEADER_DISTANCES[0] * cosA;
  const labelCy = sy + LEADER_DISTANCES[0] * sinA;
  const bbox = { x: labelCx - w / 2, y: labelCy - h / 2, w, h };
  const startX = sx + inp.ringRadius * cosA;
  const startY = sy + inp.ringRadius * sinA;
  const leaderEnd = nearestPointOnBbox(bbox, sx, sy);
  return {
    placement: {
      pointPx: { x: sx, y: sy },
      textPx: { x: labelCx, y: labelCy + h / 4 },
      bbox,
      text: inp.text,
      leaderStart: { x: startX, y: startY },
      leaderEnd,
      forced: true,
    },
    // Sentinel: outside the normal penalty range so multi-restart
    // always prefers any other run that managed an in-bounds placement.
    penalty: 1e9,
  };
}

// Greedy first-fit pass over `inputs` in the given `order`. Returns the
// placements re-indexed back to input order (placed[i] corresponds to
// inputs[i]) plus the total penalty across all labels. The total is
// what the multi-restart wrapper minimizes over.
function greedyPass(
  inputs: LayoutInput[],
  grid: ObstacleGrid,
  bounds: LayoutBounds,
  order: number[]
): { placed: PlacedLabel[]; totalPenalty: number } {
  const placedInOrder: PlacedLabel[] = [];
  const placedAt: number[] = []; // input index for each entry in placedInOrder
  let totalPenalty = 0;
  for (const idx of order) {
    const { placement, penalty } = findBestPlacement(inputs[idx], grid, bounds, placedInOrder);
    placedInOrder.push(placement);
    placedAt.push(idx);
    totalPenalty += penalty;
  }
  // Re-index back to input order — the public contract is
  // `placed[i] ↔ inputs[i]` regardless of internal placement order.
  const placed: PlacedLabel[] = new Array(inputs.length);
  for (let k = 0; k < placedInOrder.length; k++) {
    placed[placedAt[k]] = placedInOrder[k];
  }
  return { placed, totalPenalty };
}

// Build several input orderings to run the greedy pass with. Each
// ordering is a permutation of [0..inputs.length-1].
//
// Why multiple orderings: greedy first-fit is order-dependent — the
// label placed first claims its preferred slot, leaving downstream
// labels to fight over what remains. A label that's "harder" to place
// (anchor in a dense region) might come up early and grab the easy
// slot, leaving an "easy" label stranded in a forced fallback later.
// By running the greedy pass with a few different orderings and
// picking the lowest-total-penalty result, we get most of the benefit
// of a global optimization without paying the cost of a force-directed
// or simulated-annealing solver.
function buildOrderings(inputs: LayoutInput[]): number[][] {
  const n = inputs.length;
  if (n <= 1) return [Array.from({ length: n }, (_, i) => i)];

  const idxs = Array.from({ length: n }, (_, i) => i);

  // Ordering 1 — input order. Highest-priority label first under
  // pickTopLabels' ranking by |log2FC| × −log10(p).
  const inputOrder = [...idxs];

  // Ordering 2 — reverse. Lowest-priority label first.
  const reverseOrder = [...idxs].reverse();

  // Ordering 3 — most-isolated anchor first. For each anchor, find
  // the distance to its nearest neighbor; sort by that distance
  // descending. Isolated anchors trivially get clean candidates and
  // don't constrain others; clustered anchors fight last over what's
  // left.
  const isolation = idxs.map((i) => {
    let minD2 = Infinity;
    for (const j of idxs) {
      if (j === i) continue;
      const dx = inputs[i].pointPx.x - inputs[j].pointPx.x;
      const dy = inputs[i].pointPx.y - inputs[j].pointPx.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
    return { idx: i, isolation: minD2 };
  });
  isolation.sort((a, b) => b.isolation - a.isolation);
  const isolatedFirst = isolation.map((e) => e.idx);

  // Ordering 4 — most-clustered first. Reverse of isolation: dense
  // anchors get first claim, the isolated ones place later (where
  // they'll easily find clean spots regardless). Sometimes wins on
  // grids that are uniformly dense in one quadrant.
  const clusteredFirst = [...isolatedFirst].reverse();

  return [inputOrder, reverseOrder, isolatedFirst, clusteredFirst];
}

export function layoutLabels(
  inputs: LayoutInput[],
  obstacles: ObstaclePoint[],
  bounds: LayoutBounds
): PlacedLabel[] {
  if (inputs.length === 0) return [];

  // Multi-restart greedy: try a handful of input orderings, pick the
  // result with lowest total penalty. Strictly non-regressing — the
  // single-pass greedy result (input-order) is one of the candidates,
  // so the worst case is "no improvement found, return the original
  // result." No force-directed simulation, no stochastic steps; pure
  // re-runs of the deterministic greedy with different starting orders.
  //
  // Cost: K × greedy-pass-cost. With K = 4 orderings and ~20 typical
  // labels, this is ~4× the prior single-pass layout — measured
  // ~5–20 ms on a 50-label dense plot. Fast enough that we don't gate
  // it behind a "high density" heuristic; just always run K passes.
  const orderings = buildOrderings(inputs);
  const grid = buildObstacleGrid(obstacles);
  let best = greedyPass(inputs, grid, bounds, orderings[0]);
  for (let i = 1; i < orderings.length; i++) {
    const candidate = greedyPass(inputs, grid, bounds, orderings[i]);
    if (candidate.totalPenalty < best.totalPenalty) {
      best = candidate;
    }
  }
  return best.placed;
}

// Estimate average char width for a monospace font at a given size.
// 0.6 × fontSize is the standard heuristic for SF Mono / Menlo /
// Monaco; close enough for collision-avoid math (we don't need to
// pixel-align text, just keep boxes from overlapping).
export function approxMonoCharWidth(fontSize: number): number {
  return fontSize * 0.6;
}

// ── Aesthetic mapping (optional column → colour or size) ──────────────
//
// Volcano's default colouring is class-based (up = red, down = blue,
// ns = grey). The user can override that with an arbitrary column from
// the parsed dataset — useful for "colour by chromosome", "colour by
// pathway", "size by base-mean expression", etc. Detection rule
// matches scatter's: a column is *continuous* if its values are >80 %
// numeric AND it has > 12 unique values; otherwise *discrete*.

export type ColorMapType = "discrete" | "continuous";

export interface DiscreteColorMap {
  type: "discrete";
  // idx → hex colour. `idx` is the original-row index (matches
  // VolcanoPoint.idx). Values not in this map fall back to the chart's
  // default class colour. The legend list is the unique values in
  // first-seen order so the SVG legend / sidebar legend can use it.
  colorByIdx: Map<number, string>;
  legend: Array<{ value: string; color: string }>;
}

export interface ContinuousColorMap {
  type: "continuous";
  colorByIdx: Map<number, string>;
  // Numeric range used for the scale. UI shows these as the colorbar
  // endpoints; user can override via vmin/vmax sliders later.
  vmin: number;
  vmax: number;
  // The palette name the chart should expose in the colour-bar (so
  // the legend and the actual colours stay in sync).
  paletteName: string;
  // The actual gradient stops the mapping was built with — *post*-
  // inversion, so the in-SVG legend can re-render the bar directly
  // without reaching for the global palette table or knowing about
  // the user's invert flag.
  paletteStops: string[];
}

export type ColorMap = DiscreteColorMap | ContinuousColorMap | null;

// Pull the raw value for a given row's column out of `parseData`-style
// rawData. Returns the empty string if missing — matches Plöttr's
// usual "non-numeric / blank cell" convention.
function rawCell(rawData: string[][], rowIdx: number, col: number): string {
  if (col < 0) return "";
  const row = rawData[rowIdx];
  if (!row) return "";
  const v = row[col];
  return v == null ? "" : String(v);
}

// Plain numeric check — `parseData` upstream has already run
// `fixDecimalCommas` so we don't need the locale-aware shared helper
// here. Keeps this module dependency-free for the test loader.
function isNumericString(s: string): boolean {
  if (s === "") return false;
  const n = Number(s);
  return Number.isFinite(n);
}

// Detect whether a column should be treated as continuous (numeric
// with > 12 unique values, > 80 % numeric ratio) or discrete. Mirrors
// scatter's convention so users get the same auto-mode behaviour
// across plot tools.
//
// `pointIndices` is optional — when provided, only those rows of
// `rawData` are sampled. Used by buildColorMap to keep the type
// classification consistent with the (filtered) set of points the
// caller will actually colour. Default behaviour (no indices) walks
// every row, matching the v1 contract used by sibling tests.
export function detectColorMapType(
  rawData: string[][],
  col: number,
  pointIndices?: number[]
): ColorMapType {
  if (col < 0) return "discrete";
  let total = 0;
  let numeric = 0;
  const unique = new Set<string>();
  const inspect = (s: string) => {
    if (s === "") return;
    total++;
    unique.add(s);
    if (isNumericString(s)) numeric++;
  };
  if (pointIndices) {
    for (const idx of pointIndices) inspect(rawCell(rawData, idx, col));
  } else {
    for (const row of rawData) {
      const v = row[col];
      inspect(v == null ? "" : String(v));
    }
  }
  if (total === 0) return "discrete";
  const numericRatio = numeric / total;
  if (numericRatio > 0.8 && unique.size > 12) return "continuous";
  return "discrete";
}

interface BuildColorMapArgs {
  rawData: string[][];
  pointIndices: number[]; // VolcanoPoint.idx values (one per drawn point)
  col: number; // column index into rawData
  paletteStops: string[]; // pre-resolved palette colour-stop array (continuous mode)
  paletteName: string; // for the result object — the chart pairs it with the legend colourbar
  discretePalette: readonly string[]; // for discrete mode (Okabe-Ito by default)
  interpolate: (stops: string[], t: number) => string; // shared.js `interpolateColor`
}

export function buildColorMap(args: BuildColorMapArgs): ColorMap {
  const { rawData, pointIndices, col, paletteStops, paletteName, discretePalette, interpolate } =
    args;
  if (col < 0) return null;
  // Detect type against the same row subset we'll iterate for
  // colouring — otherwise a column that's continuous overall but
  // categorical-among-sig-points (or vice versa) would render with
  // the wrong scale.
  const type = detectColorMapType(rawData, col, pointIndices);
  if (type === "continuous") {
    let vmin = Infinity;
    let vmax = -Infinity;
    const numeric: Array<{ idx: number; v: number }> = [];
    for (const idx of pointIndices) {
      const raw = rawCell(rawData, idx, col);
      if (!isNumericString(raw)) continue;
      const n = Number(raw);
      numeric.push({ idx, v: n });
      if (n < vmin) vmin = n;
      if (n > vmax) vmax = n;
    }
    if (!Number.isFinite(vmin) || !Number.isFinite(vmax) || vmin === vmax) {
      // Degenerate range — every point is the same value. Fall back
      // to the palette's mid-point so the user still sees a colour.
      vmin = 0;
      vmax = 1;
    }
    const colorByIdx = new Map<number, string>();
    for (const { idx, v } of numeric) {
      const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5;
      colorByIdx.set(idx, interpolate(paletteStops, Math.max(0, Math.min(1, t))));
    }
    return {
      type: "continuous",
      colorByIdx,
      vmin,
      vmax,
      paletteName,
      paletteStops: paletteStops.slice(),
    };
  }
  // Discrete: assign palette colours in first-seen order.
  const seen = new Map<string, string>();
  const order: string[] = [];
  for (const idx of pointIndices) {
    const raw = rawCell(rawData, idx, col);
    if (raw === "") continue;
    if (!seen.has(raw)) {
      const color = discretePalette[seen.size % discretePalette.length];
      seen.set(raw, color);
      order.push(raw);
    }
  }
  const colorByIdx = new Map<number, string>();
  for (const idx of pointIndices) {
    const raw = rawCell(rawData, idx, col);
    const c = seen.get(raw);
    if (c != null) colorByIdx.set(idx, c);
  }
  return {
    type: "discrete",
    colorByIdx,
    legend: order.map((value) => ({ value, color: seen.get(value)! })),
  };
}

// Result of building a size mapping: the per-point radius map plus the
// numeric range it was derived from. The chart uses `byIdx` for actual
// point sizing and `vmin` / `vmax` / `minR` / `maxR` to draw the
// matching SVG legend (sample circles at min, mid, max with their
// data-value labels).
export interface SizeMap {
  byIdx: Map<number, number>;
  vmin: number;
  vmax: number;
  minR: number;
  maxR: number;
}

// Build a per-point radius map from a numeric column. Linearly
// interpolates between `minR` and `maxR`; non-numeric / missing values
// get no entry (chart uses default radius). Mirrors scatter's
// continuous size-mapping behaviour. Returns null when no rows have a
// finite numeric value in the chosen column.
export function buildSizeMap(
  rawData: string[][],
  pointIndices: number[],
  col: number,
  minR: number,
  maxR: number
): SizeMap | null {
  if (col < 0) return null;
  let vmin = Infinity;
  let vmax = -Infinity;
  const numeric: Array<{ idx: number; v: number }> = [];
  for (const idx of pointIndices) {
    const raw = rawCell(rawData, idx, col);
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    numeric.push({ idx, v: n });
    if (n < vmin) vmin = n;
    if (n > vmax) vmax = n;
  }
  if (numeric.length === 0) return null;
  const byIdx = new Map<number, number>();
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax) || vmin === vmax) {
    const mid = (minR + maxR) / 2;
    for (const { idx } of numeric) byIdx.set(idx, mid);
    return {
      byIdx,
      vmin: Number.isFinite(vmin) ? vmin : 0,
      vmax: Number.isFinite(vmax) ? vmax : 0,
      minR,
      maxR,
    };
  }
  const span = vmax - vmin;
  for (const { idx, v } of numeric) {
    const t = (v - vmin) / span;
    byIdx.set(idx, minR + t * (maxR - minR));
  }
  return { byIdx, vmin, vmax, minR, maxR };
}

// ── Row → VolcanoPoint pull ────────────────────────────────────────────
//
// Boundary between Plöttr's parseData() output (a 2-D string array
// indexed by column) and the typed `VolcanoPoint[]` shape every
// downstream consumer (chart, summary, label search, colour/size maps)
// operates on. Skips rows where x or y is null / "" (NA placeholders);
// non-numeric x/y falls through as NaN so the chart filters at draw time
// rather than failing at ingest. Trims trailing whitespace from label
// cells so a sloppy `"AT1G01010 "` still matches an exact-match search.
export function buildPoints(
  rawData: string[][],
  xCol: number,
  yCol: number,
  labelCol: number,
  pScale: PScale = "p",
  callCol = -1
): VolcanoPoint[] {
  const out: VolcanoPoint[] = [];
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const xRaw = row[xCol];
    const yRaw = row[yCol];
    if (xRaw == null || yRaw == null || xRaw === "" || yRaw === "") continue;
    const log2fc = isNumericValue(xRaw) ? toNumericValue(xRaw) : NaN;
    const y = isNumericValue(yRaw) ? toNumericValue(yRaw) : NaN;
    const labelRaw =
      labelCol >= 0 && row[labelCol] != null && row[labelCol] !== "" ? String(row[labelCol]) : null;
    const label = labelRaw == null ? null : labelRaw.trim() || null;
    let pt: VolcanoPoint;
    if (pScale === "p") {
      pt = { idx: i, log2fc, p: y, label };
    } else {
      // Back to p for the cutoff / class; keep −log₁₀ for the y position.
      const nlog10 = pScale === "neglog10" ? y : -y;
      pt = { idx: i, log2fc, p: Math.pow(10, -nlog10), label, nlog10 };
    }
    // An unreadable call counts as not significant.
    if (callCol >= 0) pt.call = parseCall(row[callCol]) === true;
    out.push(pt);
  }
  return out;
}

// ── Eligible-columns filter for aesthetic mapping tiles ────────────────
//
// Aesthetic mappings (Color / Size) can use any column NOT already bound
// to a primary role (x or y). The label column is allowed (a user might
// want to colour by gene name AND show those names — fine, the chart
// will just colour each labelled point with its discrete colour).
// `labelCol` stays in the signature so callers can pass it without
// thinking; it's ignored on purpose.
//
// `ParseDataResult` is declared in types/globals.d.ts; we accept null /
// undefined too because callers (controls tiles) hold the parse result
// in a `useState<ParseDataResult | null>(null)` slot and pass it through
// before the first parse fires.
export function eligibleColumns(
  parsed: ParseDataResult | null | undefined,
  xCol: number,
  yCol: number,
  labelCol: number
): { h: string; i: number }[] {
  void labelCol;
  const used = new Set<number>([xCol, yCol]);
  const headers = parsed?.headers ?? [];
  return headers.map((h, i) => ({ h, i })).filter(({ i }) => !used.has(i));
}

// ── React-tier prop & state shapes ─────────────────────────────────────
//
// These types live alongside the pure helpers because TypeScript's module
// resolution prefers the type-canonical home of a name to be the file
// where the runtime value of an adjacent helper already lives. Keeping
// them here lets chart.tsx / controls.tsx / steps.tsx / app.tsx all
// import from a single barrel without circular imports.

// Persisted vis-reducer state for the volcano tool. Mirrors the runtime
// shape of `VIS_INIT_VOLCANO` in app.tsx — every field is set on init,
// none are optional. Auto-prefs persists this object as JSON, which is
// why each value is a primitive / plain JSON-compatible scalar.
export interface VolcanoVis {
  fcCutoff: number;
  pCutoff: number;
  topNUp: number;
  topNDown: number;
  showLabels: boolean;
  showRefLines: boolean;
  showAxes: boolean;
  tickFontSize: number;
  pointRadius: number;
  pointAlpha: number;
  pointStyle: VolcanoPointStyle;
  labelFontSize: number;
  colorMapPalette: string;
  colorMapInvert: boolean;
  sizeMapMinR: number;
  sizeMapMaxR: number;
  plotWidth: number;
  colorUp: string;
  colorDown: string;
  colorNs: string;
  discretePalette: string;
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  plotTitle: string;
}

// Filled discs, or open circles (stroke only, in the point's colour) —
// independent of the colour / size mappings, which still set the
// colour and radius either way.
export type VolcanoPointStyle = "filled" | "open";

// Reducer-style updater dispatched by every sidebar tile — accepts a
// partial patch that the upstream `usePlotToolState` hook merges into
// the current vis state. The `_reset` sentinel handled there is not part
// of the public dispatch surface, so it stays out of the patch type.
export type UpdVolcanoVis = (patch: Partial<VolcanoVis>) => void;

// The chart's three fixed colour slots. Keyed by VolcanoClass; ns is
// always grey by default but the user can hand-edit the slot in the
// Colors tile. The class-keyed shape is what `makeFillFor` consumes.
export interface VolcanoColors {
  up: string;
  down: string;
  ns: string;
}

// Tally surfaced from the chart's label-layout pass back to the controls
// UI so the warning copy can phrase the suggestion as "N of M didn't fit
// cleanly; try ~M-N" — not a heuristic estimate.
export interface LabelLayoutInfo {
  forcedCount: number;
  attemptedCount: number;
}

// Props for the SVG renderer in chart.tsx.
export interface VolcanoChartProps {
  points: VolcanoPoint[];
  pFloor: number;
  fcCutoff: number;
  pCutoff: number;
  // Auto means "derive from data"; explicit numbers override.
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  xLabel: string;
  yLabel: string;
  title: string;
  subtitle: string;
  colors: VolcanoColors;
  pointRadius: number;
  pointAlpha: number;
  // Defaults to "filled".
  pointStyle?: VolcanoPointStyle;
  showRefLines: boolean;
  showLabels: boolean;
  topNUp: number;
  topNDown: number;
  labelFontSize: number;
  showAxes: boolean;
  tickFontSize: number;
  manualSelection?: Set<number>;
  onPointClick?: (idx: number) => void;
  colorMap?: ColorMap;
  colorMapLabel?: string;
  sizeMap?: SizeMap | null;
  sizeMapLabel?: string;
  plotWidth?: number;
  plotBg: string;
  onLabelLayoutInfo?: (info: LabelLayoutInfo) => void;
  // Set when a significance-call column is mapped: replaces the straight
  // cutoff lines with the boundary those calls imply.
  boundary?: ImpliedBoundary | null;
}

// ── Sidebar-tile props (controls.tsx) ──────────────────────────────────

export interface ThresholdsTileProps {
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
  // Significance-call column name and its implied boundary; when set the
  // tile reports the boundary instead of offering the cutoffs.
  callLabel?: string;
  boundary?: ImpliedBoundary | null;
}

export interface ColorsTileProps {
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
}

export interface ColorRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export interface LabelSearchRowProps {
  points: VolcanoPoint[];
  labelCol: number;
  addToManualSelection: (indices: number[]) => void;
}

export interface LabelsTileProps {
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
  manualSelection: Set<number> | null | undefined;
  clearManualSelection: () => void;
  points: VolcanoPoint[];
  labelCol: number;
  addToManualSelection: (indices: number[]) => void;
  labelDensity?: LabelLayoutInfo | null;
}

export interface StyleTileProps {
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
}

export interface ColorMapTileProps {
  parsed: ParseDataResult | null | undefined;
  xCol: number;
  yCol: number;
  labelCol: number;
  col: number;
  setCol: (i: number) => void;
  colorMap: ColorMap;
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
}

export interface SizeMapTileProps {
  parsed: ParseDataResult | null | undefined;
  xCol: number;
  yCol: number;
  labelCol: number;
  col: number;
  setCol: (i: number) => void;
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
}

export interface SummaryTileProps {
  summary: VolcanoSummary;
  fcCutoff: number;
  pCutoff: number;
  // Set when the file's own calls classify the points.
  callLabel?: string;
}

// ── Step props (steps.tsx) ─────────────────────────────────────────────

export interface ConfigureStepProps {
  parsed: ParseDataResult;
  fileName: string;
  // Separator the auto-detector resolved. Empty string until first parse.
  detectedSep: string;
  xCol: number;
  yCol: number;
  labelCol: number;
  yIsAdjusted: boolean;
  setXCol: (i: number) => void;
  setYCol: (i: number) => void;
  setLabelCol: (i: number) => void;
  setYIsAdjusted: (b: boolean) => void;
  // How the p column is written, and why auto-detection chose a log scale.
  pScale: PScale;
  pScaleReason: PScaleReason;
  setPScale: (s: PScale) => void;
  // Optional significance-call column, -1 for none.
  callCol: number;
  setCallCol: (i: number) => void;
}

export interface PlotStepProps {
  chartRef: React.RefObject<SVGSVGElement>;
  parsed: ParseDataResult;
  xCol: number;
  yCol: number;
  labelCol: number;
  points: VolcanoPoint[];
  pFloor: number;
  clampedCount: number;
  summary: VolcanoSummary;
  xLabel: string;
  yLabel: string;
  vis: VolcanoVis;
  updVis: UpdVolcanoVis;
  manualSelection: Set<number>;
  togglePointSelection: (idx: number) => void;
  clearManualSelection: () => void;
  addToManualSelection: (indices: number[]) => void;
  colorMapCol: number;
  setColorMapCol: (i: number) => void;
  colorMap: ColorMap;
  colorMapLabel: string;
  sizeMapCol: number;
  setSizeMapCol: (i: number) => void;
  sizeMap: SizeMap | null;
  sizeMapLabel: string;
  fileName: string;
  onDownloadCsv: () => void;
  onDownloadR: () => void;
  onReset: () => void;
  labelDensity: LabelLayoutInfo;
  onLabelLayoutInfo: (info: LabelLayoutInfo) => void;
  // Significance-call column: its name ("" when none) and the boundary
  // its calls imply (null when none).
  callLabel: string;
  boundary: ImpliedBoundary | null;
}

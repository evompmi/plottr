// Unit tests for the heatmap pure helpers (tools/heatmap/helpers.ts).
// Covers normalisation math (z-row, z-col, log2), auto-range, dendrogram
// layout + pruning, colorbar tick formatting, and outlier-skew detection. The fuzz harness already
// exercises these structurally; these tests pin down the exact numerical
// behaviour with fixed inputs.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  finiteMean,
  finiteSD,
  normalizeMatrix,
  autoRange,
  buildDendroLayout,
  pruneDendroTree,
  fmtColorbarTick,
  sortedFiniteValues,
  quantileSorted,
  detectRangeSkew,
  countClipped,
  SKEW_MIN_CELLS,
  SKEW_LO_Q,
  SKEW_HI_Q,
  SKEW_OCCUPIED_MAX,
  SKEW_OUTLIER_FRAC_MAX,
  SKEW_FENCE,
} = require("./helpers/heatmap-loader");

// ── finiteMean / finiteSD ───────────────────────────────────────────────────

suite("finiteMean / finiteSD");

test("finiteMean averages over finite entries only", () => {
  approx(finiteMean([1, 2, 3, 4]), 2.5, 1e-12);
  approx(finiteMean([1, 2, NaN, 4]), 7 / 3, 1e-12);
  approx(finiteMean([1, 2, null, 4]), 7 / 3, 1e-12);
});

test("finiteMean returns NaN when no finite entries", () => {
  assert(Number.isNaN(finiteMean([])));
  assert(Number.isNaN(finiteMean([NaN, null, undefined])));
});

test("finiteSD uses n-1 denominator and finite-only entries", () => {
  // [1,2,3,4] → mean 2.5, SS = (1.5^2 + 0.5^2 + 0.5^2 + 1.5^2) = 5, SD = sqrt(5/3)
  approx(finiteSD([1, 2, 3, 4], 2.5), Math.sqrt(5 / 3), 1e-12);
});

test("finiteSD returns 0 when ≤1 finite entries (no degrees of freedom)", () => {
  eq(finiteSD([], 0), 0);
  eq(finiteSD([5], 5), 0);
  eq(finiteSD([NaN, 7, NaN], 7), 0);
});

// ── normalizeMatrix ─────────────────────────────────────────────────────────

suite("normalizeMatrix");

test("zrow centres each row around its own mean / SD", () => {
  const m = [
    [1, 2, 3],
    [10, 20, 30],
  ];
  const out = normalizeMatrix(m, "zrow");
  // Row 1: mean 2, SD sqrt(1) = 1 → [-1, 0, 1]
  approx(out[0][0], -1, 1e-12);
  approx(out[0][1], 0, 1e-12);
  approx(out[0][2], 1, 1e-12);
  // Row 2: mean 20, SD 10 → [-1, 0, 1]
  approx(out[1][0], -1, 1e-12);
  approx(out[1][1], 0, 1e-12);
  approx(out[1][2], 1, 1e-12);
});

test("zcol centres each column independently", () => {
  const m = [
    [1, 10],
    [2, 20],
    [3, 30],
  ];
  const out = normalizeMatrix(m, "zcol");
  // Col 0: mean 2, SD 1 → [-1,0,1]. Col 1: mean 20, SD 10 → [-1,0,1].
  approx(out[0][0], -1, 1e-12);
  approx(out[1][0], 0, 1e-12);
  approx(out[2][0], 1, 1e-12);
  approx(out[0][1], -1, 1e-12);
  approx(out[1][1], 0, 1e-12);
  approx(out[2][1], 1, 1e-12);
});

test("zrow preserves NaN entries (does not coerce to 0)", () => {
  const m = [[1, NaN, 3]];
  const out = normalizeMatrix(m, "zrow");
  assert(Number.isNaN(out[0][1]), "NaN input must stay NaN");
  assert(Number.isFinite(out[0][0]));
  assert(Number.isFinite(out[0][2]));
});

test("zero-variance row is returned unchanged (avoids divide-by-zero)", () => {
  const m = [[5, 5, 5]];
  const out = normalizeMatrix(m, "zrow");
  eq(out[0], [5, 5, 5]);
});

test("log2 applies log2(v + 1) only where v > -1, NaN otherwise", () => {
  const m = [[0, 1, 3, -2, NaN]];
  const out = normalizeMatrix(m, "log2");
  approx(out[0][0], Math.log2(1), 1e-12);
  approx(out[0][1], Math.log2(2), 1e-12);
  approx(out[0][2], Math.log2(4), 1e-12);
  assert(Number.isNaN(out[0][3]), "v=-2 is below -1, must be NaN");
  assert(Number.isNaN(out[0][4]), "NaN stays NaN");
});

test("unknown mode returns the original matrix reference", () => {
  const m = [[1, 2]];
  eq(normalizeMatrix(m, "bogus"), m);
});

test("empty matrix is returned as-is without throwing", () => {
  eq(normalizeMatrix([], "zrow"), []);
});

// ── autoRange ──────────────────────────────────────────────────────────────

suite("autoRange");

test("non-diverging range spans [min, max]", () => {
  eq(autoRange([[1, 5, 3]], false), [1, 5]);
});

test("diverging range is symmetric around zero", () => {
  eq(autoRange([[-2, 4]], true), [-4, 4]);
  eq(autoRange([[-5, 1]], true), [-5, 5]);
});

test("single-value matrix expands by ±0.5 to avoid degenerate axis", () => {
  eq(autoRange([[7, 7, 7]], false), [6.5, 7.5]);
});

test("all-NaN matrix falls back to [0, 1]", () => {
  eq(autoRange([[NaN, NaN]], false), [0, 1]);
});

// ── buildDendroLayout ──────────────────────────────────────────────────────

suite("buildDendroLayout");

// Minimal 3-leaf tree: merge (0,1) at h=1, then merge that clade with leaf 2 at h=2.
const leaf = (i) => ({ left: null, right: null, index: i });
const tree3 = {
  left: { left: leaf(0), right: leaf(1), height: 1 },
  right: leaf(2),
  height: 2,
};

test("returns maxHeight equal to root height", () => {
  const { maxHeight } = buildDendroLayout(tree3);
  eq(maxHeight, 2);
});

test("emits exactly 3 segments per internal node (2 verticals + 1 horizontal)", () => {
  const { segments, nodes } = buildDendroLayout(tree3);
  eq(nodes.length, 2); // two internal merges
  eq(segments.length, 6); // 3 per internal node
});

test("each node record carries a [xMin, xMax] leaf-span for hit testing", () => {
  const { nodes } = buildDendroLayout(tree3);
  // First-merged node is the (0,1) inner merge — spans leaves 0..1.
  const inner = nodes.find((n) => n.xMax === 1 && n.xMin === 0);
  assert(inner, "inner (0,1) merge record must exist");
  eq(inner.leaves, [0, 1]);
  // Root node spans all three leaves.
  const root = nodes.find((n) => n.xMax === 2);
  eq(root.leaves, [0, 1, 2]);
  eq(root.xMin, 0);
});

test("null tree returns an empty layout", () => {
  eq(buildDendroLayout(null), { segments: [], nodes: [], maxHeight: 0 });
});

// ── pruneDendroTree ────────────────────────────────────────────────────────

suite("pruneDendroTree");

test("keeping all leaves returns an equivalent tree (same root height)", () => {
  const pruned = pruneDendroTree(tree3, new Set([0, 1, 2]));
  assert(pruned);
  eq(pruned.height, 2);
});

test("keeping leaves from non-sibling clades collapses the elided branches", () => {
  // Keep {0, 2}: leaf 1 is dropped; left internal collapses to just leaf 0.
  // Root still merges leaf 0 with leaf 2 at original h=2.
  const pruned = pruneDendroTree(tree3, new Set([0, 2]));
  assert(pruned);
  eq(pruned.height, 2);
  eq(pruned.left.index, 0);
  eq(pruned.right.index, 2);
});

test("returns null when fewer than 2 leaves survive", () => {
  eq(pruneDendroTree(tree3, new Set([0])), null);
  eq(pruneDendroTree(tree3, new Set()), null);
});

// ── fmtColorbarTick ────────────────────────────────────────────────────────

suite("fmtColorbarTick");

test("non-finite values render as '—'", () => {
  eq(fmtColorbarTick(NaN), "—");
  eq(fmtColorbarTick(Infinity), "—");
});

test("zero is the literal '0'", () => {
  eq(fmtColorbarTick(0), "0");
});

test("large or very small magnitudes switch to exponential notation", () => {
  eq(fmtColorbarTick(1000), "1.0e+3");
  eq(fmtColorbarTick(-2500), "-2.5e+3");
  eq(fmtColorbarTick(0.005), "5.0e-3");
});

test("values in [0.01, 1) use two decimals, values in [1, 1000) use one", () => {
  eq(fmtColorbarTick(0.5), "0.50");
  eq(fmtColorbarTick(0.12), "0.12");
  eq(fmtColorbarTick(1), "1.0");
  eq(fmtColorbarTick(42.1), "42.1");
});

// ── Outlier-skew detection ─────────────────────────────────────────────────

suite("sortedFiniteValues / quantileSorted");

test("sortedFiniteValues flattens, drops non-finite, sorts ascending", () => {
  eq(sortedFiniteValues([[3, NaN], [1, Infinity, 2], [-Infinity]]), [1, 2, 3]);
  eq(sortedFiniteValues([]), []);
});

test("quantileSorted interpolates linearly (R type 7)", () => {
  eq(quantileSorted([1, 2, 3, 4], 0), 1);
  eq(quantileSorted([1, 2, 3, 4], 0.5), 2.5);
  eq(quantileSorted([1, 2, 3, 4], 1), 4);
  approx(quantileSorted([0, 10], 0.98), 9.8, 1e-12);
});

suite("detectRangeSkew");

const range = (lo, n) => Array.from({ length: n }, (_, i) => lo + i);

test("thresholds are pinned", () => {
  eq(SKEW_MIN_CELLS, 20);
  eq(SKEW_LO_Q, 0.02);
  eq(SKEW_HI_Q, 0.98);
  eq(SKEW_OCCUPIED_MAX, 0.5);
  eq(SKEW_OUTLIER_FRAC_MAX, 0.02);
  eq(SKEW_FENCE, 0.5);
});

test("one extreme cell over a 0–99 bulk is flagged with the 2nd–98th percentile range", () => {
  const sorted = range(0, 100).concat([1000]);
  eq(detectRangeSkew(sorted, 0, 1000, false), {
    nOutliers: 1,
    nTotal: 101,
    occupied: 0.096,
    suggestedMin: 2,
    suggestedMax: 98,
  });
});

test("applying the suggestion clears the alert", () => {
  const sorted = range(0, 100).concat([1000]);
  eq(detectRangeSkew(sorted, 2, 98, false), null);
});

test("evenly spread data is not flagged", () => {
  eq(detectRangeSkew(range(0, 100), 0, 99, false), null);
});

test("fewer than SKEW_MIN_CELLS values are never flagged", () => {
  eq(detectRangeSkew(range(0, 18).concat([1000]), 0, 1000, false), null);
});

test("heavy tails (> 2 % of cells far out) are not 'a few outliers'", () => {
  const sorted = range(0, 90).concat(new Array(10).fill(1000));
  eq(detectRangeSkew(sorted, 0, 1000, false), null);
});

test("a manually widened range with no data out there is not flagged", () => {
  eq(detectRangeSkew(range(0, 100), 0, 1000, false), null);
});

test("cells already beyond vmin / vmax do not count — they no longer stretch the scale", () => {
  const sorted = range(0, 100).concat([1000]);
  // vmax = 300: bulk occupies 96/300 = 0.32 of the scale but nothing in
  // (146, 300] is far out, so there is no in-range outlier to blame.
  eq(detectRangeSkew(sorted, 0, 300, false), null);
});

test("diverging scales get a symmetric suggestion around zero", () => {
  const sorted = [-500].concat(range(-49, 100));
  eq(detectRangeSkew(sorted, -500, 500, true), {
    nOutliers: 1,
    nTotal: 101,
    occupied: 0.096,
    suggestedMin: -48,
    suggestedMax: 48,
  });
});

test("suggestions are rounded to 4 significant digits, never collapsing tiny scales", () => {
  const sorted = range(0, 100)
    .map((v) => v * 1e-5 + 1.23456e-5)
    .concat([1]);
  const r = detectRangeSkew(sorted, 1.23456e-5, 1, false);
  assert(r !== null, "tiny-scale skew is flagged");
  eq(r.suggestedMin, 3.235e-5);
  eq(r.suggestedMax, 0.0009923);
});

test("degenerate inputs return null", () => {
  eq(detectRangeSkew([], 0, 1, false), null);
  eq(detectRangeSkew(range(0, 100).concat([1000]), NaN, 1000, false), null);
  eq(detectRangeSkew(range(0, 100).concat([1000]), 5, 5, false), null);
  // Constant bulk: the robust range has zero width, nothing sensible to clip to.
  eq(detectRangeSkew(new Array(100).fill(0).concat([50]), 0, 50, false), null);
});

suite("countClipped");

test("counts saturated cells among the displayed rows × cols only", () => {
  const m = [
    [-1, 0, 5],
    [NaN, 10, 2],
  ];
  eq(countClipped(m, 0, 5, [0, 1], [0, 1, 2]), { below: 1, above: 1 });
  eq(countClipped(m, 0, 5, [1], [0, 1, 2]), { below: 0, above: 1 });
  eq(countClipped(m, 0, 5, [0, 1], [0]), { below: 1, above: 0 });
  eq(countClipped(m, -5, 50, [0, 1], [0, 1, 2]), { below: 0, above: 0 });
});

summary();

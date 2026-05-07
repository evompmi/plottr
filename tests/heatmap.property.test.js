// Property-based tests for the heatmap data pipeline.
//
// Replaces the prior tests/fuzz/heatmap.fuzz.js. Drives the same chain
// (parseWideMatrix → pairwiseDistance → hclust → kmeans) plus the pure
// helpers (finiteMean / finiteSD / normalizeMatrix / autoRange /
// fmtColorbarTick / buildDendroLayout / pruneDendroTree) under
// fast-check, with the curated CSV-pathology corpus and structural
// arbitraries from tests/helpers/csv-arbitraries.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseWideMatrix,
  pairwiseDistance,
  hclust,
  kmeans,
  finiteMean,
  finiteSD,
  normalizeMatrix,
  autoRange,
  fmtColorbarTick,
  buildDendroLayout,
  pruneDendroTree,
} = require("./helpers/heatmap-loader");
const { arbAnyCsv, arbWideCsv } = require("./helpers/csv-arbitraries");

const RUNS = 400;
const RUNS_HEAVY = 80; // hclust × 3 linkages × 3 metrics is O(n²) in nRows

const check = (prop) => fc.assert(prop, { numRuns: RUNS });
const checkHeavy = (prop) => fc.assert(prop, { numRuns: RUNS_HEAVY });

const METRICS = ["euclidean", "manhattan", "correlation"];
const LINKAGES = ["average", "complete", "single"];
const NORMALIZE_MODES = ["none", "zrow", "zcol", "log2"];

// ── parseWideMatrix ────────────────────────────────────────────────────

suite("heatmap property — parseWideMatrix");

test("never throws on arbitrary CSV-shaped input", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      parseWideMatrix(text);
      return true;
    })
  );
});

test("returned matrix is a (possibly empty) array of arrays of numbers", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const parsed = parseWideMatrix(text);
      if (!parsed || !Array.isArray(parsed.matrix)) return false;
      for (const row of parsed.matrix) {
        if (!Array.isArray(row)) return false;
        for (const v of row) {
          if (typeof v !== "number") return false;
        }
      }
      return true;
    })
  );
});

test("matrix is rectangular (every row has the same column count)", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length < 2) return true;
      const nCols = m[0].length;
      return m.every((row) => row.length === nCols);
    })
  );
});

test("rowLabels and colLabels are arrays sized to the matrix", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const parsed = parseWideMatrix(text);
      if (!parsed) return false;
      if (!Array.isArray(parsed.rowLabels) || !Array.isArray(parsed.colLabels)) return false;
      const nRows = parsed.matrix.length;
      const nCols = nRows > 0 ? parsed.matrix[0].length : 0;
      return parsed.rowLabels.length === nRows && parsed.colLabels.length === nCols;
    })
  );
});

// ── pairwiseDistance ───────────────────────────────────────────────────

suite("heatmap property — pairwiseDistance");

test("never throws and returns an nRows × nRows matrix", () => {
  checkHeavy(
    fc.property(arbWideCsv, fc.constantFrom(...METRICS), (text, metric) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      const D = pairwiseDistance(m, metric);
      if (!Array.isArray(D) || D.length !== m.length) return false;
      for (const row of D) {
        if (!Array.isArray(row) || row.length !== m.length) return false;
      }
      return true;
    })
  );
});

test("distance matrix is symmetric (D[i][j] === D[j][i])", () => {
  checkHeavy(
    fc.property(arbWideCsv, fc.constantFrom(...METRICS), (text, metric) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length < 2) return true;
      const D = pairwiseDistance(m, metric);
      for (let i = 0; i < D.length; i++) {
        for (let j = i + 1; j < D.length; j++) {
          if (Number.isNaN(D[i][j]) || Number.isNaN(D[j][i])) continue;
          if (Math.abs(D[i][j] - D[j][i]) > 1e-9) return false;
        }
      }
      return true;
    })
  );
});

test("diagonal is zero (distance from a row to itself)", () => {
  checkHeavy(
    fc.property(arbWideCsv, fc.constantFrom(...METRICS), (text, metric) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      const D = pairwiseDistance(m, metric);
      for (let i = 0; i < D.length; i++) {
        if (Number.isNaN(D[i][i])) continue;
        if (Math.abs(D[i][i]) > 1e-9) return false;
      }
      return true;
    })
  );
});

test("off-diagonal distances are non-negative when finite", () => {
  checkHeavy(
    fc.property(arbWideCsv, fc.constantFrom(...METRICS), (text, metric) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length < 2) return true;
      const D = pairwiseDistance(m, metric);
      for (let i = 0; i < D.length; i++) {
        for (let j = 0; j < D.length; j++) {
          if (i === j) continue;
          const v = D[i][j];
          if (!Number.isFinite(v)) continue;
          if (v < -1e-9) return false;
        }
      }
      return true;
    })
  );
});

// ── hclust ─────────────────────────────────────────────────────────────

suite("heatmap property — hclust");

test("never throws across all metric × linkage combinations", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length === 0) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        return res != null && Array.isArray(res.order);
      }
    )
  );
});

test("leaf order is a valid permutation of 0..nRows-1 when tree exists", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length === 0) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        if (!res || !res.tree) return true;
        const seen = new Set(res.order);
        if (seen.size !== m.length) return false;
        for (let i = 0; i < m.length; i++) if (!seen.has(i)) return false;
        return true;
      }
    )
  );
});

test("hclust order length equals nRows", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length === 0) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        return res != null && res.order.length === m.length;
      }
    )
  );
});

// ── kmeans ─────────────────────────────────────────────────────────────

suite("heatmap property — kmeans");

test("never throws and clusters length matches nRows", () => {
  checkHeavy(
    fc.property(arbWideCsv, fc.integer({ min: 2, max: 4 }), (text, k) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length < k) return true;
      const km = kmeans(m, k, { seed: 1, maxIter: 30, restarts: 1 });
      if (!km || !Array.isArray(km.clusters)) return false;
      return km.clusters.length === m.length;
    })
  );
});

test("every cluster id is an integer in [0, k)", () => {
  checkHeavy(
    fc.property(arbWideCsv, fc.integer({ min: 2, max: 4 }), (text, k) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length < k) return true;
      const km = kmeans(m, k, { seed: 1, maxIter: 30, restarts: 1 });
      if (!km || !Array.isArray(km.clusters)) return true;
      for (const c of km.clusters) {
        if (!Number.isInteger(c) || c < 0 || c >= k) return false;
      }
      return true;
    })
  );
});

test("kmeans is deterministic with the same seed", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.integer({ min: 2, max: 4 }),
      fc.integer({ min: 1, max: 1 << 20 }),
      (text, k, seed) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length < k) return true;
        const a = kmeans(m, k, { seed, maxIter: 30, restarts: 1 });
        const b = kmeans(m, k, { seed, maxIter: 30, restarts: 1 });
        return JSON.stringify(a.clusters) === JSON.stringify(b.clusters);
      }
    )
  );
});

// ── pure helpers: finiteMean / finiteSD ────────────────────────────────

suite("heatmap property — finiteMean / finiteSD");

test("finiteMean returns NaN iff no finite values are present", () => {
  // The implementation accumulates a sum of finite values then divides
  // by the count. With doubles near MAX_VALUE the running sum can
  // overflow to ±Infinity even when every input was finite, so the
  // strongest invariant is "NaN iff empty-of-finite, otherwise *some*
  // number" — not "always finite for non-empty-of-finite".
  check(
    fc.property(
      fc.array(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity))),
      (arr) => {
        const m = finiteMean(arr);
        const hasFinite = arr.some((v) => Number.isFinite(v));
        if (hasFinite) return typeof m === "number" && !Number.isNaN(m);
        return Number.isNaN(m);
      }
    )
  );
});

test("finiteMean of a single finite value equals that value", () => {
  check(
    fc.property(fc.double({ min: -1e10, max: 1e10, noNaN: true, noDefaultInfinity: true }), (v) => {
      return finiteMean([v]) === v;
    })
  );
});

test("finiteSD is non-negative when finite", () => {
  check(
    fc.property(
      fc.array(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity)), { minLength: 1 }),
      (arr) => {
        const mean = finiteMean(arr);
        const sd = finiteSD(arr, mean);
        if (!Number.isFinite(sd)) return true;
        return sd >= 0;
      }
    )
  );
});

test("finiteSD of constant input is 0", () => {
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.integer({ min: 2, max: 20 }),
      (v, n) => {
        const arr = new Array(n).fill(v);
        return finiteSD(arr, v) === 0;
      }
    )
  );
});

test("finiteSD with fewer than 2 finite values is 0", () => {
  // Documented: the implementation returns 0 when n ≤ 1 (n-1 sample-SD
  // denominator would otherwise be 0 / negative).
  check(
    fc.property(
      fc.array(fc.constantFrom(NaN, Infinity, -Infinity), { minLength: 0, maxLength: 5 }),
      (arr) => finiteSD(arr, NaN) === 0
    )
  );
  check(
    fc.property(
      fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
      (v) => finiteSD([v, NaN, Infinity], v) === 0
    )
  );
});

// ── pure helpers: normalizeMatrix ──────────────────────────────────────

suite("heatmap property — normalizeMatrix");

test("preserves shape across all modes (incl. unknown)", () => {
  check(
    fc.property(arbWideCsv, fc.constantFrom(...NORMALIZE_MODES, "unknown-mode"), (text, mode) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      const out = normalizeMatrix(m, mode);
      if (!Array.isArray(out) || out.length !== m.length) return false;
      for (let i = 0; i < m.length; i++) {
        if (!Array.isArray(out[i]) || out[i].length !== m[i].length) return false;
      }
      return true;
    })
  );
});

test("unknown mode returns the input matrix (identity)", () => {
  check(
    fc.property(arbWideCsv, fc.string({ maxLength: 8 }), (text, mode) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      // Skip the four real modes; everything else is identity per the
      // implementation's `return matrix` default.
      if (NORMALIZE_MODES.includes(mode)) return true;
      const out = normalizeMatrix(m, mode);
      // Reference equality is acceptable here — the helper returns the
      // input unchanged for unknown modes.
      return out === m;
    })
  );
});

test("zrow: per-row mean is 0 when row variance > 0", () => {
  check(
    fc.property(arbWideCsv, (text) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      const out = normalizeMatrix(m, "zrow");
      for (let i = 0; i < out.length; i++) {
        const finiteCount = out[i].filter((v) => Number.isFinite(v)).length;
        if (finiteCount < 2) continue;
        const mean = finiteMean(out[i]);
        if (!Number.isFinite(mean)) continue;
        // If the original row had zero finite-variance, the helper falls
        // back to a copy and the mean is whatever the row's mean was.
        // Detect that path by checking whether the row was scaled at all
        // (any finite output ≠ corresponding finite input).
        const wasScaled = out[i].some(
          (v, j) => Number.isFinite(v) && Number.isFinite(m[i][j]) && v !== m[i][j]
        );
        if (!wasScaled) continue;
        if (Math.abs(mean) > 1e-6) return false;
      }
      return true;
    })
  );
});

test("log2 maps v to log2(v + 1) for finite v > -1, NaN otherwise", () => {
  check(
    fc.property(arbWideCsv, (text) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      const out = normalizeMatrix(m, "log2");
      for (let i = 0; i < m.length; i++) {
        for (let j = 0; j < m[i].length; j++) {
          const v = m[i][j];
          const want = Number.isFinite(v) && v > -1 ? Math.log2(v + 1) : NaN;
          const got = out[i][j];
          if (Number.isNaN(want)) {
            if (!Number.isNaN(got)) return false;
          } else {
            if (Math.abs(got - want) > 1e-9) return false;
          }
        }
      }
      return true;
    })
  );
});

// ── pure helpers: autoRange ────────────────────────────────────────────

suite("heatmap property — autoRange");

test("returns a 2-element array of finite numbers with [0] ≤ [1]", () => {
  check(
    fc.property(arbWideCsv, fc.boolean(), (text, diverging) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m) return true;
      const r = autoRange(m, diverging);
      if (!Array.isArray(r) || r.length !== 2) return false;
      if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) return false;
      return r[0] <= r[1];
    })
  );
});

test("diverging=true produces a symmetric range around 0", () => {
  check(
    fc.property(arbWideCsv, (text) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m) return true;
      const [lo, hi] = autoRange(m, true);
      // Empty / all-NaN matrix returns [0, 1] (documented degenerate
      // path); the symmetry property doesn't apply.
      if (lo === 0 && hi === 1) return true;
      return Math.abs(lo + hi) < 1e-9;
    })
  );
});

test("empty / all-NaN matrix returns [0, 1]", () => {
  check(
    fc.property(fc.boolean(), (diverging) => {
      const empty = autoRange([], diverging);
      const allNaN = autoRange(
        [
          [NaN, NaN],
          [NaN, NaN],
        ],
        diverging
      );
      return empty[0] === 0 && empty[1] === 1 && allNaN[0] === 0 && allNaN[1] === 1;
    })
  );
});

// ── pure helpers: fmtColorbarTick ──────────────────────────────────────

suite("heatmap property — fmtColorbarTick");

test("always returns a string", () => {
  check(
    fc.property(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, 0)), (v) => {
      return typeof fmtColorbarTick(v) === "string";
    })
  );
});

test("non-finite input returns the em-dash placeholder", () => {
  check(
    fc.property(fc.constantFrom(NaN, Infinity, -Infinity), (v) => {
      return fmtColorbarTick(v) === "—";
    })
  );
});

test("zero input returns '0' exactly", () => {
  check(
    fc.property(fc.constantFrom(0, -0), (v) => {
      return fmtColorbarTick(v) === "0";
    })
  );
});

// ── buildDendroLayout / pruneDendroTree ────────────────────────────────

suite("heatmap property — buildDendroLayout");

test("empty / null tree returns degenerate layout", () => {
  const a = buildDendroLayout(null);
  if (!a || !Array.isArray(a.segments) || a.segments.length !== 0) {
    throw new Error("null tree should give zero segments");
  }
  if (!Array.isArray(a.nodes) || a.nodes.length !== 0) {
    throw new Error("null tree should give zero nodes");
  }
});

test("layout produces n − 1 internal nodes and 3·(n−1) segments for n leaves", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length < 2) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        if (!res || !res.tree) return true;
        const layout = buildDendroLayout(res.tree);
        const n = m.length;
        return layout.nodes.length === n - 1 && layout.segments.length === 3 * (n - 1);
      }
    )
  );
});

test("layout segments have finite coordinates", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length < 2) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        if (!res || !res.tree) return true;
        const layout = buildDendroLayout(res.tree);
        for (const s of layout.segments) {
          if (!Number.isFinite(s.x1) || !Number.isFinite(s.y1)) return false;
          if (!Number.isFinite(s.x2) || !Number.isFinite(s.y2)) return false;
        }
        return true;
      }
    )
  );
});

suite("heatmap property — pruneDendroTree");

test("empty keepSet returns null", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length === 0) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        if (!res || !res.tree) return true;
        return pruneDendroTree(res.tree, new Set()) === null;
      }
    )
  );
});

test("singleton keepSet returns null (a one-leaf 'tree' has no merges)", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length < 2) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        if (!res || !res.tree) return true;
        return pruneDendroTree(res.tree, new Set([0])) === null;
      }
    )
  );
});

test("full keepSet returns a tree containing every original leaf", () => {
  checkHeavy(
    fc.property(
      arbWideCsv,
      fc.constantFrom(...METRICS),
      fc.constantFrom(...LINKAGES),
      (text, metric, linkage) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length < 2) return true;
        const D = pairwiseDistance(m, metric);
        const res = hclust(D, linkage);
        if (!res || !res.tree) return true;
        const all = new Set();
        for (let i = 0; i < m.length; i++) all.add(i);
        const pruned = pruneDendroTree(res.tree, all);
        if (!pruned) return false;
        // Walk and collect leaf indices
        const found = new Set();
        function walk(node) {
          if (!node) return;
          if (node.left === null && node.right === null) {
            found.add(node.index);
            return;
          }
          walk(node.left);
          walk(node.right);
        }
        walk(pruned);
        return found.size === m.length;
      }
    )
  );
});

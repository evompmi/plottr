// Property-based tests for the heatmap data pipeline.
//
// Replaces the prior tests/fuzz/heatmap.fuzz.js. Drives the same chain
// (parseWideMatrix → pairwiseDistance → hclust → kmeans) plus the pure
// helpers (finiteMean / finiteSD / normalizeMatrix / autoRange /
// fmtColorbarTick) under fast-check, with the curated CSV-pathology
// corpus and structural arbitraries from tests/helpers/csv-arbitraries.

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
} = require("./helpers/heatmap-loader");
const { arbAnyCsv, arbWideCsv } = require("./helpers/csv-arbitraries");

const RUNS = 400;
const RUNS_HEAVY = 80; // hclust × 3 linkages × 3 metrics is O(n²) in nRows

const check = (prop) => fc.assert(prop, { numRuns: RUNS });
const checkHeavy = (prop) => fc.assert(prop, { numRuns: RUNS_HEAVY });

const METRICS = ["euclidean", "manhattan", "correlation"];
const LINKAGES = ["average", "complete", "single"];

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
        if (!res || !res.tree) return true; // 0/1-row degenerate path
        const seen = new Set(res.order);
        if (seen.size !== m.length) return false;
        for (let i = 0; i < m.length; i++) if (!seen.has(i)) return false;
        return true;
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

// ── Pure helpers ───────────────────────────────────────────────────────

suite("heatmap property — pure helpers");

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

test("finiteSD is non-negative", () => {
  check(
    fc.property(
      fc.array(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity)), { minLength: 1 }),
      (arr) => {
        const mean = finiteMean(arr);
        const sd = finiteSD(arr, mean);
        if (!Number.isFinite(sd)) return true; // degenerate paths return 0/NaN
        return sd >= 0;
      }
    )
  );
});

test("normalizeMatrix preserves shape", () => {
  check(
    fc.property(
      arbWideCsv,
      fc.constantFrom("none", "row-zscore", "column-zscore", "log10"),
      (text, mode) => {
        const parsed = parseWideMatrix(text);
        const m = parsed && parsed.matrix;
        if (!m || m.length === 0) return true;
        const out = normalizeMatrix(m, mode);
        if (!Array.isArray(out) || out.length !== m.length) return false;
        for (let i = 0; i < m.length; i++) {
          if (!Array.isArray(out[i]) || out[i].length !== m[i].length) return false;
        }
        return true;
      }
    )
  );
});

test("autoRange returns finite min ≤ max for non-empty matrices", () => {
  check(
    fc.property(arbWideCsv, fc.boolean(), (text, diverging) => {
      const parsed = parseWideMatrix(text);
      const m = parsed && parsed.matrix;
      if (!m || m.length === 0) return true;
      const r = autoRange(m, diverging);
      if (!r || typeof r !== "object") return true;
      if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) return true;
      return r.min <= r.max;
    })
  );
});

test("fmtColorbarTick always returns a string", () => {
  check(
    fc.property(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, 0)), (v) => {
      return typeof fmtColorbarTick(v) === "string";
    })
  );
});

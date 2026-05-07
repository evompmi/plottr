// Property-based tests for tools/volcano/helpers.ts using fast-check.
//
// This file is the volcano tool's *primary* invariant-coverage driver.
// It supersedes the prior tests/fuzz/volcano.fuzz.js (now removed) — it
// asserts every invariant the fuzz harness asserted, plus a number of
// stronger ones the bespoke harness couldn't easily express, and runs
// inside the regular `npm test` so every commit gets coverage instead
// of waiting for `npm run fuzz:volcano`.
//
// Why fast-check here instead of the seeded fuzz loop:
//   - Automatic shrinking. On failure, fast-check converges on the
//     minimal counterexample (shortest array, smallest log2fc, …). The
//     prior harness reported the seed and required manually bisecting
//     to reproduce a useful one-line repro.
//   - Standard tooling. Properties run via Vitest, surface in the same
//     reporter, and respect the same per-test timeout.
//   - Higher routine cadence. Per-property `numRuns` is set to RUNS
//     below (500 for the cheap helpers, 200 for the layout helpers) and
//     fires every `npm test`. Per-PR coverage is now ≈ RUNS × number of
//     properties = 8000+ generated cases vs. the fuzz harness's default
//     of 1000 per loop (only run on demand).
//
// Properties are split per helper and per invariant so the shrinker
// converges on the smallest input that violates *that* invariant rather
// than the smallest dataset that contains anything suspicious.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  classifyPoint,
  computePFloor,
  negLog10P,
  countClamped,
  summarize,
  autoDetectColumns,
  pickTopLabels,
  layoutLabels,
  approxMonoCharWidth,
  detectColorMapType,
  buildColorMap,
  buildSizeMap,
  matchPointsByLabel,
  buildPoints,
  eligibleColumns,
  COLOR_PALETTES,
  PALETTE,
  interpolateColor,
} = require("./helpers/volcano-loader");

// Per-property iteration budget. 500 is comfortably above fast-check's
// default of 100; for the simpler helpers it adds < 5 ms per property,
// and gives ~8 k cases per `npm test`. Layout helpers run at a lower
// budget because each iteration is ~1 ms (greedy multi-restart).
const RUNS = 500;
const RUNS_LAYOUT = 200;

const check = (prop) => fc.assert(prop, { numRuns: RUNS });
const checkLayout = (prop) => fc.assert(prop, { numRuns: RUNS_LAYOUT });

// ── Arbitraries ─────────────────────────────────────────────────────────
//
// Point shape mirrors the bias of the prior fuzz harness's genDataset():
// mostly well-formed numbers (finite log2FC, well-behaved p) with a
// sprinkle of pathological values (NaN, ±Inf, p = 0, p > 1) so the
// helpers see the same shapes a real malformed dataset might throw.

const arbLog2fc = fc.oneof(
  { weight: 70, arbitrary: fc.double({ min: -6, max: 6, noNaN: true, noDefaultInfinity: true }) },
  { weight: 15, arbitrary: fc.double({ min: -20, max: 20, noNaN: true, noDefaultInfinity: true }) },
  { weight: 5, arbitrary: fc.constant(NaN) },
  { weight: 5, arbitrary: fc.constant(Infinity) },
  { weight: 5, arbitrary: fc.constant(-Infinity) }
);

const arbP = fc.oneof(
  {
    weight: 60,
    arbitrary: fc.double({ min: 1e-15, max: 1, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 10,
    arbitrary: fc.double({ min: 1e-300, max: 1e-50, noNaN: true, noDefaultInfinity: true }),
  },
  { weight: 10, arbitrary: fc.double({ min: 1, max: 5, noNaN: true, noDefaultInfinity: true }) },
  { weight: 10, arbitrary: fc.constant(0) },
  { weight: 5, arbitrary: fc.constant(NaN) },
  { weight: 5, arbitrary: fc.constant(Infinity) }
);

// Hostile-label corpus: embedded commas, quotes, tabs, unicode, empty,
// null. Same pool the prior fuzz harness used so coverage doesn't
// regress on label edge cases.
const HOSTILE_LABELS = [
  "GeneA",
  "AT1G01010",
  "with,comma",
  'with"quote',
  "with\ttab",
  "with\nnewline",
  "with\rcr",
  "α-tubulin",
  "🧬",
  "",
  null,
];

const arbLabel = fc.oneof(
  { weight: 70, arbitrary: fc.constantFrom(...HOSTILE_LABELS) },
  { weight: 30, arbitrary: fc.string({ maxLength: 20 }) }
);

const arbFcCutoff = fc.double({ min: 0.5, max: 2.5, noNaN: true, noDefaultInfinity: true });
const arbPCutoff = fc.double({ min: 1e-4, max: 0.2, noNaN: true, noDefaultInfinity: true });

// Point-with-idx — idx matches the position in the array, which is
// what every helper expects.
const arbPointsRaw = fc.array(fc.record({ log2fc: arbLog2fc, p: arbP, label: arbLabel }), {
  minLength: 1,
  maxLength: 80,
});
const arbPoints = arbPointsRaw.map((arr) => arr.map((pt, idx) => ({ idx, ...pt })));

// Empty array path — separate so it gets its own coverage; arbPoints
// has minLength 1 to keep the shrinker from collapsing every property
// to "no points".
const arbAnyPoints = fc
  .array(fc.record({ log2fc: arbLog2fc, p: arbP, label: arbLabel }), {
    minLength: 0,
    maxLength: 80,
  })
  .map((arr) => arr.map((pt, idx) => ({ idx, ...pt })));

// Header / column arbitraries for autoDetectColumns + buildPoints +
// eligibleColumns. Mix realistic header names (so the regex patterns
// in autoDetectColumns occasionally fire) with random strings.
const REAL_HEADERS = [
  "gene",
  "Gene",
  "Symbol",
  "feature",
  "log2FoldChange",
  "logFC",
  "log2FC",
  "FoldChange",
  "Log2 Fold Change",
  "pvalue",
  "P.Value",
  "PValue",
  "p-value",
  "padj",
  "adj.P.Val",
  "FDR",
  "qvalue",
  "baseMean",
  "AveExpr",
  "B",
  "stat",
];

const arbHeader = fc.oneof(
  { weight: 70, arbitrary: fc.constantFrom(...REAL_HEADERS) },
  { weight: 30, arbitrary: fc.string({ maxLength: 12 }) }
);

const arbHeaders = fc.array(arbHeader, { minLength: 0, maxLength: 12 });

// Cell value arbitrary for raw-data 2D arrays — a mix of numerics
// (likely finite, occasional scientific / extreme), non-numerics, and
// missing.
const arbCell = fc.oneof(
  { weight: 30, arbitrary: fc.constant("") },
  {
    weight: 40,
    arbitrary: fc
      .double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
      .map((n) => n.toFixed(3)),
  },
  { weight: 10, arbitrary: fc.constantFrom("NaN", "Inf", "-Inf", "1e10", "1.5e-3") },
  { weight: 10, arbitrary: fc.constantFrom("abc", "x", "ctrl", "treat", "🧬", "α") },
  { weight: 10, arbitrary: fc.string({ maxLength: 8 }) }
);

// rawData + xCol/yCol/labelCol drawn from the same column space, so
// indices are always valid (or -1).
const arbDataAndCols = fc.integer({ min: 1, max: 5 }).chain((ncols) =>
  fc.record({
    ncols: fc.constant(ncols),
    rawData: fc.array(fc.array(arbCell, { minLength: ncols, maxLength: ncols }), {
      minLength: 1,
      maxLength: 25,
    }),
    xCol: fc.integer({ min: -1, max: ncols - 1 }),
    yCol: fc.integer({ min: -1, max: ncols - 1 }),
    labelCol: fc.integer({ min: -1, max: ncols - 1 }),
  })
);

// ── classifyPoint ───────────────────────────────────────────────────────

suite("volcano property — classifyPoint");

test("returns one of up / down / ns and never throws", () => {
  check(
    fc.property(arbLog2fc, arbP, arbFcCutoff, arbPCutoff, (log2fc, p, fcCutoff, pCutoff) => {
      const cls = classifyPoint(log2fc, p, fcCutoff, pCutoff);
      return cls === "up" || cls === "down" || cls === "ns";
    })
  );
});

test("non-finite log2fc or p always classifies as ns", () => {
  const arbBadNum = fc.constantFrom(NaN, Infinity, -Infinity);
  check(
    fc.property(arbBadNum, arbP, arbFcCutoff, arbPCutoff, (log2fc, p, fcCutoff, pCutoff) => {
      return classifyPoint(log2fc, p, fcCutoff, pCutoff) === "ns";
    })
  );
  check(
    fc.property(arbLog2fc, arbBadNum, arbFcCutoff, arbPCutoff, (log2fc, p, fcCutoff, pCutoff) => {
      return classifyPoint(log2fc, p, fcCutoff, pCutoff) === "ns";
    })
  );
});

test("strict cutoff: log2fc === ±fcCutoff is ns (not up / down)", () => {
  check(
    fc.property(
      fc.double({ min: 1e-4, max: 0.04, noNaN: true, noDefaultInfinity: true }),
      arbFcCutoff,
      arbPCutoff,
      (p, fcCutoff, pCutoff) => {
        // Force p well below pCutoff so ns can only come from the cutoff,
        // not the significance, leg.
        const sigP = Math.min(p, pCutoff / 2);
        return (
          classifyPoint(fcCutoff, sigP, fcCutoff, pCutoff) === "ns" &&
          classifyPoint(-fcCutoff, sigP, fcCutoff, pCutoff) === "ns"
        );
      }
    )
  );
});

test("sign symmetry: classifying -x flips up ↔ down for finite x", () => {
  check(
    fc.property(
      fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1e-15, max: 1, noNaN: true, noDefaultInfinity: true }),
      arbFcCutoff,
      arbPCutoff,
      (log2fc, p, fcCutoff, pCutoff) => {
        const a = classifyPoint(log2fc, p, fcCutoff, pCutoff);
        const b = classifyPoint(-log2fc, p, fcCutoff, pCutoff);
        if (a === "ns") return b === "ns";
        if (a === "up") return b === "down";
        if (a === "down") return b === "up";
        return false;
      }
    )
  );
});

test("idempotent: same args produce same class on every call", () => {
  check(
    fc.property(arbLog2fc, arbP, arbFcCutoff, arbPCutoff, (log2fc, p, fcCutoff, pCutoff) => {
      const a = classifyPoint(log2fc, p, fcCutoff, pCutoff);
      const b = classifyPoint(log2fc, p, fcCutoff, pCutoff);
      return a === b;
    })
  );
});

// ── computePFloor + negLog10P ───────────────────────────────────────────

suite("volcano property — p-value clamping");

test("computePFloor returns a positive finite number", () => {
  check(
    fc.property(arbAnyPoints, (points) => {
      const f = computePFloor(points);
      return Number.isFinite(f) && f > 0;
    })
  );
});

test("computePFloor ≤ minPositiveFiniteP / 10 when one exists", () => {
  check(
    fc.property(arbPoints, (points) => {
      let minPos = Infinity;
      for (const pt of points) {
        if (Number.isFinite(pt.p) && pt.p > 0 && pt.p < minPos) minPos = pt.p;
      }
      const f = computePFloor(points);
      if (minPos === Infinity) return f === 1e-300; // documented degenerate fallback
      // Tolerate FP rounding: compare ratios.
      return f <= minPos / 10 + 1e-300;
    })
  );
});

test("negLog10P is always finite", () => {
  check(
    fc.property(arbPoints, (points) => {
      const pFloor = computePFloor(points);
      for (const pt of points) {
        if (!Number.isFinite(negLog10P(pt.p, pFloor))) return false;
      }
      return true;
    })
  );
});

test("negLog10P ≥ 0 for any p when pFloor ≤ 1", () => {
  // pFloor is always returned by computePFloor in (0, 1e-300..something
  // tiny], so -log10(pFloor) is large positive. For finite p ≥ 0,
  // -log10(p) ≥ 0 iff p ≤ 1. Filter to that domain.
  check(
    fc.property(
      fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      arbPoints,
      (p, points) => {
        const pFloor = computePFloor(points);
        return negLog10P(p, pFloor) >= 0;
      }
    )
  );
});

test("negLog10P clamps non-finite or negative p to 0", () => {
  const arbBadP = fc.oneof(
    fc.constantFrom(NaN, Infinity, -Infinity),
    fc.double({ min: -100, max: -1e-12, noNaN: true, noDefaultInfinity: true })
  );
  check(
    fc.property(arbBadP, arbPoints, (p, points) => {
      const pFloor = computePFloor(points);
      return negLog10P(p, pFloor) === 0;
    })
  );
});

test("negLog10P clamps p === 0 to -log10(pFloor)", () => {
  check(
    fc.property(arbPoints, (points) => {
      const pFloor = computePFloor(points);
      return negLog10P(0, pFloor) === -Math.log10(pFloor);
    })
  );
});

test("negLog10P matches -log10(p) for p in (0, 1]", () => {
  check(
    fc.property(
      fc.double({ min: 1e-10, max: 1, noNaN: true, noDefaultInfinity: true }),
      arbPoints,
      (p, points) => {
        const pFloor = computePFloor(points);
        if (p < pFloor) return true; // domain handled by clamp test
        const got = negLog10P(p, pFloor);
        const want = -Math.log10(p);
        return Math.abs(got - want) < 1e-9;
      }
    )
  );
});

test("negLog10P is monotonically non-increasing in p (within (pFloor, 1])", () => {
  check(
    fc.property(
      fc.double({ min: 1e-10, max: 1, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 1e-10, max: 1, noNaN: true, noDefaultInfinity: true }),
      arbPoints,
      (p1, p2, points) => {
        const pFloor = computePFloor(points);
        // Skip pairs that fall below the floor — there the function
        // floors both to the same constant.
        if (p1 < pFloor || p2 < pFloor) return true;
        if (p1 < p2) return negLog10P(p1, pFloor) >= negLog10P(p2, pFloor);
        if (p1 > p2) return negLog10P(p1, pFloor) <= negLog10P(p2, pFloor);
        return negLog10P(p1, pFloor) === negLog10P(p2, pFloor);
      }
    )
  );
});

// ── summarize / countClamped ────────────────────────────────────────────

suite("volcano property — summarize / countClamped");

test("up + down + ns equals total (valid points only)", () => {
  check(
    fc.property(arbAnyPoints, arbFcCutoff, arbPCutoff, (points, fcCutoff, pCutoff) => {
      const s = summarize(points, fcCutoff, pCutoff);
      return s.up + s.down + s.ns === s.total;
    })
  );
});

test("total + discarded equals input length", () => {
  check(
    fc.property(arbAnyPoints, arbFcCutoff, arbPCutoff, (points, fcCutoff, pCutoff) => {
      const s = summarize(points, fcCutoff, pCutoff);
      return s.total + s.discarded === points.length;
    })
  );
});

test("counts agree with classifying each point individually", () => {
  // The strongest invariant: summarize is consistent with the
  // single-point classifier. Catches off-by-one / branch-skip bugs that
  // a sums-to-total invariant would miss.
  check(
    fc.property(arbAnyPoints, arbFcCutoff, arbPCutoff, (points, fcCutoff, pCutoff) => {
      let up = 0,
        down = 0,
        ns = 0,
        discarded = 0;
      for (const pt of points) {
        if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) discarded++;
        else {
          const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
          if (cls === "up") up++;
          else if (cls === "down") down++;
          else ns++;
        }
      }
      const s = summarize(points, fcCutoff, pCutoff);
      return s.up === up && s.down === down && s.ns === ns && s.discarded === discarded;
    })
  );
});

test("countClamped is in [0, points.length]", () => {
  check(
    fc.property(arbAnyPoints, (points) => {
      const c = countClamped(points);
      return c >= 0 && c <= points.length;
    })
  );
});

test("countClamped equals the number of points with p === 0", () => {
  check(
    fc.property(arbAnyPoints, (points) => {
      let want = 0;
      for (const pt of points) if (pt.p === 0) want++;
      return countClamped(points) === want;
    })
  );
});

// ── pickTopLabels ───────────────────────────────────────────────────────

suite("volcano property — pickTopLabels");

const arbCount = fc.integer({ min: 0, max: 14 });

test("never returns more than nUp + nDown entries", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const top = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        return top.length <= nUp + nDown;
      }
    )
  );
});

test("returned indices are unique, never ns, and entry.cls agrees with classifier", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const top = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        const seen = new Set();
        for (const e of top) {
          if (seen.has(e.idx)) return false;
          seen.add(e.idx);
          const pt = points[e.idx];
          if (!pt) return false;
          const cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
          if (cls === "ns") return false;
          if (e.cls !== cls) return false;
        }
        return true;
      }
    )
  );
});

test("per-class caps respected — count(up) ≤ nUp, count(down) ≤ nDown", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const top = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        let ups = 0;
        let downs = 0;
        for (const e of top) {
          if (e.cls === "up") ups++;
          else if (e.cls === "down") downs++;
        }
        return ups <= nUp && downs <= nDown;
      }
    )
  );
});

test("ups always appear before downs in the output", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const top = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        let sawDown = false;
        for (const e of top) {
          if (e.cls === "down") sawDown = true;
          else if (e.cls === "up" && sawDown) return false;
        }
        return true;
      }
    )
  );
});

test("scores are sorted descending within each class", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const top = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        const ups = top.filter((e) => e.cls === "up");
        const downs = top.filter((e) => e.cls === "down");
        for (let i = 1; i < ups.length; i++) {
          if (ups[i].score > ups[i - 1].score) return false;
        }
        for (let i = 1; i < downs.length; i++) {
          if (downs[i].score > downs[i - 1].score) return false;
        }
        return true;
      }
    )
  );
});

test("never includes points with null / empty label", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const top = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        for (const e of top) {
          const lab = points[e.idx].label;
          if (lab == null || lab === "") return false;
        }
        return true;
      }
    )
  );
});

test("idempotent: same inputs produce the same output", () => {
  check(
    fc.property(
      arbPoints,
      arbCount,
      arbCount,
      arbFcCutoff,
      arbPCutoff,
      (points, nUp, nDown, fcCutoff, pCutoff) => {
        const pFloor = computePFloor(points);
        const a = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        const b = pickTopLabels(points, nUp, nDown, fcCutoff, pCutoff, pFloor);
        return JSON.stringify(a) === JSON.stringify(b);
      }
    )
  );
});

// ── layoutLabels ────────────────────────────────────────────────────────

suite("volcano property — layoutLabels");

const arbLabelInput = fc.record({
  pointPx: fc.record({
    x: fc.double({ min: 0, max: 800, noNaN: true, noDefaultInfinity: true }),
    y: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  }),
  text: fc.oneof(fc.constantFrom("Gene", "AT1G", "P53", "α", ""), fc.string({ maxLength: 12 })),
  charWidth: fc.constant(approxMonoCharWidth(11)),
  lineHeight: fc.constant(13),
  pointRadius: fc.constant(3),
  ringRadius: fc.constant(4.5),
});

const arbObstacle = fc.record({
  x: fc.double({ min: 0, max: 800, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  r: fc.double({ min: 1, max: 6, noNaN: true, noDefaultInfinity: true }),
});

// Bounds occasionally have zero w/h (degenerate) and negative origin
// (margin-spill). Match the same biases as the prior fuzz harness.
const arbBounds = fc.record({
  x: fc.constantFrom(-30, 0),
  y: fc.constantFrom(-30, 0),
  w: fc.oneof(
    { weight: 95, arbitrary: fc.double({ min: 200, max: 1000, noNaN: true }) },
    { weight: 5, arbitrary: fc.constant(0) }
  ),
  h: fc.oneof(
    { weight: 95, arbitrary: fc.double({ min: 100, max: 600, noNaN: true }) },
    { weight: 5, arbitrary: fc.constant(0) }
  ),
});

const arbLayoutInputs = fc.array(arbLabelInput, { minLength: 0, maxLength: 12 });
const arbLayoutObstacles = fc.array(arbObstacle, { minLength: 0, maxLength: 20 });

test("output length matches input length", () => {
  checkLayout(
    fc.property(arbLayoutInputs, arbLayoutObstacles, arbBounds, (inputs, obstacles, bounds) => {
      const placed = layoutLabels(inputs, obstacles, bounds);
      return placed.length === inputs.length;
    })
  );
});

test("every placed label has finite leaderStart and leaderEnd", () => {
  checkLayout(
    fc.property(
      fc.array(arbLabelInput, { minLength: 1, maxLength: 12 }),
      arbLayoutObstacles,
      arbBounds,
      (inputs, obstacles, bounds) => {
        const placed = layoutLabels(inputs, obstacles, bounds);
        for (const p of placed) {
          if (!p.leaderStart || !p.leaderEnd) return false;
          if (!Number.isFinite(p.leaderStart.x) || !Number.isFinite(p.leaderStart.y)) return false;
          if (!Number.isFinite(p.leaderEnd.x) || !Number.isFinite(p.leaderEnd.y)) return false;
        }
        return true;
      }
    )
  );
});

test("bbox dimensions are non-negative and bbox coordinates finite", () => {
  checkLayout(
    fc.property(
      fc.array(arbLabelInput, { minLength: 1, maxLength: 12 }),
      arbLayoutObstacles,
      arbBounds,
      (inputs, obstacles, bounds) => {
        const placed = layoutLabels(inputs, obstacles, bounds);
        for (const p of placed) {
          if (!p.bbox) return false;
          if (p.bbox.w < 0 || p.bbox.h < 0) return false;
          if (!Number.isFinite(p.bbox.x) || !Number.isFinite(p.bbox.y)) return false;
          if (!Number.isFinite(p.bbox.w) || !Number.isFinite(p.bbox.h)) return false;
        }
        return true;
      }
    )
  );
});

test("placed[i] preserves inputs[i].pointPx and .text", () => {
  checkLayout(
    fc.property(
      fc.array(arbLabelInput, { minLength: 1, maxLength: 12 }),
      arbLayoutObstacles,
      arbBounds,
      (inputs, obstacles, bounds) => {
        const placed = layoutLabels(inputs, obstacles, bounds);
        for (let i = 0; i < inputs.length; i++) {
          if (placed[i].text !== inputs[i].text) return false;
          if (placed[i].pointPx.x !== inputs[i].pointPx.x) return false;
          if (placed[i].pointPx.y !== inputs[i].pointPx.y) return false;
        }
        return true;
      }
    )
  );
});

test("forced flag is a boolean on every placement", () => {
  checkLayout(
    fc.property(
      fc.array(arbLabelInput, { minLength: 1, maxLength: 12 }),
      arbLayoutObstacles,
      arbBounds,
      (inputs, obstacles, bounds) => {
        const placed = layoutLabels(inputs, obstacles, bounds);
        for (const p of placed) {
          if (typeof p.forced !== "boolean") return false;
        }
        return true;
      }
    )
  );
});

// ── autoDetectColumns ──────────────────────────────────────────────────

suite("volcano property — autoDetectColumns");

test("xCol / yCol / labelCol are integers in [-1, headers.length)", () => {
  check(
    fc.property(arbHeaders, (headers) => {
      const r = autoDetectColumns(headers);
      const ok = (n) => Number.isInteger(n) && n >= -1 && n < Math.max(1, headers.length + 1);
      // Allow -1 even when headers is empty (length 0).
      const inRange = (n) => n === -1 || (n >= 0 && n < headers.length);
      return (
        ok(r.xCol) &&
        ok(r.yCol) &&
        ok(r.labelCol) &&
        inRange(r.xCol) &&
        inRange(r.yCol) &&
        inRange(r.labelCol) &&
        typeof r.yIsAdjusted === "boolean"
      );
    })
  );
});

test("xCol !== yCol when both are set", () => {
  check(
    fc.property(arbHeaders, (headers) => {
      const r = autoDetectColumns(headers);
      if (r.xCol >= 0 && r.yCol >= 0) return r.xCol !== r.yCol;
      return true;
    })
  );
});

test("yIsAdjusted is true iff yCol matches an adjusted-pvalue pattern", () => {
  // Round-trip: if the helper says yIsAdjusted, the chosen column name
  // should match one of the documented adjusted-p patterns. Conversely
  // if false, it shouldn't match any of them.
  const ADJ =
    /^(padj|p[\s_.-]?adj|adj[\s_.-]?p[\s_.-]?val|adjusted[\s_.-]?p[\s_.-]?value|fdr|q[\s_.-]?value|qvalue|q[\s_.-]?val)$/i;
  check(
    fc.property(arbHeaders, (headers) => {
      const r = autoDetectColumns(headers);
      if (r.yCol < 0) return r.yIsAdjusted === false;
      const name = String(headers[r.yCol] || "").trim();
      const matchesAdj = ADJ.test(name);
      return r.yIsAdjusted === matchesAdj;
    })
  );
});

// ── detectColorMapType ─────────────────────────────────────────────────

suite("volcano property — detectColorMapType");

test("returns one of 'discrete' / 'continuous' and never throws", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol }) => {
      const t = detectColorMapType(rawData, xCol);
      return t === "discrete" || t === "continuous";
    })
  );
});

test("col < 0 always returns discrete", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData }) => detectColorMapType(rawData, -1) === "discrete")
  );
});

// ── buildColorMap ──────────────────────────────────────────────────────

suite("volcano property — buildColorMap");

test("returns null OR a typed map; never throws on arbitrary rawData", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol }) => {
      const cm = buildColorMap({
        rawData,
        pointIndices: rawData.map((_, i) => i),
        col: xCol,
        paletteStops: COLOR_PALETTES.viridis,
        paletteName: "viridis",
        discretePalette: PALETTE,
        interpolate: interpolateColor,
      });
      if (cm === null) return xCol < 0 || true; // null is a valid return
      return cm.type === "discrete" || cm.type === "continuous";
    })
  );
});

test("col < 0 returns null", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData }) => {
      const cm = buildColorMap({
        rawData,
        pointIndices: rawData.map((_, i) => i),
        col: -1,
        paletteStops: COLOR_PALETTES.viridis,
        paletteName: "viridis",
        discretePalette: PALETTE,
        interpolate: interpolateColor,
      });
      return cm === null;
    })
  );
});

test("continuous: vmin ≤ vmax", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol }) => {
      const cm = buildColorMap({
        rawData,
        pointIndices: rawData.map((_, i) => i),
        col: xCol,
        paletteStops: COLOR_PALETTES.viridis,
        paletteName: "viridis",
        discretePalette: PALETTE,
        interpolate: interpolateColor,
      });
      if (cm == null || cm.type !== "continuous") return true;
      return cm.vmin <= cm.vmax;
    })
  );
});

test("discrete: legend entries are unique", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol }) => {
      const cm = buildColorMap({
        rawData,
        pointIndices: rawData.map((_, i) => i),
        col: xCol,
        paletteStops: COLOR_PALETTES.viridis,
        paletteName: "viridis",
        discretePalette: PALETTE,
        interpolate: interpolateColor,
      });
      if (cm == null || cm.type !== "discrete") return true;
      const seen = new Set();
      for (const e of cm.legend) {
        if (seen.has(e.value)) return false;
        seen.add(e.value);
      }
      return true;
    })
  );
});

// ── buildSizeMap ───────────────────────────────────────────────────────

suite("volcano property — buildSizeMap");

const arbRadii = fc
  .tuple(
    fc.double({ min: 1, max: 10, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 1, max: 10, noNaN: true, noDefaultInfinity: true })
  )
  .map(([a, b]) => (a <= b ? { minR: a, maxR: b } : { minR: b, maxR: a }));

test("returns null OR a SizeMap with finite vmin / vmax / minR / maxR", () => {
  check(
    fc.property(arbDataAndCols, arbRadii, ({ rawData, xCol }, { minR, maxR }) => {
      const m = buildSizeMap(
        rawData,
        rawData.map((_, i) => i),
        xCol,
        minR,
        maxR
      );
      if (m === null) return true;
      return (
        Number.isFinite(m.vmin) &&
        Number.isFinite(m.vmax) &&
        m.vmin <= m.vmax &&
        m.minR === minR &&
        m.maxR === maxR
      );
    })
  );
});

test("col < 0 returns null", () => {
  check(
    fc.property(
      arbDataAndCols,
      arbRadii,
      ({ rawData }, { minR, maxR }) =>
        buildSizeMap(
          rawData,
          rawData.map((_, i) => i),
          -1,
          minR,
          maxR
        ) === null
    )
  );
});

test("every byIdx value is in [minR, maxR]", () => {
  check(
    fc.property(arbDataAndCols, arbRadii, ({ rawData, xCol }, { minR, maxR }) => {
      const m = buildSizeMap(
        rawData,
        rawData.map((_, i) => i),
        xCol,
        minR,
        maxR
      );
      if (m === null) return true;
      for (const v of m.byIdx.values()) {
        // Allow a small FP slack at the endpoints.
        if (v < minR - 1e-9 || v > maxR + 1e-9) return false;
        if (!Number.isFinite(v)) return false;
      }
      return true;
    })
  );
});

// ── matchPointsByLabel ─────────────────────────────────────────────────

suite("volcano property — matchPointsByLabel");

const arbQuery = fc.oneof(
  { weight: 30, arbitrary: fc.string({ maxLength: 30 }) },
  { weight: 30, arbitrary: fc.constant("") },
  {
    weight: 40,
    arbitrary: fc
      .array(fc.constantFrom(...REAL_HEADERS, "AT1G", "TP53", "p53", "Gene", "α"), {
        minLength: 1,
        maxLength: 5,
      })
      .map((toks) => toks.join(",")),
  }
);

test("returns { matched, unmatchedTokens } with array fields", () => {
  check(
    fc.property(arbAnyPoints, arbQuery, (points, query) => {
      const r = matchPointsByLabel(points, query);
      return Array.isArray(r.matched) && Array.isArray(r.unmatchedTokens);
    })
  );
});

test("matched indices are unique", () => {
  check(
    fc.property(arbAnyPoints, arbQuery, (points, query) => {
      const r = matchPointsByLabel(points, query);
      return new Set(r.matched).size === r.matched.length;
    })
  );
});

test("matched only contains points with non-empty label", () => {
  check(
    fc.property(arbAnyPoints, arbQuery, (points, query) => {
      const r = matchPointsByLabel(points, query);
      const byIdx = new Map(points.map((pt) => [pt.idx, pt]));
      for (const idx of r.matched) {
        const pt = byIdx.get(idx);
        if (!pt) return false;
        if (pt.label == null || String(pt.label).trim() === "") return false;
      }
      return true;
    })
  );
});

test("non-string query returns empty result", () => {
  check(
    fc.property(arbAnyPoints, fc.constantFrom(null, undefined, 0, 42, true), (points, q) => {
      const r = matchPointsByLabel(points, q);
      return r.matched.length === 0 && r.unmatchedTokens.length === 0;
    })
  );
});

test("empty / whitespace-only query returns empty result", () => {
  check(
    fc.property(
      arbAnyPoints,
      fc.constantFrom("", "   ", "\n\n", "\t", " , , \n , "),
      (points, q) => {
        const r = matchPointsByLabel(points, q);
        return r.matched.length === 0 && r.unmatchedTokens.length === 0;
      }
    )
  );
});

test("idempotent: same inputs produce the same result", () => {
  check(
    fc.property(arbAnyPoints, arbQuery, (points, query) => {
      const a = matchPointsByLabel(points, query);
      const b = matchPointsByLabel(points, query);
      return JSON.stringify(a) === JSON.stringify(b);
    })
  );
});

// ── buildPoints ────────────────────────────────────────────────────────

suite("volcano property — buildPoints");

test("never throws on arbitrary rawData + col indices", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol, yCol, labelCol }) => {
      const out = buildPoints(rawData, xCol, yCol, labelCol);
      return Array.isArray(out);
    })
  );
});

test("idx values are unique, ascending, and in [0, rawData.length)", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol, yCol, labelCol }) => {
      const out = buildPoints(rawData, xCol, yCol, labelCol);
      for (let i = 0; i < out.length; i++) {
        if (out[i].idx < 0 || out[i].idx >= rawData.length) return false;
        if (i > 0 && out[i].idx <= out[i - 1].idx) return false;
      }
      return true;
    })
  );
});

test("output length ≤ rawData length (rows can only be skipped, never duplicated)", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol, yCol, labelCol }) => {
      return buildPoints(rawData, xCol, yCol, labelCol).length <= rawData.length;
    })
  );
});

test("labelCol = -1 always produces null label", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, xCol, yCol }) => {
      const out = buildPoints(rawData, xCol, yCol, -1);
      for (const pt of out) if (pt.label !== null) return false;
      return true;
    })
  );
});

test("when xCol or yCol is -1, output is empty (no row has a value there)", () => {
  check(
    fc.property(arbDataAndCols, ({ rawData, yCol, labelCol }) => {
      // xCol = -1 means row[-1] is undefined → null-ish → row skipped.
      const out = buildPoints(rawData, -1, yCol, labelCol);
      return out.length === 0;
    })
  );
});

// ── eligibleColumns ────────────────────────────────────────────────────

suite("volcano property — eligibleColumns");

test("never includes the xCol or yCol", () => {
  check(
    fc.property(
      arbHeaders,
      fc.integer({ min: -1, max: 20 }),
      fc.integer({ min: -1, max: 20 }),
      (headers, xCol, yCol) => {
        const out = eligibleColumns({ headers }, xCol, yCol, -1);
        for (const e of out) {
          if (e.i === xCol || e.i === yCol) return false;
        }
        return true;
      }
    )
  );
});

test("every entry's i is a valid header index", () => {
  check(
    fc.property(
      arbHeaders,
      fc.integer({ min: -1, max: 20 }),
      fc.integer({ min: -1, max: 20 }),
      (headers, xCol, yCol) => {
        const out = eligibleColumns({ headers }, xCol, yCol, -1);
        for (const e of out) {
          if (e.i < 0 || e.i >= headers.length) return false;
          if (typeof e.h !== "string" && !(headers[e.i] === e.h)) return false;
        }
        return true;
      }
    )
  );
});

test("entries are unique by i, and i is monotonically ascending", () => {
  check(
    fc.property(
      arbHeaders,
      fc.integer({ min: -1, max: 20 }),
      fc.integer({ min: -1, max: 20 }),
      (headers, xCol, yCol) => {
        const out = eligibleColumns({ headers }, xCol, yCol, -1);
        for (let i = 1; i < out.length; i++) {
          if (out[i].i <= out[i - 1].i) return false;
        }
        return true;
      }
    )
  );
});

test("null / missing parsed returns []", () => {
  check(
    fc.property(fc.integer({ min: -1, max: 5 }), fc.integer({ min: -1, max: 5 }), (xCol, yCol) => {
      const a = eligibleColumns(null, xCol, yCol, -1);
      const b = eligibleColumns(undefined, xCol, yCol, -1);
      const c = eligibleColumns({}, xCol, yCol, -1);
      return a.length === 0 && b.length === 0 && c.length === 0;
    })
  );
});

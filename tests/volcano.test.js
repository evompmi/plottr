// Unit tests for tools/volcano/helpers.ts. Pure functions, no React, no
// DOM — exercised directly via the vm-context loader. Covers:
//   - classifyPoint: every reachable branch + edge cases
//   - computePFloor + negLog10P: p=0 clamping, NaN/negative input
//   - summarize: counts up / down / ns / discarded correctly
//   - autoDetectColumns: DESeq2 / limma / edgeR header conventions
//   - pickTopLabels: ranks by |log2FC| × -log10(p), excludes ns
//   - layoutLabels: greedy collision-avoid; forced-anchor fallback

const { suite, test, assert, eq, summary } = require("./harness");
const {
  VOLCANO_DEFAULT_COLORS,
  classifyPoint,
  computePFloor,
  negLog10P,
  countClamped,
  summarize,
  autoDetectColumns,
  pickTopLabels,
  layoutLabels,
  approxMonoCharWidth,
} = require("./helpers/volcano-loader");

// ── classifyPoint ─────────────────────────────────────────────────────────

suite("volcano helpers — classifyPoint");

test("up: log2FC > +cutoff AND p < threshold", () => {
  eq(classifyPoint(2, 0.01, 1, 0.05), "up");
  eq(classifyPoint(1.5, 0.04, 1, 0.05), "up");
});

test("down: log2FC < -cutoff AND p < threshold", () => {
  eq(classifyPoint(-2, 0.01, 1, 0.05), "down");
  eq(classifyPoint(-1.5, 0.04, 1, 0.05), "down");
});

test("ns: log2FC under cutoff (sub-magnitude effect)", () => {
  eq(classifyPoint(0.5, 0.001, 1, 0.05), "ns");
  eq(classifyPoint(-0.5, 0.001, 1, 0.05), "ns");
});

test("ns: p above threshold (no significance)", () => {
  eq(classifyPoint(3, 0.5, 1, 0.05), "ns");
  eq(classifyPoint(-3, 0.5, 1, 0.05), "ns");
});

test("ns: exactly at boundary (strict comparison)", () => {
  // log2FC === fcCutoff is NOT considered "up" (strict >); same for p.
  eq(classifyPoint(1, 0.01, 1, 0.05), "ns");
  eq(classifyPoint(2, 0.05, 1, 0.05), "ns");
});

test("ns: NaN / Infinity input falls through cleanly", () => {
  eq(classifyPoint(NaN, 0.01, 1, 0.05), "ns");
  eq(classifyPoint(2, NaN, 1, 0.05), "ns");
  eq(classifyPoint(Infinity, 0.01, 1, 0.05), "ns");
});

// ── computePFloor + negLog10P ─────────────────────────────────────────────

suite("volcano helpers — p-value clamping");

test("computePFloor returns minNonZero / 10", () => {
  const points = [
    { idx: 0, log2fc: 1, p: 1e-5, label: null },
    { idx: 1, log2fc: 2, p: 1e-10, label: null },
    { idx: 2, log2fc: 0, p: 0.5, label: null },
  ];
  // min non-zero = 1e-10 → floor = 1e-11
  const f = computePFloor(points);
  assert(Math.abs(f - 1e-11) / 1e-11 < 1e-9, "expected ~1e-11, got " + f);
});

test("computePFloor returns 1e-300 when all p are zero or non-finite", () => {
  const points = [
    { idx: 0, log2fc: 1, p: 0, label: null },
    { idx: 1, log2fc: 2, p: NaN, label: null },
  ];
  eq(computePFloor(points), 1e-300, "should fall back to 1e-300 floor");
});

test("negLog10P clamps p=0 to -log10(pFloor)", () => {
  eq(negLog10P(0, 1e-11), 11, "clamped value should be -log10(1e-11) = 11");
});

test("negLog10P returns 0 for non-finite or negative p", () => {
  eq(negLog10P(NaN, 1e-11), 0);
  eq(negLog10P(-0.5, 1e-11), 0);
  eq(negLog10P(Infinity, 1e-11), 0);
});

test("negLog10P matches Math.log10 for normal p", () => {
  // Use approx since floats are floats.
  const out = negLog10P(0.001, 1e-11);
  assert(Math.abs(out - 3) < 1e-10, "expected 3, got " + out);
});

test("countClamped reports number of zero-p rows only", () => {
  const points = [
    { idx: 0, log2fc: 1, p: 0, label: null },
    { idx: 1, log2fc: 2, p: 1e-50, label: null },
    { idx: 2, log2fc: 3, p: 0, label: null },
    { idx: 3, log2fc: 0, p: NaN, label: null },
  ];
  eq(countClamped(points), 2, "should only count exactly-zero p");
});

// ── summarize ─────────────────────────────────────────────────────────────

suite("volcano helpers — summarize");

test("counts up / down / ns and discards non-finite rows", () => {
  const points = [
    { idx: 0, log2fc: 2, p: 0.001, label: null }, // up
    { idx: 1, log2fc: -3, p: 0.0001, label: null }, // down
    { idx: 2, log2fc: 0.5, p: 0.5, label: null }, // ns (sub-mag, sub-sig)
    { idx: 3, log2fc: 5, p: 0.5, label: null }, // ns (above mag, sub-sig)
    { idx: 4, log2fc: NaN, p: 0.001, label: null }, // discarded
    { idx: 5, log2fc: 1.2, p: 0.04, label: null }, // up
  ];
  const s = summarize(points, 1, 0.05);
  eq(s.up, 2, "wrong up count");
  eq(s.down, 1, "wrong down count");
  eq(s.ns, 2, "wrong ns count");
  eq(s.total, 5, "wrong valid total");
  eq(s.discarded, 1, "wrong discarded count");
});

test("up + down + ns equals total invariant holds", () => {
  // Random-ish dataset; recount-by-component must equal total.
  const points = [];
  for (let i = 0; i < 50; i++) {
    points.push({ idx: i, log2fc: (i - 25) / 5, p: Math.exp(-i / 10), label: null });
  }
  const s = summarize(points, 1, 0.05);
  eq(s.up + s.down + s.ns, s.total, "components must sum to total");
});

// ── autoDetectColumns ─────────────────────────────────────────────────────

suite("volcano helpers — autoDetectColumns");

test("DESeq2 conventional output", () => {
  const headers = ["gene", "baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj"];
  const r = autoDetectColumns(headers);
  eq(r.xCol, 2, "log2FC should be column 2");
  eq(r.yCol, 6, "padj (preferred over pvalue) should be column 6");
  eq(r.labelCol, 0, "gene should be label column 0");
  assert(r.yIsAdjusted, "yIsAdjusted should be true for padj");
});

test("limma conventional output", () => {
  const headers = ["Gene", "logFC", "AveExpr", "t", "P.Value", "adj.P.Val", "B"];
  const r = autoDetectColumns(headers);
  eq(r.xCol, 1, "logFC should be column 1");
  eq(r.yCol, 5, "adj.P.Val should be preferred over P.Value");
  eq(r.labelCol, 0, "Gene should be label column 0");
  assert(r.yIsAdjusted, "yIsAdjusted should be true for adj.P.Val");
});

test("edgeR conventional output", () => {
  const headers = ["Gene", "logFC", "logCPM", "F", "PValue", "FDR"];
  const r = autoDetectColumns(headers);
  eq(r.xCol, 1, "logFC");
  eq(r.yCol, 5, "FDR (adjusted) preferred");
  assert(r.yIsAdjusted, "FDR is adjusted");
});

test("falls back to raw p-value when no adjusted column exists", () => {
  const headers = ["feature", "log2FC", "pvalue"];
  const r = autoDetectColumns(headers);
  eq(r.yCol, 2, "should pick raw pvalue");
  assert(!r.yIsAdjusted, "yIsAdjusted should be false when no adj column");
});

test("returns -1 for missing columns", () => {
  const headers = ["only_one_col"];
  const r = autoDetectColumns(headers);
  eq(r.xCol, -1);
  eq(r.yCol, -1);
  eq(r.labelCol, -1);
});

test("name detection is case-insensitive and handles whitespace variants", () => {
  // E.g. "Log2 Fold Change" instead of "log2FoldChange".
  const headers = ["Symbol", "Log2 Fold Change", "P-Value", "Adjusted P Value"];
  const r = autoDetectColumns(headers);
  eq(r.xCol, 1, "log2FC name with spaces should still match");
  eq(r.yCol, 3, "Adjusted P Value preferred over plain P-Value");
  eq(r.labelCol, 0, "Symbol should match label patterns");
});

// ── pickTopLabels ─────────────────────────────────────────────────────────

suite("volcano helpers — pickTopLabels");

test("ranks by |log2FC| × -log10(p) and excludes ns / discarded points", () => {
  const points = [
    { idx: 0, log2fc: 5, p: 1e-10, label: "GeneA" }, // huge score, sig up
    { idx: 1, log2fc: -4, p: 1e-8, label: "GeneB" }, // big score, sig down
    { idx: 2, log2fc: 0.5, p: 1e-20, label: "GeneC" }, // huge -log10p but sub-mag → ns
    { idx: 3, log2fc: 1.5, p: 0.01, label: "GeneD" }, // moderate sig up
    { idx: 4, log2fc: 1.5, p: 0.5, label: "GeneE" }, // p too high → ns
    { idx: 5, log2fc: NaN, p: 1e-10, label: "GeneF" }, // discarded
  ];
  const top = pickTopLabels(points, 3, 1, 0.05, 1e-300);
  eq(top.length, 3, "should pick 3 even when more candidates exist");
  // Order by score desc.
  eq(top[0].idx, 0, "GeneA should be ranked 1st (highest |log2FC| × -log10p)");
  eq(top[1].idx, 1, "GeneB ranks 2nd");
  eq(top[2].idx, 3, "GeneD is the only remaining sig point → ranks 3rd");
});

test("excludes points without a label string", () => {
  const points = [
    { idx: 0, log2fc: 5, p: 1e-10, label: null }, // sig up but no label
    { idx: 1, log2fc: 4, p: 1e-8, label: "GeneB" },
  ];
  const top = pickTopLabels(points, 5, 1, 0.05, 1e-300);
  eq(top.length, 1, "null-label point should be skipped");
  eq(top[0].idx, 1);
});

test("respects n=0 (returns empty)", () => {
  const points = [{ idx: 0, log2fc: 5, p: 1e-10, label: "G" }];
  eq(pickTopLabels(points, 0, 1, 0.05, 1e-300).length, 0);
});

// ── layoutLabels ──────────────────────────────────────────────────────────

suite("volcano helpers — layoutLabels");

test("non-overlapping labels keep their preferred (above-right) anchor", () => {
  const inputs = [
    { pointPx: { x: 100, y: 200 }, text: "G1", charWidth: 6, lineHeight: 12 },
    { pointPx: { x: 300, y: 200 }, text: "G2", charWidth: 6, lineHeight: 12 },
  ];
  const placed = layoutLabels(inputs, 800, 400);
  eq(placed.length, 2);
  eq(placed[0].anchor, "above-right");
  eq(placed[1].anchor, "above-right");
  assert(!placed[0].forced, "should not force-place an isolated label");
});

test("colliding labels fall back to a non-overlapping anchor", () => {
  // Two points so close that anchor #1 collides → second label takes
  // anchor #2 (above-left) instead.
  const inputs = [
    { pointPx: { x: 100, y: 200 }, text: "GeneA", charWidth: 6, lineHeight: 12 },
    { pointPx: { x: 110, y: 200 }, text: "GeneB", charWidth: 6, lineHeight: 12 },
  ];
  const placed = layoutLabels(inputs, 800, 400);
  // First gets above-right; second cannot use above-right (overlaps), so
  // it picks one of the other anchors. The exact anchor is deterministic
  // — first non-colliding wins — but the contract is "non-overlapping
  // bbox" not "specific anchor". Assert the contract.
  let overlap = false;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i].bbox;
      const b = placed[j].bbox;
      if (!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) {
        overlap = true;
      }
    }
  }
  assert(!overlap, "placed labels should not overlap");
});

test("forced=true when no anchor fits inside plot bounds", () => {
  // Single point in a tiny plot → all four anchors are out of bounds.
  const inputs = [{ pointPx: { x: 5, y: 5 }, text: "Gene12345", charWidth: 6, lineHeight: 12 }];
  const placed = layoutLabels(inputs, 20, 20);
  eq(placed.length, 1);
  assert(placed[0].forced, "should be forced=true when no anchor fits");
});

// ── approxMonoCharWidth ───────────────────────────────────────────────────

suite("volcano helpers — approxMonoCharWidth");

test("returns 0.6 × fontSize", () => {
  eq(approxMonoCharWidth(10), 6);
  eq(approxMonoCharWidth(11), 6.6);
});

// ── default colours sanity ────────────────────────────────────────────────

suite("volcano helpers — default colour palette");

test("VOLCANO_DEFAULT_COLORS includes up / down / ns hex strings", () => {
  assert(/^#[0-9A-Fa-f]{6}$/.test(VOLCANO_DEFAULT_COLORS.up), "up should be hex");
  assert(/^#[0-9A-Fa-f]{6}$/.test(VOLCANO_DEFAULT_COLORS.down), "down should be hex");
  assert(/^#[0-9A-Fa-f]{6}$/.test(VOLCANO_DEFAULT_COLORS.ns), "ns should be hex");
  // Sanity: up != down != ns.
  assert(
    VOLCANO_DEFAULT_COLORS.up !== VOLCANO_DEFAULT_COLORS.down &&
      VOLCANO_DEFAULT_COLORS.up !== VOLCANO_DEFAULT_COLORS.ns &&
      VOLCANO_DEFAULT_COLORS.down !== VOLCANO_DEFAULT_COLORS.ns,
    "all three classes must have distinct colours"
  );
});

summary();

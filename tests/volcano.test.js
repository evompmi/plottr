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
  detectColorMapType,
  buildColorMap,
  buildSizeMap,
  interpolateColor,
  COLOR_PALETTES,
  PALETTE,
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
//
// New signature: separate up / down counts so a heavily-skewed dataset
// (e.g. 200 up-hits, 5 down-hits) doesn't crowd out the few rare hits
// in the smaller class.

suite("volcano helpers — pickTopLabels (independent up / down counts)");

test("respects independent nUp and nDown counts", () => {
  const points = [
    // 4 up-regulated, ranked by |log2FC| × −log10(p) — descending order:
    { idx: 0, log2fc: 5, p: 1e-10, label: "Up1" }, // score 50
    { idx: 1, log2fc: 3, p: 1e-8, label: "Up2" }, // score 24
    { idx: 2, log2fc: 2, p: 1e-5, label: "Up3" }, // score 10
    { idx: 3, log2fc: 1.5, p: 0.01, label: "Up4" }, // score ≈ 3
    // 3 down-regulated, ranked similarly:
    { idx: 4, log2fc: -4, p: 1e-8, label: "Dn1" }, // score 32
    { idx: 5, log2fc: -2, p: 1e-5, label: "Dn2" }, // score 10
    { idx: 6, log2fc: -1.5, p: 0.04, label: "Dn3" }, // score ≈ 2
    // ns / discarded distractors:
    { idx: 7, log2fc: 0.5, p: 1e-20, label: "Ns" }, // sub-mag → ns
    { idx: 8, log2fc: NaN, p: 1e-10, label: "Bad" }, // discarded
  ];
  const top = pickTopLabels(points, 2, 1, 1, 0.05, 1e-300);
  // Two up + one down = 3 entries total.
  eq(top.length, 3, "should pick exactly nUp + nDown valid points");
  // Up entries first (helper appends ups before downs).
  eq(top[0].idx, 0);
  eq(top[1].idx, 1);
  // Then the single picked down (rank 1 by score = -4 × 8 = 32).
  eq(top[2].idx, 4);
});

test("nUp=0 returns only down-regulated picks", () => {
  const points = [
    { idx: 0, log2fc: 5, p: 1e-10, label: "Up" },
    { idx: 1, log2fc: -3, p: 1e-8, label: "Down" },
  ];
  const top = pickTopLabels(points, 0, 5, 1, 0.05, 1e-300);
  eq(top.length, 1);
  eq(top[0].idx, 1);
  eq(top[0].cls, "down");
});

test("excludes points without a label string", () => {
  const points = [
    { idx: 0, log2fc: 5, p: 1e-10, label: null }, // sig up but no label → skipped
    { idx: 1, log2fc: 4, p: 1e-8, label: "GeneB" },
  ];
  const top = pickTopLabels(points, 5, 5, 1, 0.05, 1e-300);
  eq(top.length, 1);
  eq(top[0].idx, 1);
});

test("nUp=0 AND nDown=0 returns empty", () => {
  const points = [{ idx: 0, log2fc: 5, p: 1e-10, label: "G" }];
  eq(pickTopLabels(points, 0, 0, 1, 0.05, 1e-300).length, 0);
});

test("each picked entry carries its class", () => {
  const points = [
    { idx: 0, log2fc: 5, p: 1e-10, label: "Up" },
    { idx: 1, log2fc: -5, p: 1e-10, label: "Down" },
  ];
  const top = pickTopLabels(points, 1, 1, 1, 0.05, 1e-300);
  eq(top.length, 2);
  // Order is up-first then down-first.
  eq(top[0].cls, "up");
  eq(top[1].cls, "down");
});

// ── layoutLabels ──────────────────────────────────────────────────────────
//
// New signature: layoutLabels(inputs, obstacles, bounds). `bounds` is a
// rect — typically larger than the inner data plot so labels can spill
// into the chart's chrome margin where there are no data points to
// collide with. Each input now also carries `ringRadius` so the leader
// can start at the *outer* selection ring (not the dot itself), and
// `leaderEnd` is anchored at the bbox edge nearest the source (not the
// centre) for clean "bracket" attachment.
//
// Five invariants are enforced (any one failing → try a different
// angle, or fall back forced=true if none satisfy all):
//   1. bbox stays inside `bounds`
//   2. bbox doesn't overlap any already-placed label
//   3. bbox doesn't enclose any data point
//   4. leader doesn't cross any other data point
//   5. leader doesn't cross any already-placed leader

suite("volcano helpers — layoutLabels (leader-line collision avoid)");

function bigBounds() {
  return { x: -100, y: -100, w: 1000, h: 700 };
}

function makeInput(pointPx, text, opts) {
  return {
    pointPx,
    text,
    charWidth: 6,
    lineHeight: 12,
    pointRadius: 3,
    ringRadius: 4.5,
    ...(opts || {}),
  };
}

function noPairwiseBboxOverlap(placed) {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i].bbox;
      const b = placed[j].bbox;
      if (!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) {
        return false;
      }
    }
  }
  return true;
}

function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  const d1x = ax2 - ax1,
    d1y = ay2 - ay1;
  const d2x = bx2 - bx1,
    d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const dx = bx1 - ax1,
    dy = by1 - ay1;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

test("isolated label gets a leader anchored at the ring edge", () => {
  const inputs = [makeInput({ x: 400, y: 250 }, "Gene1")];
  const placed = layoutLabels(inputs, [], bigBounds());
  eq(placed.length, 1);
  assert(!placed[0].forced, "isolated label should not be forced");
  // Leader starts on the ring (radius 4.5), not the dot centre.
  const ls = placed[0].leaderStart;
  const dist = Math.hypot(ls.x - 400, ls.y - 250);
  assert(Math.abs(dist - 4.5) < 0.01, "leaderStart should sit on the ring (dist=" + dist + ")");
});

test("leader anchors at the bbox edge nearest the source, not the centre", () => {
  // Force a side-of-text anchor by blocking the upward angles. Two
  // obstacles directly above and a third up-right ensure the chosen
  // angle is to the side of the source.
  const inputs = [makeInput({ x: 200, y: 300 }, "Hit")];
  const obstacles = [
    { x: 200, y: 280, r: 5 }, // blocks 12 o'clock
    { x: 220, y: 285, r: 5 }, // blocks 1 / 2 o'clock
    { x: 180, y: 285, r: 5 }, // blocks 10 / 11 o'clock
  ];
  const placed = layoutLabels(inputs, obstacles, bigBounds());
  const lab = placed[0];
  // The label sits on one side of the source. The leader endpoint
  // should land on the bbox edge closest to the source — i.e. exactly
  // ON one of the bbox's borders, not at the bbox centre.
  const onLeftEdge = Math.abs(lab.leaderEnd.x - lab.bbox.x) < 1;
  const onRightEdge = Math.abs(lab.leaderEnd.x - (lab.bbox.x + lab.bbox.w)) < 1;
  const onTopEdge = Math.abs(lab.leaderEnd.y - lab.bbox.y) < 1;
  const onBottomEdge = Math.abs(lab.leaderEnd.y - (lab.bbox.y + lab.bbox.h)) < 1;
  assert(
    onLeftEdge || onRightEdge || onTopEdge || onBottomEdge,
    "leaderEnd should land on a bbox edge, got " +
      JSON.stringify(lab.leaderEnd) +
      " bbox=" +
      JSON.stringify(lab.bbox)
  );
});

test("colliding labels fall back to a non-overlapping angle", () => {
  const inputs = [makeInput({ x: 200, y: 300 }, "GeneA"), makeInput({ x: 210, y: 300 }, "GeneB")];
  const placed = layoutLabels(inputs, [], bigBounds());
  eq(placed.length, 2);
  assert(noPairwiseBboxOverlap(placed), "label bboxes must not overlap");
});

test("leader line routes around an obstacle data point", () => {
  const inputs = [makeInput({ x: 200, y: 300 }, "Hit")];
  const obstacles = [{ x: 200, y: 280, r: 4 }];
  const placed = layoutLabels(inputs, obstacles, bigBounds());
  eq(placed.length, 1);
  assert(!placed[0].forced, "a clear angle should be available");
  const ls = placed[0].leaderStart;
  const le = placed[0].leaderEnd;
  const dx = le.x - ls.x,
    dy = le.y - ls.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 < 1e-9 ? 0 : ((200 - ls.x) * dx + (280 - ls.y) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = ls.x + t * dx,
    py = ls.y + t * dy;
  const dist = Math.hypot(200 - px, 280 - py);
  assert(dist > 4, "leader must clear the obstacle (got dist=" + dist.toFixed(2) + ")");
});

test("text bbox never encloses a data point", () => {
  // Source at (300, 300) with a dense cluster of obstacles in the
  // region where labels would normally land. Force the layout to pick
  // an angle whose bbox is point-free.
  const inputs = [makeInput({ x: 300, y: 300 }, "Mark")];
  const obstacles = [];
  // Pack obstacles in a ring around the source so most candidate bboxes
  // would have a point inside. Leave a clear gap straight up.
  const angles = [-60, -30, 0, 30, 60, 90, 120, 150, 180, -150, -120];
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    obstacles.push({ x: 300 + 38 * Math.cos(rad), y: 300 + 38 * Math.sin(rad), r: 3 });
  }
  const placed = layoutLabels(inputs, obstacles, bigBounds());
  // Whatever angle was chosen, no obstacle should sit inside the
  // resulting bbox (with the constraint pad).
  for (const obs of obstacles) {
    const inside =
      obs.x >= placed[0].bbox.x - 1 &&
      obs.x <= placed[0].bbox.x + placed[0].bbox.w + 1 &&
      obs.y >= placed[0].bbox.y - 1 &&
      obs.y <= placed[0].bbox.y + placed[0].bbox.h + 1;
    assert(
      !inside,
      "obstacle " + JSON.stringify(obs) + " ended up inside bbox " + JSON.stringify(placed[0].bbox)
    );
  }
});

test("placed leaders never cross each other", () => {
  // Two close-by sources whose 12-o'clock leaders would cross — the
  // second label must pick an angle whose leader doesn't intersect
  // the first.
  const inputs = [makeInput({ x: 200, y: 300 }, "GeneA"), makeInput({ x: 230, y: 300 }, "GeneB")];
  const placed = layoutLabels(inputs, [], bigBounds());
  eq(placed.length, 2);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      assert(
        !segmentsIntersect(
          a.leaderStart.x,
          a.leaderStart.y,
          a.leaderEnd.x,
          a.leaderEnd.y,
          b.leaderStart.x,
          b.leaderStart.y,
          b.leaderEnd.x,
          b.leaderEnd.y
        ),
        "leaders for " + a.text + " and " + b.text + " should not cross"
      );
    }
  }
});

test("labels can spill into a margin (negative bounds origin)", () => {
  // Source near the top of the inner plot. Without a margin extension
  // the 12-o'clock candidate would fail (label bbox would have y < 0).
  // With a negative-origin bounds, the layout accepts it.
  const inputs = [makeInput({ x: 200, y: 8 }, "Gene1")];
  const tightBounds = { x: 0, y: 0, w: 400, h: 200 };
  const tightPlaced = layoutLabels(inputs, [], tightBounds);
  // With tight bounds, 12-o'clock fails (label would be at y ≈ -25);
  // the layout has to pick a downward angle or fall back to forced.
  const tightLab = tightPlaced[0];
  if (!tightLab.forced) {
    assert(
      tightLab.bbox.y >= 0 && tightLab.bbox.y + tightLab.bbox.h <= 200,
      "with tight bounds, label must stay inside"
    );
  }
  // With a wider bounds extending into the margin, the same source
  // can land its label above the inner plot (negative y).
  const widePlaced = layoutLabels(inputs, [], { x: -50, y: -50, w: 500, h: 300 });
  const wideLab = widePlaced[0];
  assert(!wideLab.forced, "wider bounds should let the label fit");
  assert(wideLab.bbox.y < 0, "label is allowed to sit in the negative-y margin region");
});

test("forced=true when no candidate angle fits inside very tight bounds", () => {
  const inputs = [makeInput({ x: 5, y: 5 }, "Gene12345")];
  const placed = layoutLabels(inputs, [], { x: 0, y: 0, w: 20, h: 20 });
  eq(placed.length, 1);
  assert(placed[0].forced, "no candidate fits — should be forced");
});

test("source point itself is never treated as an obstacle", () => {
  const inputs = [makeInput({ x: 400, y: 250 }, "Self")];
  const obstacles = [{ x: 400, y: 250, r: 3 }];
  const placed = layoutLabels(inputs, obstacles, bigBounds());
  eq(placed.length, 1);
  assert(!placed[0].forced, "source-coincident obstacle must be ignored");
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

// ── Aesthetic mapping (colour / size by column) ───────────────────────────
//
// detectColorMapType: numeric > 80 % AND > 12 unique values → continuous;
// otherwise discrete. Mirrors scatter's auto-mode behaviour.

suite("volcano helpers — detectColorMapType");

test("low-cardinality numeric column is treated as discrete", () => {
  // 3 unique values, 100 % numeric → discrete (typical for a "cluster"
  // or "replicate" column where the user wants distinct colours per id).
  const rawData = [];
  for (let i = 0; i < 30; i++) rawData.push(["A", String((i % 3) + 1)]);
  eq(detectColorMapType(rawData, 1), "discrete", "≤ 12 unique → discrete");
});

test("high-cardinality numeric column is treated as continuous", () => {
  const rawData = [];
  for (let i = 0; i < 30; i++) rawData.push(["A", String(Math.random() * 100)]);
  eq(detectColorMapType(rawData, 1), "continuous");
});

test("mostly-text column is treated as discrete even with high cardinality", () => {
  const rawData = [];
  for (let i = 0; i < 30; i++) rawData.push([`gene_${i}`, "x"]);
  eq(detectColorMapType(rawData, 0), "discrete", "non-numeric → discrete");
});

test("col=-1 returns discrete (defensive default)", () => {
  eq(detectColorMapType([["a"]], -1), "discrete");
});

suite("volcano helpers — buildColorMap");

test("discrete mapping assigns palette colours in first-seen order", () => {
  const rawData = [["red"], ["blue"], ["red"], ["green"]];
  const cm = buildColorMap({
    rawData,
    pointIndices: [0, 1, 2, 3],
    col: 0,
    paletteStops: COLOR_PALETTES.viridis,
    paletteName: "viridis",
    discretePalette: PALETTE,
    interpolate: interpolateColor,
  });
  assert(cm != null && cm.type === "discrete", "should detect discrete");
  if (cm && cm.type === "discrete") {
    eq(cm.legend.length, 3);
    eq(cm.legend[0].value, "red");
    eq(cm.legend[1].value, "blue");
    eq(cm.legend[2].value, "green");
    // Same value → same colour.
    eq(cm.colorByIdx.get(0), cm.colorByIdx.get(2), "two `red` rows share colour");
  }
});

test("continuous mapping spans vmin..vmax across the palette", () => {
  const rawData = [];
  // 20 rows, values 0..19 — high enough cardinality to clear the 12 threshold.
  for (let i = 0; i < 20; i++) rawData.push([String(i)]);
  const cm = buildColorMap({
    rawData,
    pointIndices: rawData.map((_, i) => i),
    col: 0,
    paletteStops: COLOR_PALETTES.viridis,
    paletteName: "viridis",
    discretePalette: PALETTE,
    interpolate: interpolateColor,
  });
  assert(cm != null && cm.type === "continuous", "should detect continuous");
  if (cm && cm.type === "continuous") {
    eq(cm.vmin, 0);
    eq(cm.vmax, 19);
    // First and last rows get distinct colours; middle row's colour
    // lives between them.
    assert(cm.colorByIdx.get(0) !== cm.colorByIdx.get(19), "endpoints should differ");
    eq(cm.paletteName, "viridis");
    // The post-inversion palette stops travel back with the result so
    // the chart's SVG legend can re-render the gradient without
    // reaching for the global palette table.
    assert(Array.isArray(cm.paletteStops) && cm.paletteStops.length > 0, "paletteStops populated");
  }
});

test("col=-1 returns null (mapping disabled)", () => {
  const cm = buildColorMap({
    rawData: [["x"]],
    pointIndices: [0],
    col: -1,
    paletteStops: COLOR_PALETTES.viridis,
    paletteName: "viridis",
    discretePalette: PALETTE,
    interpolate: interpolateColor,
  });
  eq(cm, null);
});

test("sig-only pointIndices: legend reflects only the picked rows", () => {
  // Volcano caller passes only sig-feature indices (not ns ones), so
  // the discrete legend should be limited to values present in those
  // rows. NS rows in the same column are invisible to the mapping.
  const rawData = [
    ["chrom1"], // 0 — sig
    ["chrom2"], // 1 — ns (filtered out by caller)
    ["chrom3"], // 2 — sig
    ["chrom2"], // 3 — ns (filtered out)
  ];
  const cm = buildColorMap({
    rawData,
    pointIndices: [0, 2], // ← only sig points
    col: 0,
    paletteStops: COLOR_PALETTES.viridis,
    paletteName: "viridis",
    discretePalette: PALETTE,
    interpolate: interpolateColor,
  });
  assert(cm != null && cm.type === "discrete");
  if (cm && cm.type === "discrete") {
    eq(cm.legend.length, 2, "legend should contain only chrom1 + chrom3");
    eq(cm.legend[0].value, "chrom1");
    eq(cm.legend[1].value, "chrom3");
    // No colour entries for the ns indices.
    eq(cm.colorByIdx.has(1), false);
    eq(cm.colorByIdx.has(3), false);
  }
});

test("type detection respects the pointIndices subset", () => {
  // Column has 20 unique numeric values overall (continuous), but the
  // sig subset is just 5 values — should detect as discrete since the
  // small subset doesn't clear the > 12 unique threshold.
  const rawData = [];
  for (let i = 0; i < 20; i++) rawData.push([String(i)]);
  // All rows: continuous
  eq(detectColorMapType(rawData, 0), "continuous");
  // Sig subset of 5: discrete
  eq(detectColorMapType(rawData, 0, [0, 1, 2, 3, 4]), "discrete");
});

suite("volcano helpers — buildSizeMap");

test("scales values linearly between minR and maxR", () => {
  const rawData = [["1"], ["5"], ["9"]]; // min=1, max=9 → t = 0, 0.5, 1
  const m = buildSizeMap(rawData, [0, 1, 2], 0, /* minR */ 2, /* maxR */ 8);
  assert(m != null);
  eq(m.byIdx.get(0), 2);
  eq(m.byIdx.get(1), 5);
  eq(m.byIdx.get(2), 8);
  eq(m.vmin, 1);
  eq(m.vmax, 9);
  eq(m.minR, 2);
  eq(m.maxR, 8);
});

test("non-numeric values are skipped (no entry in the result map)", () => {
  const rawData = [["1"], ["nope"], ["9"]];
  const m = buildSizeMap(rawData, [0, 1, 2], 0, 2, 8);
  assert(m != null);
  eq(m.byIdx.has(1), false, "non-numeric row should have no radius entry");
});

test("col=-1 or all-non-numeric returns null", () => {
  eq(buildSizeMap([["x"]], [0], -1, 2, 8), null);
  eq(buildSizeMap([["x"]], [0], 0, 2, 8), null);
});

test("degenerate range (vmin === vmax) maps every row to (minR + maxR)/2", () => {
  const rawData = [["3"], ["3"], ["3"]];
  const m = buildSizeMap(rawData, [0, 1, 2], 0, 2, 8);
  assert(m != null);
  for (const v of m.byIdx.values()) eq(v, 5);
  eq(m.vmin, 3);
  eq(m.vmax, 3);
});

summary();

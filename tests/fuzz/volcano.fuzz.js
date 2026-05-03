// Fuzz harness for the Volcano pipeline.
//
// Drives the pure helpers end-to-end: feature row → classify → summarize
// → pickTopLabels → layoutLabels. Each iteration generates a synthetic
// dataset with a deliberate mix of "nice" rows (finite log2FC, well-
// behaved p-value) and pathological rows (NaN, Inf, p=0, p ≈ 1, label
// strings with control chars) so the helpers see the same shapes a real
// hostile / malformed dataset might throw.
//
// Invariants asserted:
//   - classifyPoint never throws and always returns "up" | "down" | "ns"
//   - summarize.up + .down + .ns + .discarded == total points
//   - up + down + ns == .total (exclusively counts valid points)
//   - pickTopLabels never throws and never includes more than n indices
//   - pickTopLabels output indices are unique
//   - layoutLabels output length == input length
//   - layoutLabels never crashes on degenerate plot dimensions
//   - negLog10P is always finite (never returns Inf)
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations per loop (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  classifyPoint,
  computePFloor,
  negLog10P,
  countClamped,
  summarize,
  pickTopLabels,
  layoutLabels,
  approxMonoCharWidth,
} = require("../helpers/volcano-loader");
const { makeRng } = require("./generators");

const SEED = parseInt(process.env.FUZZ_SEED || "1", 10);
const N = parseInt(process.env.FUZZ_N || "1000", 10);
const QUIET = !!process.env.FUZZ_QUIET;

const failures = [];

function recordFailure(seed, iter, stage, err, ctx) {
  failures.push({
    seed,
    iter,
    stage,
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : "",
    ctx: ctx || "",
  });
}

// ── Synthetic dataset generators ──────────────────────────────────────

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

function pickFrom(rng, pool) {
  return pool[Math.floor(rng() * pool.length)];
}

// Mix of "normal" feature rows and pathological ones. Returns a
// VolcanoPoint[] suitable for feeding into the helpers under test.
function genDataset(rng) {
  const n = 20 + Math.floor(rng() * 200); // 20..220 features
  const points = [];
  for (let i = 0; i < n; i++) {
    let log2fc, p, label;
    const r = rng();
    if (r < 0.7) {
      // Normal: log2FC in [-6, +6], p in [1e-15, 1].
      log2fc = (rng() - 0.5) * 12;
      const exp = -Math.floor(rng() * 15);
      p = Math.pow(10, exp) * (0.1 + rng() * 0.9);
    } else if (r < 0.8) {
      // Strong up: log2FC > 1, p < 0.01.
      log2fc = 1.2 + rng() * 5;
      p = Math.pow(10, -2 - rng() * 12);
    } else if (r < 0.9) {
      // Strong down: log2FC < -1, p < 0.01.
      log2fc = -(1.2 + rng() * 5);
      p = Math.pow(10, -2 - rng() * 12);
    } else if (r < 0.93) {
      // p = 0 — should be clamped, not crash.
      log2fc = (rng() - 0.5) * 4;
      p = 0;
    } else if (r < 0.96) {
      // NaN log2FC.
      log2fc = NaN;
      p = rng();
    } else if (r < 0.98) {
      // Inf log2FC or NaN p.
      log2fc = rng() < 0.5 ? Infinity : -Infinity;
      p = NaN;
    } else {
      // p > 1 (degenerate / malformed input).
      log2fc = rng() * 4;
      p = 1 + rng();
    }
    label = pickFrom(rng, HOSTILE_LABELS);
    points.push({ idx: i, log2fc, p, label });
  }
  return points;
}

// ── One iteration ─────────────────────────────────────────────────────

function runOne(seed, iter) {
  const rng = makeRng(seed);
  const points = genDataset(rng);
  const fcCutoff = 0.5 + rng() * 2;
  const pCutoff = 0.001 + rng() * 0.1;

  // classifyPoint
  for (const pt of points) {
    let cls;
    try {
      cls = classifyPoint(pt.log2fc, pt.p, fcCutoff, pCutoff);
    } catch (err) {
      recordFailure(seed, iter, "classifyPoint", err, JSON.stringify(pt));
      return;
    }
    if (cls !== "up" && cls !== "down" && cls !== "ns") {
      recordFailure(
        seed,
        iter,
        "classifyPoint",
        new Error("class is not one of up/down/ns: " + JSON.stringify(cls)),
        JSON.stringify(pt)
      );
      return;
    }
  }

  // computePFloor + negLog10P
  let pFloor;
  try {
    pFloor = computePFloor(points);
  } catch (err) {
    recordFailure(seed, iter, "computePFloor", err);
    return;
  }
  if (!Number.isFinite(pFloor) || pFloor <= 0) {
    recordFailure(seed, iter, "computePFloor", new Error("pFloor not positive finite: " + pFloor));
    return;
  }
  for (const pt of points) {
    const nl = negLog10P(pt.p, pFloor);
    if (!Number.isFinite(nl)) {
      recordFailure(
        seed,
        iter,
        "negLog10P",
        new Error("non-finite -log10(p): " + nl + " for p=" + pt.p)
      );
      return;
    }
  }

  // summarize: up + down + ns + discarded must equal total point count.
  let summary;
  try {
    summary = summarize(points, fcCutoff, pCutoff);
  } catch (err) {
    recordFailure(seed, iter, "summarize", err);
    return;
  }
  if (summary.up + summary.down + summary.ns !== summary.total) {
    recordFailure(
      seed,
      iter,
      "summarize",
      new Error("components don't sum to total: " + JSON.stringify(summary))
    );
    return;
  }
  if (summary.total + summary.discarded !== points.length) {
    recordFailure(
      seed,
      iter,
      "summarize",
      new Error(
        "total+discarded != input length: " + JSON.stringify(summary) + " vs " + points.length
      )
    );
    return;
  }

  // countClamped should never exceed total input.
  let clamped;
  try {
    clamped = countClamped(points);
  } catch (err) {
    recordFailure(seed, iter, "countClamped", err);
    return;
  }
  if (clamped < 0 || clamped > points.length) {
    recordFailure(seed, iter, "countClamped", new Error("clamped count out of range: " + clamped));
    return;
  }

  // pickTopLabels: requested n is ≤ total, output ≤ n, unique indices,
  // never includes ns / discarded points.
  const requestedN = Math.floor(rng() * 25);
  let top;
  try {
    top = pickTopLabels(points, requestedN, fcCutoff, pCutoff, pFloor);
  } catch (err) {
    recordFailure(seed, iter, "pickTopLabels", err);
    return;
  }
  if (top.length > requestedN) {
    recordFailure(
      seed,
      iter,
      "pickTopLabels",
      new Error("returned more than n: " + top.length + " > " + requestedN)
    );
    return;
  }
  const seenIdx = new Set();
  for (const e of top) {
    if (seenIdx.has(e.idx)) {
      recordFailure(seed, iter, "pickTopLabels", new Error("duplicate idx: " + e.idx));
      return;
    }
    seenIdx.add(e.idx);
    const cls = classifyPoint(points[e.idx].log2fc, points[e.idx].p, fcCutoff, pCutoff);
    if (cls === "ns") {
      recordFailure(
        seed,
        iter,
        "pickTopLabels",
        new Error("ns point in top-N: idx=" + e.idx + " " + JSON.stringify(points[e.idx]))
      );
      return;
    }
  }

  // layoutLabels: handle degenerate plot dims (zero / negative w / h)
  // gracefully. Output length must match input length.
  const charW = approxMonoCharWidth(11);
  const inputs = top.slice(0, 12).map((e, i) => ({
    pointPx: { x: rng() * 800, y: rng() * 500 },
    text: String(points[e.idx].label || "F" + i),
    charWidth: charW,
    lineHeight: 13,
  }));
  const plotW = rng() < 0.05 ? 0 : 200 + rng() * 800;
  const plotH = rng() < 0.05 ? 0 : 100 + rng() * 500;
  let placed;
  try {
    placed = layoutLabels(inputs, plotW, plotH);
  } catch (err) {
    recordFailure(seed, iter, "layoutLabels", err);
    return;
  }
  if (placed.length !== inputs.length) {
    recordFailure(
      seed,
      iter,
      "layoutLabels",
      new Error("output length " + placed.length + " != input " + inputs.length)
    );
    return;
  }
}

function main() {
  console.log(`\n── volcano fuzz — seed=${SEED} n=${N} ──`);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const iterSeed = (SEED * 2654435761 + i) >>> 0 || 1;
    runOne(iterSeed, i);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} • ${failures.length} failures\r`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`\n  ${N - failures.length}/${N} iterations clean · ${dt}s`);
  if (failures.length === 0) {
    console.log("  no crashes.\n");
    return;
  }
  console.log(`\n  ${failures.length} failure(s).`);
  const maxDetail = Math.min(failures.length, 5);
  for (let i = 0; i < maxDetail; i++) {
    const f = failures[i];
    console.log(`\n  [${i + 1}] seed=${f.seed} iter=${f.iter} stage=${f.stage}`);
    console.log(`      ${f.message}`);
    if (f.ctx) console.log(`      ctx: ${f.ctx}`);
    if (f.stack) {
      console.log(
        f.stack
          .split("\n")
          .map((l) => "      " + l)
          .join("\n")
      );
    }
  }
  console.log();
  process.exit(1);
}

main();

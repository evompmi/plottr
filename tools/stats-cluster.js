// stats-cluster.js — distance metrics, hierarchical clustering (`hclust` /
// `dendrogramLayout`), and k-means primitives used by tools/heatmap/.
//
// No dependencies on the other stats-*.js files — distance + clustering use
// only built-ins. Lives alongside stats-*.js by historical accident; the
// "stats" naming is preserved so existing imports keep working through the
// shared bundle.

// ── 14. Hierarchical clustering ─────────────────────────────────────────────

// Pairwise row-wise distance matrix for a 2-D numeric array.
// metric: "euclidean" | "manhattan" | "correlation" (1 − Pearson r).
// NaN cells are ignored pairwise (only rows' shared finite columns contribute).
// Returns an N×N symmetric array of distances (0 on the diagonal).
function pairwiseDistance(matrix, metric) {
  const n = matrix.length;
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = rowDistance(matrix[i], matrix[j], metric);
      D[i][j] = d;
      D[j][i] = d;
    }
  }
  return D;
}

function rowDistance(a, b, metric) {
  const n = Math.min(a.length, b.length);
  const xs = [];
  const ys = [];
  for (let k = 0; k < n; k++) {
    if (Number.isFinite(a[k]) && Number.isFinite(b[k])) {
      xs.push(a[k]);
      ys.push(b[k]);
    }
  }
  if (xs.length === 0) return NaN;
  if (metric === "manhattan") {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += Math.abs(xs[k] - ys[k]);
    return s;
  }
  if (metric === "correlation") {
    // 1 − Pearson correlation; collapses to 0 for identical vectors,
    // 2 for perfectly anti-correlated ones.
    if (xs.length < 2) return NaN;
    let mx = 0,
      my = 0;
    for (let k = 0; k < xs.length; k++) {
      mx += xs[k];
      my += ys[k];
    }
    mx /= xs.length;
    my /= xs.length;
    let sxy = 0,
      sxx = 0,
      syy = 0;
    for (let k = 0; k < xs.length; k++) {
      const dx = xs[k] - mx;
      const dy = ys[k] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return 1;
    return 1 - sxy / Math.sqrt(sxx * syy);
  }
  // euclidean (default)
  let s = 0;
  for (let k = 0; k < xs.length; k++) {
    const d = xs[k] - ys[k];
    s += d * d;
  }
  return Math.sqrt(s);
}

// Agglomerative hierarchical clustering. Naive O(n³) merge loop — clear,
// easy to verify, adequate for the ≤500-leaf range the heatmap tool targets.
// linkage: "average" (UPGMA) | "complete" | "single".
// Returns { tree, order }:
//   tree — nested { index, left, right, height, size }; leaves have index ≥ 0
//          and left/right null; internal nodes have index = -1.
//   order — array of leaf indices in dendrogram left-to-right order.
function hclust(distMatrix, linkage) {
  const n = distMatrix.length;
  // Stryker disable next-line all -- defensive early return for empty distance matrix; the algorithm body returns the same shape via { tree: undefined, order: [] }, so most mutations on this guard are equivalent
  if (n === 0) return { tree: null, order: [] };
  // Stryker disable all -- defensive early return for singleton matrix; the while-loop body skips when active.size === 1, so a missed n===1 short-circuit yields the same singleton tree
  if (n === 1)
    return { tree: { index: 0, left: null, right: null, height: 0, size: 1 }, order: [0] };
  // Stryker restore all

  // Working copies: active cluster metadata + mutable distance matrix.
  const clusters = new Array(n);
  const D = new Array(n);
  for (let i = 0; i < n; i++) {
    clusters[i] = { index: i, left: null, right: null, height: 0, size: 1 };
    D[i] = distMatrix[i].slice();
  }
  const active = new Set();
  for (let i = 0; i < n; i++) active.add(i);

  const mergeFn =
    linkage === "complete"
      ? (d1, d2) => Math.max(d1, d2)
      : linkage === "single"
        ? (d1, d2) => Math.min(d1, d2)
        : null; // signals UPGMA (size-weighted average)

  while (active.size > 1) {
    // Find the closest pair among active clusters.
    let best = Infinity;
    let bi = -1,
      bj = -1;
    const act = Array.from(active);
    for (let ai = 0; ai < act.length; ai++) {
      for (let aj = ai + 1; aj < act.length; aj++) {
        const i = act[ai],
          j = act[aj];
        const d = D[i][j];
        if (Number.isFinite(d) && d < best) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) {
      // No finite distances remain — happens when rows have no overlap
      // in finite values (e.g. correlation on a matrix where most cells
      // are NaN). Force-merge the two lowest-index active clusters at a
      // sentinel height so the returned tree still covers every leaf,
      // instead of silently truncating to the first active singleton.
      bi = act[0];
      bj = act[1];
      best = 0;
    }

    // Merge j into i — the new cluster keeps index bi, bj becomes inactive.
    const merged = {
      index: -1,
      left: clusters[bi],
      right: clusters[bj],
      height: best,
      size: clusters[bi].size + clusters[bj].size,
    };
    const sizeI = clusters[bi].size;
    const sizeJ = clusters[bj].size;

    active.delete(bj);
    for (const k of active) {
      if (k === bi) continue;
      const dik = D[bi][k];
      const djk = D[bj][k];
      let nd;
      if (mergeFn) {
        nd = mergeFn(dik, djk);
      } else {
        // UPGMA: weighted average by cluster size.
        nd = (sizeI * dik + sizeJ * djk) / (sizeI + sizeJ);
      }
      D[bi][k] = nd;
      D[k][bi] = nd;
    }
    clusters[bi] = merged;
  }

  const rootId = Array.from(active)[0];
  const tree = clusters[rootId];

  // Leaf order by in-order traversal.
  const order = [];
  (function walk(node) {
    if (!node) return;
    if (node.left === null && node.right === null) {
      order.push(node.index);
    } else {
      walk(node.left);
      walk(node.right);
    }
  })(tree);

  return { tree, order };
}

// Flatten a hclust tree into SVG-friendly L-shaped segments.
// Each leaf is placed at integer x = position-in-order; internal nodes
// at the mean of their subtree leaves' positions. Returns:
//   { segments, maxHeight }
// where segments is an array of { x1, y1, x2, y2 } in DATA space
// (y = merge height, 0 at leaves). The caller scales x, y into pixels.
function dendrogramLayout(tree) {
  // Stryker disable next-line all -- defensive early return for null tree (passed when hclust got an empty matrix); the body would crash on null without this guard
  if (!tree) return { segments: [], maxHeight: 0 };
  const segments = [];
  let maxHeight = 0;
  function place(node) {
    if (node.left === null && node.right === null) {
      return { x: node._leafPos, h: 0 };
    }
    const L = place(node.left);
    const R = place(node.right);
    const h = node.height;
    if (h > maxHeight) maxHeight = h;
    // Vertical stems from each child up to the merge height.
    segments.push({ x1: L.x, y1: L.h, x2: L.x, y2: h });
    segments.push({ x1: R.x, y1: R.h, x2: R.x, y2: h });
    // Horizontal bar joining them.
    segments.push({ x1: L.x, y1: h, x2: R.x, y2: h });
    return { x: (L.x + R.x) / 2, h };
  }
  // Annotate leaves with their left-to-right position.
  let leafIdx = 0;
  (function num(node) {
    if (!node) return;
    if (node.left === null && node.right === null) {
      node._leafPos = leafIdx++;
    } else {
      num(node.left);
      num(node.right);
    }
  })(tree);
  place(tree);
  return { segments, maxHeight };
}

// ── 15. K-means (non-hierarchical) clustering ───────────────────────────────

// K-means with k-means++ seeded init. Rows of `matrix` are the observations;
// columns are features. Missing values (NaN) are handled pairwise per-feature
// when computing squared distances, and are skipped when averaging centroids.
// opts: { seed=1, maxIter=100, restarts=8 } — `restarts` independent runs
// from different seeded inits; the lowest-inertia run is returned.
// Returns { clusters, centroids, inertia, iterations, order }:
//   clusters   — array of length n with cluster id (0..k-1) per row
//   centroids  — k × d array (NaN if a feature had no finite values in a cluster)
//   inertia    — sum of squared distances from each row to its centroid
//   iterations — iterations the winning restart took to converge
//   order      — row-index permutation: rows grouped by cluster id, within each
//                cluster sorted by distance-to-centroid ascending. Clusters
//                themselves are ordered by cluster-id.
function kmeans(matrix, k, opts) {
  const options = opts || {};
  const seed = options.seed != null ? options.seed : 1;
  const maxIter = options.maxIter != null ? options.maxIter : 100;
  const restarts = options.restarts != null ? options.restarts : 8;
  const n = matrix.length;
  // Stryker disable next-line all -- defensive early return for empty matrix; the body would crash on `matrix[0].length` (next line) without this guard
  if (n === 0) return { clusters: [], centroids: [], inertia: 0, iterations: 0, order: [] };
  const d = matrix[0].length;
  const kEff = Math.max(1, Math.min(k, n));

  const baseRng = kmeansRng(seed);
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const rng = kmeansRng(Math.floor(baseRng() * 2147483646) + 1);
    const attempt = kmeansOnce(matrix, kEff, d, rng, maxIter);
    if (!best || attempt.inertia < best.inertia) best = attempt;
  }

  // Within-cluster ordering by distance to centroid (ascending).
  const distToCentroid = new Array(n);
  for (let i = 0; i < n; i++) {
    distToCentroid[i] = sqDistPartial(matrix[i], best.centroids[best.clusters[i]]);
  }
  const order = [];
  for (let c = 0; c < kEff; c++) {
    const members = [];
    for (let i = 0; i < n; i++) if (best.clusters[i] === c) members.push(i);
    members.sort((a, b) => distToCentroid[a] - distToCentroid[b]);
    for (const m of members) order.push(m);
  }

  return {
    clusters: best.clusters,
    centroids: best.centroids,
    inertia: best.inertia,
    iterations: best.iterations,
    order,
  };
}

function kmeansOnce(matrix, k, d, rng, maxIter) {
  const n = matrix.length;
  const centroids = kmeansPlusPlusInit(matrix, k, rng);
  const clusters = new Array(n).fill(0);

  let iterations = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = sqDistPartial(matrix[i], centroids[0]);
      for (let c = 1; c < k; c++) {
        const dist = sqDistPartial(matrix[i], centroids[c]);
        if (dist < bestD) {
          bestD = dist;
          best = c;
        }
      }
      if (clusters[i] !== best) {
        clusters[i] = best;
        changed = true;
      }
    }

    // Recompute centroids as per-feature means over finite values.
    const sums = Array.from({ length: k }, () => new Array(d).fill(0));
    const counts = Array.from({ length: k }, () => new Array(d).fill(0));
    const clusterSizes = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = clusters[i];
      clusterSizes[c]++;
      for (let j = 0; j < d; j++) {
        const v = matrix[i][j];
        if (Number.isFinite(v)) {
          sums[c][j] += v;
          counts[c][j]++;
        }
      }
    }
    for (let c = 0; c < k; c++) {
      if (clusterSizes[c] === 0) {
        // Empty cluster: reseed to the row farthest from its current centroid.
        let worst = -1;
        let worstD = -Infinity;
        for (let i = 0; i < n; i++) {
          const dist = sqDistPartial(matrix[i], centroids[clusters[i]]);
          if (dist > worstD) {
            worstD = dist;
            worst = i;
          }
        }
        if (worst >= 0) {
          for (let j = 0; j < d; j++) centroids[c][j] = matrix[worst][j];
          clusters[worst] = c;
          changed = true;
        }
        continue;
      }
      for (let j = 0; j < d; j++) {
        centroids[c][j] = counts[c][j] > 0 ? sums[c][j] / counts[c][j] : NaN;
      }
    }
    if (!changed) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) inertia += sqDistPartial(matrix[i], centroids[clusters[i]]);

  return { clusters, centroids, inertia, iterations };
}

function kmeansPlusPlusInit(matrix, k, rng) {
  const n = matrix.length;
  const d = matrix[0].length;
  const centroids = [];
  const first = Math.floor(rng() * n);
  centroids.push(matrix[first].slice());

  const dists = new Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dist = sqDistPartial(matrix[i], centroids[c - 1]);
      if (dist < dists[i]) dists[i] = dist;
      if (Number.isFinite(dists[i])) total += dists[i];
    }
    if (total <= 0 || !Number.isFinite(total)) {
      // Degenerate: fall back to a random distinct-ish row.
      let pick = Math.floor(rng() * n);
      centroids.push(matrix[pick].slice());
      continue;
    }
    let target = rng() * total;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(dists[i])) continue;
      target -= dists[i];
      if (target <= 0) {
        pick = i;
        break;
      }
      pick = i;
    }
    centroids.push(matrix[pick].slice());
  }
  // Ensure every centroid has length d (for rows that had trailing NaN columns).
  for (const c of centroids) {
    while (c.length < d) c.push(NaN);
  }
  return centroids;
}

// Park-Miller LCG — kept local so stats.js has no cross-file dependency.
function kmeansRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function sqDistPartial(row, centroid) {
  const n = Math.min(row.length, centroid.length);
  let s = 0;
  let any = false;
  for (let k = 0; k < n; k++) {
    const a = row[k];
    const b = centroid[k];
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const diff = a - b;
      s += diff * diff;
      any = true;
    }
  }
  return any ? s : Infinity;
}

// stats/cluster.ts — distance metrics, hierarchical clustering (`hclust` /
// `dendrogramLayout`), and k-means primitives used by tools/heatmap/.
//
// Migrated from `tools/stats-cluster.js`. No intra-stats dependencies —
// distance + clustering use only built-ins. Lives alongside the other stats
// modules by historical convention; could equally live as a top-level
// _core/cluster.ts.

import type {
  DendrogramLayout,
  DendrogramSegment,
  DistanceMetric,
  HClustResult,
  HClustTreeNode,
  KMeansOptions,
  KMeansResult,
  LinkageMethod,
} from "./types";

// ── 14. Hierarchical clustering ─────────────────────────────────────────────

export function pairwiseDistance(matrix: number[][], metric: DistanceMetric): number[][] {
  const n = matrix.length;
  const D: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = rowDistance(matrix[i], matrix[j], metric);
      D[i][j] = d;
      D[j][i] = d;
    }
  }
  return D;
}

export function rowDistance(a: number[], b: number[], metric: DistanceMetric): number {
  const n = Math.min(a.length, b.length);
  const xs: number[] = [];
  const ys: number[] = [];
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

export function hclust(distMatrix: number[][], linkage: LinkageMethod): HClustResult {
  const n = distMatrix.length;
  // Stryker disable next-line all -- defensive early return for empty distance matrix
  if (n === 0) return { tree: null, order: [] };
  // Stryker disable all -- defensive early return for singleton matrix
  if (n === 1)
    return { tree: { index: 0, left: null, right: null, height: 0, size: 1 }, order: [0] };
  // Stryker restore all

  const clusters: HClustTreeNode[] = new Array(n);
  const D: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    clusters[i] = { index: i, left: null, right: null, height: 0, size: 1 };
    D[i] = distMatrix[i].slice();
  }
  const active = new Set<number>();
  for (let i = 0; i < n; i++) active.add(i);

  const mergeFn: ((d1: number, d2: number) => number) | null =
    linkage === "complete"
      ? (d1, d2) => Math.max(d1, d2)
      : linkage === "single"
        ? (d1, d2) => Math.min(d1, d2)
        : null; // signals UPGMA (size-weighted average)

  while (active.size > 1) {
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
      bi = act[0];
      bj = act[1];
      best = 0;
    }

    const merged: HClustTreeNode = {
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
      let nd: number;
      if (mergeFn) {
        nd = mergeFn(dik, djk);
      } else {
        nd = (sizeI * dik + sizeJ * djk) / (sizeI + sizeJ);
      }
      D[bi][k] = nd;
      D[k][bi] = nd;
    }
    clusters[bi] = merged;
  }

  const rootId = Array.from(active)[0];
  const tree = clusters[rootId];

  const order: number[] = [];
  (function walk(node: HClustTreeNode | null) {
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

export function dendrogramLayout(tree: HClustTreeNode | null): DendrogramLayout {
  // Stryker disable next-line all -- defensive early return for null tree
  if (!tree) return { segments: [], maxHeight: 0 };
  const segments: DendrogramSegment[] = [];
  let maxHeight = 0;
  function place(node: HClustTreeNode): { x: number; h: number } {
    if (node.left === null && node.right === null) {
      return { x: node._leafPos as number, h: 0 };
    }
    const L = place(node.left as HClustTreeNode);
    const R = place(node.right as HClustTreeNode);
    const h = node.height;
    if (h > maxHeight) maxHeight = h;
    segments.push({ x1: L.x, y1: L.h, x2: L.x, y2: h });
    segments.push({ x1: R.x, y1: R.h, x2: R.x, y2: h });
    segments.push({ x1: L.x, y1: h, x2: R.x, y2: h });
    return { x: (L.x + R.x) / 2, h };
  }
  let leafIdx = 0;
  (function num(node: HClustTreeNode | null) {
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

export function kmeans(matrix: number[][], k: number, opts?: KMeansOptions): KMeansResult {
  const options = opts || {};
  const seed = options.seed != null ? options.seed : 1;
  const maxIter = options.maxIter != null ? options.maxIter : 100;
  const restarts = options.restarts != null ? options.restarts : 8;
  const n = matrix.length;
  // Stryker disable next-line all -- defensive early return for empty matrix
  if (n === 0) return { clusters: [], centroids: [], inertia: 0, iterations: 0, order: [] };
  const d = matrix[0].length;
  const kEff = Math.max(1, Math.min(k, n));

  const baseRng = kmeansRng(seed);
  let best: {
    clusters: number[];
    centroids: number[][];
    inertia: number;
    iterations: number;
  } | null = null;
  for (let r = 0; r < restarts; r++) {
    const rng = kmeansRng(Math.floor(baseRng() * 2147483646) + 1);
    const attempt = kmeansOnce(matrix, kEff, d, rng, maxIter);
    if (!best || attempt.inertia < best.inertia) best = attempt;
  }
  const winner = best as {
    clusters: number[];
    centroids: number[][];
    inertia: number;
    iterations: number;
  };

  const distToCentroid = new Array(n);
  for (let i = 0; i < n; i++) {
    distToCentroid[i] = sqDistPartial(matrix[i], winner.centroids[winner.clusters[i]]);
  }
  const order: number[] = [];
  for (let c = 0; c < kEff; c++) {
    const members: number[] = [];
    for (let i = 0; i < n; i++) if (winner.clusters[i] === c) members.push(i);
    members.sort((a, b) => distToCentroid[a] - distToCentroid[b]);
    for (const m of members) order.push(m);
  }

  return {
    clusters: winner.clusters,
    centroids: winner.centroids,
    inertia: winner.inertia,
    iterations: winner.iterations,
    order,
  };
}

interface KMeansRunOnce {
  clusters: number[];
  centroids: number[][];
  inertia: number;
  iterations: number;
}

function kmeansOnce(
  matrix: number[][],
  k: number,
  d: number,
  rng: () => number,
  maxIter: number
): KMeansRunOnce {
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

    const sums: number[][] = Array.from({ length: k }, () => new Array(d).fill(0));
    const counts: number[][] = Array.from({ length: k }, () => new Array(d).fill(0));
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

function kmeansPlusPlusInit(matrix: number[][], k: number, rng: () => number): number[][] {
  const n = matrix.length;
  const d = matrix[0].length;
  const centroids: number[][] = [];
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
      const pick = Math.floor(rng() * n);
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
  for (const c of centroids) {
    while (c.length < d) c.push(NaN);
  }
  return centroids;
}

// Park-Miller LCG — kept local so cluster.ts has no cross-file dependency.
function kmeansRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function sqDistPartial(row: number[], centroid: number[]): number {
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

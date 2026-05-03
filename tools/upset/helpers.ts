// Pure set-math + label helpers for the UpSet tool. These have no React / DOM
// dependency and are separately testable (tests/helpers/upset-loader.js loads
// this file directly). Keep layout constants and render-layer code out —
// they belong in tools/upset.tsx.

export type Intersection = {
  mask: number;
  setIndices: number[];
  degree: number;
  size: number;
  items: string[];
};

// Build the item → bitmask map. Each bit i corresponds to setNames[i].
// Items that appear in none of the provided sets are skipped.
export function computeMemberships(setNames: string[], sets: Map<string, Set<string>>) {
  const membershipMap = new Map<string, number>();
  setNames.forEach((name, i) => {
    const s = sets.get(name);
    if (!s) return;
    for (const item of s) {
      const prev = membershipMap.get(item) || 0;
      membershipMap.set(item, prev | (1 << i));
    }
  });
  return { membershipMap };
}

// Returns exclusive intersections (items in exactly these sets and no others).
// Excludes mask === 0 and empty intersections by construction.
export function enumerateIntersections(
  membershipMap: Map<string, number>,
  setNames: string[]
): Intersection[] {
  const groups = new Map<number, string[]>();
  for (const [item, mask] of membershipMap) {
    if (mask === 0) continue;
    if (!groups.has(mask)) groups.set(mask, []);
    groups.get(mask)!.push(item);
  }
  const out: Intersection[] = [];
  for (const [mask, items] of groups) {
    if (items.length === 0) continue;
    items.sort();
    const setIndices: number[] = [];
    for (let i = 0; i < setNames.length; i++) {
      if (mask & (1 << i)) setIndices.push(i);
    }
    out.push({ mask, setIndices, degree: setIndices.length, size: items.length, items });
  }
  return out;
}

// Five sort modes. Ties break on ascending mask for determinism.
export function sortIntersections(list: Intersection[], mode: string): Intersection[] {
  const byMaskAsc = (a: Intersection, b: Intersection) => a.mask - b.mask;
  const copy = list.slice();
  switch (mode) {
    case "size-asc":
      return copy.sort((a, b) => a.size - b.size || byMaskAsc(a, b));
    case "degree-asc":
      return copy.sort((a, b) => a.degree - b.degree || b.size - a.size || byMaskAsc(a, b));
    case "degree-desc":
      return copy.sort((a, b) => b.degree - a.degree || b.size - a.size || byMaskAsc(a, b));
    case "sets":
      return copy.sort((a, b) => {
        const la = a.setIndices;
        const lb = b.setIndices;
        const n = Math.min(la.length, lb.length);
        for (let i = 0; i < n; i++) {
          if (la[i] !== lb[i]) return la[i] - lb[i];
        }
        if (la.length !== lb.length) return la.length - lb.length;
        return byMaskAsc(a, b);
      });
    case "size-desc":
    default:
      return copy.sort((a, b) => b.size - a.size || byMaskAsc(a, b));
  }
}

// Filter by minimum size and by a degree window [minDegree, maxDegree].
// maxDegree defaults to Infinity so existing callers that only pass
// minDegree keep the old "everything at or above minDegree" behaviour.
export function truncateIntersections(
  list: Intersection[],
  { minSize = 1, minDegree = 1, maxDegree = Infinity } = {}
): Intersection[] {
  return list.filter((r) => r.size >= minSize && r.degree >= minDegree && r.degree <= maxDegree);
}

// Human-readable label: "A ∩ B ∩ C".
export function intersectionLabel(setIndices: number[], setNames: string[]): string {
  return setIndices.map((i) => setNames[i]).join(" ∩ ");
}

// Short label using display-order set ids: "S1 ∩ S3 ∩ S5". Used in UI panels
// where long set names would overflow — the numbers are the same "S#" ids
// shown in the dedicated lane between the set-name labels and the matrix on
// the plot, so the on-screen plot is always the source of truth for which
// set a number refers to.
export function intersectionShortLabel(setIndices: number[]): string {
  return setIndices.map((i) => `S${i + 1}`).join(" ∩ ");
}

// Filename-safe rendering — "A ∩ B" → "A_and_B".
export function intersectionFilenamePart(label: string): string {
  return label
    .replace(/∩/g, "and")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

// Stable id fragment for <g id="col-..."> built from the setIndices.
export function intersectionIdKey(setIndices: number[], setNames: string[]): string {
  return setIndices.map((i) => svgSafeId(setNames[i])).join("-") || "empty";
}

// Build axis ticks for a bar panel: evenly spaced pretty ticks from 0 up to a
// domain max that is strictly greater than the data max (rounded up to the
// next niceStep). Callers scale bars against the last tick so every interval
// is equal and the largest bar stops short of the panel edge.
export function buildBarTicks(max: number, count: number): number[] {
  if (!(max > 0)) return [0, 1];
  const step = niceStep(max, count);
  const domainMax = Math.ceil((max + step * 1e-9) / step) * step;
  const last = domainMax > max ? domainMax : domainMax + step;
  const ticks: number[] = [];
  for (let v = 0; v <= last + step * 0.001; v += step) {
    ticks.push(parseFloat(v.toPrecision(10)));
  }
  return ticks;
}

// `assignBracketLevels` — pure layout helper that assigns a vertical
// stack level (0 = lowest) to each {i, j} pair so significance brackets
// at overlapping spans don't collide. Greedy by ascending span width.
// Used by chart renderers (boxplot/layout, aequorin/chart) and by
// `StatsTile` when it builds its own annotation specs.
//
// Generic over T to preserve any additional fields the caller threads
// through (label, p, etc.). Lives in its own module so consumers that
// only need the layout math don't pull in the full StatsTile bundle.

export function assignBracketLevels<T extends { i: number; j: number }>(
  pairs: T[]
): Array<T & { _level: number }> {
  const enriched = pairs.map((pr, idx) => ({
    ...pr,
    _span: Math.abs(pr.j - pr.i),
    _orig: idx,
    _level: 0,
  }));
  enriched.sort((a, b) => a._span - b._span);
  const placed: typeof enriched = [];
  for (const pr of enriched) {
    let lvl = 0;
    while (
      placed.some(
        (q) =>
          q._level === lvl &&
          Math.max(Math.min(q.i, q.j), Math.min(pr.i, pr.j)) <=
            Math.min(Math.max(q.i, q.j), Math.max(pr.i, pr.j))
      )
    ) {
      lvl++;
    }
    pr._level = lvl;
    placed.push(pr);
  }
  // Restore original input order so the parent can match up labels.
  placed.sort((a, b) => a._orig - b._orig);
  return placed.map(({ _orig: _o, _span: _s, ...rest }) => rest as T & { _level: number });
}

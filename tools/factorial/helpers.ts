// tools/factorial/helpers.ts — pure helpers + types for the Factorial
// Analysis tool. No React, no DOM; lifted out of app.tsx so the unit-test
// loader can bundle it without pulling the chart-y / shell-y siblings.
//
// The tool is intentionally scoped to 2 factors per the methodology decision
// in tools/factorial/howto.tsx ("how many simultaneous factors are
// reasonable?"). The role union below reflects that — `factorA` and
// `factorB` are the two crossed factors, `value` is the numeric response,
// and `ignore` drops a column from the analysis. Per-value-level filtering
// (the "filter" role in other plot tools) is deliberately out of scope for
// v1: pre-process the dataset before upload if you need that.

export type FactorialRole = "factorA" | "factorB" | "value" | "ignore";

export interface FactorialVis {
  // Per-cell normality flag: any cell with Shapiro p < alphaNormality
  // raises a "non-normality detected" notice in the diagnostics block.
  alphaNormality: number;
  // Display toggles persisted across sessions.
  showCellMeans: boolean;
  showDiagnostics: boolean;
}

// Used by the Configure step to render the cell-count grid + flag
// design problems before the user advances to the Report step.
export interface DesignSummary {
  // Which level appears as A_i / B_j after sorting.
  levelsA: string[];
  levelsB: string[];
  // Row-major (levelA × levelB) cell-count matrix. Length = kA * kB.
  cellCounts: number[];
  // Total observations across all cells (sum of cellCounts).
  N: number;
  // Equal n in every populated cell (and no empty cells).
  balanced: boolean;
  // Number of cells with n === 0. Non-zero ⇒ design is non-estimable.
  emptyCells: number;
  // Number of cells with n === 1. Allowed (the interaction is still
  // estimable when at least one other cell has n ≥ 2), surfaced to the
  // UI as a low-power yellow flag.
  singletonCells: number;
}

// Cellize a long-format dataset for a 2-factor design. Returns the cell
// count matrix in row-major order, sorted-level lists, and design flags.
// Does NOT validate level uniqueness across factors — `aSeries[i]` and
// `bSeries[i]` are paired by index; the caller filtered/renamed already.
export function summarizeDesign(aSeries: string[], bSeries: string[]): DesignSummary {
  const sortedUnique = (xs: string[]): string[] => Array.from(new Set(xs)).sort();
  const levelsA = sortedUnique(aSeries);
  const levelsB = sortedUnique(bSeries);
  const kA = levelsA.length;
  const kB = levelsB.length;
  const cellCounts = new Array<number>(kA * kB).fill(0);
  const idxA = new Map<string, number>();
  const idxB = new Map<string, number>();
  for (let i = 0; i < kA; i++) idxA.set(levelsA[i], i);
  for (let i = 0; i < kB; i++) idxB.set(levelsB[i], i);
  const N = Math.min(aSeries.length, bSeries.length);
  for (let i = 0; i < N; i++) {
    const ai = idxA.get(aSeries[i]);
    const bi = idxB.get(bSeries[i]);
    if (ai == null || bi == null) continue;
    cellCounts[ai * kB + bi] += 1;
  }
  let emptyCells = 0;
  let singletonCells = 0;
  let firstNonzero = -1;
  let balanced = true;
  for (const n of cellCounts) {
    if (n === 0) {
      emptyCells += 1;
      balanced = false;
    } else if (n === 1) {
      singletonCells += 1;
    }
    if (n > 0 && firstNonzero === -1) firstNonzero = n;
    if (firstNonzero !== -1 && n !== firstNonzero && n !== 0) balanced = false;
  }
  return { levelsA, levelsB, cellCounts, N, balanced, emptyCells, singletonCells };
}

// Validation gate before the Configure → Report transition. Returns null
// when the design is estimable; otherwise a human-readable message the
// step UI surfaces as a red banner.
export function validateDesign(
  summary: DesignSummary,
  options: { aColIdx: number | null; bColIdx: number | null; valueColIdx: number | null }
): string | null {
  if (options.aColIdx == null) return "Pick a column for factor A.";
  if (options.bColIdx == null) return "Pick a column for factor B.";
  if (options.valueColIdx == null) return "Pick a column for the numeric value.";
  if (options.aColIdx === options.bColIdx) {
    return "factor A and factor B must be different columns.";
  }
  if (summary.levelsA.length < 2) {
    return "factor A needs at least 2 distinct levels.";
  }
  if (summary.levelsB.length < 2) {
    return "factor B needs at least 2 distinct levels.";
  }
  if (summary.emptyCells > 0) {
    const which =
      summary.emptyCells === 1 ? "1 cell is empty" : `${summary.emptyCells} cells are empty`;
    return `${which} — the interaction term is non-estimable. Drop a level or use a different filter.`;
  }
  // The full model uses k_A × k_B parameters; need at least one more
  // observation than that for a residual df ≥ 1.
  const cells = summary.levelsA.length * summary.levelsB.length;
  if (summary.N <= cells) {
    return `Need at least ${cells + 1} observations (k_A · k_B + 1) for the full model. Got ${summary.N}.`;
  }
  return null;
}

// Convenience colour lookup used by the role editor + cell-count grid.
// Keys mirror the FactorialRole union plus a "factorAOrB" fallback the
// configure UI uses when rendering legend chips.
export const FACTORIAL_ROLE_COLORS: Record<FactorialRole, string> = {
  factorA: "#785EF0", // purple — same palette stop as scatter's discrete-A
  factorB: "#FE6100", // orange — high contrast against A
  value: "#DC267F", // pink — matches `roleColors.value` in _core/color
  ignore: "#9CA3AF", // grey — matches `roleColors.ignore`
};

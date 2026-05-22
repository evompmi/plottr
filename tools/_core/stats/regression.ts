// stats/regression.ts — small OLS regression kernel used by twoWayANOVA's
// nested-model RSS differencing (Type II sums of squares). Forward-looking
// home for any future linear-model work (multiple regression, ANCOVA, …)
// the Plöttr roadmap may pick up.
//
// Scope: dense, in-memory, ≤ a few hundred rows × ≤ ~20 columns. ANOVA
// design matrices for 2- or 3-factor wet-lab data sit comfortably inside
// that window. No sparsity, no QR, no iterative refinement — Gaussian
// elimination with partial pivoting is accurate enough and fits in <100
// LOC. If a future caller needs > 100-column models, swap the solver for
// numeric-js or a custom QR; the public surface (`ols(X, y)`) stays put.

export interface OlsResult {
  beta: number[];
  rss: number; // residual sum of squares
  df: number; // residual degrees of freedom = n − p
  n: number; // number of observations
  p: number; // number of parameters (= number of design-matrix columns)
  error?: string;
}

// Solve A x = b in-place via Gaussian elimination with partial pivoting.
// A is square (n × n); b is length n. Returns x (length n) or null when
// the system is singular within `tol`.
//
// Used only by `ols` below — exported because the OLS normal-equations
// path is the load-bearing numeric step and is cheaper to test directly
// than through the regression API.
export function solveLinearSystem(
  A: number[][],
  b: number[],
  tol: number = 1e-12
): number[] | null {
  const n = A.length;
  if (n === 0) return [];
  if (b.length !== n) return null;
  for (const row of A) if (row.length !== n) return null;

  // Augmented matrix copy — never mutate caller's arrays.
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: pick the row at or below `col` with the largest
    // absolute value in this column.
    let pivot = col;
    let pivotAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivot = r;
      }
    }
    if (pivotAbs < tol) return null; // singular (or numerically rank-deficient)
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    // Eliminate below.
    const piv = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / piv;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

// Fit y = X β by ordinary least squares via the normal equations:
//   β = (X' X)⁻¹ X' y
//
// Returns residual sum of squares (RSS) and the residual df. The β vector
// is included for callers that need it, but the ANOVA path only consumes
// RSS + df. On a singular X'X (e.g. exact collinearity in the design
// matrix) returns `{ error }` and NaN statistics — callers must propagate.
export function ols(X: number[][], y: number[]): OlsResult {
  const n = X.length;
  if (n === 0) {
    return { beta: [], rss: NaN, df: 0, n: 0, p: 0, error: "Empty design matrix" };
  }
  if (y.length !== n) {
    return { beta: [], rss: NaN, df: 0, n, p: 0, error: "Length mismatch between X and y" };
  }
  const p = X[0].length;
  for (const row of X) {
    if (row.length !== p) {
      return { beta: [], rss: NaN, df: 0, n, p, error: "Design matrix has ragged rows" };
    }
  }
  if (n < p) {
    return {
      beta: [],
      rss: NaN,
      df: 0,
      n,
      p,
      error: `Underdetermined system: ${n} observations < ${p} parameters`,
    };
  }

  // X' X (p × p)
  const XtX: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += X[k][i] * X[k][j];
      XtX[i][j] = s;
      if (i !== j) XtX[j][i] = s;
    }
  }

  // X' y (p)
  const Xty = new Array<number>(p).fill(0);
  for (let i = 0; i < p; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += X[k][i] * y[k];
    Xty[i] = s;
  }

  const beta = solveLinearSystem(XtX, Xty);
  if (beta == null) {
    return {
      beta: [],
      rss: NaN,
      df: 0,
      n,
      p,
      error: "Singular X'X — design matrix has collinear columns",
    };
  }

  // RSS = sum (y_k − Σ X[k][i] β[i])²
  let rss = 0;
  for (let k = 0; k < n; k++) {
    let pred = 0;
    for (let i = 0; i < p; i++) pred += X[k][i] * beta[i];
    const r = y[k] - pred;
    rss += r * r;
  }

  return { beta, rss, df: n - p, n, p };
}

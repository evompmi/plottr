// lineplot/reports.ts — text + R-script builders for the per-x stats panel
// download chips. Pure functions; no React. Test/post-hoc labels live here
// so PerXDetail and PerXStatsPanel can share them.

import { formatX, EnrichedPerXRow, SelectTestResult } from "./helpers";
import {
  STATS_POSTHOC_REGISTRY,
  STATS_TEST_REGISTRY,
  TestResult,
  buildRScript,
  sanitizeRComment,
} from "../_shell";
import { tinv } from "../_core/stats/dist";
import { sampleMean, sampleSD } from "../_core/stats/tests";
//
// One compact summary table: one row per eligible x. Click a row to expand
// the decision trace + post-hoc inline. Aggregate TXT / R downloads at the
// top reproduce every per-x test in a single file.

// Sourced from the shared registry (`tools/shared-stats-registry.js`).
// Lineplot's per-x stats panel uses tight cells so it reads each entry's
// `shortLabel` ("Student's t", "Welch's t") — falling back to `label`
// for entries that don't carry a short form (the ANOVAs and KW are
// already concise enough). Boxplot / aequorin both consume `label`.
export const TEST_LABELS_LP: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_TEST_REGISTRY).map(([id, entry]) => [id, entry.shortLabel || entry.label])
);
export const POSTHOC_LABELS_LP: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_POSTHOC_REGISTRY).map(([id, entry]) => [id, entry.label])
);

// `res` is one of five different test-result shapes (tTest / mannWhitneyU /
// oneWay-or-WelchANOVA / kruskalWallis). Branching on `testName` selects
// which fields are valid; we read them off `TestResult`'s `[key: string]:
// unknown` index signature with narrow `as number` casts at each access.
// Modelling the full union of test shapes here would be heavier than the
// dispatch is worth.
export function formatStat(
  testName: string | null | undefined,
  res: TestResult | null | undefined
): string {
  if (!testName || !res || res.error) return "—";
  const num = (v: unknown): number => v as number;
  if (testName === "studentT" || testName === "welchT")
    return `t(${num(res.df).toFixed(2)}) = ${num(res.t).toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${num(res.U).toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA") {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${num(res.F).toFixed(3)}`;
  }
  if (testName === "kruskalWallis") return `H(${res.df}) = ${num(res.H).toFixed(3)}`;
  return "—";
}

export function buildPerXTextBlock(row: EnrichedPerXRow, xLabel: string): string {
  const lines: string[] = [];
  const names = row.names;
  const values = row.values;
  const res = row.result ?? {};
  lines.push("=".repeat(60));
  lines.push(`${xLabel || "x"} = ${formatX(row.x)}`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push("Groups:");
  for (let i = 0; i < names.length; i++) {
    const vs = values[i];
    const n = vs.length;
    const mean = sampleMean(vs);
    const sd = n > 1 ? sampleSD(vs) : 0;
    const sem = n > 1 ? sd / Math.sqrt(n) : 0;
    const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
    const semStr = n > 1 ? sem.toFixed(3) : "—";
    const ciStr = n > 1 ? `±${ci95.toFixed(3)}` : "—";
    lines.push(
      `  ${names[i]}: n=${n}, mean=${mean.toFixed(3)}, SD=${sd.toFixed(3)}, SEM=${semStr}, 95% CI=${ciStr}`
    );
  }
  lines.push("");
  const rec = (row.rec ?? {}) as SelectTestResult;
  const recTest = rec.recommendation?.test ?? null;
  const reason = rec.recommendation?.reason;
  lines.push(`Test: ${row.chosenTest ? TEST_LABELS_LP[row.chosenTest] || row.chosenTest : "—"}`);
  if (reason) lines.push(`Reason: ${reason}`);
  if (res.error) lines.push(`Result: ⚠ ${res.error}`);
  else {
    lines.push(`Result: ${formatStat(row.chosenTest, res)},  p = ${formatP(res.p)}`);
    if (row.pAdj != null) lines.push(`BH-adjusted p (across x-axis): ${formatP(row.pAdj)}`);
  }
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${TEST_LABELS_LP[recTest] || recTest})`);
  lines.push("");
  const norm = rec.normality ?? [];
  if (norm.length > 0) {
    const parts = norm.map((r) => {
      const label = names[r.group] || `g${r.group}`;
      const verdict = r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
      return `${label}: ${verdict}`;
    });
    lines.push(`Shapiro-Wilk: ${parts.join("; ")}`);
  }
  // Widen `rec.levene` from its `{ error } | { F, df1, df2, p, equalVar }`
  // union to an optional-field shape so this block can index `.F` / `.df1`
  // without per-access narrowing; the `lev.F != null` guard below covers
  // the error / undefined cases at runtime.
  const lev = (rec.levene ?? {}) as {
    F?: number;
    df1?: number;
    df2?: number;
    p?: number;
    equalVar?: boolean | null;
    error?: string;
  };
  if (lev.F != null)
    lines.push(
      `Levene: F(${lev.df1},${lev.df2}) = ${lev.F.toFixed(3)}, p = ${formatP(lev.p)} → ${lev.equalVar ? "equal variance" : "unequal variance"}`
    );
  const postHoc = row.postHocResult;
  if (names.length >= 3 && postHoc && !postHoc.error && row.postHocName) {
    lines.push("");
    lines.push(`Post-hoc — ${POSTHOC_LABELS_LP[row.postHocName] || row.postHocName}:`);
    for (const pr of postHoc.pairs) {
      const p = pr.pAdj != null ? pr.pAdj : pr.p;
      const diff =
        pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? `z=${pr.z.toFixed(3)}` : "—";
      lines.push(`  ${names[pr.i]} vs ${names[pr.j]}: ${diff},  p = ${formatP(p)}  ${pStars(p)}`);
    }
  }
  const power = row.powerResult;
  if (power) {
    lines.push("");
    const ciStr = power.effectCI
      ? `, 95% CI [${power.effectCI.lo.toFixed(3)}, ${power.effectCI.hi.toFixed(3)}]`
      : "";
    lines.push(`Replication planning: ${power.effectLabel} = ${power.effect.toFixed(3)}${ciStr}`);
    for (const pr of power.rows) {
      const nStr = pr.nForTarget != null ? `${pr.nForTarget} ${power.nLabel}` : "> 5000";
      lines.push(`  α=${pr.alpha}: n for 80% power = ${nStr}`);
    }
    if (power.approximate) lines.push("  (rank-based test — estimated from parametric analog)");
  }
  lines.push("");
  return lines.join("\n");
}

export function buildAggregateReport(rows: EnrichedPerXRow[], xLabel: string): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const head = [
    "Line Plot — per-x statistical analysis",
    "Generated: " + now,
    `X axis: ${xLabel || "x"}`,
    `Eligible points: ${rows.length}`,
    "",
    "P-values are BH-adjusted across the x-axis. Stars use the adjusted p.",
    "",
  ];
  return head.join("\n") + rows.map((r) => buildPerXTextBlock(r, xLabel)).join("");
}

export function buildAggregateRScript(rows: EnrichedPerXRow[], xLabel: string): string {
  if (!rows.length || typeof buildRScript !== "function") return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  // sanitizeRComment strips embedded line terminators so a hostile x-axis
  // label (or any of its per-x values, if a future caller passes strings)
  // can't escape the `# ...` comment / banner lines it lands in.
  const safeXLabel = sanitizeRComment(xLabel || "x");
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Plöttr — Line Plot R script export (combined per-x analysis)",
    "# Generated: " + now,
    `# X axis: ${safeXLabel} — ${rows.length} eligible points.`,
    "# Each section redefines `df` for one x value and runs its assumption checks,",
    "# chosen test, and post-hoc (if applicable).",
    "# -----------------------------------------------------------------------------",
    "",
  ].join("\n");
  const parts = [header];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const xStr = sanitizeRComment(formatX(row.x));
    const block = buildRScript({
      names: row.names,
      values: row.values,
      recommendation: row.rec,
      chosenTest: row.chosenTest,
      postHocName: row.postHocName,
      dataNote: `${safeXLabel} = ${xStr}`,
    });
    const banner =
      "\n# ==============================================================\n# " +
      `${safeXLabel} = ${xStr}` +
      "\n# ==============================================================\n";
    if (i === 0) {
      parts.push(banner + block);
    } else {
      const lines = block.split("\n");
      const dfIdx = lines.findIndex((l) => l.startsWith("df <- data.frame"));
      parts.push(banner + (dfIdx >= 0 ? lines.slice(dfIdx).join("\n") : block));
    }
  }
  return parts.join("\n");
}

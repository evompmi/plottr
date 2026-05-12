// Text + R-script report builders for the aequorin stats panel. Pure
// string-builders — no React / DOM dependency — and therefore separately
// testable alongside tools/aequorin/helpers.ts.
//
// Also houses the small formatter helpers the stats panel consumes
// (formatAqStatShort / formatAqResultLine) and the aggregate builders
// (buildAqSetTextBlock / buildAqAggregateReport / buildAqAggregateRScript)
// that the TXT / R download buttons hand raw `enriched` rows to.
// Mirrors tools/boxplot/reports.ts.

import { EnrichedAequorinStatsRow, SelectTestResult } from "./helpers";
import {
  STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K,
  STATS_TESTS_FOR_K2,
  STATS_TEST_REGISTRY,
  buildRScript,
  sanitizeRComment,
} from "../_shell";
import type { TestResult } from "../_shell";
// Test/post-hoc labels + group-arity option lists derived from the
// shared registry (`tools/shared-stats-registry.js`). Pre-registry these
// were a verbatim copy of `STATS_LABELS` / `POSTHOC_LABELS` from
// `shared-stats-tile.js` plus a hand-maintained `["studentT","welchT",
// "mannWhitney"]` array — three duplicate edit sites for any new test.
// All consumers in this file (formatters, R-script builder) still
// reference these names, so the public API is unchanged.
export const TEST_LABELS_AQ: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_TEST_REGISTRY).map(([id, entry]) => [id, entry.label])
);

export const POSTHOC_LABELS_AQ: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_POSTHOC_REGISTRY).map(([id, entry]) => [id, entry.label])
);

export const TEST_OPTIONS_AQ_2 = STATS_TESTS_FOR_K2;
export const TEST_OPTIONS_AQ_K = STATS_TESTS_FOR_K;

export const AQ_ERROR_BAR_LABELS: Record<string, string> = {
  none: "None",
  sd: "SD",
  sem: "SEM",
  ci95: "95% CI",
};

// `res` is one of five different test-result shapes (tTest / mannWhitneyU /
// oneWay-or-WelchANOVA / kruskalWallis); branching on `testName` selects
// which fields are valid. Read fields off TestResult's `[key: string]:
// unknown` index signature with narrow `as number` casts at each access —
// modelling the full union here would be heavier than the dispatch is worth.
const numCast = (v: unknown): number => v as number;

export function formatAqStatShort(
  testName: string | null | undefined,
  res: TestResult | null | undefined
): string {
  if (!testName || !res || res.error) return "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${numCast(res.df).toFixed(2)}) = ${numCast(res.t).toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${numCast(res.U).toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA") {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${numCast(res.F).toFixed(3)}`;
  }
  if (testName === "kruskalWallis") return `H(${numCast(res.df)}) = ${numCast(res.H).toFixed(3)}`;
  return "—";
}

export function formatAqResultLine(
  testName: string | null | undefined,
  res: TestResult | null | undefined
): string {
  if (!testName || !res) return "—";
  if (res.error) return "⚠ " + res.error;
  if (testName === "studentT" || testName === "welchT")
    return `t(${numCast(res.df).toFixed(2)}) = ${numCast(res.t).toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "mannWhitney")
    return `U = ${numCast(res.U).toFixed(1)},  z = ${numCast(res.z).toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA") {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${numCast(res.F).toFixed(3)},  p = ${formatP(res.p)}`;
  }
  if (testName === "kruskalWallis")
    return `H(${numCast(res.df)}) = ${numCast(res.H).toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

// Permissive input shape — `computeAqAnnotationSpec` is also called with
// the panel's pre-validation `EnrichedOrSkip` shape (which carries `skip`).
// Returning a loose object; consumers (`AequorinStatsPanel`) cast to the
// strict `AnnotationSpec` union when they hand it to the chart.
export function computeAqAnnotationSpec(
  row: {
    skip?: boolean;
    k: number;
    names: string[];
    testResult?: TestResult | null;
    postHocResult?: {
      pairs: Array<{ i: number; j: number; p: number; pAdj?: number | null }>;
      error?: string;
    } | null;
  },
  displayMode: "none" | "cld" | "brackets",
  showNs: boolean
): {
  kind: "brackets" | "cld";
  pairs?: Array<{ i: number; j: number; p: number; label: string }>;
  labels?: string[];
  groupNames: string[];
} | null {
  if (displayMode === "none" || !row || row.skip) return null;
  const { k, names, testResult, postHocResult } = row;
  if (k < 2) return null;
  if (k === 2) {
    const p = testResult && !testResult.error ? (testResult.p as number | undefined) : null;
    if (p == null) return null;
    if (!showNs && p >= 0.05) return null;
    return {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p, label: pStars(p) }],
      groupNames: names,
    };
  }
  if (!postHocResult || postHocResult.error) return null;
  if (displayMode === "cld") {
    const labels = compactLetterDisplay(postHocResult.pairs, k);
    return { kind: "cld", labels, groupNames: names };
  }
  const pairs = postHocResult.pairs
    .map((pr) => ({ i: pr.i, j: pr.j, p: pr.pAdj != null ? pr.pAdj : pr.p }))
    .map((pr) => ({ ...pr, label: pStars(pr.p) }))
    .filter((pr) => showNs || pr.p < 0.05);
  if (pairs.length === 0) return null;
  return { kind: "brackets", pairs, groupNames: names };
}

export function summariseAqNormality(norm: NormalityResult[] | null | undefined): string {
  if (!Array.isArray(norm) || norm.length === 0) return "—";
  let hasTrue = false;
  let hasFalse = false;
  for (const r of norm) {
    if (r.normal === true) hasTrue = true;
    else if (r.normal === false) hasFalse = true;
  }
  if (hasFalse) return "no";
  if (hasTrue) return "yes";
  return "—";
}

export function summariseAqEqualVariance(
  lev: SelectTestResult["levene"] | null | undefined
): string {
  if (!lev || lev.F == null) return "—";
  return lev.equalVar ? "yes" : "no";
}

export function computeAqSummaryText(
  row: {
    skip?: boolean;
    k: number;
    chosenTest: RecommendedTest | null;
    testResult: TestResult | null;
    postHocName?: string | null;
    rec?: SelectTestResult | null;
  },
  showSummary: boolean,
  errorBarLabel: string
): string | null {
  if (!showSummary || !row || row.skip) return null;
  const { chosenTest, testResult, k, postHocName, rec } = row;
  if (!chosenTest || !testResult || testResult.error) return null;
  const lines = [
    `Normality: ${summariseAqNormality(rec?.normality)}`,
    `Equal variance: ${summariseAqEqualVariance(rec?.levene)}`,
    `Test: ${TEST_LABELS_AQ[chosenTest] || chosenTest}`,
  ];
  if (k > 2 && postHocName) {
    lines.push(`Post-hoc: ${POSTHOC_LABELS_AQ[postHocName] || postHocName}`);
  }
  if (errorBarLabel) lines.push(`Error bars: ${errorBarLabel}`);
  return lines.join("\n");
}

export function buildAqSetTextBlock(row: EnrichedAequorinStatsRow): string {
  const lines: string[] = [];
  const names = row.names;
  const values = row.values;
  const res = row.testResult ?? ({} as TestResult);
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
  const rec = row.rec;
  const recTest = rec?.recommendation?.test;
  const reason = rec?.recommendation?.reason;
  lines.push(`Test: ${row.chosenTest ? TEST_LABELS_AQ[row.chosenTest] || row.chosenTest : "—"}`);
  if (reason) lines.push(`Reason: ${reason}`);
  if (res.error) lines.push(`Result: ⚠ ${res.error}`);
  else if (row.chosenTest) lines.push(`Result: ${formatAqResultLine(row.chosenTest, res)}`);
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${TEST_LABELS_AQ[recTest] || recTest})`);
  lines.push("");
  const norm = rec?.normality ?? [];
  if (norm.length > 0) {
    const parts = norm.map((r) => {
      const label = names[r.group] || `g${r.group}`;
      const verdict = r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
      return `${label}: ${verdict}`;
    });
    lines.push(`Shapiro-Wilk: ${parts.join("; ")}`);
  }
  const lev = rec?.levene ?? {};
  if (lev.F != null)
    lines.push(
      `Levene: F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(3)}, p = ${formatP(lev.p)} → ${lev.equalVar ? "equal variance" : "unequal variance"}`
    );
  const postHoc = row.postHocResult;
  if (names.length >= 3 && postHoc && !postHoc.error && row.postHocName) {
    lines.push("");
    lines.push(`Post-hoc — ${POSTHOC_LABELS_AQ[row.postHocName] || row.postHocName}:`);
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

export function buildAqAggregateReport(rows: EnrichedAequorinStatsRow[]): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const head = ["RLU timecourse — statistical analysis", "Generated: " + now, ""];
  return head.join("\n") + rows.map((r) => buildAqSetTextBlock(r)).join("");
}

export function buildAqAggregateRScript(rows: EnrichedAequorinStatsRow[]): string {
  if (!rows.length || typeof buildRScript !== "function") return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Plöttr — RLU timecourse R script export",
    "# Generated: " + now,
    "# -----------------------------------------------------------------------------",
    "",
  ].join("\n");
  const parts: string[] = [header];
  for (const row of rows) {
    parts.push(
      buildRScript({
        names: row.names,
        values: row.values,
        recommendation: row.rec,
        chosenTest: row.chosenTest,
        postHocName: row.postHocName,
      })
    );
  }
  return parts.join("\n");
}

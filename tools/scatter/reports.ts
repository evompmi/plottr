// Text + R-script report builders for the scatter correlation stats panel.
// Pure string-builders — no React / DOM dependency — and therefore
// separately testable alongside tools/scatter/helpers.ts.

import {
  CORR_TEST_LABELS,
  CorrResult,
  EnrichedScatterStatsRow,
  formatCorrResultLine,
} from "./helpers";
import { formatRNumber, formatRVector, sanitizeRComment, sanitizeRString } from "../_shell";

const CORR_TO_R_METHOD: Record<CorrTest, "pearson" | "spearman" | "kendall"> = {
  pearson: "pearson",
  spearman: "spearman",
  kendall: "kendall",
};

export function buildScatterSetTextBlock(
  row: EnrichedScatterStatsRow,
  xLabel: string,
  yLabel: string
): string {
  const lines: string[] = [];
  const res: CorrResult | null = row.testResult;
  lines.push("=".repeat(60));
  lines.push(`Group: ${row.name || "—"}`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`x: ${xLabel || "x"}    y: ${yLabel || "y"}`);
  lines.push(`n (complete pairs): ${row.n}`);
  lines.push("");
  const rec = row.rec;
  const recTest = rec?.recommendation?.test;
  const reason = rec?.recommendation?.reason;
  lines.push(`Test: ${CORR_TEST_LABELS[row.chosenTest]}`);
  if (reason) lines.push(`Reason: ${reason}`);
  lines.push(`Result: ${formatCorrResultLine(res)}`);
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${CORR_TEST_LABELS[recTest]})`);
  lines.push("");
  const normality = rec?.normality ?? [];
  if (normality.length > 0) {
    const parts = normality.map((r) => {
      const axisLabel = r.axis === "x" ? xLabel || "x" : yLabel || "y";
      const verdict = r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
      const wpStr =
        r.W != null && r.p != null ? ` (W=${r.W.toFixed(3)}, p=${formatP(r.p)})` : "";
      return `${axisLabel}: ${verdict}${wpStr}`;
    });
    lines.push(`Shapiro-Wilk: ${parts.join("; ")}`);
  }
  if (res && !res.error && res.kind === "kendall") {
    lines.push("(Kendall τ — no analytic CI shipped; bootstrap if needed.)");
  }
  lines.push("");
  return lines.join("\n");
}

export function buildScatterAggregateReport(
  rows: EnrichedScatterStatsRow[],
  xLabel: string,
  yLabel: string
): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const head = [
    "Scatter — correlation analysis",
    "Generated: " + now,
    `Groups: ${rows.length}`,
    "",
  ];
  return head.join("\n") + rows.map((r) => buildScatterSetTextBlock(r, xLabel, yLabel)).join("");
}

export function buildScatterAggregateRScript(
  rows: EnrichedScatterStatsRow[],
  xLabel: string,
  yLabel: string
): string {
  if (!rows.length) return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const xName = sanitizeRComment(xLabel || "x");
  const yName = sanitizeRComment(yLabel || "y");
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Plöttr — Scatter correlation R script export",
    "# Generated: " + now,
    `# x = ${xName}, y = ${yName}`,
    `# Groups: ${rows.length}. Each section redefines x / y and runs cor.test().`,
    "# -----------------------------------------------------------------------------",
    "",
  ].join("\n");
  const parts = [header];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const safeName = sanitizeRComment(row.name || "—");
    const method = CORR_TO_R_METHOD[row.chosenTest];
    const exactArg = method === "spearman" || method === "kendall" ? ", exact = FALSE" : "";
    const banner =
      "\n# ==============================================================\n# " +
      `Group: ${safeName}` +
      "\n# ==============================================================\n";
    const body = [
      `x <- ${formatRVector(row.xs)}`,
      `y <- ${formatRVector(row.ys)}`,
      `# n complete pairs: ${row.n}`,
      `cor.test(x, y, method = "${sanitizeRString(method)}"${exactArg})`,
      "",
    ].join("\n");
    parts.push(banner + body);
  }
  return parts.join("\n");
}

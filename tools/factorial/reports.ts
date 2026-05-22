// tools/factorial/reports.ts — R script + CSV + TXT export builders.
//
// All three exports cross-check the Plöttr result against an authoritative
// R run (`car::Anova(model, type = 2)`) so a wet-lab user can paste the
// generated script into RStudio and confirm Plöttr's numbers byte-for-byte.

import { formatRNumber, sanitizeRString } from "../_shell/r-export";
import type { TwoWayANOVAResult } from "../_core/stats/types";
import { formatP } from "../_core/stats/format";

interface FactorialReportInput {
  // Long-format data rows in (factorA, factorB, value) order.
  rows: Array<{ a: string; b: string; v: number }>;
  // Header names the user will recognise in their downloaded CSV.
  factorAName: string;
  factorBName: string;
  valueName: string;
  // ANOVA result from `_core/stats/tests`'s `twoWayANOVA`.
  result: TwoWayANOVAResult;
  // Stem used to construct download filenames downstream.
  fileStem: string;
}

// Build the R script. The user pastes this into RStudio (or runs it via
// `Rscript`); it reads the dataset Plöttr emits alongside, runs the same
// Type II factorial ANOVA, and prints the result. Two read paths are
// supported: an inline `read.csv(text = ...)` block (self-contained, no
// file needed) and a `read.csv("<stem>_factorial.csv")` block commented
// out so the user can swap in their own filepath.
export function buildRScript(input: FactorialReportInput): string {
  const { rows, factorAName, factorBName, valueName, result, fileStem } = input;
  const aName = sanitizeRString(factorAName);
  const bName = sanitizeRString(factorBName);
  const vName = sanitizeRString(valueName);
  const csvLines = [
    `"${aName}","${bName}","${vName}"`,
    ...rows.map((r) => `"${sanitizeRString(r.a)}","${sanitizeRString(r.b)}",${formatRNumber(r.v)}`),
  ];
  const inlineCsv = csvLines.join("\n");

  const header = [
    `# Plöttr — Factorial Analysis (2-factor)`,
    `# Drop this into RStudio (Rscript "${fileStem}_factorial.R" also works).`,
    `# Cross-checks Plöttr's twoWayANOVA against the canonical Type II SS path:`,
    `#   car::Anova(lm(${vName} ~ ${aName} * ${bName}, data = df), type = 2)`,
    "#",
    `# Plöttr observed:`,
    `#   ${aName}:   F = ${formatRNumber(result.termA.F)}, df = ${result.termA.df1}, ${result.termA.df2}, p = ${formatP(result.termA.p)}`,
    `#   ${bName}:   F = ${formatRNumber(result.termB.F)}, df = ${result.termB.df1}, ${result.termB.df2}, p = ${formatP(result.termB.p)}`,
    `#   ${aName} × ${bName}: F = ${formatRNumber(result.termAB.F)}, df = ${result.termAB.df1}, ${result.termAB.df2}, p = ${formatP(result.termAB.p)}`,
    "",
  ].join("\n");

  const body = [
    `if (!requireNamespace("car", quietly = TRUE)) install.packages("car")`,
    `library(car)`,
    "",
    `df <- read.csv(text = "${csvLines.length > 1 ? "\\\n" : ""}${inlineCsv}\\\n", stringsAsFactors = TRUE)`,
    `# Alternative: df <- read.csv("${fileStem}_factorial.csv", stringsAsFactors = TRUE)`,
    "",
    `model <- lm(${vName} ~ ${aName} * ${bName}, data = df)`,
    `cat("\\n── Type II ANOVA ──\\n")`,
    `print(car::Anova(model, type = 2))`,
    `cat("\\n── Cell means + SDs ──\\n")`,
    `agg <- aggregate(${vName} ~ ${aName} + ${bName}, data = df,`,
    `  FUN = function(x) c(n = length(x), mean = mean(x), sd = sd(x)))`,
    `print(agg)`,
    "",
  ].join("\n");

  return header + body;
}

// Build a flat CSV containing two stacked blocks: cell-level descriptive
// stats (one row per cell) and the ANOVA table (one row per term). A
// blank row separates them so spreadsheet software shows them as
// distinct sections, but the user can still grep / awk / pandas the
// whole thing as a single file.
export function buildCsv(input: FactorialReportInput): string {
  const { factorAName, factorBName, result } = input;
  const lines: string[] = [];
  lines.push("# Plöttr — Factorial Analysis (Type II SS)");
  lines.push(
    `# Design: ${result.balanced ? "Balanced" : "Unbalanced"} ${result.levelsA.length}×${result.levelsB.length}, N = ${result.N}`
  );
  lines.push("");
  lines.push("# Cell means");
  lines.push([factorAName, factorBName, "n", "mean", "sd"].join(","));
  for (const c of result.cells) {
    lines.push(
      [
        JSON.stringify(c.levelA),
        JSON.stringify(c.levelB),
        c.n.toString(),
        Number.isFinite(c.mean) ? c.mean.toFixed(6) : "NA",
        Number.isFinite(c.sd) ? c.sd.toFixed(6) : "NA",
      ].join(",")
    );
  }
  lines.push("");
  lines.push("# ANOVA table (Type II)");
  lines.push(["term", "df", "SS", "MS", "F", "p", "eta_sq_partial"].join(","));
  const row = (
    label: string,
    df: number,
    ss: number,
    ms: number,
    F: number,
    p: number,
    eta: number
  ): string =>
    [
      JSON.stringify(label),
      df.toString(),
      Number.isFinite(ss) ? ss.toFixed(6) : "NA",
      Number.isFinite(ms) ? ms.toFixed(6) : "NA",
      Number.isFinite(F) ? F.toFixed(6) : "NA",
      Number.isFinite(p) ? p.toExponential(6) : "NA",
      Number.isFinite(eta) ? eta.toFixed(6) : "NA",
    ].join(",");
  lines.push(
    row(
      factorAName,
      result.termA.df1,
      result.termA.SS,
      result.termA.MS,
      result.termA.F,
      result.termA.p,
      result.termA.etaSqP
    )
  );
  lines.push(
    row(
      factorBName,
      result.termB.df1,
      result.termB.SS,
      result.termB.MS,
      result.termB.F,
      result.termB.p,
      result.termB.etaSqP
    )
  );
  lines.push(
    row(
      `${factorAName} × ${factorBName}`,
      result.termAB.df1,
      result.termAB.SS,
      result.termAB.MS,
      result.termAB.F,
      result.termAB.p,
      result.termAB.etaSqP
    )
  );
  lines.push(
    row("Residual", result.residual.df, result.residual.SS, result.residual.MS, NaN, NaN, NaN)
  );
  lines.push(row("Total", result.total.df, result.total.SS, NaN, NaN, NaN, NaN));
  return lines.join("\n");
}

// Plain-text formatted report. Mirrors what the in-app ReportStep shows
// but in monospace, suitable for copy-pasting into a lab notebook or
// methods section.
export function buildTextReport(input: FactorialReportInput): string {
  const { factorAName, factorBName, valueName, result } = input;
  const lines: string[] = [];
  const cap = result.N.toString().length + 2;
  const padR = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - s.length));
  const padL = (s: string, n: number): string => " ".repeat(Math.max(0, n - s.length)) + s;
  lines.push(`Plöttr — Factorial (2-factor) ANOVA`);
  lines.push(`Type II sums of squares  ·  Response: ${valueName}`);
  lines.push("");
  lines.push(
    `Design   : ${result.balanced ? "Balanced" : "Unbalanced"}, ${result.levelsA.length} × ${result.levelsB.length}`
  );
  lines.push(`N        : ${result.N} observations across ${result.cells.length} cells`);
  lines.push(`Factor A : ${factorAName} (${result.levelsA.join(", ")})`);
  lines.push(`Factor B : ${factorBName} (${result.levelsB.join(", ")})`);
  lines.push("");
  lines.push("ANOVA TABLE");
  lines.push("-----------");
  const head = [
    padR("term", 24),
    padL("df", 5),
    padL("SS", 14),
    padL("MS", 14),
    padL("F", 12),
    padL("p", 14),
    padL("η²_p", 8),
  ].join("  ");
  lines.push(head);
  const trow = (
    label: string,
    df: number,
    ss: number,
    ms: number,
    F: number,
    p: number,
    eta: number
  ): string =>
    [
      padR(label, 24),
      padL(df.toString(), 5),
      padL(Number.isFinite(ss) ? ss.toFixed(4) : "—", 14),
      padL(Number.isFinite(ms) ? ms.toFixed(4) : "—", 14),
      padL(Number.isFinite(F) ? F.toFixed(3) : "—", 12),
      padL(Number.isFinite(p) ? formatP(p) : "—", 14),
      padL(Number.isFinite(eta) ? eta.toFixed(3) : "—", 8),
    ].join("  ");
  lines.push(
    trow(
      factorAName,
      result.termA.df1,
      result.termA.SS,
      result.termA.MS,
      result.termA.F,
      result.termA.p,
      result.termA.etaSqP
    )
  );
  lines.push(
    trow(
      factorBName,
      result.termB.df1,
      result.termB.SS,
      result.termB.MS,
      result.termB.F,
      result.termB.p,
      result.termB.etaSqP
    )
  );
  lines.push(
    trow(
      `${factorAName} × ${factorBName}`,
      result.termAB.df1,
      result.termAB.SS,
      result.termAB.MS,
      result.termAB.F,
      result.termAB.p,
      result.termAB.etaSqP
    )
  );
  lines.push(
    trow("Residual", result.residual.df, result.residual.SS, result.residual.MS, NaN, NaN, NaN)
  );
  lines.push("");
  if (Number.isFinite(result.termAB.p) && result.termAB.p < 0.05) {
    lines.push(
      "⚠ Interaction is significant — main effects must be interpreted in the context of the interaction."
    );
    lines.push("");
  }
  lines.push("CELL MEANS");
  lines.push("----------");
  lines.push(
    [
      padR(factorAName, 18),
      padR(factorBName, 18),
      padL("n", cap),
      padL("mean", 12),
      padL("sd", 12),
    ].join("  ")
  );
  for (const c of result.cells) {
    lines.push(
      [
        padR(c.levelA, 18),
        padR(c.levelB, 18),
        padL(c.n.toString(), cap),
        padL(Number.isFinite(c.mean) ? c.mean.toFixed(4) : "—", 12),
        padL(Number.isFinite(c.sd) ? c.sd.toFixed(4) : "—", 12),
      ].join("  ")
    );
  }
  return lines.join("\n");
}

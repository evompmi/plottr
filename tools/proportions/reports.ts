// Pure string builders for the Proportions tool: long-format CSV with
// Wilson CIs, a plain-text statistics report, and a self-contained R script
// that reproduces every number (base R for the statistics, ggplot2 for the
// chart). User strings go through sanitizeRString / sanitizeRComment.

import { formatP } from "../_core/stats";
import { FISHER_MC_B } from "../_core/stats";
import { formatRNumber, sanitizeRComment, sanitizeRString, wrapRItems } from "../_shell/r-export";
import { formatPct, gofPerGroup } from "./helpers";
import type { ChartType, CountsTable, GroupSummary, ProportionsAnalysis } from "./helpers";
import type { PAdjustMethod } from "../_core/stats";

const rStr = (s: string): string => '"' + sanitizeRString(s) + '"';

// ── CSV ─────────────────────────────────────────────────────────────────

export function buildProportionsCsv(summaries: GroupSummary[], categories: string[]) {
  const headers = ["group", "category", "count", "n", "proportion", "wilson_lower", "wilson_upper"];
  const rows: (string | number)[][] = [];
  for (const s of summaries) {
    s.counts.forEach((x, c) => {
      const p = s.props[c];
      rows.push([s.group, categories[c], x, s.n, p.p, p.lower, p.upper]);
    });
  }
  return { headers, rows };
}

// ── Text report ─────────────────────────────────────────────────────────

export interface ReportArgs {
  fileName: string;
  chartType: ChartType;
  focusLabel: string | null;
  analysis: ProportionsAnalysis;
  summaries: GroupSummary[];
  displayedCategories: string[];
  adjust: PAdjustMethod;
  ratio: number[] | null;
  generatedAt?: string;
}

const fmtOR = (v: number | undefined): string =>
  v === undefined || Number.isNaN(v) ? "NA" : v === Infinity ? "Inf" : v.toPrecision(4);

export function buildProportionsReport(a: ReportArgs): string {
  const { analysis, summaries } = a;
  const t = analysis.table;
  const now = a.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const L: string[] = [];
  L.push("Plöttr — Proportions & counts report");
  L.push(`Generated: ${now}`);
  if (a.fileName) L.push(`Data: ${a.fileName}`);
  if (a.focusLabel) L.push(`Analysed outcome: ${a.focusLabel} vs. all other categories`);
  L.push("");
  L.push("Counts, proportions and Wilson 95 % confidence intervals");
  L.push("(Wilson score interval: Brown, Cai & DasGupta 2001, doi:10.1214/ss/1009213286)");
  for (const s of summaries) {
    L.push(`  ${s.group} (n = ${s.n})`);
    s.counts.forEach((x, c) => {
      const p = s.props[c];
      L.push(
        `    ${a.displayedCategories[c]}: ${x} = ${formatPct(p.p)} [${formatPct(p.lower)}, ${formatPct(p.upper)}]`
      );
    });
  }
  L.push("");
  if (analysis.error) {
    L.push("Test: not run (need at least 2 groups and 2 non-empty categories).");
    return L.join("\n") + "\n";
  }
  const sel = analysis.selection;
  L.push(
    `Expected counts: min = ${sel.minExpected.toFixed(2)}, ${sel.nExpectedBelow5} of ${sel.nCells} cells below 5`
  );
  if (analysis.fisher) {
    const f = analysis.fisher;
    L.push(
      `Fisher's exact test (${t.groups.length}×${t.categories.length}): p = ${formatP(f.p)}` +
        (f.method === "monteCarlo"
          ? ` (Monte-Carlo, B = ${f.B}, SE = ${(f.mcSE ?? 0).toFixed(4)})`
          : "")
    );
    if (f.oddsRatio !== undefined && f.orCI) {
      L.push(
        `  Odds ratio (conditional MLE) = ${fmtOR(f.oddsRatio)}, 95 % CI [${fmtOR(f.orCI[0])}, ${fmtOR(f.orCI[1])}]`
      );
    }
  } else {
    const c = analysis.chi2;
    L.push(
      `Pearson χ² test of independence: χ²(${c.df}) = ${c.X2.toFixed(4)}, p = ${formatP(c.p)}`
    );
  }
  if (!analysis.chi2.error) L.push(`Cramér's V = ${analysis.chi2.cramersV.toFixed(4)}`);
  if (analysis.pairs.length > 0) {
    L.push("");
    L.push(
      `Pairwise Fisher's exact tests (${a.adjust === "holm" ? "Holm" : "Benjamini–Hochberg"} adjusted)`
    );
    for (const pr of analysis.pairs) {
      L.push(
        `  ${t.groups[pr.i]} vs ${t.groups[pr.j]}: p = ${formatP(pr.p)}, adjusted p = ${formatP(pr.pAdj)}`
      );
    }
  }
  if (a.ratio) {
    L.push("");
    L.push(`Goodness of fit to ${a.ratio.join(":")} (Holm-adjusted across groups)`);
    for (const g of gofPerGroup(t, a.ratio)) {
      const how =
        g.result.method === "exact"
          ? "exact"
          : `χ²(${g.result.df}) = ${g.result.X2.toFixed(3)}${g.result.fallback ? " (too large for exact)" : ""}`;
      L.push(`  ${g.group}: ${how}, p = ${formatP(g.result.p)}, adjusted p = ${formatP(g.pAdj)}`);
    }
  }
  return L.join("\n") + "\n";
}

// ── R script ────────────────────────────────────────────────────────────

export interface RScriptArgs {
  analysis: ProportionsAnalysis;
  displayed: CountsTable;
  chartType: ChartType;
  adjust: PAdjustMethod;
  ratio: number[] | null;
  // Per category (stacked / mosaic) and per group (proportion chart).
  colors: string[];
  groupColors: string[];
  // Bar outline width in px (0 = none). ggplot linewidth is in mm-ish
  // units: 1 linewidth ≈ 96 / 72 / 0.75 ≈ 2.13 px at 96 dpi.
  outlineWidth: number;
  plotTitle: string;
  generatedAt?: string;
}

export function buildProportionsRScript(a: RScriptArgs): string {
  const { analysis, displayed } = a;
  const t = analysis.table;
  const now = a.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const L: string[] = [];
  L.push("# -----------------------------------------------------------------------------");
  L.push("# Plöttr — Proportions & counts R script export");
  L.push(`# Generated: ${now}`);
  L.push("# Base R reproduces every test; ggplot2 redraws the chart.");
  L.push("# -----------------------------------------------------------------------------");
  L.push("");
  L.push("counts <- matrix(");
  L.push(`  ${wrapRItems(t.counts.flat().map(formatRNumber), t.categories.length)},`);
  L.push(`  nrow = ${t.groups.length}, byrow = TRUE,`);
  L.push("  dimnames = list(");
  L.push(`    group = ${wrapRItems(t.groups.map(rStr))},`);
  L.push(`    outcome = ${wrapRItems(t.categories.map(rStr))}`);
  L.push("  )");
  L.push(")");
  L.push("print(counts)");
  L.push("n <- rowSums(counts)");
  L.push("");
  L.push("# Wilson 95 % CIs = prop.test(correct = FALSE)$conf.int");
  L.push("wilson <- function(x, n) prop.test(x, n, correct = FALSE)$conf.int[1:2]");
  L.push("summary_df <- do.call(rbind, lapply(rownames(counts), function(g) {");
  L.push("  do.call(rbind, lapply(colnames(counts), function(k) {");
  L.push("    ci <- suppressWarnings(wilson(counts[g, k], n[[g]]))");
  L.push("    data.frame(group = g, outcome = k, count = counts[g, k], n = n[[g]],");
  L.push("               prop = counts[g, k] / n[[g]], lower = ci[1], upper = ci[2])");
  L.push("  }))");
  L.push("}))");
  L.push("print(summary_df, digits = 4)");
  L.push("");
  L.push("# Expected counts under independence (Cochran: all >= 1, at most 20 % < 5)");
  L.push("print(suppressWarnings(chisq.test(counts))$expected)");
  L.push("");
  if (analysis.error) {
    L.push("# Not enough groups / categories for a test.");
  } else if (analysis.test === "fisher") {
    if (analysis.fisher?.method === "monteCarlo") {
      L.push("# Table too large for exact enumeration: Monte-Carlo p (as in Plöttr)");
      L.push(
        `fisher.test(counts, simulate.p.value = TRUE, B = ${analysis.fisher.B ?? FISHER_MC_B})`
      );
    } else {
      L.push("fisher.test(counts)");
    }
  } else {
    L.push("chisq.test(counts, correct = FALSE)");
    L.push("chisq.test(counts, correct = FALSE)$stdres  # standardised residuals");
  }
  L.push("cramers_v <- sqrt(suppressWarnings(chisq.test(counts, correct = FALSE))$statistic /");
  L.push("                  (sum(counts) * (min(dim(counts)) - 1)))");
  L.push("print(unname(cramers_v))");
  if (analysis.pairs.length > 0) {
    L.push("");
    L.push("# Pairwise Fisher's exact tests between groups");
    L.push("pairs <- combn(rownames(counts), 2)");
    L.push("p_raw <- apply(pairs, 2, function(ij) {");
    L.push("  sub <- counts[ij, , drop = FALSE]");
    L.push("  sub <- sub[, colSums(sub) > 0, drop = FALSE]");
    L.push("  if (ncol(sub) < 2) 1 else fisher.test(sub)$p.value");
    L.push("})");
    L.push(`p_adj <- p.adjust(p_raw, method = "${a.adjust === "holm" ? "holm" : "BH"}")`);
    L.push(
      'print(data.frame(pair = paste(pairs[1, ], "vs", pairs[2, ]), p = p_raw, p_adj = p_adj))'
    );
  }
  if (a.ratio) {
    L.push("");
    L.push(`# Goodness of fit to ${a.ratio.join(":")} per group (Holm across groups)`);
    L.push(`ratio <- c(${a.ratio.map(formatRNumber).join(", ")})`);
    L.push("prob <- ratio / sum(ratio)");
    L.push("# Exact multinomial p: sum of P(outcome) over outcomes no more likely");
    L.push("# than the observed one (same rule as binom.test / fisher.test).");
    L.push("exact_multinomial <- function(x, prob) {");
    L.push("  N <- sum(x); k <- length(x)");
    L.push("  if (k == 2) return(binom.test(x[1], N, prob[1])$p.value)");
    L.push("  grid <- as.matrix(expand.grid(rep(list(0:N), k - 1)))");
    L.push("  grid <- grid[rowSums(grid) <= N, , drop = FALSE]");
    L.push("  grid <- cbind(grid, N - rowSums(grid))");
    L.push("  d <- apply(grid, 1, dmultinom, prob = prob)");
    L.push("  min(1, sum(d[d <= dmultinom(x, prob = prob) * (1 + 1e-7)]))");
    L.push("}");
    L.push("gof <- t(sapply(rownames(counts), function(g) {");
    L.push("  x <- unname(counts[g, ])");
    L.push("  c(chisq_p = suppressWarnings(chisq.test(x, p = prob))$p.value,");
    L.push("    exact_p = if (choose(sum(x) + length(x) - 1, length(x) - 1) <= 2e6)");
    L.push("      exact_multinomial(x, prob) else NA)");
    L.push("}))");
    L.push("# p used: exact when computed, χ² otherwise (as in Plöttr); Holm across groups");
    L.push(
      'gof <- cbind(gof, p = ifelse(is.na(gof[, "exact_p"]), gof[, "chisq_p"], gof[, "exact_p"]))'
    );
    L.push('gof <- cbind(gof, p_holm = p.adjust(gof[, "p"], "holm"))');
    L.push("print(gof)");
  }
  L.push("");
  L.push("# ── Chart ──");
  L.push("library(ggplot2)");
  L.push(`summary_df$group <- factor(summary_df$group, levels = rownames(counts))`);
  L.push(`summary_df$outcome <- factor(summary_df$outcome, levels = colnames(counts))`);
  const title = a.plotTitle ? ` + ggtitle(${rStr(a.plotTitle)})` : "";
  const lw = formatRNumber(Math.round((a.outlineWidth / 2.13) * 100) / 100);
  // Outline on: black border; off: none on bars, white separators on stacks.
  const barEdge = a.outlineWidth > 0 ? `colour = "black", linewidth = ${lw}` : "colour = NA";
  const segEdge = a.outlineWidth > 0 ? `colour = "black", linewidth = ${lw}` : 'colour = "white"';
  if (a.chartType === "proportion") {
    L.push(`focus <- ${rStr(displayed.categories[0] ?? "")}`);
    L.push("d <- subset(summary_df, outcome == focus)");
    L.push(`group_pal <- ${wrapRItems(a.groupColors.slice(0, displayed.groups.length).map(rStr))}`);
    L.push("p <- ggplot(d, aes(group, 100 * prop, fill = group)) +");
    L.push(`  geom_col(${barEdge}, width = 0.6, show.legend = FALSE) +`);
    L.push("  scale_fill_manual(values = group_pal) +");
    L.push("  geom_errorbar(aes(ymin = 100 * lower, ymax = 100 * upper), width = 0.2) +");
    L.push('  scale_y_continuous(limits = c(0, 100), name = paste0("% ", focus)) +');
    L.push(`  xlab(NULL) + theme_classic()${title}`);
  } else {
    L.push(`pal <- ${wrapRItems(a.colors.slice(0, displayed.categories.length).map(rStr))}`);
    if (a.chartType === "mosaic") {
      L.push("d <- summary_df");
      L.push("w <- n / sum(n)");
      L.push("d$xmax <- cumsum(w)[as.integer(d$group)]");
      L.push("d$xmin <- d$xmax - w[as.integer(d$group)]");
      L.push("d <- d[order(d$group, d$outcome), ]; d$ymax <- ave(d$prop, d$group, FUN = cumsum)");
      L.push("d$ymin <- d$ymax - d$prop");
      L.push("p <- ggplot(d) +");
      L.push(
        "  geom_rect(aes(xmin = xmin, xmax = xmax, ymin = 100 * ymin, ymax = 100 * ymax, fill = outcome),"
      );
      L.push(`            ${segEdge}) +`);
      L.push(
        "  scale_x_continuous(breaks = (cumsum(w) - w / 2), labels = rownames(counts), name = NULL) +"
      );
    } else {
      L.push("p <- ggplot(summary_df, aes(group, 100 * prop, fill = outcome)) +");
      L.push(`  geom_col(position = position_stack(reverse = TRUE), ${segEdge}, width = 0.6) +`);
      L.push("  xlab(NULL) +");
    }
    L.push('  scale_fill_manual(values = pal, name = NULL) + ylab("%") +');
    L.push(`  theme_classic()${title}`);
  }
  L.push("print(p)");
  L.push(`# ${sanitizeRComment("End of Plöttr export")}`);
  return L.join("\n") + "\n";
}

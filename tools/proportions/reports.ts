// Pure string builders for the Proportions tool: long-format CSV with
// Wilson CIs, a plain-text statistics report, and a self-contained R script
// that reproduces every number (base R for the statistics, ggplot2 for the
// chart). User strings go through sanitizeRString / sanitizeRComment.

import { formatP } from "../_core/stats";
import { FISHER_MC_B } from "../_core/stats";
import { formatRNumber, sanitizeRComment, sanitizeRString, wrapRItems } from "../_shell/r-export";
import { assignBracketLevels } from "../_shell/bracket-levels";
import { formatPct, gofPerGroup, piesInOneRow } from "./helpers";
import type {
  AnnotationMode,
  BracketSpec,
  ChartType,
  CountsTable,
  GroupSummary,
  ProportionsAnalysis,
} from "./helpers";
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
    const adj = a.adjust === "holm" ? "Holm" : "Benjamini–Hochberg";
    const ctrl = analysis.control;
    L.push("");
    L.push(
      ctrl !== null
        ? `Fisher's exact tests vs. control ${t.groups[ctrl]} (${adj} adjusted over ${analysis.pairs.length} comparisons)`
        : `Pairwise Fisher's exact tests (${adj} adjusted)`
    );
    for (const pr of analysis.pairs) {
      const [x, y] = ctrl === pr.i ? [pr.j, pr.i] : [pr.i, pr.j];
      L.push(
        `  ${t.groups[x]} vs ${t.groups[y]}: p = ${formatP(pr.p)}, adjusted p = ${formatP(pr.pAdj)}`
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
  // Group-label tilt (−90…0°, SVG convention); ggplot's angle is the opposite sign.
  xLabelAngle: number;
  // Pie chart: facets per row.
  piesPerRow: number;
  // Marks drawn on the plot (the effective mode, see effectiveAnnotation) and
  // the brackets shown. The script draws them on pies when every pie sits on
  // one row, as the app does; omitted = no marks.
  annotation?: AnnotationMode;
  brackets?: BracketSpec[];
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
  const exactOmnibus = analysis.test === "fisher" && analysis.fisher?.method !== "monteCarlo";
  if (!analysis.error && (exactOmnibus || analysis.pairs.length > 0)) {
    pushFisherHelper(L);
    L.push("");
  }
  if (analysis.error) {
    L.push("# Not enough groups / categories for a test.");
  } else if (analysis.test === "fisher") {
    if (analysis.fisher?.method === "monteCarlo") {
      L.push("# Table too large for exact enumeration: Monte-Carlo p, as in Plöttr.");
      L.push("# DIFFERENCE WITH PLÖTTR: R draws its own random tables, so this p differs");
      L.push("# slightly from the app's (both have a Monte-Carlo error of about");
      L.push("# sqrt(p * (1 - p) / B)).");
      L.push(
        `fisher.test(counts, simulate.p.value = TRUE, B = ${analysis.fisher.B ?? FISHER_MC_B})`
      );
    } else {
      L.push("fisher_exact(counts)");
    }
  } else {
    L.push("chisq.test(counts, correct = FALSE)");
    L.push("chisq.test(counts, correct = FALSE)$stdres  # standardised residuals");
  }
  L.push("cramers_v <- sqrt(suppressWarnings(chisq.test(counts, correct = FALSE))$statistic /");
  L.push("                  (sum(counts) * (min(dim(counts)) - 1)))");
  L.push("print(unname(cramers_v))");
  if (analysis.pairs.length > 0 && analysis.control !== null) {
    L.push("");
    L.push("# Fisher's exact test of each group against the control only");
    L.push(`control <- ${rStr(analysis.table.groups[analysis.control])}`);
    L.push("others <- setdiff(rownames(counts), control)");
    L.push("p_raw <- sapply(others, function(g) {");
    L.push("  sub <- counts[c(control, g), , drop = FALSE]");
    L.push("  sub <- sub[, colSums(sub) > 0, drop = FALSE]");
    L.push("  if (ncol(sub) < 2) 1 else fisher_exact(sub)$p.value");
    L.push("})");
    L.push(`p_adj <- p.adjust(p_raw, method = "${a.adjust === "holm" ? "holm" : "BH"}")`);
    L.push('print(data.frame(pair = paste(others, "vs", control), p = p_raw, p_adj = p_adj))');
  } else if (analysis.pairs.length > 0) {
    L.push("");
    L.push("# Pairwise Fisher's exact tests between groups");
    L.push("pairs <- combn(rownames(counts), 2)");
    L.push("p_raw <- apply(pairs, 2, function(ij) {");
    L.push("  sub <- counts[ij, , drop = FALSE]");
    L.push("  sub <- sub[, colSums(sub) > 0, drop = FALSE]");
    L.push("  if (ncol(sub) < 2) 1 else fisher_exact(sub)$p.value");
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
  const tilt =
    a.xLabelAngle < 0 && a.chartType !== "pie"
      ? ` +\n  theme(axis.text.x = element_text(angle = ${formatRNumber(-a.xLabelAngle)}, hjust = 1, vjust = 1))`
      : "";
  const title = (a.plotTitle ? ` + ggtitle(${rStr(a.plotTitle)})` : "") + tilt;
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
  } else if (a.chartType === "pie" && pieMarks(a)) {
    pushPieMarksChart(L, a, segEdge, title);
  } else if (a.chartType === "pie") {
    const k = displayed.groups.length;
    const ncol = Math.max(1, Math.min(Math.max(1, k), Math.round(a.piesPerRow) || 1));
    L.push(`pal <- ${wrapRItems(a.colors.slice(0, displayed.categories.length).map(rStr))}`);
    L.push("# One pie per group, clockwise from 12 o'clock, first outcome first");
    L.push('p <- ggplot(summary_df, aes(x = "", y = prop, fill = outcome)) +');
    L.push(`  geom_col(position = position_stack(reverse = TRUE), ${segEdge}, width = 1) +`);
    L.push('  coord_polar(theta = "y", start = 0, direction = 1) +');
    L.push(`  facet_wrap(~ group, ncol = ${ncol}) +`);
    L.push("  scale_fill_manual(values = pal, name = NULL) +");
    L.push(`  theme_void()${title}`);
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

// Brackets or letters to draw on pies: only when every pie sits on one row.
function pieMarks(a: RScriptArgs): "brackets" | "cld" | null {
  if (a.analysis.error || !piesInOneRow(a.displayed.groups.length, a.piesPerRow)) return null;
  if (a.annotation === "brackets" && (a.brackets?.length ?? 0) > 0) return "brackets";
  if (a.annotation === "cld" && a.analysis.cld.some((s) => s !== "")) return "cld";
  return null;
}

// Pies on one row as polygons on shared x / y axes (pie i centred at x = i),
// so brackets can span pies the way they span bars.
function pushPieMarksChart(L: string[], a: RScriptArgs, segEdge: string, title: string): void {
  L.push(`pal <- ${wrapRItems(a.colors.slice(0, a.displayed.categories.length).map(rStr))}`);
  L.push("# Pies on one row, drawn as polygons so the marks can span them:");
  L.push("# radius 0.45, clockwise from 12 o'clock, first outcome first");
  L.push("slices <- do.call(rbind, lapply(seq_len(nrow(counts)), function(i) {");
  L.push("  if (n[[i]] == 0) return(NULL)");
  L.push("  a <- 2 * pi * c(0, cumsum(counts[i, ])) / n[[i]]");
  L.push("  do.call(rbind, lapply(which(counts[i, ] > 0), function(s) {");
  L.push("    th <- seq(a[s], a[s + 1], length.out = 2 + ceiling(30 * (a[s + 1] - a[s])))");
  L.push("    whole <- counts[i, s] == n[[i]]  # a full disc: no centre point, no seam");
  L.push("    data.frame(pie = i, outcome = colnames(counts)[s],");
  L.push("               x = c(if (!whole) i, i + 0.45 * sin(th)),");
  L.push("               y = c(if (!whole) 0, 0.45 * cos(th)))");
  L.push("  }))");
  L.push("}))");
  L.push("slices$outcome <- factor(slices$outcome, levels = colnames(counts))");
  L.push("p <- ggplot(slices, aes(x, y, group = interaction(pie, outcome), fill = outcome)) +");
  L.push(`  geom_polygon(${segEdge}) +`);
  L.push('  annotate("text", x = seq_len(nrow(counts)), y = -0.55, label = rownames(counts),');
  L.push("           vjust = 1) +");
  L.push("  scale_fill_manual(values = pal, name = NULL, drop = FALSE) +");
  L.push(`  coord_equal(clip = "off") + theme_void()${title}`);
  if (pieMarks(a) === "brackets") {
    const lv = assignBracketLevels(a.brackets ?? []);
    L.push("# Significance brackets (adjusted p), stacked so none overlap");
    L.push("brackets <- data.frame(");
    L.push(`  from = c(${lv.map((b) => Math.min(b.i, b.j) + 1).join(", ")}),`);
    L.push(`  to = c(${lv.map((b) => Math.max(b.i, b.j) + 1).join(", ")}),`);
    L.push(`  level = c(${lv.map((b) => b._level).join(", ")}),`);
    L.push(`  label = ${wrapRItems(lv.map((b) => rStr(b.label)))}`);
    L.push(")");
    L.push("brackets$y <- 0.55 + 0.14 * brackets$level");
    L.push("p <- p +");
    L.push(
      '  annotate("segment", x = brackets$from, xend = brackets$to, y = brackets$y, yend = brackets$y) +'
    );
    L.push('  annotate("segment", x = c(brackets$from, brackets$to),');
    L.push("           xend = c(brackets$from, brackets$to),");
    L.push("           y = rep(brackets$y, 2) - 0.04, yend = rep(brackets$y, 2)) +");
    L.push('  annotate("text", x = (brackets$from + brackets$to) / 2, y = brackets$y + 0.01,');
    L.push("           label = brackets$label, vjust = 0)");
  } else {
    L.push("# Compact letter display: pies sharing a letter do not differ");
    L.push(`cld <- ${wrapRItems(a.analysis.cld.map(rStr))}`);
    L.push(
      'p <- p + annotate("text", x = seq_len(nrow(counts)), y = 0.55, label = cld, vjust = 0)'
    );
  }
}

// R's fisher.test (network algorithm) can stop with "FEXACT error … increase
// workspace" on tables Plöttr still enumerates exactly. The helper retries
// with more workspace and only then falls back to a simulated p, saying so.
function pushFisherHelper(L: string[]): void {
  L.push("# fisher_exact(): Fisher's exact test, as computed by Plöttr.");
  L.push("# DIFFERENCE WITH PLÖTTR: on larger tables R's fisher.test() can stop with");
  L.push('# "FEXACT error ... increase workspace" where Plöttr still gets the exact p');
  L.push("# (it enumerates the tables itself). R is retried with more workspace; if");
  L.push("# that still fails, R falls back to a Monte-Carlo p (B = 20000), which can");
  L.push("# differ from Plöttr's exact p in the last digits. A message says when.");
  L.push("fisher_exact <- function(tab) {");
  L.push("  name <- deparse(substitute(tab))  # print data: counts, not data: tab");
  L.push("  for (ws in c(2e5, 2e6, 2e7, 1e8)) {");
  L.push("    res <- tryCatch(fisher.test(tab, workspace = ws), error = function(e) NULL)");
  L.push("    if (!is.null(res)) { res$data.name <- name; return(res) }");
  L.push("  }");
  L.push('  message("fisher.test: exact p out of reach in R for this table; using a ",');
  L.push(
    '          "Monte-Carlo p (B = 20000), which may differ slightly from the app\'s exact p")'
  );
  L.push(`  res <- fisher.test(tab, simulate.p.value = TRUE, B = ${FISHER_MC_B})`);
  L.push("  res$data.name <- name");
  L.push("  res");
  L.push("}");
}

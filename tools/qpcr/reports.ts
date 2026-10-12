// Pure string builders for the qPCR tool: plain-text statistics report and a
// self-contained R script that recomputes ΔCt / −ΔΔCt from the raw Ct values
// and runs the same tests (calls match _shell/r-export.ts, so the script
// reads like Group Plot's export). User strings go through sanitizeRString /
// sanitizeRComment.

import { formatP } from "../_core/stats";
import { formatRNumber, sanitizeRComment, sanitizeRString, wrapRItems } from "../_shell/r-export";
import { efficiencyPercent, formatResultLine } from "./helpers";
import type { GeneAnalysis, GeneStats, NoisyRep, QpcrConfig, Well } from "./helpers";

const rStr = (s: string): string => '"' + sanitizeRString(s) + '"';
const fc = (log2: number): string =>
  Number.isFinite(log2) ? Math.pow(2, log2).toPrecision(4) : "NA";

const TEST_LABELS: Record<string, string> = {
  studentT: "Student's t-test",
  welchT: "Welch's t-test",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};
const POSTHOC_LABELS: Record<string, string> = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

export interface QpcrReportArgs {
  fileName: string;
  cfg: QpcrConfig;
  genes: GeneAnalysis[];
  stats: GeneStats[];
  missingCt: number;
  noisy: NoisyRep[];
  genorm: Record<string, number>;
  generatedAt?: string;
}

export function buildQpcrReport(a: QpcrReportArgs): string {
  const now = a.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const L: string[] = [];
  L.push("Plöttr — qPCR relative quantification report");
  L.push(`Generated: ${now}`);
  if (a.fileName) L.push(`Data: ${a.fileName}`);
  L.push("");
  const allTwo = [...a.cfg.refs, ...a.cfg.targets].every((g) => (a.cfg.eff[g] ?? 2) === 2);
  L.push(
    allTwo
      ? "Method: 2^−ΔΔCt (Livak & Schmittgen 2001, doi:10.1006/meth.2001.1262), all efficiencies 100 %."
      : "Method: efficiency-corrected ratio (Pfaffl 2001, doi:10.1093/nar/29.9.e45)."
  );
  L.push(
    `Reference gene(s): ${a.cfg.refs.join(", ")}` +
      (a.cfg.refs.length > 1
        ? " — geometric mean (Vandesompele et al. 2002, doi:10.1186/gb-2002-3-7-research0034)"
        : "")
  );
  L.push(
    "Efficiencies: " +
      [...a.cfg.refs, ...a.cfg.targets]
        .map((g) => `${g} ${efficiencyPercent(a.cfg.eff[g] ?? 2).toFixed(1)} %`)
        .join(", ")
  );
  L.push(`Calibrator (control group): ${a.cfg.control}`);
  L.push(
    "ΔCt = log2-weighted Ct(target) − mean log2-weighted Ct(references); −ΔΔCt = mean ΔCt(control) − ΔCt."
  );
  L.push("Statistical tests were run on ΔCt (log scale), not on fold changes.");
  if (a.missingCt > 0) L.push(`Wells without a Ct (undetermined / missing): ${a.missingCt}`);
  if (a.noisy.length > 0) {
    L.push(`Technical replicates with SD > 0.5 cycles: ${a.noisy.length}`);
    for (const n of a.noisy)
      L.push(`  ${n.group} / ${n.sample} / ${n.gene}: SD = ${n.sd.toFixed(2)}`);
  }
  const gm = Object.entries(a.genorm);
  if (gm.length) {
    L.push(
      "geNorm stability M (lower = more stable): " +
        gm.map(([g, m]) => `${g} ${m.toFixed(3)}`).join(", ")
    );
  }
  a.genes.forEach((g, i) => {
    const st = a.stats[i];
    L.push("");
    L.push(`── ${g.gene} ──`);
    if (g.dropped.length) {
      L.push(
        `Samples left out (missing Ct): ${g.dropped.map((d) => `${d.group}/${d.sample}`).join(", ")}`
      );
    }
    for (const s of g.summaries) {
      const vs = g.vsControl.find((v) => v.group === s.group);
      L.push(
        `  ${s.group}: n = ${s.n}, ΔCt = ${s.meanDCt.toFixed(3)}` +
          (Number.isFinite(s.sdDCt) ? ` ± ${s.sdDCt.toFixed(3)} (SD)` : "") +
          (s.group === a.cfg.control
            ? ", calibrator (fold change 1)"
            : vs
              ? `, fold change vs ${a.cfg.control} = ${fc(vs.log2fc)} [95 % CI ${fc(vs.lo)}, ${fc(vs.hi)}]`
              : "")
      );
    }
    if (st.chosenTest) {
      L.push(
        `  Test on ΔCt: ${TEST_LABELS[st.chosenTest] ?? st.chosenTest} — ${formatResultLine(st.chosenTest, st.testResult)}`
      );
      if (st.rec?.recommendation?.reason) L.push(`  Why: ${st.rec.recommendation.reason}`);
    } else {
      L.push("  No test (need at least two groups with n ≥ 2).");
    }
    if (st.postHocResult && !st.postHocResult.error && st.postHocName) {
      L.push(`  Post-hoc: ${POSTHOC_LABELS[st.postHocName] ?? st.postHocName}`);
      for (const pr of st.postHocResult.pairs) {
        const p = pr.pAdj != null ? pr.pAdj : pr.p;
        L.push(
          `    ${g.groups[st.tested[pr.j]]} vs ${g.groups[st.tested[pr.i]]}: p = ${formatP(p)}`
        );
      }
    }
  });
  return L.join("\n") + "\n";
}

// ── R script ────────────────────────────────────────────────────────────

export interface QpcrRScriptArgs {
  wells: Well[];
  cfg: QpcrConfig;
  genes: GeneAnalysis[];
  stats: GeneStats[];
  generatedAt?: string;
}

function testCall(test: string | null): string {
  switch (test) {
    case "studentT":
      return "print(t.test(value ~ group, data = df, var.equal = TRUE))";
    case "welchT":
      return "print(t.test(value ~ group, data = df, var.equal = FALSE))";
    case "mannWhitney":
      return "print(wilcox.test(value ~ group, data = df, exact = FALSE))";
    case "oneWayANOVA":
      return "print(summary(aov(value ~ group, data = df)))";
    case "welchANOVA":
      return "print(oneway.test(value ~ group, data = df, var.equal = FALSE))";
    case "kruskalWallis":
      return "print(kruskal.test(value ~ group, data = df))";
    default:
      return "# (no test: fewer than two groups with n >= 2)";
  }
}

function postHocCall(name: string | null): string | null {
  if (name === "tukeyHSD") return "print(TukeyHSD(aov(value ~ group, data = df)))";
  if (name === "gamesHowell") return "print(rstatix::games_howell_test(df, value ~ group))";
  if (name === "dunn")
    return 'print(rstatix::dunn_test(df, value ~ group, p.adjust.method = "BH"))';
  return null;
}

export function buildQpcrRScript(a: QpcrRScriptArgs): string {
  const now = a.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const genesUsed = new Set([...a.cfg.refs, ...a.cfg.targets]);
  const wells = a.wells.filter((w) => genesUsed.has(w.gene) && a.cfg.groupOrder.includes(w.group));
  const needsRstatix = a.stats.some(
    (s) => s.postHocName === "gamesHowell" || s.postHocName === "dunn"
  );
  const L: string[] = [];
  L.push("# -----------------------------------------------------------------------------");
  L.push("# Plöttr — qPCR relative quantification R script export");
  L.push(`# Generated: ${now}`);
  L.push("# Recomputes ΔCt / −ΔΔCt from the raw Ct values, then runs the tests on ΔCt");
  L.push("# (log scale) — never on 2^−ΔΔCt fold changes.");
  L.push("# -----------------------------------------------------------------------------");
  if (needsRstatix) L.push('# install.packages("rstatix")');
  L.push("");
  L.push("wells <- data.frame(");
  L.push(`  group  = ${wrapRItems(wells.map((w) => rStr(w.group)))},`);
  L.push(`  sample = ${wrapRItems(wells.map((w) => rStr(w.sample)))},`);
  L.push(`  gene   = ${wrapRItems(wells.map((w) => rStr(w.gene)))},`);
  L.push(`  ct     = ${wrapRItems(wells.map((w) => formatRNumber(w.ct)))}`);
  L.push(")");
  L.push(`refs <- ${wrapRItems(a.cfg.refs.map(rStr))}`);
  L.push(`targets <- ${wrapRItems(a.cfg.targets.map(rStr))}`);
  L.push(
    `eff <- c(${[...genesUsed].map((g) => `${rStr(g)} = ${formatRNumber(a.cfg.eff[g] ?? 2)}`).join(", ")})  # amplification factor, 2 = 100 %`
  );
  L.push(`control <- ${rStr(a.cfg.control)}`);
  L.push(`group_levels <- ${wrapRItems(a.cfg.groupOrder.map(rStr))}`);
  L.push("");
  L.push("# Technical replicates: mean Ct per biological sample × gene (missing Ct dropped)");
  L.push("tech <- aggregate(ct ~ group + sample + gene, data = wells, FUN = mean)");
  L.push('bio <- unique(tech[, c("group", "sample")])');
  L.push("ct_of <- function(g) {");
  L.push("  m <- tech[tech$gene == g, ]");
  L.push("  m$ct[match(paste(bio$group, bio$sample), paste(m$group, m$sample))]");
  L.push("}");
  L.push("# log2 relative quantity; reference = mean over refs = log2 of their geometric mean");
  L.push("q <- function(g) -ct_of(g) * log2(eff[[g]])");
  L.push("q_ref <- rowMeans(do.call(cbind, lapply(refs, q)))");
  L.push("");
  a.genes.forEach((g, i) => {
    const st = a.stats[i];
    L.push(`# ── ${sanitizeRComment(g.gene)} ──`);
    L.push(`gene <- ${rStr(g.gene)}`);
    L.push(
      "df <- data.frame(group = factor(bio$group, levels = group_levels), sample = bio$sample,"
    );
    L.push("                 dct = q_ref - q(gene))");
    L.push("df <- df[is.finite(df$dct) & !is.na(df$group), ]");
    L.push("calibrator <- mean(df$dct[df$group == control])");
    L.push("df$neg_ddct <- calibrator - df$dct");
    L.push("df$fold_change <- 2^df$neg_ddct");
    L.push("df$value <- df$dct  # tests run on ΔCt");
    L.push("print(df[order(df$group, df$sample), ], digits = 5)");
    L.push(`# Toolbox picked: ${TEST_LABELS[st.chosenTest ?? ""] ?? "none"}`);
    const tested = st.tested.map((k) => g.groups[k]);
    if (tested.length < g.groups.length) {
      L.push(
        `df <- droplevels(df[df$group %in% ${wrapRItems(tested.map(rStr))}, ])  # groups with n >= 2`
      );
    }
    L.push(testCall(st.chosenTest));
    const ph = st.tested.length > 2 ? postHocCall(st.postHocName) : null;
    if (ph) L.push(ph);
    L.push("");
  });
  return L.join("\n");
}

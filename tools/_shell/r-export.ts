// Generates a runnable R script from the StatsTile decision trace so the
// user can paste it into RStudio and reproduce the exact same tests in a
// "real" statistics environment. Closes the "no reproducibility trail"
// gap called out in the README's Scope & limitations section.
//
// Public exports:
//   buildRScript(ctx)             — for data-driven stats (boxplot, aequorin)
//   buildRScriptForPower(state)   — for the power-analysis tool
//   sanitizeRString(s)            — escape " and \ for safe R string inlining
//   sanitizeRComment(s)           — strip line terminators for `#` comments
//   formatRNumber(n)              — Number → R literal (period decimals,
//                                   NA for non-finite)
//   formatRVector(arr)            — [n] → "c(n1, n2, ...)"
//
// The ctx shape matches the StatsTile's internal report-builder shape so
// the R-script chip can reuse the exact same context object without
// threading new props.

import { STATS_TEST_REGISTRY, STATS_POSTHOC_REGISTRY } from "./stats-registry";

// Test / post-hoc display labels are sourced from the shared registry —
// same labels the StatsTile uses on screen, so the R script's
// `# Welch's t-test` comment matches the test name shown to the user.
// The R-code generation below still has per-test branches because each
// test produces a different R function call (`t.test`, `wilcox.test`,
// `oneway.test`, …) — the dispatch lives in this file because the
// emitted strings are R-specific, not part of the JS dispatcher
// surface that the registry collapses.
const _R_TEST_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_TEST_REGISTRY).map((entry) => [entry[0], entry[1].label])
);

const _R_POSTHOC_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_POSTHOC_REGISTRY).map((entry) => [entry[0], entry[1].label])
);

export function sanitizeRString(s: unknown): string {
  // Escape backslashes first, then double-quotes. All line terminators
  // (LF, CR, NEL, LS, PS) are flattened to a single space — a multi-line
  // factor level is almost certainly a paste accident and would break
  // the one-line data.frame layout. The CR strip is also a
  // security-relevant defence: R's lexer treats `\r` as a statement
  // terminator inside source files, so a column name like
  // `"foo\rsystem('cmd')"` would otherwise escape the surrounding R
  // string in some contexts.
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n\u0085\u2028\u2029]/g, " ");
}

// For any user-supplied string that lands in a `# ...` R comment line.
// `sanitizeRString` is for *quoted* string literals; comments need a
// stricter scrub — a CR or LF inside a comment ends the comment, so any
// embedded line terminator must be flattened. Backslashes / quotes are
// left alone (they're harmless inside a comment).
export function sanitizeRComment(s: unknown): string {
  return String(s).replace(/[\r\n\u0085\u2028\u2029]/g, " ");
}

export function formatRNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "NA";
  return String(n);
}

export function formatRVector(arr: Array<number | null | undefined>): string {
  return "c(" + arr.map(formatRNumber).join(", ") + ")";
}

// Wrap a long c(...) literal across multiple indented lines so the
// generated script stays readable when group sizes get into the dozens.
function _wrapC(items: string[], perLine?: number): string {
  const P = perLine || 8;
  if (items.length <= P) return "c(" + items.join(", ") + ")";
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += P) {
    lines.push("    " + items.slice(i, i + P).join(", "));
  }
  return "c(\n" + lines.join(",\n") + "\n  )";
}

// Build a long-format data.frame literal: one row per observation, columns
// `group` (character, re-factored with the tile's display order) and `value`.
function _longFormatDataFrame(names: string[], values: number[][], varName?: string): string {
  const vn = varName || "df";
  const groupEntries: string[] = [];
  const valueEntries: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const quoted = '"' + sanitizeRString(names[i]) + '"';
    const vs = values[i] || [];
    for (let j = 0; j < vs.length; j++) {
      groupEntries.push(quoted);
      valueEntries.push(formatRNumber(vs[j]));
    }
  }
  const levels = names.map((n) => '"' + sanitizeRString(n) + '"').join(", ");
  return [
    vn + " <- data.frame(",
    "  group = " + _wrapC(groupEntries) + ",",
    "  value = " + _wrapC(valueEntries) + ",",
    "  stringsAsFactors = FALSE",
    ")",
    vn + "$group <- factor(" + vn + "$group, levels = c(" + levels + "))",
  ].join("\n");
}

function _rPackagesFor(postHocName: string | null | undefined): string[] {
  const pkgs = ["car"];
  if (postHocName === "gamesHowell" || postHocName === "dunn") pkgs.push("rstatix");
  return pkgs;
}

function _headerComment(generated: string, dataNote: string | null | undefined): string {
  const lines = [
    "# -----------------------------------------------------------------------------",
    "# Plöttr — R script export",
    "# Generated: " + generated,
    "#",
    "# This script reproduces the statistical tests run in the browser tool.",
    "# Plots are intentionally omitted — regenerate them in ggplot2 from `df` below.",
  ];
  if (dataNote) {
    lines.push("#");
    // Split on every line-terminator R recognises so a hostile multi-line
    // `dataNote` becomes multiple comment lines — each one then run through
    // sanitizeRComment so a stray terminator the split missed still can't
    // escape the comment.
    const noteLines = String(dataNote).split(/\r\n|[\r\n\u0085\u2028\u2029]/);
    for (let i = 0; i < noteLines.length; i++) {
      lines.push("# " + sanitizeRComment(noteLines[i]));
    }
  }
  lines.push("# -----------------------------------------------------------------------------");
  return lines.join("\n");
}

function _mainTestBlock(chosenTest: string | null | undefined): string {
  const header = "# --- Main test ---------------------------------------------------------------";
  const label = (chosenTest && _R_TEST_LABELS[chosenTest]) || chosenTest || "—";
  const pickComment = "# Toolbox picked: " + label;
  let call: string;
  if (chosenTest === "studentT") {
    call = "t.test(value ~ group, data = df, var.equal = TRUE)";
  } else if (chosenTest === "welchT") {
    call = "t.test(value ~ group, data = df, var.equal = FALSE)";
  } else if (chosenTest === "mannWhitney") {
    call = "wilcox.test(value ~ group, data = df, exact = FALSE)";
  } else if (chosenTest === "oneWayANOVA") {
    call = "fit <- aov(value ~ group, data = df)\nsummary(fit)";
  } else if (chosenTest === "welchANOVA") {
    call = "oneway.test(value ~ group, data = df, var.equal = FALSE)";
  } else if (chosenTest === "kruskalWallis") {
    call = "kruskal.test(value ~ group, data = df)";
  } else {
    call = "# (no inferential test was run)";
  }
  return [header, pickComment, call].join("\n");
}

function _postHocBlock(postHocName: string | null | undefined, k: number): string {
  if (!postHocName || k < 3) return "";
  const header = "# --- Post-hoc ----------------------------------------------------------------";
  const label = _R_POSTHOC_LABELS[postHocName] || postHocName;
  const pickComment = "# Toolbox picked: " + label;
  let call: string;
  if (postHocName === "tukeyHSD") {
    call = "TukeyHSD(aov(value ~ group, data = df))";
  } else if (postHocName === "gamesHowell") {
    call = "rstatix::games_howell_test(df, value ~ group)";
  } else if (postHocName === "dunn") {
    call = 'rstatix::dunn_test(df, value ~ group, p.adjust.method = "BH")';
  } else {
    call = "# (unknown post-hoc)";
  }
  return [header, pickComment, call].join("\n");
}

export interface BuildRScriptCtx {
  names?: string[];
  values?: number[][];
  recommendation?: { recommendation?: { reason?: string } } | null;
  chosenTest?: string | null;
  postHocName?: string | null;
  dataNote?: string | null;
  generatedAt?: string;
}

export function buildRScript(ctx: BuildRScriptCtx | null | undefined): string {
  const names = (ctx && ctx.names) || [];
  const values = (ctx && ctx.values) || [];
  const recommendation = ctx && ctx.recommendation;
  const chosenTest = ctx && ctx.chosenTest;
  const postHocName = ctx && ctx.postHocName;
  const dataNote = ctx && ctx.dataNote;
  const generated = (ctx && ctx.generatedAt) || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const k = names.length;
  const pkgs = _rPackagesFor(postHocName);

  const parts: string[] = [];
  parts.push(_headerComment(generated, dataNote));
  parts.push("");
  parts.push("# install.packages(c(" + pkgs.map((p) => '"' + p + '"').join(", ") + "))");
  for (let i = 0; i < pkgs.length; i++) parts.push("library(" + pkgs[i] + ")");
  parts.push("");

  parts.push(_longFormatDataFrame(names, values, "df"));
  parts.push("");

  parts.push("# --- Descriptive statistics --------------------------------------------------");
  parts.push("desc <- do.call(rbind, by(df$value, df$group, function(v) {");
  parts.push("  n    <- length(v)");
  parts.push("  m    <- mean(v)");
  parts.push("  s    <- if (n > 1) sd(v) else 0");
  parts.push("  sem  <- if (n > 1) s / sqrt(n) else 0");
  parts.push("  ci95 <- if (n > 1) qt(0.975, n - 1) * sem else 0");
  parts.push("  data.frame(n = n, mean = m, sd = s, sem = sem, ci95 = ci95)");
  parts.push("}))");
  parts.push("print(desc)");
  parts.push("");

  parts.push("# --- Assumptions -------------------------------------------------------------");
  parts.push("by(df$value, df$group, shapiro.test)");
  parts.push('car::leveneTest(value ~ group, data = df, center = "median")');
  parts.push("");

  parts.push(_mainTestBlock(chosenTest));

  const ph = _postHocBlock(postHocName, k);
  if (ph) {
    parts.push("");
    parts.push(ph);
  }

  const reason =
    recommendation && recommendation.recommendation && recommendation.recommendation.reason;
  if (reason) {
    parts.push("");
    parts.push("# Decision-tree rationale (from the toolbox):");
    const rLines = String(reason).split(/\r\n|[\r\n\u0085\u2028\u2029]/);
    for (let i = 0; i < rLines.length; i++) parts.push("#   " + sanitizeRComment(rLines[i]));
  }

  return parts.join("\n") + "\n";
}

// ── Power analysis ─────────────────────────────────────────────────────

const _R_POWER_TEST_LABELS: Record<string, string> = {
  "t-ind": "Two-sample t-test (independent)",
  "t-paired": "Paired t-test",
  "t-one": "One-sample t-test",
  anova: "One-way ANOVA",
  chi2: "Chi-square test",
  correlation: "Correlation test",
};

function _tTypeForTestKey(testKey: string): string | null {
  if (testKey === "t-ind") return "two.sample";
  if (testKey === "t-paired") return "paired";
  if (testKey === "t-one") return "one.sample";
  return null;
}

function _alternativeForTails(tails: number | undefined): string {
  return tails === 1 ? "one.sided" : "two.sided";
}

function _pwrArg(
  arg: string,
  value: number | null | undefined,
  solveFor: string | undefined,
  annotation?: string
): string {
  const isSolveTarget =
    (arg === "n" && solveFor === "n") || (arg === "power" && solveFor === "power");
  const rhs = isSolveTarget ? "NULL" : formatRNumber(value);
  const suffix = isSolveTarget ? "  # <- solve for this" : annotation ? "  # " + annotation : "";
  return "  " + arg + " = " + rhs + "," + suffix;
}

function _pwrArgString(arg: string, value: string | null): string {
  return "  " + arg + ' = "' + value + '",';
}

export interface PowerScriptState {
  testKey?: string;
  solveFor?: string;
  es?: number;
  n?: number;
  alpha?: number;
  power?: number;
  tails?: number;
  k?: number;
  df?: number;
  result?: number | null;
  generatedAt?: string;
}

function _pwrCallBody(testKey: string, state: PowerScriptState): string[] {
  const solveFor = state.solveFor;
  const tTypeArg = _tTypeForTestKey(testKey);
  const lines: string[] = [];
  if (testKey === "t-ind" || testKey === "t-paired" || testKey === "t-one") {
    lines.push(_pwrArg("n", state.n, solveFor));
    lines.push(_pwrArg("d", state.es, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
    lines.push(_pwrArgString("type", tTypeArg));
    lines.push(_pwrArgString("alternative", _alternativeForTails(state.tails)));
  } else if (testKey === "anova") {
    lines.push(_pwrArg("k", state.k, solveFor));
    lines.push(_pwrArg("n", state.n, solveFor));
    lines.push(_pwrArg("f", state.es, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
  } else if (testKey === "chi2") {
    lines.push(_pwrArg("w", state.es, solveFor));
    // pwr::pwr.chisq.test uses N (not n) for the total sample size.
    const Ntag = solveFor === "n" ? "NULL" : formatRNumber(state.n);
    const Nsuffix = solveFor === "n" ? "  # <- solve for this" : "";
    lines.push("  N = " + Ntag + "," + Nsuffix);
    lines.push(_pwrArg("df", state.df, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
  } else if (testKey === "correlation") {
    lines.push(_pwrArg("n", state.n, solveFor));
    lines.push(_pwrArg("r", state.es, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
    lines.push(_pwrArgString("alternative", _alternativeForTails(state.tails)));
  }
  // Drop the trailing comma from whatever the last non-comment line is.
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    const commentIdx = ln.indexOf("#");
    const beforeComment = commentIdx >= 0 ? ln.slice(0, commentIdx) : ln;
    const trimmed = beforeComment.replace(/,\s*$/, " ");
    lines[i] = commentIdx >= 0 ? trimmed + ln.slice(commentIdx) : trimmed.replace(/\s+$/, "");
    break;
  }
  return lines;
}

function _pwrCallName(testKey: string | undefined): string | null {
  if (testKey === "t-ind" || testKey === "t-paired" || testKey === "t-one") {
    return "pwr::pwr.t.test";
  }
  if (testKey === "anova") return "pwr::pwr.anova.test";
  if (testKey === "chi2") return "pwr::pwr.chisq.test";
  if (testKey === "correlation") return "pwr::pwr.r.test";
  return null;
}

export function buildRScriptForPower(state: PowerScriptState | null | undefined): string {
  const s = state || {};
  const testKey = s.testKey;
  const call = testKey ? _pwrCallName(testKey) : null;
  const generated = s.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const lines: string[] = [];
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("# Plöttr — Power analysis R export");
  lines.push("# Generated: " + generated);
  lines.push("#");
  lines.push(
    "# Test:        " + ((testKey && _R_POWER_TEST_LABELS[testKey]) || testKey || "(unknown)")
  );
  lines.push(
    "# Solving for: " +
      (s.solveFor === "n"
        ? "sample size (n)"
        : s.solveFor === "power"
          ? "power"
          : s.solveFor || "(unknown)")
  );
  lines.push("#");
  lines.push("# Required package:");
  lines.push('#   install.packages("pwr")');
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("");
  lines.push("library(pwr)");
  lines.push("");

  if (!call || !testKey) {
    lines.push("# (unknown test id — no pwr call emitted)");
    return lines.join("\n") + "\n";
  }

  lines.push(call + "(");
  const body = _pwrCallBody(testKey, s);
  for (let i = 0; i < body.length; i++) lines.push(body[i]);
  lines.push(")");

  if (s.result != null && Number.isFinite(s.result)) {
    lines.push("");
    if (s.solveFor === "n") {
      lines.push("# Toolbox reported: n = " + s.result);
    } else if (s.solveFor === "power") {
      lines.push("# Toolbox reported: power = " + (s.result * 100).toFixed(1) + "%");
    }
  }

  return lines.join("\n") + "\n";
}

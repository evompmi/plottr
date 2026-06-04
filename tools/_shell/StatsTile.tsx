// `StatsTile` — collapsible tile that runs the assumption checks, picks
// a test from the decision tree (user can override), runs post-hocs for
// k ≥ 3, and emits an annotation spec to the parent via
// `onAnnotationsChange` so the chart can draw brackets / compact-letter
// labels above the bars. Pure data helpers `computePowerFromData` and
// `assignBracketLevels` live in sibling files (`./power-from-data`,
// `./bracket-levels`) so per-tool stats panels can import them without
// pulling in this whole component. Rendered via `React.createElement`
// rather than JSX literals — the createElement form keeps the file
// readable while still being type-checked.

import {
  STATS_TEST_REGISTRY,
  STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K2,
  STATS_TESTS_FOR_K,
} from "./stats-registry";
import { buildRScript } from "./r-export";
import { computePowerFromData, type PowerFromDataRow } from "./power-from-data";
import type { PostHocPair, PostHocResult, TestResult } from "./stats-dispatch";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, flashSaved } from "../_core/download";
import { compactLetterDisplay, selectTest } from "../_core/stats/posthoc";
import { formatP, pStars } from "../_core/stats/format";
import { tt, useShellT, type ShellKey } from "./i18n";

// Aliased here so component code reads as `SelectTestResult | null` instead
// of an inlined `ReturnType<typeof selectTest>`.
type SelectTestResult = ReturnType<typeof selectTest>;

const h = React.createElement;

// Test/post-hoc labels and dispatch helpers all read from the shared
// registry. Pre-registry these were duplicated copies of the same data;
// the `_runTest` / `_runPostHoc` / `_postHocFor` thin wrappers keep the
// existing call shape so the rest of this file is unchanged.
const STATS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_TEST_REGISTRY).map((entry) => [entry[0], entry[1].label])
);
const POSTHOC_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STATS_POSTHOC_REGISTRY).map((entry) => [entry[0], entry[1].label])
);

// Localized display names for tests / post-hocs. The registry labels stay
// English (R-script export must remain portable); these map a test key to a
// shell catalog key, falling back to the registry label for any unmapped key.
const TEST_LABEL_KEYS: Record<string, ShellKey> = {
  studentT: "shell.test.studentT",
  welchT: "shell.test.welchT",
  mannWhitney: "shell.test.mannWhitney",
  oneWayANOVA: "shell.test.oneWayANOVA",
  welchANOVA: "shell.test.welchANOVA",
  kruskalWallis: "shell.test.kruskalWallis",
};
const POSTHOC_LABEL_KEYS: Record<string, ShellKey> = {
  tukeyHSD: "shell.posthoc.tukeyHSD",
  gamesHowell: "shell.posthoc.gamesHowell",
  dunn: "shell.posthoc.dunn",
};
function testLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return TEST_LABEL_KEYS[key] ? tt(TEST_LABEL_KEYS[key]) : STATS_LABELS[key] || key;
}
function posthocLabel(key: string): string {
  return POSTHOC_LABEL_KEYS[key] ? tt(POSTHOC_LABEL_KEYS[key]) : POSTHOC_LABELS[key] || key;
}
// "{a} vs {b}" pair label, localized conjunction.
function vsPair(a: string, b: string): string {
  return a + " " + tt("shell.stats.vs") + " " + b;
}

function _runTest(name: string | null | undefined, values: number[][]): TestResult | null {
  if (!name) return null;
  const entry = STATS_TEST_REGISTRY[name as RecommendedTest];
  return entry ? (entry.run(values) as TestResult) : null;
}

function _runPostHoc(name: string | null | undefined, values: number[][]): PostHocResult | null {
  if (!name) return null;
  const entry = STATS_POSTHOC_REGISTRY[name as Exclude<RecommendedPostHoc, null>];
  // Cast via unknown — see comment in stats-dispatch.ts `runPostHoc`.
  return entry ? (entry.run(values) as unknown as PostHocResult) : null;
}

function _postHocFor(
  testName: string | null | undefined
): Exclude<RecommendedPostHoc, null> | null {
  if (!testName) return null;
  const entry = STATS_TEST_REGISTRY[testName as RecommendedTest];
  return entry ? entry.postHoc : null;
}

// Format a test's primary result line. Each test returns slightly different
// fields (t/df/p for t-tests, F/df1/df2/p for ANOVA, U/z/p for MWU, etc.).
function _formatTestLine(
  name: string | null | undefined,
  res: TestResult | null | undefined
): string {
  if (!res || res.error) return res && res.error ? "⚠ " + res.error : "—";
  if ((name === "studentT" || name === "welchT") && res.t != null && res.df != null)
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)},  p = ${formatP(res.p)}`;
  if (name === "mannWhitney" && res.U != null && res.z != null)
    return `U = ${res.U.toFixed(1)},  z = ${res.z.toFixed(3)},  p = ${formatP(res.p)}`;
  if ((name === "oneWayANOVA" || name === "welchANOVA") && res.F != null) {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${res.F.toFixed(3)},  p = ${formatP(res.p)}`;
  }
  if (name === "kruskalWallis" && res.H != null && res.df != null)
    return `H(${res.df}) = ${res.H.toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

function _padR(s: unknown, n: number): string {
  const str = String(s);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

interface StatsReportCtx {
  names: string[];
  values: number[][];
  recommendation: SelectTestResult | null;
  chosenTest: string | null;
  testResult: TestResult | null;
  postHocName: string | null;
  postHocResult: PostHocResult | null;
  powerResult: {
    effectLabel: string;
    effect: number;
    effectCI: { lo: number; hi: number } | null;
    rows: Array<{ alpha: number; nForTarget: number | null }>;
    targetPower: number;
    nLabel: string;
    approximate: boolean;
  } | null;
}

// Plain-text statistics report, rendered as fixed-width columns so it
// reads cleanly in any editor. Mirrors what the StatsTile shows on
// screen: per-group descriptives, Shapiro-Wilk, Levene, chosen test
// result, and the post-hoc pairs when k ≥ 3.
function _buildStatsReport(ctx: StatsReportCtx): string {
  const {
    names,
    values,
    recommendation,
    chosenTest,
    testResult,
    postHocName,
    postHocResult,
    powerResult,
  } = ctx;
  const lines: string[] = [];
  const sep = "=".repeat(64);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nameW = Math.max(8, ...names.map((n) => n.length));

  lines.push(tt("shell.report.title"));
  lines.push(tt("shell.report.generated") + now);
  lines.push("");

  lines.push(sep);
  lines.push(tt("shell.report.groups"));
  lines.push(sep);
  for (let i = 0; i < names.length; i++) {
    const vs = values[i];
    const n = vs.length;
    const m = vs.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(vs.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1)) : 0;
    lines.push(
      "  " +
        _padR(names[i], nameW) +
        "  n = " +
        _padR(String(n), 4) +
        "  " +
        tt("shell.report.meanEq") +
        _padR(m.toFixed(3), 10) +
        "  SD = " +
        sd.toFixed(3)
    );
  }
  lines.push("");

  lines.push(sep);
  lines.push(tt("shell.report.assumptions"));
  lines.push(sep);
  lines.push("");
  lines.push(tt("shell.stats.shapiro"));
  const norm = (recommendation && recommendation.normality) || [];
  lines.push(
    "  " +
      _padR(tt("shell.stats.group"), nameW) +
      "  " +
      _padR(tt("shell.stats.n"), 4) +
      "  " +
      _padR(tt("shell.stats.w"), 8) +
      "  " +
      _padR(tt("shell.stats.p"), 10) +
      tt("shell.stats.assessment")
  );
  lines.push("  " + "-".repeat(nameW + 2 + 4 + 2 + 8 + 2 + 10 + 10));
  for (const r of norm) {
    const gname = names[r.group];
    const assessment =
      r.normal === true
        ? tt("shell.assess.normal")
        : r.normal === false
          ? tt("shell.assess.notNormal")
          : r.note || tt("shell.assess.unknown");
    lines.push(
      "  " +
        _padR(gname, nameW) +
        "  " +
        _padR(String(r.n), 4) +
        "  " +
        _padR(r.W != null ? r.W.toFixed(3) : "—", 8) +
        "  " +
        _padR(r.p != null ? formatP(r.p) : r.note || "—", 10) +
        assessment
    );
  }
  lines.push("");

  const lev = ((recommendation && recommendation.levene) || {}) as {
    F?: number;
    df1?: number;
    df2?: number;
    p?: number;
    equalVar?: boolean | null;
    error?: string;
  };
  lines.push(tt("shell.stats.levene"));
  if (lev.error) {
    lines.push("  " + tt("shell.report.errorPrefix") + lev.error);
  } else if (lev.F != null) {
    lines.push(
      "  F(" +
        lev.df1 +
        ", " +
        lev.df2 +
        ") = " +
        lev.F.toFixed(3) +
        ",  p = " +
        formatP(lev.p) +
        "   -> " +
        (lev.equalVar ? tt("shell.assess.equalVar") : tt("shell.assess.unequalVar"))
    );
  } else {
    lines.push("  —");
  }
  lines.push("");

  lines.push(sep);
  lines.push(tt("shell.report.test"));
  lines.push(sep);
  lines.push("");
  const recTest =
    recommendation && recommendation.recommendation && recommendation.recommendation.test;
  const recReason =
    recommendation && recommendation.recommendation && recommendation.recommendation.reason;
  lines.push(tt("shell.report.recommended") + (recTest ? testLabel(recTest) : "—"));
  if (recReason) lines.push(tt("shell.report.reason") + recReason);
  lines.push(tt("shell.report.chosen") + (chosenTest ? testLabel(chosenTest) : "—"));
  lines.push("");
  lines.push(tt("shell.report.result") + _formatTestLine(chosenTest, testResult));
  lines.push("");

  if (powerResult) {
    lines.push(sep);
    lines.push(tt("shell.report.replication"));
    lines.push(sep);
    lines.push("");
    const ciStr = powerResult.effectCI
      ? `, 95% CI [${powerResult.effectCI.lo.toFixed(3)}, ${powerResult.effectCI.hi.toFixed(3)}]`
      : "";
    lines.push(
      tt("shell.report.effectSize") +
        powerResult.effectLabel +
        " = " +
        powerResult.effect.toFixed(3) +
        ciStr
    );
    lines.push("");
    lines.push(tt("shell.report.futureStudy"));
    lines.push("");
    const aW = 8;
    const nW = 24;
    lines.push(_padR(tt("shell.report.alpha"), aW) + tt("shell.stats.nFor80"));
    lines.push("-".repeat(aW + nW));
    for (let ri = 0; ri < powerResult.rows.length; ri++) {
      const row = powerResult.rows[ri];
      const aStr = String(row.alpha);
      const nStr =
        row.nForTarget != null
          ? row.nForTarget + " " + powerResult.nLabel
          : tt("shell.statsui.gt5000");
      lines.push(_padR(aStr, aW) + nStr);
    }
    if (powerResult.approximate) {
      lines.push("");
      lines.push("  " + tt("shell.report.rankNote"));
    }
    lines.push("");
    lines.push("  " + tt("shell.report.whyNot1"));
    lines.push("  " + tt("shell.report.whyNot2"));
    lines.push("  " + tt("shell.report.whyNot3"));
    lines.push("  " + tt("shell.report.whyNot4"));
    lines.push("");
  }

  if (postHocResult && !postHocResult.error && postHocName) {
    lines.push(sep);
    lines.push(tt("shell.report.posthoc") + posthocLabel(postHocName));
    lines.push(sep);
    lines.push("");
    const pairW = Math.max(
      10,
      ...postHocResult.pairs.map((pr) => vsPair(names[pr.i], names[pr.j]).length)
    );
    const diffLabel =
      postHocName === "dunn" ? tt("shell.stats.rankDiff") : tt("shell.stats.meanDiff");
    lines.push(
      "  " +
        _padR(tt("shell.stats.pair"), pairW) +
        "  " +
        _padR(diffLabel, 12) +
        "  " +
        _padR(tt("shell.stats.p"), 10) +
        tt("shell.stats.signif")
    );
    lines.push("  " + "-".repeat(pairW + 2 + 12 + 2 + 10 + 8));
    for (const pr of postHocResult.pairs) {
      const pVal = pr.pAdj != null ? pr.pAdj : pr.p;
      const diff =
        pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? "z = " + pr.z.toFixed(3) : "—";
      lines.push(
        "  " +
          _padR(vsPair(names[pr.i], names[pr.j]), pairW) +
          "  " +
          _padR(diff, 12) +
          "  " +
          _padR(formatP(pVal), 10) +
          pStars(pVal)
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

interface StatsTileProps {
  groups: Array<{ name: string; values: number[] }> | null | undefined;
  onAnnotationsChange?: (spec: Record<string, unknown> | null) => void;
  onStatsSummaryChange?: (summary: string | null) => void;
  defaultOpen?: boolean;
  title?: React.ReactNode;
  compact?: boolean;
  renderLayout?: (parts: {
    displayEl: React.ReactNode;
    summaryEl: React.ReactNode;
    open?: boolean;
  }) => React.ReactNode;
  fileStem?: string;
}

export function StatsTile({
  groups,
  onAnnotationsChange,
  onStatsSummaryChange,
  defaultOpen,
  title,
  compact,
  renderLayout,
  fileStem,
}: StatsTileProps) {
  const tr = useShellT();
  const scale = compact ? 0.85 : 1;
  const fs = (n: number) => Math.round(n * scale * 10) / 10;
  const validGroups = (groups || []).filter(
    (g): g is { name: string; values: number[] } =>
      !!g && Array.isArray(g.values) && g.values.length >= 2
  );
  const k = validGroups.length;

  const [open, setOpen] = React.useState(!!defaultOpen);
  const [overrideTest, setOverrideTest] = React.useState<string | null>(null);
  const [showOnPlot, setShowOnPlot] = React.useState(false);
  const [showSummaryOnPlot, setShowSummaryOnPlot] = React.useState(false);
  const [annotKind, setAnnotKind] = React.useState<"cld" | "brackets">("cld");
  const [showNs, setShowNs] = React.useState(false);

  const values = React.useMemo(() => validGroups.map((g) => g.values.slice()), [validGroups]);
  const names = React.useMemo(() => validGroups.map((g) => g.name), [validGroups]);

  const recommendation = React.useMemo<SelectTestResult | null>(() => {
    if (k < 2) return null;
    return selectTest(values);
  }, [values, k]);

  const chosenTest =
    overrideTest ||
    (recommendation && recommendation.recommendation && recommendation.recommendation.test) ||
    null;

  const testResult = React.useMemo<TestResult | null>(
    () => (chosenTest ? _runTest(chosenTest, values) : null),
    [chosenTest, values]
  );

  const postHocName = _postHocFor(chosenTest);
  const postHocResult = React.useMemo<PostHocResult | null>(
    () => (k > 2 && postHocName ? _runPostHoc(postHocName, values) : null),
    [postHocName, values, k]
  );
  const powerResult = React.useMemo(
    () => computePowerFromData(chosenTest, values),
    [chosenTest, values]
  );

  // Build annotation spec for the chart.
  const annotationSpec = React.useMemo(() => {
    if (!showOnPlot || k < 2) return null;
    if (k === 2) {
      const p = testResult && !testResult.error && testResult.p != null ? testResult.p : null;
      if (p == null) return null;
      if (!showNs && p >= 0.05) return null;
      return {
        kind: "brackets",
        pairs: [{ i: 0, j: 1, p, label: pStars(p) }],
        groupNames: names,
      };
    }
    if (!postHocResult || postHocResult.error) return null;
    if (annotKind === "cld") {
      const labels = compactLetterDisplay(postHocResult.pairs, k);
      return { kind: "cld", labels, groupNames: names };
    }
    const all = postHocResult.pairs
      .map((pr: PostHocPair) => ({
        i: pr.i,
        j: pr.j,
        p: pr.pAdj != null ? pr.pAdj : pr.p,
      }))
      .map((pr) => ({ ...pr, label: pStars(pr.p) }))
      .filter((pr) => showNs || pr.p < 0.05);
    if (all.length === 0) return null;
    return { kind: "brackets", pairs: all, groupNames: names };
  }, [showOnPlot, annotKind, showNs, k, testResult, postHocResult, names]);

  // Build a plain-text stats summary for display below the plot.
  const statsSummary = React.useMemo(() => {
    if (!showOnPlot || !showSummaryOnPlot || !chosenTest || !testResult || testResult.error)
      return null;
    const parts: string[] = [];
    parts.push(testLabel(chosenTest) + ": " + _formatTestLine(chosenTest, testResult));
    if (k > 2 && postHocResult && !postHocResult.error && postHocName) {
      parts.push(tt("shell.summary.posthoc") + posthocLabel(postHocName));
      postHocResult.pairs.forEach((pr) => {
        const p = pr.pAdj != null ? pr.pAdj : pr.p;
        parts.push(
          "  " + vsPair(names[pr.i], names[pr.j]) + ": p = " + formatP(p) + " " + pStars(p)
        );
      });
    }
    if (powerResult) {
      parts.push(
        tt("shell.summary.effectSize") +
          powerResult.effectLabel +
          " = " +
          powerResult.effect.toFixed(3)
      );
    }
    parts.push(
      tt("shell.summary.nPerGroup") + names.map((n, i) => n + "=" + values[i].length).join(", ")
    );
    return parts.join("\n");
  }, [
    showOnPlot,
    showSummaryOnPlot,
    chosenTest,
    testResult,
    k,
    postHocResult,
    postHocName,
    names,
    powerResult,
    values,
  ]);

  // Emit annotations to the parent. We hold the latest spec in a ref and
  // fire the effect only when its serialized form changes.
  const specKey = annotationSpec ? JSON.stringify(annotationSpec) : "";
  const latestSpec = React.useRef(annotationSpec);
  latestSpec.current = annotationSpec;
  const onChangeRef = React.useRef(onAnnotationsChange);
  onChangeRef.current = onAnnotationsChange;
  React.useEffect(() => {
    if (typeof onChangeRef.current === "function") onChangeRef.current(latestSpec.current);
  }, [specKey]);

  const summaryKey = statsSummary || "";
  const latestSummary = React.useRef(statsSummary);
  latestSummary.current = statsSummary;
  const onSummaryRef = React.useRef(onStatsSummaryChange);
  onSummaryRef.current = onStatsSummaryChange;
  React.useEffect(() => {
    if (typeof onSummaryRef.current === "function") onSummaryRef.current(latestSummary.current);
  }, [summaryKey]);

  if (k < 2) return null;

  // ── Styles ────────────────────────────────────────────────────────────
  const wrap: React.CSSProperties = compact
    ? { marginTop: 0, marginBottom: 0, background: "var(--surface-subtle)" }
    : { marginTop: 12, background: "var(--surface-subtle)" };
  const header: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    userSelect: "none",
  };
  const h3style: React.CSSProperties = {
    margin: 0,
    fontSize: fs(14),
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "0.2px",
  };
  const subhead: React.CSSProperties = {
    margin: compact ? "10px 0 6px" : "14px 0 8px",
    padding: compact ? "4px 10px" : "5px 12px",
    fontSize: fs(11),
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "var(--subhead-text)",
    background: "var(--subhead-bg)",
    borderRadius: 4,
    display: "block",
  };
  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: fs(12),
    color: "var(--text-muted)",
  };
  const pillOk: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: fs(10),
    fontWeight: 700,
    background: "var(--step-ready-bg)",
    color: "var(--step-ready)",
  };
  const pillBad: React.CSSProperties = {
    ...pillOk,
    background: "var(--danger-bg)",
    color: "var(--danger-text)",
  };
  const pillNeutral: React.CSSProperties = {
    ...pillOk,
    background: "var(--neutral-bg)",
    color: "var(--neutral-text)",
  };
  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: fs(12),
    marginTop: 4,
  };
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: compact ? "3px 5px" : "4px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontWeight: 600,
  };
  const td: React.CSSProperties = {
    padding: compact ? "3px 5px" : "4px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
  };

  // ── Header rows ───────────────────────────────────────────────────────
  const displayTileHeader = h("h3", { style: h3style }, tr("shell.statsui.displayTitle"));
  const _safeStem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "stats_report";
  const _statsCtx: StatsReportCtx = {
    names,
    values,
    recommendation,
    chosenTest,
    testResult,
    postHocName,
    postHocResult,
    powerResult,
  };
  const downloadReportBtn = h(
    "button",
    {
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        downloadText(_buildStatsReport(_statsCtx), `${_safeStem || "stats_report"}.txt`);
        flashSaved(e.currentTarget);
      },
      className: "dv-btn dv-btn-dl",
      title: tr("shell.statsui.txtTitle"),
    },
    "⬇ TXT"
  );
  const rScriptBtn = h(
    "button",
    {
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        downloadText(buildRScript(_statsCtx), `${_safeStem || "stats_report"}.R`);
        flashSaved(e.currentTarget);
      },
      className: "dv-btn dv-btn-dl",
      title: tr("shell.statsui.rTitle"),
    },
    "⬇ R"
  );
  const downloadChipsEl = h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 6 } },
    downloadReportBtn,
    rScriptBtn
  );
  const summaryHeaderEl = h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        justifyContent: "space-between",
      },
    },
    h(
      "div",
      { style: header, onClick: () => setOpen((o) => !o) },
      h("span", {
        className: "dv-disclosure" + (open ? " dv-disclosure-open" : ""),
        "aria-hidden": "true",
      }),
      h("h3", { style: h3style }, title || tr("shell.statsui.summaryTitle"))
    ),
    downloadChipsEl
  );

  // ── Display-on-plot controls ──────────────────────────────────────────
  const subDisabled = !showOnPlot;
  const nsDisabled = subDisabled || (k > 2 && annotKind === "cld");
  const checkboxLabel = (
    checked: boolean,
    onChange: (b: boolean) => void,
    text: string,
    disabled: boolean
  ) =>
    h(
      "label",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: disabled ? "var(--text-faint)" : "var(--text)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
        },
      },
      h("input", {
        type: "checkbox",
        checked: disabled ? false : checked,
        disabled,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked),
        style: { accentColor: "var(--cta-primary-bg)" },
      }),
      text
    );
  const segmentedToggle = (disabled: boolean) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
          opacity: disabled ? 0.55 : 1,
          pointerEvents: (disabled ? "none" : "auto") as React.CSSProperties["pointerEvents"],
        },
      },
      (["cld", "brackets"] as const).map((value) => {
        const active = annotKind === value;
        return h(
          "button",
          {
            key: value,
            type: "button",
            onClick: () => setAnnotKind(value),
            style: {
              flex: 1,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: active ? 700 : 400,
              fontFamily: "inherit",
              cursor: disabled ? "not-allowed" : "pointer",
              border: "none",
              background: active ? "var(--accent-primary)" : "var(--surface)",
              color: active ? "var(--on-accent)" : "var(--text-muted)",
              transition: "background 120ms ease, color 120ms ease",
            },
          },
          value === "cld" ? tr("shell.statsui.letters") : tr("shell.statsui.brackets")
        );
      })
    );
  const displayControls = h(
    "div",
    {
      style: {
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      },
    },
    checkboxLabel(showOnPlot, setShowOnPlot, tr("shell.statsui.displayOnPlot"), false),
    checkboxLabel(
      showSummaryOnPlot,
      setShowSummaryOnPlot,
      tr("shell.statsui.printSummary"),
      subDisabled
    ),
    k > 2
      ? h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } },
          h(
            "span",
            { style: { color: subDisabled ? "var(--text-faint)" : "var(--text-muted)" } },
            tr("shell.statsui.style")
          ),
          segmentedToggle(subDisabled)
        )
      : null,
    checkboxLabel(showNs, setShowNs, tr("shell.statsui.showNs"), nsDisabled)
  );

  const displayTile = h(
    "div",
    { className: "dv-panel", style: wrap },
    displayTileHeader,
    displayControls
  );

  if (!open) {
    const displayEl = displayTile;
    const summaryEl = h("div", { className: "dv-panel", style: wrap }, summaryHeaderEl);
    if (typeof renderLayout === "function") return renderLayout({ displayEl, summaryEl, open });
    return h(React.Fragment, null, displayEl, summaryEl);
  }

  // ── Assumptions section ───────────────────────────────────────────────
  const norm = (recommendation && recommendation.normality) || [];
  const lev = ((recommendation && recommendation.levene) || {}) as {
    F?: number;
    df1?: number;
    df2?: number;
    p?: number;
    equalVar?: boolean | null;
    error?: string;
  };
  const normalityRows = norm.map((r) =>
    h(
      "tr",
      { key: r.group },
      h("td", { style: td }, names[r.group]),
      h("td", { style: td }, r.n),
      h("td", { style: td }, r.W != null ? r.W.toFixed(3) : "—"),
      h("td", { style: td }, r.p != null ? formatP(r.p) : r.note || "—"),
      h(
        "td",
        { style: td },
        r.normal === true
          ? h("span", { style: pillOk }, tr("shell.assess.normal"))
          : r.normal === false
            ? h("span", { style: pillBad }, tr("shell.assess.notNormal"))
            : h("span", { style: pillNeutral }, tr("shell.assess.unknown"))
      )
    )
  );

  const normalityCaption = h(
    "div",
    {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        marginTop: 4,
      },
    },
    tr("shell.stats.shapiro")
  );
  const normalityTable = h(
    "table",
    { style: table },
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        h("th", { style: th }, tr("shell.stats.group")),
        h("th", { style: th }, tr("shell.stats.n")),
        h("th", { style: th }, tr("shell.stats.w")),
        h("th", { style: th }, tr("shell.stats.p")),
        h("th", { style: th }, tr("shell.stats.assessment"))
      )
    ),
    h("tbody", null, normalityRows)
  );

  const leveneCaption = h(
    "div",
    {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        marginTop: 12,
        marginBottom: 2,
      },
    },
    tr("shell.stats.levene")
  );
  const leveneLine = h(
    "div",
    { style: row },
    lev.error
      ? h("span", { style: { color: "var(--danger-text)" } }, lev.error)
      : h(
          React.Fragment,
          null,
          h(
            "span",
            null,
            "F(" +
              lev.df1 +
              ", " +
              lev.df2 +
              ") = " +
              lev.F!.toFixed(3) +
              ",  p = " +
              formatP(lev.p)
          ),
          h(
            "span",
            { style: lev.equalVar ? pillOk : pillBad },
            lev.equalVar ? tr("shell.assess.equalVar") : tr("shell.assess.unequalVar")
          )
        )
  );

  // ── Test picker ───────────────────────────────────────────────────────
  const testOptions = k === 2 ? STATS_TESTS_FOR_K2 : STATS_TESTS_FOR_K;
  const recTest =
    recommendation && recommendation.recommendation && recommendation.recommendation.test;
  const recReason =
    recommendation && recommendation.recommendation && recommendation.recommendation.reason;
  const suggestion = recommendation && recommendation.suggestion;
  const testPicker = h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
    h(
      "select",
      {
        value: chosenTest || "",
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          setOverrideTest(e.target.value === recTest ? null : e.target.value),
        className: "dv-select",
        style: { minWidth: 180 },
      },
      testOptions.map((t) =>
        h(
          "option",
          { key: t, value: t },
          testLabel(t) + (t === recTest ? tr("shell.statsui.recommendedSuffix") : "")
        )
      )
    ),
    overrideTest
      ? h(
          "button",
          {
            onClick: () => setOverrideTest(null),
            className: "dv-btn dv-btn-secondary",
            style: { padding: "4px 10px", fontSize: 11 },
          },
          tr("shell.statsui.useRecommendation")
        )
      : null
  );

  const reasonLine = recReason
    ? h(
        "div",
        { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" } },
        recReason
      )
    : null;

  const suggestionLine =
    suggestion && chosenTest !== suggestion.test
      ? h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 6,
              padding: "6px 10px",
              background: "var(--info-bg)",
              border: "1px solid var(--info-border)",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--info-text)",
            },
          },
          h("span", { style: { fontWeight: 700 } }, tr("shell.statsui.suggestedAlt")),
          h(
            "span",
            null,
            tr("shell.statsui.suggestConsider"),
            h("strong", null, testLabel(suggestion.test)),
            "."
          ),
          h(
            "button",
            {
              onClick: () => setOverrideTest(suggestion.test),
              className: "dv-btn dv-btn-secondary",
              style: { padding: "4px 10px", fontSize: 11, marginLeft: "auto" },
            },
            tr("shell.statsui.useSuggestion")
          )
        )
      : null;

  const resultLine = h(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "8px 10px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        color: "var(--text)",
      },
    },
    _formatTestLine(chosenTest, testResult)
  );

  // ── Post-hoc table (k ≥ 3) ────────────────────────────────────────────
  let postHocBlock: React.ReactNode = null;
  if (k > 2 && postHocResult && !postHocResult.error && postHocName) {
    const rows = postHocResult.pairs.map((pr, idx) => {
      const pVal = pr.pAdj != null ? pr.pAdj : pr.p;
      return h(
        "tr",
        { key: idx },
        h("td", { style: td }, vsPair(names[pr.i], names[pr.j])),
        h(
          "td",
          { style: td },
          pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? "z = " + pr.z.toFixed(3) : "—"
        ),
        h("td", { style: td }, formatP(pVal)),
        h(
          "td",
          {
            style: {
              ...td,
              fontWeight: 700,
              color: pVal < 0.05 ? "var(--step-ready)" : "var(--text-faint)",
            },
          },
          pStars(pVal)
        )
      );
    });
    postHocBlock = h(
      "div",
      null,
      h("div", { style: subhead }, tr("shell.statsui.posthocPrefix") + posthocLabel(postHocName)),
      h(
        "table",
        { style: table },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", { style: th }, tr("shell.stats.pair")),
            h(
              "th",
              { style: th },
              postHocName === "dunn" ? tr("shell.stats.rankDiff") : tr("shell.stats.meanDiff")
            ),
            h("th", { style: th }, tr("shell.stats.p")),
            h("th", { style: th }, tr("shell.stats.signif"))
          )
        ),
        h("tbody", null, rows)
      )
    );
  }

  // ── Replication planning ──────────────────────────────────────────────
  //
  // Forward-looking "n for 80% power" only. Deliberately does NOT show
  // achieved / observed power: it's a deterministic transformation of p
  // (Hoenig & Heisey 2001), duplicating the p-value visually while
  // nudging readers toward the incorrect "low achieved power means
  // underpowered" interpretation.
  let powerBlock: React.ReactNode = null;
  if (powerResult) {
    const fmtAlpha = (a: number) => String(a);
    const nNeededText = (r: PowerFromDataRow) =>
      r.nForTarget != null ? r.nForTarget + " " + powerResult.nLabel : tr("shell.statsui.gt5000");
    powerBlock = h(
      "div",
      null,
      h("div", { style: subhead }, tr("shell.statsui.replication")),
      h(
        "div",
        { style: { fontSize: 11, color: "var(--text-muted)", marginBottom: 6 } },
        tr("shell.statsui.replicationDesc")
      ),
      h(
        "table",
        { style: table },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", { style: th }, tr("shell.stats.effectSize")),
            h("th", { style: th }, "α"),
            h("th", { style: th }, tr("shell.stats.nFor80"))
          )
        ),
        h(
          "tbody",
          null,
          powerResult.rows.map((rrow, ri) =>
            h(
              "tr",
              { key: ri },
              ri === 0
                ? h(
                    "td",
                    { style: td, rowSpan: powerResult.rows.length },
                    powerResult.effectLabel +
                      " = " +
                      powerResult.effect.toFixed(3) +
                      (powerResult.effectCI
                        ? `, 95% CI [${powerResult.effectCI.lo.toFixed(3)}, ${powerResult.effectCI.hi.toFixed(3)}]`
                        : "")
                  )
                : null,
              h("td", { style: td }, fmtAlpha(rrow.alpha)),
              h("td", { style: td }, nNeededText(rrow))
            )
          )
        )
      ),
      powerResult.approximate
        ? h(
            "div",
            {
              style: {
                fontSize: 11,
                color: "var(--text-faint)",
                fontStyle: "italic",
                marginTop: 4,
              },
            },
            tr("shell.statsui.approxNote")
          )
        : null
    );
  }

  const displayEl = displayTile;
  const summaryEl = h(
    "div",
    { className: "dv-panel", style: wrap },
    summaryHeaderEl,
    h(
      "div",
      { style: { marginTop: 10 } },
      h("div", { style: subhead }, tr("shell.statsui.assumptions")),
      normalityCaption,
      normalityTable,
      leveneCaption,
      leveneLine,
      h("div", { style: subhead }, tr("shell.statsui.test")),
      testPicker,
      reasonLine,
      suggestionLine,
      resultLine,
      postHocBlock,
      powerBlock
    )
  );
  if (typeof renderLayout === "function") return renderLayout({ displayEl, summaryEl });
  return h(React.Fragment, null, displayEl, summaryEl);
}

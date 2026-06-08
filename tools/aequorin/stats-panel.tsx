// AequorinStatsDetail (row expander) + AequorinStatsPanel (unified stats
// panel). Aequorin only ever has a single "set" (one bar per condition), so
// the panel runs in singleton-auto-expand mode: one row, already expanded.
// Panel-level controls (Display on plot: Off / Letters / Brackets, Show ns,
// Print summary below plot) drive the inset barplot's annotations and
// summary text via the onAnnotationChange / onSummaryChange callbacks that
// PlotPanel threads into the InsetBarplot chart.
//
// Pure helpers (formatters, annotation-spec builder, summary-text builder,
// aggregate text / R-script builders) live in ./reports so they stay
// unit-testable without React.

import {
  TEST_LABELS_AQ,
  POSTHOC_LABELS_AQ,
  TEST_OPTIONS_AQ_2,
  TEST_OPTIONS_AQ_K,
  formatAqStatShort,
  formatAqResultLine,
  computeAqAnnotationSpec,
  computeAqSummaryText,
  buildAqAggregateReport,
  buildAqAggregateRScript,
} from "./reports";
import {
  TestResult,
  buildRScript,
  buildSelectTestReason,
  computePowerFromData,
  postHocForTest,
  runPostHoc,
  runTest,
} from "../_shell";
import {
  AequorinStatsDetailProps,
  AequorinStatsPanelProps,
  AnnotationSpec,
  EnrichedAequorinStatsRow,
  PostHocPair,
  PostHocResult,
  SelectTestResult,
  StatsGroup,
} from "./helpers";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, flashSaved } from "../_core/download";
import { tinv } from "../_core/stats/dist";
import { sampleMean, sampleSD } from "../_core/stats/tests";
import { selectTest } from "../_core/stats/posthoc";
import { formatP, pStars } from "../_core/stats/format";
import { tt, useT, type AequorinKey } from "./i18n";
const { useState, useMemo, useEffect, useRef } = React;

// Map the kernel's test / post-hoc registry ids to catalog keys. The English
// registry labels (TEST_LABELS_AQ / POSTHOC_LABELS_AQ) stay the fallback so an
// unmapped id still renders, and so R-script exports keep their English names.
const TEST_LABEL_KEYS_AQ: Record<string, AequorinKey> = {
  studentT: "aequorin.test.studentT",
  welchT: "aequorin.test.welchT",
  mannWhitney: "aequorin.test.mannWhitney",
  oneWayANOVA: "aequorin.test.oneWayANOVA",
  welchANOVA: "aequorin.test.welchANOVA",
  kruskalWallis: "aequorin.test.kruskalWallis",
};
const POSTHOC_LABEL_KEYS_AQ: Record<string, AequorinKey> = {
  tukeyHSD: "aequorin.posthoc.tukeyHSD",
  gamesHowell: "aequorin.posthoc.gamesHowell",
  dunn: "aequorin.posthoc.dunn",
};
function aqTestLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return TEST_LABEL_KEYS_AQ[key] ? tt(TEST_LABEL_KEYS_AQ[key]) : TEST_LABELS_AQ[key] || key;
}
function aqPosthocLabel(key: string): string {
  return POSTHOC_LABEL_KEYS_AQ[key]
    ? tt(POSTHOC_LABEL_KEYS_AQ[key])
    : POSTHOC_LABELS_AQ[key] || key;
}

export function AequorinStatsDetail({
  row,
  onOverrideTest,
  isOverridden,
}: AequorinStatsDetailProps) {
  const tr = useT();
  const names = row.names;
  const values = row.values;
  const k = names.length;
  const res = row.testResult ?? ({} as TestResult);
  const rec = (row.rec ?? {}) as SelectTestResult;
  const recReason = buildSelectTestReason(rec);
  const recTest = rec.recommendation?.test ?? null;
  const suggestion = rec.suggestion ?? null;
  const testOptions = k === 2 ? TEST_OPTIONS_AQ_2 : TEST_OPTIONS_AQ_K;
  // Hoist nullable conditionally-rendered fields into local consts so the
  // JSX `{x && (…)}` narrowing survives into closure-captured .map callbacks.
  const postHoc = row.postHocResult;
  const power = row.powerResult;

  const subhead: React.CSSProperties = {
    margin: "10px 0 6px",
    padding: "4px 10px",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "var(--subhead-text)",
    background: "var(--subhead-bg)",
    borderRadius: 4,
    display: "block",
  };
  const thS: React.CSSProperties = {
    textAlign: "left",
    padding: "3px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: 11,
  };
  const tdS: React.CSSProperties = {
    padding: "3px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 11,
  };
  const pillOk: React.CSSProperties = {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 8,
    fontSize: 9,
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
  const norm = rec.normality ?? [];
  // Widen `rec.levene` so this block can index `.F` / `.df1` etc. without
  // per-access narrowing; the `lev.F != null` guard below covers the error
  // / undefined cases at runtime.
  const lev = (rec.levene ?? {}) as {
    F?: number;
    df1?: number;
    df2?: number;
    p?: number;
    equalVar?: boolean | null;
    error?: string;
  };

  return (
    <div style={{ padding: "6px 16px 12px 16px", background: "var(--surface-subtle)" }}>
      <div style={subhead}>{tr("aequorin.sp.groups")}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>{tr("aequorin.sp.group")}</th>
            <th style={thS}>{tr("aequorin.sp.n")}</th>
            <th style={thS}>{tr("aequorin.sp.mean")}</th>
            <th style={thS}>{tr("aequorin.sp.sd")}</th>
            <th style={thS}>{tr("aequorin.sp.sem")}</th>
            <th style={thS}>{tr("aequorin.sp.ci95")}</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, i) => {
            const vs = values[i];
            const n = vs.length;
            const m = sampleMean(vs);
            const sd = n > 1 ? sampleSD(vs) : 0;
            const sem = n > 1 ? sd / Math.sqrt(n) : 0;
            const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
            return (
              <tr key={i}>
                <td style={tdS}>{name}</td>
                <td style={tdS}>{n}</td>
                <td style={tdS}>{m.toFixed(3)}</td>
                <td style={tdS}>{sd.toFixed(3)}</td>
                <td style={tdS}>{n > 1 ? sem.toFixed(3) : "—"}</td>
                <td style={tdS}>{n > 1 ? `±${ci95.toFixed(3)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={subhead}>{tr("aequorin.sp.assumptions")}</div>
      {norm.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}
          >
            {tr("aequorin.sp.shapiro")}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {norm.map((r, i) => {
              const label = names[r.group] || `g${r.group}`;
              const pill = r.normal === true ? pillOk : r.normal === false ? pillBad : pillNeutral;
              const verdict =
                r.normal === true
                  ? tr("aequorin.sp.normal")
                  : r.normal === false
                    ? tr("aequorin.sp.notNormal")
                    : "—";
              return (
                <span key={i} style={{ fontSize: 11, color: "var(--text)" }}>
                  {label}: <span style={pill}>{verdict}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {lev.F != null && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 600 }}>{tr("aequorin.sp.levene")}</span> — F({lev.df1},{" "}
          {lev.df2}) = {lev.F.toFixed(3)}, p = {formatP(lev.p)}{" "}
          <span style={lev.equalVar ? pillOk : pillBad}>
            {lev.equalVar ? tr("aequorin.sp.equalVar") : tr("aequorin.sp.unequalVar")}
          </span>
        </div>
      )}

      <div style={subhead}>{tr("aequorin.sp.test")}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <select
          value={row.chosenTest || ""}
          onChange={(e) => {
            const next = e.target.value === "" ? null : (e.target.value as RecommendedTest);
            if (onOverrideTest) onOverrideTest(next === recTest ? null : next);
          }}
          className="dv-select"
          style={{ fontSize: 11, padding: "2px 6px", minWidth: 180 }}
          onClick={(e) => e.stopPropagation()}
        >
          {testOptions.map((t) => (
            <option key={t} value={t}>
              {aqTestLabel(t)}
              {t === recTest ? tr("aequorin.sp.recommendedSuffix") : ""}
            </option>
          ))}
        </select>
        {isOverridden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest && onOverrideTest(null);
            }}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 10 }}
          >
            {tr("aequorin.sp.useRecommendation")}
          </button>
        )}
      </div>
      {recReason && (
        <div
          style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 6 }}
        >
          {recReason}
        </div>
      )}
      {suggestion && row.chosenTest !== suggestion.test && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            padding: "6px 10px",
            marginBottom: 6,
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--info-text)",
          }}
        >
          <span style={{ fontWeight: 700 }}>{tr("aequorin.sp.suggestedAlt")}</span>
          <span>
            {tr("aequorin.sp.suggestConsider")}
            <strong>{aqTestLabel(suggestion.test)}</strong>.
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest && onOverrideTest(suggestion.test);
            }}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 10, marginLeft: "auto" }}
          >
            {tr("aequorin.sp.useSuggestion")}
          </button>
        </div>
      )}
      <div
        style={{
          padding: "6px 10px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 11,
          color: "var(--text)",
        }}
      >
        {res.error
          ? `⚠ ${res.error}`
          : row.chosenTest
            ? formatAqResultLine(row.chosenTest, res)
            : "—"}
      </div>

      {k >= 3 && postHoc && !postHoc.error && row.postHocName && (
        <>
          <div style={subhead}>
            {tr("aequorin.sp.posthocPrefix")}
            {aqPosthocLabel(row.postHocName)}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>{tr("aequorin.sp.pair")}</th>
                <th style={thS}>
                  {row.postHocName === "dunn"
                    ? tr("aequorin.sp.rankDiff")
                    : tr("aequorin.sp.meanDiff")}
                </th>
                <th style={thS}>{tr("aequorin.sp.colP")}</th>
                <th style={thS}>{tr("aequorin.sp.signif")}</th>
              </tr>
            </thead>
            <tbody>
              {postHoc.pairs.map((pr: PostHocPair, i: number) => {
                const p = pr.pAdj != null ? pr.pAdj : pr.p;
                const diff =
                  pr.diff != null
                    ? pr.diff.toFixed(3)
                    : pr.z != null
                      ? `z = ${pr.z.toFixed(3)}`
                      : "—";
                return (
                  <tr key={i}>
                    <td style={tdS}>
                      {names[pr.i]} {tr("aequorin.sp.vs")} {names[pr.j]}
                    </td>
                    <td style={tdS}>{diff}</td>
                    <td style={tdS}>{formatP(p)}</td>
                    <td
                      style={{
                        ...tdS,
                        fontWeight: 700,
                        color: p < 0.05 ? "var(--step-ready)" : "var(--text-faint)",
                      }}
                    >
                      {pStars(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {power && (
        <>
          <div style={subhead}>{tr("aequorin.sp.replication")}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            {tr("aequorin.sp.replicationDesc")}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>{tr("aequorin.sp.effectSize")}</th>
                <th style={thS}>α</th>
                <th style={thS}>{tr("aequorin.sp.nFor80")}</th>
              </tr>
            </thead>
            <tbody>
              {power.rows.map((pr, i) => (
                <tr key={i}>
                  {i === 0 ? (
                    <td style={tdS} rowSpan={power.rows.length}>
                      {power.effectLabel} = {power.effect.toFixed(3)}
                      {power.effectCI
                        ? `, 95% CI [${power.effectCI.lo.toFixed(3)}, ${power.effectCI.hi.toFixed(3)}]`
                        : ""}
                    </td>
                  ) : null}
                  <td style={tdS}>{String(pr.alpha)}</td>
                  <td style={tdS}>
                    {pr.nForTarget != null
                      ? `${pr.nForTarget} ${power.nLabel}`
                      : tr("aequorin.sp.gt5000")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {power.approximate && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              {tr("aequorin.sp.approxNote")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Internal "skip" sentinel used when fewer than 2 groups have ≥2 values
// each — the panel renders nothing in that case.
type EnrichedOrSkip =
  | (EnrichedAequorinStatsRow & { key: string; name: string })
  | { key: string; name: string; names: string[]; values: number[][]; k: number; skip: true };

export function AequorinStatsPanel({
  groups,
  fileStem,
  onAnnotationChange,
  onSummaryChange,
  errorBarLabel,
}: AequorinStatsPanelProps) {
  const tr = useT();
  const singleKey = "_global";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [singleKey]: true });
  const [hovered, setHovered] = useState<string | null>(null);
  const [override, setOverride] = useState<RecommendedTest | null>(null);
  const [displayMode, setDisplayMode] = useState<"none" | "cld" | "brackets">("none");
  const [showNs, setShowNs] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const enriched = useMemo<EnrichedOrSkip>(() => {
    const validGroups = (groups || []).filter(
      (g): g is StatsGroup => !!g && Array.isArray(g.values) && g.values.length >= 2
    );
    const names = validGroups.map((g) => g.name);
    const values = validGroups.map((g) => g.values.slice());
    const k = names.length;
    if (k < 2) return { key: singleKey, name: "", names, values, k, skip: true };
    const rec = selectTest(values) as SelectTestResult;
    const recTest = rec.recommendation?.test ?? null;
    const chosenTest = override || recTest || null;
    const testResult = chosenTest ? runTest(chosenTest, values) : null;
    const postHocName = postHocForTest(chosenTest);
    const postHocResult = (
      k > 2 && postHocName ? runPostHoc(postHocName, values) : null
    ) as PostHocResult | null;
    const powerResult = chosenTest ? computePowerFromData(chosenTest, values) : null;
    return {
      key: singleKey,
      name: "",
      names,
      values,
      k,
      rec,
      chosenTest,
      testResult,
      postHocName,
      postHocResult,
      powerResult,
    };
  }, [groups, override]);

  // computeAqAnnotationSpec is typed loosely in reports.ts (returns a
  // structural shape); cast here to the strict AnnotationSpec union the
  // chart consumer expects.
  const annotSpec = useMemo(
    () =>
      enriched.skip
        ? null
        : (computeAqAnnotationSpec(enriched, displayMode, showNs) as AnnotationSpec | null),
    [enriched, displayMode, showNs]
  );
  const annotKey = JSON.stringify(annotSpec);
  const onAnnotRef = useRef(onAnnotationChange);
  onAnnotRef.current = onAnnotationChange;
  useEffect(() => {
    if (typeof onAnnotRef.current === "function") onAnnotRef.current(annotSpec);
    // annotSpec is canonicalised through `annotKey` (a JSON stringify) so
    // structurally-equal specs across renders don't re-fire the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotKey]);

  const summaryText = useMemo(
    () => (enriched.skip ? null : computeAqSummaryText(enriched, showSummary, errorBarLabel)),
    [enriched, showSummary, errorBarLabel]
  );
  const onSummaryRef = useRef(onSummaryChange);
  onSummaryRef.current = onSummaryChange;
  useEffect(() => {
    if (typeof onSummaryRef.current === "function") onSummaryRef.current(summaryText);
  }, [summaryText]);

  if (enriched.skip) return null;

  const hasR = typeof buildRScript === "function";
  const stem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "rlu_timecourse_stats";
  const downloadReport = (e: React.MouseEvent<HTMLElement>) => {
    downloadText(buildAqAggregateReport([enriched]), `${stem}.txt`);
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: React.MouseEvent<HTMLElement>) => {
    downloadText(buildAqAggregateRScript([enriched]), `${stem}.R`);
    flashSaved(e.currentTarget);
  };

  const isOpen = !!expanded[singleKey];
  const p =
    enriched.testResult && !enriched.testResult.error ? (enriched.testResult.p ?? null) : null;
  const sig = p != null && p < 0.05;
  const stars = p != null ? pStars(p) : "";

  const thS: React.CSSProperties = {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    color: "var(--subhead-text)",
    fontWeight: 600,
    fontSize: 12,
    background: "var(--subhead-bg)",
  };
  const tdS: React.CSSProperties = {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 12,
  };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace" };

  const segBtn = (value: "none" | "cld" | "brackets", label: string) => {
    const active = displayMode === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setDisplayMode(value)}
        style={{
          flex: "0 0 auto",
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: active ? 700 : 400,
          fontFamily: "inherit",
          cursor: "pointer",
          border: "none",
          background: active ? "var(--accent-primary)" : "var(--surface)",
          color: active ? "var(--on-accent)" : "var(--text-muted)",
          transition: "background 120ms ease, color 120ms ease",
        }}
      >
        {label}
      </button>
    );
  };
  const anyMulti = enriched.k > 2;
  const nsDisabled = displayMode === "none" || (anyMulti && displayMode === "cld");

  return (
    <div className="dv-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "0.2px",
            }}
          >
            {tr("aequorin.sp.statistics")}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            {tr("aequorin.sp.desc")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={downloadReport}
            title={tr("aequorin.sp.txtTitle")}
          >
            ⬇ TXT
          </button>
          {hasR && (
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={downloadR}
              title={tr("aequorin.sp.rTitle")}
            >
              ⬇ R
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-subtle)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
          {tr("aequorin.sp.displayOnPlot")}
        </span>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
          }}
        >
          {segBtn("none", tr("aequorin.sp.off"))}
          {anyMulti && segBtn("cld", tr("aequorin.sp.letters"))}
          {segBtn("brackets", tr("aequorin.sp.brackets"))}
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: nsDisabled ? "var(--text-faint)" : "var(--text)",
            cursor: nsDisabled ? "not-allowed" : "pointer",
            opacity: nsDisabled ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={!nsDisabled && showNs}
            disabled={nsDisabled}
            onChange={(e) => setShowNs(e.target.checked)}
            style={{ accentColor: "var(--cta-primary-bg)" }}
          />
          {tr("aequorin.sp.showNs")}
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showSummary}
            onChange={(e) => setShowSummary(e.target.checked)}
            style={{ accentColor: "var(--cta-primary-bg)" }}
          />
          {tr("aequorin.sp.printSummary")}
        </label>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>{tr("aequorin.sp.groups")}</th>
            <th style={thS}>{tr("aequorin.sp.test")}</th>
            <th style={thS}>{tr("aequorin.sp.statistic")}</th>
            <th style={thS}>{tr("aequorin.sp.colP")}</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          <tr
            onClick={() => setExpanded((prev) => ({ ...prev, [singleKey]: !isOpen }))}
            onMouseEnter={() => setHovered(singleKey)}
            onMouseLeave={() => setHovered((h) => (h === singleKey ? null : h))}
            style={{
              cursor: "pointer",
              background: isOpen
                ? "var(--surface-subtle)"
                : hovered === singleKey
                  ? "var(--row-hover-bg)"
                  : undefined,
              transition: "background 120ms ease",
            }}
          >
            <td style={tdS}>{enriched.k}</td>
            <td style={tdS}>{aqTestLabel(enriched.chosenTest)}</td>
            <td style={{ ...tdS, ...mono }}>
              {formatAqStatShort(enriched.chosenTest, enriched.testResult)}
            </td>
            <td
              style={{
                ...tdS,
                ...mono,
                fontWeight: sig ? 700 : 400,
                color: sig ? "var(--step-ready)" : "var(--text)",
              }}
            >
              {p != null ? formatP(p) : "—"}
            </td>
            <td
              style={{
                ...tdS,
                textAlign: "right",
                color: sig ? "var(--step-ready)" : "var(--text-faint)",
                fontWeight: 700,
              }}
            >
              {stars && stars !== "ns" ? stars : ""}
            </td>
          </tr>
          {isOpen && (
            <tr>
              <td colSpan={5} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                <AequorinStatsDetail
                  row={enriched}
                  isOverridden={!!override}
                  onOverrideTest={(t) => setOverride(t)}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

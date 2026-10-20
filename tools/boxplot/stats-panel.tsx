// Statistics for the boxplot tool, shown in the workspace's inspector column,
// plus the display bar shown above the figure and the stats state reducer.
//
// One "stat set" per testable cell (facet, subgroup, or the whole plot in
// flat mode). With a single set the inspector shows its sections directly —
// test result + picker, assumptions, post-hoc, group summaries, replication
// planning — followed by the analysis exports (R script, Methods, report).
// With several sets it lists one row per set and opens a set's sections
// under its row on demand. The per-set test override lives in the test
// picker.
//
// Display settings (marks on plot: Off / Letters / Brackets, show ns, print
// summary below plot) live in `BoxplotStatsDisplayBar`, in the toolbar above
// the figure, and apply to every set in lockstep.
//
// The panel emits per-row annotation + summary via `onAnnotationForKey(key, …)`
// and `onSummaryForKey(key, …)`. App routes these into mode-specific stores:
//   - Facet mode:    `facetStats*` maps keyed on `fd.category`
//   - Subgroup mode: `subgroup*` maps keyed on `sg.name`, then merged
//                    (annotations only) into a single spec via
//                    `mergeSubgroupAnnotations` for the shared chart
//   - Flat mode:     scalar `flatStats*` state (the key is ignored)
//
// Pure formatting, annotation, and summary helpers live in
// tools/boxplot/helpers.ts. Text + R-script report builders live in
// tools/boxplot/reports.ts. Test / post-hoc dispatchers live in
// tools/_shell/stats-dispatch.ts.

import {
  TestResult,
  buildRScript,
  buildSelectTestReason,
  computePowerFromData,
  postHocForTest,
  runPostHoc,
  runTest,
  WhyThisTest,
  MethodsButton,
  InspectorSection,
  SegToggle,
  buildGroupMethodsText,
  methodsDisplay,
} from "../_shell";
import {
  TEST_LABELS_BP,
  POSTHOC_LABELS_BP,
  TEST_OPTIONS_BP_2,
  TEST_OPTIONS_BP_K,
  formatBpResultLine,
  computeBpAnnotationSpec,
  computeBpSummaryText,
  AnnotationSpec,
  BoxplotStatsDetailProps,
  BoxplotStatsDisplayBarProps,
  BoxplotStatsPanelProps,
  BoxplotStatsSet,
  EnrichedBoxplotStatsRow,
  PostHocPair,
  PostHocResult,
  SelectTestResult,
} from "./helpers";
import { buildBpAggregateReport, buildBpAggregateRScript } from "./reports";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, downloadTexts, flashSaved } from "../_core/download";
import { tinv } from "../_core/stats/dist";
import { sampleMean, sampleSD } from "../_core/stats/tests";
import { selectTest } from "../_core/stats/posthoc";
import { formatP, pStars } from "../_core/stats/format";
import { tt, useT, type BoxplotKey } from "./i18n";
const { useState, useMemo, useRef, useEffect } = React;

// Map the kernel's test / post-hoc registry ids to catalog keys. The English
// registry labels (TEST_LABELS_BP / POSTHOC_LABELS_BP) stay the fallback so an
// unmapped id still renders, and so R-script exports keep their English names.
const TEST_LABEL_KEYS_BP: Record<string, BoxplotKey> = {
  studentT: "boxplot.test.studentT",
  welchT: "boxplot.test.welchT",
  mannWhitney: "boxplot.test.mannWhitney",
  oneWayANOVA: "boxplot.test.oneWayANOVA",
  welchANOVA: "boxplot.test.welchANOVA",
  kruskalWallis: "boxplot.test.kruskalWallis",
};
const POSTHOC_LABEL_KEYS_BP: Record<string, BoxplotKey> = {
  tukeyHSD: "boxplot.posthoc.tukeyHSD",
  gamesHowell: "boxplot.posthoc.gamesHowell",
  dunn: "boxplot.posthoc.dunn",
};
function bpTestLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return TEST_LABEL_KEYS_BP[key] ? tt(TEST_LABEL_KEYS_BP[key]) : TEST_LABELS_BP[key] || key;
}
function bpPosthocLabel(key: string): string {
  return POSTHOC_LABEL_KEYS_BP[key]
    ? tt(POSTHOC_LABEL_KEYS_BP[key])
    : POSTHOC_LABELS_BP[key] || key;
}

// Shared inline styles for the inspector's compact mono tables.
const tableS: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};
const thS: React.CSSProperties = {
  fontWeight: 500,
  padding: "4px 0 4px 8px",
  color: "var(--text-faint)",
  textAlign: "right",
  whiteSpace: "nowrap",
};
const tdS: React.CSSProperties = {
  padding: "6px 0 6px 8px",
  borderTop: "1px solid var(--border-subtle)",
  color: "var(--text)",
  textAlign: "right",
  whiteSpace: "nowrap",
};
const firstCol: React.CSSProperties = { paddingLeft: 0, textAlign: "left" };

// Check / cross / dash marker for an assumption row.
function Verdict({ ok }: { ok: boolean | null | undefined }) {
  const color =
    ok === true ? "var(--step-ready)" : ok === false ? "var(--danger-text)" : "var(--text-faint)";
  const d = ok === true ? "M5 12l5 5L20 7" : ok === false ? "M6 6l12 12M18 6L6 18" : "M6 12h12";
  return (
    <span style={{ color, display: "inline-flex" }}>
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </span>
  );
}

function StarsBadge({ p }: { p: number | null }) {
  if (p == null) return null;
  const sig = p < 0.05;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: "var(--radius-sm)",
        padding: "2px 6px",
        color: sig ? "var(--success-text)" : "var(--text-faint)",
        background: sig ? "var(--success-bg)" : "var(--surface-sunken)",
      }}
    >
      {pStars(p)}
    </span>
  );
}

// One stat set's results as inspector sections: test result + picker,
// assumptions, post-hoc, group summaries, replication planning.
function BoxplotStatsDetail({ row, onOverrideTest, isOverridden }: BoxplotStatsDetailProps) {
  const tr = useT();
  const names = row.names;
  const values = row.values;
  const k = names.length;
  const res = row.testResult ?? ({} as TestResult);
  const rec = (row.rec ?? {}) as SelectTestResult;
  const recReason = buildSelectTestReason(rec);
  const recTest = rec.recommendation?.test ?? null;
  const suggestion = rec.suggestion ?? null;
  const testOptions = k === 2 ? TEST_OPTIONS_BP_2 : TEST_OPTIONS_BP_K;
  const postHoc = row.postHocResult;
  const power = row.powerResult;
  const p = res.error ? null : typeof res.p === "number" ? res.p : null;
  const norm = rec.normality ?? [];
  const lev = (rec.levene ?? {}) as {
    F?: number;
    df1?: number;
    df2?: number;
    p?: number;
    equalVar?: boolean | null;
    error?: string;
  };
  const nNormal = norm.filter((r) => r.normal === true).length;
  const notNormal = norm
    .filter((r) => r.normal === false)
    .map((r) => names[r.group] || `g${r.group}`);
  // The result line's parts ("F(2, 45.51) = 37.326", "p = 2.5e-10", …):
  // formatBpResultLine separates them with a comma + two spaces, which never
  // occurs inside a part.
  const resultParts = row.chosenTest
    ? formatBpResultLine(row.chosenTest, res).split(/,\s{2,}/)
    : ["—"];

  return (
    <>
      <InspectorSection label={k > 2 ? tr("boxplot.sp.omnibus") : tr("boxplot.sp.twoGroupTest")}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 600,
              color: "var(--text)",
              lineHeight: 1.2,
            }}
          >
            {bpTestLabel(row.chosenTest)}
          </span>
          <StarsBadge p={p} />
        </div>
        <div
          data-testid="bp-result-line"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: res.error ? "var(--danger-text)" : "var(--text)",
            display: "flex",
            gap: "4px 16px",
            flexWrap: "wrap",
          }}
        >
          {resultParts.map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </div>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {tr("boxplot.sp.test")}
          <select
            value={row.chosenTest || ""}
            onChange={(e) => {
              const next = e.target.value === "" ? null : (e.target.value as RecommendedTest);
              if (onOverrideTest) onOverrideTest(next === recTest ? null : next);
            }}
            className="dv-select"
            style={{ width: "100%", minHeight: 34 }}
          >
            {testOptions.map((t) => (
              <option key={t} value={t}>
                {bpTestLabel(t)}
                {t === recTest ? tr("boxplot.sp.recommendedSuffix") : ""}
              </option>
            ))}
          </select>
        </label>
        {isOverridden && (
          <button
            type="button"
            onClick={() => onOverrideTest && onOverrideTest(null)}
            className="dv-btn dv-btn-secondary"
            style={{ alignSelf: "flex-start" }}
          >
            {tr("boxplot.sp.useRecommendation")}
          </button>
        )}
        {suggestion && row.chosenTest !== suggestion.test && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 10px",
              background: "var(--info-bg)",
              border: "1px solid var(--info-border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              color: "var(--info-text)",
            }}
          >
            <span>
              <strong>{tr("boxplot.sp.suggestedAlt")}</strong> {tr("boxplot.sp.suggestConsider")}
              <strong>{bpTestLabel(suggestion.test)}</strong>.
            </span>
            <button
              type="button"
              onClick={() => onOverrideTest && onOverrideTest(suggestion.test)}
              className="dv-btn dv-btn-secondary"
              style={{ alignSelf: "flex-start" }}
            >
              {tr("boxplot.sp.useSuggestion")}
            </button>
          </div>
        )}
      </InspectorSection>

      {(norm.length > 0 || lev.F != null) && (
        <InspectorSection label={tr("boxplot.sp.assumptionsChecked")}>
          {norm.length > 0 && (
            <div className="dv-assumption-row">
              <Verdict ok={notNormal.length > 0 ? false : nNormal === norm.length ? true : null} />
              <span>{tr("boxplot.sp.normalityRow")}</span>
              <span className="dv-mono-faint">
                {tr("boxplot.sp.nNormal", { k: nNormal, n: norm.length })}
              </span>
            </div>
          )}
          {notNormal.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--danger-text)", paddingLeft: 22 }}>
              {tr("boxplot.sp.notNormalList", { list: notNormal.join(", ") })}
            </div>
          )}
          {lev.F != null && (
            <div
              className="dv-assumption-row"
              title={`F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(3)}`}
            >
              <Verdict ok={lev.equalVar} />
              <span>{tr("boxplot.sp.equalVarRow")}</span>
              <span className="dv-mono-faint">p = {formatP(lev.p)}</span>
            </div>
          )}
          <WhyThisTest text={recReason} />
        </InspectorSection>
      )}

      {k >= 3 && postHoc && !postHoc.error && row.postHocName && (
        <InspectorSection label={tr("boxplot.sp.posthocPrefix") + bpPosthocLabel(row.postHocName)}>
          <table style={tableS}>
            <thead>
              <tr>
                <th style={{ ...thS, ...firstCol }}>{tr("boxplot.sp.pair")}</th>
                <th style={thS}>
                  {row.postHocName === "dunn"
                    ? tr("boxplot.sp.rankDiff")
                    : tr("boxplot.sp.meanDiff")}
                </th>
                <th style={thS}>{tr("boxplot.sp.colP")}</th>
                <th style={thS}>
                  <span className="dv-sr-only">{tr("boxplot.sp.signif")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {postHoc.pairs.map((pr: PostHocPair, i: number) => {
                const pp = pr.pAdj != null ? pr.pAdj : pr.p;
                const diff =
                  pr.diff != null
                    ? pr.diff.toFixed(3)
                    : pr.z != null
                      ? `z = ${pr.z.toFixed(3)}`
                      : "—";
                return (
                  <tr key={i}>
                    <td style={{ ...tdS, ...firstCol, whiteSpace: "normal" }}>
                      {names[pr.i]} – {names[pr.j]}
                    </td>
                    <td style={tdS}>{diff}</td>
                    <td style={tdS}>{formatP(pp)}</td>
                    <td
                      style={{
                        ...tdS,
                        fontWeight: 600,
                        color: pp < 0.05 ? "var(--step-ready)" : "var(--text-faint)",
                      }}
                    >
                      {pStars(pp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </InspectorSection>
      )}

      <InspectorSection label={tr("boxplot.sp.groups")}>
        <div style={{ overflowX: "auto" }}>
          <table style={tableS}>
            <thead>
              <tr>
                <th style={{ ...thS, ...firstCol }}>
                  <span className="dv-sr-only">{tr("boxplot.sp.group")}</span>
                </th>
                <th style={thS}>{tr("boxplot.sp.n")}</th>
                <th style={thS}>{tr("boxplot.sp.mean")}</th>
                <th style={thS}>{tr("boxplot.sp.sd")}</th>
                <th style={thS}>{tr("boxplot.sp.sem")}</th>
                <th style={thS}>{tr("boxplot.sp.ci95")}</th>
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
                    <td style={{ ...tdS, ...firstCol, whiteSpace: "normal" }}>{name}</td>
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
        </div>
      </InspectorSection>

      {power && power.rows.length > 0 && (
        <InspectorSection label={tr("boxplot.sp.replicationShort")}>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>
            {tr("boxplot.sp.replicationLine", {
              effect: `${power.effectLabel} = ${power.effect.toFixed(3)}`,
              n:
                power.rows[0].nForTarget != null
                  ? `${power.rows[0].nForTarget} ${power.nLabel}`
                  : tr("boxplot.sp.gt5000"),
              alpha: String(power.rows[0].alpha),
            })}
          </div>
          {power.effectCI && (
            <div className="dv-mono-faint">
              95% CI [{power.effectCI.lo.toFixed(3)}, {power.effectCI.hi.toFixed(3)}]
            </div>
          )}
          {power.rows.slice(1).map((pr, i) => (
            <div key={i} className="dv-mono-faint">
              {tr("boxplot.sp.atAlpha", {
                alpha: String(pr.alpha),
                n:
                  pr.nForTarget != null
                    ? `${pr.nForTarget} ${power.nLabel}`
                    : tr("boxplot.sp.gt5000"),
              })}
            </div>
          ))}
          {power.approximate && (
            <div style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic" }}>
              {tr("boxplot.sp.approxNote")}
            </div>
          )}
        </InspectorSection>
      )}
    </>
  );
}

export function BoxplotStatsPanel({
  sets,
  setLabel,
  fileStem,
  onAnnotationForKey,
  onSummaryForKey,
  displayMode,
  showNs,
  showSummary,
  errorBarLabel,
  displayKind,
}: BoxplotStatsPanelProps) {
  const tr = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, RecommendedTest>>({});

  // EnrichedOrSkip variant — the `skip` branch carries enough fields for the
  // skip handling at the top of the render path; the populated branch is the
  // full EnrichedBoxplotStatsRow.
  type EnrichedOrSkip =
    | EnrichedBoxplotStatsRow
    | (BoxplotStatsSet & { names: string[]; values: number[][]; k: number; skip: true });

  const enriched = useMemo<EnrichedOrSkip[]>(
    () =>
      sets.map((s): EnrichedOrSkip => {
        const allGroups = s.groups || [];
        // Full displayed-group ordering + the valid→displayed index map. Groups
        // with < 2 values can't be tested but are still drawn, so the chart
        // positions annotations across `displayNames`; `groupIndexMap` lets the
        // annotation builder scatter dense per-test results onto those slots.
        const displayNames = allGroups.map((g) => g.name);
        const groupIndexMap: number[] = [];
        const validGroups: Array<{ name: string; values: number[] }> = [];
        allGroups.forEach((g, idx) => {
          if (!!g && Array.isArray(g.values) && g.values.length >= 2) {
            validGroups.push(g);
            groupIndexMap.push(idx);
          }
        });
        const names = validGroups.map((g) => g.name);
        const values = validGroups.map((g) => g.values.slice());
        const k = names.length;
        if (k < 2) return { ...s, names, values, k, skip: true };
        const rec = selectTest(values) as SelectTestResult;
        const recTest = rec.recommendation?.test ?? null;
        const chosenTest = overrides[s.key] || recTest || null;
        const testResult = chosenTest ? runTest(chosenTest, values) : null;
        const postHocName = postHocForTest(chosenTest);
        const postHocResult = (
          k > 2 && postHocName ? runPostHoc(postHocName, values) : null
        ) as PostHocResult | null;
        const powerResult = chosenTest ? computePowerFromData(chosenTest, values) : null;
        return {
          ...s,
          names,
          values,
          k,
          displayNames,
          groupIndexMap,
          rec,
          recTest,
          chosenTest,
          testResult,
          postHocName,
          postHocResult,
          powerResult,
        };
      }),
    [sets, overrides]
  );

  const annotByKey = useMemo(() => {
    const out: Record<string, AnnotationSpec | null> = {};
    for (const r of enriched) {
      out[r.key] = r.skip ? null : computeBpAnnotationSpec(r, displayMode, showNs);
    }
    return out;
  }, [enriched, displayMode, showNs]);
  const annotKey = JSON.stringify(annotByKey);
  const onAnnotationForKeyRef = useRef(onAnnotationForKey);
  onAnnotationForKeyRef.current = onAnnotationForKey;
  useEffect(() => {
    if (typeof onAnnotationForKeyRef.current !== "function") return;
    for (const r of sets) {
      onAnnotationForKeyRef.current(r.key, annotByKey[r.key] || null);
    }
    // annotByKey is canonicalised through `annotKey` (JSON-stringify) so
    // structurally-equal specs across renders don't re-fire. `sets`
    // changes only when `enriched` does, which `annotKey` already
    // covers transitively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotKey]);

  const summaryByKey = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const r of enriched) {
      out[r.key] = r.skip ? null : computeBpSummaryText(r, showSummary, errorBarLabel);
    }
    return out;
  }, [enriched, showSummary, errorBarLabel]);
  const summaryKey = JSON.stringify(summaryByKey);
  const onSummaryForKeyRef = useRef(onSummaryForKey);
  onSummaryForKeyRef.current = onSummaryForKey;
  useEffect(() => {
    if (typeof onSummaryForKeyRef.current !== "function") return;
    for (const r of sets) {
      onSummaryForKeyRef.current(r.key, summaryByKey[r.key] || null);
    }
    // Same canonicalisation pattern as the annotKey effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  const setOverride = (key: string, test: RecommendedTest | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (test == null) delete next[key];
      else next[key] = test;
      return next;
    });

  // Narrow to the populated branch — skip rows are filtered out before any
  // downstream code reads the test/post-hoc/power fields.
  const eligible = enriched.filter((r): r is EnrichedBoxplotStatsRow => !r.skip);
  if (eligible.length === 0) return null;

  const hasR = typeof buildRScript === "function";
  const stem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "stats_report";
  const rowSlug = (row: EnrichedBoxplotStatsRow, i: number): string => {
    const raw = row.name || `set-${i + 1}`;
    const clean =
      typeof svgSafeId === "function"
        ? svgSafeId(String(raw)).replace(/^-+|-+$/g, "")
        : String(raw)
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return clean || `set-${i + 1}`;
  };
  const downloadReport = (e: React.MouseEvent<HTMLElement>) => {
    if (eligible.length === 1) {
      downloadText(buildBpAggregateReport(eligible, setLabel), `${stem}_stats.txt`);
    } else {
      downloadTexts(
        eligible.map((row, i) => ({
          text: buildBpAggregateReport([row], setLabel),
          filename: `${stem}_${rowSlug(row, i)}_stats.txt`,
        }))
      );
    }
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: React.MouseEvent<HTMLElement>) => {
    if (eligible.length === 1) {
      downloadText(buildBpAggregateRScript(eligible, setLabel), `${stem}_stats.R`);
    } else {
      downloadTexts(
        eligible.map((row, i) => ({
          text: buildBpAggregateRScript([row], setLabel),
          filename: `${stem}_${rowSlug(row, i)}_stats.R`,
        }))
      );
    }
    flashSaved(e.currentTarget);
  };

  const methodsText = (): string =>
    buildGroupMethodsText({
      sets: eligible.flatMap((r) =>
        r.chosenTest
          ? [
              {
                name: eligible.length > 1 ? r.name : undefined,
                test: r.chosenTest,
                exact: r.testResult ? r.testResult.exact : undefined,
                postHoc: r.k > 2 ? r.postHocName : null,
                ns: r.values.map((v) => v.length),
              },
            ]
          : []
      ),
      setLabel: setLabel || undefined,
      setKind: "level",
      overridden: eligible.some((r) => overrides[r.key] != null),
      display: methodsDisplay(displayKind),
    });

  const multiSet = sets.length > 1;
  const setNoun = (setLabel || tr("boxplot.sp.set")).toLowerCase();
  const reportTitle = multiSet
    ? tr("boxplot.sp.txtTitleMulti", { label: setNoun })
    : tr("boxplot.sp.txtTitleSingle");
  const rTitle = multiSet
    ? tr("boxplot.sp.rTitleMulti", { label: setNoun })
    : tr("boxplot.sp.rTitleSingle");

  const exportsFooter = (
    <div
      className="dv-inspector-exports"
      style={{
        padding: "16px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--surface-subtle)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
        {tr("boxplot.sp.analysisExports")}
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {hasR && (
          <button type="button" className="dv-btn dv-btn-ink" onClick={downloadR} title={rTitle}>
            {tr("boxplot.sp.rScript")}
          </button>
        )}
        <MethodsButton getText={methodsText} />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={downloadReport}
          title={reportTitle}
        >
          {tr("boxplot.sp.reportTxt")}
        </button>
      </div>
    </div>
  );

  const detailFor = (r: EnrichedBoxplotStatsRow) => (
    <BoxplotStatsDetail
      row={r}
      isOverridden={!!overrides[r.key]}
      onOverrideTest={(t) => setOverride(r.key, t)}
    />
  );

  if (!multiSet) {
    return (
      <div data-testid="bp-stats" className="dv-inspector">
        {detailFor(eligible[0])}
        {exportsFooter}
      </div>
    );
  }

  // Several sets (facets / subgroups): a list of result rows; selecting one
  // opens its detail sections underneath it.
  return (
    <div data-testid="bp-stats" className="dv-inspector">
      <InspectorSection label={tr("boxplot.sp.statsAtEach", { label: setNoun })}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {tr("boxplot.sp.pickSet", { label: setNoun })}
        </p>
      </InspectorSection>
      {enriched.map((r) => {
        const key = r.key;
        if (r.skip) {
          return (
            <div key={key} className="dv-set-row" style={{ cursor: "default" }}>
              <span style={{ fontWeight: 600 }}>{r.name || "—"}</span>
              <span style={{ gridColumn: "2 / -1", fontSize: 12, color: "var(--text-faint)" }}>
                {tr("boxplot.sp.needsGroups")}
              </span>
            </div>
          );
        }
        const isOpen = !!expanded[key];
        const p = r.testResult && !r.testResult.error ? (r.testResult.p ?? null) : null;
        return (
          <div key={key}>
            <button
              type="button"
              className="dv-set-row"
              aria-expanded={isOpen}
              onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
            >
              <span style={{ fontWeight: 600, textAlign: "left" }}>{r.name || "—"}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "left" }}>
                {bpTestLabel(r.chosenTest)}
              </span>
              <span className="dv-mono-faint">{p != null ? formatP(p) : "—"}</span>
              <StarsBadge p={p} />
            </button>
            {isOpen && (
              <div style={{ borderLeft: "3px solid var(--accent-primary)" }}>{detailFor(r)}</div>
            )}
          </div>
        );
      })}
      {exportsFooter}
    </div>
  );
}

// Display controls for the statistics on the figure (marks, ns, summary
// line), shown in the workspace toolbar above the plot. They apply to every
// stat set in lockstep. Letters (compact letter display) need ≥ 3 groups in
// at least one set.
export function BoxplotStatsDisplayBar({
  sets,
  displayMode,
  onDisplayModeChange,
  showNs,
  onShowNsChange,
  showSummary,
  onShowSummaryChange,
}: BoxplotStatsDisplayBarProps) {
  const tr = useT();
  const anyMulti = sets.some(
    (s) => (s.groups || []).filter((g) => g && g.values && g.values.length >= 2).length > 2
  );
  const nsDisabled = displayMode === "none" || (anyMulti && displayMode === "cld");
  const options: Array<{ value: "none" | "cld" | "brackets"; label: string }> = [
    { value: "none", label: tr("boxplot.sp.off") },
    ...(anyMulti ? [{ value: "cld" as const, label: tr("boxplot.sp.letters") }] : []),
    { value: "brackets", label: tr("boxplot.sp.brackets") },
  ];
  const check = (disabled: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: disabled ? "var(--text-faint)" : "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  });
  return (
    <>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
        {tr("boxplot.sp.displayOnPlot")}
      </span>
      <SegToggle<"none" | "cld" | "brackets">
        ariaLabel={tr("boxplot.sp.displayOnPlot")}
        value={displayMode}
        onChange={onDisplayModeChange}
        options={options}
        style={{ flex: "0 0 auto" }}
      />
      <label style={check(nsDisabled)}>
        <input
          type="checkbox"
          checked={!nsDisabled && showNs}
          disabled={nsDisabled}
          onChange={(e) => onShowNsChange(e.target.checked)}
        />
        {tr("boxplot.sp.showNs")}
      </label>
      <label style={check(false)}>
        <input
          type="checkbox"
          checked={showSummary}
          onChange={(e) => onShowSummaryChange(e.target.checked)}
        />
        {tr("boxplot.sp.printSummary")}
      </label>
    </>
  );
}

/* ── Stats state reducer ───────────────────────────────────────────────────── */

// The reducer + init live in `./stats-reducer` so they can be unit-tested
// without pulling this React-heavy file into the vm context. Re-exported
// here for backward compatibility with existing `import { statsReducer,
// statsInit } from "./stats-panel"` consumers.
export { statsInit, statsReducer } from "./stats-reducer";

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
  computePowerFromData,
  postHocForTest,
  runPostHoc,
  runTest,
  MethodsButton,
  GroupTestSections,
  InspectorExports,
  InspectorSection,
  SegToggle,
  SetDetail,
  SetRow,
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
  PostHocResult,
  SelectTestResult,
} from "./helpers";
import { buildBpAggregateReport, buildBpAggregateRScript } from "./reports";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, downloadTexts, flashSaved } from "../_core/download";
import { selectTest } from "../_core/stats/posthoc";
import { formatP } from "../_core/stats/format";
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

// One stat set's results as inspector sections (shared with Line Plot and
// RLU Timecourse through `GroupTestSections`).
function BoxplotStatsDetail({ row, onOverrideTest, isOverridden }: BoxplotStatsDetailProps) {
  const res = row.testResult ?? ({} as TestResult);
  const p = res.error ? null : typeof res.p === "number" ? res.p : null;
  // formatBpResultLine separates its parts with a comma + two spaces, which
  // never occurs inside a part ("F(2, 45.51) = 37.326").
  const resultParts = row.chosenTest
    ? formatBpResultLine(row.chosenTest, res).split(/,\s{2,}/)
    : ["—"];
  return (
    <GroupTestSections
      names={row.names}
      values={row.values}
      rec={row.rec as SelectTestResult | null | undefined}
      chosenTest={row.chosenTest ?? null}
      testOptions={row.names.length === 2 ? TEST_OPTIONS_BP_2 : TEST_OPTIONS_BP_K}
      testLabel={bpTestLabel}
      posthocLabel={bpPosthocLabel}
      resultParts={resultParts}
      p={p}
      error={!!res.error}
      postHocName={row.postHocName}
      postHocResult={row.postHocResult}
      powerResult={row.powerResult}
      isOverridden={!!isOverridden}
      onOverrideTest={(t) => onOverrideTest && onOverrideTest(t)}
    />
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
    <InspectorExports label={tr("boxplot.sp.analysisExports")}>
      {hasR && (
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={downloadR}
          title={rTitle}
        >
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
    </InspectorExports>
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
            <SetRow
              name={r.name || "—"}
              detail={bpTestLabel(r.chosenTest)}
              p={p}
              pText={p != null ? formatP(p) : "—"}
              open={isOpen}
              onToggle={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
            />
            {isOpen && <SetDetail>{detailFor(r)}</SetDetail>}
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

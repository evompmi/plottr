// AequorinStatsDetail + AequorinStatsPanel: the Σ-barplot statistics, shown
// in the workspace's inspector column. Aequorin only ever has one set (one
// bar per condition), so the panel shows the test's sections directly. Its
// first section sets the marks on the Σ barplot (Off / Letters / Brackets,
// Show ns, Print summary below plot); they drive the barplot's annotations
// and summary text via the onAnnotationChange / onSummaryChange callbacks.
//
// Pure helpers (formatters, annotation-spec builder, summary-text builder,
// aggregate text / R-script builders) live in ./reports so they stay
// unit-testable without React.

import {
  TEST_LABELS_AQ,
  POSTHOC_LABELS_AQ,
  TEST_OPTIONS_AQ_2,
  TEST_OPTIONS_AQ_K,
  formatAqResultLine,
  computeAqAnnotationSpec,
  computeAqSummaryText,
  buildAqAggregateReport,
  buildAqAggregateRScript,
} from "./reports";
import {
  TestResult,
  buildRScript,
  computePowerFromData,
  postHocForTest,
  runPostHoc,
  runTest,
  MethodsButton,
  buildGroupMethodsText,
  methodsDisplay,
  GroupTestSections,
  InspectorExports,
  InspectorSection,
  SegToggle,
} from "../_shell";
import {
  AequorinStatsDetailProps,
  AequorinStatsPanelProps,
  AnnotationSpec,
  EnrichedAequorinStatsRow,
  PostHocResult,
  SelectTestResult,
  StatsGroup,
} from "./helpers";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, flashSaved } from "../_core/download";
import { selectTest } from "../_core/stats/posthoc";
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

// The test's results as inspector sections (shared with Group Plot and Line
// Plot through `GroupTestSections`).
export function AequorinStatsDetail({
  row,
  onOverrideTest,
  isOverridden,
}: AequorinStatsDetailProps) {
  const res = row.testResult ?? ({} as TestResult);
  const p = res.error ? null : typeof res.p === "number" ? res.p : null;
  // formatAqResultLine separates its parts with a comma + two spaces.
  const resultParts = row.chosenTest
    ? formatAqResultLine(row.chosenTest, res).split(/,\s{2,}/)
    : ["—"];
  return (
    <GroupTestSections
      names={row.names}
      values={row.values}
      rec={row.rec as SelectTestResult | null | undefined}
      chosenTest={row.chosenTest ?? null}
      testOptions={row.names.length === 2 ? TEST_OPTIONS_AQ_2 : TEST_OPTIONS_AQ_K}
      testLabel={aqTestLabel}
      posthocLabel={aqPosthocLabel}
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
  displayKind,
  valueNote,
}: AequorinStatsPanelProps) {
  const tr = useT();
  const singleKey = "_global";
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
  const methodsText = (): string =>
    enriched.chosenTest
      ? buildGroupMethodsText({
          sets: [
            {
              test: enriched.chosenTest,
              exact: enriched.testResult ? enriched.testResult.exact : undefined,
              postHoc: enriched.k > 2 ? enriched.postHocName : null,
              ns: enriched.values.map((v) => v.length),
            },
          ],
          valueNote,
          overridden: override != null,
          display: methodsDisplay(displayKind),
        })
      : "";
  const downloadReport = (e: React.MouseEvent<HTMLElement>) => {
    downloadText(buildAqAggregateReport([enriched]), `${stem}.txt`);
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: React.MouseEvent<HTMLElement>) => {
    downloadText(buildAqAggregateRScript([enriched]), `${stem}.R`);
    flashSaved(e.currentTarget);
  };

  const anyMulti = enriched.k > 2;
  const nsDisabled = displayMode === "none" || (anyMulti && displayMode === "cld");
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
    <div data-testid="aq-stats" className="dv-inspector">
      <InspectorSection label={tr("aequorin.sp.marksOnBarplot")}>
        <SegToggle<"none" | "cld" | "brackets">
          ariaLabel={tr("aequorin.sp.displayOnPlot")}
          value={displayMode}
          onChange={setDisplayMode}
          options={[
            { value: "none", label: tr("aequorin.sp.off") },
            ...(anyMulti ? [{ value: "cld" as const, label: tr("aequorin.sp.letters") }] : []),
            { value: "brackets", label: tr("aequorin.sp.brackets") },
          ]}
        />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={check(nsDisabled)}>
            <input
              type="checkbox"
              checked={!nsDisabled && showNs}
              disabled={nsDisabled}
              onChange={(e) => setShowNs(e.target.checked)}
            />
            {tr("aequorin.sp.showNs")}
          </label>
          <label style={check(false)}>
            <input
              type="checkbox"
              checked={showSummary}
              onChange={(e) => setShowSummary(e.target.checked)}
            />
            {tr("aequorin.sp.printSummary")}
          </label>
        </div>
      </InspectorSection>
      <AequorinStatsDetail
        row={enriched}
        isOverridden={override != null}
        onOverrideTest={(t) => setOverride(t)}
      />
      <InspectorExports label={tr("aequorin.sp.analysisExports")}>
        {hasR && (
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            onClick={downloadR}
            title={tr("aequorin.sp.rTitle")}
          >
            {tr("aequorin.sp.rScript")}
          </button>
        )}
        <MethodsButton getText={methodsText} />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={downloadReport}
          title={tr("aequorin.sp.txtTitle")}
        >
          {tr("aequorin.sp.reportTxt")}
        </button>
      </InspectorExports>
    </div>
  );
}

// lineplot/stats-panel.tsx — Per-x statistics table (PerXStatsPanel) and
// the per-row decision-trace expander (PerXDetail). Pulls test/post-hoc
// labels and the text/R script builders from reports.ts; uses the shared
// stats-dispatch helpers for runtime overrides.

import {
  STATS_TESTS_FOR_K,
  STATS_TESTS_FOR_K2,
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
  SetDetail,
  SetRow,
} from "../_shell";
import {
  formatX,
  withPower,
  PerXStatsRow,
  PerXDetailProps,
  PerXStatsPanelProps,
  PerXRow,
  PostHocResult,
  SelectTestResult,
} from "./helpers";
import {
  TEST_LABELS_LP,
  POSTHOC_LABELS_LP,
  formatStat,
  buildAggregateReport,
  buildAggregateRScript,
} from "./reports";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, downloadTexts, fileBaseName, flashSaved } from "../_core/download";
import { bhAdjust, selectTest } from "../_core/stats/posthoc";
import { formatP } from "../_core/stats/format";
import { tt, useT, type LineplotKey } from "./i18n";
const { useState, useMemo } = React;

// Localized test / post-hoc display names (registry labels stay English for
// R export; these are the on-screen copies).
const TEST_LABEL_KEYS_LP: Record<string, LineplotKey> = {
  studentT: "lineplot.test.studentT",
  welchT: "lineplot.test.welchT",
  mannWhitney: "lineplot.test.mannWhitney",
  oneWayANOVA: "lineplot.test.oneWayANOVA",
  welchANOVA: "lineplot.test.welchANOVA",
  kruskalWallis: "lineplot.test.kruskalWallis",
};
const POSTHOC_LABEL_KEYS_LP: Record<string, LineplotKey> = {
  tukeyHSD: "lineplot.posthoc.tukeyHSD",
  gamesHowell: "lineplot.posthoc.gamesHowell",
  dunn: "lineplot.posthoc.dunn",
};
export function lpTestLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return TEST_LABEL_KEYS_LP[key] ? tt(TEST_LABEL_KEYS_LP[key]) : TEST_LABELS_LP[key] || key;
}
function lpPosthocLabel(key: string): string {
  return POSTHOC_LABEL_KEYS_LP[key]
    ? tt(POSTHOC_LABEL_KEYS_LP[key])
    : POSTHOC_LABELS_LP[key] || key;
}

// One x value's results as inspector sections (shared with Group Plot and
// RLU Timecourse through `GroupTestSections`), plus the BH-adjusted p.
export function PerXDetail({ row, onOverrideTest, isOverridden }: PerXDetailProps) {
  const tr = useT();
  const powerResult = useMemo(
    () => computePowerFromData(row.chosenTest ?? "", row.values),
    [row.chosenTest, row.values]
  );
  const res = row.result ?? ({} as TestResult);
  const p = res.error ? null : typeof res.p === "number" ? res.p : null;
  const resultParts = res.error
    ? [`⚠ ${res.error}`]
    : [
        formatStat(row.chosenTest, res),
        `p = ${formatP(res.p)}`,
        ...(row.pAdj != null ? [tr("lineplot.sp.pBH", { p: formatP(row.pAdj) })] : []),
      ];
  return (
    <GroupTestSections
      names={row.names}
      values={row.values}
      rec={row.rec as SelectTestResult | null | undefined}
      chosenTest={row.chosenTest ?? null}
      testOptions={row.names.length === 2 ? STATS_TESTS_FOR_K2 : STATS_TESTS_FOR_K}
      testLabel={lpTestLabel}
      posthocLabel={lpPosthocLabel}
      resultParts={resultParts}
      p={p}
      error={!!res.error}
      postHocName={row.postHocName}
      postHocResult={row.postHocResult}
      powerResult={powerResult}
      isOverridden={!!isOverridden}
      onOverrideTest={(t) => onOverrideTest && onOverrideTest(t)}
    />
  );
}

export function PerXStatsPanel({ rows, xLabel, fileName, displayKind }: PerXStatsPanelProps) {
  const tr = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, RecommendedTest>>({});
  const stem = fileBaseName(fileName, "lineplot");
  const hasR = typeof buildRScript === "function";

  const enriched = useMemo<PerXStatsRow[]>(() => {
    const withChosen: PerXStatsRow[] = rows.map((r: PerXRow) => {
      const key = formatX(r.x);
      const rec = selectTest(r.values) as SelectTestResult;
      const recTest = rec.recommendation?.test ?? null;
      const chosenTest = overrides[key] || recTest || r.chosenTest;
      const result = chosenTest ? runTest(chosenTest, r.values) : null;
      const postHocName = postHocForTest(chosenTest);
      // runPostHoc's typed return is intentionally loose (`{ pairs?: unknown[] }`)
      // because the three post-hoc shapes differ. Cast to PostHocResult here so
      // downstream rendering can pick optional fields off pairs without
      // re-asserting at every call site.
      const postHocResult = (
        r.names.length >= 3 && postHocName ? runPostHoc(postHocName, r.values) : null
      ) as PostHocResult | null;
      return { ...r, rec, chosenTest, result, postHocName, postHocResult, pAdj: null };
    });
    // Recompute BH-adjusted p-values across the x-axis using the (possibly
    // user-overridden) per-x test results.
    const validIdx: number[] = [];
    const validPs: number[] = [];
    withChosen.forEach((r, i) => {
      if (r.result && !r.result.error && r.result.p != null && Number.isFinite(r.result.p)) {
        validIdx.push(i);
        validPs.push(r.result.p);
      }
    });
    const adjPs = validPs.length > 0 ? bhAdjust(validPs) : [];
    validIdx.forEach((origIdx, j) => (withChosen[origIdx].pAdj = adjPs[j]));
    return withChosen;
  }, [rows, overrides]);

  const setOverride = (key: string, test: RecommendedTest | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (test == null) delete next[key];
      else next[key] = test;
      return next;
    });

  const xSlug = (row: PerXStatsRow, i: number): string => {
    const raw = formatX(row.x);
    const clean =
      typeof svgSafeId === "function"
        ? svgSafeId(String(raw)).replace(/^-+|-+$/g, "")
        : String(raw)
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return clean || `x-${i + 1}`;
  };
  const downloadReport = () => {
    const withPlanning = enriched.map(withPower);
    if (withPlanning.length <= 1) {
      downloadText(buildAggregateReport(withPlanning, xLabel), `${stem}_stats.txt`);
      return;
    }
    downloadTexts(
      withPlanning.map((row, i) => ({
        text: buildAggregateReport([row], xLabel),
        filename: `${stem}_${xSlug(row, i)}_stats.txt`,
      }))
    );
  };
  const downloadR = () => {
    if (enriched.length <= 1) {
      downloadText(buildAggregateRScript(enriched, xLabel), `${stem}_stats.R`);
      return;
    }
    downloadTexts(
      enriched.map((row, i) => ({
        text: buildAggregateRScript([row], xLabel),
        filename: `${stem}_${xSlug(row, i)}_stats.R`,
      }))
    );
  };

  const methodsText = () => {
    const tested = enriched.filter(
      (r) => r.chosenTest && r.result && !r.result.error && r.values.length >= 2
    );
    return buildGroupMethodsText({
      sets: tested.map((r) => ({
        name: formatX(r.x),
        test: r.chosenTest as NonNullable<typeof r.chosenTest>,
        exact: r.result ? r.result.exact : undefined,
        postHoc: r.names.length > 2 ? r.postHocName : null,
        ns: r.values.map((v) => v.length),
      })),
      setLabel: xLabel || undefined,
      setKind: "x",
      overridden: tested.some((r) => overrides[formatX(r.x)] != null),
      adjustAcrossSets: "bh",
      display: methodsDisplay(displayKind),
    });
  };
  const xName = xLabel || tr("lineplot.sp.xFallback");

  return (
    <div data-testid="lp-stats" className="dv-inspector">
      <InspectorSection label={tr("lineplot.sp.title", { x: xName })}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {tr("lineplot.sp.desc")}
        </p>
      </InspectorSection>
      {enriched.map((r) => {
        const key = formatX(r.x);
        const isOpen = !!expanded[key];
        return (
          <div key={key}>
            <SetRow
              name={<span style={{ fontFamily: "var(--font-mono)" }}>{key}</span>}
              detail={r.chosenTest ? lpTestLabel(r.chosenTest) : "—"}
              p={r.pAdj}
              pText={r.pAdj != null ? formatP(r.pAdj) : "—"}
              open={isOpen}
              onToggle={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
            />
            {isOpen && (
              <SetDetail>
                <PerXDetail
                  row={r}
                  isOverridden={!!overrides[key]}
                  onOverrideTest={(t) => setOverride(key, t)}
                />
              </SetDetail>
            )}
          </div>
        );
      })}
      <InspectorExports label={tr("lineplot.sp.analysisExports")}>
        {hasR && (
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            onClick={(e) => {
              downloadR();
              flashSaved(e.currentTarget);
            }}
            title={tr("lineplot.sp.rTitle")}
          >
            {tr("lineplot.sp.rScript")}
          </button>
        )}
        <MethodsButton getText={methodsText} />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={(e) => {
            downloadReport();
            flashSaved(e.currentTarget);
          }}
          title={tr("lineplot.sp.reportTitle")}
        >
          {tr("lineplot.sp.reportTxt")}
        </button>
      </InspectorExports>
    </div>
  );
}

// Marks on the plot (Off / Stars), shown in the workspace toolbar, with the
// same "Show ns" and "Print summary below plot" checkboxes as Group Plot.
// Stars render at each x whose BH-adjusted p < 0.05 ("ns" elsewhere when
// Show ns is ticked); lineplot has no letters or brackets layer.
export function LineplotStatsDisplayBar({
  showStars,
  setShowStars,
  showNs,
  setShowNs,
  showSummary,
  setShowSummary,
}: {
  showStars: boolean;
  setShowStars: (b: boolean) => void;
  showNs: boolean;
  setShowNs: (b: boolean) => void;
  showSummary: boolean;
  setShowSummary: (b: boolean) => void;
}) {
  const tr = useT();
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
        {tr("lineplot.sp.displayOnPlot")}
      </span>
      <SegToggle<"off" | "stars">
        ariaLabel={tr("lineplot.sp.displayOnPlot")}
        value={showStars ? "stars" : "off"}
        onChange={(v) => setShowStars(v === "stars")}
        options={[
          { value: "off", label: tr("lineplot.sp.off") },
          { value: "stars", label: tr("lineplot.sp.stars") },
        ]}
        style={{ flex: "0 0 auto" }}
      />
      <label style={check(!showStars)}>
        <input
          type="checkbox"
          checked={showStars && showNs}
          disabled={!showStars}
          onChange={(e) => setShowNs(e.target.checked)}
          data-testid="lineplot-show-ns"
        />
        {tr("lineplot.sp.showNs")}
      </label>
      <label style={check(false)}>
        <input
          type="checkbox"
          checked={showSummary}
          onChange={(e) => setShowSummary(e.target.checked)}
          data-testid="lineplot-show-summary"
        />
        {tr("lineplot.sp.printSummary")}
      </label>
    </>
  );
}

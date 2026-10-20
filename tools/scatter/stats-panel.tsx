// Scatter correlation stats panel. Sits below the chart card and mirrors
// the boxplot stats panel's shape:
//
//   - Header row with title + TXT / R download buttons
//   - One row per "set" (overall + one per colour-mapped category)
//   - Click a row to expand: variables / assumptions (Shapiro-Wilk on x and
//     y) / test (Pearson / Spearman / Kendall dropdown with recommended
//     pick) / coefficient + 95 % CI for r and ρ, p-value, n
//
// Reads per-set values off `ScatterStatsSet[]` produced by `plot-area.tsx`;
// the panel owns the per-row test override + expanded state locally — they
// don't persist across sessions.
//
// Pure formatters and the discriminated `CorrResult` shape live in
// `tools/scatter/helpers.ts`. Text + R report builders live in
// `tools/scatter/reports.ts`.

import {
  CORR_TEST_LABELS,
  CORR_TEST_OPTIONS,
  CorrResult,
  EnrichedOrSkip,
  EnrichedScatterStatsRow,
  ScatterStatsSet,
  formatCorrResultLine,
  runCorrelation,
} from "./helpers";
import { buildScatterAggregateReport, buildScatterAggregateRScript } from "./reports";
import {
  MethodsButton,
  WhyThisTest,
  alphaSentence,
  buildCorrelationReason,
  joinList,
  listSep,
  nRange,
  softwareSentence,
  AssumptionRow,
  InspectorExports,
  InspectorSection,
  ResultHeadline,
  SetDetail,
  SetRow,
  inspectorFirstCol,
  inspectorTable,
  inspectorTd,
  inspectorTh,
} from "../_shell";

import { svgSafeId } from "../_core/svg-export";
import { downloadText, downloadTexts, flashSaved } from "../_core/download";
import { sampleMean, sampleSD, selectCorrelation } from "../_core/stats/tests";
import { formatP } from "../_core/stats/format";
import type { CorrTest } from "../_core/stats/types";
import { tt, useT, type ScatterKey } from "./i18n";
const { useState, useMemo } = React;

// Localized correlation-test display names (registry stays English for the
// R export); proper names (Pearson r, Spearman ρ, Kendall τ) are identical
// across languages but routed through the catalog for consistency.
const CORR_LABEL_KEYS: Record<string, ScatterKey> = {
  pearson: "scatter.corr.pearson",
  spearman: "scatter.corr.spearman",
  kendall: "scatter.corr.kendall",
};
function corrLabel(key: string): string {
  return CORR_LABEL_KEYS[key] ? tt(CORR_LABEL_KEYS[key]) : CORR_TEST_LABELS[key as CorrTest] || key;
}

interface ScatterStatsDetailProps {
  row: EnrichedScatterStatsRow;
  onOverrideTest: (test: CorrTest | null) => void;
  isOverridden: boolean;
  xLabel: string;
  yLabel: string;
}

// Parts of a correlation result line, split on the commas between them
// (not the one inside "95% CI [lo, hi]").
function resultParts(res: CorrResult | null | undefined): string[] {
  return formatCorrResultLine(res).split(/,\s+(?![^[]*\])/);
}

// One set's correlation as inspector sections.
function ScatterStatsDetail({
  row,
  onOverrideTest,
  isOverridden,
  xLabel,
  yLabel,
}: ScatterStatsDetailProps) {
  const tr = useT();
  const res = row.testResult;
  const rec = row.rec;
  const recTest = rec?.recommendation?.test ?? null;
  const suggestion = rec?.suggestion ?? null;
  const normality = rec?.normality ?? [];
  const axisName = (axis: "x" | "y") => (axis === "x" ? xLabel : yLabel) || axis.toUpperCase();
  const p = res && !res.error ? res.p : null;

  return (
    <>
      <InspectorSection label={tr("scatter.sp.correlation")}>
        <ResultHeadline
          name={corrLabel(row.chosenTest)}
          p={p}
          parts={resultParts(res)}
          error={!!(res && res.error)}
        />
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {tr("scatter.sp.test")}
          <select
            value={row.chosenTest}
            onChange={(e) => {
              const next = e.target.value as CorrTest;
              onOverrideTest(next === recTest ? null : next);
            }}
            className="dv-select"
            style={{ width: "100%", minHeight: 34 }}
          >
            {CORR_TEST_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {corrLabel(t)}
                {t === recTest ? tr("scatter.sp.recommendedSuffix") : ""}
              </option>
            ))}
          </select>
        </label>
        {isOverridden && (
          <button
            type="button"
            onClick={() => onOverrideTest(null)}
            className="dv-btn dv-btn-secondary"
            style={{ alignSelf: "flex-start" }}
          >
            {tr("scatter.sp.useRecommendation")}
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
              <strong>{tr("scatter.sp.suggestedAlt")}</strong> {tr("scatter.sp.suggestConsider")}
              <strong>{corrLabel(suggestion.test)}</strong>.
            </span>
            <button
              type="button"
              onClick={() => onOverrideTest(suggestion.test)}
              className="dv-btn dv-btn-secondary"
              style={{ alignSelf: "flex-start" }}
            >
              {tr("scatter.sp.useSuggestion")}
            </button>
          </div>
        )}
        {res && !res.error && res.kind === "kendall" && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic" }}>
            {tr("scatter.sp.kendallNote")}
          </div>
        )}
      </InspectorSection>

      <InspectorSection label={tr("scatter.sp.assumptionsChecked")}>
        {normality.map((r, i) => (
          <AssumptionRow
            key={i}
            ok={r.normal}
            label={tr("scatter.sp.normalityOf", { axis: axisName(r.axis) })}
            value={r.p != null ? `p = ${formatP(r.p)}` : "—"}
            title={r.W != null ? `W = ${r.W.toFixed(3)}` : undefined}
          />
        ))}
        <WhyThisTest text={buildCorrelationReason(rec)} />
      </InspectorSection>

      <InspectorSection label={tr("scatter.sp.variables")}>
        <table style={inspectorTable}>
          <thead>
            <tr>
              <th style={{ ...inspectorTh, ...inspectorFirstCol }}>
                <span className="dv-sr-only">{tr("scatter.sp.axis")}</span>
              </th>
              <th style={inspectorTh}>{tr("scatter.sp.n")}</th>
              <th style={inspectorTh}>{tr("scatter.sp.mean")}</th>
              <th style={inspectorTh}>{tr("scatter.sp.sd")}</th>
            </tr>
          </thead>
          <tbody>
            {(["x", "y"] as const).map((axis) => {
              const vs = axis === "x" ? row.xs : row.ys;
              const n = vs.length;
              const m = n > 0 ? sampleMean(vs) : NaN;
              const sd = n > 1 ? sampleSD(vs) : 0;
              return (
                <tr key={axis}>
                  <td style={{ ...inspectorTd, ...inspectorFirstCol }}>{axisName(axis)}</td>
                  <td style={inspectorTd}>{n}</td>
                  <td style={inspectorTd}>{Number.isFinite(m) ? m.toFixed(3) : "—"}</td>
                  <td style={inspectorTd}>{n > 1 ? sd.toFixed(3) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </InspectorSection>
    </>
  );
}

export interface ScatterStatsPanelProps {
  sets: ScatterStatsSet[];
  fileStem: string;
  xLabel: string;
  yLabel: string;
  // The plot shows the least-squares line (methods text).
  regressionOn?: boolean;
}

export function ScatterStatsPanel({
  sets,
  fileStem,
  xLabel,
  yLabel,
  regressionOn,
}: ScatterStatsPanelProps) {
  const tr = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    sets.length === 1 ? { [sets[0].key]: true } : {}
  );
  const [overrides, setOverrides] = useState<Record<string, CorrTest>>({});

  const enriched = useMemo<EnrichedOrSkip[]>(
    () =>
      sets.map((s): EnrichedOrSkip => {
        const n = Math.min(s.xs.length, s.ys.length);
        if (n < 3) return { ...s, n, skip: true };
        const rec = selectCorrelation(s.xs, s.ys);
        const recTest = rec.recommendation.test;
        const chosenTest = overrides[s.key] || recTest;
        const testResult: CorrResult = runCorrelation(chosenTest, s.xs, s.ys);
        return {
          ...s,
          n,
          rec,
          recTest,
          chosenTest,
          testResult,
        };
      }),
    [sets, overrides]
  );

  const setOverride = (key: string, test: CorrTest | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (test == null) delete next[key];
      else next[key] = test;
      return next;
    });

  const eligible = enriched.filter((r): r is EnrichedScatterStatsRow => !r.skip);
  if (sets.length === 0) return null;

  // Methods paragraph: the correlation run on each row, with its p-value
  // method (exact / series / approximation), then shared closing sentences.
  const methodsText = (): string => {
    const rows = eligible.filter((r) => r.testResult && !r.testResult.error);
    if (rows.length === 0) return "";
    const exactOf = (r: EnrichedScatterStatsRow): boolean | undefined =>
      r.testResult && r.testResult.kind !== "pearson" ? !!r.testResult.exact : undefined;
    const groups: Array<{ test: CorrTest; names: string[]; exact: boolean[] }> = [];
    for (const r of rows) {
      let g = groups.find((x) => x.test === r.chosenTest);
      if (!g) {
        g = { test: r.chosenTest, names: [], exact: [] };
        groups.push(g);
      }
      g.names.push(r.name);
      const e = exactOf(r);
      if (e != null) g.exact.push(e);
    }
    const phrase = (g: (typeof groups)[number]): string => {
      if (g.test === "pearson") return tr("scatter.methods.pearson");
      const all = g.exact.every((e) => e);
      const none = g.exact.every((e) => !e);
      const suffix = all ? "Exact" : none ? "Approx" : "Mixed";
      return tr(`scatter.methods.${g.test}${suffix}` as ScatterKey);
    };
    const x = xLabel,
      y = yLabel;
    const n = nRange(rows.map((r) => r.n)).replace(/^n = /, "");
    const out: string[] = [];
    if (rows.length === 1) {
      out.push(tr("scatter.methods.one", { x, y, n, test: phrase(groups[0]) }));
    } else if (groups.length === 1) {
      out.push(
        tr("scatter.methods.manySame", {
          x,
          y,
          n,
          names: joinList(groups[0].names),
          test: phrase(groups[0]),
        })
      );
    } else {
      const list = groups
        .map((g) => tr("scatter.methods.testFor", { test: phrase(g), names: joinList(g.names) }))
        .join(listSep());
      out.push(tr("scatter.methods.manyMixed", { x, y, n, list }));
    }
    const overridden = rows.some((r) => overrides[r.key] != null);
    out.push(
      tr(
        !overridden && rows.every((r) => r.chosenTest === "pearson")
          ? "scatter.methods.policy"
          : "scatter.methods.diagnostics"
      )
    );
    out.push(alphaSentence());
    if (regressionOn) out.push(tr("scatter.methods.regression", { x, y }));
    out.push(softwareSentence(groups.map((g) => `cor.test(x, y, method = "${g.test}")`)));
    return out.join(" ");
  };

  const stem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "scatter_correlation";
  const rowSlug = (row: EnrichedScatterStatsRow, i: number): string => {
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
    if (eligible.length === 0) return;
    if (eligible.length === 1) {
      downloadText(
        buildScatterAggregateReport(eligible, xLabel, yLabel),
        `${stem}_correlation.txt`
      );
    } else {
      downloadTexts(
        eligible.map((row, i) => ({
          text: buildScatterAggregateReport([row], xLabel, yLabel),
          filename: `${stem}_${rowSlug(row, i)}_correlation.txt`,
        }))
      );
    }
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: React.MouseEvent<HTMLElement>) => {
    if (eligible.length === 0) return;
    if (eligible.length === 1) {
      downloadText(buildScatterAggregateRScript(eligible, xLabel, yLabel), `${stem}_correlation.R`);
    } else {
      downloadTexts(
        eligible.map((row, i) => ({
          text: buildScatterAggregateRScript([row], xLabel, yLabel),
          filename: `${stem}_${rowSlug(row, i)}_correlation.R`,
        }))
      );
    }
    flashSaved(e.currentTarget);
  };

  const singleSet = sets.length === 1;
  const swatch = (color: string | undefined) =>
    color ? (
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          marginRight: 6,
        }}
      />
    ) : null;
  const detailFor = (r: EnrichedScatterStatsRow) => (
    <ScatterStatsDetail
      row={r}
      isOverridden={!!overrides[r.key]}
      onOverrideTest={(t) => setOverride(r.key, t)}
      xLabel={xLabel}
      yLabel={yLabel}
    />
  );
  const exportsFooter =
    eligible.length > 0 ? (
      <InspectorExports label={tr("scatter.sp.analysisExports")}>
        <button
          type="button"
          className="dv-btn dv-btn-ink"
          onClick={downloadR}
          title={singleSet ? tr("scatter.sp.rTitleSingle") : tr("scatter.sp.rTitleMulti")}
        >
          {tr("scatter.sp.rScript")}
        </button>
        <MethodsButton getText={methodsText} />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={downloadReport}
          title={singleSet ? tr("scatter.sp.txtTitleSingle") : tr("scatter.sp.txtTitleMulti")}
        >
          {tr("scatter.sp.reportTxt")}
        </button>
      </InspectorExports>
    ) : null;

  if (singleSet && eligible.length === 1) {
    return (
      <div data-testid="scatter-stats" className="dv-inspector">
        {detailFor(eligible[0])}
        {exportsFooter}
      </div>
    );
  }

  return (
    <div data-testid="scatter-stats" className="dv-inspector">
      <InspectorSection
        label={singleSet ? tr("scatter.sp.headingSingle") : tr("scatter.sp.headingGroup")}
      >
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {tr("scatter.sp.pickGroup")}
        </p>
      </InspectorSection>
      {enriched.map((r) => {
        const key = r.key;
        if (r.skip) {
          return (
            <div key={key} className="dv-set-row" style={{ cursor: "default" }}>
              <span style={{ fontWeight: 600 }}>
                {swatch(r.color)}
                {r.name || "—"}
              </span>
              <span style={{ gridColumn: "2 / -1", fontSize: 12, color: "var(--text-faint)" }}>
                {tr("scatter.sp.needsPairs", { n: r.n })}
              </span>
            </div>
          );
        }
        const isOpen = !!expanded[key];
        const res = r.testResult;
        const p = res && !res.error ? res.p : null;
        return (
          <div key={key}>
            <SetRow
              name={
                <>
                  {swatch(r.color)}
                  {r.name || "—"}
                </>
              }
              detail={`${corrLabel(r.chosenTest)} · n = ${r.n}`}
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

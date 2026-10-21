// Statistics for the qPCR tool, shown in the workspace's inspector column —
// one section per target gene. Tests run
// on ΔCt through the shared Group Plot engine (selectTest → Welch t / Welch
// ANOVA + Games-Howell by default, override, decision trace); fold changes
// are only reported as back-transformed estimates with CIs.

import {
  MethodsButton,
  SegToggle,
  WhyThisTest,
  buildGroupMethodsText,
  joinList,
  buildSelectTestReason,
  STATS_TESTS_FOR_K,
  STATS_TESTS_FOR_K2,
  InspectorExports,
  InspectorSection,
  StarsBadge,
  inspectorFirstCol,
  inspectorTable,
  inspectorTd,
  inspectorTh,
} from "../_shell";
import { formatP, pStars } from "../_core/stats";
import type { SelectTestKind, SelectTestPostHoc } from "../_core/stats/types";
import { formatResultLine } from "./helpers";
import type { AnnotationMode, QpcrStatsDisplayBarProps, QpcrStatsPanelProps } from "./helpers";
import { useT, type QpcrKey } from "./i18n";

// Long headers ("Fold change vs control [95 % CI]") wrap in the narrow column.
const thS: React.CSSProperties = { ...inspectorTh, whiteSpace: "normal", verticalAlign: "bottom" };
const tdS = inspectorTd;
const firstCol = inspectorFirstCol;
const resultBox: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text)",
};

const TEST_KEYS: Record<string, QpcrKey> = {
  studentT: "qpcr.test.studentT",
  welchT: "qpcr.test.welchT",
  mannWhitney: "qpcr.test.mannWhitney",
  oneWayANOVA: "qpcr.test.oneWayANOVA",
  welchANOVA: "qpcr.test.welchANOVA",
  kruskalWallis: "qpcr.test.kruskalWallis",
};
const POSTHOC_KEYS: Record<string, QpcrKey> = {
  tukeyHSD: "qpcr.posthoc.tukeyHSD",
  gamesHowell: "qpcr.posthoc.gamesHowell",
  dunn: "qpcr.posthoc.dunn",
};

const fc = (log2: number): string =>
  Number.isFinite(log2) ? Math.pow(2, log2).toPrecision(3) : "—";

export function QpcrStatsPanel({
  genes,
  stats,
  normalize,
  control,
  overrides,
  onOverride,
  vis,
  onDownloadReport,
  onDownloadR,
  refs,
  eff,
}: QpcrStatsPanelProps) {
  const tr = useT();
  const methodsText = (): string => {
    const relToControl = normalize === "control";
    const used = refs.concat(genes.map((g) => g.gene));
    const factor = (g: string): number => eff[g] ?? 2;
    const corrected = used.some((g) => factor(g) !== 2);
    const intro: string[] = [];
    const extra: string[] = [];
    intro.push(
      corrected
        ? tr(relToControl ? "qpcr.methods.pfafflControl" : "qpcr.methods.pfafflRefs", {
            control,
            eff: used.map((g) => `${g} ${factor(g).toFixed(2)}`).join(", "),
          })
        : tr(relToControl ? "qpcr.methods.livakControl" : "qpcr.methods.livakRefs", { control })
    );
    intro.push(
      tr(refs.length > 1 ? "qpcr.methods.refMany" : "qpcr.methods.refOne", {
        refs: joinList(refs),
      })
    );
    intro.push(tr("qpcr.methods.techReps"));
    if (vis.chartStyle === "box") extra.push(tr("qpcr.methods.dispBox"));
    else
      extra.push(
        tr("qpcr.methods.dispMean", {
          err:
            vis.errorBar === "none"
              ? ""
              : tr("qpcr.methods.dispErr", { err: tr(`qpcr.methods.err.${vis.errorBar}`) }),
        })
      );
    return buildGroupMethodsText({
      sets: genes.flatMap((g, i) => {
        const st = stats[i];
        if (!st || !st.chosenTest || st.tested.length < 2) return [];
        return [
          {
            name: g.gene,
            test: st.chosenTest as SelectTestKind,
            exact: st.testResult ? st.testResult.exact : undefined,
            postHoc: st.tested.length > 2 ? (st.postHocName as SelectTestPostHoc) : null,
            ns: st.tested.map((k) => g.dCtByGroup[k].length),
          },
        ];
      }),
      setScope: tr("qpcr.methods.scope"),
      valueNote: tr("qpcr.methods.value"),
      overridden: Object.values(overrides).some((v) => v != null),
      intro,
      extra,
    });
  };
  const relToControl = normalize === "control";
  const testLabel = (t: string | null): string => (t && TEST_KEYS[t] ? tr(TEST_KEYS[t]) : t || "—");

  return (
    <div className="dv-inspector" data-testid="qpcr-stats">
      <InspectorSection label={tr("qpcr.stats.title")}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {tr("qpcr.stats.desc")}
        </p>
        {/* Collapsed like "Why this test?": the rationale is one click away
            for whoever wants it. */}
        <details className="dv-why" style={{ fontSize: 11 }} data-testid="qpcr-why-dct">
          <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontWeight: 600 }}>
            {tr("qpcr.stats.whyDctTitle")}
          </summary>
          <div style={{ marginTop: 4, color: "var(--text-muted)", lineHeight: 1.45 }}>
            <div>{tr("qpcr.stats.whyDct")}</div>
            <div style={{ marginTop: 4, fontWeight: 600 }}>{tr("qpcr.stats.dontTestFc")}</div>
          </div>
        </details>
      </InspectorSection>

      {genes.map((g, gi) => {
        const st = stats[gi];
        const k = st.tested.length;
        const reason = st.rec ? buildSelectTestReason(st.rec) : null;
        const recTest = st.rec?.recommendation?.test ?? null;
        const options = k === 2 ? STATS_TESTS_FOR_K2 : STATS_TESTS_FOR_K;
        const override = overrides[g.gene] ?? null;
        const p =
          st.testResult && !st.testResult.error && typeof st.testResult.p === "number"
            ? st.testResult.p
            : null;
        return (
          <div key={g.gene} data-testid={`qpcr-gene-${g.gene}`}>
            {/* One collapsible block per gene so a 6-gene run stays scannable:
                the first starts open, the rest show just name + stars. */}
            <InspectorSection
              label={<span style={{ fontStyle: "italic", textTransform: "none" }}>{g.gene}</span>}
              right={<StarsBadge p={p} />}
              collapsible
              defaultOpen={gi === 0}
            >
              {g.controlMissing && (
                <p style={{ fontSize: 12, color: "var(--warning-text)", margin: 0 }}>
                  {tr("qpcr.stats.noControl", { control })}
                </p>
              )}
              <table style={inspectorTable}>
                <thead>
                  <tr>
                    <th style={{ ...thS, ...firstCol }}>{tr("qpcr.stats.group")}</th>
                    <th style={thS}>n</th>
                    <th style={thS}>{tr("qpcr.stats.meanDct")}</th>
                    <th style={thS}>
                      {tr(relToControl ? "qpcr.stats.fcVsControl" : "qpcr.stats.relExpr")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.summaries.map((s) => {
                    const vs = g.vsControl.find((v) => v.group === s.group);
                    return (
                      <tr key={s.group}>
                        <td
                          style={{
                            ...tdS,
                            ...firstCol,
                            fontWeight: s.group === control ? 600 : 400,
                          }}
                        >
                          {s.group}
                        </td>
                        <td style={tdS}>{s.n}</td>
                        <td style={tdS}>
                          {s.meanDCt.toFixed(2)}
                          {Number.isFinite(s.sdDCt) ? ` ± ${s.sdDCt.toFixed(2)}` : ""}
                        </td>
                        <td style={{ ...tdS, whiteSpace: "normal" }}>
                          {!relToControl
                            ? `${fc(s.meanL)} [${fc(s.lo)}, ${fc(s.hi)}]`
                            : s.group === control
                              ? tr("qpcr.stats.calibrator")
                              : vs
                                ? `${fc(vs.log2fc)} [${fc(vs.lo)}, ${fc(vs.hi)}]`
                                : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>
                {tr(relToControl ? "qpcr.stats.tableNote" : "qpcr.stats.tableNoteRel")}
              </p>

              {k < 2 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  {tr("qpcr.stats.needTwo")}
                </p>
              ) : (
                <>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {tr("qpcr.stats.test")}
                    <select
                      className="dv-select"
                      value={override ?? ""}
                      onChange={(e) => onOverride(g.gene, e.target.value || null)}
                      data-testid={`qpcr-test-${g.gene}`}
                      style={{ width: "100%", minHeight: 34 }}
                    >
                      <option value="">
                        {tr("qpcr.stats.auto", { test: testLabel(recTest) })}
                      </option>
                      {options.map((t) => (
                        <option key={t} value={t}>
                          {testLabel(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={resultBox} data-testid={`qpcr-result-${g.gene}`}>
                    {testLabel(st.chosenTest)} {tr("qpcr.stats.onDct")}:{" "}
                    {formatResultLine(st.chosenTest, st.testResult)}
                  </div>
                  <WhyThisTest text={reason} />
                  {st.postHocResult && !st.postHocResult.error && st.postHocName && (
                    <>
                      <div className="dv-tile-title" style={{ marginTop: 4 }}>
                        {tr("qpcr.stats.posthoc", {
                          name: POSTHOC_KEYS[st.postHocName]
                            ? tr(POSTHOC_KEYS[st.postHocName])
                            : st.postHocName,
                        })}
                      </div>
                      <table style={inspectorTable}>
                        <thead>
                          <tr>
                            <th style={{ ...thS, ...firstCol }}>{tr("qpcr.stats.pair")}</th>
                            <th style={thS}>{tr("qpcr.stats.fc")}</th>
                            <th style={thS}>{tr("qpcr.stats.pAdj")}</th>
                            <th style={thS}>
                              <span className="dv-sr-only">{tr("qpcr.stats.signif")}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {st.postHocResult.pairs.map((pr) => {
                            const a = g.groups[st.tested[pr.i]];
                            const b = g.groups[st.tested[pr.j]];
                            const ga = g.summaries.find((s) => s.group === a);
                            const gb = g.summaries.find((s) => s.group === b);
                            const pp = pr.pAdj != null ? pr.pAdj : pr.p;
                            return (
                              <tr key={`${pr.i}-${pr.j}`}>
                                <td style={{ ...tdS, ...firstCol }}>{`${b} vs ${a}`}</td>
                                <td style={tdS}>{ga && gb ? fc(gb.meanL - ga.meanL) : "—"}</td>
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
                    </>
                  )}
                </>
              )}
            </InspectorSection>
          </div>
        );
      })}

      <InspectorExports label={tr("qpcr.stats.analysisExports")}>
        <button
          type="button"
          className="dv-btn dv-btn-ink"
          onClick={onDownloadR}
          title={tr("qpcr.dl.rTitle")}
          data-testid="qpcr-dl-r"
        >
          {tr("qpcr.stats.rScript")}
        </button>
        <MethodsButton getText={methodsText} />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={onDownloadReport}
          title={tr("qpcr.dl.reportTitle")}
          data-testid="qpcr-dl-txt"
        >
          {tr("qpcr.stats.reportTxt")}
        </button>
      </InspectorExports>
    </div>
  );
}

// Marks on the plot (Off / Letters / Brackets, Show ns), shown in the
// workspace toolbar above the gene panels. Letters need k > 2 groups and
// every group drawn: with the calibrator hidden its comparisons move to
// "vs control" stars.
export function QpcrStatsDisplayBar({ genes, normalize, vis, updVis }: QpcrStatsDisplayBarProps) {
  const tr = useT();
  const anyMulti =
    genes.some((g) => g.groups.length > 2) && (normalize !== "control" || vis.showCalibrator);
  const display: AnnotationMode =
    vis.annotation === "cld" && !anyMulti ? "brackets" : vis.annotation;
  const nsDisabled = display !== "brackets";
  return (
    <div
      data-testid="qpcr-display"
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
    >
      <span className="dv-toolbar-label">{tr("qpcr.stats.displayOnPlot")}</span>
      <SegToggle<AnnotationMode>
        value={display}
        onChange={(v) => updVis({ annotation: v })}
        ariaLabel={tr("qpcr.stats.displayOnPlot")}
        style={{ flex: "0 0 auto" }}
        options={[
          { value: "none", label: tr("qpcr.stats.off") },
          ...(anyMulti
            ? [
                {
                  value: "cld" as const,
                  label: tr("qpcr.stats.letters"),
                  title: tr("qpcr.stats.lettersTitle"),
                },
              ]
            : []),
          { value: "brackets", label: tr("qpcr.stats.brackets") },
        ]}
      />
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: nsDisabled ? "var(--text-faint)" : "var(--text-muted)",
          cursor: nsDisabled ? "not-allowed" : "pointer",
          opacity: nsDisabled ? 0.6 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={!nsDisabled && vis.showNs}
          disabled={nsDisabled}
          onChange={(e) => updVis({ showNs: e.target.checked })}
          data-testid="qpcr-show-ns"
        />
        {tr("qpcr.stats.showNs")}
      </label>
    </div>
  );
}

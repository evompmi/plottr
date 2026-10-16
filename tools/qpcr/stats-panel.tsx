// Statistics panel for the qPCR tool — one block per target gene. Tests run
// on ΔCt through the shared Group Plot engine (selectTest → Welch t / Welch
// ANOVA + Games-Howell by default, override, decision trace); fold changes
// are only reported as back-transformed estimates with CIs.

import { SegToggle, buildSelectTestReason, STATS_TESTS_FOR_K, STATS_TESTS_FOR_K2 } from "../_shell";
import { formatP, pStars } from "../_core/stats";
import { formatResultLine } from "./helpers";
import type { AnnotationMode, HandoffSplit, QpcrStatsPanelProps } from "./helpers";
import { useT, type QpcrKey } from "./i18n";

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
const explainer: React.CSSProperties = {
  padding: "7px 10px",
  margin: "6px 0 8px",
  background: "var(--info-bg)",
  border: "1px solid var(--info-border)",
  borderRadius: 6,
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--info-text)",
};
const resultBox: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--surface-sunken)",
  borderRadius: 6,
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 11,
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
  updVis,
  onDownloadReport,
  onDownloadR,
  onSendToGroupPlot,
  handoffLabel,
}: QpcrStatsPanelProps) {
  const tr = useT();
  const relToControl = normalize === "control";
  const [split, setSplit] = React.useState<HandoffSplit>("facet");
  const testLabel = (t: string | null): string => (t && TEST_KEYS[t] ? tr(TEST_KEYS[t]) : t || "—");
  // Letters need k > 2 groups and every group drawn: with the calibrator
  // hidden its comparisons move to "vs control" stars (geneAnnotation).
  const anyMulti =
    genes.some((g) => g.groups.length > 2) && (normalize !== "control" || vis.showCalibrator);
  const display: AnnotationMode =
    vis.annotation === "cld" && !anyMulti ? "brackets" : vis.annotation;
  const nsDisabled = display !== "brackets";

  return (
    <div className="dv-panel" style={{ padding: 0, overflow: "hidden" }} data-testid="qpcr-stats">
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
            {tr("qpcr.stats.title")}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            {tr("qpcr.stats.desc")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={onDownloadReport}
            title={tr("qpcr.dl.reportTitle")}
            data-testid="qpcr-dl-txt"
          >
            ⬇ TXT
          </button>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={onDownloadR}
            title={tr("qpcr.dl.rTitle")}
            data-testid="qpcr-dl-r"
          >
            ⬇ R
          </button>
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
          {tr("qpcr.stats.displayOnPlot")}
        </span>
        <SegToggle<AnnotationMode>
          value={display}
          onChange={(v) => updVis({ annotation: v })}
          ariaLabel={tr("qpcr.stats.displayOnPlot")}
          style={{ width: anyMulti ? 220 : 150 }}
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
            fontSize: 12,
            color: nsDisabled ? "var(--text-faint)" : "var(--text)",
            cursor: nsDisabled ? "not-allowed" : "pointer",
            opacity: nsDisabled ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={!nsDisabled && vis.showNs}
            disabled={nsDisabled}
            onChange={(e) => updVis({ showNs: e.target.checked })}
            style={{ accentColor: "var(--cta-primary-bg)" }}
            data-testid="qpcr-show-ns"
          />
          {tr("qpcr.stats.showNs")}
        </label>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
          {tr("qpcr.stats.sendLabel")}
        </span>
        <SegToggle<HandoffSplit>
          value={split}
          onChange={setSplit}
          ariaLabel={tr("qpcr.stats.sendLabel")}
          style={{ width: 200 }}
          options={[
            {
              value: "facet",
              label: tr("qpcr.stats.asFacets"),
              title: tr("qpcr.stats.asFacetsTitle"),
            },
            {
              value: "subgroup",
              label: tr("qpcr.stats.asSubgroups"),
              title: tr("qpcr.stats.asSubgroupsTitle"),
            },
          ]}
        />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          style={{ padding: "3px 10px", fontSize: 11 }}
          onClick={() => onSendToGroupPlot(split)}
          title={tr("qpcr.stats.sendTitle")}
          data-testid="qpcr-send"
        >
          {tr("qpcr.stats.send", { what: handoffLabel })}
        </button>
        {vis.yScale === "linear" && (
          <span
            style={{ flexBasis: "100%", fontSize: 10, color: "var(--text-faint)" }}
            data-testid="qpcr-send-linear-note"
          >
            {tr("qpcr.stats.sendLinearNote")}
          </span>
        )}
      </div>

      <div style={{ padding: "4px 16px 14px" }}>
        <div style={explainer} data-testid="qpcr-why-dct">
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{tr("qpcr.stats.whyDctTitle")}</div>
          <div>{tr("qpcr.stats.whyDct")}</div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>{tr("qpcr.stats.dontTestFc")}</div>
        </div>

        {genes.map((g, gi) => {
          const st = stats[gi];
          const k = st.tested.length;
          const reason = st.rec ? buildSelectTestReason(st.rec) : null;
          const recTest = st.rec?.recommendation?.test ?? null;
          const options = k === 2 ? STATS_TESTS_FOR_K2 : STATS_TESTS_FOR_K;
          const override = overrides[g.gene] ?? null;
          return (
            <div key={g.gene} data-testid={`qpcr-gene-${g.gene}`}>
              <div
                style={{
                  ...subhead,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textTransform: "none",
                  fontSize: 12,
                  letterSpacing: 0,
                }}
              >
                <span style={{ fontStyle: "italic" }}>{g.gene}</span>
              </div>
              {g.controlMissing && (
                <p style={{ fontSize: 11, color: "var(--warning-text)", margin: "4px 0" }}>
                  {tr("qpcr.stats.noControl", { control })}
                </p>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thS}>{tr("qpcr.stats.group")}</th>
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
                        <td style={{ ...tdS, fontWeight: s.group === control ? 700 : 400 }}>
                          {s.group}
                        </td>
                        <td style={tdS}>{s.n}</td>
                        <td style={tdS}>
                          {s.meanDCt.toFixed(2)}
                          {Number.isFinite(s.sdDCt) ? ` ± ${s.sdDCt.toFixed(2)}` : ""}
                        </td>
                        <td style={tdS}>
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
              <p style={{ fontSize: 10, color: "var(--text-faint)", margin: "4px 0 6px" }}>
                {tr(relToControl ? "qpcr.stats.tableNote" : "qpcr.stats.tableNoteRel")}
              </p>

              {k < 2 ? (
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {tr("qpcr.stats.needTwo")}
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      margin: "4px 0 6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {tr("qpcr.stats.test")}
                    </span>
                    <select
                      className="dv-select"
                      value={override ?? ""}
                      onChange={(e) => onOverride(g.gene, e.target.value || null)}
                      aria-label={tr("qpcr.stats.test")}
                      data-testid={`qpcr-test-${g.gene}`}
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
                  </div>
                  {reason && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        marginBottom: 6,
                      }}
                    >
                      {reason}
                    </div>
                  )}
                  <div style={resultBox} data-testid={`qpcr-result-${g.gene}`}>
                    {testLabel(st.chosenTest)} {tr("qpcr.stats.onDct")}:{" "}
                    {formatResultLine(st.chosenTest, st.testResult)}
                  </div>
                  {st.postHocResult && !st.postHocResult.error && st.postHocName && (
                    <>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          margin: "8px 0 4px",
                          fontWeight: 600,
                        }}
                      >
                        {tr("qpcr.stats.posthoc", {
                          name: POSTHOC_KEYS[st.postHocName]
                            ? tr(POSTHOC_KEYS[st.postHocName])
                            : st.postHocName,
                        })}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={thS}>{tr("qpcr.stats.pair")}</th>
                            <th style={thS}>{tr("qpcr.stats.fc")}</th>
                            <th style={thS}>{tr("qpcr.stats.pAdj")}</th>
                            <th style={thS}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {st.postHocResult.pairs.map((pr) => {
                            const a = g.groups[st.tested[pr.i]];
                            const b = g.groups[st.tested[pr.j]];
                            const ga = g.summaries.find((s) => s.group === a);
                            const gb = g.summaries.find((s) => s.group === b);
                            const p = pr.pAdj != null ? pr.pAdj : pr.p;
                            return (
                              <tr key={`${pr.i}-${pr.j}`}>
                                <td style={tdS}>{`${b} vs ${a}`}</td>
                                <td style={tdS}>{ga && gb ? fc(gb.meanL - ga.meanL) : "—"}</td>
                                <td style={tdS}>{formatP(p)}</td>
                                <td style={{ ...tdS, fontWeight: 700 }}>{pStars(p)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

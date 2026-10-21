// Statistics for the Proportions tool, shown in the workspace's inspector
// column: summary table with Wilson
// CIs, omnibus test (auto-selected, overridable) with effect sizes,
// standardised residuals, pairwise Fisher tests, and goodness-of-fit
// against an expected ratio.

import {
  InspectorExports,
  InspectorSection,
  MethodsButton,
  SegToggle,
  alphaSentence,
  inspectorFirstCol,
  inspectorTable,
  inspectorTd,
  inspectorTh,
  nRange,
  softwareSentence,
} from "../_shell";
import { formatP, pStars } from "../_core/stats";
import type { PAdjustMethod } from "../_core/stats";
import { RATIO_PRESETS, formatPct, gofPerGroup, parseRatio } from "./helpers";
import type {
  AnnotationMode,
  GofPanelProps,
  ProportionsStatsDisplayBarProps,
  StatsPanelProps,
  TestChoice,
} from "./helpers";
import { useT } from "./i18n";

const { useMemo } = React;

// Inspector-column tables: numbers right-aligned in mono; cells wrap because
// the column is narrow and count cells read "12 · 40 % [25 %, 57 %]".
const thS: React.CSSProperties = { ...inspectorTh, whiteSpace: "normal", verticalAlign: "bottom" };
const tdS: React.CSSProperties = { ...inspectorTd, whiteSpace: "normal" };
const firstCol = inspectorFirstCol;
const note: React.CSSProperties = { fontSize: 11, color: "var(--text-faint)", margin: 0 };
const resultBox: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text)",
};
// Light info box, same tokens as boxplot's "suggested alternative" notice.
const explainer: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--info-bg)",
  border: "1px solid var(--info-border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--info-text)",
};

export function formatOR(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  if (v === Infinity) return "∞";
  return v.toPrecision(3);
}

export function StatsPanel({
  analysis,
  control,
  setControl,
  categories,
  summaries,
  focusLabel,
  vis,
  updVis,
  onDownloadReport,
  onDownloadR,
  extra,
}: StatsPanelProps) {
  const tr = useT();
  const { table, selection, test, fisher, chi2 } = analysis;
  const N = summaries.reduce((a, s) => a + s.n, 0);
  // Explainers — the numbers come from this table's expected counts.
  const counts = {
    below: selection.nExpectedBelow5,
    cells: selection.nCells,
    min: selection.minExpected.toFixed(2),
  };
  const cochranHolds =
    selection.minExpected >= 1 && selection.nExpectedBelow5 <= 0.2 * selection.nCells;
  const why =
    selection.reason === "twoByTwo"
      ? tr("proportions.stats.whyTwoByTwo")
      : selection.reason === "cochranOk"
        ? tr("proportions.stats.whyCochranOk", counts)
        : tr("proportions.stats.whyCochranFail", counts);
  const overridden = vis.testChoice !== "auto" && vis.testChoice !== selection.test;
  const overrideNote = !overridden
    ? null
    : vis.testChoice === "fisher"
      ? { text: tr("proportions.stats.overrideFisher"), warn: false }
      : cochranHolds
        ? { text: tr("proportions.stats.overrideChi2Ok", counts), warn: false }
        : { text: tr("proportions.stats.overrideChi2Small", counts), warn: true };
  const m = analysis.pairs.length;
  // Chance of ≥ 1 false positive across m independent tests at α = 0.05.
  const fwer = (100 * (1 - Math.pow(0.95, m))).toFixed(0);

  const multi = table.groups.length > 2;
  const hasControl = analysis.control !== null;
  // Many-to-one rows read "<group> vs <control>"; all-pairs rows in table order.
  const pairLabel = (i: number, j: number): string =>
    analysis.control === i
      ? `${table.groups[j]} vs ${table.groups[i]}`
      : `${table.groups[i]} vs ${table.groups[j]}`;

  const methodsText = (): string => {
    if (analysis.error) return "";
    const out: string[] = [];
    const B = fisher && fisher.method === "monteCarlo" ? (fisher.B ?? 0) : 0;
    out.push(
      tr("proportions.methods.design", {
        c: table.categories.length,
        k: table.groups.length,
        N,
        n: nRange(summaries.map((s) => s.n)),
      })
    );
    out.push(
      test === "chi2"
        ? tr("proportions.methods.chi2")
        : B
          ? tr("proportions.methods.fisherMC", { B })
          : tr("proportions.methods.fisher")
    );
    if (!overridden && vis.testChoice === "auto") out.push(tr("proportions.methods.policy"));
    if (multi && m > 0) {
      const method = tr(
        vis.adjustMethod === "holm" ? "proportions.methods.holm" : "proportions.methods.bh"
      );
      out.push(
        hasControl && control !== null
          ? tr("proportions.methods.vsControl", { control, m, method })
          : tr("proportions.methods.pairwise", { method })
      );
    }
    out.push(alphaSentence());
    if (vis.chartType === "proportion" && vis.showCI) out.push(tr("proportions.methods.wilson"));
    const calls = [
      test === "chi2"
        ? "chisq.test(counts, correct = FALSE)"
        : B
          ? `fisher.test(counts, simulate.p.value = TRUE, B = ${B})`
          : "fisher.test(counts)",
    ];
    if (multi && m > 0)
      calls.push(`p.adjust(p, method = "${vis.adjustMethod === "holm" ? "holm" : "BH"}")`);
    if (vis.chartType === "proportion" && vis.showCI)
      calls.push("prop.test(x, n, correct = FALSE)$conf.int");
    out.push(softwareSentence(calls));
    return out.join(" ");
  };
  // Letters need every pair: not with two groups, nor against a control.

  return (
    <div className="dv-inspector" data-testid="proportions-stats">
      <InspectorSection label={tr("proportions.stats.title")}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
          {tr("proportions.stats.desc")}
        </p>
        {focusLabel && <p style={note}>{tr("proportions.stats.focusNote", { cat: focusLabel })}</p>}
      </InspectorSection>
      <div className="dv-inspector-body">
        <h3 className="dv-tile-title dv-inspector-split">{tr("proportions.stats.summary")}</h3>
        <table style={inspectorTable}>
          <thead>
            <tr>
              <th style={{ ...thS, ...firstCol }}>{tr("proportions.stats.group")}</th>
              <th style={thS}>n</th>
              {categories.map((c) => (
                <th key={c} style={thS}>
                  {tr("proportions.stats.catCol", { cat: c })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.group}>
                <td style={{ ...tdS, ...firstCol }}>{s.group}</td>
                <td style={tdS}>{s.n}</td>
                {s.counts.map((x, c) => (
                  <td key={c} style={tdS}>
                    {`${x} · ${formatPct(s.props[c].p)} [${formatPct(s.props[c].lower)}, ${formatPct(
                      s.props[c].upper
                    )}]`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={note}>{tr("proportions.stats.wilsonNote")}</p>

        <h3 className="dv-tile-title dv-inspector-split">{tr("proportions.stats.test")}</h3>
        {analysis.error ? (
          <p style={note}>{tr("proportions.stats.tooSmall")}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <SegToggle<TestChoice>
                value={vis.testChoice}
                onChange={(v) => updVis({ testChoice: v })}
                ariaLabel={tr("proportions.stats.testChoice")}
                style={{ flex: 1 }}
                options={[
                  { value: "auto", label: tr("proportions.stats.auto") },
                  { value: "fisher", label: "Fisher" },
                  { value: "chi2", label: "χ²" },
                ]}
              />
            </div>
            <div style={explainer} data-testid="proportions-test-reason">
              <div style={{ fontWeight: 700, marginBottom: 2 }}>
                {tr("proportions.stats.whyTitle")}
              </div>
              <div>{why}</div>
              {overrideNote && (
                <div
                  style={{
                    marginTop: 4,
                    color: overrideNote.warn ? "var(--warning-text)" : "inherit",
                    fontWeight: overrideNote.warn ? 600 : 400,
                  }}
                  data-testid="proportions-override-note"
                >
                  {overrideNote.text}
                </div>
              )}
            </div>
            <div style={resultBox} data-testid="proportions-omnibus">
              {test === "fisher" && fisher ? (
                <>
                  <div>
                    {tr("proportions.stats.fisherLine", {
                      dims: `${table.groups.length}×${table.categories.length}`,
                      p: formatP(fisher.p),
                    })}
                  </div>
                  {fisher.oddsRatio !== undefined && fisher.orCI && (
                    <div>
                      {tr("proportions.stats.orLine", {
                        or: formatOR(fisher.oddsRatio),
                        lo: formatOR(fisher.orCI[0]),
                        hi: formatOR(fisher.orCI[1]),
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  {chi2.error
                    ? `⚠ ${chi2.error}`
                    : tr("proportions.stats.chi2Line", {
                        df: chi2.df,
                        x2: chi2.X2.toFixed(3),
                        p: formatP(chi2.p),
                      })}
                </div>
              )}
              {!chi2.error && (
                <div>
                  {tr("proportions.stats.cramerLine", { v: chi2.cramersV.toFixed(3), n: N })}
                </div>
              )}
            </div>
            {fisher && fisher.method === "monteCarlo" && (
              <p style={{ ...note, color: "var(--warning-text)" }}>
                {tr("proportions.stats.mcNote", {
                  B: (fisher.B ?? 0).toLocaleString("en-US"),
                  se: (fisher.mcSE ?? 0).toFixed(4),
                })}
              </p>
            )}

            {!chi2.error && (table.groups.length > 2 || table.categories.length > 2) && (
              <>
                <h3 className="dv-tile-title dv-inspector-split">
                  {tr("proportions.stats.residuals")}
                </h3>
                <table style={inspectorTable}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, ...firstCol }}>{tr("proportions.stats.group")}</th>
                      {table.categories.map((c) => (
                        <th key={c} style={thS}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.groups.map((g, i) => (
                      <tr key={g}>
                        <td style={{ ...tdS, ...firstCol }}>{g}</td>
                        {chi2.stdres[i].map((r, c) => (
                          <td
                            key={c}
                            style={{ ...tdS, fontWeight: Math.abs(r) >= 1.96 ? 700 : 400 }}
                          >
                            {(r >= 0 ? "+" : "") + r.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={note}>{tr("proportions.stats.residualsNote")}</p>
              </>
            )}

            {analysis.pairs.length > 0 && (
              <>
                <h3 className="dv-tile-title dv-inspector-split">
                  {tr("proportions.stats.pairwise")}
                </h3>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                    title={tr("proportions.stats.compareTitle")}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      {tr("proportions.stats.compare")}
                    </span>
                    <select
                      className="dv-select"
                      data-testid="proportions-control"
                      value={control ?? ""}
                      onChange={(e) => setControl(e.target.value === "" ? null : e.target.value)}
                      style={{ fontSize: 12 }}
                    >
                      <option value="">{tr("proportions.stats.allPairs")}</option>
                      {table.groups.map((g) => (
                        <option key={g} value={g}>
                          {tr("proportions.stats.vsControl", { group: g })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SegToggle<PAdjustMethod>
                    value={vis.adjustMethod}
                    onChange={(v) => updVis({ adjustMethod: v })}
                    ariaLabel={tr("proportions.stats.adjust")}
                    style={{ width: 160 }}
                    options={[
                      { value: "holm", label: "Holm", title: tr("proportions.stats.holmTitle") },
                      { value: "bh", label: "BH", title: tr("proportions.stats.bhTitle") },
                    ]}
                  />
                </div>
                <table
                  style={{ width: "100%", borderCollapse: "collapse" }}
                  data-testid="proportions-pairs"
                >
                  <thead>
                    <tr>
                      <th style={{ ...thS, ...firstCol }}>{tr("proportions.stats.pair")}</th>
                      {table.categories.length === 2 && <th style={thS}>OR</th>}
                      <th style={thS}>p</th>
                      <th style={thS}>
                        {tr("proportions.stats.pAdj", {
                          method: vis.adjustMethod === "holm" ? "Holm" : "BH",
                        })}
                      </th>
                      <th style={thS}>
                        <span className="dv-sr-only">{tr("proportions.stats.signif")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.pairs.map((pr) => (
                      <tr key={`${pr.i}-${pr.j}`}>
                        <td style={{ ...tdS, ...firstCol }}>{pairLabel(pr.i, pr.j)}</td>
                        {table.categories.length === 2 && (
                          <td style={tdS}>{formatOR(pr.oddsRatio)}</td>
                        )}
                        <td style={tdS}>{formatP(pr.p)}</td>
                        <td style={tdS}>{formatP(pr.pAdj)}</td>
                        <td style={{ ...tdS, fontWeight: 700 }}>{pStars(pr.pAdj)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={explainer} data-testid="proportions-adjust-explainer">
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    {tr("proportions.stats.whyAdjustTitle")}
                  </div>
                  <div>{tr("proportions.stats.whyAdjust", { m, fwer })}</div>
                  {(vis.adjustMethod === "holm" ? ["holm", "bh"] : ["bh", "holm"]).map((k) => (
                    <div
                      key={k}
                      style={{ marginTop: 3, opacity: k === vis.adjustMethod ? 1 : 0.8 }}
                    >
                      <strong>{k === "holm" ? "Holm" : "Benjamini–Hochberg"}</strong>
                      {k === vis.adjustMethod ? ` (${tr("proportions.stats.selected")})` : ""}
                      {" — "}
                      {k === "holm"
                        ? tr("proportions.stats.holmExplain", { m })
                        : tr("proportions.stats.bhExplain")}
                    </div>
                  ))}
                </div>
                <p style={note}>
                  {hasControl && control !== null
                    ? tr("proportions.stats.controlNote", { control, m })
                    : tr("proportions.stats.pairwiseNote")}
                </p>
              </>
            )}
          </>
        )}
      </div>
      {extra}
      <InspectorExports label={tr("proportions.stats.analysisExports")}>
        <button
          type="button"
          className="dv-btn dv-btn-ink"
          onClick={onDownloadR}
          title={tr("proportions.dl.rTitle")}
          data-testid="proportions-dl-r"
        >
          {tr("proportions.stats.rScript")}
        </button>
        <MethodsButton getText={methodsText} />
        <button
          type="button"
          className="dv-btn dv-btn-secondary"
          onClick={onDownloadReport}
          title={tr("proportions.dl.reportTitle")}
          data-testid="proportions-dl-txt"
        >
          {tr("proportions.stats.reportTxt")}
        </button>
      </InspectorExports>
    </div>
  );
}

// Marks on the plot (Off / Letters / Brackets, Show ns), shown in the
// workspace toolbar. Letters need > 2 groups and every pair tested (no
// control group).
export function ProportionsStatsDisplayBar({
  analysis,
  vis,
  updVis,
}: ProportionsStatsDisplayBarProps) {
  const tr = useT();
  const lettersOk = analysis.table.groups.length > 2 && analysis.control === null;
  const display: AnnotationMode =
    vis.annotation === "cld" && !lettersOk ? "brackets" : vis.annotation;
  const nsDisabled = display !== "brackets";
  return (
    <div
      data-testid="proportions-display"
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
    >
      <span className="dv-toolbar-label">{tr("proportions.stats.displayOnPlot")}</span>
      <SegToggle<AnnotationMode>
        value={display}
        onChange={(v) => updVis({ annotation: v })}
        ariaLabel={tr("proportions.stats.displayOnPlot")}
        style={{ flex: "0 0 auto" }}
        options={[
          { value: "none", label: tr("proportions.stats.off") },
          ...(lettersOk
            ? [
                {
                  value: "cld" as const,
                  label: tr("proportions.stats.letters"),
                  title: tr("proportions.stats.lettersTitle"),
                },
              ]
            : []),
          { value: "brackets", label: tr("proportions.stats.brackets") },
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
          checked={!nsDisabled && vis.showNsBrackets}
          disabled={nsDisabled}
          onChange={(e) => updVis({ showNsBrackets: e.target.checked })}
          data-testid="proportions-show-ns"
        />
        {tr("proportions.stats.showNs")}
      </label>
    </div>
  );
}

export function GofPanel({ table, ratioText, setRatioText }: GofPanelProps) {
  const tr = useT();
  const k = table.categories.length;
  const ratio = parseRatio(ratioText, k);
  const rows = useMemo(() => (ratio ? gofPerGroup(table, ratio) : []), [table, ratio?.join(":")]); // eslint-disable-line react-hooks/exhaustive-deps
  const presets = RATIO_PRESETS.filter((p) => p.k === k);
  return (
    <InspectorSection label={tr("proportions.gof.title")}>
      <div data-testid="proportions-gof" style={{ display: "contents" }}>
        <p style={note}>{tr("proportions.gof.intro", { cats: table.categories.join(" : ") })}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            className="dv-input"
            style={{ width: 140 }}
            value={ratioText}
            placeholder={Array.from({ length: k }, () => "1").join(":")}
            onChange={(e) => setRatioText(e.target.value)}
            aria-label={tr("proportions.gof.ratio")}
            data-testid="proportions-gof-ratio"
          />
          {presets.map((p) => (
            <button
              key={p.ratio}
              type="button"
              className="dv-btn dv-btn-secondary"
              style={{ padding: "3px 8px", fontSize: 11 }}
              onClick={() => setRatioText(p.ratio)}
            >
              {p.ratio}
            </button>
          ))}
        </div>
        {ratioText.trim() !== "" && !ratio && (
          <p style={{ ...note, color: "var(--warning-text)" }}>
            {tr("proportions.gof.invalid", { k })}
          </p>
        )}
        {ratio && rows.length > 0 && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={inspectorTable}>
                <thead>
                  <tr>
                    <th style={{ ...thS, ...firstCol }}>{tr("proportions.stats.group")}</th>
                    <th style={thS}>n</th>
                    <th style={thS}>{tr("proportions.gof.observed")}</th>
                    <th style={thS}>{tr("proportions.gof.expected")}</th>
                    <th style={thS}>{tr("proportions.gof.method")}</th>
                    <th style={thS}>p</th>
                    <th style={thS}>{tr("proportions.gof.pHolm")}</th>
                    <th style={thS}>
                      <span className="dv-sr-only">{tr("proportions.stats.signif")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, g) => (
                    <tr key={r.group}>
                      <td style={{ ...tdS, ...firstCol }}>{r.group}</td>
                      <td style={tdS}>{r.n}</td>
                      <td style={tdS}>{table.counts[g].join(" : ")}</td>
                      <td style={tdS}>{r.result.expected.map((e) => e.toFixed(1)).join(" : ")}</td>
                      <td style={tdS}>
                        {r.result.method === "exact"
                          ? tr("proportions.gof.exact")
                          : `χ²(${r.result.df}) = ${r.result.X2.toFixed(2)}`}
                      </td>
                      <td style={tdS}>{formatP(r.result.p)}</td>
                      <td style={tdS}>{formatP(r.pAdj)}</td>
                      <td style={{ ...tdS, fontWeight: 700 }}>{pStars(r.pAdj)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={note}>{tr("proportions.gof.note")}</p>
            {rows.some((r) => r.result.fallback) && (
              <p style={{ ...note, color: "var(--warning-text)" }}>
                {tr("proportions.gof.fallback")}
              </p>
            )}
          </>
        )}
      </div>
    </InspectorSection>
  );
}

// Statistics panels for the Proportions tool: summary table with Wilson
// CIs, omnibus test (auto-selected, overridable) with effect sizes,
// standardised residuals, pairwise Fisher tests, and goodness-of-fit
// against an expected ratio.

import { MethodsButton, SegToggle, alphaSentence, nRange, softwareSentence } from "../_shell";
import { formatP, pStars } from "../_core/stats";
import type { PAdjustMethod } from "../_core/stats";
import { RATIO_PRESETS, formatPct, gofPerGroup, parseRatio } from "./helpers";
import type { AnnotationMode, GofPanelProps, StatsPanelProps, TestChoice } from "./helpers";
import { useT } from "./i18n";

const { useMemo } = React;

const subhead: React.CSSProperties = {
  margin: "12px 0 6px",
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
const note: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", margin: "4px 0" };
const resultBox: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--surface-sunken)",
  borderRadius: 6,
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 11,
  color: "var(--text)",
};
// Light info box, same tokens as boxplot's "suggested alternative" notice.
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
const panel: React.CSSProperties = {
  padding: "10px 16px 14px",
  background: "var(--surface-subtle)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

export function formatOR(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  if (v === Infinity) return "∞";
  return v.toPrecision(3);
}

export function StatsPanel({
  analysis,
  categories,
  summaries,
  focusLabel,
  vis,
  updVis,
  onDownloadReport,
  onDownloadR,
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
    if (multi && m > 0)
      out.push(
        tr("proportions.methods.pairwise", {
          method: tr(
            vis.adjustMethod === "holm" ? "proportions.methods.holm" : "proportions.methods.bh"
          ),
        })
      );
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
  const display: AnnotationMode = vis.annotation === "cld" && !multi ? "brackets" : vis.annotation;
  const nsDisabled = display !== "brackets";

  return (
    <div
      className="dv-panel"
      style={{ padding: 0, overflow: "hidden" }}
      data-testid="proportions-stats"
    >
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
            {tr("proportions.stats.title")}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            {tr("proportions.stats.desc")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
          <MethodsButton getText={methodsText} />
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={onDownloadReport}
            title={tr("proportions.dl.reportTitle")}
            data-testid="proportions-dl-txt"
          >
            ⬇ TXT
          </button>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={onDownloadR}
            title={tr("proportions.dl.rTitle")}
            data-testid="proportions-dl-r"
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
          {tr("proportions.stats.displayOnPlot")}
        </span>
        <SegToggle<AnnotationMode>
          value={display}
          onChange={(v) => updVis({ annotation: v })}
          ariaLabel={tr("proportions.stats.displayOnPlot")}
          style={{ width: multi ? 220 : 150 }}
          options={[
            { value: "none", label: tr("proportions.stats.off") },
            ...(multi
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
            fontSize: 12,
            color: nsDisabled ? "var(--text-faint)" : "var(--text)",
            cursor: nsDisabled ? "not-allowed" : "pointer",
            opacity: nsDisabled ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={!nsDisabled && vis.showNsBrackets}
            disabled={nsDisabled}
            onChange={(e) => updVis({ showNsBrackets: e.target.checked })}
            style={{ accentColor: "var(--cta-primary-bg)" }}
            data-testid="proportions-show-ns"
          />
          {tr("proportions.stats.showNs")}
        </label>
      </div>
      <div style={{ padding: "4px 16px 14px" }}>
        {focusLabel && <p style={note}>{tr("proportions.stats.focusNote", { cat: focusLabel })}</p>}
        <div style={subhead}>{tr("proportions.stats.summary")}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS}>{tr("proportions.stats.group")}</th>
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
                <td style={tdS}>{s.group}</td>
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

        <div style={subhead}>{tr("proportions.stats.test")}</div>
        {analysis.error ? (
          <p style={note}>{tr("proportions.stats.tooSmall")}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <SegToggle<TestChoice>
                value={vis.testChoice}
                onChange={(v) => updVis({ testChoice: v })}
                ariaLabel={tr("proportions.stats.testChoice")}
                style={{ width: 240 }}
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
                <div style={subhead}>{tr("proportions.stats.residuals")}</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thS}>{tr("proportions.stats.group")}</th>
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
                        <td style={tdS}>{g}</td>
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
                <div style={subhead}>{tr("proportions.stats.pairwise")}</div>
                <div style={{ marginBottom: 6 }}>
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
                      <th style={thS}>{tr("proportions.stats.pair")}</th>
                      {table.categories.length === 2 && <th style={thS}>OR</th>}
                      <th style={thS}>p</th>
                      <th style={thS}>
                        {tr("proportions.stats.pAdj", {
                          method: vis.adjustMethod === "holm" ? "Holm" : "BH",
                        })}
                      </th>
                      <th style={thS}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.pairs.map((pr) => (
                      <tr key={`${pr.i}-${pr.j}`}>
                        <td style={tdS}>{`${table.groups[pr.i]} vs ${table.groups[pr.j]}`}</td>
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
                <p style={note}>{tr("proportions.stats.pairwiseNote")}</p>
              </>
            )}
          </>
        )}
      </div>
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
    <div style={panel} data-testid="proportions-gof">
      <div style={{ ...subhead, marginTop: 0 }}>{tr("proportions.gof.title")}</div>
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
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={thS}>{tr("proportions.stats.group")}</th>
                <th style={thS}>n</th>
                <th style={thS}>{tr("proportions.gof.observed")}</th>
                <th style={thS}>{tr("proportions.gof.expected")}</th>
                <th style={thS}>{tr("proportions.gof.method")}</th>
                <th style={thS}>p</th>
                <th style={thS}>{tr("proportions.gof.pHolm")}</th>
                <th style={thS}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, g) => (
                <tr key={r.group}>
                  <td style={tdS}>{r.group}</td>
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
          <p style={note}>{tr("proportions.gof.note")}</p>
          {rows.some((r) => r.result.fallback) && (
            <p style={{ ...note, color: "var(--warning-text)" }}>
              {tr("proportions.gof.fallback")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

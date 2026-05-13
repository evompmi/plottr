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
  correlationCoef,
  formatCorrResultLine,
  formatCorrStatShort,
  runCorrelation,
} from "./helpers";
import { buildScatterAggregateReport, buildScatterAggregateRScript } from "./reports";

const { useState, useMemo } = React;

interface ScatterStatsDetailProps {
  row: EnrichedScatterStatsRow;
  onOverrideTest: (test: CorrTest | null) => void;
  isOverridden: boolean;
  xLabel: string;
  yLabel: string;
}

function ScatterStatsDetail({
  row,
  onOverrideTest,
  isOverridden,
  xLabel,
  yLabel,
}: ScatterStatsDetailProps) {
  const res = row.testResult;
  const rec = row.rec;
  const recReason = rec?.recommendation?.reason;
  const recTest = rec?.recommendation?.test ?? null;
  const suggestion = rec?.suggestion ?? null;

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
  const normality = rec?.normality ?? [];
  const axisName = (axis: "x" | "y") => (axis === "x" ? xLabel : yLabel) || axis.toUpperCase();

  return (
    <div style={{ padding: "6px 16px 12px 16px", background: "var(--surface-subtle)" }}>
      <div style={subhead}>Variables</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>Axis</th>
            <th style={thS}>n</th>
            <th style={thS}>Mean</th>
            <th style={thS}>SD</th>
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
                <td style={tdS}>{axisName(axis)}</td>
                <td style={tdS}>{n}</td>
                <td style={tdS}>{Number.isFinite(m) ? m.toFixed(3) : "—"}</td>
                <td style={tdS}>{n > 1 ? sd.toFixed(3) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {normality.length > 0 && (
        <>
          <div style={subhead}>Assumptions</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {normality.map((r, i) => {
              const pill = r.normal === true ? pillOk : r.normal === false ? pillBad : pillNeutral;
              const verdict =
                r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
              const wpStr =
                r.W != null && r.p != null ? ` (W=${r.W.toFixed(3)}, p=${formatP(r.p)})` : "";
              return (
                <span key={i} style={{ fontSize: 11, color: "var(--text)" }}>
                  {axisName(r.axis)}: <span style={pill}>{verdict}</span>
                  <span style={{ color: "var(--text-faint)" }}>{wpStr}</span>
                </span>
              );
            })}
          </div>
        </>
      )}

      <div style={subhead}>Test</div>
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
          value={row.chosenTest}
          onChange={(e) => {
            const next = e.target.value as CorrTest;
            onOverrideTest(next === recTest ? null : next);
          }}
          className="dv-select"
          style={{ fontSize: 11, padding: "2px 6px", minWidth: 180 }}
          onClick={(e) => e.stopPropagation()}
        >
          {CORR_TEST_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {CORR_TEST_LABELS[t]}
              {t === recTest ? "  (recommended)" : ""}
            </option>
          ))}
        </select>
        {isOverridden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest(null);
            }}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 10 }}
          >
            Use recommendation
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
          <span style={{ fontWeight: 700 }}>Suggested alternative:</span>
          <span>
            Shapiro-Wilk flagged non-normal data — consider{" "}
            <strong>{CORR_TEST_LABELS[suggestion.test]}</strong>.
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest(suggestion.test);
            }}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 10, marginLeft: "auto" }}
          >
            Use suggestion
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
        {formatCorrResultLine(res)}
      </div>
      {res && !res.error && res.kind === "kendall" && (
        <div
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Kendall τ does not ship an analytic CI — bootstrap if a CI is required.
        </div>
      )}
    </div>
  );
}

export interface ScatterStatsPanelProps {
  sets: ScatterStatsSet[];
  fileStem: string;
  xLabel: string;
  yLabel: string;
}

export function ScatterStatsPanel({ sets, fileStem, xLabel, yLabel }: ScatterStatsPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    sets.length === 1 ? { [sets[0].key]: true } : {}
  );
  const [hovered, setHovered] = useState<string | null>(null);
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
      eligible.forEach((row, i) => {
        const content = buildScatterAggregateReport([row], xLabel, yLabel);
        const name = `${stem}_${rowSlug(row, i)}_correlation.txt`;
        setTimeout(() => downloadText(content, name), i * 120);
      });
    }
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: React.MouseEvent<HTMLElement>) => {
    if (eligible.length === 0) return;
    if (eligible.length === 1) {
      downloadText(buildScatterAggregateRScript(eligible, xLabel, yLabel), `${stem}_correlation.R`);
    } else {
      eligible.forEach((row, i) => {
        const content = buildScatterAggregateRScript([row], xLabel, yLabel);
        const name = `${stem}_${rowSlug(row, i)}_correlation.R`;
        setTimeout(() => downloadText(content, name), i * 120);
      });
    }
    flashSaved(e.currentTarget);
  };

  const singleSet = sets.length === 1;
  const headingLabel = singleSet ? "Correlation" : "Correlation by group";

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
            {headingLabel}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Click a row to inspect assumptions, switch tests, and read the full coefficient + CI.
            {singleSet ? "" : " Tests run independently per group."}
          </p>
        </div>
        {eligible.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={downloadReport}
              title={
                singleSet
                  ? "Download a plain-text correlation report"
                  : "Download a plain-text correlation report covering every group"
              }
            >
              ⬇ TXT
            </button>
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={downloadR}
              title={
                singleSet
                  ? "Download a runnable R script reproducing cor.test on this set"
                  : "Download a runnable R script reproducing cor.test for every group"
              }
            >
              ⬇ R
            </button>
          </div>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>Group</th>
            <th style={thS}>n</th>
            <th style={thS}>Test</th>
            <th style={thS}>Statistic</th>
            <th style={thS}>p</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => {
            const key = r.key;
            const isOpen = !!expanded[key];
            if (r.skip) {
              return (
                <tr key={key}>
                  <td style={tdS}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {r.color && (
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: r.color,
                            display: "inline-block",
                          }}
                        />
                      )}
                      {r.name || "—"}
                    </span>
                  </td>
                  <td style={tdS} colSpan={5}>
                    <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                      Needs ≥ 3 complete pairs (have {r.n}).
                    </span>
                  </td>
                </tr>
              );
            }
            const res = r.testResult;
            const p = res && !res.error ? res.p : null;
            const sig = p != null && p < 0.05;
            const stars = p != null ? pStars(p) : "";
            const coef = res && !res.error ? correlationCoef(res) : null;
            return (
              <React.Fragment key={key}>
                <tr
                  onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                  style={{
                    cursor: "pointer",
                    background: isOpen
                      ? "var(--surface-subtle)"
                      : hovered === key
                        ? "var(--row-hover-bg)"
                        : undefined,
                    transition: "background 120ms ease",
                  }}
                >
                  <td style={tdS}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {r.color && (
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: r.color,
                            display: "inline-block",
                          }}
                        />
                      )}
                      {r.name || "—"}
                    </span>
                  </td>
                  <td style={tdS}>{r.n}</td>
                  <td style={tdS}>{CORR_TEST_LABELS[r.chosenTest]}</td>
                  <td style={{ ...tdS, ...mono }}>
                    {coef != null ? formatCorrStatShort(res) : "—"}
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
                    <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                      <ScatterStatsDetail
                        row={r}
                        isOverridden={!!overrides[key]}
                        onOverrideTest={(t) => setOverride(key, t)}
                        xLabel={xLabel}
                        yLabel={yLabel}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

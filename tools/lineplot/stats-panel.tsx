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
} from "../_shell";
import {
  formatX,
  EnrichedPerXRow,
  PerXDetailProps,
  PerXStatsPanelProps,
  PerXRow,
  PostHocPair,
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

const { useState, useMemo } = React;

export function PerXDetail({ row, onOverrideTest, isOverridden }: PerXDetailProps) {
  const names = row.names;
  const values = row.values;
  const k = names.length;
  // SelectTestResult fields are all optional (selectTest can return early on
  // bad input); the `?? {}` defaults keep the JSX null-safe without forcing
  // an `if` early-return that would skip the assumptions panel entirely.
  const res = row.result ?? ({} as TestResult);
  const rec = (row.rec ?? {}) as SelectTestResult;
  const recReason = rec.recommendation?.reason;
  const recTest = rec.recommendation?.test ?? null;
  const suggestion = rec.suggestion ?? null;
  const testOptions = k === 2 ? STATS_TESTS_FOR_K2 : STATS_TESTS_FOR_K;
  // Hoist nullable conditionally-rendered fields into local consts so
  // TypeScript's narrowing inside `{x && (...)}` survives into the inner
  // .map callbacks (a closure-captured property access stays nullable).
  const postHoc = row.postHocResult;
  const power = row.powerResult;

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
  const norm = rec.normality ?? [];
  const lev = rec.levene ?? {};

  return (
    <div style={{ padding: "6px 16px 12px 16px", background: "var(--surface-subtle)" }}>
      <div style={subhead}>Groups</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>Group</th>
            <th style={thS}>n</th>
            <th style={thS}>Mean</th>
            <th style={thS}>SD</th>
            <th style={thS}>SEM</th>
            <th style={thS}>95% CI</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name: string, i: number) => {
            const vs = values[i];
            const n = vs.length;
            const m = sampleMean(vs);
            const sd = n > 1 ? sampleSD(vs) : 0;
            const sem = n > 1 ? sd / Math.sqrt(n) : 0;
            const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
            return (
              <tr key={i}>
                <td style={tdS}>{name}</td>
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

      <div style={subhead}>Assumptions</div>
      {norm.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}
          >
            Shapiro-Wilk (normality)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {norm.map((r, i) => {
              const label = names[r.group] || `g${r.group}`;
              const pill = r.normal === true ? pillOk : r.normal === false ? pillBad : pillNeutral;
              const verdict =
                r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
              return (
                <span key={i} style={{ fontSize: 11, color: "var(--text)" }}>
                  {label}: <span style={pill}>{verdict}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {lev.F != null && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 600 }}>Levene</span> — F({lev.df1}, {lev.df2}) ={" "}
          {lev.F.toFixed(3)}, p = {formatP(lev.p)}{" "}
          <span style={lev.equalVar ? pillOk : pillBad}>
            {lev.equalVar ? "equal variance" : "unequal variance"}
          </span>
        </div>
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
          value={row.chosenTest || ""}
          onChange={(e) => {
            // The select renders only RecommendedTest options, but TS sees
            // `e.target.value` as a generic string — narrow it explicitly.
            const next = e.target.value === "" ? null : (e.target.value as RecommendedTest);
            if (onOverrideTest) onOverrideTest(next === recTest ? null : next);
          }}
          className="dv-select"
          style={{ fontSize: 11, padding: "2px 6px", minWidth: 180 }}
          onClick={(e) => e.stopPropagation()}
        >
          {testOptions.map((t) => (
            <option key={t} value={t}>
              {TEST_LABELS_LP[t]}
              {t === recTest ? "  (recommended)" : ""}
            </option>
          ))}
        </select>
        {isOverridden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest && onOverrideTest(null);
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
            <strong>{TEST_LABELS_LP[suggestion.test] || suggestion.test}</strong>.
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest && onOverrideTest(suggestion.test);
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
        {res.error
          ? `⚠ ${res.error}`
          : `${formatStat(row.chosenTest, res)},  p = ${formatP(res.p)}${
              row.pAdj != null ? ` · BH-adjusted p = ${formatP(row.pAdj)}` : ""
            }`}
      </div>

      {k >= 3 && postHoc && !postHoc.error && row.postHocName && (
        <>
          <div style={subhead}>
            Post-hoc — {POSTHOC_LABELS_LP[row.postHocName] || row.postHocName}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Pair</th>
                <th style={thS}>{row.postHocName === "dunn" ? "Rank diff" : "Mean diff"}</th>
                <th style={thS}>p</th>
                <th style={thS}>Signif.</th>
              </tr>
            </thead>
            <tbody>
              {postHoc.pairs.map((pr: PostHocPair, i: number) => {
                const p = pr.pAdj != null ? pr.pAdj : pr.p;
                const diff =
                  pr.diff != null
                    ? pr.diff.toFixed(3)
                    : pr.z != null
                      ? `z = ${pr.z.toFixed(3)}`
                      : "—";
                return (
                  <tr key={i}>
                    <td style={tdS}>
                      {names[pr.i]} vs {names[pr.j]}
                    </td>
                    <td style={tdS}>{diff}</td>
                    <td style={tdS}>{formatP(p)}</td>
                    <td
                      style={{
                        ...tdS,
                        fontWeight: 700,
                        color: p < 0.05 ? "var(--step-ready)" : "var(--text-faint)",
                      }}
                    >
                      {pStars(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {power && (
        <>
          <div style={subhead}>Replication planning (n for 80% power)</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            Given the observed effect size, sample size a future study would need to detect this
            effect at 80% power.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Effect size</th>
                <th style={thS}>α</th>
                <th style={thS}>n for 80% power</th>
              </tr>
            </thead>
            <tbody>
              {power.rows.map((pr, i) => (
                <tr key={i}>
                  {i === 0 ? (
                    <td style={tdS} rowSpan={power.rows.length}>
                      {power.effectLabel} = {power.effect.toFixed(3)}
                    </td>
                  ) : null}
                  <td style={tdS}>{String(pr.alpha)}</td>
                  <td style={tdS}>
                    {pr.nForTarget != null ? `${pr.nForTarget} ${power.nLabel}` : "> 5000"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {power.approximate && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              Approximation — rank-based test power estimated from its parametric analog.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PerXStatsPanel({
  rows,
  xLabel,
  fileName,
  showStars,
  setShowStars,
}: PerXStatsPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RecommendedTest>>({});
  const stem = fileBaseName(fileName, "lineplot");
  const hasR = typeof buildRScript === "function";

  const enriched = useMemo<EnrichedPerXRow[]>(() => {
    const withChosen: EnrichedPerXRow[] = rows.map((r: PerXRow) => {
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
      const powerResult = computePowerFromData(chosenTest ?? "", r.values);
      return { ...r, rec, chosenTest, result, postHocName, postHocResult, powerResult, pAdj: null };
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

  const xSlug = (row: EnrichedPerXRow, i: number): string => {
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
    if (enriched.length <= 1) {
      downloadText(buildAggregateReport(enriched, xLabel), `${stem}_stats.txt`);
      return;
    }
    enriched.forEach((row, i) => {
      const content = buildAggregateReport([row], xLabel);
      const name = `${stem}_${xSlug(row, i)}_stats.txt`;
      setTimeout(() => downloadText(content, name), i * 120);
    });
  };
  const downloadR = () => {
    if (enriched.length <= 1) {
      downloadText(buildAggregateRScript(enriched, xLabel), `${stem}_stats.R`);
      return;
    }
    enriched.forEach((row, i) => {
      const content = buildAggregateRScript([row], xLabel);
      const name = `${stem}_${xSlug(row, i)}_stats.R`;
      setTimeout(() => downloadText(content, name), i * 120);
    });
  };

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

  return (
    <div className="dv-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
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
            Statistics at each {xLabel || "x"}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Click a row to see the decision trace, assumptions, and post-hoc details. P-values are
            BH-adjusted across the x-axis.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={(e) => {
              downloadReport();
              flashSaved(e.currentTarget);
            }}
            title="Download a plain-text report covering every x"
          >
            ⬇ TXT
          </button>
          {hasR && (
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={(e) => {
                downloadR();
                flashSaved(e.currentTarget);
              }}
              title="Download a runnable R script reproducing every per-x test"
            >
              ⬇ R
            </button>
          )}
        </div>
      </div>

      {/* Display-on-plot toolbar — mirrors the boxplot stats-panel header
          secondary row. Binary (Off / Stars) since lineplot has no CLD or
          brackets layer; stars render at each x whose BH-adjusted p < 0.05.
          No "Print summary below plot" option — per-x text would clutter
          the line chart. */}
      {setShowStars && (
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
            Display on plot
          </span>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(
              [
                [false, "Off"],
                [true, "Stars"],
              ] as const
            ).map(([value, label]) => {
              const active = !!showStars === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setShowStars(value)}
                  style={{
                    flex: "0 0 auto",
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>{xLabel || "x"}</th>
            <th style={thS}>Test</th>
            <th style={thS}>Statistic</th>
            <th style={thS}>p</th>
            <th style={thS}>p (BH)</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => {
            const key = formatX(r.x);
            const isOpen = !!expanded[key];
            const p = r.result && !r.result.error ? r.result.p : null;
            const stars = r.pAdj != null ? pStars(r.pAdj) : "";
            const sig = r.pAdj != null && r.pAdj < 0.05;
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
                  <td style={{ ...tdS, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {formatX(r.x)}
                  </td>
                  <td style={tdS}>
                    {r.chosenTest ? TEST_LABELS_LP[r.chosenTest] || r.chosenTest : "—"}
                  </td>
                  <td style={{ ...tdS, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {formatStat(r.chosenTest, r.result)}
                  </td>
                  <td style={{ ...tdS, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {p != null ? formatP(p) : "—"}
                  </td>
                  <td
                    style={{
                      ...tdS,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontWeight: sig ? 700 : 400,
                      color: sig ? "var(--step-ready)" : "var(--text)",
                    }}
                  >
                    {r.pAdj != null ? formatP(r.pAdj) : "—"}
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
                      <PerXDetail
                        row={r}
                        isOverridden={!!overrides[key]}
                        onOverrideTest={(t) => setOverride(key, t)}
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

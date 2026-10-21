// `GroupTestSections` — the inspector sections for one set of groups tested
// with the `selectTest` engine (Group Plot, Line Plot, RLU Timecourse):
//
//   result headline + test picker (+ suggested alternative)
//   assumptions checked (Shapiro-Wilk, Levene) + Why this test?
//   post-hoc table (k ≥ 3)
//   group summaries (n, mean, SD, SEM, 95 % CI)
//   replication planning (n for 80 % power)
//
// Tools pass their own on-screen test / post-hoc names (`testLabel`,
// `posthocLabel`) and the result line's parts; everything else is shared so
// the three tools read identically.

import { useShellT } from "./i18n";
import { InspectorSection } from "./WorkspaceLayout";
import {
  AssumptionRow,
  ResultHeadline,
  inspectorFirstCol,
  inspectorTable,
  inspectorTd,
  inspectorTh,
} from "./Inspector";
import { WhyThisTest } from "./WhyThisTest";
import { buildSelectTestReason } from "./select-test-narrative";
import type { PostHocPair, PostHocResult } from "./stats-dispatch";
import type { PowerFromDataResult } from "./power-from-data";
import type { SelectTestResult } from "../_core/stats/types";
import { tinv } from "../_core/stats/dist";
import { sampleMean, sampleSD } from "../_core/stats/tests";
import { formatP, pStars } from "../_core/stats/format";

export interface GroupTestSectionsProps {
  names: string[];
  values: number[][];
  rec: SelectTestResult | null | undefined;
  chosenTest: RecommendedTest | null;
  testOptions: RecommendedTest[];
  testLabel: (key: string | null | undefined) => string;
  posthocLabel: (key: string) => string;
  // The result line split into parts ("F(2, 45.51) = 37.326", "p = …").
  resultParts: string[];
  p: number | null;
  error?: boolean;
  postHocName: string | null | undefined;
  postHocResult: PostHocResult | null | undefined;
  powerResult: PowerFromDataResult | null | undefined;
  isOverridden: boolean;
  onOverrideTest: (test: RecommendedTest | null) => void;
}

export function GroupTestSections({
  names,
  values,
  rec,
  chosenTest,
  testOptions,
  testLabel,
  posthocLabel,
  resultParts,
  p,
  error,
  postHocName,
  postHocResult,
  powerResult: power,
  isOverridden,
  onOverrideTest,
}: GroupTestSectionsProps) {
  const tr = useShellT();
  const k = names.length;
  const r = rec ?? ({ k } as SelectTestResult);
  const recTest = r.recommendation?.test ?? null;
  const suggestion = r.suggestion ?? null;
  const norm = r.normality ?? [];
  const lev = (r.levene ?? {}) as {
    F?: number;
    df1?: number;
    df2?: number;
    p?: number;
    equalVar?: boolean | null;
  };
  const nNormal = norm.filter((x) => x.normal === true).length;
  const notNormal = norm
    .filter((x) => x.normal === false)
    .map((x) => names[x.group] || `g${x.group}`);
  // The power helper labels sample sizes in English; translate here.
  const nUnit = (n: number | null) =>
    n == null ? "> 5000" : tr("shell.gt.perGroup", { n: String(n) });

  return (
    <>
      <InspectorSection label={k > 2 ? tr("shell.gt.omnibus") : tr("shell.gt.twoGroupTest")}>
        <ResultHeadline name={testLabel(chosenTest)} p={p} parts={resultParts} error={error} />
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {tr("shell.gt.test")}
          <select
            value={chosenTest || ""}
            onChange={(e) => {
              const next = e.target.value === "" ? null : (e.target.value as RecommendedTest);
              onOverrideTest(next === recTest ? null : next);
            }}
            className="dv-select"
            style={{ width: "100%", minHeight: 34 }}
          >
            {testOptions.map((t) => (
              <option key={t} value={t}>
                {testLabel(t)}
                {t === recTest ? tr("shell.gt.recommendedSuffix") : ""}
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
            {tr("shell.gt.useRecommendation")}
          </button>
        )}
        {suggestion && chosenTest !== suggestion.test && (
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
              {tr("shell.gt.suggestConsider")} <strong>{testLabel(suggestion.test)}</strong>.
            </span>
            <button
              type="button"
              onClick={() => onOverrideTest(suggestion.test)}
              className="dv-btn dv-btn-secondary"
              style={{ alignSelf: "flex-start" }}
            >
              {tr("shell.gt.useSuggestion")}
            </button>
          </div>
        )}
      </InspectorSection>

      {(norm.length > 0 || lev.F != null) && (
        <InspectorSection label={tr("shell.gt.assumptions")}>
          {norm.length > 0 && (
            <AssumptionRow
              ok={notNormal.length > 0 ? false : nNormal === norm.length ? true : null}
              label={tr("shell.gt.normality")}
              value={tr("shell.gt.nNormal", { k: nNormal, n: norm.length })}
            />
          )}
          {notNormal.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--danger-text)", paddingLeft: 22 }}>
              {tr("shell.gt.notNormalList", { list: notNormal.join(", ") })}
            </div>
          )}
          {lev.F != null && (
            <AssumptionRow
              ok={lev.equalVar}
              label={tr("shell.gt.equalVariance")}
              value={`p = ${formatP(lev.p)}`}
              title={`F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(3)}`}
            />
          )}
          <WhyThisTest text={buildSelectTestReason(r)} />
        </InspectorSection>
      )}

      {k >= 3 && postHocResult && !postHocResult.error && postHocName && (
        <InspectorSection label={tr("shell.gt.posthoc", { name: posthocLabel(postHocName) })}>
          <table style={inspectorTable}>
            <thead>
              <tr>
                <th style={{ ...inspectorTh, ...inspectorFirstCol }}>{tr("shell.gt.pair")}</th>
                <th style={inspectorTh}>
                  {postHocName === "dunn" ? tr("shell.gt.rankDiff") : tr("shell.gt.meanDiff")}
                </th>
                <th style={inspectorTh}>p</th>
                <th style={inspectorTh}>
                  <span className="dv-sr-only">{tr("shell.gt.signif")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {postHocResult.pairs.map((pr: PostHocPair, i: number) => {
                const pp = pr.pAdj != null ? pr.pAdj : pr.p;
                const diff =
                  pr.diff != null
                    ? pr.diff.toFixed(3)
                    : pr.z != null
                      ? `z = ${pr.z.toFixed(3)}`
                      : "—";
                return (
                  <tr key={i}>
                    <td style={{ ...inspectorTd, ...inspectorFirstCol }}>
                      {names[pr.i]} – {names[pr.j]}
                    </td>
                    <td style={inspectorTd}>{diff}</td>
                    <td style={inspectorTd}>{formatP(pp)}</td>
                    <td
                      style={{
                        ...inspectorTd,
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
        </InspectorSection>
      )}

      <InspectorSection label={tr("shell.gt.groups")}>
        <div style={{ overflowX: "auto" }}>
          <table style={inspectorTable}>
            <thead>
              <tr>
                <th style={{ ...inspectorTh, ...inspectorFirstCol }}>
                  <span className="dv-sr-only">{tr("shell.gt.group")}</span>
                </th>
                <th style={inspectorTh}>n</th>
                <th style={inspectorTh}>{tr("shell.gt.mean")}</th>
                <th style={inspectorTh}>{tr("shell.gt.sd")}</th>
                <th style={inspectorTh}>{tr("shell.gt.sem")}</th>
                <th style={inspectorTh}>{tr("shell.gt.ci95")}</th>
              </tr>
            </thead>
            <tbody>
              {names.map((name, i) => {
                const vs = values[i];
                const n = vs.length;
                const m = sampleMean(vs);
                const sd = n > 1 ? sampleSD(vs) : 0;
                const sem = n > 1 ? sd / Math.sqrt(n) : 0;
                const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
                return (
                  <tr key={i}>
                    <td style={{ ...inspectorTd, ...inspectorFirstCol }}>{name}</td>
                    <td style={inspectorTd}>{n}</td>
                    <td style={inspectorTd}>{m.toFixed(3)}</td>
                    <td style={inspectorTd}>{sd.toFixed(3)}</td>
                    <td style={inspectorTd}>{n > 1 ? sem.toFixed(3) : "—"}</td>
                    <td style={inspectorTd}>{n > 1 ? `±${ci95.toFixed(3)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </InspectorSection>

      {power && power.rows.length > 0 && (
        <InspectorSection label={tr("shell.gt.replication")}>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>
            {tr("shell.gt.replicationLine", {
              effect: `${power.effectLabel} = ${power.effect.toFixed(3)}`,
              n: nUnit(power.rows[0].nForTarget),
              alpha: String(power.rows[0].alpha),
            })}
          </div>
          {power.effectCI && (
            <div className="dv-mono-faint">
              95% CI [{power.effectCI.lo.toFixed(3)}, {power.effectCI.hi.toFixed(3)}]
            </div>
          )}
          {power.rows.slice(1).map((pr, i) => (
            <div key={i} className="dv-mono-faint">
              {tr("shell.gt.atAlpha", { alpha: String(pr.alpha), n: nUnit(pr.nForTarget) })}
            </div>
          ))}
          {power.approximate && (
            <div style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic" }}>
              {tr("shell.gt.approxNote")}
            </div>
          )}
        </InspectorSection>
      )}
    </>
  );
}

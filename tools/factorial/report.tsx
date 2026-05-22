// tools/factorial/report.tsx — formatted stats output for the Report step.
// Pure render component: takes the `TwoWayANOVAResult` already produced by
// `_core/stats/tests`'s `twoWayANOVA`, plus per-cell normality + variance
// diagnostics, and emits the design summary / ANOVA table / interaction
// hint / diagnostics block / cell-means table the user sees in-app.
//
// No SVG; this is the "stats-only" tool's analogue of `<chart.tsx>`.
// Chrome colours use CSS variables; numeric formatting matches the
// downloaded TXT report from `reports.ts` so what the user sees and what
// they paste into a methods section are byte-identical.

import { formatP, pStars } from "../_core/stats/format";
import type { TwoWayANOVAResult } from "../_core/stats/types";

interface ReportProps {
  result: TwoWayANOVAResult;
  factorAName: string;
  factorBName: string;
  valueName: string;
  // Diagnostics — caller assembles by running shapiroWilk per cell and
  // leveneTest across cell-flattened groups. Allowed to be null when the
  // user has hidden the diagnostics block via the prefs panel.
  diagnostics: {
    perCellShapiro: Array<{ levelA: string; levelB: string; W: number; p: number; n: number }>;
    levene: { F: number; df1: number; df2: number; p: number } | null;
    alphaNormality: number;
  } | null;
  showCellMeans: boolean;
}

const fmt = (n: number, digits = 4): string => (Number.isFinite(n) ? n.toFixed(digits) : "—");

const SIG_COLOR = "var(--success-text)";
const FLAG_COLOR = "var(--warning-text)";

function pCell(p: number) {
  if (!Number.isFinite(p))
    return <td style={{ textAlign: "right", color: "var(--text-faint)" }}>—</td>;
  const sig = p < 0.05;
  return (
    <td
      style={{
        textAlign: "right",
        fontWeight: sig ? 700 : 400,
        color: sig ? SIG_COLOR : "var(--text)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {formatP(p)} {pStars(p)}
    </td>
  );
}

export function Report({
  result,
  factorAName,
  factorBName,
  valueName,
  diagnostics,
  showCellMeans,
}: ReportProps) {
  const interactionSignificant = Number.isFinite(result.termAB.p) && result.termAB.p < 0.05;
  const balancedLabel = result.balanced ? "Balanced" : "Unbalanced (Type II SS)";
  const designLabel = `${balancedLabel} ${result.levelsA.length} × ${result.levelsB.length}`;

  return (
    <div
      className="dv-panel"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* DESIGN SUMMARY */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          Factorial Analysis — Response: {valueName}
        </h3>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {designLabel} · N = {result.N} observations across {result.cells.length} cells.
          <br />
          <span style={{ color: "var(--text-faint)" }}>
            Factor A: {factorAName} ({result.levelsA.join(", ")}) · Factor B: {factorBName} (
            {result.levelsB.join(", ")})
          </span>
        </p>
      </div>

      {/* ANOVA TABLE */}
      <div>
        <h4
          style={{
            margin: "0 0 8px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          ANOVA table (Type II)
        </h4>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <thead>
            <tr style={{ background: "var(--subhead-bg)", color: "var(--subhead-text)" }}>
              <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700 }}>Term</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>df</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>SS</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>MS</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>F</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>p</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>η²_p</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: factorAName, term: result.termA },
              { label: factorBName, term: result.termB },
              { label: `${factorAName} × ${factorBName}`, term: result.termAB },
            ].map((row, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--text)" }}>
                  {row.label}
                </td>
                <td style={{ textAlign: "right", padding: "6px 10px" }}>{row.term.df1}</td>
                <td style={{ textAlign: "right", padding: "6px 10px" }}>{fmt(row.term.SS)}</td>
                <td style={{ textAlign: "right", padding: "6px 10px" }}>{fmt(row.term.MS)}</td>
                <td style={{ textAlign: "right", padding: "6px 10px" }}>{fmt(row.term.F, 3)}</td>
                {pCell(row.term.p)}
                <td style={{ textAlign: "right", padding: "6px 10px" }}>
                  {fmt(row.term.etaSqP, 3)}
                </td>
              </tr>
            ))}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>Residual</td>
              <td style={{ textAlign: "right", padding: "6px 10px" }}>{result.residual.df}</td>
              <td style={{ textAlign: "right", padding: "6px 10px" }}>{fmt(result.residual.SS)}</td>
              <td style={{ textAlign: "right", padding: "6px 10px" }}>{fmt(result.residual.MS)}</td>
              <td style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-faint)" }}>
                —
              </td>
              <td style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-faint)" }}>
                —
              </td>
              <td style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-faint)" }}>
                —
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>Total</td>
              <td style={{ textAlign: "right", padding: "6px 10px" }}>{result.total.df}</td>
              <td style={{ textAlign: "right", padding: "6px 10px" }}>{fmt(result.total.SS)}</td>
              <td colSpan={4} style={{ color: "var(--text-faint)", padding: "6px 10px" }}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* INTERACTION HINT */}
      {interactionSignificant && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--info-bg)",
            color: "var(--info-text)",
            border: "1px solid var(--info-border)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <strong>Interaction is significant.</strong> The effect of one factor depends on the level
          of the other — main effects should be interpreted in the context of the interaction, not
          on their own.
        </div>
      )}

      {/* DIAGNOSTICS */}
      {diagnostics && (
        <div>
          <h4
            style={{
              margin: "0 0 8px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Diagnostics
          </h4>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              marginBottom: 12,
            }}
          >
            <thead>
              <tr style={{ background: "var(--subhead-bg)", color: "var(--subhead-text)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 700 }}>Cell</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 700 }}>n</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 700 }}>
                  Shapiro W
                </th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 700 }}>p</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.perCellShapiro.map((d, i) => {
                const flagged = Number.isFinite(d.p) && d.p < diagnostics.alphaNormality;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 8px", color: "var(--text)" }}>
                      {d.levelA} · {d.levelB}
                    </td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>{d.n}</td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>{fmt(d.W, 4)}</td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "4px 8px",
                        color: flagged ? FLAG_COLOR : "var(--text)",
                        fontWeight: flagged ? 700 : 400,
                      }}
                    >
                      {Number.isFinite(d.p) ? formatP(d.p) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {diagnostics.levene && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                padding: "6px 10px",
                background: "var(--surface-subtle)",
                borderRadius: 4,
              }}
            >
              <strong>Levene&apos;s test</strong> (variance homogeneity across cells): F(
              {diagnostics.levene.df1}, {diagnostics.levene.df2}) = {fmt(diagnostics.levene.F, 3)},
              p = {formatP(diagnostics.levene.p)}
              {Number.isFinite(diagnostics.levene.p) && diagnostics.levene.p < 0.05 && (
                <span style={{ color: FLAG_COLOR, fontWeight: 700, marginLeft: 6 }}>
                  · variance heterogeneity flagged
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* CELL MEANS */}
      {showCellMeans && (
        <div>
          <h4
            style={{
              margin: "0 0 8px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Cell means
          </h4>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <thead>
              <tr style={{ background: "var(--subhead-bg)", color: "var(--subhead-text)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 700 }}>
                  {factorAName}
                </th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 700 }}>
                  {factorBName}
                </th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 700 }}>n</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 700 }}>mean</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 700 }}>sd</th>
              </tr>
            </thead>
            <tbody>
              {result.cells.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "4px 8px" }}>{c.levelA}</td>
                  <td style={{ padding: "4px 8px" }}>{c.levelB}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>{c.n}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>{fmt(c.mean)}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>{fmt(c.sd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

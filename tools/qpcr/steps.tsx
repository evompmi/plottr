// Step components for the qPCR tool: ConfigureStep (layout & columns, gene
// roles & efficiencies, standard curve, calibrator & group order, QC) and
// PlotStep (sidebar + fold-change chart + statistics on ΔCt).

import {
  DataPreview,
  DetectedSeparatorBadge,
  DownloadTiles,
  PlotSidebar,
  SegToggle,
} from "../_shell";
import { fileBaseName } from "../_core/download";
import type {
  ConfigureStepProps,
  GeneRow,
  Normalization,
  OrderItem,
  PlotStepProps,
  QpcrLayout,
  StdCurvePanelProps,
} from "./helpers";
import { ChartTile, ColorsTile, StyleTile } from "./controls";
import { QpcrChart } from "./chart";
import { QpcrStatsPanel } from "./stats-panel";
import { useT } from "./i18n";

const thS: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 6px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontWeight: 600,
  fontSize: 11,
};
const tdS: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 12,
};
const warnBox: React.CSSProperties = {
  background: "var(--warning-bg)",
  borderColor: "var(--warning-border)",
  marginBottom: 12,
};

function move(items: OrderItem[], from: number, to: number): OrderItem[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  headers: string[];
  onChange: (i: number) => void;
  testId: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
        color: "var(--text)",
      }}
    >
      {label}
      <select
        className="dv-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
      >
        <option value={-1}>—</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StdCurvePanel({ text, setText, curves, onApply }: StdCurvePanelProps) {
  const tr = useT();
  return (
    <details className="dv-panel" style={{ marginBottom: 12 }} data-testid="qpcr-stdcurve">
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
        {tr("qpcr.std.title")}
      </summary>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0" }}>
        {tr("qpcr.std.help")}
      </p>
      <textarea
        className="dv-input"
        style={{
          width: "100%",
          minHeight: 90,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 11,
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Gene,Quantity,Ct\nACT2,1,18.2\nACT2,0.1,21.6\nACT2,0.01,25.0"}
        aria-label={tr("qpcr.std.title")}
        data-testid="qpcr-std-input"
      />
      {curves.length > 0 && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={thS}>{tr("qpcr.cfg.gene")}</th>
                <th style={thS}>n</th>
                <th style={thS}>{tr("qpcr.std.slope")}</th>
                <th style={thS}>R²</th>
                <th style={thS}>{tr("qpcr.std.eff")}</th>
              </tr>
            </thead>
            <tbody>
              {curves.map((c) => (
                <tr key={c.gene}>
                  <td style={tdS}>{c.gene}</td>
                  <td style={tdS}>{c.n}</td>
                  <td style={tdS}>{c.slope.toFixed(3)}</td>
                  <td style={{ ...tdS, color: c.lowR2 ? "var(--warning-text)" : "var(--text)" }}>
                    {c.r2.toFixed(4)}
                  </td>
                  <td
                    style={{
                      ...tdS,
                      color: c.effOutOfRange ? "var(--warning-text)" : "var(--text)",
                    }}
                  >
                    {`${c.percent.toFixed(1)} % (E = ${c.E.toFixed(3)})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {curves.some((c) => c.lowR2 || c.effOutOfRange) && (
            <p style={{ fontSize: 11, color: "var(--warning-text)", margin: "6px 0 0" }}>
              {tr("qpcr.std.qc")}
            </p>
          )}
          <button
            type="button"
            className="dv-btn dv-btn-secondary"
            style={{ marginTop: 8, fontSize: 12 }}
            onClick={() => onApply(curves)}
            data-testid="qpcr-std-apply"
          >
            {tr("qpcr.std.apply")}
          </button>
        </>
      )}
    </details>
  );
}

export function ConfigureStep(p: ConfigureStepProps) {
  const tr = useT();
  const { data, geneRows, groupOrder } = p;
  const nRef = geneRows.filter((g) => g.role === "ref").length;
  const nTarget = geneRows.filter((g) => g.role === "target").length;
  const roles: { value: GeneRow["role"]; label: string }[] = [
    { value: "ref", label: tr("qpcr.cfg.roleRef") },
    { value: "target", label: tr("qpcr.cfg.roleTarget") },
    { value: "ignore", label: tr("qpcr.cfg.roleIgnore") },
  ];
  const btn: React.CSSProperties = { padding: "1px 7px", fontSize: 12, lineHeight: "18px" };
  const genorm = Object.entries(p.genorm);

  return (
    <div>
      <div className="dv-panel" style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{p.fileName || tr("qpcr.cfg.pasted")}</strong>
          {data
            ? tr("qpcr.cfg.shape", {
                wells: data.wells.length,
                genes: data.genes.length,
                groups: data.groups.length,
              })
            : ""}
          <DetectedSeparatorBadge sep={p.detectedSep} />
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text)" }}>{tr("qpcr.cfg.layout")}</span>
          <SegToggle<QpcrLayout>
            value={p.layout}
            onChange={p.setLayout}
            ariaLabel={tr("qpcr.cfg.layout")}
            style={{ width: 160 }}
            options={[
              { value: "long", label: tr("qpcr.cfg.long"), title: tr("qpcr.cfg.longTitle") },
              { value: "wide", label: tr("qpcr.cfg.wide"), title: tr("qpcr.cfg.wideTitle") },
            ]}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          <ColumnSelect
            label={tr("qpcr.cfg.colSample")}
            value={p.layout === "long" ? p.longCols.sample : p.wideCols.sample}
            headers={p.headers}
            testId="qpcr-col-sample"
            onChange={(i) =>
              p.layout === "long"
                ? p.setLongCols({ ...p.longCols, sample: i })
                : p.setWideCols({ ...p.wideCols, sample: i })
            }
          />
          <ColumnSelect
            label={tr("qpcr.cfg.colGroup")}
            value={p.layout === "long" ? p.longCols.group : p.wideCols.group}
            headers={p.headers}
            testId="qpcr-col-group"
            onChange={(i) =>
              p.layout === "long"
                ? p.setLongCols({ ...p.longCols, group: i })
                : p.setWideCols({ ...p.wideCols, group: i })
            }
          />
          {p.layout === "long" && (
            <>
              <ColumnSelect
                label={tr("qpcr.cfg.colGene")}
                value={p.longCols.gene}
                headers={p.headers}
                testId="qpcr-col-gene"
                onChange={(i) => p.setLongCols({ ...p.longCols, gene: i })}
              />
              <ColumnSelect
                label={tr("qpcr.cfg.colCt")}
                value={p.longCols.ct}
                headers={p.headers}
                testId="qpcr-col-ct"
                onChange={(i) => p.setLongCols({ ...p.longCols, ct: i })}
              />
            </>
          )}
        </div>
        {p.layout === "wide" && (
          <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "8px 0 0" }}>
            {tr("qpcr.cfg.wideGenes", {
              genes: p.wideCols.genes.map((c) => p.headers[c]).join(", ") || "—",
            })}
          </p>
        )}
      </div>

      {p.parseError && (
        <div className="dv-panel" role="status" style={warnBox}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--warning-text)" }}>
            {p.parseError.kind === "missingRole"
              ? tr("qpcr.err.missingRole", { role: p.parseError.role })
              : p.parseError.kind === "noGenes"
                ? tr("qpcr.err.noGenes")
                : tr("qpcr.err.empty")}
          </p>
        </div>
      )}

      {data && (
        <>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
              alignItems: "flex-start",
            }}
          >
            <div className="dv-panel" style={{ flex: "2 1 420px", minWidth: 0 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {tr("qpcr.cfg.genes")}
              </p>
              <table
                style={{ width: "100%", borderCollapse: "collapse" }}
                data-testid="qpcr-gene-table"
              >
                <thead>
                  <tr>
                    <th style={thS}>{tr("qpcr.cfg.gene")}</th>
                    <th style={thS}>{tr("qpcr.cfg.role")}</th>
                    <th style={thS}>{tr("qpcr.cfg.eff")}</th>
                    <th style={thS}>{tr("qpcr.cfg.wells")}</th>
                  </tr>
                </thead>
                <tbody>
                  {geneRows.map((g) => (
                    <tr key={g.name}>
                      <td style={{ ...tdS, fontStyle: "italic" }}>{g.name}</td>
                      <td style={tdS}>
                        <select
                          className="dv-select"
                          value={g.role}
                          onChange={(e) => p.setGeneRole(g.name, e.target.value as GeneRow["role"])}
                          aria-label={tr("qpcr.cfg.roleFor", { gene: g.name })}
                          data-testid={`qpcr-role-${g.name}`}
                        >
                          {roles.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdS}>
                        <input
                          type="text"
                          className="dv-input"
                          style={{ width: 80 }}
                          value={g.effText}
                          onChange={(e) => p.setGeneEff(g.name, e.target.value)}
                          aria-label={tr("qpcr.cfg.effFor", { gene: g.name })}
                          data-testid={`qpcr-eff-${g.name}`}
                        />
                      </td>
                      <td style={tdS}>
                        {g.nWells}
                        {g.nMissing > 0 && (
                          <span style={{ color: "var(--warning-text)" }}>
                            {" "}
                            {tr("qpcr.cfg.missing", { n: g.nMissing })}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0" }}>
                {tr("qpcr.cfg.effHelp")}
              </p>
              {(nRef === 0 || nTarget === 0) && (
                <p style={{ fontSize: 12, color: "var(--warning-text)", margin: "6px 0 0" }}>
                  {tr("qpcr.cfg.needRoles")}
                </p>
              )}
            </div>
            <div className="dv-panel" style={{ flex: "1 1 260px", minWidth: 0 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {tr("qpcr.cfg.groups")}
              </p>
              <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 4 }}>
                {tr("qpcr.cfg.normalize")}
              </div>
              <SegToggle<Normalization>
                value={p.normalize}
                onChange={p.setNormalize}
                ariaLabel={tr("qpcr.cfg.normalize")}
                style={{ marginBottom: 8 }}
                options={[
                  {
                    value: "control",
                    label: tr("qpcr.cfg.normControl"),
                    title: tr("qpcr.cfg.normControlTitle"),
                  },
                  {
                    value: "refs",
                    label: tr("qpcr.cfg.normRefs"),
                    title: tr("qpcr.cfg.normRefsTitle"),
                  },
                ]}
              />
              {p.normalize === "control" ? (
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  {tr("qpcr.cfg.control")}
                  <select
                    className="dv-select"
                    value={p.control}
                    onChange={(e) => p.setControl(e.target.value)}
                    data-testid="qpcr-control"
                  >
                    {groupOrder.map((g) => (
                      <option key={g.name} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p
                  style={{ fontSize: 11, color: "var(--text-faint)", margin: "0 0 8px" }}
                  data-testid="qpcr-norm-refs-note"
                >
                  {tr("qpcr.cfg.normRefsNote")}
                </p>
              )}
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {groupOrder.map((it, i) => (
                  <li
                    key={it.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "3px 0",
                      borderBottom: "1px solid var(--border)",
                      opacity: it.include ? 1 : 0.55,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={it.include}
                      disabled={p.normalize === "control" && it.name === p.control}
                      onChange={(e) =>
                        p.setGroupOrder(
                          groupOrder.map((x, j) =>
                            j === i ? { ...x, include: e.target.checked } : x
                          )
                        )
                      }
                      aria-label={tr("qpcr.cfg.include", { name: it.name })}
                      style={{ accentColor: "var(--cta-primary-bg)", margin: 0 }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "var(--text)",
                        fontWeight: p.normalize === "control" && it.name === p.control ? 700 : 400,
                      }}
                    >
                      {it.name}
                    </span>
                    <button
                      type="button"
                      className="dv-btn dv-btn-secondary"
                      style={btn}
                      disabled={i === 0}
                      onClick={() => p.setGroupOrder(move(groupOrder, i, i - 1))}
                      aria-label={tr("qpcr.cfg.up", { name: it.name })}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="dv-btn dv-btn-secondary"
                      style={btn}
                      disabled={i === groupOrder.length - 1}
                      onClick={() => p.setGroupOrder(move(groupOrder, i, i + 1))}
                      aria-label={tr("qpcr.cfg.down", { name: it.name })}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <StdCurvePanel
            text={p.stdText}
            setText={p.setStdText}
            curves={p.stdCurves}
            onApply={p.onApplyStd}
          />

          {(data.missingCt > 0 || p.noisy.length > 0 || genorm.length > 0) && (
            <div className="dv-panel" style={{ marginBottom: 12 }} data-testid="qpcr-qc">
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {tr("qpcr.qc.title")}
              </p>
              {data.missingCt > 0 && (
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--warning-text)" }}>
                  {tr("qpcr.qc.missing", { count: data.missingCt })}
                </p>
              )}
              {p.noisy.length > 0 && (
                <div style={{ margin: "0 0 6px", fontSize: 12, color: "var(--warning-text)" }}>
                  {tr("qpcr.qc.noisy", { count: p.noisy.length })}
                  <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                    {p.noisy.map((n) => (
                      <li key={`${n.group}-${n.sample}-${n.gene}`}>
                        {`${n.group} / ${n.sample} / ${n.gene}: SD ${n.sd.toFixed(2)}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {genorm.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text)" }}>
                  {tr("qpcr.qc.genorm")}{" "}
                  {genorm
                    .map(([g, m]) => `${g} ${Number.isFinite(m) ? m.toFixed(3) : "—"}`)
                    .join(" · ")}
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                    {genorm.length === 2 ? tr("qpcr.qc.genormTwo") : tr("qpcr.qc.genormHelp")}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="dv-panel">
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "0 0 8px" }}>
              {tr("qpcr.cfg.preview")}
            </p>
            <DataPreview
              headers={["Sample", "Group", "Gene", "Ct"]}
              rows={data.wells
                .slice(0, 8)
                .map((w) => [w.sample, w.group, w.gene, w.ct === null ? "—" : String(w.ct)])}
              maxRows={8}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function PlotStep(p: PlotStepProps) {
  const tr = useT();
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <PlotSidebar>
        <DownloadTiles
          chartRef={p.chartRef}
          fileStem={fileBaseName(p.fileName, "qpcr")}
          onReset={p.onReset}
          extraDownloads={[
            { label: "CSV", title: tr("qpcr.dl.csvTitle"), onClick: p.onDownloadCsv },
          ]}
        />
        <ChartTile vis={p.vis} updVis={p.updVis} normalize={p.normalize} />
        <ColorsTile
          vis={p.vis}
          updVis={p.updVis}
          items={p.groupOrder.map((g, i) => ({ name: g, color: p.colors[i] }))}
          onColorChange={p.onGroupColor}
          onPaletteChange={p.onPaletteChange}
        />
        <StyleTile vis={p.vis} updVis={p.updVis} />
      </PlotSidebar>
      <div
        style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}
      >
        {p.dropped > 0 && (
          <div
            role="status"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--warning-bg)",
              border: "1px solid var(--warning-border)",
              fontSize: 11,
              color: "var(--warning-text)",
            }}
          >
            {tr("qpcr.plot.dropped", { count: p.dropped })}
          </div>
        )}
        <div
          style={{
            background: "var(--plot-card-bg)",
            border: "1.5px solid var(--plot-card-border)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <QpcrChart
            ref={p.chartRef}
            genes={p.genes}
            annotations={p.annotations}
            colors={p.colors}
            groupOrder={p.groupOrder}
            normalize={p.normalize}
            control={p.control}
            yScale={p.vis.yScale}
            chartStyle={p.vis.chartStyle}
            showPoints={p.vis.showPoints}
            errorBar={p.vis.errorBar}
            showCalibrator={p.vis.showCalibrator}
            barOutline={p.vis.barOutline}
            barOutlineWidth={p.vis.barOutlineWidth}
            barWidthFrac={p.vis.barWidthFrac}
            facetWidth={p.vis.facetWidth}
            facetHeight={p.vis.facetHeight}
            facetCols={p.vis.facetCols}
            xLabelAngle={p.vis.xLabelAngle}
            tickFontSize={p.vis.tickFontSize}
            title={p.vis.plotTitle}
            plotBg={p.vis.plotBg}
            showGrid={p.vis.showGrid}
            gridColor={p.vis.gridColor}
          />
        </div>
        <QpcrStatsPanel
          genes={p.genes}
          stats={p.stats}
          normalize={p.normalize}
          control={p.control}
          overrides={p.overrides}
          onOverride={p.onOverride}
          vis={p.vis}
          updVis={p.updVis}
          onDownloadReport={p.onDownloadReport}
          onDownloadR={p.onDownloadR}
          onSendToGroupPlot={p.onSendToGroupPlot}
          handoffLabel={p.handoffLabel}
        />
      </div>
    </div>
  );
}

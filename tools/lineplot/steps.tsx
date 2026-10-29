// lineplot/steps.tsx — UploadStep + ConfigureStep panels.

import type { UploadStepProps, ConfigureStepProps } from "./helpers";
import { DataPreview, DetectedSeparatorBadge, HowTo, RoleCard, UploadPanel } from "../_shell";
import { useLineplotHowTo } from "./howto";
import { useT } from "./i18n";

// ── UploadStep ─────────────────────────────────────────────────────────────

export function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  handleTextPaste,
  onLoadExample,
}: UploadStepProps) {
  const tr = useT();
  const howto = useLineplotHowTo();
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          setSepOverride(v);
          if (rawText) doParse(rawText, v);
        }}
        onFileLoad={handleFileLoad}
        onTextPaste={handleTextPaste}
        autoDetect
        onLoadExample={onLoadExample}
        exampleSummary={{
          title: tr("lineplot.example.title"),
          subtitle: tr("lineplot.example.subtitle"),
        }}
        hint={tr("lineplot.upload.hint")}
      />
      <HowTo {...howto} />
    </div>
  );
}

// ── ConfigureStep ──────────────────────────────────────────────────────────
// Preview the parsed table and confirm the column roles before plotting.

export function ConfigureStep({
  parsed,
  fileName,
  detectedSep,
  xCol,
  setXCol,
  yCol,
  setYCol,
  groupCol,
  setGroupCol,
  numericCols,
  categoricalCols,
}: ConfigureStepProps) {
  const tr = useT();
  const canPlot = xCol != null && yCol != null && numericCols.length >= 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <RoleCard title={tr("lineplot.var.xAxis")}>
          <select
            aria-label={tr("lineplot.var.xAxis")}
            value={xCol ?? ""}
            onChange={(e) => setXCol(parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {numericCols.map((i: number) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("lineplot.cfg.xNote")}
          </div>
        </RoleCard>
        <RoleCard title={tr("lineplot.var.yAxis")}>
          <select
            aria-label={tr("lineplot.var.yAxis")}
            value={yCol ?? ""}
            onChange={(e) => setYCol(parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {numericCols.map((i: number) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("lineplot.cfg.yNote")}
          </div>
        </RoleCard>
        <RoleCard title={tr("lineplot.var.groupBy")}>
          <select
            aria-label={tr("lineplot.var.groupBy")}
            value={groupCol == null ? "" : groupCol}
            onChange={(e) => setGroupCol(e.target.value === "" ? null : parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            <option value="">{tr("lineplot.cfg.noneSingle")}</option>
            {categoricalCols.map((i: number) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("lineplot.cfg.groupNote")}
          </div>
        </RoleCard>
      </div>
      {!canPlot && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--warning-text)" }}>
          {tr("lineplot.cfg.needTwo")}
        </p>
      )}

      <div className="dv-panel" style={{ marginBottom: 0 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>
          {tr("lineplot.cfg.loaded")}
          <strong style={{ color: "var(--text)" }}>{fileName || tr("lineplot.cfg.pasted")}</strong>
          {tr("lineplot.cfg.rowsCols", {
            rows: parsed.rawData.length,
            cols: parsed.headers.length,
          })}
          <DetectedSeparatorBadge sep={detectedSep} />
        </p>
        <DataPreview headers={parsed.headers} rows={parsed.rawData} maxRows={10} />
      </div>
    </div>
  );
}

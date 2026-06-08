// Step components for the boxplot tool (Upload, Configure, Filter, Output).
// Stateless presentational wrappers — all state lives in App via
// usePlotToolState or local hooks there. Shared UI (UploadPanel,
// DataPreview, ColumnRoleEditor, FilterCheckboxPanel, RenameReorderPanel,
// StatsTable, …) resolves through shared.bundle.js. Prop types live in
// ./helpers.ts (the type-canonical home).

import type {
  ConfigureStepProps,
  FilterStepProps,
  OutputStepProps,
  UploadStepProps,
} from "./helpers";
import {
  DataPreview,
  DetectedSeparatorBadge,
  FilterCheckboxPanel,
  HowTo,
  RenameReorderPanel,
  StatsTable,
  UploadPanel,
} from "../_shell";
import { useBoxplotHowTo } from "./howto";
import { useT, ttHtml, type BoxplotKey } from "./i18n";

import { roleColors } from "../_core/color";
import { downloadCsv, fileBaseName, flashSaved } from "../_core/download";
import type { ColumnRole } from "../_core/csv";
// Role-colour themes for the Configure-step AesBox cards. Reuses scatter's
// `--aes-*` CSS vars so the visual language is consistent across tools
// (slate "Color" theme → Group; emerald "Size" theme → Value). Theme-aware
// light/dark variants come free — vars defined per-theme in theme.css.
const BP_AES_THEMES = {
  group: {
    bg: "var(--aes-shape-bg)",
    border: "var(--aes-shape-border)",
    header: "var(--aes-shape-header)",
    headerText: "var(--aes-shape-header-text)",
    labelKey: "boxplot.steps.aes.group" as BoxplotKey,
  },
  value: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    labelKey: "boxplot.steps.aes.value" as BoxplotKey,
  },
};

interface BpAesTheme {
  bg: string;
  border: string;
  header: string;
  headerText: string;
  labelKey: BoxplotKey;
}

function BpAesBox({ theme, children }: { theme: string; children?: React.ReactNode }) {
  const tr = useT();
  const t = (BP_AES_THEMES as Record<string, BpAesTheme>)[theme];
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
      <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
        <span
          style={{
            color: t.headerText,
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          {tr(t.labelKey)}
        </span>
      </div>
      <div style={{ padding: "12px 14px", minHeight: 40 }}>{children}</div>
    </div>
  );
}

// Compact "Other columns" panel — replaces the old ColumnRoleEditor. Group
// and Value are already assigned by the AesBox cards above, so this list
// only surfaces the remaining columns and gives each one a single binary
// decision: "use as filter" (on = role `filter`; off = role `ignore`).
// Users can still rename; the per-column value preview stays. If nothing
// remains after Group + Value (2-column file), the panel hides itself.
interface OtherColumnsPanelProps {
  headers: string[];
  rows: string[][];
  colRoles: ColumnRole[];
  colNames: string[];
  onRoleChange: (i: number, role: ColumnRole) => void;
  onNameChange: (i: number, name: string) => void;
}

function OtherColumnsPanel({
  headers,
  rows,
  colRoles,
  colNames,
  onRoleChange,
  onNameChange,
}: OtherColumnsPanelProps) {
  const tr = useT();
  const groupColIdx = colRoles.indexOf("group");
  const valueColIdx = colRoles.indexOf("value");
  const otherIdxs = headers.map((_, i) => i).filter((i) => i !== groupColIdx && i !== valueColIdx);
  if (otherIdxs.length === 0) return null;

  return (
    <div className="dv-panel">
      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
        {tr("boxplot.steps.otherCols")}
      </p>
      <p
        style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-faint)", lineHeight: 1.4 }}
        dangerouslySetInnerHTML={{
          __html: ttHtml("boxplot.steps.otherColsDesc", { c: roleColors.filter }),
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {otherIdxs.map((i) => {
          const seen = new Set<string>();
          const u: string[] = [];
          rows.forEach((r) => {
            const v = r[i];
            if (!seen.has(v)) {
              seen.add(v);
              u.push(v);
            }
          });
          const pv = u.slice(0, 5).join(", ") + (u.length > 5 ? ` … (${u.length})` : "");
          const isFilter = colRoles[i] === "filter";
          return (
            <div
              key={`col-${i}`}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "6px 10px",
                background: "var(--surface)",
                borderRadius: 6,
                border: `1.5px solid ${isFilter ? roleColors.filter : "var(--border)"}`,
              }}
            >
              <span
                style={{ fontWeight: 700, color: "var(--text-muted)", minWidth: 20, fontSize: 11 }}
              >
                #{i + 1}
              </span>
              <input
                value={colNames[i]}
                onChange={(e) => onNameChange(i, e.target.value)}
                className="dv-input"
                style={{ width: 140, fontWeight: 600, fontSize: 12 }}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: isFilter ? roleColors.filter : "var(--text-muted)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isFilter}
                  onChange={(e) => onRoleChange(i, e.target.checked ? "filter" : "ignore")}
                  style={{ accentColor: roleColors.filter, cursor: "pointer" }}
                />
                {tr("boxplot.steps.filter")}
              </label>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={pv}
              >
                {pv}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UploadStep({
  sepOverride,
  onSepChange,
  rawText,
  doParse,
  handleFileLoad,
  handleTextPaste,
  setStep,
  onLoadExample,
}: UploadStepProps) {
  const tr = useT();
  const howto = useBoxplotHowTo();
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          onSepChange(v);
          if (rawText) {
            doParse(rawText, v);
            setStep("configure");
          }
        }}
        onFileLoad={handleFileLoad}
        onTextPaste={handleTextPaste}
        autoDetect
        onLoadExample={onLoadExample}
        exampleSummary={{
          title: tr("boxplot.steps.example.title"),
          subtitle: tr("boxplot.steps.example.subtitle"),
          buttonLabel: tr("boxplot.steps.example.button"),
        }}
        hint={tr("boxplot.steps.uploadHint")}
      />
      <HowTo {...howto} />
    </div>
  );
}

export function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  hasHeader,
  colRoles,
  colNames,
  valueColIdx,
  valueColIsNumeric,
  detectedSep,
  onRoleChange,
  onNameChange,
}: ConfigureStepProps) {
  const tr = useT();
  const groupColIdx = colRoles.indexOf("group");
  return (
    <div>
      {/* Primary role shortcuts — AesBox cards matching scatter's aesthetic
          selectors. Each picks the single column playing that role; the
          parent's `onRoleChange` handler automatically demotes the previous
          holder to "filter" when a new column is chosen. Every non-primary
          column is then handled by the compact `OtherColumnsPanel` below
          with a single filter/ignore toggle per row — no duplicate entry
          point for group / value here. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <BpAesBox theme="group">
          <select
            value={groupColIdx >= 0 ? groupColIdx : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return;
              onRoleChange(Number(raw), "group");
            }}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {groupColIdx < 0 && <option value="">{tr("boxplot.steps.chooseGroup")}</option>}
            {parsedHeaders.map((_: unknown, i: number) => (
              <option key={i} value={i}>
                {colNames[i]}
              </option>
            ))}
          </select>
          {groupColIdx >= 0 && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}
              title={tr("boxplot.steps.renameGroupTitle")}
            >
              <span style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                {tr("boxplot.steps.displayAs")}
              </span>
              <input
                value={colNames[groupColIdx]}
                onChange={(e) => onNameChange(groupColIdx, e.target.value)}
                className="dv-input"
                style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
              />
            </label>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("boxplot.steps.groupHint")}
          </div>
        </BpAesBox>
        <BpAesBox theme="value">
          <select
            value={valueColIdx >= 0 ? valueColIdx : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return;
              onRoleChange(Number(raw), "value");
            }}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {valueColIdx < 0 && <option value="">{tr("boxplot.steps.chooseValue")}</option>}
            {parsedHeaders.map((_: unknown, i: number) => (
              <option key={i} value={i}>
                {colNames[i]}
              </option>
            ))}
          </select>
          {valueColIdx >= 0 && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}
              title={tr("boxplot.steps.renameValueTitle")}
            >
              <span style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                {tr("boxplot.steps.displayAs")}
              </span>
              <input
                value={colNames[valueColIdx]}
                onChange={(e) => onNameChange(valueColIdx, e.target.value)}
                className="dv-input"
                style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
              />
            </label>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {tr("boxplot.steps.valueHint")}
          </div>
        </BpAesBox>
      </div>
      <OtherColumnsPanel
        headers={parsedHeaders}
        rows={parsedRows}
        colRoles={colRoles}
        colNames={colNames}
        onRoleChange={onRoleChange}
        onNameChange={onNameChange}
      />
      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div
          className="dv-panel"
          style={{
            background: "var(--danger-bg)",
            borderColor: "var(--danger-border)",
            marginBottom: 12,
          }}
        >
          <p
            style={{ fontSize: 12, color: "var(--danger-text)" }}
            dangerouslySetInnerHTML={{
              __html: ttHtml("boxplot.steps.nonNumericConfigure", { name: colNames[valueColIdx] }),
            }}
          />
        </div>
      )}
      {(colRoles.indexOf("group") < 0 || colRoles.indexOf("value") < 0) && (
        <div
          className="dv-panel"
          style={{
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            marginBottom: 12,
          }}
        >
          <p
            style={{ fontSize: 12, color: "var(--warning-text)" }}
            dangerouslySetInnerHTML={{
              __html: ttHtml("boxplot.steps.assignGroupValue", {
                gc: roleColors.group,
                vc: roleColors.value,
              }),
            }}
          />
        </div>
      )}
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> —{" "}
          {tr("boxplot.steps.colsRows", { cols: parsedHeaders.length, rows: parsedRows.length })}
          {hasHeader ? "" : tr("boxplot.steps.noHeader")}
          <DetectedSeparatorBadge sep={detectedSep} />
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          {tr("boxplot.steps.preview8")}
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>
    </div>
  );
}

export function FilterStep({
  parsedHeaders,
  parsedRows,
  colRoles,
  colNames,
  filters,
  filteredRows,
  renamedRows,
  activeColIdxs,
  valueRenames,
  orderableCols,
  applyRename,
  toggleFilter,
  toggleAllFilter,
  setRenameVal,
  dragState,
  setDragState,
}: FilterStepProps) {
  const tr = useT();
  // Feedback for filters whose effect falls past the first preview rows:
  // (1) live delta in the title ("N of M rows · K filtered out"), (2) a
  // brief 300 ms background flash on the preview card whenever the kept-
  // row count changes. The flashKey remount is the standard React idiom
  // for re-triggering a one-shot CSS animation; the DataPreview inside
  // is pure props-driven so remounting it each toggle has no cost.
  const [flashKey, setFlashKey] = React.useState(0);
  const prevKeptRef = React.useRef(filteredRows.length);
  React.useEffect(() => {
    if (prevKeptRef.current !== filteredRows.length) {
      prevKeptRef.current = filteredRows.length;
      setFlashKey((k: number) => k + 1);
    }
  }, [filteredRows.length]);

  const keptCount = filteredRows.length;
  const totalCount = parsedRows.length;
  const filteredOut = totalCount - keptCount;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        <FilterCheckboxPanel
          headers={parsedHeaders}
          colNames={colNames}
          colRoles={colRoles}
          filters={filters}
          filteredCount={filteredRows.length}
          totalCount={parsedRows.length}
          onToggle={toggleFilter}
          onToggleAll={toggleAllFilter}
        />
        <RenameReorderPanel
          headers={parsedHeaders}
          colNames={colNames}
          colRoles={colRoles}
          filters={filters}
          valueRenames={valueRenames}
          orderableCols={orderableCols}
          applyRename={applyRename}
          onRenameVal={setRenameVal}
          dragState={dragState}
          onDragStart={setDragState}
          onDragEnd={() => setDragState(null)}
        />
      </div>
      <div
        key={`preview-${flashKey}`}
        style={{
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          border: "1px solid var(--border)",
          background: "var(--surface-subtle)",
          animation: flashKey > 0 ? "bp-filter-flash 300ms ease-out" : undefined,
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          {tr("boxplot.steps.preview")} · <strong>{keptCount.toLocaleString()}</strong>{" "}
          {tr("boxplot.steps.previewOf", { total: totalCount.toLocaleString() })}
          {filteredOut > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--warning-text)" }}>
                <strong>{filteredOut.toLocaleString()}</strong> {tr("boxplot.steps.filteredOut")}
              </span>
            </>
          )}
        </p>
        <DataPreview
          headers={activeColIdxs.map((i: number) => colNames[i])}
          rows={renamedRows.map((r: string[]) => activeColIdxs.map((i: number) => r[i]))}
          maxRows={10}
        />
      </div>
      <style>{`
        @keyframes bp-filter-flash {
          0%   { background: var(--success-bg); }
          100% { background: var(--surface-subtle); }
        }
      `}</style>
    </div>
  );
}

export function OutputStep({
  colNames,
  groupColIdx,
  valueColIdx,
  valueColIsNumeric,
  stats,
  renamedRows,
  activeColIdxs,
  wideData,
  fileName,
}: OutputStepProps) {
  const tr = useT();
  return (
    <div>
      {groupColIdx >= 0 && valueColIdx >= 0 && stats.length > 0 && (
        <StatsTable stats={stats} groupLabel={colNames[groupColIdx]} />
      )}
      <div className="dv-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
            {tr("boxplot.steps.filteredLong")}
          </p>
          <button
            className="dv-btn dv-btn-dl"
            style={{ marginLeft: "auto", flexShrink: 0 }}
            onClick={(e) => {
              downloadCsv(
                activeColIdxs.map((i: number) => colNames[i]),
                renamedRows.map((r: string[]) => activeColIdxs.map((i: number) => r[i])),
                `${fileBaseName(fileName, "data")}_sanitized_long.csv`
              );
              flashSaved(e.currentTarget);
            }}
          >
            {tr("boxplot.steps.longCsv")}
          </button>
        </div>
        <DataPreview
          headers={activeColIdxs.map((i: number) => colNames[i])}
          rows={renamedRows.map((r: string[]) => activeColIdxs.map((i: number) => r[i]))}
          maxRows={6}
        />
      </div>
      {wideData && (
        <div className="dv-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              {tr("boxplot.steps.reshapedWide")}
            </p>
            <button
              className="dv-btn dv-btn-dl"
              style={{ marginLeft: "auto", flexShrink: 0 }}
              onClick={(e) => {
                downloadCsv(
                  wideData.headers,
                  wideData.rows,
                  `${fileBaseName(fileName, "data")}_sanitized_wide.csv`
                );
                flashSaved(e.currentTarget);
              }}
            >
              {tr("boxplot.steps.wideCsv")}
            </button>
          </div>
          {(wideData.unlabelled ?? 0) > 0 && (
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 11,
                color: "var(--warning-text)",
                fontStyle: "italic",
              }}
            >
              {tr(
                wideData.unlabelled === 1
                  ? "boxplot.steps.unlabelled.one"
                  : "boxplot.steps.unlabelled.other",
                { count: wideData.unlabelled ?? 0 }
              )}
            </p>
          )}
          <DataPreview headers={wideData.headers} rows={wideData.rows} maxRows={8} />
        </div>
      )}
      {(groupColIdx < 0 || valueColIdx < 0) && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p
            style={{ fontSize: 12, color: "var(--warning-text)" }}
            dangerouslySetInnerHTML={{ __html: tr("boxplot.steps.assignReshape") }}
          />
        </div>
      )}
      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div
          className="dv-panel"
          style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}
        >
          <p
            style={{ fontSize: 12, color: "var(--danger-text)" }}
            dangerouslySetInnerHTML={{
              __html: ttHtml("boxplot.steps.nonNumericOutput", { name: colNames[valueColIdx] }),
            }}
          />
        </div>
      )}
    </div>
  );
}

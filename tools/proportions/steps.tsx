// Step components for the Proportions tool: ConfigureStep (data layout, the
// columns of a one-row-per-observation file, then choose and order groups /
// categories) and PlotStep (workspace: tabbed controls, chart,
// statistics column).

import {
  ChartDataTable,
  ControlTabs,
  DataPreview,
  DetectedSeparatorBadge,
  DownloadTiles,
  DragHandle,
  RoleCard,
  SegToggle,
  WorkspaceLayout,
  useDragReorder,
} from "../_shell";
import type { ChartDataTableRow } from "../_shell";
import { fileBaseName } from "../_core/download";
import { formatPct, proportionsSummaryText } from "./helpers";
import type {
  ColorItem,
  ConfigureStepProps,
  DataLayout,
  LongRoles,
  OrderItem,
  OrderListProps,
  PlotStepProps,
} from "./helpers";
import { ChartTile, ColorsTile, StyleTile } from "./controls";
import { ProportionsChart } from "./chart";
import { GofPanel, ProportionsStatsDisplayBar, StatsPanel } from "./stats-panel";
import { useT } from "./i18n";

const { useMemo } = React;

function move(items: OrderItem[], from: number, to: number): OrderItem[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export function OrderList({ title, items, onChange, testIdPrefix }: OrderListProps) {
  const tr = useT();
  const btn: React.CSSProperties = { padding: "1px 7px", fontSize: 12, lineHeight: "18px" };
  const drag = useDragReorder((from, to) => onChange(move(items, from, to)));
  return (
    <div className="dv-panel" style={{ flex: "1 1 260px", minWidth: 0 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
        {title}
      </p>
      <ul ref={drag.listRef} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((it, i) => (
          <li
            key={it.name}
            data-reorder-index={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 0",
              borderBottom: "1px solid var(--border)",
              opacity: it.include ? 1 : 0.55,
              ...drag.rowStyle(i, items.length),
            }}
          >
            <DragHandle {...drag.handleProps(i)} />
            <input
              type="checkbox"
              checked={it.include}
              onChange={(e) =>
                onChange(items.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))
              }
              aria-label={tr("proportions.cfg.include", { name: it.name })}
              data-testid={`${testIdPrefix}-include-${i}`}
              style={{ accentColor: "var(--cta-primary-bg)", margin: 0 }}
            />
            <span style={{ flex: 1, fontSize: 12, color: "var(--text)", overflowWrap: "anywhere" }}>
              {it.name}
            </span>
            <button
              type="button"
              className="dv-btn dv-btn-secondary"
              style={btn}
              disabled={i === 0}
              onClick={() => onChange(move(items, i, i - 1))}
              aria-label={tr("proportions.cfg.up", { name: it.name })}
            >
              ↑
            </button>
            <button
              type="button"
              className="dv-btn dv-btn-secondary"
              style={btn}
              disabled={i === items.length - 1}
              onClick={() => onChange(move(items, i, i + 1))}
              aria-label={tr("proportions.cfg.down", { name: it.name })}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One column-role picker of the one-row-per-observation layout. Picking a
// column another role already uses swaps the two, so group and outcome never
// share a column.
function LongRolePicker({
  title,
  role,
  headers,
  roles,
  onChange,
}: {
  title: string;
  role: keyof LongRoles;
  headers: string[];
  roles: LongRoles;
  onChange: (roles: LongRoles) => void;
}) {
  const tr = useT();
  const current = roles[role];
  const pick = (v: number | null) => {
    const next: LongRoles = { ...roles, [role]: v };
    if (v !== null) {
      for (const other of ["group", "category", "count"] as const) {
        if (other !== role && roles[other] === v) {
          if (other === "count") next.count = null;
          else if (current !== null) next[other] = current;
        }
      }
    }
    onChange(next);
  };
  return (
    <RoleCard title={title}>
      <select
        aria-label={title}
        className="dv-select"
        style={{ width: "100%" }}
        value={current === null ? "" : String(current)}
        onChange={(e) => pick(e.target.value === "" ? null : Number(e.target.value))}
        data-testid={`proportions-role-${role}`}
      >
        {role === "count" && <option value="">{tr("proportions.cfg.countNone")}</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || tr("proportions.cfg.column", { n: i + 1 })}
          </option>
        ))}
      </select>
    </RoleCard>
  );
}

export function ConfigureStep({
  table,
  layout,
  onLayoutChange,
  countsError,
  headers,
  rows,
  longRoles,
  onLongRolesChange,
  skippedRows,
  fileName,
  detectedSep,
  blankCells,
  groupOrder,
  setGroupOrder,
  catOrder,
  setCatOrder,
  droppedGroups,
}: ConfigureStepProps) {
  const tr = useT();
  const nG = groupOrder.filter((g) => g.include).length;
  const nC = catOrder.filter((c) => c.include).length;
  return (
    <div>
      <div className="dv-panel" style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>
            {fileName || tr("proportions.cfg.pasted")}
          </strong>
          {tr("proportions.cfg.shape", {
            groups: table.groups.length,
            cats: table.categories.length,
          })}
          <DetectedSeparatorBadge sep={detectedSep} />
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>
          {tr("proportions.cfg.help")}
        </p>
      </div>
      <div className="dv-panel" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {tr("proportions.cfg.layout")}
          </span>
          <SegToggle<DataLayout>
            value={layout}
            onChange={onLayoutChange}
            ariaLabel={tr("proportions.cfg.layout")}
            style={{ flex: "0 0 auto", minWidth: 340 }}
            options={[
              {
                value: "counts",
                label: tr("proportions.cfg.layoutCounts"),
                disabled: countsError !== null,
                title:
                  countsError === null
                    ? undefined
                    : tr("proportions.cfg.notCounts", { reason: countsError }),
              },
              { value: "long", label: tr("proportions.cfg.layoutLong") },
            ]}
          />
        </div>
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "8px 0 0" }}>
          {layout === "counts" ? tr("proportions.cfg.countsHelp") : tr("proportions.cfg.longHelp")}
        </p>
      </div>
      {layout === "long" && longRoles && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <LongRolePicker
              title={tr("proportions.cfg.roleGroup")}
              role="group"
              headers={headers}
              roles={longRoles}
              onChange={onLongRolesChange}
            />
            <LongRolePicker
              title={tr("proportions.cfg.roleCategory")}
              role="category"
              headers={headers}
              roles={longRoles}
              onChange={onLongRolesChange}
            />
            <LongRolePicker
              title={tr("proportions.cfg.roleCount")}
              role="count"
              headers={headers}
              roles={longRoles}
              onChange={onLongRolesChange}
            />
          </div>
          <div className="dv-panel" style={{ marginBottom: 12 }}>
            <DataPreview headers={headers} rows={rows} maxRows={6} />
          </div>
        </>
      )}
      {layout === "long" && skippedRows > 0 && (
        <div
          className="dv-panel"
          role="status"
          style={{
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--warning-text)" }}>
            {tr("proportions.cfg.skipped", { count: skippedRows })}
          </p>
        </div>
      )}
      {layout === "counts" && blankCells > 0 && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--warning-text)" }}>
            {tr("proportions.cfg.blank", { count: blankCells })}
          </p>
        </div>
      )}
      {(nG < 2 || nC < 2 || droppedGroups.length > 0) && (
        <div
          className="dv-panel"
          role="status"
          style={{
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            marginBottom: 12,
          }}
        >
          {(nG < 2 || nC < 2) && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--warning-text)" }}>
              {tr("proportions.cfg.needTwo")}
            </p>
          )}
          {droppedGroups.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--warning-text)" }}>
              {tr("proportions.cfg.dropped", { names: droppedGroups.join(", ") })}
            </p>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <OrderList
          title={tr("proportions.cfg.groups")}
          items={groupOrder}
          onChange={setGroupOrder}
          testIdPrefix="proportions-group"
        />
        <OrderList
          title={tr("proportions.cfg.categories")}
          items={catOrder}
          onChange={setCatOrder}
          testIdPrefix="proportions-cat"
        />
      </div>
    </div>
  );
}

export function PlotStep({
  chartRef,
  selected,
  displayed,
  analysis,
  summaries,
  brackets,
  colors,
  groupColors,
  onGroupColor,
  onCategoryColor,
  onPaletteChange,
  focus,
  setFocus,
  focusLabel,
  control,
  setControl,
  vis,
  updVis,
  ratioText,
  setRatioText,
  fileName,
  onDownloadCsv,
  onDownloadReport,
  onDownloadR,
  onReset,
}: PlotStepProps) {
  const tr = useT();
  const shown = displayed;
  // Letters need ≥ 3 groups compared all-pairs; with two groups, or against
  // a control, the comparisons are brackets.
  const annotation =
    vis.annotation === "cld" && (shown.groups.length < 3 || analysis.control !== null)
      ? "brackets"
      : vis.annotation;

  const statsSummary = proportionsSummaryText(analysis, vis, tr);

  const colorItems: ColorItem[] =
    vis.chartType === "proportion"
      ? summaries.map((s, i) => ({ name: s.group, color: groupColors[i], n: s.n }))
      : shown.categories.map((c, j) => ({
          name: c,
          color: colors[j],
          n: shown.counts.reduce((a, row) => a + row[j], 0),
        }));

  const tableRows = useMemo<ChartDataTableRow[]>(
    () =>
      summaries.map((s) => ({
        header: s.group,
        cells: [
          String(s.n),
          ...s.counts.map(
            (x, c) =>
              `${x} (${formatPct(s.props[c].p)}; ${formatPct(s.props[c].lower)}–${formatPct(
                s.props[c].upper
              )})`
          ),
        ],
      })),
    [summaries]
  );

  return (
    <WorkspaceLayout
      controlsLabel={tr("proportions.controlsLabel")}
      inspectorLabel={tr("proportions.stats.title")}
      inspectorToggle="proportions"
      controls={
        <ControlTabs
          tool="proportions"
          tabs={[
            {
              id: "chart",
              label: tr("proportions.tab.chart"),
              content: (
                <>
                  <DownloadTiles
                    chartRef={chartRef}
                    fileStem={fileBaseName(fileName, "proportions")}
                    onReset={onReset}
                    extraDownloads={[
                      {
                        label: tr("proportions.dl.csv"),
                        title: tr("proportions.dl.csvTitle"),
                        onClick: onDownloadCsv,
                      },
                    ]}
                  />
                  <ChartTile
                    vis={vis}
                    updVis={updVis}
                    categories={selected.categories}
                    focus={focus}
                    setFocus={setFocus}
                  />
                </>
              ),
            },
            {
              id: "colors",
              label: tr("proportions.tab.colors"),
              content: (
                <ColorsTile
                  vis={vis}
                  updVis={updVis}
                  items={colorItems}
                  itemsLabel={
                    vis.chartType === "proportion"
                      ? tr("proportions.colors.groups")
                      : tr("proportions.colors.categories")
                  }
                  onColorChange={vis.chartType === "proportion" ? onGroupColor : onCategoryColor}
                  onPaletteChange={onPaletteChange}
                />
              ),
            },
            {
              id: "style",
              label: tr("proportions.tab.style"),
              content: <StyleTile vis={vis} updVis={updVis} />,
            },
          ]}
        />
      }
      toolbar={<ProportionsStatsDisplayBar analysis={analysis} vis={vis} updVis={updVis} />}
      figure={
        <>
          <div className="dv-plot-card" style={{ background: "var(--plot-card-bg)", padding: 16 }}>
            <ProportionsChart
              ref={chartRef}
              table={shown}
              statsSummary={statsSummary}
              chartType={vis.chartType}
              summaries={summaries}
              brackets={brackets}
              cld={analysis.cld}
              annotation={annotation}
              colors={colors}
              groupColors={groupColors}
              showCI={vis.showCI}
              showN={vis.showN}
              segmentLabels={vis.segmentLabels}
              barWidthFrac={vis.barWidthFrac}
              barOutline={vis.barOutline}
              barOutlineWidth={vis.barOutlineWidth}
              xLabelAngle={vis.xLabelAngle}
              plotWidth={vis.plotWidth}
              plotHeight={vis.plotHeight}
              tickFontSize={vis.tickFontSize}
              title={vis.plotTitle}
              yLabel={vis.yLabel}
              plotBg={vis.plotBg}
              showGrid={vis.showGrid}
              gridColor={vis.gridColor}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <ChartDataTable
              summaryLabel={tr("proportions.table.summary")}
              caption={tr("proportions.table.caption")}
              columnHeaders={[tr("proportions.stats.group"), "n", ...shown.categories]}
              rows={tableRows}
            />
          </div>
        </>
      }
      inspector={
        <StatsPanel
          analysis={analysis}
          control={control}
          setControl={setControl}
          categories={shown.categories}
          summaries={summaries}
          focusLabel={focusLabel}
          vis={vis}
          updVis={updVis}
          onDownloadReport={onDownloadReport}
          onDownloadR={onDownloadR}
          extra={<GofPanel table={shown} ratioText={ratioText} setRatioText={setRatioText} />}
        />
      }
    />
  );
}

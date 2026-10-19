// Step components for the Proportions tool: ConfigureStep (choose and
// order groups / categories) and PlotStep (sidebar + chart + statistics).

import { ChartDataTable, DetectedSeparatorBadge, DownloadTiles, PlotSidebar } from "../_shell";
import type { ChartDataTableRow } from "../_shell";
import { fileBaseName } from "../_core/download";
import { formatPct } from "./helpers";
import type {
  ColorItem,
  ConfigureStepProps,
  OrderItem,
  OrderListProps,
  PlotStepProps,
} from "./helpers";
import { ChartTile, ColorsTile, StyleTile } from "./controls";
import { ProportionsChart } from "./chart";
import { GofPanel, StatsPanel } from "./stats-panel";
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
  return (
    <div className="dv-panel" style={{ flex: "1 1 260px", minWidth: 0 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
        {title}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((it, i) => (
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

export function ConfigureStep({
  table,
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
      {blankCells > 0 && (
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
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <PlotSidebar>
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
        <StyleTile vis={vis} updVis={updVis} />
      </PlotSidebar>

      <div
        style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div
          style={{
            background: "var(--plot-card-bg)",
            border: "1.5px solid var(--plot-card-border)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <ProportionsChart
            ref={chartRef}
            table={shown}
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
        />
        <GofPanel table={shown} ratioText={ratioText} setRatioText={setRatioText} />
        <ChartDataTable
          summaryLabel={tr("proportions.table.summary")}
          caption={tr("proportions.table.caption")}
          columnHeaders={[tr("proportions.stats.group"), "n", ...shown.categories]}
          rows={tableRows}
        />
      </div>
    </div>
  );
}

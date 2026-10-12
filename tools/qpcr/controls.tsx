// Sidebar tiles for the qPCR tool: Chart (y scale, bars/dots, points, CI),
// Colours (palette + per-group colours), Style.

import {
  BaseStyleControls,
  ColorInput,
  ControlSection,
  DiscretePaletteRow,
  OnOffToggle,
  SegToggle,
  SliderControl,
} from "../_shell";
import type { ColorsTileProps, QpcrChartStyle, TileProps, YScale } from "./helpers";
import { useT } from "./i18n";

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export function ChartTile({ vis, updVis }: TileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("qpcr.tile.chart")} defaultOpen>
      <Field label={tr("qpcr.chart.yScale")}>
        <SegToggle<YScale>
          value={vis.yScale}
          onChange={(v) => updVis({ yScale: v })}
          ariaLabel={tr("qpcr.chart.yScale")}
          options={[
            {
              value: "log2",
              label: tr("qpcr.chart.scaleLog2"),
              title: tr("qpcr.chart.scaleLog2Title"),
            },
            {
              value: "linear",
              label: tr("qpcr.chart.scaleLinear"),
              title: tr("qpcr.chart.scaleLinearTitle"),
            },
            { value: "ddct", label: "−ΔΔCt", title: tr("qpcr.chart.scaleDdctTitle") },
          ]}
        />
      </Field>
      <Field label={tr("qpcr.chart.style")}>
        <SegToggle<QpcrChartStyle>
          value={vis.chartStyle}
          onChange={(v) => updVis({ chartStyle: v })}
          ariaLabel={tr("qpcr.chart.style")}
          options={[
            { value: "bar", label: tr("qpcr.chart.bar") },
            { value: "dot", label: tr("qpcr.chart.dot") },
          ]}
        />
      </Field>
      <Field label={tr("qpcr.chart.points")}>
        <OnOffToggle
          value={vis.showPoints}
          onChange={(v) => updVis({ showPoints: v })}
          ariaLabel={tr("qpcr.chart.points")}
        />
      </Field>
      <Field label={tr("qpcr.chart.ci")}>
        <OnOffToggle
          value={vis.showCI}
          onChange={(v) => updVis({ showCI: v })}
          ariaLabel={tr("qpcr.chart.ci")}
        />
      </Field>
    </ControlSection>
  );
}

export function ColorsTile({
  vis,
  updVis,
  items,
  onColorChange,
  onPaletteChange,
}: ColorsTileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("qpcr.tile.colors")} defaultOpen>
      <DiscretePaletteRow
        value={vis.discretePalette}
        onChange={(v) => {
          updVis({ discretePalette: v });
          onPaletteChange();
        }}
        names={items.map((it) => it.name)}
      />
      <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 4px" }}>
        {tr("qpcr.colors.groups")}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
        data-testid="qpcr-color-list"
      >
        {items.map((it) => (
          <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ColorInput
              value={it.color}
              onChange={(c) => onColorChange(it.name, c)}
              size={18}
              label={it.name}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 11,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={it.name}
            >
              {it.name}
            </span>
          </div>
        ))}
      </div>
    </ControlSection>
  );
}

export function StyleTile({ vis, updVis }: TileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("qpcr.tile.style")}>
      <SliderControl
        label={tr("qpcr.style.facetWidth")}
        value={vis.facetWidth}
        displayValue={`${Math.round(vis.facetWidth)} px`}
        min={140}
        max={700}
        step={10}
        onChange={(v) => updVis({ facetWidth: Number(v) })}
      />
      <SliderControl
        label={tr("qpcr.style.facetHeight")}
        value={vis.facetHeight}
        displayValue={`${Math.round(vis.facetHeight)} px`}
        min={140}
        max={600}
        step={10}
        onChange={(v) => updVis({ facetHeight: Number(v) })}
      />
      <SliderControl
        label={tr("qpcr.style.facetCols")}
        value={vis.facetCols}
        displayValue={String(vis.facetCols)}
        min={1}
        max={6}
        step={1}
        onChange={(v) => updVis({ facetCols: Number(v) })}
      />
      {vis.chartStyle === "bar" && (
        <SliderControl
          label={tr("qpcr.style.barWidth")}
          value={vis.barWidthFrac}
          displayValue={`${Math.round(vis.barWidthFrac * 100)} %`}
          min={0.2}
          max={0.95}
          step={0.05}
          onChange={(v) => updVis({ barWidthFrac: Number(v) })}
        />
      )}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          {tr("qpcr.style.outline")}
        </div>
        <OnOffToggle
          value={vis.barOutline}
          onChange={(v) => updVis({ barOutline: v })}
          ariaLabel={tr("qpcr.style.outline")}
        />
      </div>
      {vis.barOutline && (
        <SliderControl
          label={tr("qpcr.style.outlineWidth")}
          value={vis.barOutlineWidth}
          displayValue={`${vis.barOutlineWidth.toFixed(2)} px`}
          min={0.25}
          max={4}
          step={0.25}
          onChange={(v) => updVis({ barOutlineWidth: Number(v) })}
        />
      )}
      <SliderControl
        label={tr("qpcr.style.labelAngle")}
        value={vis.xLabelAngle}
        displayValue={vis.xLabelAngle + "°"}
        min={-90}
        max={0}
        step={5}
        onChange={(v) => updVis({ xLabelAngle: Number(v) })}
      />
      <SliderControl
        label={tr("qpcr.style.font")}
        value={vis.tickFontSize}
        displayValue={`${vis.tickFontSize} px`}
        min={9}
        max={22}
        step={1}
        onChange={(v) => updVis({ tickFontSize: Number(v) })}
      />
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        {tr("qpcr.style.title")}
        <input
          type="text"
          className="dv-input"
          value={vis.plotTitle}
          onChange={(e) => updVis({ plotTitle: e.target.value })}
          placeholder={tr("qpcr.style.optional")}
        />
      </label>
      <div style={{ marginTop: 10 }}>
        <BaseStyleControls
          plotBg={vis.plotBg}
          onPlotBgChange={(v) => updVis({ plotBg: v })}
          showGrid={vis.showGrid}
          onShowGridChange={(v) => updVis({ showGrid: v })}
          gridColor={vis.gridColor}
          onGridColorChange={(v) => updVis({ gridColor: v })}
        />
      </div>
    </ControlSection>
  );
}

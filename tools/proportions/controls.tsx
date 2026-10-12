// Sidebar tiles for the Proportions tool: Chart (type, focus category,
// CI / n / segment labels), Colours, Style. The significance display
// (off / letters / brackets) lives in the statistics panel, as in the
// other tools.

import {
  BaseStyleControls,
  ColorInput,
  ControlSection,
  DiscretePaletteRow,
  OnOffToggle,
  SegToggle,
  SliderControl,
} from "../_shell";
import type {
  ChartTileProps,
  ChartType,
  ColorsTileProps,
  SegmentLabelMode,
  TileProps,
} from "./helpers";
import { useT } from "./i18n";

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export function ChartTile({ vis, updVis, categories, focus, setFocus }: ChartTileProps) {
  const tr = useT();
  const isProp = vis.chartType === "proportion";
  return (
    <ControlSection title={tr("proportions.tile.chart")} defaultOpen>
      <Field label={tr("proportions.chart.type")}>
        <SegToggle<ChartType>
          value={vis.chartType}
          onChange={(v) => updVis({ chartType: v })}
          ariaLabel={tr("proportions.chart.type")}
          options={[
            {
              value: "proportion",
              label: tr("proportions.chart.typeProp"),
              title: tr("proportions.chart.typePropTitle"),
            },
            {
              value: "stacked",
              label: tr("proportions.chart.typeStacked"),
              title: tr("proportions.chart.typeStackedTitle"),
            },
            {
              value: "mosaic",
              label: tr("proportions.chart.typeMosaic"),
              title: tr("proportions.chart.typeMosaicTitle"),
            },
          ]}
        />
      </Field>
      {isProp && (
        <Field label={tr("proportions.chart.focus")}>
          <select
            className="dv-select"
            style={{ width: "100%" }}
            value={focus}
            onChange={(e) => setFocus(Number(e.target.value))}
            aria-label={tr("proportions.chart.focus")}
            data-testid="proportions-focus"
          >
            {categories.map((c, i) => (
              <option key={c} value={i}>
                {c}
              </option>
            ))}
          </select>
          {categories.length > 2 && (
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
              {tr("proportions.chart.focusNote")}
            </div>
          )}
        </Field>
      )}
      {isProp && (
        <Field label={tr("proportions.chart.ci")}>
          <OnOffToggle
            value={vis.showCI}
            onChange={(v) => updVis({ showCI: v })}
            ariaLabel={tr("proportions.chart.ci")}
          />
        </Field>
      )}
      {!isProp && (
        <Field label={tr("proportions.chart.segLabels")}>
          <SegToggle<SegmentLabelMode>
            value={vis.segmentLabels}
            onChange={(v) => updVis({ segmentLabels: v })}
            ariaLabel={tr("proportions.chart.segLabels")}
            options={[
              { value: "none", label: tr("proportions.chart.segNone") },
              { value: "percent", label: "%" },
              { value: "count", label: tr("proportions.chart.segCount") },
            ]}
          />
        </Field>
      )}
      <Field label={tr("proportions.chart.showN")}>
        <OnOffToggle
          value={vis.showN}
          onChange={(v) => updVis({ showN: v })}
          ariaLabel={tr("proportions.chart.showN")}
        />
      </Field>
    </ControlSection>
  );
}

export function ColorsTile({
  vis,
  updVis,
  items,
  itemsLabel,
  onColorChange,
  onPaletteChange,
}: ColorsTileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("proportions.tile.colors")} defaultOpen>
      <DiscretePaletteRow
        value={vis.discretePalette}
        onChange={(v) => {
          updVis({ discretePalette: v });
          onPaletteChange(v);
        }}
        names={items.map((it) => it.name)}
      />
      <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 4px" }}>
        {itemsLabel}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
        data-testid="proportions-color-list"
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
            <span style={{ fontSize: 10, color: "var(--text-faint)", flexShrink: 0 }}>
              n={it.n}
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
    <ControlSection title={tr("proportions.tile.style")}>
      <SliderControl
        label={tr("proportions.style.width")}
        value={vis.plotWidth}
        displayValue={`${Math.round(vis.plotWidth)} px`}
        min={200}
        max={1200}
        step={20}
        onChange={(v) => updVis({ plotWidth: Number(v) })}
      />
      <SliderControl
        label={tr("proportions.style.height")}
        value={vis.plotHeight}
        displayValue={`${Math.round(vis.plotHeight)} px`}
        min={160}
        max={800}
        step={20}
        onChange={(v) => updVis({ plotHeight: Number(v) })}
      />
      {vis.chartType !== "mosaic" && (
        <SliderControl
          label={tr("proportions.style.barWidth")}
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
          {tr("proportions.style.outline")}
        </div>
        <OnOffToggle
          value={vis.barOutline}
          onChange={(v) => updVis({ barOutline: v })}
          ariaLabel={tr("proportions.style.outline")}
        />
      </div>
      {vis.barOutline && (
        <SliderControl
          label={tr("proportions.style.outlineWidth")}
          value={vis.barOutlineWidth}
          displayValue={`${vis.barOutlineWidth.toFixed(2)} px`}
          min={0.25}
          max={4}
          step={0.25}
          onChange={(v) => updVis({ barOutlineWidth: Number(v) })}
        />
      )}
      <SliderControl
        label={tr("proportions.style.labelAngle")}
        value={vis.xLabelAngle}
        displayValue={vis.xLabelAngle + "°"}
        min={-90}
        max={0}
        step={5}
        onChange={(v) => updVis({ xLabelAngle: Number(v) })}
      />
      <SliderControl
        label={tr("proportions.style.font")}
        value={vis.tickFontSize}
        displayValue={`${vis.tickFontSize} px`}
        min={9}
        max={22}
        step={1}
        onChange={(v) => updVis({ tickFontSize: Number(v) })}
      />
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        {tr("proportions.style.title")}
        <input
          type="text"
          className="dv-input"
          value={vis.plotTitle}
          onChange={(e) => updVis({ plotTitle: e.target.value })}
          placeholder={tr("proportions.style.optional")}
        />
      </label>
      <label
        style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginTop: 8 }}
      >
        {tr("proportions.style.yLabel")}
        <input
          type="text"
          className="dv-input"
          value={vis.yLabel}
          onChange={(e) => updVis({ yLabel: e.target.value })}
          placeholder={tr("proportions.style.auto")}
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

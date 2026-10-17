// Sidebar tiles for the qPCR tool, named like Group Plot's: Chart (what is
// plotted: y scale, bars / dots / boxes, orientation, error bars,
// calibrator column), Colours, then folded fine-tuning — Shape & fill,
// Data points, Axes & labels, Layout & background.

import {
  BarStyleIcon,
  BaseStyleControls,
  BoxStyleIcon,
  ColorInput,
  ControlSection,
  DiscretePaletteRow,
  DotStyleIcon,
  OnOffToggle,
  PlotStyleIconPicker,
  SegToggle,
  SliderControl,
} from "../_shell";
import { parseAxisBound } from "./helpers";
import type {
  ChartTileProps,
  ColorsTileProps,
  ErrorBarType,
  QpcrChartStyle,
  TileProps,
  YScale,
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

const note: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-faint)",
  marginTop: 4,
  lineHeight: 1.4,
};

export function ChartTile({ vis, updVis, normalize }: ChartTileProps) {
  const tr = useT();
  const rel = normalize === "refs";
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
              label: tr(rel ? "qpcr.chart.scaleLog2Rel" : "qpcr.chart.scaleLog2"),
              title: tr(rel ? "qpcr.chart.scaleLog2RelTitle" : "qpcr.chart.scaleLog2Title"),
            },
            {
              value: "linear",
              label: tr(rel ? "qpcr.chart.scaleLinearRel" : "qpcr.chart.scaleLinear"),
              title: tr(rel ? "qpcr.chart.scaleLinearRelTitle" : "qpcr.chart.scaleLinearTitle"),
            },
            {
              value: "ddct",
              label: rel ? "−ΔCt" : "−ΔΔCt",
              title: tr(rel ? "qpcr.chart.scaleDctTitle" : "qpcr.chart.scaleDdctTitle"),
            },
          ]}
        />
      </Field>
      <Field label={tr("qpcr.chart.style")}>
        <PlotStyleIconPicker<QpcrChartStyle>
          value={vis.chartStyle}
          onChange={(v) => updVis({ chartStyle: v })}
          ariaLabel={tr("qpcr.chart.style")}
          options={[
            { value: "bar", label: tr("qpcr.chart.bar"), icon: <BarStyleIcon /> },
            { value: "dot", label: tr("qpcr.chart.dot"), icon: <DotStyleIcon /> },
            {
              value: "box",
              label: tr("qpcr.chart.box"),
              icon: <BoxStyleIcon />,
              title: tr("qpcr.chart.boxTitle"),
            },
          ]}
        />
      </Field>
      <Field label={tr("qpcr.chart.orientation")}>
        <SegToggle<"v" | "h">
          value={vis.horizontal ? "h" : "v"}
          onChange={(v) => updVis({ horizontal: v === "h" })}
          ariaLabel={tr("qpcr.chart.orientation")}
          options={[
            { value: "v", label: tr("qpcr.chart.vertical") },
            { value: "h", label: tr("qpcr.chart.horizontal") },
          ]}
        />
      </Field>
      {vis.chartStyle !== "box" && (
        <Field label={tr("qpcr.chart.errorBars")}>
          <SegToggle<ErrorBarType>
            value={vis.errorBar}
            onChange={(v) => updVis({ errorBar: v })}
            ariaLabel={tr("qpcr.chart.errorBars")}
            options={[
              { value: "none", label: tr("qpcr.chart.errNone") },
              { value: "sem", label: "SEM" },
              { value: "sd", label: "SD" },
              { value: "ci95", label: tr("qpcr.chart.errCi") },
            ]}
          />
          <div style={note}>{tr("qpcr.chart.errorBarsNote")}</div>
        </Field>
      )}
      {normalize === "control" && (
        <Field label={tr("qpcr.chart.showCalibrator")}>
          <OnOffToggle
            value={vis.showCalibrator}
            onChange={(v) => updVis({ showCalibrator: v })}
            ariaLabel={tr("qpcr.chart.showCalibrator")}
          />
          {!vis.showCalibrator && <div style={note}>{tr("qpcr.chart.calibratorHiddenNote")}</div>}
        </Field>
      )}
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

export function ShapeFillTile({ vis, updVis }: TileProps) {
  const tr = useT();
  // One slider for the outline: 0 = no outline (keeps the last thickness).
  const outline = vis.barOutline ? vis.barOutlineWidth : 0;
  return (
    <ControlSection title={tr("qpcr.tile.shapeFill")}>
      {vis.chartStyle !== "dot" && (
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
      <SliderControl
        label={tr("qpcr.style.fillOpacity")}
        value={vis.fillOpacity}
        displayValue={vis.fillOpacity.toFixed(2)}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => updVis({ fillOpacity: Number(v) })}
      />
      <SliderControl
        label={tr("qpcr.style.outline")}
        value={outline}
        displayValue={outline === 0 ? tr("qpcr.style.off") : `${outline.toFixed(2)} px`}
        min={0}
        max={4}
        step={0.25}
        onChange={(v) => {
          const w = Number(v);
          updVis(w > 0 ? { barOutline: true, barOutlineWidth: w } : { barOutline: false });
        }}
      />
    </ControlSection>
  );
}

export function DataPointsTile({ vis, updVis }: TileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("qpcr.tile.dataPoints")}>
      <Field label={tr("qpcr.chart.points")}>
        <OnOffToggle
          value={vis.showPoints}
          onChange={(v) => updVis({ showPoints: v })}
          ariaLabel={tr("qpcr.chart.points")}
        />
      </Field>
      {vis.showPoints && (
        <>
          <SliderControl
            label={tr("qpcr.style.pointSize")}
            value={vis.pointSize}
            displayValue={`${vis.pointSize.toFixed(1)} px`}
            min={1}
            max={8}
            step={0.2}
            onChange={(v) => updVis({ pointSize: Number(v) })}
          />
          <SliderControl
            label={tr("qpcr.style.jitter")}
            value={vis.jitterWidth}
            displayValue={`${Math.round(vis.jitterWidth * 100)} %`}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => updVis({ jitterWidth: Number(v) })}
          />
        </>
      )}
    </ControlSection>
  );
}

export function AxesLabelsTile({ vis, updVis, normalize }: ChartTileProps) {
  const tr = useT();
  const rel = normalize === "refs";
  // Range inputs are typed in the units the tick labels show.
  const rangeUnits =
    vis.yScale === "ddct"
      ? rel
        ? "−ΔCt"
        : "−ΔΔCt"
      : tr(rel ? "qpcr.chart.rangeUnitsRel" : "qpcr.chart.rangeUnitsFc");
  const badBound = (t: string): boolean =>
    t.trim() !== "" && parseAxisBound(t, vis.yScale) === null;
  const lo = parseAxisBound(vis.yMin, vis.yScale);
  const hi = parseAxisBound(vis.yMax, vis.yScale);
  const rangeWarning =
    badBound(vis.yMin) || badBound(vis.yMax)
      ? tr(vis.yScale === "log2" ? "qpcr.chart.rangeBadLog" : "qpcr.chart.rangeBad")
      : lo !== null && hi !== null && lo >= hi
        ? tr("qpcr.chart.rangeInverted")
        : null;
  return (
    <ControlSection title={tr("qpcr.tile.axesLabels")}>
      <Field label={tr("qpcr.chart.range", { units: rangeUnits })}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            className="dv-input"
            style={{ flex: 1, minWidth: 0 }}
            value={vis.yMin}
            onChange={(e) => updVis({ yMin: e.target.value })}
            placeholder={tr("qpcr.chart.rangeMin")}
            aria-label={tr("qpcr.chart.rangeMin")}
            data-testid="qpcr-ymin"
          />
          <input
            type="text"
            className="dv-input"
            style={{ flex: 1, minWidth: 0 }}
            value={vis.yMax}
            onChange={(e) => updVis({ yMax: e.target.value })}
            placeholder={tr("qpcr.chart.rangeMax")}
            aria-label={tr("qpcr.chart.rangeMax")}
            data-testid="qpcr-ymax"
          />
        </div>
        <div style={rangeWarning ? { ...note, color: "var(--warning-text)" } : note}>
          {rangeWarning ?? tr("qpcr.chart.rangeNote")}
        </div>
      </Field>
      <Field label={tr("qpcr.chart.yTitle")}>
        <input
          type="text"
          className="dv-input"
          style={{ width: "100%" }}
          value={vis.yLabel}
          onChange={(e) => updVis({ yLabel: e.target.value })}
          placeholder={tr("qpcr.chart.yTitleAuto")}
          aria-label={tr("qpcr.chart.yTitle")}
          data-testid="qpcr-ylabel"
        />
      </Field>
      <Field label={tr("qpcr.style.title")}>
        <input
          type="text"
          className="dv-input"
          style={{ width: "100%" }}
          value={vis.plotTitle}
          onChange={(e) => updVis({ plotTitle: e.target.value })}
          placeholder={tr("qpcr.style.optional")}
          aria-label={tr("qpcr.style.title")}
        />
      </Field>
      <SliderControl
        label={tr("qpcr.style.font")}
        value={vis.tickFontSize}
        displayValue={`${vis.tickFontSize} px`}
        min={9}
        max={22}
        step={1}
        onChange={(v) => updVis({ tickFontSize: Number(v) })}
      />
      {!vis.horizontal && (
        <SliderControl
          label={tr("qpcr.style.labelAngle")}
          value={vis.xLabelAngle}
          displayValue={vis.xLabelAngle + "°"}
          min={-90}
          max={0}
          step={5}
          onChange={(v) => updVis({ xLabelAngle: Number(v) })}
        />
      )}
    </ControlSection>
  );
}

export function LayoutTile({ vis, updVis }: TileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("qpcr.tile.layout")}>
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

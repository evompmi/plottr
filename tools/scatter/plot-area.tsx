// scatter/plot-area.tsx — PlotStep: composes the file-info line, the
// sidebar (controls.tsx), the chart and the per-set stats panel.

import { ScatterChart } from "./chart";
import { PlotStepProps } from "./helpers";
import { ScatterStatsPanel } from "./stats-panel";
import { DetectedSeparatorBadge } from "../_shell";
import { useT } from "./i18n";
import { PlotControls } from "./controls";
import { WorkspaceLayout } from "../_shell";

export function PlotStep(props: PlotStepProps) {
  const {
    parsed,
    fileName,
    detectedSep,
    filteredData,
    filteredRawRows,
    xCol,
    yCol,
    pointColor,
    pointSize,
    pointOpacity,
    strokeColor,
    strokeWidth,
    colorMapCol,
    colorMapType,
    colorMapPalette,
    colorMapDiscrete,
    colorMapRange,
    sizeMapCol,
    sizeMapType,
    sizeMapMin,
    sizeMapMax,
    sizeMapDiscrete,
    sizeMapRange,
    shapeMapCol,
    shapeMapDiscrete,
    vis,
    effAxis,
    refLines,
    regression,
    regressionStats,
    svgRef,
    svgLegend,
    statsSets,
    fileStem,
  } = props;
  const tr = useT();

  return (
    <WorkspaceLayout
      controlsLabel={tr("scatter.controlsLabel")}
      inspectorLabel={tr("scatter.statsLabel")}
      controls={<PlotControls {...props} />}
      toolbar={
        // Scatter skips the configure step, so the file summary (rows, columns,
        // detected separator) sits above the plot here.
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          {tr("scatter.loaded")}
          <strong style={{ color: "var(--text)" }}>{fileName || tr("scatter.pastedData")}</strong>
          {tr("scatter.colsRows", {
            rows: parsed.rawData.length,
            cols: parsed.headers.length,
          })}
          <DetectedSeparatorBadge sep={detectedSep} />
        </p>
      }
      figure={
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          <ScatterChart
            ref={svgRef}
            data={filteredData}
            rawData={filteredRawRows}
            xCol={xCol}
            yCol={yCol}
            xMin={effAxis.xMin}
            xMax={effAxis.xMax}
            yMin={effAxis.yMin}
            yMax={effAxis.yMax}
            xLabel={vis.xLabel}
            yLabel={vis.yLabel}
            title={vis.plotTitle}
            plotBg={vis.plotBg}
            showGrid={vis.showGrid}
            gridColor={vis.gridColor}
            tickFontSize={vis.tickFontSize}
            refLines={refLines}
            regression={regression}
            regressionStats={regressionStats}
            pointColor={pointColor}
            pointSize={pointSize}
            pointOpacity={pointOpacity}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            colorMapCol={colorMapCol}
            colorMapType={colorMapType}
            colorMapPalette={colorMapPalette}
            colorMapDiscrete={colorMapDiscrete}
            colorMapRange={colorMapRange}
            sizeMapCol={sizeMapCol}
            sizeMapType={sizeMapType}
            sizeMapMin={sizeMapMin}
            sizeMapMax={sizeMapMax}
            sizeMapDiscrete={sizeMapDiscrete}
            sizeMapRange={sizeMapRange}
            shapeMapCol={shapeMapCol}
            shapeMapDiscrete={shapeMapDiscrete}
            svgLegend={svgLegend}
          />
        </div>
      }
      inspector={
        statsSets.length > 0 ? (
          <ScatterStatsPanel
            sets={statsSets}
            fileStem={fileStem}
            xLabel={vis.xLabel || parsed.headers[xCol] || "x"}
            yLabel={vis.yLabel || parsed.headers[yCol] || "y"}
            regressionOn={regression.on}
          />
        ) : null
      }
    />
  );
}

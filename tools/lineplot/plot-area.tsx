// lineplot/plot-area.tsx — the plot step's workspace: tabbed controls, the
// chart (with the stars toggle above it) and the per-x statistics column.

import { Chart } from "./chart";
import { LineplotStatsDisplayBar, PerXStatsPanel } from "./stats-panel";
import { WorkspaceLayout } from "../_shell";
import { useT } from "./i18n";
import { PlotControls } from "./controls";
import type { PlotStepProps } from "./helpers";

export function PlotStep(props: PlotStepProps) {
  const {
    parsed,
    fileName,
    series,
    statsRows,
    xCol,
    yCol,
    groupCol: _groupCol,
    vis,
    autoAxis: _autoAxis,
    effAxis,
    errorType,
    showStars,
    setShowStars,
    svgRef,
    svgLegend,
  } = props;
  const tr = useT();

  const vbW = 700;
  const vbH = 440;
  const xLabelForStats = vis.xLabel || (parsed ? parsed.headers[xCol] : "x");

  return (
    <WorkspaceLayout
      controlsLabel={tr("lineplot.controlsLabel")}
      inspectorLabel={tr("lineplot.sp.inspectorLabel")}
      controls={<PlotControls {...props} />}
      toolbar={
        statsRows.length > 0 ? (
          <LineplotStatsDisplayBar showStars={showStars} setShowStars={setShowStars} />
        ) : null
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
          {series.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "40px 0",
                textAlign: "center",
                color: "var(--text-faint)",
                fontSize: 13,
              }}
            >
              No data to plot. Check your column picks — X and Y must be numeric.
            </p>
          ) : (
            <Chart
              ref={svgRef}
              series={series}
              perXStats={statsRows}
              xMin={effAxis.xMin}
              xMax={effAxis.xMax}
              yMin={effAxis.yMin}
              yMax={effAxis.yMax}
              vbW={vbW}
              vbH={vbH}
              xLabel={vis.xLabel || parsed.headers[xCol]}
              yLabel={vis.yLabel || parsed.headers[yCol]}
              plotTitle={vis.plotTitle}
              plotSubtitle={vis.plotSubtitle}
              plotBg={vis.plotBg}
              showGrid={vis.showGrid}
              gridColor={vis.gridColor}
              lineWidth={vis.lineWidth}
              pointRadius={vis.pointRadius}
              errorStrokeWidth={vis.errorStrokeWidth}
              errorCapWidth={vis.errorCapWidth}
              tickFontSize={vis.tickFontSize}
              errorType={errorType}
              svgLegend={svgLegend}
              showStars={showStars}
            />
          )}
        </div>
      }
      inspector={
        statsRows.length > 0 ? (
          <PerXStatsPanel
            rows={statsRows}
            xLabel={xLabelForStats}
            fileName={fileName}
            displayKind={errorType}
          />
        ) : null
      }
    />
  );
}

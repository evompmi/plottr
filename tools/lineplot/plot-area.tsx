// lineplot/plot-area.tsx — composes the chart + per-x stats panel under
// the sidebar. Owns the SVG-legend computation that the chart needs.

import { Chart } from "./chart";
import { PerXStatsPanel } from "./stats-panel";
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

  const vbW = 700;
  const vbH = 440;
  const xLabelForStats = vis.xLabel || (parsed ? parsed.headers[xCol] : "x");

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* LEFT: controls */}
      <PlotControls {...props} />

      {/* RIGHT: chart + per-x stats */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
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
              errorType={errorType}
              svgLegend={svgLegend}
              showStars={showStars}
            />
          )}
        </div>

        {statsRows.length > 0 && (
          <PerXStatsPanel
            rows={statsRows}
            xLabel={xLabelForStats}
            fileName={fileName}
            showStars={showStars}
            setShowStars={setShowStars}
          />
        )}
      </div>
    </div>
  );
}

// venn/plot-area.tsx — the right-hand panel of the Plot step: VennChart on
// top, the proportionality-accuracy banner under it, and the Intersections
// table + Items list under that. The chart itself is in chart.tsx; this file
// just composes the chart with the data-extraction panels.

import { VennChart } from "./chart";
import { regionLabel, regionFilenamePart } from "./helpers";

const { useState } = React;

export function IntersectionTable({ intersections, allSetNames, selectedMask, onSelect }: any) {
  const [hoveredMask, setHoveredMask] = useState<number | null>(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd" }}>
            <th
              style={{
                padding: "6px 10px",
                textAlign: "left",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Region
            </th>
            <th
              style={{
                padding: "6px 10px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Degree
            </th>
            <th
              style={{
                padding: "6px 10px",
                textAlign: "right",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {intersections.map((inter: any) => (
            <tr
              key={inter.mask}
              onClick={() => onSelect(inter.mask)}
              onMouseEnter={() => setHoveredMask(inter.mask)}
              onMouseLeave={() => setHoveredMask((m) => (m === inter.mask ? null : m))}
              style={{
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background:
                  selectedMask === inter.mask
                    ? "var(--row-hover-bg)"
                    : hoveredMask === inter.mask
                      ? "var(--surface-subtle)"
                      : "transparent",
                transition: "background 120ms ease",
              }}
            >
              <td style={{ padding: "6px 10px", color: "var(--text)", fontWeight: 500 }}>
                {regionLabel(inter.setNames, inter.mask, allSetNames)}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-faint)" }}>
                {inter.degree}
              </td>
              <td
                style={{
                  padding: "6px 10px",
                  textAlign: "right",
                  color: "var(--accent-primary)",
                  fontWeight: 700,
                  fontFamily: "monospace",
                }}
              >
                {inter.size}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemListPanel({ intersection, allSetNames, fileName }: any) {
  const baseName = fileBaseName(fileName, "venn");
  if (!intersection)
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        Click a region in the Venn diagram or a row in the table to view items.
      </div>
    );
  const label = regionLabel(intersection.setNames, intersection.mask, allSetNames);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {label}{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            ({intersection.size} items)
          </span>
        </p>
        <button
          onClick={() => {
            downloadCsv(
              ["Item"],
              intersection.items.map((i: string) => [i]),
              `${baseName}_venn_${regionFilenamePart(label)}.csv`
            );
          }}
          className="dv-btn dv-btn-secondary"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success-text)",
            fontWeight: 600,
            fontSize: 11,
            marginLeft: "auto",
            flexShrink: 0,
          }}
        >
          ⬇ CSV
        </button>
      </div>
      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--surface-subtle)",
        }}
      >
        {intersection.items.map((item: string, i: number) => (
          <div
            key={i}
            style={{
              padding: "3px 10px",
              fontSize: 12,
              color: "var(--text)",
              borderBottom: "1px solid var(--border)",
              fontFamily: "monospace",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// Layout-quality banner. When proportional mode is on, surface the
// max/mean region error so the user knows when the diagram doesn't quite
// hit the target areas (triangle inequality violations, drastic size
// ratios, …) — and when it does, confirm with a green pill.
export function LayoutInfoBanner({
  proportional,
  layoutInfo,
}: {
  proportional: boolean;
  layoutInfo: { warnings: string[]; proportional: boolean; maxError: number; meanError: number };
}) {
  if (!proportional) return null;
  const pctMax = (layoutInfo.maxError * 100).toFixed(1);
  const pctMean = (layoutInfo.meanError * 100).toFixed(1);
  const exact = layoutInfo.warnings.length === 0 && layoutInfo.maxError < 0.005;
  const hasWarnings = layoutInfo.warnings.length > 0;
  const bg = exact ? "var(--success-bg)" : hasWarnings ? "var(--warning-bg)" : "var(--info-bg)";
  const border = exact
    ? "var(--success-border)"
    : hasWarnings
      ? "var(--warning-border)"
      : "var(--info-border)";
  const color = exact
    ? "var(--success-text)"
    : hasWarnings
      ? "var(--warning-text)"
      : "var(--info-text)";
  return (
    <div
      style={{
        margin: "8px 0 0",
        padding: "6px 12px",
        borderRadius: 6,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 11,
        color,
      }}
    >
      {exact ? (
        <div>Areas are proportional to set sizes (max region error &lt; 0.5%)</div>
      ) : (
        <div>
          Max region error: <strong>{pctMax}%</strong> · mean {pctMean}%
        </div>
      )}
      {hasWarnings &&
        layoutInfo.warnings.map((w: string, i: number) => (
          <div key={i} style={{ marginTop: 2 }}>
            {w}
          </div>
        ))}
    </div>
  );
}

// Plot step body: chart + layout banner + intersections table + items list.
// The parent App owns selection state and passes it through.
export function PlotArea({
  chartRef,
  activeSetNames,
  activeSetsMap,
  intersections,
  setColors,
  selectedMask,
  setSelectedMask,
  vis,
  proportional,
  layoutInfo,
  setLayoutInfo,
  selectedIntersection,
  fileName,
}: any) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        className="dv-panel dv-plot-card"
        style={{
          padding: 20,
          background: "var(--plot-card-bg)",
          borderColor: "var(--plot-card-border)",
        }}
      >
        <VennChart
          ref={chartRef}
          setNames={activeSetNames}
          sets={activeSetsMap}
          intersections={intersections}
          colors={setColors}
          selectedMask={selectedMask}
          onRegionClick={setSelectedMask}
          plotTitle={vis.plotTitle}
          plotBg={vis.plotBg}
          fontSize={vis.fontSize}
          fillOpacity={vis.fillOpacity}
          readabilityBlend={vis.readabilityBlend}
          showOutline={vis.showOutline}
          onLayoutInfo={setLayoutInfo}
          proportional={proportional}
        />
      </div>
      <LayoutInfoBanner proportional={proportional} layoutInfo={layoutInfo} />

      {/* Data extraction panels */}
      <div className="dv-panel" style={{ marginTop: 16 }}>
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted)",
          }}
        >
          Intersections
        </p>
        <IntersectionTable
          intersections={intersections}
          allSetNames={activeSetNames}
          selectedMask={selectedMask}
          onSelect={setSelectedMask}
        />
      </div>
      <div className="dv-panel" style={{ marginTop: 16 }}>
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted)",
          }}
        >
          Items
        </p>
        <ItemListPanel
          intersection={selectedIntersection}
          allSetNames={activeSetNames}
          fileName={fileName}
        />
      </div>
    </div>
  );
}

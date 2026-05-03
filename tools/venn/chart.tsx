// venn/chart.tsx — VennChart SVG renderer. Pure render code; consumes the
// pre-computed sets / intersections / colors from the parent App and reports
// layout-warning info back via `onLayoutInfo`. Pure layout / geometry math
// lives in tools/venn/{layout,geometry,centroids,areas}.ts.

import {
  buildRegionPaths,
  buildVenn2Layout,
  buildVenn3Layout,
  buildVenn2LayoutClassic,
  buildVenn3LayoutClassic,
  computeRegionCentroids,
  VENN_CONFIG,
} from "./helpers";

const { useMemo, useEffect, forwardRef } = React;

const VW = 600,
  VH = 500;

export const VennChart = forwardRef<SVGSVGElement, any>(function VennChart(
  {
    setNames,
    sets,
    intersections,
    colors,
    selectedMask,
    onRegionClick,
    plotTitle,
    plotBg,
    fontSize,
    fillOpacity,
    onLayoutInfo,
    proportional,
    readabilityBlend,
    showOutline,
  },
  ref
) {
  const n = setNames.length;
  const blend = readabilityBlend != null ? readabilityBlend : VENN_CONFIG.DEFAULT_READABILITY_BLEND;

  const layout = useMemo(() => {
    if (proportional) {
      if (n === 2) return buildVenn2Layout(setNames, sets, intersections, VW, VH, blend);
      return buildVenn3Layout(setNames, sets, intersections, VW, VH, blend);
    }
    if (n === 2) return buildVenn2LayoutClassic(setNames, sets, intersections, VW, VH);
    return buildVenn3LayoutClassic(setNames, sets, intersections, VW, VH);
  }, [setNames, sets, intersections, n, proportional, blend]);

  const circles = layout.circles;

  // Notify parent of layout warnings/proportionality/error metrics
  useEffect(() => {
    if (onLayoutInfo)
      onLayoutInfo({
        warnings: layout.warnings,
        proportional: layout.proportional,
        maxError: layout.maxError || 0,
        meanError: layout.meanError || 0,
      });
  }, [layout.warnings, layout.proportional, layout.maxError, layout.meanError]);

  const regionPaths = useMemo(() => buildRegionPaths(circles), [circles]);
  const centroids = useMemo(
    () => computeRegionCentroids(circles, regionPaths, intersections),
    [circles, regionPaths, intersections]
  );

  const fSize = fontSize || 14;
  const fOpacity = fillOpacity != null ? fillOpacity : 0.25;
  const outlineOn = showOutline !== false;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Venn diagram"}
    >
      <title>{plotTitle || "Venn diagram"}</title>
      <desc>{`Venn diagram with ${n} set${n !== 1 ? "s" : ""}: ${setNames.join(", ")}`}</desc>
      <rect id="background" width={VW} height={VH} fill={plotBg || "#fff"} rx="8" />
      {plotTitle && (
        <g id="title">
          <text
            x={VW / 2}
            y={24}
            textAnchor="middle"
            fontSize="16"
            fontWeight="700"
            fill="#222"
            fontFamily="sans-serif"
          >
            {plotTitle}
          </text>
        </g>
      )}

      <g id="set-circles">
        {circles.map((c, i) => (
          <circle
            key={`circle-${i}`}
            id={`set-${svgSafeId(setNames[i])}`}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill={colors[setNames[i]] || PALETTE[i]}
            fillOpacity={fOpacity}
            stroke={outlineOn ? colors[setNames[i]] || PALETTE[i] : "none"}
            strokeWidth={outlineOn ? 2 : 0}
            strokeOpacity={outlineOn ? 0.6 : 0}
            aria-label={`Set ${setNames[i]}: ${sets[setNames[i]] || 0} elements`}
          />
        ))}
      </g>

      {selectedMask != null && regionPaths[selectedMask] && (
        <g id="selected-region">
          <path
            d={regionPaths[selectedMask]}
            fill="none"
            stroke="#222"
            strokeWidth="2.5"
            strokeDasharray="6,3"
            style={{ pointerEvents: "none" }}
          />
        </g>
      )}

      <g id="region-counts">
        {intersections.map((inter: any) => {
          const c = centroids[inter.mask];
          if (!c) return null;
          const isSelected = selectedMask === inter.mask;
          const regionPath = regionPaths[inter.mask];
          const labelId =
            inter.setNames.map((n: string) => svgSafeId(n)).join("-") || `mask-${inter.mask}`;
          return (
            <g
              key={`label-${inter.mask}`}
              id={`count-${labelId}`}
              style={{ cursor: "pointer" }}
              onClick={() => onRegionClick && onRegionClick(isSelected ? null : inter.mask)}
            >
              {regionPath ? (
                <path d={regionPath} fill="none" pointerEvents="all" />
              ) : (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={Math.max(fSize * 1.5, 20)}
                  fill="transparent"
                  pointerEvents="all"
                />
              )}
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fSize}
                fontWeight="700"
                fill="#333"
                fontFamily="sans-serif"
                pointerEvents="none"
              >
                {inter.size}
              </text>
            </g>
          );
        })}
      </g>

      <g id="legend">
        {circles.map((c, i) => (
          <g key={`setlabel-${i}`} id={`legend-${svgSafeId(setNames[i])}`}>
            <circle
              cx={18}
              cy={VH - 20 - (circles.length - 1 - i) * 22}
              r={6}
              fill={colors[setNames[i]] || PALETTE[i]}
              fillOpacity="0.5"
              stroke={colors[setNames[i]] || PALETTE[i]}
              strokeWidth="1.5"
            />
            <text
              x={30}
              y={VH - 20 - (circles.length - 1 - i) * 22}
              textAnchor="start"
              dominantBaseline="central"
              fontSize="13"
              fontWeight="600"
              fill={colors[setNames[i]] || PALETTE[i]}
              fontFamily="sans-serif"
            >
              {setNames[i]} ({sets.get(setNames[i]).size})
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});

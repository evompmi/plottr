// upset/chart.tsx — UpsetChart forwardRef SVG renderer + the layout
// constants and per-chart sizing helpers it uses (computeRowHeight /
// computeColWidth). Pure render code; consumes pre-computed
// intersections, set sizes, and the optional intersection-test cache
// from the parent App.

import { intersectionLabel, buildBarTicks } from "./helpers";

const { forwardRef } = React;

// ── Layout constants ─────────────────────────────────────────────────────────

const PREFERRED_SVG_W = 960;
const MIN_COL_W = 18;
const MAX_COL_W = 36;
const TITLE_H_WITH = 40;
const TITLE_H_NONE = 16;
const SUBTITLE_H = 18;
const TOP_PANEL_H = 200;
const MATRIX_TOP_PAD = 8;
const BOTTOM_H = 62;
const LEFT_MARGIN = 44;
const LEFT_BAR_MAX = 110;
const LEFT_LABEL_AREA_MIN = 82;
const LEFT_GAP = 6;
const RIGHT_MARGIN = 20;
const BAR_FILL = "#000000";
const DOT_FILL = "#000000";
const EMPTY_DOT = "#DDDDDD";
const ZEBRA_FILL = "#F4F4F4";
const TEXT_DARK = "#333333";
const TEXT_MUTED = "#555555";
// Significance-colour palette for the "Color by significance" toggle. Green
// flags a significantly enriched bar (observed exclusive count > expected,
// BH-adjusted upper-tail p < 0.05); dark red flags a significantly depleted
// one (observed < expected, BH-adjusted lower-tail p < 0.05). Both are
// colour-blind-safe Brewer 7-class PiYG/YlGn-green and -red endpoints.
const BAR_FILL_ENRICHED = "#2ca25f";
const BAR_FILL_DEPLETED = "#a50f15";

// Row height is tuned so tall set lists stay legible without dominating the view.
function computeRowHeight(nSets: number): number {
  return Math.max(22, Math.min(40, Math.round(140 / Math.max(1, nSets) + 14)));
}

// Column width fits the preferred width when the column count allows it,
// otherwise clamps to MIN_COL_W so the SVG grows wider instead of shrinking
// columns below legibility. Callers use the returned colW to derive SVG_W.
function computeColWidth(nCols: number, matrixLeftX: number): number {
  if (nCols <= 0) return 24;
  const avail = PREFERRED_SVG_W - matrixLeftX - RIGHT_MARGIN;
  return Math.max(MIN_COL_W, Math.min(MAX_COL_W, avail / nCols));
}

// ── UpsetChart ──────────────────────────────────────────────────────────────

export const UpsetChart = forwardRef<SVGSVGElement, any>(function UpsetChart(
  {
    setNames,
    setSizes,
    intersections,
    selectedMask,
    onColumnClick,
    plotTitle,
    plotSubtitle,
    plotBg,
    fontSize,
    barOpacity,
    dotSize,
    showIntersectionLabels,
    showSetSizeLabels,
    significanceDisplay,
    significanceByMask,
    colorBarsBySignificance,
  },
  ref
) {
  const nSets = setNames.length;
  const nCols = intersections.length;
  const fSize = fontSize || 12;
  const barOp = barOpacity != null ? barOpacity : 1;
  const dotR = dotSize || 6;

  // Label lane grows with font size and longest set name so the bars never
  // collide with their labels at large font sizes. The 0.58 factor is a
  // conservative average-width estimate for sans-serif glyphs.
  const labelFontSize = Math.max(10, fSize - 1);
  const estLabelW = Math.max(
    0,
    ...setNames.map((n: string) => String(n).length * labelFontSize * 0.58)
  );
  const leftLabelArea = Math.max(LEFT_LABEL_AREA_MIN, Math.ceil(estLabelW) + 6);
  // Set-id lane: a dedicated column between the set-name labels and the
  // matrix, rendering "S1", "S2", … in display order. Mirrors the column-id
  // lane below the matrix so the on-screen plot is always the source of
  // truth for which number maps to which set — a downloaded SVG and the
  // exported intersection CSV can sit in the same folder with no ambiguity.
  const setIdFontSize = Math.max(8, Math.min(10, fSize - 4));
  const maxSetIdChars = 1 + String(Math.max(1, nSets)).length;
  const setIdLaneW = Math.ceil(maxSetIdChars * setIdFontSize * 0.6) + 6;
  const setIdLaneX = LEFT_MARGIN + LEFT_BAR_MAX + LEFT_GAP + leftLabelArea;
  const matrixLeftX = setIdLaneX + setIdLaneW;

  const rowH = computeRowHeight(nSets);
  const colW = computeColWidth(nCols, matrixLeftX);
  const matrixH = nSets * rowH;
  const titleH = plotTitle ? TITLE_H_WITH : TITLE_H_NONE;
  const subH = plotSubtitle ? SUBTITLE_H : 0;
  const topPanelY = titleH + subH;
  const matrixY = topPanelY + TOP_PANEL_H + MATRIX_TOP_PAD;
  // Column ids ("I1", "I2", …) always render rotated -90° (reading
  // bottom-to-top) so they stay readable no matter how narrow the columns are.
  // 0.58 is the shared average-glyph-width factor used above for set-name labels.
  const idFontSize = Math.max(8, Math.min(10, fSize - 4));
  const maxIdChars = 1 + String(Math.max(1, nCols)).length;
  const idLabelSpan = Math.ceil(maxIdChars * idFontSize * 0.58);
  const legendFS = Math.max(9, fSize - 3);
  const idLaneOffset = 10;
  const legendOffset = idLaneOffset + idLabelSpan + 8;
  const bottomNeeded = legendOffset + legendFS + 8;
  const VH = matrixY + matrixH + Math.max(BOTTOM_H, bottomNeeded);
  // Grow the SVG when columns would otherwise spill past the preferred width;
  // the style below keeps it <=100% of the container so narrow viewports just
  // scale proportionally instead of clipping.
  const SVG_W = Math.max(PREFERRED_SVG_W, matrixLeftX + Math.max(0, nCols) * colW + RIGHT_MARGIN);

  // Top (intersection-size) bar area. Ticks are evenly spaced pretty values;
  // the domain max (last tick) is strictly above the data max so the largest
  // bar stops just below the panel edge rather than touching it.
  const topPanelBottom = topPanelY + TOP_PANEL_H;
  const topAxisMax = Math.max(1, ...intersections.map((r: any) => r.size));
  const topTicks = buildBarTicks(topAxisMax, 4);
  const topDomainMax = topTicks[topTicks.length - 1];
  // Both the intersection-size labels and the significance markers render
  // rotated -90°, which means they extend *upward* from the bar top. The
  // tallest bar is the binding constraint — if we scaled bars to the full
  // TOP_PANEL_H, their rotated labels would spill above topPanelY into the
  // title/subtitle and get clipped by the viewBox on dense plots. Reserve a
  // dynamic `labelHeadroom` based on the widest possible rotated label and
  // scale bars into `barAreaHeight = TOP_PANEL_H - labelHeadroom` instead.
  // Shorter bars have natural extra gap so their (shorter) labels comfortably
  // fit in the same reserved strip.
  const sizeLabelFS = Math.max(9, fSize - 3);
  const sizeLabelShown = showIntersectionLabels !== false;
  const maxSizeChars = String(topAxisMax).length;
  const maxSizeLabelHeight = sizeLabelShown ? Math.ceil(maxSizeChars * sizeLabelFS * 0.58) : 0;
  let maxSigLabelHeight = 0;
  if (significanceDisplay === "stars") {
    // Longest in-use token is "****" (4 chars) at the larger stars font.
    maxSigLabelHeight = Math.ceil(4 * Math.max(10, fSize - 1) * 0.58);
  } else if (significanceDisplay === "p-value") {
    // "p=1.2e-99" (9 chars) covers the worst-case scientific form.
    maxSigLabelHeight = Math.ceil(9 * Math.max(9, fSize - 3) * 0.58);
  }
  const hasAnyLabel = maxSizeLabelHeight > 0 || maxSigLabelHeight > 0;
  const gapBetweenLabels = maxSizeLabelHeight > 0 && maxSigLabelHeight > 0 ? 4 : 0;
  const labelHeadroom =
    maxSizeLabelHeight + maxSigLabelHeight + gapBetweenLabels + (hasAnyLabel ? 6 : 0);
  const barAreaHeight = Math.max(40, TOP_PANEL_H - labelHeadroom);
  const topBarScale = (v: number) => (v / topDomainMax) * barAreaHeight;
  const barAreaTop = topPanelBottom - barAreaHeight;

  // Left (set-size) bar area — same scaling strategy as the top panel.
  const setSizeMax = Math.max(1, ...setNames.map((n: string) => setSizes.get(n) || 0));
  const leftTicks = buildBarTicks(setSizeMax, 3);
  const leftDomainMax = leftTicks[leftTicks.length - 1];
  const leftBarScale = (v: number) => (v / leftDomainMax) * LEFT_BAR_MAX;

  const colX = (i: number) => matrixLeftX + colW * (i + 0.5);
  const rowY = (i: number) => matrixY + rowH * (i + 0.5);

  // Axis tick geometry for the top (intersection size) axis — rendered on the
  // *left* edge of the top panel so the numbers are readable even if there are
  // many bars. The numeric scale is reused for intersection-bar labels.
  const topAxisX = matrixLeftX - 4;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SVG_W} ${VH}`}
      width={SVG_W}
      height={VH}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "UpSet plot"}
    >
      <title>{plotTitle || "UpSet plot"}</title>
      <desc>{`UpSet plot with ${nSets} sets and ${nCols} intersections`}</desc>

      <g id="background">
        <rect width={SVG_W} height={VH} fill={plotBg || "#ffffff"} rx="8" />
      </g>

      {plotTitle && (
        <g id="title">
          <text
            x={SVG_W / 2}
            y={24}
            textAnchor="middle"
            fontSize={Math.max(14, fSize + 4)}
            fontWeight="700"
            fill={TEXT_DARK}
            fontFamily="sans-serif"
          >
            {plotTitle}
          </text>
        </g>
      )}
      {plotSubtitle && (
        <g id="subtitle">
          <text
            x={SVG_W / 2}
            y={titleH + 12}
            textAnchor="middle"
            fontSize={Math.max(11, fSize)}
            fill={TEXT_MUTED}
            fontFamily="sans-serif"
          >
            {plotSubtitle}
          </text>
        </g>
      )}

      {/* Top axis — intersection size. Line spans the bar area only (not the
          reserved label headroom above it) so it matches the tallest tick. */}
      <g id="axis-intersection-size">
        <line
          x1={topAxisX}
          x2={topAxisX}
          y1={barAreaTop}
          y2={topPanelBottom}
          stroke={TEXT_DARK}
          strokeWidth="1"
        />
        {topTicks.map((t, i) => {
          const y = topPanelBottom - topBarScale(t);
          return (
            <g key={`ta-${i}`}>
              <line
                x1={topAxisX - 3}
                x2={topAxisX}
                y1={y}
                y2={y}
                stroke={TEXT_DARK}
                strokeWidth="1"
              />
              <text
                x={topAxisX - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={Math.max(9, fSize - 3)}
                fill={TEXT_MUTED}
                fontFamily="sans-serif"
              >
                {t}
              </text>
            </g>
          );
        })}
        {(() => {
          const tickFS = Math.max(9, fSize - 3);
          const labelFS = Math.max(10, fSize - 2);
          const maxTickChars = String(topDomainMax).length;
          const tickTextW = maxTickChars * tickFS * 0.6;
          const labelCx = topAxisX - 6 - tickTextW - labelFS / 2 - 6;
          const labelCy = topPanelY + TOP_PANEL_H / 2;
          return (
            <text
              x={labelCx}
              y={labelCy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={labelFS}
              fill={TEXT_MUTED}
              fontFamily="sans-serif"
              transform={`rotate(-90 ${labelCx} ${labelCy})`}
            >
              Intersection size
            </text>
          );
        })()}
      </g>

      {/* Intersection bars + their numeric labels. Bar fill switches to green /
          dark red when the "Color by significance" toggle is on AND a cached
          two-sided test crosses p_adj < 0.05. Direction (enrichment vs
          depletion) is read from the entry's `direction` field (sign of
          observed − expected); significance is judged on `pAdjTwoSided` — the
          same honest two-sided family that drives the stars / p-value markers
          above, so colour and marker always agree about which bars are
          significant. Bars with no cached test, or tests that don't cross
          p < 0.05, fall back to the default black fill. */}
      <g id="intersection-bars">
        {intersections.map((inter: any, i: number) => {
          const cx = colX(i);
          const barW = Math.max(6, colW * 0.7);
          const barX = cx - barW / 2;
          const h = topBarScale(inter.size);
          const isSelected = selectedMask === inter.mask;
          const idKey = intersectionIdKey(inter.setIndices, setNames);
          let fill = BAR_FILL;
          if (colorBarsBySignificance && significanceByMask) {
            const sig = significanceByMask.get(inter.mask);
            if (sig && Number.isFinite(sig.pAdjTwoSided) && sig.pAdjTwoSided < 0.05) {
              if (sig.direction === "enriched") fill = BAR_FILL_ENRICHED;
              else if (sig.direction === "depleted") fill = BAR_FILL_DEPLETED;
            }
          }
          return (
            <g
              key={`tb-${inter.mask}`}
              id={`intersection-bar-${idKey}`}
              style={{ cursor: "pointer" }}
              onClick={() => onColumnClick && onColumnClick(isSelected ? null : inter.mask)}
            >
              <rect
                x={barX}
                y={topPanelBottom - h}
                width={barW}
                height={h}
                fill={fill}
                fillOpacity={barOp}
                stroke={isSelected ? TEXT_DARK : "none"}
                strokeWidth={isSelected ? 1.5 : 0}
              />
            </g>
          );
        })}
      </g>

      {sizeLabelShown && (
        <g id="intersection-bar-labels">
          {intersections.map((inter: any, i: number) => {
            const cx = colX(i);
            const h = topBarScale(inter.size);
            const anchorY = topPanelBottom - h - 3;
            return (
              <text
                key={`tbl-${inter.mask}`}
                x={cx}
                y={anchorY}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={sizeLabelFS}
                fill={TEXT_DARK}
                fontFamily="sans-serif"
                transform={`rotate(-90 ${cx} ${anchorY})`}
              >
                {inter.size}
              </text>
            );
          })}
        </g>
      )}

      {/* Significance markers: stars or p-value text above bars the user has
          tested. Rotated -90° (reading bottom-to-top) so the label stacks
          vertically above its bar and never overlaps neighbouring columns.
          Placed above the intersection-size label so the two never collide.
          Only rendered when the sidebar toggle is on AND this bar's mask is
          in `significanceByMask`. */}
      {significanceDisplay && significanceDisplay !== "off" && significanceByMask && (
        <g id="significance-markers">
          {intersections.map((inter: any, i: number) => {
            const sig = significanceByMask.get(inter.mask);
            if (!sig || !Number.isFinite(sig.pAdj)) return null;
            const cx = colX(i);
            const h = topBarScale(inter.size);
            // Size label is rotated -90°, so its on-screen height equals its
            // glyph-string width (char count * fontSize * 0.58). Stack the
            // (also-rotated) sig marker on top with a 4 px gap.
            const thisSizeLabelHeight = sizeLabelShown
              ? String(inter.size).length * sizeLabelFS * 0.58
              : 0;
            const labelOffset = sizeLabelShown ? thisSizeLabelHeight + 7 : 3;
            const text =
              significanceDisplay === "stars" ? pStars(sig.pAdj) : "p=" + formatP(sig.pAdj);
            // Size: star glyphs render a hair bigger than the bar-size label;
            // "ns" renders smaller so a non-significant bar stays visually
            // quiet; p-values match the bar-size label so numeric widths stay
            // aligned with the intersection size above.
            const isStarsMode = significanceDisplay === "stars";
            const isNs = isStarsMode && text === "ns";
            const tSize = isNs
              ? Math.max(8, fSize - 4)
              : isStarsMode
                ? Math.max(10, fSize - 1)
                : Math.max(9, fSize - 3);
            // Stars / "ns" always render in black; p-values use blue below 0.05
            // to match the usual "significant" colour convention.
            const fill = isStarsMode ? "#111111" : sig.pAdj < 0.05 ? "#1f6feb" : "#555555";
            const anchorY = topPanelBottom - h - labelOffset;
            return (
              <text
                key={`sig-${inter.mask}`}
                x={cx}
                y={anchorY}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={tSize}
                fill={fill}
                fontFamily="sans-serif"
                fontWeight={isStarsMode && !isNs ? 700 : 400}
                transform={`rotate(-90 ${cx} ${anchorY})`}
              >
                {text}
              </text>
            );
          })}
        </g>
      )}

      {/* Matrix zebra stripes — every other row gets a faint band that
          spans only the populated column range so the bands shrink in step
          with the minimum-size / minimum-degree filters. */}
      <g id="matrix-background">
        {setNames.map((_: unknown, i: number) =>
          i % 2 === 0 ? (
            <rect
              key={`zb-${i}`}
              x={matrixLeftX}
              y={matrixY + i * rowH}
              width={Math.max(0, nCols) * colW}
              height={rowH}
              fill={ZEBRA_FILL}
              fillOpacity="0.5"
            />
          ) : null
        )}
      </g>

      {/* Set labels inside the left panel, right-aligned against the S# id
          lane (the id lane sits between the names and the matrix). */}
      <g id="set-labels">
        {setNames.map((name: string, i: number) => (
          <text
            key={`sl-${i}`}
            x={setIdLaneX - 2}
            y={rowY(i)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={labelFontSize}
            fontWeight="600"
            fill={TEXT_DARK}
            fontFamily="sans-serif"
          >
            {name}
          </text>
        ))}
      </g>

      {/* Set-id lane: monospace "S1", "S2", … between the set-name labels
          and the matrix, in display order. Mirrors the per-column id lane
          below the matrix — the plot is the source of truth for which
          number maps to which set, so a downloaded SVG stays unambiguous
          alongside the exported intersection CSV. Re-numbering when the
          user shows/hides sets is intentional (same contract as I#). */}
      <g id="set-ids">
        {setNames.map((_: unknown, i: number) => (
          <text
            key={`sid-${i}`}
            id={`set-id-${i + 1}`}
            x={setIdLaneX + setIdLaneW / 2}
            y={rowY(i)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={setIdFontSize}
            fontFamily="monospace"
            fill={TEXT_MUTED}
          >
            {`S${i + 1}`}
          </text>
        ))}
      </g>

      {/* Set-size horizontal bars. */}
      <g id="set-size-bars">
        {setNames.map((name: string, i: number) => {
          const size = setSizes.get(name) || 0;
          const w = leftBarScale(size);
          const barRightX = setIdLaneX - LEFT_GAP - leftLabelArea;
          return (
            <rect
              key={`sb-${i}`}
              id={`set-size-${svgSafeId(name)}`}
              x={barRightX - w}
              y={rowY(i) - rowH * 0.3}
              width={w}
              height={rowH * 0.6}
              fill={BAR_FILL}
              fillOpacity={barOp}
            />
          );
        })}
      </g>

      {showSetSizeLabels !== false && (
        <g id="set-size-bar-labels">
          {setNames.map((name: string, i: number) => {
            const size = setSizes.get(name) || 0;
            const w = leftBarScale(size);
            const barRightX = setIdLaneX - LEFT_GAP - leftLabelArea;
            return (
              <text
                key={`sbl-${i}`}
                x={barRightX - w - 4}
                y={rowY(i)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={Math.max(9, fSize - 3)}
                fill={TEXT_MUTED}
                fontFamily="sans-serif"
              >
                {size}
              </text>
            );
          })}
        </g>
      )}

      {/* Set-size axis: baseline + downward ticks + labels below the matrix. */}
      <g id="axis-set-size">
        {(() => {
          const barRightX = setIdLaneX - LEFT_GAP - leftLabelArea;
          const axisY = matrixY + matrixH + 4;
          const axisLeftX = barRightX - LEFT_BAR_MAX;
          return (
            <>
              <line
                x1={axisLeftX}
                x2={barRightX}
                y1={axisY}
                y2={axisY}
                stroke={TEXT_DARK}
                strokeWidth="1"
              />
              {leftTicks.map((t, i) => {
                const x = barRightX - leftBarScale(t);
                return (
                  <g key={`la-${i}`}>
                    <line
                      x1={x}
                      x2={x}
                      y1={axisY}
                      y2={axisY + 3}
                      stroke={TEXT_DARK}
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={axisY + 18}
                      textAnchor="middle"
                      fontSize={Math.max(9, fSize - 3)}
                      fill={TEXT_MUTED}
                      fontFamily="sans-serif"
                    >
                      {t}
                    </text>
                  </g>
                );
              })}
              <text
                x={axisLeftX + LEFT_BAR_MAX / 2}
                y={axisY + 44}
                textAnchor="middle"
                fontSize={Math.max(10, fSize - 2)}
                fill={TEXT_MUTED}
                fontFamily="sans-serif"
              >
                Set size
              </text>
            </>
          );
        })()}
      </g>

      {/* Per-column identifier labels ("I1", "I2", …) directly beneath the
          matrix. Ids are 1-based and derive from the render order, so they
          always match whatever intersections.length and sorting are in play.
          The same ids drive the "All regions" bulk-download filenames, so the
          labels on the plot equal the file names 1:1 for any given render. */}
      <g id="column-ids">
        {(() => {
          const idLaneY = matrixY + matrixH + idLaneOffset;
          return intersections.map((inter: any, i: number) => {
            const cx = colX(i);
            return (
              <text
                key={`cid-${inter.mask}`}
                id={`column-id-${i + 1}`}
                x={cx}
                y={idLaneY}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={idFontSize}
                fontFamily="monospace"
                fill={TEXT_MUTED}
                transform={`rotate(-90 ${cx} ${idLaneY})`}
              >
                {`I${i + 1}`}
              </text>
            );
          });
        })()}
      </g>

      {/* One-line legend clarifying the "I#" notation. Anchored at matrixLeftX
          so it sits below the column-ids lane and right of the "Set size"
          caption (which lives in the left bar area). */}
      <g id="column-ids-legend">
        {(() => {
          const legendY = matrixY + matrixH + legendOffset;
          return (
            <text
              x={matrixLeftX}
              y={legendY}
              textAnchor="start"
              dominantBaseline="hanging"
              fontSize={legendFS}
              fontFamily="sans-serif"
              fontStyle="italic"
              fill={TEXT_MUTED}
            >
              I# = intersection id (used as bulk-download filename) · S# = set id (rows)
            </text>
          );
        })()}
      </g>

      {/* Matrix: per-column group with line + dots. */}
      <g id="matrix">
        <g id="matrix-columns">
          {intersections.map((inter: any, i: number) => {
            const cx = colX(i);
            const inSet = new Set(inter.setIndices);
            const isSelected = selectedMask === inter.mask;
            const idKey = intersectionIdKey(inter.setIndices, setNames);
            const activeRows = inter.setIndices;
            const minR = activeRows.length ? rowY(Math.min(...activeRows)) : 0;
            const maxR = activeRows.length ? rowY(Math.max(...activeRows)) : 0;
            return (
              <g
                key={`col-${inter.mask}`}
                id={`col-${idKey}`}
                style={{ cursor: "pointer" }}
                onClick={() => onColumnClick && onColumnClick(isSelected ? null : inter.mask)}
              >
                <rect
                  x={cx - colW / 2}
                  y={matrixY}
                  width={colW}
                  height={matrixH}
                  fill={isSelected ? "#648FFF" : "#ffffff"}
                  fillOpacity={isSelected ? 0.12 : 0}
                  pointerEvents="all"
                />
                {activeRows.length > 1 && (
                  <line
                    className="matrix-line"
                    x1={cx}
                    x2={cx}
                    y1={minR}
                    y2={maxR}
                    stroke={DOT_FILL}
                    strokeWidth={Math.max(1.5, dotR / 3)}
                  />
                )}
                {setNames.map((name: string, j: number) => (
                  <circle
                    key={`d-${j}`}
                    id={`dot-${idKey}-${svgSafeId(name)}`}
                    cx={cx}
                    cy={rowY(j)}
                    r={dotR}
                    fill={inSet.has(j) ? DOT_FILL : EMPTY_DOT}
                  />
                ))}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
});

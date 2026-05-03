// upset.tsx — editable source. Run `npm run build` to compile to upset.js
// Do NOT edit the .js file directly.
import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";
import { ScrollablePlotCard } from "./_shell/ScrollablePlotCard";
import { PlotSidebar } from "./_shell/PlotSidebar";
import {
  computeMemberships,
  enumerateIntersections,
  sortIntersections,
  truncateIntersections,
  intersectionLabel,
  intersectionShortLabel,
  intersectionFilenamePart,
  intersectionIdKey,
  buildBarTicks,
} from "./upset/helpers";

const { useState, useMemo, useCallback, useRef, useEffect, forwardRef } = React;

// parseSetData and parseLongFormatSets live in tools/shared.js.
// Pure set-math and label helpers live in tools/upset/helpers.ts.

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
function computeRowHeight(nSets) {
  return Math.max(22, Math.min(40, Math.round(140 / Math.max(1, nSets) + 14)));
}

// Column width fits the preferred width when the column count allows it,
// otherwise clamps to MIN_COL_W so the SVG grows wider instead of shrinking
// columns below legibility. Callers use the returned colW to derive SVG_W.
function computeColWidth(nCols, matrixLeftX) {
  if (nCols <= 0) return 24;
  const avail = PREFERRED_SVG_W - matrixLeftX - RIGHT_MARGIN;
  return Math.max(MIN_COL_W, Math.min(MAX_COL_W, avail / nCols));
}

// ── UpsetChart ──────────────────────────────────────────────────────────────

const UpsetChart = forwardRef<SVGSVGElement, any>(function UpsetChart(
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
  const estLabelW = Math.max(0, ...setNames.map((n) => String(n).length * labelFontSize * 0.58));
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
  const topAxisMax = Math.max(1, ...intersections.map((r) => r.size));
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
  const topBarScale = (v) => (v / topDomainMax) * barAreaHeight;
  const barAreaTop = topPanelBottom - barAreaHeight;

  // Left (set-size) bar area — same scaling strategy as the top panel.
  const setSizeMax = Math.max(1, ...setNames.map((n) => setSizes.get(n) || 0));
  const leftTicks = buildBarTicks(setSizeMax, 3);
  const leftDomainMax = leftTicks[leftTicks.length - 1];
  const leftBarScale = (v) => (v / leftDomainMax) * LEFT_BAR_MAX;

  const colX = (i) => matrixLeftX + colW * (i + 0.5);
  const rowY = (i) => matrixY + rowH * (i + 0.5);

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
        {intersections.map((inter, i) => {
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
          {intersections.map((inter, i) => {
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
          {intersections.map((inter, i) => {
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
        {setNames.map((_, i) =>
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
        {setNames.map((name, i) => (
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
        {setNames.map((_, i) => (
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
        {setNames.map((name, i) => {
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
          {setNames.map((name, i) => {
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
          return intersections.map((inter, i) => {
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
          {intersections.map((inter, i) => {
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
                {setNames.map((name, j) => (
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

// ── Upload step with explicit Wide/Long toggle ───────────────────────────────

function UploadStep({
  sepOverride,
  setSepOverride,
  format,
  setFormat,
  handleFileLoad,
  onLoadExample,
}) {
  return (
    <div>
      <div className="dv-panel" style={{ marginBottom: 12 }}>
        <p className="dv-tile-title" style={{ margin: "0 0 6px" }}>
          Data format
        </p>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            width: "fit-content",
          }}
        >
          {(["wide", "long"] as const).map((f) => {
            const active = format === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  padding: "6px 18px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: "none",
                  background: active ? "var(--accent-primary)" : "var(--surface)",
                  color: active ? "var(--on-accent)" : "var(--text-muted)",
                }}
              >
                {f === "wide" ? "Wide" : "Long"}
              </button>
            );
          })}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
          {format === "wide"
            ? "One column per set. Cells are item ids; empty cells are ignored."
            : "Two columns: item id, set name. Each row is one (item, set) pair."}
        </p>
      </div>

      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Arabidopsis abiotic stress genes (5-set DEG lists)"
        hint={
          format === "wide"
            ? "CSV · TSV · TXT — one column per set (2+), items in rows · 2 MB max"
            : "CSV · TSV · TXT — two columns (item, set), one per row · 2 MB max"
        }
      />

      <HowToCard
        toolName="upset"
        title="UpSet plot — How to use"
        subtitle="Upload set membership → review → plot intersections"
      >
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
            gridColumn: "1/-1",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            When to use UpSet
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.75,
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            Venn diagrams stop being readable past 3 sets. UpSet plots replace the overlapping
            circles with a matrix of dots: each column is one exclusive intersection (items in those
            sets and no others), with a bar chart on top showing its size. Left bars show per-set
            totals. Click any column to list the items.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Controls
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>🔀</span>
              <span>
                <strong>Sort</strong> bars by size, degree, or set order.
              </span>
            </li>
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>🎚️</span>
              <span>
                <strong>Filter</strong> by minimum intersection size (any integer, range auto-fits
                your data) and a min / max degree window — keep only 2-way overlaps, drop
                singletons, etc.
              </span>
            </li>
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>🎨</span>
              <span>
                <strong>Style</strong>: opacity, dot size, font size, and label visibility — all
                live.
              </span>
            </li>
          </ul>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Statistics
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>🧪</span>
              <span>
                Click <strong>Compute stats</strong> — tests every intersection against an
                independence null (Binomial; each item placed in each set at its marginal rate).
              </span>
            </li>
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚖️</span>
              <span>
                Headline p is <strong>two-sided</strong>: bars flag as surprisingly tall (
                <strong>enrichment</strong>) or surprisingly short (<strong>depletion</strong> —
                sets that avoid each other).
              </span>
            </li>
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>📐</span>
              <span>
                BH-adjusted across the full family in one pass. View filters never change which
                tests ran.
              </span>
            </li>
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>👁️</span>
              <span>
                Turn on <strong>Significance markers</strong> (stars or p=…) and{" "}
                <strong>Color bars</strong> (green = enriched, dark red = depleted) to read the
                result straight off the plot.
              </span>
            </li>
            <li style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>🌐</span>
              <span>
                Override <strong>Universe size</strong> in the sidebar if your null is a fixed
                background (genome, proteome) rather than the union of uploaded items.
              </span>
            </li>
          </ul>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Export
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Download the plot as <strong>SVG</strong> or <strong>PNG</strong>, plus two CSVs: the
            full intersection table and the long membership matrix. One-click bulk-download of every
            intersection's item list is also available.
          </p>
        </div>

        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "4+ sets",
            "Exclusive intersections",
            "Sort / filter / stats",
            "Two-sided significance (enrichment + depletion)",
            "Wide or long input",
            "SVG / PNG / CSV export",
            "100% browser-side",
          ].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--surface)",
                border: "1px solid var(--info-border)",
                color: "var(--text-muted)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </HowToCard>
    </div>
  );
}

// ── Configure step (rename / color / include) ───────────────────────────────

function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  allColumnNames,
  allColumnSets,
  pendingSelection,
  setPendingSelection,
  minDegree,
  setMinDegree,
  maxDegree,
  setMaxDegree,
}) {
  const selectedCount = pendingSelection.length;
  const needsCutoff = selectedCount > 8;
  // Reset the cutoff window back to "all degrees" whenever the gate disappears
  // so it doesn't silently apply to a later 3-set selection. Also re-clamp to
  // the current selection when the gate is active.
  useEffect(() => {
    if (!needsCutoff) {
      setMinDegree(1);
      setMaxDegree(Infinity);
      return;
    }
    setMinDegree((d) => Math.max(1, Math.min(selectedCount, d)));
    setMaxDegree((d) =>
      Number.isFinite(d) ? Math.max(1, Math.min(selectedCount, d)) : selectedCount
    );
  }, [needsCutoff, selectedCount]);
  // Keep min ≤ max whenever either edge changes.
  useEffect(() => {
    if (Number.isFinite(maxDegree) && minDegree > maxDegree) setMinDegree(maxDegree);
  }, [minDegree, maxDegree]);

  const allPossible = selectedCount >= 2 ? Math.pow(2, selectedCount) - 1 : 0;
  const effectiveMaxDegree = Number.isFinite(maxDegree) ? maxDegree : selectedCount;
  const cutoffPreview = useMemo(() => {
    if (!needsCutoff) return null;
    const pendingSets = new Map();
    pendingSelection.forEach((n) => pendingSets.set(n, allColumnSets.get(n)));
    const { membershipMap } = computeMemberships(pendingSelection, pendingSets);
    const all = enumerateIntersections(membershipMap, pendingSelection);
    const kept = all.filter((r) => r.degree >= minDegree && r.degree <= effectiveMaxDegree).length;
    return { nonEmpty: all.length, kept };
  }, [needsCutoff, pendingSelection, allColumnSets, minDegree, effectiveMaxDegree]);

  const toggle = (name) => {
    setPendingSelection((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };
  let pickerStatusText = "Pick at least 2 sets to plot.";
  let pickerStatusColor = "var(--text-muted)";
  if (selectedCount === 1) {
    pickerStatusText = "1 selected — pick at least one more.";
    pickerStatusColor = "var(--warning-text)";
  } else if (selectedCount >= 2) {
    pickerStatusText = `${selectedCount} selected — ready to plot.`;
    pickerStatusColor = "var(--success-text)";
  }
  return (
    <div>
      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 4px" }}>
          Sets to include
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: pickerStatusColor }}>
          {pickerStatusText}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 6,
          }}
        >
          {allColumnNames.map((name) => {
            const checked = pendingSelection.includes(name);
            const size = allColumnSets.get(name)?.size ?? 0;
            return (
              <label
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border)"}`,
                  background: checked ? "var(--info-bg)" : "var(--surface-subtle)",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text)",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(name)}
                  style={{ accentColor: "var(--cta-primary-bg)" }}
                />
                <span
                  style={{
                    fontWeight: 600,
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
                <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>
                  {size}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {needsCutoff && (
        <div className="dv-panel" style={{ marginTop: 16 }}>
          <p className="dv-tile-title" style={{ margin: "0 0 4px" }}>
            Intersection cutoff
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-muted)" }}>
            With {selectedCount} sets, up to {allPossible.toLocaleString()} intersections are
            possible. Keep only intersections whose degree falls in this window:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Min</label>
            <NumberInput
              min={1}
              max={selectedCount}
              step={1}
              value={minDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(1, Math.min(selectedCount, v));
                setMinDegree(clamped);
                if (Number.isFinite(maxDegree) && clamped > maxDegree) setMaxDegree(clamped);
              }}
              style={{ width: 96 }}
            />
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Max</label>
            <NumberInput
              min={1}
              max={selectedCount}
              step={1}
              value={effectiveMaxDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(1, Math.min(selectedCount, v));
                setMaxDegree(clamped);
                if (clamped < minDegree) setMinDegree(clamped);
              }}
              style={{ width: 96 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {cutoffPreview
                ? `${cutoffPreview.kept.toLocaleString()} of ${cutoffPreview.nonEmpty.toLocaleString()} non-empty intersections kept.`
                : ""}
            </span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Degree 1 keeps singletons (items unique to one set); degree = {selectedCount} keeps the
            all-sets intersection. You can change this later in the plot controls.
          </p>
        </div>
      )}

      <div className="dv-panel" style={{ marginTop: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>
    </div>
  );
}

// ── Intersection table + item list (below the chart) ────────────────────────

function ItemListPanel({ intersection, setNames, fileName, columnId }) {
  const baseName = fileBaseName(fileName, "upset");
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
        Click an intersection bar or matrix column to view items.
      </div>
    );
  const label = intersectionLabel(intersection.setIndices, setNames);
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
          {columnId != null && (
            <span
              style={{
                fontFamily: "monospace",
                color: "var(--text-muted)",
                marginRight: 6,
              }}
            >
              I{columnId}
            </span>
          )}
          {label}{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            ({intersection.size} items)
          </span>
        </p>
        <button
          onClick={() =>
            downloadCsv(
              ["Item"],
              intersection.items.map((i) => [i]),
              columnId != null
                ? `${baseName}_upset_I${columnId}.csv`
                : `${baseName}_upset_${intersectionFilenamePart(label)}.csv`
            )
          }
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
        {intersection.items.map((item, i) => (
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

// ── Plot controls sidebar ────────────────────────────────────────────────────

// Matches the collapsible sidebar tiles used by scatter / boxplot: header
// row with a disclosure arrow, and the content block only mounts when open.
function ControlSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        className="dv-tile-title"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
          aria-hidden="true"
        />
        {title}
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function PlotControls({
  activeSetNames,
  allSets,
  vis,
  updVis,
  chartRef,
  resetAll,
  fileName,
  intersections,
  computeAllIntersectionStats,
  clearIntersectionStats,
  computingStats,
  computeProgress,
  intersectionTestsCount,
  universeSize,
  setUniverseSize,
  universeOverridden,
  setUniverseOverridden,
  defaultUniverseSize,
  maxAllIntersectionSize,
  allIntersectionsCount,
}) {
  const baseName = fileBaseName(fileName, "upset");
  const sv = (k) => (v) => updVis({ [k]: v });
  const universeValid =
    universeSize !== "" && Number.isFinite(Number(universeSize)) && Number(universeSize) > 0;
  return (
    <PlotSidebar>
      <ActionsPanel
        onDownloadSvg={() => downloadSvg(chartRef.current, `${baseName}_upset.svg`)}
        onDownloadPng={() => downloadPng(chartRef.current, `${baseName}_upset.png`, 2)}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "Table",
            title:
              "Download the currently-plotted intersection table (Intersection, Degree, Size, + per-set flags). Matches the plot exactly — reflects sort, Top N, Minimum/Maximum degree, and Minimum size filters.",
            onClick: () => {
              const headers = ["Intersection", "Degree", "Size", ...activeSetNames];
              const rows = intersections.map((r) => {
                const label = intersectionLabel(r.setIndices, activeSetNames);
                const flags = activeSetNames.map((_, i) => (r.setIndices.includes(i) ? "1" : "0"));
                return [label, String(r.degree), String(r.size), ...flags];
              });
              downloadCsv(headers, rows, `${baseName}_upset_intersections.csv`);
            },
          },
          {
            label: "Matrix",
            title:
              "Download the membership matrix — one row per item, a 0/1 column for each active set",
            onClick: () => {
              const allItems = new Set();
              for (const n of activeSetNames) for (const item of allSets.get(n)) allItems.add(item);
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n) => (allSets.get(n).has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_upset_membership.csv`);
            },
          },
          {
            label: "All regions",
            title:
              "One CSV per currently-plotted intersection (named _I1, _I2, … matching the on-plot identifiers) plus an _index.csv mapping Id → Intersection, Degree, Size. Your browser may ask once to allow multiple downloads.",
            onClick: () => {
              if (!intersections.length) return;
              const indexHeaders = ["Id", "Intersection", "Degree", "Size"];
              const indexRows = intersections.map((inter, i) => [
                `I${i + 1}`,
                intersectionLabel(inter.setIndices, activeSetNames),
                String(inter.degree),
                String(inter.size),
              ]);
              // Staggered downloads — without the gap, browsers tend to silently
              // drop everything after the first file when a synchronous loop
              // fires multiple <a>.click() events in the same tick.
              downloadCsv(indexHeaders, indexRows, `${baseName}_upset_index.csv`);
              intersections.forEach((inter, i) => {
                setTimeout(
                  () => {
                    downloadCsv(
                      ["Item"],
                      inter.items.map((item) => [item]),
                      `${baseName}_upset_I${i + 1}.csv`
                    );
                  },
                  40 * (i + 1)
                );
              });
            },
          },
        ]}
      />

      <ControlSection title="Columns" defaultOpen>
        <div>
          <span className="dv-label">Sort by</span>
          <select
            value={vis.sortMode}
            onChange={(e) => updVis({ sortMode: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          >
            <option value="size-desc">Size (largest first)</option>
            <option value="size-asc">Size (smallest first)</option>
            <option value="degree-desc">Degree (highest first)</option>
            <option value="degree-asc">Degree (lowest first)</option>
            <option value="sets">Set order</option>
          </select>
        </div>
        <label style={{ display: "block" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">Minimum intersection size</span>
            {maxAllIntersectionSize > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                max in data: {maxAllIntersectionSize.toLocaleString()}
              </span>
            )}
          </div>
          <NumberInput
            value={vis.minSize}
            min={0}
            max={maxAllIntersectionSize > 0 ? maxAllIntersectionSize : undefined}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const cap = maxAllIntersectionSize > 0 ? maxAllIntersectionSize : v;
              updVis({ minSize: Math.max(0, Math.min(cap, v)) });
            }}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Minimum degree</span>
          <NumberInput
            value={vis.minDegree}
            min={1}
            max={Math.max(1, activeSetNames.length)}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const cap = Math.max(1, activeSetNames.length);
              const clamped = Math.max(1, Math.min(cap, v));
              const patch: { minDegree: number; maxDegree?: number } = { minDegree: clamped };
              if (vis.maxDegree != null && clamped > vis.maxDegree) patch.maxDegree = clamped;
              updVis(patch);
            }}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">Maximum degree</span>
            {activeSetNames.length > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                max in data: {activeSetNames.length.toLocaleString()}
              </span>
            )}
          </div>
          <NumberInput
            value={vis.maxDegree ?? Math.max(1, activeSetNames.length)}
            min={1}
            max={Math.max(1, activeSetNames.length)}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const cap = Math.max(1, activeSetNames.length);
              const clamped = Math.max(1, Math.min(cap, v));
              const patch: { maxDegree: number; minDegree?: number } = { maxDegree: clamped };
              if (clamped < vis.minDegree) patch.minDegree = clamped;
              updVis(patch);
            }}
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title="Labels">
        <label style={{ display: "block" }}>
          <span className="dv-label">Title</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Subtitle</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title="Display">
        <SliderControl
          label="Bar opacity"
          value={vis.barOpacity}
          min={0.3}
          max={1}
          step={0.05}
          onChange={sv("barOpacity")}
        />
        <SliderControl
          label="Dot size"
          value={vis.dotSize}
          min={3}
          max={12}
          step={1}
          onChange={sv("dotSize")}
        />
        <SliderControl
          label="Font size"
          value={vis.fontSize}
          min={8}
          max={20}
          step={1}
          onChange={sv("fontSize")}
        />
        <div>
          <div className="dv-label">Intersection size labels</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["off", "on"] as const).map((mode) => {
              const on = vis.showIntersectionLabels !== false;
              const active = mode === "on" ? on : !on;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showIntersectionLabels: mode === "on" })}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {mode === "off" ? "Off" : "On"}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="dv-label">Set size labels</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["off", "on"] as const).map((mode) => {
              const on = vis.showSetSizeLabels !== false;
              const active = mode === "on" ? on : !on;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showSetSizeLabels: mode === "on" })}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {mode === "off" ? "Off" : "On"}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="dv-label">Background</span>
          <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
        </div>
      </ControlSection>

      <ControlSection title="Statistics">
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 2,
            }}
          >
            <span className="dv-label">Universe size (N)</span>
            {universeOverridden && Number.isFinite(Number(defaultUniverseSize)) && (
              <button
                type="button"
                onClick={() => {
                  setUniverseOverridden(false);
                  setUniverseSize(defaultUniverseSize || "");
                }}
                style={{
                  fontSize: 10,
                  padding: "1px 8px",
                  background: "none",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                title="Revert to the union of uploaded items"
              >
                Reset to |∪|={defaultUniverseSize}
              </button>
            )}
          </div>
          <NumberInput
            value={universeSize}
            min={1}
            step={1}
            onChange={(e) => {
              const v = e.target.value;
              setUniverseSize(v === "" ? "" : Number(v));
              setUniverseOverridden(true);
            }}
            style={{ width: "100%" }}
          />
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            Defaults to the union of uploaded items (|∪|). Override with the genome / proteome /
            predefined background for real enrichment analyses — a smaller universe inflates
            p-values.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="dv-label">Intersection statistics</div>
          <button
            type="button"
            className="dv-btn dv-btn-primary"
            onClick={computeAllIntersectionStats}
            disabled={computingStats || !universeValid || allIntersectionsCount === 0}
            title={
              !universeValid
                ? "Set a Universe size above before computing stats"
                : computingStats
                  ? "Computing…"
                  : `Run the SuperExactTest exact test for every one of the ${allIntersectionsCount} intersections in the active set selection and BH-adjust across them. Display filters (minimum size / degree) do NOT change which intersections are tested.`
            }
            style={{
              fontSize: 12,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {computingStats ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    border: "2px solid currentColor",
                    borderRightColor: "transparent",
                    borderRadius: "50%",
                    animation: "dv-spin 0.9s linear infinite",
                  }}
                  aria-hidden="true"
                />
                Computing {computeProgress.done}/{computeProgress.total}…
              </>
            ) : intersectionTestsCount > 0 ? (
              `Recompute stats (${allIntersectionsCount} intersections)`
            ) : (
              `Compute stats (${allIntersectionsCount} intersections)`
            )}
          </button>
          {computingStats && computeProgress.total > 0 && (
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: "var(--border)",
                overflow: "hidden",
              }}
              aria-hidden="true"
            >
              <div
                style={{
                  height: "100%",
                  width: `${(computeProgress.done / computeProgress.total) * 100}%`,
                  background: "var(--accent-primary)",
                  transition: "width 120ms linear",
                }}
              />
            </div>
          )}
          {intersectionTestsCount > 0 && !computingStats && (
            <button
              type="button"
              onClick={clearIntersectionStats}
              className="dv-btn dv-btn-secondary"
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              Clear {intersectionTestsCount} cached{" "}
              {intersectionTestsCount === 1 ? "result" : "results"}
            </button>
          )}
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            Computes the exact Binomial p (upper tail, lower tail, and the headline two-sided =
            smaller tail × 2) per intersection, then BH-adjusts each family across every
            intersection in the active set selection. Display filters (minimum size / degree) only
            affect what's shown on the plot — they never change the BH family.
          </p>
          <style>{`@keyframes dv-spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        <div>
          <div className="dv-label">Significance markers</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(
              [
                ["off", "Off"],
                ["stars", "Stars"],
                ["p-value", "p-value"],
              ] as const
            ).map(([mode, label]) => {
              const current = vis.significanceDisplay || "off";
              const active = current === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ significanceDisplay: mode })}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            Only tested intersections are marked. Uses the two-sided p (smaller tail × 2, BH-
            adjusted across every test run this session), so both enrichment and depletion show up.
          </p>
        </div>

        <div>
          <div className="dv-label">Color bars by significance</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(
              [
                [false, "Off"],
                [true, "On"],
              ] as const
            ).map(([value, label]) => {
              const active = !!vis.colorBarsBySignificance === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => updVis({ colorBarsBySignificance: value })}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "var(--text-faint)",
              lineHeight: 1.4,
            }}
          >
            <span style={{ color: BAR_FILL_ENRICHED, fontWeight: 700 }}>Green</span> = enriched.{" "}
            <span style={{ color: BAR_FILL_DEPLETED, fontWeight: 700 }}>Dark red</span> = depleted.
            Both at two-sided p_adj &lt; 0.05, direction from the sign of observed − expected.
            Untested or non-significant bars stay black.
          </p>
        </div>
      </ControlSection>
    </PlotSidebar>
  );
}

// Wraps the scrollable plot card with edge fade overlays + a hint pill so a
// user who doesn't notice the browser's scrollbar still sees the content is
// scrollable. Measures the inner element with a ResizeObserver + onScroll.
// ── App ──────────────────────────────────────────────────────────────────────

const VIS_INIT_UPSET = {
  plotTitle: "",
  plotSubtitle: "",
  plotBg: "#ffffff",
  fontSize: 12,
  barOpacity: 1,
  dotSize: 6,
  sortMode: "size-desc",
  minSize: 1,
  minDegree: 1,
  // `maxDegree: null` means "no upper bound" (keep every degree). Persists
  // through loadAutoPrefs as null; the chart renders against setNames.length
  // when null.
  maxDegree: null as number | null,
  showIntersectionLabels: true,
  showSetSizeLabels: true,
  // "off" | "stars" | "p-value". Controls what (if anything) is drawn
  // above an intersection bar once the user has run the significance test
  // for that intersection. Only affects tested intersections — untested
  // bars never get a marker. Default: off (stays in the side panel only).
  significanceDisplay: "off",
  // When true, intersection bars with a cached test are coloured by
  // direction: green for significant enrichment, dark red for significant
  // depletion, black otherwise. Both tails can trigger — depletion is not a
  // dead branch (e.g. observed=0 against expected=5 gives a tiny lower-tail
  // p and a non-significant upper-tail p), so this surfaces findings the
  // star/p-value markers alone would hide.
  colorBarsBySignificance: false,
};

/* ── Intersection significance panel ────────────────────────────────────────
 *
 * Click-to-compute SuperExactTest-style multi-set intersection p-value for
 * the currently selected UpSet bar. Key design notes:
 *
 *   - Test input is the INCLUSIVE intersection count (items in all selected
 *     sets, regardless of membership in other sets). The bar height shown in
 *     the plot is the EXCLUSIVE intersection (items in ONLY these sets).
 *     Both are displayed in the panel so the user understands which is tested.
 *   - Null model is fixed-margin: each selected set is a uniformly-random
 *     subset of the universe with its observed size. User-adjustable
 *     "Universe size" governs this — defaults to the union of uploaded
 *     items, but any real gene-list analysis needs a larger background
 *     (genome, proteome). Tooltip explains the gravity of this choice.
 *   - Cache keyed on `${mask}:${universe}` so re-renders don't recompute
 *     and a universe change invalidates stale entries. BH adjustment runs
 *     across all currently-cached tests so pAdj updates live.
 *   - Exact path only — the Poisson approximation is available in stats.js
 *     but we don't expose it here; at plant-science scale the exact DP is
 *     fast enough and more accurate in the deep tail.
 */
function IntersectionStatsPanel({
  intersection,
  displaySetNames,
  sets,
  membershipMap,
  universeSize,
  intersectionTests,
}) {
  if (!intersection) return null;

  // Inclusive count: items whose bitmask covers every selected set.
  const inclusiveSize = React.useMemo(() => {
    const mask = intersection.mask;
    let count = 0;
    for (const m of membershipMap.values()) {
      if ((m & mask) === mask) count++;
    }
    return count;
  }, [intersection, membershipMap]);

  const selectedSetSizes = intersection.setIndices.map(
    (i) => (sets.get(displaySetNames[i]) || new Set()).size
  );
  const selectedSetNames = intersection.setIndices.map((i) => displaySetNames[i]);

  const universeN = typeof universeSize === "number" ? universeSize : Number(universeSize);

  const cacheKey = `${intersection.mask}:${universeN}`;
  const cachedResult = intersectionTests.get(cacheKey);

  const fmtP = (p) => {
    if (p == null || !Number.isFinite(p)) return "—";
    if (p === 0) return "0";
    if (p >= 1e-4) return p.toPrecision(4);
    return p.toExponential(3);
  };

  const sidebarSection = (label, value, tooltip = null) =>
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", gap: 16 } },
      React.createElement("span", { style: { color: "var(--text-muted)" } }, label),
      React.createElement(
        "span",
        {
          style: {
            fontFamily: "monospace",
            color: "var(--text)",
            cursor: tooltip ? "help" : undefined,
          },
          title: tooltip || undefined,
        },
        value
      )
    );

  return (
    <div
      className="dv-panel"
      style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <p className="dv-tile-title" style={{ margin: 0 }}>
          Intersection significance
        </p>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          SuperExactTest-style exact test against the fixed-margin null
        </span>
      </div>

      {(() => {
        // Expected value + direction track the EXCLUSIVE bar height — the
        // count the user actually reads off the plot. Under the independence
        // approximation each item lands in this cell with probability
        //   p_M = Π(nᵢ/N for nᵢ in insideSizes) · Π(1 − nⱼ/N for nⱼ in outsideSizes)
        // so E[exclusive] = N · p_M. Refreshes on bar selection / universe
        // change — no need to click "Compute stats" to see the direction.
        const universeFinite = Number.isFinite(universeN) && universeN > 0;
        const xExclusive = intersection.size;
        // Inside sets: the ones the bar's mask selects. Outside sets:
        // every other set in the active upload.
        const outsideSetSizes: number[] = [];
        for (let j = 0; j < displaySetNames.length; j++) {
          if (!intersection.setIndices.includes(j)) {
            outsideSetSizes.push((sets.get(displaySetNames[j]) || new Set()).size);
          }
        }
        const expected = universeFinite
          ? multisetExclusiveExpected(selectedSetSizes, outsideSetSizes, universeN)
          : NaN;
        const expectedKnown = Number.isFinite(expected);
        const direction = !expectedKnown
          ? null
          : Math.abs(xExclusive - expected) < 1e-9
            ? "neutral"
            : xExclusive > expected
              ? "enriched"
              : "depleted";
        const directionGlyph =
          direction === "enriched"
            ? "↑ enriched"
            : direction === "depleted"
              ? "↓ depleted"
              : direction === "neutral"
                ? "≈ as expected"
                : "";
        const directionColor =
          direction === "enriched"
            ? "var(--accent-plot, #1f6feb)"
            : direction === "depleted"
              ? "var(--warning-text, #b45309)"
              : "var(--text-muted)";
        const fmtExpected = (v) => {
          if (!Number.isFinite(v)) return "—";
          if (v === 0) return "0";
          if (v >= 0.01 && v < 1000) return v.toPrecision(4).replace(/\.?0+$/, "");
          return v.toExponential(3);
        };
        return (
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            {sidebarSection(
              "Sets tested",
              intersectionShortLabel(intersection.setIndices),
              selectedSetNames.join(" ∩ ")
            )}
            {sidebarSection("Set sizes (nᵢ)", selectedSetSizes.join(", "))}
            {sidebarSection(
              "Exclusive overlap (bar)",
              <span style={{ display: "inline-flex", gap: 8, alignItems: "baseline" }}>
                <span>{xExclusive}</span>
                {direction && (
                  <span style={{ fontSize: 11, color: directionColor, fontWeight: 600 }}>
                    {directionGlyph}
                  </span>
                )}
              </span>
            )}
            {expectedKnown &&
              sidebarSection(
                "Expected under null",
                <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                  <span>{fmtExpected(expected)}</span>
                  <span
                    style={{ fontSize: 10, color: "var(--text-faint)" }}
                    title={
                      "E[exclusive] = N · Π(nᵢ/N) · Π(1 − nⱼ/N) under the " +
                      "independence approximation (each item falls in each set with " +
                      "its marginal probability). Inside: sets the bar covers. " +
                      "Outside: the other uploaded sets."
                    }
                  >
                    = N · Π(nᵢ/N) · Π(1 − nⱼ/N)
                  </span>
                </span>
              )}
            {sidebarSection(
              <span style={{ color: "var(--text-faint)" }}>Inclusive overlap</span>,
              <span style={{ color: "var(--text-faint)" }}>{inclusiveSize}</span>
            )}
          </div>
        );
      })()}

      {cachedResult ? (
        // Headline two-sided p on the EXCLUSIVE bar height, followed by the
        // two one-sided tails for directional breakdown. One of the tails
        // matches the direction pill above; the other is near 1 by
        // construction.
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(() => {
            const two = cachedResult.pTwoSided;
            const twoAdj = cachedResult.pAdjTwoSided;
            const enr = Number.isFinite(cachedResult.pUpper) ? cachedResult.pUpper : cachedResult.p;
            const enrAdj = cachedResult.pAdjUpper;
            const dep = cachedResult.pLower;
            const depAdj = cachedResult.pAdjLower;
            const rowStyle = {
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              flexWrap: "wrap" as const,
              fontSize: 12,
            };
            const renderRow = (label, hint, p, pAdj) => (
              <div style={rowStyle}>
                <span
                  style={{
                    color: "var(--text-muted)",
                    minWidth: 110,
                    display: "inline-block",
                  }}
                >
                  {label}
                </span>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>p = </span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtP(p)}</span>
                </span>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>p_adj = </span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtP(pAdj)}</span>
                </span>
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{hint}</span>
              </div>
            );
            return (
              <>
                {renderRow(
                  "Two-sided",
                  "min(2·pUpper, 2·pLower, 1) — headline p, drives plot markers + bar colour",
                  two,
                  twoAdj
                )}
                {renderRow("Enrichment", "P(X ≥ bar) — Binomial(N, p_M), upper tail", enr, enrAdj)}
                {renderRow("Depletion", "P(X ≤ bar) — lower tail", dep, depAdj)}
                <span style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                  Each family BH-adjusted separately across {intersectionTests.size} intersection
                  {intersectionTests.size === 1 ? "" : "s"} cached for N={universeN}. The two-sided
                  p is the honest headline (one test per bar, no cherry-picking); the per-tail rows
                  are there for directional breakdown. The Binomial null assumes each item is
                  independently placed in every set at its marginal rate.
                </span>
              </>
            );
          })()}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No p-value for this intersection yet — use <strong>Compute stats</strong> in the sidebar
          to run the two-sided Binomial test (plus the per-tail enrichment / depletion breakdown) on
          the exclusive bar height for every intersection in the current set selection in one pass.
        </div>
      )}
    </div>
  );
}

function App() {
  const shell = usePlotToolState("upset", VIS_INIT_UPSET);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    setInjectionWarning,
    vis,
    updVis,
  } = shell;

  const [format, setFormat] = useState("wide");
  const [setNames, setSetNames] = useState<string[]>([]);
  const [sets, setSets] = useState<Map<string, Set<string>>>(new Map());
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [selectedMask, setSelectedMask] = useState<number | null>(null);
  const [allColumnNames, setAllColumnNames] = useState<string[]>([]);
  const [allColumnSets, setAllColumnSets] = useState<Map<string, Set<string>>>(new Map());
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [pendingMinDegree, setPendingMinDegree] = useState(1);
  const [pendingMaxDegree, setPendingMaxDegree] = useState<number>(Infinity);

  // Significance-test state for the selected intersection (Phase 2 of the
  // SuperExactTest-style work). The universe size defaults to the number of
  // distinct items across all uploaded sets but is user-overridable — a real
  // analysis often needs a larger background (e.g. the full genome, not just
  // the union of uploaded lists). The cache is keyed on `${mask}:${universe}`
  // so a universe-size change invalidates previously computed p-values. BH
  // adjustment runs across the cache every time a new entry is added.
  const [intersectionTests, setIntersectionTests] = useState(new Map());
  const [universeSize, setUniverseSize] = useState<number | "">("");
  const [universeOverridden, setUniverseOverridden] = useState(false);
  // Batch-compute state: `computingStats` gates the "Compute stats" button
  // (prevents double-fire mid-run); `computeProgress` drives the loader.
  const [computingStats, setComputingStats] = useState(false);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });

  const chartRef = useRef<SVGSVGElement | null>(null);

  // Sets render size-descending; rename/reorder isn't supported since the
  // uploaded file is the source of truth.
  const displaySetNames = useMemo(() => {
    const copy = setNames.slice();
    copy.sort((a, b) => (sets.get(b)?.size || 0) - (sets.get(a)?.size || 0));
    return copy;
  }, [setNames, sets]);

  const { allIntersections, membershipMap } = useMemo(() => {
    if (displaySetNames.length < 2) return { allIntersections: [], membershipMap: new Map() };
    const { membershipMap } = computeMemberships(displaySetNames, sets);
    return {
      allIntersections: enumerateIntersections(membershipMap, displaySetNames),
      membershipMap,
    };
  }, [displaySetNames, sets]);

  // Default universe = number of distinct items across all sets. When the
  // user hasn't explicitly overridden the field, track this automatically.
  const defaultUniverseSize = membershipMap.size;
  React.useEffect(() => {
    if (!universeOverridden) {
      setUniverseSize(defaultUniverseSize || "");
    }
  }, [defaultUniverseSize, universeOverridden]);

  // Chart-side lookup: only mark bars whose cached entry matches the current
  // universe size. Prior results for a different N are deliberately ignored —
  // they're stale under the active null.
  const significanceByMask = useMemo(() => {
    const m = new Map();
    const currentN = typeof universeSize === "number" ? universeSize : Number(universeSize);
    if (!Number.isFinite(currentN)) return m;
    for (const entry of intersectionTests.values()) {
      if (entry.universe === currentN) {
        m.set(entry.mask, {
          p: entry.p,
          pAdj: entry.pAdj,
          pAdjUpper: entry.pAdjUpper,
          pAdjLower: entry.pAdjLower,
          pAdjTwoSided: entry.pAdjTwoSided,
          direction: entry.direction,
        });
      }
    }
    return m;
  }, [intersectionTests, universeSize]);

  const sortedIntersections = useMemo(
    () => sortIntersections(allIntersections, vis.sortMode),
    [allIntersections, vis.sortMode]
  );

  // Largest intersection size in the current dataset (pre-filter). Drives the
  // dynamic max of the "Minimum intersection size" slider so the slider range
  // always matches what's actually on screen.
  const maxAllIntersectionSize = useMemo(
    () => allIntersections.reduce((m, r) => (r.size > m ? r.size : m), 0),
    [allIntersections]
  );

  // If the persisted minSize exceeds the current dataset's largest intersection,
  // clamp it down so the filter doesn't silently hide every bar after a
  // dataset swap (prefs persist per-tool, not per-dataset).
  // Intentionally depends only on maxAllIntersectionSize: we want to clamp
  // when the dataset changes, not on every minSize slider tick.
  React.useEffect(() => {
    if (maxAllIntersectionSize > 0 && vis.minSize > maxAllIntersectionSize) {
      updVis({ minSize: maxAllIntersectionSize });
    }
  }, [maxAllIntersectionSize]);

  const truncatedIntersections = useMemo(
    () =>
      truncateIntersections(sortedIntersections, {
        minSize: vis.minSize,
        minDegree: vis.minDegree,
        maxDegree: vis.maxDegree ?? Infinity,
      }),
    [sortedIntersections, vis.minSize, vis.minDegree, vis.maxDegree]
  );

  // Batch-compute significance for every intersection under the active set
  // selection — NOT the display-filtered subset. The minSize / minDegree /
  // maxDegree controls in the plot sidebar are purely visual; letting them
  // scope the BH family would make the multiple-testing correction depend on
  // the view, which is a real stats-validity bug (hide bars → BH adjusts over
  // a smaller family → surviving p-values look more significant). Active set
  // selection still scopes the null — that one IS a scientific choice.
  // Runs asynchronously in ~16-bar chunks with `setTimeout(0)` between them
  // so the progress bar actually animates and the browser doesn't freeze on
  // large configurations.
  const computeAllIntersectionStats = useCallback(async () => {
    if (computingStats) return;
    const universeN = typeof universeSize === "number" ? universeSize : Number(universeSize);
    if (!Number.isFinite(universeN) || universeN <= 0) return;
    // Test the EXCLUSIVE bar height. Under the independence approximation,
    // each item is in this cell with probability
    //   p_M = Π_{i∈inside}(nᵢ/N) · Π_{j∈outside}(1 − n_j/N),
    // so the count follows Binomial(N, p_M). Degree-1 bars are fine under
    // this null — "items in ONLY S_A" is a meaningful enrichment question.
    const bars = allIntersections;
    if (bars.length === 0) return;

    setComputingStats(true);
    setComputeProgress({ done: 0, total: bars.length });

    const pending = new Map(intersectionTests);
    const CHUNK_SIZE = 16;
    for (let i = 0; i < bars.length; i++) {
      const inter = bars[i];
      const insideSizes = inter.setIndices.map(
        (idx) => (sets.get(displaySetNames[idx]) || new Set()).size
      );
      const outsideSizes: number[] = [];
      for (let j = 0; j < displaySetNames.length; j++) {
        if (!inter.setIndices.includes(j)) {
          outsideSizes.push((sets.get(displaySetNames[j]) || new Set()).size);
        }
      }
      const xExclusive = inter.size;
      const expected = multisetExclusiveExpected(insideSizes, outsideSizes, universeN);
      const direction =
        !Number.isFinite(expected) || Math.abs(xExclusive - expected) < 1e-9
          ? "neutral"
          : xExclusive > expected
            ? "enriched"
            : "depleted";
      const pUpper = multisetExclusiveP(xExclusive, insideSizes, outsideSizes, universeN, {
        tail: "upper",
      });
      const pLower = multisetExclusiveP(xExclusive, insideSizes, outsideSizes, universeN, {
        tail: "lower",
      });
      // Two-sided p — textbook "double the smaller tail" convention for a
      // Binomial one-parameter test. This is the honest headline value: it
      // doesn't require the viewer to pick a tail after seeing the data
      // (cherry-picking inflates false positives), and it captures signals
      // from whichever side is surprising — significantly enriched OR
      // significantly depleted. The per-tail values stay around for anyone
      // who wants the directional breakdown (shown in the ItemList panel).
      const pTwoSided =
        Number.isFinite(pUpper) && Number.isFinite(pLower)
          ? Math.min(1, 2 * Math.min(pUpper, pLower))
          : NaN;
      const key = `${inter.mask}:${universeN}`;
      pending.set(key, {
        mask: inter.mask,
        universe: universeN,
        xExclusive,
        insideSizes,
        outsideSizes,
        expected,
        direction,
        p: pTwoSided, // headline raw p is two-sided; tails kept alongside
        pUpper,
        pLower,
        pTwoSided,
        pAdj: null,
        pAdjUpper: null,
        pAdjLower: null,
        pAdjTwoSided: null,
      });
      if ((i + 1) % CHUNK_SIZE === 0 || i === bars.length - 1) {
        setComputeProgress({ done: i + 1, total: bars.length });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // BH adjustment. The headline `pAdj` (drives plot markers + bar colour)
    // comes from the two-sided family: one test per bar, one BH pass, no
    // cherry-picking. The per-tail adjustments are kept around for the
    // directional breakdown in the ItemList panel (so a user who wants to
    // see "how significant was the enrichment side specifically" still can).
    // NaN filter guards any stale / invalid entries from an earlier batch.
    const matching = [...pending.values()].filter(
      (e) =>
        e.universe === universeN &&
        Number.isFinite(e.pUpper) &&
        Number.isFinite(e.pLower) &&
        Number.isFinite(e.pTwoSided)
    );
    const adjUpper = bhAdjust(matching.map((e) => e.pUpper));
    const adjLower = bhAdjust(matching.map((e) => e.pLower));
    const adjTwoSided = bhAdjust(matching.map((e) => e.pTwoSided));
    matching.forEach((e, j) => {
      e.pAdjUpper = adjUpper[j];
      e.pAdjLower = adjLower[j];
      e.pAdjTwoSided = adjTwoSided[j];
      e.pAdj = adjTwoSided[j]; // plot markers + bar colour key on `pAdj`
    });

    setIntersectionTests(pending);
    setComputingStats(false);
    setComputeProgress({ done: 0, total: 0 });
  }, [
    computingStats,
    universeSize,
    allIntersections,
    intersectionTests,
    sets,
    displaySetNames,
    membershipMap,
  ]);

  // Clear all cached stats — useful after a universe change if the user
  // wants to wipe stale entries before recomputing.
  const clearIntersectionStats = useCallback(() => {
    setIntersectionTests(new Map());
  }, []);

  const canNavigate = useCallback(
    (target) => {
      if (target === "upload") return true;
      if (target === "configure") return allColumnNames.length >= 2;
      if (target === "plot") {
        // When leaving configure, gate on the pending (pre-commit) selection
        // so the nav button tracks the checkboxes the user just edited.
        if (step === "configure") return pendingSelection.length >= 2;
        return displaySetNames.length >= 2;
      }
      return false;
    },
    [allColumnNames, displaySetNames, step, pendingSelection]
  );

  const commitSelection = useCallback((names, allSets) => {
    const chosen = new Map();
    names.forEach((n) => chosen.set(n, allSets.get(n)));
    setSetNames(names);
    setSets(chosen);
    setSelectedMask(null);
  }, []);

  // StepNavBar's top "Plot" tab routes via shell.setStep directly, so without
  // this intercept the user's configure-step edits (set selection + degree
  // cutoffs) would be lost. Commit the pending selection if it differs from
  // the current one and patch vis with the pending min/max degree before
  // navigating, matching what the old bottom "Plot →" button used to do.
  const navigateStep = useCallback(
    (target) => {
      if (target === "plot" && step === "configure" && pendingSelection.length >= 2) {
        const changed =
          pendingSelection.length !== setNames.length ||
          pendingSelection.some((n) => !setNames.includes(n));
        if (changed) commitSelection(pendingSelection, allColumnSets);
        updVis({
          minDegree: Math.max(1, pendingMinDegree || 1),
          maxDegree: Number.isFinite(pendingMaxDegree) ? pendingMaxDegree : null,
        });
      }
      setStep(target);
    },
    [
      step,
      pendingSelection,
      setNames,
      allColumnSets,
      commitSelection,
      setStep,
      pendingMinDegree,
      pendingMaxDegree,
      updVis,
    ]
  );

  const doParse = useCallback(
    (text, sep, fmt) => {
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const { headers, rows, injectionWarnings } = parseRaw(dc.text, sep);
      setInjectionWarning(injectionWarnings);
      if (!headers.length || !rows.length) {
        setParseError("The file appears to be empty or has no data rows.");
        return;
      }
      let parsed;
      try {
        parsed = fmt === "long" ? parseLongFormatSets(headers, rows) : parseSetData(headers, rows);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setParseError(msg || "Unable to parse set membership.");
        return;
      }
      const { setNames: sn, sets: ss } = parsed;
      if (sn.length < 2) {
        setParseError(
          fmt === "long"
            ? "Need at least 2 distinct set names in the second column."
            : "Need at least 2 non-empty set columns."
        );
        return;
      }
      setParseError(null);
      setParsedHeaders(headers);
      setParsedRows(rows);
      setAllColumnNames(sn);
      setAllColumnSets(ss);
      setPendingSelection(sn);
      commitSelection(sn, ss);
      setStep("configure");
    },
    [commitSelection]
  );

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride, format);
    },
    [sepOverride, format, doParse]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__UPSET_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFormat("wide");
    setFileName("arabidopsis_stress_5set.csv");
    doParse(text, ",", "wide");
  }, [doParse]);

  // Hand-off from the Venn tool's "Open in UpSet" nudge: replaces whatever
  // file the user had previously loaded so the UpSet view shows the same
  // dataset they were just looking at in Venn. Two delivery channels:
  //   1. postMessage from the sibling Venn iframe (when both tools live
  //      under index.html — the common case).
  //   2. sessionStorage one-shot (when Venn was opened standalone and the
  //      "Open in UpSet" link navigates the same window to upset.html).
  // Both are consumed by the same handler so behaviour is identical either
  // way; the sessionStorage entry is removed immediately so a future page
  // load with no fresh hand-off doesn't re-load stale data.
  const handleHandoff = useCallback(
    (payload) => {
      if (!payload || typeof payload.text !== "string") return;
      // Audit policy: any ingest surface must gate on FILE_LIMIT_BYTES (see
      // doc-comment in tools/shared-file-drop.js). Same-origin only after
      // the origin check on the message listener — but a 100 MB hostile
      // payload from a compromised sibling tool would freeze the main thread
      // on next load with no error UX, so reject before doParse sees the
      // bytes.
      if (payload.text.length > FILE_LIMIT_BYTES) return;
      const sep = typeof payload.sep === "string" ? payload.sep : "";
      const fmt = payload.format === "long" ? "long" : "wide";
      // Bound fileName length and strip path separators / leading dots so a
      // crafted payload can't produce a download name like "../../etc/passwd"
      // when the user later exports a CSV.
      const rawName = typeof payload.fileName === "string" ? payload.fileName : "";
      const safeName = rawName.slice(0, 255).replace(/[/\\]/g, "_").replace(/^\.+/, "");
      setFileName(safeName);
      setSepOverride(sep);
      setFormat(fmt);
      setSelectedMask(null);
      doParse(payload.text, sep, fmt);
    },
    [doParse]
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dataviz-upset-handoff");
      if (raw) {
        sessionStorage.removeItem("dataviz-upset-handoff");
        handleHandoff(JSON.parse(raw));
      }
    } catch {
      /* storage disabled — handoff just won't fire */
    }
    const onMessage = (e) => {
      if (!e || e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.type !== "dataviz-handoff") return;
      handleHandoff(d);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleHandoff]);

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(new Map());
    setParseError(null);
    setInjectionWarning(null);
    setSelectedMask(null);
    updVis({ _reset: true });
  };

  const setSizes = useMemo(() => {
    const m = new Map();
    for (const n of displaySetNames) m.set(n, (sets.get(n) || new Set()).size);
    return m;
  }, [displaySetNames, sets]);

  const selectedIntersectionIdx = truncatedIntersections.findIndex((g) => g.mask === selectedMask);
  const selectedIntersection =
    selectedIntersectionIdx >= 0 ? truncatedIntersections[selectedIntersectionIdx] : null;
  const selectedColumnId = selectedIntersectionIdx >= 0 ? selectedIntersectionIdx + 1 : null;
  const showColumnWarning = truncatedIntersections.length > 60;

  return (
    <PlotToolShell
      state={{ ...shell, setStep: navigateStep }}
      toolName="upset"
      title="UpSet plot"
      visInit={VIS_INIT_UPSET}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          format={format}
          setFormat={setFormat}
          handleFileLoad={handleFileLoad}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && allColumnNames.length >= 2 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          allColumnNames={allColumnNames}
          allColumnSets={allColumnSets}
          pendingSelection={pendingSelection}
          setPendingSelection={setPendingSelection}
          minDegree={pendingMinDegree}
          setMinDegree={setPendingMinDegree}
          maxDegree={pendingMaxDegree}
          setMaxDegree={setPendingMaxDegree}
        />
      )}

      {step === "plot" && displaySetNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              activeSetNames={displaySetNames}
              allSets={sets}
              vis={vis}
              updVis={updVis}
              chartRef={chartRef}
              resetAll={resetAll}
              fileName={fileName}
              intersections={truncatedIntersections}
              computeAllIntersectionStats={computeAllIntersectionStats}
              clearIntersectionStats={clearIntersectionStats}
              computingStats={computingStats}
              computeProgress={computeProgress}
              intersectionTestsCount={intersectionTests.size}
              universeSize={universeSize}
              setUniverseSize={setUniverseSize}
              universeOverridden={universeOverridden}
              setUniverseOverridden={setUniverseOverridden}
              defaultUniverseSize={defaultUniverseSize}
              maxAllIntersectionSize={maxAllIntersectionSize}
              allIntersectionsCount={allIntersections.length}
            />

            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {selectedMask != null && (
                <button
                  type="button"
                  onClick={() => setSelectedMask(null)}
                  className="dv-btn dv-btn-secondary"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 14,
                    zIndex: 2,
                    padding: "4px 10px",
                    fontSize: 11,
                  }}
                >
                  Clear selection
                </button>
              )}
              <ScrollablePlotCard>
                <UpsetChart
                  ref={chartRef}
                  setNames={displaySetNames}
                  setSizes={setSizes}
                  intersections={truncatedIntersections}
                  selectedMask={selectedMask}
                  onColumnClick={setSelectedMask}
                  plotTitle={vis.plotTitle}
                  plotSubtitle={vis.plotSubtitle}
                  plotBg={vis.plotBg}
                  fontSize={vis.fontSize}
                  barOpacity={vis.barOpacity}
                  dotSize={vis.dotSize}
                  showIntersectionLabels={vis.showIntersectionLabels}
                  showSetSizeLabels={vis.showSetSizeLabels}
                  significanceDisplay={vis.significanceDisplay}
                  significanceByMask={significanceByMask}
                  colorBarsBySignificance={vis.colorBarsBySignificance}
                />
              </ScrollablePlotCard>

              {showColumnWarning && (
                <div
                  style={{
                    margin: "8px 0 0",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    fontSize: 11,
                    color: "var(--warning-text)",
                  }}
                >
                  {truncatedIntersections.length} columns — dots may overlap. Raise Minimum
                  intersection size, raise Minimum degree, or lower Maximum degree to reduce.
                </div>
              )}

              {truncatedIntersections.length === 0 && (
                <div
                  style={{
                    margin: "8px 0 0",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--info-bg)",
                    border: "1px solid var(--info-border)",
                    fontSize: 11,
                    color: "var(--info-text)",
                  }}
                >
                  No intersections to show. Lower Minimum intersection size, lower Minimum degree,
                  or raise Maximum degree.
                </div>
              )}

              {selectedIntersection && (
                <IntersectionStatsPanel
                  intersection={selectedIntersection}
                  displaySetNames={displaySetNames}
                  sets={sets}
                  membershipMap={membershipMap}
                  universeSize={universeSize}
                  intersectionTests={intersectionTests}
                />
              )}

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
                  setNames={displaySetNames}
                  fileName={fileName}
                  columnId={selectedColumnId}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="UpSet plot">
    <App />
  </ErrorBoundary>
);

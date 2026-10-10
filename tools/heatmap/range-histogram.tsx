// Sidebar colour-range histogram for the Heatmap tool — a distribution strip
// of every (normalised) cell value with two draggable handles for the colour
// scale's Min / Max. Each bar is filled with the colour its values get, the
// range outside the handles is dimmed, and the clipped-cell count is shown
// live underneath.
//
// The axis is piecewise (see `histogramModel`): outliers — or a range the user
// widened past the data — live in a narrow broken-axis stub on each side, so
// one extreme value can't squash the histogram the way it squashes the
// heatmap. Bar heights use a square-root scale so thin tails stay visible;
// the exported legend histogram (chart.tsx) stays linear.
//
// This is chrome (sidebar UI), so it renders as HTML with theme variables;
// only the bar fills are palette colours, which read the same in both themes.

import { COLOR_PALETTES, DIVERGING_PALETTES, interpolateColor } from "../_core/color";
import {
  HIST_STUB_FRAC,
  colourPosition,
  fmtColorbarTick,
  histFracToValue,
  histValueToFrac,
  histogramModel,
  roundSig,
  roundSigOut,
} from "./helpers";
import type { RangeHistogramProps } from "./helpers";
import { useT } from "./i18n";

const { useEffect, useMemo, useRef, useState } = React;

// Above this many cells the heatmap repaints on release instead of on every
// animation frame of the drag — the canvas paint stops being instantaneous.
export const LIVE_DRAG_MAX_CELLS = 50000;
const HIST_H = 44;
const KNOB = 10;

type Handle = "lo" | "hi";

interface DragState {
  which: Handle;
  lo: number;
  hi: number;
  // Committed range at drag start — the axis is frozen to it so the stubs
  // can't rescale under the pointer mid-drag.
  axisLo: number;
  axisHi: number;
}

// Count of ascending `sorted` values strictly below `v`.
function countBelow(sorted: number[], v: number): number {
  let a = 0,
    b = sorted.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (sorted[m] < v) a = m + 1;
    else b = m;
  }
  return a;
}

// Count strictly above `v`.
function countAbove(sorted: number[], v: number): number {
  let a = 0,
    b = sorted.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (sorted[m] <= v) a = m + 1;
    else b = m;
  }
  return sorted.length - a;
}

export function RangeHistogram({
  sortedValues,
  vmin,
  vmax,
  palette,
  invertPalette,
  symmetricAxis,
  onChange,
}: RangeHistogramProps) {
  const tr = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const pendingRef = useRef<[number, number] | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const axisLo = drag ? drag.axisLo : vmin;
  const axisHi = drag ? drag.axisHi : vmax;
  const model = useMemo(
    () => histogramModel(sortedValues, symmetricAxis, axisLo, axisHi),
    [sortedValues, symmetricAxis, axisLo, axisHi]
  );
  const stops = useMemo(() => {
    const base = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
    return invertPalette ? [...base].reverse() : base;
  }, [palette, invertPalette]);

  if (!model) return null;

  const lo = drag ? drag.lo : vmin;
  const hi = drag ? drag.hi : vmax;
  const live = sortedValues.length <= LIVE_DRAG_MAX_CELLS;
  const minGap = (model.hi - model.lo) * 1e-3;

  const centred = DIVERGING_PALETTES.has(palette);
  const colourOf = (v: number): string =>
    interpolateColor(stops, colourPosition(v, lo, hi, centred));

  // Snap a dragged value: the axis ends map onto the data extremes exactly
  // (rounded outward so they never clip the extreme cell); anything else to
  // four significant digits.
  const snap = (v: number): number => {
    if (v <= model.outerLo) return roundSigOut(model.outerLo, -1);
    if (v >= model.outerHi) return roundSigOut(model.outerHi, 1);
    return roundSig(v);
  };

  // Apply a new value to one handle, keeping Min below Max. The handles are
  // independent — diverging palettes keep their neutral colour at 0 through
  // the two-slope colour map, not by forcing a symmetric range.
  const place = (which: Handle, v: number, cur: [number, number]): [number, number] => {
    if (which === "lo") return [Math.min(v, cur[1] - minGap), cur[1]];
    return [cur[0], Math.max(v, cur[0] + minGap)];
  };

  const commit = (range: [number, number]) => {
    pendingRef.current = range;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const p = pendingRef.current;
      if (p) onChange(p[0], p[1]);
    });
  };

  const valueAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return lo;
    const r = el.getBoundingClientRect();
    return snap(histFracToValue(model, (clientX - r.left) / (r.width || 1)));
  };

  const moveTo = (d: DragState, clientX: number) => {
    const [nlo, nhi] = place(d.which, valueAt(clientX), [d.lo, d.hi]);
    const next = { ...d, lo: nlo, hi: nhi };
    setDrag(next);
    if (live) commit([nlo, nhi]);
    return next;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const v = valueAt(e.clientX);
    // Beyond a handle → that handle; between them → the nearer one.
    const which: Handle =
      v >= hi ? "hi" : v <= lo ? "lo" : Math.abs(v - lo) <= Math.abs(v - hi) ? "lo" : "hi";
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveTo({ which, lo, hi, axisLo: vmin, axisHi: vmax }, e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag) moveTo(drag, e.clientX);
  };

  const endDrag = () => {
    if (!drag) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    pendingRef.current = null;
    onChange(drag.lo, drag.hi);
    setDrag(null);
  };

  const onKeyDown = (which: Handle) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = ((model.hi - model.lo) / 100) * (e.shiftKey ? 10 : 1);
    const cur = which === "lo" ? vmin : vmax;
    let v: number;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = roundSig(cur - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") v = roundSig(cur + step);
    else if (e.key === "Home") v = snap(model.outerLo);
    else if (e.key === "End") v = snap(model.outerHi);
    else return;
    e.preventDefault();
    const [nlo, nhi] = place(which, v, [vmin, vmax]);
    onChange(nlo, nhi);
  };

  const a = model.stubLo ? HIST_STUB_FRAC : 0;
  const b = model.stubHi ? 1 - HIST_STUB_FRAC : 1;
  const nBins = model.counts.length;
  const binW = (model.hi - model.lo) / nBins;
  const barH = (c: number): number =>
    c > 0 ? Math.max(2, Math.sqrt(c / model.maxCount) * (HIST_H - 10)) : 0;
  const pct = (f: number): string => (f * 100).toFixed(3) + "%";
  const fLo = histValueToFrac(model, lo);
  const fHi = histValueToFrac(model, hi);
  const nBelow = countBelow(sortedValues, lo);
  const nAbove = countAbove(sortedValues, hi);

  const stub = (side: Handle) => {
    const n = side === "lo" ? model.nStubLo : model.nStubHi;
    const x0 = side === "lo" ? 0 : b;
    const edge = side === "lo" ? a : b;
    const h = barH(n);
    return (
      <>
        {n > 0 && (
          <>
            <div
              style={{
                position: "absolute",
                left: pct(x0 + HIST_STUB_FRAC * 0.3),
                width: pct(HIST_STUB_FRAC * 0.4),
                bottom: 0,
                height: h,
                background: colourOf(side === "lo" ? model.outerLo : model.outerHi),
              }}
            />
            <div
              style={{
                position: "absolute",
                left: pct(x0),
                width: pct(HIST_STUB_FRAC),
                bottom: h + 1,
                textAlign: "center",
                fontSize: 9,
                color: "var(--text-muted)",
              }}
            >
              {n}
            </div>
          </>
        )}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: pct(edge),
            bottom: -6,
            transform: "translateX(-50%)",
            fontSize: 10,
            lineHeight: 1,
            color: "var(--text-faint)",
            background: "var(--surface)",
          }}
        >
          ⫽
        </div>
      </>
    );
  };

  const handle = (which: Handle, f: number, v: number) => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={tr(which === "lo" ? "heatmap.range.minAria" : "heatmap.range.maxAria")}
      aria-valuemin={model.outerLo}
      aria-valuemax={model.outerHi}
      aria-valuenow={v}
      aria-valuetext={fmtColorbarTick(v)}
      data-testid={"heatmap-range-" + which}
      onKeyDown={onKeyDown(which)}
      style={{
        position: "absolute",
        left: pct(f),
        top: 0,
        width: 14,
        height: HIST_H + KNOB + 2,
        transform: "translateX(-50%)",
        cursor: "ew-resize",
        outlineOffset: 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 6,
          top: 0,
          width: 2,
          height: HIST_H,
          background: "var(--text)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 2,
          top: HIST_H + 1,
          width: KNOB,
          height: KNOB,
          borderRadius: "50%",
          // Text colour, not the accent: the dark-theme accent is too dim to
          // read against the panel, the text colour contrasts in both themes.
          background: "var(--text)",
          border: "1px solid var(--surface)",
        }}
      />
    </div>
  );

  return (
    <div style={{ margin: "4px 0 8px" }} data-testid="heatmap-range-histogram">
      <div
        ref={trackRef}
        role="group"
        aria-label={tr("heatmap.range.aria")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: "relative",
          height: HIST_H + KNOB + 4,
          touchAction: "none",
          userSelect: "none",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: HIST_H,
            // Tinted well: a diverging palette paints near-0 bars almost
            // white, which would vanish against the plain panel.
            background: "var(--surface-sunken)",
            borderRadius: 2,
          }}
          aria-hidden="true"
        >
          {model.counts.map((c, i) =>
            c > 0 ? (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: pct(a + ((b - a) * i) / nBins),
                  width: pct((b - a) / nBins),
                  bottom: 0,
                  height: barH(c),
                  background: colourOf(model.lo + (i + 0.5) * binW),
                }}
              />
            ) : null
          )}
          {model.stubLo && stub("lo")}
          {model.stubHi && stub("hi")}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 1,
              background: "var(--border-strong)",
            }}
          />
          {/* Dim what the colour scale clips. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              width: pct(fLo),
              top: 0,
              bottom: 0,
              background: "var(--surface)",
              opacity: 0.7,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: pct(fHi),
              right: 0,
              top: 0,
              bottom: 0,
              background: "var(--surface)",
              opacity: 0.7,
            }}
          />
        </div>
        {handle("lo", fLo, lo)}
        {handle("hi", fHi, hi)}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--text-muted)",
          minHeight: 13,
        }}
        data-testid="heatmap-range-clipped"
      >
        <span>
          {nBelow > 0 ? "‹ " + tr("heatmap.range.clipped", { n: nBelow, count: nBelow }) : ""}
        </span>
        <span>
          {nAbove > 0 ? tr("heatmap.range.clipped", { n: nAbove, count: nAbove }) + " ›" : ""}
        </span>
      </div>
    </div>
  );
}

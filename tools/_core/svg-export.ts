// _core/svg-export.ts — SVG export pipeline + `Plöttr v<VERSION>` attribution
// band + `svgSafeId` NCName sanitiser.
//
// Carved out of `_core/shared.ts` in v1.6.x. The trailing `globalThis` shim
// keeps the legacy ambient surface alive for callers that still consume
// these names as globals; the shim retires when every caller imports
// directly.

// Sanitize an arbitrary string into an SVG-safe id fragment so exported
// <g id="..."> values are valid NCNames and show up as readable group
// names in Inkscape's Objects panel / XML editor. Non-alphanumerics
// become hyphens, runs are collapsed, edges trimmed, and a leading digit
// is prefixed with "_".
export function svgSafeId(s: string | null | undefined): string {
  if (s == null) return "unnamed";
  const cleaned = String(s)
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) return "unnamed";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : "_" + cleaned;
}

// Height of the reserved bottom band added to every export so the
// `Plöttr v…` attribution sits outside the plot area. Used by both
// `appendPlottrAttribution` (which extends the viewBox) and the PNG
// downloader (which sizes its raster canvas to the post-watermark
// dimensions, since the live SVG element still has the pre-watermark
// viewBox).
export const PLOTTR_ATTRIBUTION_PAD = 14;

// ── SVG export mutators ───────────────────────────────────────────────────
//
// Charts that paint to canvas for performance (currently only the volcano
// data layer above POINT_RASTERIZE_THRESHOLD) need to substitute a vector
// representation in the *exported* file, otherwise the user downloads a
// fuzzy embedded PNG instead of a crisp SVG. The chart registers a
// `mutator(clone)` callback against its live SVG element via
// `registerSvgExportMutator`; `buildExportSvg` invokes it on the clone
// before attribution is appended, after the standard style / shape-
// rendering scrub. The mutator owns the swap (typically: remove the
// raster <image>, append <circle> elements built from the same render
// records the canvas painted from).
//
// The registry is a WeakMap so an unmounting chart whose SVG element goes
// out of scope releases its entry without explicit cleanup — and the
// optional explicit `unregisterSvgExportMutator` lets a chart that
// transitions out of raster mode clear its registration immediately
// rather than wait for GC.

type ExportMutator = (svgClone: SVGElement) => void;
const _svgExportMutators: WeakMap<SVGElement, ExportMutator> | null =
  typeof WeakMap === "function" ? new WeakMap() : null;

export function registerSvgExportMutator(svgEl: SVGElement, mutator: ExportMutator): void {
  if (!_svgExportMutators || !svgEl || typeof mutator !== "function") return;
  _svgExportMutators.set(svgEl, mutator);
}

export function unregisterSvgExportMutator(svgEl: SVGElement): void {
  if (!_svgExportMutators || !svgEl) return;
  _svgExportMutators.delete(svgEl);
}

// Build a clone of `svgEl` ready for export and append the permanent
// `Plöttr v<VERSION>` attribution band at the bottom. Returns the cloned
// <svg> element — callers can serialize it to a string or read its
// updated `viewBox` / `width` / `height` attributes.
//
// Three pre-watermark transformations:
//   1. Strip the root <svg> inline `style="max-width:100%;…"` so Inkscape's
//      CSS engine doesn't collapse the computed viewport on `height: auto`.
//   2. Strip every `shape-rendering="crispEdges"` attribute (heatmap cells
//      hit Inkscape ≥1.1's cairo-renderer bug otherwise).
//   3. Run any chart-registered export mutator (see registry comment above).
//
// The watermark itself extends the viewBox (and `height` attribute, if
// present) downward by PLOTTR_ATTRIBUTION_PAD px so the plot area, axes
// and existing margins stay pixel-identical — only the canvas grows.
export function buildExportSvg(svgEl: SVGElement): SVGElement {
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.removeAttribute("style");
  clone.querySelectorAll("[shape-rendering]").forEach((el) => {
    el.removeAttribute("shape-rendering");
  });
  const mutator = _svgExportMutators ? _svgExportMutators.get(svgEl) : null;
  if (typeof mutator === "function") {
    try {
      mutator(clone);
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[plottr] SVG export mutator failed:", err);
      }
    }
  }
  appendPlottrAttribution(clone);
  return clone;
}

export function serializeSvgForExport(svgEl: SVGElement): string {
  return new XMLSerializer().serializeToString(buildExportSvg(svgEl));
}

// Append the `<g id="plottr-attribution">` wrapper containing a small
// italic `Plöttr v<VERSION>` text to the bottom-right of the SVG canvas.
// Mutates the passed-in element — pass a clone, not the live DOM node.
// Idempotent: a second call removes the prior attribution before
// re-appending, so the canvas can't grow twice.
export function appendPlottrAttribution(svgEl: SVGElement): void {
  if (!svgEl || typeof svgEl.setAttribute !== "function") return;
  const prior = svgEl.querySelector("#plottr-attribution");
  const hadPrior = !!(prior && prior.parentNode === svgEl);
  if (hadPrior && prior) prior.parentNode!.removeChild(prior);

  const vbParts = (svgEl.getAttribute("viewBox") || "").split(/[\s,]+/).map(parseFloat);
  let vbX = 0;
  let vbY = 0;
  let vbW = 0;
  let vbH = 0;
  if (vbParts.length >= 4 && vbParts.every((n) => Number.isFinite(n))) {
    vbX = vbParts[0];
    vbY = vbParts[1];
    vbW = vbParts[2];
    vbH = vbParts[3];
  } else {
    const wAttr = parseFloat(svgEl.getAttribute("width") || "");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "");
    vbW = Number.isFinite(wAttr) ? wAttr : 0;
    vbH = Number.isFinite(hAttr) ? hAttr : 0;
  }
  if (hadPrior) vbH -= PLOTTR_ATTRIBUTION_PAD;
  if (!(vbW > 0) || !(vbH > 0)) return;

  const newH = vbH + PLOTTR_ATTRIBUTION_PAD;
  svgEl.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${newH}`);
  const heightAttr = parseFloat(svgEl.getAttribute("height") || "");
  if (Number.isFinite(heightAttr)) {
    const baseHeight = hadPrior ? heightAttr - PLOTTR_ATTRIBUTION_PAD : heightAttr;
    svgEl.setAttribute("height", String(baseHeight + PLOTTR_ATTRIBUTION_PAD));
  }

  const version =
    (typeof window !== "undefined" &&
    typeof (window as Window & { __APP_VERSION__?: string }).__APP_VERSION__ === "string"
      ? (window as Window & { __APP_VERSION__?: string }).__APP_VERSION__
      : null) || "v?";
  const doc = svgEl.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc || typeof doc.createElementNS !== "function") return;
  const NS = "http://www.w3.org/2000/svg";
  const g = doc.createElementNS(NS, "g");
  g.setAttribute("id", "plottr-attribution");
  g.setAttribute("data-plottr-version", version);
  const text = doc.createElementNS(NS, "text");
  text.setAttribute("x", String(vbX + vbW - 5));
  text.setAttribute("y", String(vbY + newH - 4));
  text.setAttribute("font-size", "8");
  text.setAttribute("font-style", "italic");
  text.setAttribute("fill", "#999");
  text.setAttribute("text-anchor", "end");
  text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
  text.textContent = `Plöttr ${version}`;
  g.appendChild(text);
  svgEl.appendChild(g);
}

// ── Transitional global shim ───────────────────────────────────────────────
const _g = globalThis as Record<string, unknown>;
_g.svgSafeId = svgSafeId;
_g.PLOTTR_ATTRIBUTION_PAD = PLOTTR_ATTRIBUTION_PAD;
_g.registerSvgExportMutator = registerSvgExportMutator;
_g.unregisterSvgExportMutator = unregisterSvgExportMutator;
_g.buildExportSvg = buildExportSvg;
_g.serializeSvgForExport = serializeSvgForExport;
_g.appendPlottrAttribution = appendPlottrAttribution;

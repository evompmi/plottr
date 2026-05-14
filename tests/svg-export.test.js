// @vitest-environment happy-dom
/* global appendPlottrAttribution, serializeSvgForExport, buildExportSvg, registerSvgExportMutator, unregisterSvgExportMutator */
//
// Tests for the SVG export pipeline in tools/shared.js — specifically
// the permanent `Plöttr v<VERSION>` attribution mark appended to every
// exported chart. The watermark is the canvas-extension contract every
// tool relies on, so the invariants below are the load-bearing ones:
//
//   - The plot area / axes / existing margins are pixel-identical to
//     the live SVG; the canvas only grows downward by the attribution
//     pad.
//   - The wrapper has the exact shape Plöttr documents publicly
//     (`<g id="plottr-attribution" data-plottr-version="…">` containing
//     a single italic <text>) so consumers can strip it for journal
//     submission with a single selector.
//   - The version string is sourced from `window.__APP_VERSION__` and
//     not hard-coded, so a version bump propagates to the next export
//     without any code change.

const vm = require("vm");
const { suite, test, assert, eq, summary } = require("./harness");
const { readCoreSharedSource } = require("./helpers/_shell-test-utils");

// Load the migrated `_core/shared.ts` module into the happy-dom realm so we
// can call `serializeSvgForExport` and `appendPlottrAttribution` directly.
// `readCoreSharedSource` bundles the module to an IIFE whose trailing
// globalThis writes populate the realm globals.
const bundleSrc = readCoreSharedSource();
vm.runInThisContext(bundleSrc, { filename: "tools/_core/shared.ts" });

// Stable version stamp for the duration of the test file — production
// loads `tools/version.js` separately, but in tests we just plant a
// known value on the realm globals.
window.__APP_VERSION__ = "v1.2.3-test";

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg({ width = 800, height = 500, includeBackground = true } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("style", "max-width:100%;height:auto;display:block");
  if (includeBackground) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("id", "background");
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", "#ffffff");
    g.appendChild(rect);
    svg.appendChild(g);
  }
  document.body.appendChild(svg);
  return svg;
}

function parseViewBox(el) {
  const parts = (el.getAttribute("viewBox") || "").split(/\s+/).map(parseFloat);
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

// ── appendPlottrAttribution ───────────────────────────────────────────

suite("appendPlottrAttribution");

test("extends viewBox height by 14 and adds a single attribution group", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  appendPlottrAttribution(svg);
  const vb = parseViewBox(svg);
  eq(vb.x, 0);
  eq(vb.y, 0);
  eq(vb.w, 800);
  eq(vb.h, 514);
  const groups = svg.querySelectorAll("#plottr-attribution");
  eq(groups.length, 1);
});

test("idempotent — re-applying does not stack the band", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  appendPlottrAttribution(svg);
  appendPlottrAttribution(svg);
  appendPlottrAttribution(svg);
  eq(parseViewBox(svg).h, 514);
  eq(svg.querySelectorAll("#plottr-attribution").length, 1);
});

test("text node has the spec-mandated attributes", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  appendPlottrAttribution(svg);
  const text = svg.querySelector("#plottr-attribution text");
  assert(text, "text node should exist");
  eq(text.getAttribute("font-size"), "8");
  eq(text.getAttribute("font-style"), "italic");
  eq(text.getAttribute("fill"), "#999");
  eq(text.getAttribute("text-anchor"), "end");
  eq(text.getAttribute("font-family"), "system-ui, -apple-system, sans-serif");
  // 5 px padding from the right edge, baseline 4 px above the new bottom
  eq(text.getAttribute("x"), "795");
  eq(text.getAttribute("y"), "510");
  eq(text.textContent, "Plöttr v1.2.3-test");
});

test("group wrapper carries the version on a data attribute", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  appendPlottrAttribution(svg);
  const g = svg.querySelector("#plottr-attribution");
  eq(g.getAttribute("data-plottr-version"), "v1.2.3-test");
});

test("updates explicit height attribute when present (heatmap shape)", () => {
  const svg = makeSvg({ width: 600, height: 400 });
  svg.setAttribute("width", "600");
  svg.setAttribute("height", "400");
  appendPlottrAttribution(svg);
  eq(svg.getAttribute("height"), "414");
  eq(svg.getAttribute("width"), "600");
});

test("ignores SVGs without a usable viewBox or dimensions", () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  document.body.appendChild(svg);
  appendPlottrAttribution(svg);
  eq(svg.querySelectorAll("#plottr-attribution").length, 0);
});

test("version string falls back to v? when __APP_VERSION__ is missing", () => {
  const saved = window.__APP_VERSION__;
  delete window.__APP_VERSION__;
  try {
    const svg = makeSvg({ width: 400, height: 200 });
    appendPlottrAttribution(svg);
    const text = svg.querySelector("#plottr-attribution text");
    eq(text.textContent, "Plöttr v?");
    eq(svg.querySelector("#plottr-attribution").getAttribute("data-plottr-version"), "v?");
  } finally {
    window.__APP_VERSION__ = saved;
  }
});

// ── serializeSvgForExport ─────────────────────────────────────────────

suite("serializeSvgForExport");

test("returns a string with the Plöttr attribution wrapper", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  const out = serializeSvgForExport(svg);
  assert(out.includes('id="plottr-attribution"'), "wrapper id present");
  assert(out.includes('data-plottr-version="v1.2.3-test"'), "version data attribute present");
  assert(out.includes("Plöttr v1.2.3-test"), "version text present");
  assert(out.includes('viewBox="0 0 800 514"'), "viewBox grew by 14");
});

test("strips inline style on the root and shape-rendering attributes", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  const cells = document.createElementNS(SVG_NS, "g");
  cells.setAttribute("id", "cells");
  cells.setAttribute("shape-rendering", "crispEdges");
  svg.appendChild(cells);
  const out = serializeSvgForExport(svg);
  assert(!out.includes("max-width"), "root style stripped");
  assert(!out.includes("shape-rendering"), "shape-rendering stripped");
});

test("does NOT mutate the live SVG (only the export clone grows)", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  serializeSvgForExport(svg);
  // Live element keeps the pre-watermark viewBox, has no attribution.
  eq(parseViewBox(svg).h, 500);
  eq(svg.querySelectorAll("#plottr-attribution").length, 0);
  eq(svg.getAttribute("style"), "max-width:100%;height:auto;display:block");
});

test("existing element coordinates are unchanged in the export", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  const out = serializeSvgForExport(svg);
  // The original background rect's geometry is preserved verbatim —
  // only the canvas grew, no rescaling.
  assert(
    out.includes('width="800"') && out.includes('height="500"'),
    "background rect dimensions preserved"
  );
});

// ── SVG export mutator hook ─────────────────────────────────────────────────
//
// Charts that paint to canvas for performance register a mutator
// callback that swaps the raster <image> for vector primitives in the
// export clone. Hook is opt-in per-element via registerSvgExportMutator;
// missing registration falls through to the plain clone path.

suite("registerSvgExportMutator");

test("runs the registered mutator on the export clone, not the live SVG", () => {
  const svg = makeSvg({ width: 800, height: 500 });
  let cloneSeen = null;
  let liveSeen = null;
  registerSvgExportMutator(svg, (clone) => {
    cloneSeen = clone;
    liveSeen = svg;
    const marker = clone.ownerDocument.createElementNS(SVG_NS, "g");
    marker.setAttribute("id", "mutator-marker");
    clone.appendChild(marker);
  });
  try {
    const exported = buildExportSvg(svg);
    assert(cloneSeen != null, "mutator received the clone");
    assert(cloneSeen !== liveSeen, "mutator's clone is distinct from the live element");
    assert(
      exported.querySelector("#mutator-marker") != null,
      "mutator's mutation lands in the export clone"
    );
    assert(
      svg.querySelector("#mutator-marker") == null,
      "live SVG remains untouched by the mutator"
    );
  } finally {
    unregisterSvgExportMutator(svg);
  }
});

test("mutator runs before attribution is appended (visible to attribution layout)", () => {
  // The mutator should see a clone that already had `style` /
  // `shape-rendering` scrubbed but NOT yet been resized by
  // attribution — so it can replace a full-canvas <image> at the
  // original viewBox dimensions and the attribution band gets added
  // below without overlap.
  const svg = makeSvg({ width: 800, height: 500 });
  let viewBoxAtMutate = null;
  let attributionPresent = null;
  registerSvgExportMutator(svg, (clone) => {
    viewBoxAtMutate = clone.getAttribute("viewBox");
    attributionPresent = !!clone.querySelector("#plottr-attribution");
  });
  try {
    buildExportSvg(svg);
    eq(viewBoxAtMutate, "0 0 800 500");
    eq(attributionPresent, false);
  } finally {
    unregisterSvgExportMutator(svg);
  }
});

test("unregisterSvgExportMutator silences a previously-registered callback", () => {
  const svg = makeSvg({ width: 400, height: 300 });
  let calls = 0;
  registerSvgExportMutator(svg, () => {
    calls++;
  });
  buildExportSvg(svg);
  eq(calls, 1);
  unregisterSvgExportMutator(svg);
  buildExportSvg(svg);
  eq(calls, 1);
});

test("mutator exceptions surface to console but don't break the export", () => {
  const svg = makeSvg({ width: 400, height: 300 });
  registerSvgExportMutator(svg, () => {
    throw new Error("boom");
  });
  const origError = console.error;
  let captured = null;
  console.error = (...args) => {
    captured = args;
  };
  try {
    const exported = buildExportSvg(svg);
    // Export still produced a usable clone with attribution.
    assert(exported.querySelector("#plottr-attribution") != null, "attribution still added");
    assert(
      captured != null && String(captured.join(" ")).includes("export mutator failed"),
      "error logged via console.error"
    );
  } finally {
    console.error = origError;
    unregisterSvgExportMutator(svg);
  }
});

test("registration is keyed per element — unrelated svg unaffected", () => {
  const a = makeSvg({ width: 200, height: 100 });
  const b = makeSvg({ width: 200, height: 100 });
  let aCalls = 0;
  let bCalls = 0;
  registerSvgExportMutator(a, () => {
    aCalls++;
  });
  registerSvgExportMutator(b, () => {
    bCalls++;
  });
  buildExportSvg(a);
  eq(aCalls, 1);
  eq(bCalls, 0);
  buildExportSvg(b);
  eq(aCalls, 1);
  eq(bCalls, 1);
  unregisterSvgExportMutator(a);
  unregisterSvgExportMutator(b);
});

summary();

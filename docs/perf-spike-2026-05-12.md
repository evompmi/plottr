# Performance spike — 2026-05-12

One-off Playwright-driven timing pass. Each tool's example dataset was loaded through the same flow an end user follows (navigate → click _Try this example_ → step to plot → wait for chart). Numbers are wall-clock from Playwright, single run on the dev machine; treat anything inside 2× as a tie.

Generator: `scripts/perf-spike.mjs`. Reproducible with `node scripts/perf-spike.mjs`.

## Baselines — example dataset per tool

| Tool       | Navigate | Ingest + render | Total  |
| ---------- | -------- | --------------- | ------ |
| `boxplot`  | 101 ms   | 175 ms          | 276 ms |
| `scatter`  | 30 ms    | 190 ms          | 220 ms |
| `venn`     | 30 ms    | 110 ms          | 140 ms |
| `upset`    | 16 ms    | 119 ms          | 135 ms |
| `lineplot` | 16 ms    | 97 ms           | 113 ms |
| `aequorin` | 29 ms    | 130 ms          | 159 ms |
| `heatmap`  | 29 ms    | 189 ms          | 218 ms |
| `volcano`  | 16 ms    | 82 ms           | 98 ms  |
| `power`    | 15 ms    | 50 ms           | —      |
| `molarity` | 16 ms    | 22 ms           | —      |

_Navigate_ is `page.goto` → load event (cold cache the first time, primed for subsequent tools as the SPA chunk for `_shell` is shared). _Ingest + render_ is from clicking the example button to the chart's data layer being visible in the DOM.

## Stress tests — synthetic large-N for the suspect tools

| Tool      | Payload              | Size     | Textarea fill | Parse + render |
| --------- | -------------------- | -------- | ------------- | -------------- |
| `volcano` | 20,000 points        | 430.5 KB | 21 ms         | 1.04 s         |
| `scatter` | 5,000 points         | 67.6 KB  | 14 ms         | 346 ms         |
| `heatmap` | 1,000 rows × 30 cols | 195.3 KB | 8 ms          | 538 ms         |

_Textarea fill_ is Playwright's synchronous string assignment to the paste field — mostly a measure of CDP throughput. _Parse + render_ is the interesting number: `Parse pasted data` click → chart visible.

## Reading guide

- Compare _Parse + render_ at large N to the matching _Ingest + render_ baseline above. The ratio tells you how the tool scales: ~constant means a fixed overhead, ~linear means the render is on the critical path.
- Heatmap's example is already 500 rows × 6 columns; the stress test bumps to 1,000 × 30 (~5× cells). Volcano example is ~200 points; the stress test is 20,000 (transcriptomics-scale). Scatter example is Iris (150 rows); stress is 5,000.
- A tool that scales faster than linearly on the stress test points at an O(n²)-or-worse hot spot worth chasing. A tool that's already a multi-second baseline is a different signal — even the default user feels it.

## Findings

**The default workflows are fast.** Every tool's example dataset paints in well under 300 ms, and the calculators are essentially instant (≲ 50 ms). No tool has a baseline perf problem; the typical wet-lab user dragging a small CSV in won't notice latency anywhere.

**Volcano at transcriptomics scale (20 k points) is the one real cliff** — and the only place rasterisation paid off. Pre-rasterisation the SVG path took ~1.23 s + ~3.5 MB of `<circle>` markup; post-fix it's ~1.0 s + ~0.6 MB. See the post-fix section below for the A/B numbers and what's still on the critical path.

**Scatter at 5,000 points isn't a cliff yet.** Iris (150 pts) ingest+render is ~210 ms; 5 k pts is ~360 ms — 1.7× longer for 33× the data. Per-point DOM cost is amortised by parse + axis layout + React mount overhead. Scatter only becomes a cliff well above 10–20 k points, a less common workflow than transcriptomics-scale volcano. (Scatter shares the rasterisation threshold trivially if a future workload needs it.)

**Heatmap at 1,000 × 30 cells renders in ~530 ms** — the v1.4.0 canvas rasterisation of the cell grid is doing its job. (Caveat: the stress test pastes raw CSV and walks through configure; the default-clustering pathway may not have engaged. Properly stressing `hclust` at 1 k rows needs a follow-up that explicitly enables hierarchical clustering on the configure step.)

**Limits of this spike.** Single-run wall-clock; no JIT warmup pass; the dev machine's other processes contend. Numbers within 2× of each other are noise. The `Parse + render` figure conflates CSV parse, React mount, label layout, canvas paint, and SVG paint — to attribute each phase precisely you'd need a Chrome DevTools Performance recording.

## Post-fix — volcano rasterisation (committed)

Volcano's data layer rasterises above `POINT_RASTERIZE_THRESHOLD = 2000` points (same pattern as heatmap v1.4.0 cells). All points paint to one off-screen canvas in class-order, exported as a single `<image>` inside `<g id="data-points">`. Per-class wrappers stay as empty `<g>` elements carrying `aria-label`s so the screen-reader structure is preserved; click-to-label survives via a transparent overlay `<rect>` that finds the nearest point at the click coord.

A/B run at 20,000 points (threshold toggled between 2,000 and 99,999), averaged over 2 cold runs each:

| Mode            | Parse + render       | DOM at `data-points`            | `innerHTML` size     |
| --------------- | -------------------- | ------------------------------- | -------------------- |
| SVG (forced)    | **1,232 ms**         | 20,000 `<circle>` + 0 `<image>` | 3.55 MB              |
| Raster (active) | **1,033 ms**         | 0 `<circle>` + 1 `<image>`      | **628 KB**           |
| Δ               | **−16 % wall clock** | —                               | **5.7× smaller DOM** |

Honest interpretation: **17 % render speedup** is smaller than the initial 10× prediction — because the dominant cost at 20 k points isn't DOM construction or SVG paint, it's CSV state-machine parsing + `buildLabelLayout`'s collision check (both O(N)). Rasterisation cuts the ~200 ms of DOM + paint cost, replaces it with ~200 ms of canvas + PNG-encode, and yields a real but modest end-to-end win.

The DOM-shrink is the qualitative win: **5.7× smaller live DOM** → less browser memory + GC pressure on subsequent interactions (palette toggles, label edits). **5.7× smaller exported SVG** — a saved `.svg` for a transcriptomics-scale volcano drops from ~3.5 MB to ~600 KB, submission-friendly. Trade-off: per-point `<title>` tooltips are dropped above the threshold (the canvas has no per-point structure); the per-class `aria-label`s still describe the chart for screen readers.

Further levers if pushing wall-clock matters in a future session: (1) profile `parseRaw` on 20 k rows — the biggest remaining chunk; (2) spatially-index points before `buildLabelLayout`'s collision check; (3) switch `canvas.toDataURL` to async `convertToBlob` + `URL.createObjectURL`. None urgent at 1 s end-to-end.

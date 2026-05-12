# Performance spike — 2026-05-12

One-off Playwright-driven timing pass. Each tool's example dataset was loaded through the same flow an end user follows (navigate → click _Try this example_ → step to plot → wait for chart). Numbers are wall-clock from Playwright, single run on the dev machine; treat anything inside 2× as a tie.

Generator: `scripts/perf-spike.mjs`. Reproducible with `node scripts/perf-spike.mjs`.

## Baselines — example dataset per tool

| Tool       | Navigate | Ingest + render | Total  |
| ---------- | -------- | --------------- | ------ |
| `boxplot`  | 100 ms   | 185 ms          | 285 ms |
| `scatter`  | 19 ms    | 216 ms          | 235 ms |
| `venn`     | 29 ms    | 127 ms          | 156 ms |
| `upset`    | 33 ms    | 129 ms          | 162 ms |
| `lineplot` | 30 ms    | 81 ms           | 111 ms |
| `aequorin` | 29 ms    | 136 ms          | 165 ms |
| `heatmap`  | 30 ms    | 166 ms          | 196 ms |
| `volcano`  | 31 ms    | 123 ms          | 154 ms |
| `power`    | 53 ms    | 42 ms           | —      |
| `molarity` | 34 ms    | 19 ms           | —      |

_Navigate_ is `page.goto` → load event (cold cache the first time, primed for subsequent tools as the SPA chunk for `_shell` is shared). _Ingest + render_ is from clicking the example button to the chart's data layer being visible in the DOM.

## Stress tests — synthetic large-N for the suspect tools

| Tool      | Payload              | Size     | Textarea fill | Parse + render |
| --------- | -------------------- | -------- | ------------- | -------------- |
| `volcano` | 20,000 points        | 430.5 KB | 23 ms         | 1.23 s         |
| `scatter` | 5,000 points         | 67.6 KB  | 14 ms         | 292 ms         |
| `heatmap` | 1,000 rows × 30 cols | 195.3 KB | 9 ms          | 550 ms         |

_Textarea fill_ is Playwright's synchronous string assignment to the paste field — mostly a measure of CDP throughput. _Parse + render_ is the interesting number: `Parse pasted data` click → chart visible.

## Reading guide

- Compare _Parse + render_ at large N to the matching _Ingest + render_ baseline above. The ratio tells you how the tool scales: ~constant means a fixed overhead, ~linear means the render is on the critical path.
- Heatmap's example is already 500 rows × 6 columns; the stress test bumps to 1,000 × 30 (~5× cells). Volcano example is ~200 points; the stress test is 20,000 (transcriptomics-scale). Scatter example is Iris (150 rows); stress is 5,000.
- A tool that scales faster than linearly on the stress test points at an O(n²)-or-worse hot spot worth chasing. A tool that's already a multi-second baseline is a different signal — even the default user feels it.

## Findings

**The default workflows are fast.** Every tool's example dataset paints in well under 300 ms, and the calculators are essentially instant (19–42 ms). No tool has a baseline perf problem; the typical wet-lab user dragging a small CSV in won't notice latency anywhere.

**Volcano at transcriptomics scale is the one real cliff.** 20,000 points → 1.23 s. The example baseline is 123 ms for ~200 points; the stress is ~100× that, in ~10× the time. So volcano scales linearly with N, no O(n²) explosion — but the absolute number matters: a whole-transcriptome volcano (≥ 20k genes is the typical RNA-seq scale) makes the user wait over a second on every paint, and the exported SVG is ~10 MB of `<circle>` markup. This is the highest-leverage target.

**Scatter at 5,000 points isn't a cliff yet.** Iris (150 pts) ingest+render is 216 ms; 5k pts is 292 ms — 1.35× longer for 33× the data. The per-point DOM cost is amortised by parse + axis layout + React mount overhead. Scatter would only become a cliff well above 10–20 k points, which is a less common workflow than transcriptomics-scale volcano.

**Heatmap at 1,000 × 30 cells renders in 550 ms** — the v1.4.0 canvas rasterisation of the cell grid is doing its job. (Caveat: the stress test pastes raw CSV and walks through configure; the default-clustering pathway may not have engaged. Properly stressing `hclust` at 1 k rows needs a follow-up that explicitly enables hierarchical clustering on the configure step.)

**Limits of this spike.** Single-run wall-clock; no JIT warmup pass; the dev machine's other processes contend. Numbers within 2× of each other are noise. The `Parse + render` figure conflates CSV parse, React mount, and SVG paint — to attribute the volcano 1.23 s precisely you'd need a Chrome DevTools Performance recording with the rendering flame chart. Likely split: ~100 ms parse, ~150 ms React reconciliation, ~900 ms paint of 20 k `<circle>` + `<title>` nodes.

## Recommendation

**Rasterise volcano's data layer above ~2,000 points.** Same pattern as the heatmap v1.4.0 fix — paint the points to a `<canvas>` off-screen, embed as `<image>` inside `<g id="data-points">`, fall back to bounding-box hit testing for click-to-label and hover tooltips. Below the threshold, keep SVG circles for crisp small-N exports. Expected: drop the 1.23 s render to ~50–100 ms, shrink the exported SVG by ~50×, smoother hover. The migration playbook (hover, brush, dendrogram overlays) already exists in the heatmap codepath.

**`hclust` rewrite (naive O(n³) → NN-chain O(n²))** is a defensible second slice, but its payoff only matters at 1,000+ row heatmaps, which is at the edge of "browser-only viable" anyway. Defer until a user reports it being slow, or until the volcano work is done and we have spare cycles.

**Scatter rasterisation** is a free side-effect of the volcano work (same code structure). Apply the same threshold and ship both in the same commit.

## Reproducing

```bash
node scripts/perf-spike.mjs
# → writes docs/perf-spike-<date>.md
```

Requires `python3` on PATH (for the local file server, mirrors the e2e suite). Each tool runs in a fresh Chromium context so the SPA's tab-style keep-alive (v1.3.0) doesn't pollute measurements with previously-mounted tools.

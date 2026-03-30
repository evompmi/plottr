# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only data visualization toolbox for plant scientists. No server, no build step, no tracking. Deployed as static files via GitHub Pages. All data stays in the user's browser.

Tech stack: React 18 + Babel Standalone (runtime JSX compilation), all vendored in `/vendor/`. Tools render SVG charts from pasted CSV/TSV data.

## Running Tests

```bash
node tests/shared.test.js      # Utility function tests
node tests/parsing.test.js     # CSV/TSV parsing tests
node tests/integration.test.js # Edge cases & integration tests
```

No test framework — custom harness in `tests/harness.js` using `suite()`, `test()`, `assert()`, `eq()`, `approx()`, `throws()`, `summary()`. Exit code 1 on any failure.

## Architecture

### Tool structure
- `index.html` — landing page with 2x2 tool grid; loads tools in iframes; prefetches vendor scripts with progress bar
- `tools/aequorin.html` — Ca2+ luminescence calibration plots
- `tools/bargraph.html` — mean +/- error bar plots
- `tools/boxplot.html` — distribution plots with jittered points
- `tools/scatter.html` — XY scatter with color/size mapping

Each tool HTML is self-contained: loads vendored React/ReactDOM/Babel and shared scripts in `<head>`, then has a single `<script type="text/babel">` block with all tool logic as JSX.

### Shared code
- `tools/shared.js` — plain JS globals: color helpers, numeric detection, seeded random, axis tick generation, separator detection, CSV parsing, statistics, download helpers
- `tools/shared-components.js` — plain JS React components (`React.createElement`, NOT JSX): `ColorInput`, `FileDropZone`, `DataPreview`, SVG legend helpers

### Critical constraint: Babel Standalone scoping
**`shared-components.js` must remain plain JS (not `type="text/babel"`).** Babel Standalone evaluates external `src` scripts inside its own closure in strict mode — function declarations don't reach global scope. Shared components loaded as `text/babel` cause "X is not defined" errors at render time. Only inline `<script type="text/babel">` blocks (inside each tool HTML) can use JSX.

### Data flow
File upload/paste -> `autoDetectSep` + `fixDecimalCommas` + `parseRaw` -> `DataPreview` table -> user assigns column roles -> `computeStats`/`quartiles` -> React SVG rendering -> SVG/CSV export

### Per-tool palettes
`PALETTE` / `POINT_PALETTE` are intentionally defined per-tool (values differ), not in shared.js.

## Testing helpers

Test helpers in `tests/helpers/` load shared code into Node `vm` contexts with DOM stubs:
- `shared-loader.js` — loads `shared.js` globals
- `parsing-fns.js` — exports parsing functions
- `components-loader.js` — exports component helper functions

When adding new functions to `shared.js` or `shared-components.js`, export them in the corresponding loader for testability.

## Development workflow

No build step. Edit any `.html` or `.js` file and reload in browser. Babel compiles JSX at runtime in the browser. The 3 MB Babel Standalone runtime is the main cost — vendored locally for offline use.

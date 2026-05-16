# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only data visualization toolbox for wet-lab scientists. No server, no build step, no tracking. Deployed as static files via GitHub Pages. All data stays in the user's browser.

Tech stack: React 18 (vendored in `/vendor/`) + esbuild (build-time TSX compilation). Tools render SVG charts from pasted CSV/TSV data.

## Where to find what

This file holds repo-wide rules. Folder-scoped details live in nested `CLAUDE.md` files that Claude Code auto-loads when work touches that subtree:

- **`tools/CLAUDE.md`** — Architecture: SPA shell, per-tool folder layout, shared kernels (`_core/*.ts` — stats, shared, theme), shared plot-tool scaffold (`_shell/`), theming rules (chrome var(--\*) vs. SVG hex literals, ESLint enforcement), data flow + ingest size policy, sample-data convention, SVG export named-group conventions, statistical methodology (Welch-by-default in `selectTest`).
- **`tests/CLAUDE.md`** — Vitest runner + house-vocabulary harness, real-React-18 + happy-dom render helpers, fast-check property tests (per-tool, replaced the prior fuzz harnesses), shared CSV arbitraries / corpus, mandatory test standards for new work, per-tool test loaders.
- **`benchmark/CLAUDE.md`** — R 4.5 + SciPy cross-validation suites, regime classification (`pass` / `deep-tail` / `underflow` / `pathological` / `fail`), how to extend the grids.

If a rule applies regardless of folder (code style, build commands, the pre-commit hook, changelog policy), it stays here.

**Keep these files in sync with the current state of the tool.** When you change architecture, folder layout, conventions, build flags, test infrastructure, or any other fact described in a `CLAUDE.md`, update the matching `CLAUDE.md` in the same commit. The docs are descriptive (what exists today) — not historical (what used to be). Don't carry phrases like "the previous X was retired in favour of Y" or "pre-vN.M migration this used to be …"; rewrite to describe Y directly. If a rule used to be different and the reason still matters, capture it in the relevant `docs/release-notes/v<version>.md` instead.

## Code style & conventions

### JavaScript / TypeScript

- Use `const` / `let` — never `var`. The codebase is ES2022 throughout.
- Arrow functions preferred for callbacks; regular `function` declarations for named top-level functions.
- All `.tsx` and `.ts` files under `tools/` are type-checked with `strict: true` plus `noImplicitReturns` and `noFallthroughCasesInSwitch`. Annotate every parameter, return type, and prop bag — pure helpers (`_core/**`, `_shell/**`, `<tool>/helpers.ts`, `venn/*.ts`, …) and React-tier components alike. Every plot tool declares typed prop interfaces (`BoxplotChartProps`, `VolcanoStyleTileProps`, etc.) in its `helpers.ts` barrel.
- **The React surface is `any`-free end to end** — no `: any` annotations or destructures, no `any` inside `useState` / `useRef` generics or `Record` / `Map` value types, no `as any` / `as unknown as` escape-hatch casts — and the repo carries no `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` directives anywhere. Keep it that way: if a prop bag or a piece of component state feels unwieldy, lift the shape into a typed `interface` instead of reaching for `any`. Prop interfaces live in the tool's `helpers.ts`; component-internal state shapes (e.g. heatmap's `HoverCell` / `BrushState` / `AxisHover`) can stay local at the top of the `.tsx`. `useRef` for a DOM/SVG node is typed to that element (`useRef<SVGSVGElement>(null)` / `useRef<HTMLDivElement>(null)`), never `useRef<any>`. The remaining `as <Type>` casts in the React tier are deliberate narrowing only — literal-union casts after a runtime check, reducer-patch `Partial<…>`, `ReturnType<…>` — not escape hatches.
- The shared kernel lives as ES modules under `tools/_core/` (numerical / stats / parsing / theme). Each module emits real `export` declarations; every tool caller imports its symbols directly. `_core/*` modules have no `globalThis` side effects, except `_core/svg-export.ts`'s `_svgExportMutators` WeakMap, which is intentionally singleton-on-globalThis for cross-bundle correctness.

### Formatting (Prettier, enforced in CI)

- Print width: 100 columns
- 2-space indentation
- Double quotes for strings
- Semicolons required
- Trailing commas in ES5 positions (arrays, objects, function params)
- Arrow function parentheses always (`(x) => …`)

### Linting (ESLint flat config, enforced in CI)

- `eslint.config.js` defines three environments:
  - **Node/CommonJS** — `eslint.config.js`, `scripts/**/*.js`, `benchmark/**/*.js`, `tests/**/*.js`
  - **Browser + shared globals** — `tools/*.tsx` (TypeScript parser, React plugin)
  - **Browser + shared globals** — `tools/*.js` (any future hand-written script-scope leaf file; `no-unused-vars` and `no-redeclare` disabled because names are consumed as globals). The shared kernel lives under `tools/_core/` as TypeScript modules, so this environment now only catches occasional leaf scripts.
- Compiled outputs (`tools/boxplot.js`, etc.) and the generated `tools/shared.bundle.js` are in the `ignores` list — never lint generated files.
- `@typescript-eslint/no-unused-vars` warns on unused vars/args in `.tsx` files; prefix with `_` to suppress.

### CI checks (GitHub Actions — `.github/workflows/test.yml`)

All of the following must pass before merging:

1. `npm run lint` — ESLint
2. `npm run format:check` — Prettier dry-run
3. `npm run typecheck` — `tsc --noEmit`
4. `npm test` — full deterministic suite (every `tests/*.test.js`)
5. `npm run build` — esbuild compilation

Run them locally in this order before committing to catch issues early.

## Development workflow

```bash
npm run build          # compile every entry in package.json → tools/<…>.js (one-shot)
npm run watch          # recompile on save (~5 ms)
npm test               # run every tests/*.test.js (38 deterministic suites, 1,734 tests)
npm run typecheck      # tsc --noEmit (TypeScript type checking, no emit)
npm run lint           # ESLint
npm run format:check   # Prettier dry-run (used in CI)
npm run format         # Prettier auto-fix
npm run benchmark      # R + JS cross-validation suite
```

Edit `.tsx` source files, run build (or use watch mode), reload in browser. The compiled `.js` files are checked into git for static deployment via GitHub Pages. Do **not** edit the `.js` files directly.

### Pre-commit hook

A native git hook at `scripts/hooks/pre-commit` rebuilds and re-stages any drifted compiled outputs (`tools/**/index.js`, `tools/*.js`, `tools/*.js.map`, `tools/shared.bundle.js`, `tools/version.js`) whenever staged changes touch source that affects the build: `tools/**/*.tsx`, `tools/<tool>/helpers.ts`, `tools/_core/**`, `tools/_shell/**`, or the `scripts/build-*.js` themselves. This catches sourcemap drift at commit time instead of at CI/merge time (a real issue: `_shell/*` content is inlined into every plot tool's `.js.map` via `sourcesContent`, so a `_shell/*` edit invalidates all eight maps).

The hook installs automatically via `npm install` (`prepare` script runs `scripts/hooks/install.js`, which points `git config core.hooksPath` at `scripts/hooks/`). Bypass with `git commit --no-verify` if you genuinely need to commit without rebuilding.

## CHANGELOG.md

**Any user-visible change must be logged in `CHANGELOG.md` under `## [Unreleased]`** before the commit that ships it, using the Keep a Changelog sections (`Added` / `Changed` / `Fixed` / `Removed`). This applies to bug fixes, new features, UI tweaks, and behavior changes — not to internal refactors or test-only edits. Don't wait to be asked — update the changelog in the same commit as the code change.

**Length convention.** A changelog entry is one or two short sentences:
the _what_, optionally a tiny piece of _why_ if it isn't obvious from the title, and (where it
helps) a "regression: N tests" tag. Keep it under ~80 words. The full long-form context — root
cause, alternatives considered, file-by-file inventory, trade-offs — goes into a per-release
note under `docs/release-notes/<version>.md` linked from the version heading. The CHANGELOG is
the index, not the encyclopedia. Some older v1.0.x entries still carry long-form prose; treat
those as legacy and apply the short convention to anything new.

When you cut a release, _before_ renaming `## [Unreleased]` to the version heading, lift any
long-form prose that grew during the cycle into `docs/release-notes/v<version>.md` and shorten
the CHANGELOG bullets to point there. The release note is a normal markdown file with `##`
section headings (Added / Changed / Fixed map to `## ✨` / `## 🔧` / `## 🐛` or whatever fits
the contents) and is linked from each CHANGELOG bullet via `[`docs/release-notes/v1.x.y.md`](docs/release-notes/v1.x.y.md#anchor)`.

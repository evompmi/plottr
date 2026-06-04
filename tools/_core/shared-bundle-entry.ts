// _core/shared-bundle-entry.ts — entry point for `tools/shared.bundle.js`.
//
// Re-exports the small set of primitives that must be available to the
// static HTML pages (`index.html`, `privacy.html`, `benchmark.html`) before
// the SPA's `<script type="module">` parses: the theme wiring (for the
// no-FOUC `data-theme` flip + cross-tab sync) and the i18n wiring (for the
// `<html lang>` pin, the `LangToggle`, and `applyStaticI18n` on the landing).
//
// `scripts/build-shared.js` bundles this to a single IIFE under
// `globalName: "__plottrShared"` and appends an
// `Object.assign(globalThis, __plottrShared)` footer, so every named export
// below is reachable from the pages' inline `<script>` blocks.
export * from "./theme";
export * from "./i18n";

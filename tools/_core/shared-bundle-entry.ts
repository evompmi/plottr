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

// Register the static-page catalogs into this bundle's i18n registry so each
// page's inline script can call applyStaticI18n() against them. (The SPA
// doesn't render this copy, so these namespaces live only here.)
import { registerCatalog } from "./i18n";
import landingEn from "./i18n/landing.en";
import landingFr from "./i18n/landing.fr";
import privacyEn from "./i18n/privacy.en";
import privacyFr from "./i18n/privacy.fr";

registerCatalog("landing", "en", landingEn);
registerCatalog("landing", "fr", landingFr);
registerCatalog("privacy", "en", privacyEn);
registerCatalog("privacy", "fr", privacyFr);

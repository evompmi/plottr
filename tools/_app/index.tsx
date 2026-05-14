// tools/_app/index.tsx — single ReactDOM mount for the SPA.
//
// Replaces the per-tool `ReactDOM.createRoot(...).render(<App/>)`
// lines that 10 separate tool entries used to do under the iframe
// shell. Phase 5 wires `index.html` to load the compiled
// `tools/_app/index.js` produced from this file; until then the
// SPA is verifiable via a temporary `spa.html` (added in Phase 3).

// Side-effect imports: pull the migrated `_core/*` modules into the SPA
// bundle. Each module's trailing `globalThis.X = X` block populates the
// legacy script-scope globals that unmigrated callers (and `_shell/*`
// ambient `declare const` blocks) still rely on. Removed in the Phase-5
// cleanup, once every caller imports its symbols directly.
//
// `_core/theme.ts` is intentionally NOT imported here — `build-shared.js`
// bundles it to an IIFE that ships as `tools/shared.bundle.js`, which every
// HTML page (including the SPA's `index.html`) loads via a synchronous
// `<script>` tag before the SPA module bundle parses. Importing it here
// would double-run the top-level event-listener registrations.
//
// Order matters: shared.ts's `computeStats` depends on `tinv` from stats/dist,
// which is fine because both are resolved by esbuild at bundle time — but
// keep the stats import first so the dependency direction reads naturally.
import "../_core/stats";
import "../_core/shared";

import { App } from "./App";
import { navigate } from "./Router";

// Register the SPA's hash-router navigator so `tools/_shell/handoff.ts`'s
// `navigateToTool` can use it to switch tools in place when a cross-tool
// handoff fires (e.g. RLU-timecourse → Group Plot). When this global
// isn't set (i.e. someone loads a tool's standalone HTML directly), the
// helper falls back to a top-level `window.location.assign("<tool>.html")`.
(window as unknown as { __plottrSpaNavigate?: (key: string) => void }).__plottrSpaNavigate =
  navigate;

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}

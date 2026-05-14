// tools/_app/index.tsx — single ReactDOM mount for the SPA.

// `_core/theme.ts` is intentionally NOT imported here — `build-shared.js`
// bundles it to an IIFE that ships as `tools/shared.bundle.js`, which every
// HTML page (including the SPA's `index.html`) loads via a synchronous
// `<script>` tag before the SPA module bundle parses. Importing it here
// would double-run the top-level event-listener registrations.
//
// Stats imported first so the dependency direction (shared.ts uses `tinv`
// from stats/dist) reads naturally even though esbuild resolves both at
// bundle time.
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

// tools/_app/index.tsx — single ReactDOM mount for the SPA.
//
// Replaces the per-tool `ReactDOM.createRoot(...).render(<App/>)`
// lines that 10 separate tool entries used to do under the iframe
// shell. Phase 5 wires `index.html` to load the compiled
// `tools/_app/index.js` produced from this file; until then the
// SPA is verifiable via a temporary `spa.html` (added in Phase 3).

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

// tools/_app/index.tsx — single ReactDOM mount for the SPA.
//
// Replaces the per-tool `ReactDOM.createRoot(...).render(<App/>)`
// lines that 10 separate tool entries used to do under the iframe
// shell. Phase 5 wires `index.html` to load the compiled
// `tools/_app/index.js` produced from this file; until then the
// SPA is verifiable via a temporary `spa.html` (added in Phase 3).

import { App } from "./App";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}

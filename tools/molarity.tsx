// tools/molarity.tsx — standalone-mount entry. The actual `App`
// component lives in `./molarity-app.tsx` so the SPA shell
// (`tools/_app/`) can import it without re-running the mount side
// effect; see `tools/boxplot/index.tsx` for the rationale.

import { App } from "./molarity-app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Molarity calculator">
    <App />
  </ErrorBoundary>
);

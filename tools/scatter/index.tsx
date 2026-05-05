// tools/scatter/index.tsx — standalone-mount entry. See
// tools/boxplot/index.tsx for the rationale: keeping mount and the
// `App` definition in separate files lets the SPA shell import App
// without re-running the mount side effect, and lets esbuild emit a
// classic-script-friendly bundle (no top-level `export`).

import { App } from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Scatter plot">
    <App />
  </ErrorBoundary>
);

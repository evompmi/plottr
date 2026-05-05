// tools/volcano/index.tsx — standalone-mount entry. See
// tools/boxplot/index.tsx for the rationale.

import { App } from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Volcano plot">
    <App />
  </ErrorBoundary>
);

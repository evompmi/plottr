// tools/power.tsx — standalone-mount entry. The actual `App` component
// lives in `./power-app.tsx`; see `tools/boxplot/index.tsx` for the
// rationale.

import { App } from "./power-app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Power calculator">
    <App />
  </ErrorBoundary>
);

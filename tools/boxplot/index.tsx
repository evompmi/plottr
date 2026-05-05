// tools/boxplot/index.tsx — standalone-mount entry for the Group Plot
// tool. This file is the esbuild entry point that produces
// `tools/boxplot/index.js` for the per-tool HTML to load. The actual
// `App` component lives in `./app.tsx` so the SPA shell
// (`tools/_app/`) can import it without re-running the mount side
// effect.
//
// Keep this file's only top-level statements to (a) the import and
// (b) the mount call. Anything else would force esbuild to emit a
// top-level `export` in the compiled output, which classic-script
// loading in `tools/boxplot.html` and the vm.runInThisContext loader
// in `tests/helpers/render-loader.js` both refuse.

import { App } from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Boxplot">
    <App />
  </ErrorBoundary>
);

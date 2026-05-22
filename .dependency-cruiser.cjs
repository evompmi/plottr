// Module-graph enforcement for the four-tier rule documented in
// docs/architecture.md §3:
//
//   tools/_core/    pure kernel  ──┐
//   tools/_shell/   scaffold   ──► imports _core, not tools, not _app
//   tools/<tool>/   plot tool  ──► imports _core + _shell, not _app
//   tools/_app/     SPA shell  ──► imports _core (side-effect) + tools
//                                   (via React.lazy dynamic imports)
//
// Arrows point upward only. Violations of those rules used to be a
// convention; this config promotes them to a hard CI gate.
//
// Run with `npm run lint:boundaries`; CI fails on any rule reaching
// `severity: "error"`. Only the dependency graph under `tools/` is
// scanned — tests deliberately reach across layers and are not
// covered by the layering rule.

const TOOL_FOLDERS = "(aequorin|boxplot|gff|heatmap|lineplot|scatter|upset|venn|volcano)";
const CALCULATOR_FILES = "(molarity-app|power-app)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-stays-pure",
      severity: "error",
      comment:
        "tools/_core/ is the kernel. It must not import from tools/_shell/, " +
        "any tool folder, or tools/_app/. See docs/architecture.md §3.",
      from: { path: "^tools/_core/" },
      to: {
        path:
          "^tools/(_shell|_app|" +
          TOOL_FOLDERS.slice(1, -1) +
          "|" +
          CALCULATOR_FILES.slice(1, -1) +
          ")(/|\\.tsx?$)",
      },
    },
    {
      name: "shell-stays-below-tools",
      severity: "error",
      comment:
        "tools/_shell/ is the component-tier scaffold. It may import from " +
        "tools/_core/ but never from a tool folder or from tools/_app/. " +
        "See docs/architecture.md §3.",
      from: { path: "^tools/_shell/" },
      to: {
        path:
          "^tools/(_app|" +
          TOOL_FOLDERS.slice(1, -1) +
          "|" +
          CALCULATOR_FILES.slice(1, -1) +
          ")(/|\\.tsx?$)",
      },
    },
    {
      name: "tools-do-not-reach-into-app",
      severity: "error",
      comment:
        "Plot tools and calculators import from tools/_core/ and " +
        "tools/_shell/ but must not reach into the SPA shell " +
        "(tools/_app/). The SPA shell is the importer, not the importee. " +
        "See docs/architecture.md §3.",
      from: {
        path: ["^tools/" + TOOL_FOLDERS + "/", "^tools/" + CALCULATOR_FILES + "\\.tsx$"],
      },
      to: { path: "^tools/_app/" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular imports indicate a layering violation; lift the shared " +
        "piece up a tier instead of crossing back.",
      from: { pathNot: "^node_modules/" },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        // Compiled outputs that ship to GitHub Pages — checked into git
        // so the static deploy works, but not part of the source graph.
        "^tools/_app/index\\.js(\\.map)?$",
        "^tools/_app/chunks/",
        "^tools/shared\\.bundle\\.js$",
        "^tools/version\\.js$",
        // Tests reach across layers by design (loaders bundle helpers
        // from every tier into one vm context). Not subject to the
        // four-tier rule.
        "^tests/",
        // Vendored / generated / scratch.
        "^vendor/",
        "^node_modules/",
        "^test-results/",
        "^playwright-report/",
        "^\\.stryker-tmp/",
        "^reports/",
      ],
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["main", "types"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

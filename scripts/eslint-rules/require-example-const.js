// Custom ESLint rule: every plot tool's `app.tsx` must declare a top-level
// `const EXAMPLE_CSV = ...` or `const EXAMPLE_TSV = ...`.
//
// Why: per CLAUDE.md "Sample-data convention", every plot tool exposes a
// "Try sample data" button whose handler reads from `EXAMPLE_CSV` /
// `EXAMPLE_TSV`. Centralising the binding name has two payoffs:
//
//   - Grep-discoverable. New contributors find every example dataset in
//     the codebase with `grep -nE "^const EXAMPLE_(CSV|TSV)" tools/*/app.tsx`.
//   - Single failure mode. A typo in the const name (`EXMPLE_CSV`) trips
//     the linter at edit time, instead of producing a "Try sample data"
//     button that silently does nothing in production. (The historical
//     bug class — sample-data buttons broken in the iframe→SPA migration
//     because per-tool example scripts were no longer loaded — is the
//     reason this convention exists.)
//
// Scope: enabled only on `tools/*/app.tsx` via the eslint.config.js
// `files:` glob. Calculator app files (`tools/<calc>-app.tsx`) are
// excluded — they don't have a sample-data button.
//
// What counts: any top-level `VariableDeclaration` with at least one
// declarator whose `id` is `EXAMPLE_CSV` or `EXAMPLE_TSV`. Initializer
// shape doesn't matter — template literal, IIFE-returning string, or a
// computed expression all qualify (the existing tools cover all three).

"use strict";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Plot-tool app.tsx files must declare `const EXAMPLE_CSV = ...` or " +
        "`const EXAMPLE_TSV = ...` at module top level. The 'Try sample " +
        "data' button reads from this name, and the convention keeps the " +
        "datasets grep-discoverable across the codebase.",
    },
    messages: {
      missing:
        "Plot-tool app.tsx must declare a top-level `const EXAMPLE_CSV = ...` " +
        "or `const EXAMPLE_TSV = ...`. The 'Try sample data' button reads " +
        "from this name; missing → button silently no-ops in production. " +
        "See tools/CLAUDE.md 'Sample-data convention'.",
    },
    schema: [],
  },

  create(context) {
    return {
      "Program:exit"(node) {
        for (const stmt of node.body) {
          if (stmt.type !== "VariableDeclaration") continue;
          for (const decl of stmt.declarations) {
            if (!decl.id || decl.id.type !== "Identifier") continue;
            if (decl.id.name === "EXAMPLE_CSV" || decl.id.name === "EXAMPLE_TSV") {
              return;
            }
          }
        }
        context.report({ node, messageId: "missing" });
      },
    };
  },
};

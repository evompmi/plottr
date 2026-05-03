#!/usr/bin/env node
// Runs the two watch loops plottr needs — `scripts/build-shared.js --watch`
// for the shared-*.js concatenation bundle AND esbuild --watch for the .tsx
// compilation — in a single foreground process.
//
// Prior `npm run watch` only invoked esbuild. Edits to `tools/shared-*.js`
// regenerated the individual files but left `tools/shared.bundle.js` (the
// artefact every HTML actually loads) stale until someone manually ran
// `npm run build:shared`, silently breaking the dev loop for shared-file
// edits. This wrapper ensures both tracks stay live.
//
// Single-process layout is important: an orphaned `build-shared --watch`
// child left running after Ctrl-C wedges the next `npm run build` when the
// watcher is mid-rebuild. We propagate SIGINT / SIGTERM and wait for both
// children to exit before we do.

const { spawn } = require("child_process");
const path = require("path");

const ESBUILD_ENTRYPOINTS = [
  "tools/boxplot/index.tsx",
  "tools/scatter.tsx",
  "tools/aequorin/index.tsx",
  "tools/lineplot.tsx",
  "tools/venn/index.tsx",
  "tools/heatmap/index.tsx",
  "tools/molarity.tsx",
  "tools/power.tsx",
  "tools/upset.tsx",
];

const ESBUILD_FLAGS = [
  "--bundle",
  "--format=esm",
  "--outdir=tools",
  "--jsx=transform",
  "--minify-syntax",
  "--minify-whitespace",
  "--sourcemap",
  // `--watch=forever` (vs bare `--watch`) prevents esbuild from exiting the
  // moment its stdin stream closes — that happens when this script itself is
  // launched detached from a TTY (e.g. inside a CI job, `npm run watch &`, or
  // most IDE terminals that don't forward stdin to background npm processes).
  "--watch=forever",
];

const esbuildBin = path.join(__dirname, "..", "node_modules", ".bin", "esbuild");

const children = [
  spawn(process.execPath, [path.join(__dirname, "build-shared.js"), "--watch"], {
    stdio: "inherit",
  }),
  spawn(esbuildBin, [...ESBUILD_ENTRYPOINTS, ...ESBUILD_FLAGS], {
    stdio: "inherit",
  }),
];

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (c && !c.killed) c.kill(signal || "SIGTERM");
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// If either child dies (e.g. the user kills just esbuild), tear the whole
// process down so `npm run watch` stays a single-supervisor command.
children.forEach((c, i) => {
  c.on("exit", (code, signal) => {
    if (!shuttingDown) {
      const label = i === 0 ? "build-shared" : "esbuild";
      process.stderr.write(
        `[watch] ${label} exited (${signal || `code ${code}`}); shutting down.\n`
      );
      shutdown("SIGTERM");
    }
  });
});

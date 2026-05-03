#!/usr/bin/env node
// Sequential test runner. Replaces the long `node tests/x.test.js && node
// tests/y.test.js && …` chain that used to live in package.json's `test`
// script with a tiny Node wrapper that streams each suite's output to
// stdout AND tees the combined output to `.test-output.log` so the
// `posttest` badge-bump script can read pass counts without re-running
// the suite (which would recurse via `posttest` again).
//
// First failing suite short-circuits the chain (matches the prior `&&`
// behaviour); the wrapper exits with that suite's exit code so CI and
// `pretest` consumers see the same signal as before.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Canonical test order — additions go here only. The CHANGELOG / CI
// badge-verify step still consume this script's stdout exactly the way
// they consumed the old chain, so there's no other place to edit.
const TESTS = [
  "tests/shared.test.js",
  "tests/parsing.test.js",
  "tests/integration.test.js",
  "tests/components.test.js",
  "tests/power.test.js",
  "tests/stats.test.js",
  "tests/stats-dispatch.test.js",
  "tests/r-export.test.js",
  "tests/formula-injection.test.js",
  "tests/prefs.test.js",
  "tests/upset.test.js",
  "tests/scatter.test.js",
  "tests/heatmap.test.js",
  "tests/aequorin.test.js",
  "tests/lineplot.test.js",
  "tests/venn.test.js",
  "tests/boxplot-stats-reducer.test.js",
  "tests/boxplot-helpers.test.js",
  "tests/handoff.test.js",
  "tests/write-version.test.js",
];

const repoRoot = path.join(__dirname, "..");
const logPath = path.join(repoRoot, ".test-output.log");

const buf = [];
let exitCode = 0;

for (const t of TESTS) {
  const r = spawnSync("node", [t], { cwd: repoRoot, encoding: "utf8" });
  // Stream so `npm test` still feels live; buffer for the log.
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  buf.push(r.stdout || "", r.stderr || "");
  if (r.status !== 0) {
    exitCode = r.status || 1;
    break;
  }
}

try {
  fs.writeFileSync(logPath, buf.join(""));
} catch {
  /* swallow — auto-bump degrades gracefully if the log isn't writable */
}

process.exit(exitCode);

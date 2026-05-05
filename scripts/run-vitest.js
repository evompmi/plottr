#!/usr/bin/env node
// Wraps `vitest run` so its stdout / stderr is teed to `.test-output.log`
// while still streaming to the terminal in real time. The
// `posttest` hook (`scripts/bump-test-count.js`) reads that file to
// update the landing-page test-count badge — without the tee the badge
// would silently drift on every test addition.
//
// Replaces the old `scripts/run-tests.js` chained-`node` wrapper now
// that the harness has been ported to Vitest. The exit code of vitest
// is propagated unchanged so CI / pre-commit / `&&`-style chains see
// the same signal as before.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const logPath = path.join(repoRoot, ".test-output.log");
const logStream = fs.createWriteStream(logPath);

// The vitest CLI ships in a binary under `node_modules/.bin/vitest`. We
// invoke it via Node's resolution so we don't depend on PATH (matches
// how `npx vitest` would resolve it but without the npx wrapping cost).
const vitestBin = require.resolve("vitest/vitest.mjs");

const child = spawn(process.execPath, [vitestBin, "run", ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: ["inherit", "pipe", "pipe"],
  // `--color=always` would force ANSI in the captured log; we leave the
  // child's TTY detection alone so the file gets clean text and the
  // terminal still gets colours.
  env: { ...process.env, FORCE_COLOR: "0" },
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on("exit", (code) => {
  logStream.end();
  process.exit(code || 0);
});

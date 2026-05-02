#!/usr/bin/env node
// Auto-bumps the "N internal tests" badge on the landing page from the
// captured `.test-output.log` produced by `scripts/run-tests.js`. Wired
// to `posttest` in package.json so it fires automatically after every
// successful `npm test`. CI's separate badge-verify step in test.yml
// stays in place as a backstop in case the contributor forgets to
// commit the auto-bumped index.html.
//
// Side effects:
//   - Reads .test-output.log (skips silently if missing — first run, or
//     when `npm test` was driven from CI's tee-to-test-output.log path
//     which doesn't go through run-tests.js).
//   - Reads tools/version.js… no, just index.html. Two spots — the
//     trust-badge `title=` attribute and the footer `<p>N internal
//     tests</p>`. The CI verification step parses the footer copy.
//
// Exits 0 on no-op, on successful rewrite, AND on degraded paths (no
// log, malformed log) — the `posttest` hook isn't a place to fail builds.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const logPath = path.join(repoRoot, ".test-output.log");
const indexPath = path.join(repoRoot, "index.html");

if (!fs.existsSync(logPath)) {
  // Fresh checkout, or `npm test` was invoked outside run-tests.js. The
  // CI badge-verify step still catches drift; we just can't auto-bump
  // here without test output to read.
  process.exit(0);
}

const log = fs.readFileSync(logPath, "utf8");

// Sum the per-suite "X/X passed" lines exactly the way CI does
// (test.yml lines 42-50). The harness prints `  X/X passed` after each
// suite; the sum across all suites is the canonical deterministic count.
let total = 0;
const re = /^\s*(\d+)\/\d+ passed\s*$/gm;
let match;
while ((match = re.exec(log)) !== null) {
  total += Number(match[1]);
}
if (total === 0) {
  // Either the suite never ran or the log shape changed. Either way,
  // don't touch index.html — silent no-op.
  process.exit(0);
}

const html = fs.readFileSync(indexPath, "utf8");

// Two spots: the trust-badge `title=` attribute (single-line tooltip
// that includes the test count alongside R cross-checks) and the
// footer `<p>N internal tests</p>` (the visible badge). Parse the
// current claim from the footer — it's the canonical reference.
const footerRe = /<p>(\d+) internal tests<\/p>/;
const footerMatch = html.match(footerRe);
if (!footerMatch) {
  // Page restructured; skip rather than guess where to write.
  process.exit(0);
}
const claimed = Number(footerMatch[1]);

if (claimed === total) {
  // Already in sync. No write, no log noise.
  process.exit(0);
}

// Rewrite both spots in lockstep.
const titleRe = /title="(\d+) internal tests, (\d+) cross-checks vs R ([\d.]+)"/;
const updated = html
  .replace(footerRe, `<p>${total} internal tests</p>`)
  .replace(
    titleRe,
    (_m, _n, x, r) => `title="${total} internal tests, ${x} cross-checks vs R ${r}"`
  );

if (updated !== html) {
  fs.writeFileSync(indexPath, updated);
  console.log(`[bump-test-count] index.html badge bumped: ${claimed} → ${total}`);
}

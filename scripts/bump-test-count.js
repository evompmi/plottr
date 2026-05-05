#!/usr/bin/env node
// Auto-bumps the "N internal tests" badge on the landing page from the
// captured `.test-output.log` produced by `scripts/run-vitest.js`. Wired
// to `posttest` in package.json so it fires automatically after every
// successful `npm test`. CI's separate badge-verify step in test.yml
// stays in place as a backstop in case the contributor forgets to
// commit the auto-bumped index.html.
//
// Vitest reporter shape (verbose, default):
//
//   ✓ tests/stats.test.js (209 tests) 1234ms
//   …
//   Test Files  24 passed (24)
//        Tests  1057 passed (1057)
//        ...
//
// We parse the `Tests  N passed` line as the canonical deterministic
// count. The historical pre-Vitest format ("X/X passed" per suite,
// summed across suites) is also matched as a fallback so checkouts
// upgraded mid-cycle don't have to flush the log to bump the badge.
//
// Side effects:
//   - Reads .test-output.log (skips silently if missing — fresh
//     checkout, or `npm test` was invoked outside the wrapper).
//   - Rewrites index.html in two spots: the trust-badge `title=`
//     attribute and the footer `<p>N internal tests</p>`. CI's
//     verification step parses the footer copy.
//
// Exits 0 on no-op, on successful rewrite, AND on degraded paths (no
// log, malformed log) — the `posttest` hook isn't a place to fail builds.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const logPath = path.join(repoRoot, ".test-output.log");
const indexPath = path.join(repoRoot, "index.html");

if (!fs.existsSync(logPath)) {
  // Fresh checkout, or `npm test` was invoked outside the wrapper. The
  // CI badge-verify step still catches drift; we just can't auto-bump
  // here without test output to read.
  process.exit(0);
}

// Strip ANSI escape sequences before regex matching. Vitest's verbose
// reporter wraps the totals line in colour codes
// (`<ESC>[2m      Tests <ESC>[22m <ESC>[1m<ESC>[32m1056 passed<ESC>[39m`),
// which would defeat the `^\s*Tests` anchor in the parser below. The
// wrapper sets `FORCE_COLOR=0` but several picocolors / chalk variants
// also honour `NO_COLOR`, `CI`, or TTY detection differently across
// platforms — stripping ANSI here is the robust fix.
// eslint-disable-next-line no-control-regex
const log = fs.readFileSync(logPath, "utf8").replace(/\x1b\[[0-9;]*m/g, "");

let total = 0;

// Vitest's verbose reporter emits a single canonical
// `Tests  N passed (N)` summary line at the bottom of the run. Match
// it case-insensitively (in case future versions tweak the casing) and
// be lenient about whitespace.
const vitestRe = /^\s*Tests\s+(\d+)\s+passed/im;
const vitestMatch = log.match(vitestRe);
if (vitestMatch) {
  total = Number(vitestMatch[1]);
}

// Fallback: pre-Vitest "X/X passed" per-suite footer sum. Lets a
// developer who upgraded mid-cycle still get a correct badge bump
// without re-running tests.
if (total === 0) {
  const legacyRe = /^\s*(\d+)\/\d+ passed\s*$/gm;
  let match;
  while ((match = legacyRe.exec(log)) !== null) {
    total += Number(match[1]);
  }
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

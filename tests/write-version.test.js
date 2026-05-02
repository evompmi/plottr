// Unit tests for scripts/write-version.js — the CHANGELOG → version
// regex that drives the landing-page badge. This file is deploy-pipeline
// critical: the regex is the single point of failure for every future
// Pages deploy showing the right number (closed the git-describe race
// in commit 4863413). A silent regex regression on a CHANGELOG-format
// drift would re-introduce the race, so pin the contract here.

const { suite, test, eq, summary } = require("./harness");
const { parseLatestVersion } = require("../scripts/write-version");

suite("write-version.js — parseLatestVersion");

test("typical case: picks the first concrete release after Unreleased", () => {
  const md = `# Changelog

## [Unreleased]

### Fixed

- something

## [1.0.5] - 2026-05-02

### Changed

- earlier release

## [1.0.4] - 2026-05-02

### Added

- older release
`;
  eq(parseLatestVersion(md), "v1.0.5");
});

test("the [Unreleased] heading at the top is skipped", () => {
  // Regression guard: the regex's digit-only group can't match
  // 'Unreleased', but a careless future relaxation could (e.g.
  // someone using `[\w.]+` instead of `\d+\.\d+\.\d+`).
  const md = `## [Unreleased]\n\n## [1.0.5] - 2026-05-02\n`;
  eq(parseLatestVersion(md), "v1.0.5");
});

test("no concrete release yet (Unreleased only) returns null", () => {
  const md = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- nothing released yet\n`;
  eq(parseLatestVersion(md), null);
});

test("malformed CHANGELOG (no headings at all) returns null", () => {
  eq(parseLatestVersion(""), null);
  eq(parseLatestVersion("not a changelog"), null);
});

test("pre-release tags (1.0.0-beta) intentionally do NOT match", () => {
  // Pre-releases shouldn't paint the public badge — they fall through
  // to the git-describe fallback. Documented in the script's comment.
  const md = `## [Unreleased]\n\n## [1.1.0-beta] - 2026-06-01\n\n## [1.0.5] - 2026-05-02\n`;
  eq(parseLatestVersion(md), "v1.0.5");
});

test("date-format drift (parens instead of dash) intentionally does NOT match", () => {
  // The regex anchors on `## [X.Y.Z]` only — the date suffix isn't
  // captured, so a contributor experimenting with `## [1.0.6] (date)`
  // still parses correctly.
  const md = `## [Unreleased]\n\n## [1.0.6] (2026-06-15)\n\n## [1.0.5] - 2026-05-02\n`;
  eq(parseLatestVersion(md), "v1.0.6");
});

test("non-string input is coerced safely (null, undefined, number)", () => {
  // Defensive contract — fs.readFileSync always returns a string, but
  // the helper survives accidental misuse rather than throwing into
  // the prebuild pipeline.
  eq(parseLatestVersion(null), null);
  eq(parseLatestVersion(undefined), null);
  eq(parseLatestVersion(0), null);
});

test("only matches at line start (^ anchored), not inline references", () => {
  // A bullet that mentions a previous version like "fixes the v1.0.3
  // regression" must not be picked up as the current release.
  const md = `## [Unreleased]\n\n- Fixes the [1.0.3] regression\n\n## [1.0.5] - 2026-05-02\n`;
  eq(parseLatestVersion(md), "v1.0.5");
});

summary();

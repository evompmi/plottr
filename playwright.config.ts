// Playwright config for Plöttr's e2e suite.
//
// Why this exists: the existing test pyramid (deterministic unit tests +
// fuzz harnesses + R-cross-validation benchmark) catches "doesn't throw"
// and verifies pure helpers, but it can't catch "renders the wrong
// chart" — exactly the class of bug the v1.2.0 volcano colorNs glitch
// turned out to be (chart paint disagreed with state, only surfaced via
// user testing). The e2e suite covers a handful of golden-path flows in
// a real browser, asserting the post-paint DOM matches expected colours
// / labels / SVG-group structure.
//
// Local: `npm run e2e` (auto-starts a python http.server on :8765
// against the repo root, runs Chromium against the static files).
//   First run: `npm run e2e:install` once to download browser binaries.
// CI: same, with `--reporter=github` for inline annotations on PRs.

import { defineConfig, devices } from "@playwright/test";

const PORT = 8765;

export default defineConfig({
  testDir: "./e2e",
  // Each spec runs in its own worker by default — we keep that since
  // there's no shared server state. Tests within a spec also run in
  // parallel where possible (Playwright handles browser-context
  // isolation automatically).
  fullyParallel: true,
  // Fail the build on test.only left in committed code.
  forbidOnly: !!process.env.CI,
  // No flake retries locally; one retry on CI in case the python server
  // is slow to wake up. The suite is designed so any retry-flakiness
  // means a real bug — investigate before bumping this.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"]],

  // Auto-spin a static file server. Python is the most portable choice
  // (preinstalled on macOS / every Linux runner); no Node deps needed.
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    // Page loads inherit prefers-color-scheme: light unless the spec
    // overrides via `colorScheme: "dark"` on the test fixture. The
    // theme toggle in the topbar is what most specs exercise.
    colorScheme: "light",
    // No video by default — too noisy for the assertion-style tests we
    // write here. Trace lands on retry so failures are debuggable.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Chromium-only for now — every plot tool's chart is plain SVG (no
  // engine-specific quirks), and adding webkit / firefox triples the CI
  // wall time without finding new bugs. Add a second engine here if a
  // future regression turns out to be browser-specific.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

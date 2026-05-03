#!/usr/bin/env node
// Maintains the anti-clickjacking snippet at the top of every HTML file
// in the repo. Closes Tier A #3 from docs/security_audit_02-05-2026.md:
// GitHub Pages doesn't let us set HTTP headers (no `X-Frame-Options`,
// no `frame-ancestors` CSP), and the meta-tag form of `frame-ancestors`
// is deliberately ignored by browsers — so an inline frame-buster is
// the only option on this deployment shape.
//
// Behaviour of the snippet (same logic in every HTML):
//   - Default: hide `<html>` via `visibility: hidden` (set in a `<style
//     id="dv-anti-clickjack">` block) until JS confirms we're not in a
//     hostile frame.
//   - Standalone tab (`window.top === window.self`) → reveal.
//   - Same-origin iframe (e.g. landing page hosting a tool, or a tool
//     embedded by another project on the same GitHub Pages origin) →
//     reveal. Allowlist is "URL(document.referrer).origin === own".
//   - Cross-origin frame, OR no referrer (referrer-policy strict) →
//     `window.stop()` + replace `document.documentElement.innerHTML`
//     with a tiny static "Open in a top-level tab" page. No React, no
//     other scripts; the user gets a single click that lands them on
//     the same URL in a new tab.
//
// Trade-off the audit accepted: legitimate cross-origin embeds
// (academic notebook, demo blog post) lose the live UI and get the
// link instead. The threat model judged that acceptable for an app
// where every kill chain in #1 / #2 / #3 ends with a click on a
// cross-frame button, and where `↗ Open in Boxplot` round-tripping
// attacker-supplied data is the most plausible vector.
//
// Sync mechanics (mirrors scripts/vendor-sri.js):
//   - The canonical snippet lives in this file as `SNIPPET` and is
//     pre-formatted to match prettier's `printWidth: 100` HTML output,
//     so re-running `prettier --check` after this script is a no-op.
//   - Every HTML file (index.html + tools/*.html) gets the snippet
//     inserted between the BEGIN / END marker comments. If the
//     markers already exist, the block between them is replaced with
//     the current canonical text. If not, the block is inserted right
//     after the `<meta name="viewport" …>` line — that's the earliest
//     stable insertion point in every Plöttr head, and getting in
//     before the theme preloader / CSS / React loader means we hide
//     the page before any potentially-interactive content paints.
//   - Idempotent: re-running with no changes is a no-op (no log noise,
//     no diff). `--check` mode fails non-zero on drift for CI.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");

// All HTML files that should carry the snippet. Hand-curated rather
// than glob-walked so a future contributor adding a one-off HTML
// (e.g. a docs preview) can opt out by leaving it off this list.
function listHtmlFiles() {
  const files = ["index.html"];
  const toolsDir = path.join(repoRoot, "tools");
  for (const f of fs.readdirSync(toolsDir).sort()) {
    if (f.endsWith(".html")) files.push(path.join("tools", f));
  }
  return files.map((rel) => path.join(repoRoot, rel));
}

const BEGIN = "<!-- BEGIN dv-anti-clickjack -->";
const END = "<!-- END dv-anti-clickjack -->";

// Canonical snippet, pre-formatted to match prettier's HTML output at
// `printWidth: 100` so re-running prettier doesn't perturb it. Every
// line carries 4-space indent (placed inside `<head>` at depth 1).
const SNIPPET = `    ${BEGIN}
    <!--
      Frame-busting against hostile embedders. GitHub Pages can't set
      X-Frame-Options / frame-ancestors, so this inline snippet is the
      only option. Same-origin iframes (landing → tool, embedded demos
      from sibling projects on this Pages origin) render normally;
      cross-origin frames (or no referrer) get replaced with a
      "Open in a top-level tab" link. Closes Tier A #3 from the
      02-05-2026 security audit. Managed by scripts/anti-clickjack-sync.js
      — do not edit by hand; re-run that script after changes.
    -->
    <style id="dv-anti-clickjack">
      html {
        visibility: hidden;
      }
    </style>
    <script>
      (function () {
        function reveal() {
          var s = document.getElementById("dv-anti-clickjack");
          if (s) s.remove();
        }
        try {
          if (window.top === window.self) {
            reveal();
            return;
          }
          var ref = document.referrer;
          if (ref) {
            try {
              if (new URL(ref).origin === window.location.origin) {
                reveal();
                return;
              }
            } catch (e) {}
          }
          if (typeof window.stop === "function") window.stop();
          var loc = window.location.href;
          document.documentElement.innerHTML =
            '<head><meta charset="UTF-8"><title>Open in a top-level tab</title>' +
            "<style>body{font-family:system-ui,sans-serif;padding:32px;margin:0;background:#fff;color:#222;line-height:1.5}a{color:#0066cc}</style>" +
            "</head><body><p>Pl\\u00f6ttr is being framed by an unrelated site. " +
            '<a href="' +
            loc +
            '" target="_blank" rel="noopener">Open in a top-level tab</a> instead.</p></body>';
        } catch (e) {}
      })();
    </script>
    ${END}`;

// Regex that captures the existing block (BEGIN…END) so we can replace
// in-place. `[\s\S]*?` matches across newlines.
const BLOCK_RE = new RegExp(
  // Match optional leading whitespace + BEGIN, content, optional indent + END.
  "^[ \\t]*" +
    BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "[\\s\\S]*?[ \\t]*" +
    END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "m"
);

// Insertion anchor: after the `<meta name="viewport" …>` line. Captures
// the line + its trailing newline so the snippet slots in below it with
// matching indent.
const VIEWPORT_RE = /^([ \t]*<meta[^>]*name=["']viewport["'][^>]*>\s*\n)/m;

function rewriteHtml(htmlPath) {
  const before = fs.readFileSync(htmlPath, "utf8");
  let after;
  if (BLOCK_RE.test(before)) {
    after = before.replace(BLOCK_RE, SNIPPET);
  } else {
    const m = before.match(VIEWPORT_RE);
    if (!m) {
      throw new Error(
        `[anti-clickjack-sync] ${path.relative(repoRoot, htmlPath)}: cannot find <meta name="viewport"> insertion anchor.`
      );
    }
    after = before.replace(VIEWPORT_RE, m[1] + SNIPPET + "\n");
  }
  return { before, after, changed: before !== after };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const files = listHtmlFiles();
  const drifted = [];

  for (const f of files) {
    const { after, changed } = rewriteHtml(f);
    if (!changed) continue;
    if (checkOnly) {
      drifted.push(path.relative(repoRoot, f));
    } else {
      fs.writeFileSync(f, after);
      drifted.push(path.relative(repoRoot, f));
    }
  }

  if (checkOnly && drifted.length > 0) {
    process.stderr.write(
      "[anti-clickjack-sync --check] snippet drifted in:\n" +
        drifted.map((p) => "  - " + p).join("\n") +
        "\n  Run `node scripts/anti-clickjack-sync.js` to regenerate.\n"
    );
    process.exit(1);
  }

  if (drifted.length > 0) {
    process.stdout.write(
      `[anti-clickjack-sync] Updated ${drifted.length} file(s) with current snippet.\n`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { rewriteHtml, SNIPPET, BEGIN, END };

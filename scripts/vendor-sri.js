#!/usr/bin/env node
// Pins the bytes of every vendored JS file via Subresource Integrity.
// Closes Tier B #4 from docs/security_audit_02-05-2026.md: a malicious
// PR that swaps the contents of `vendor/react.production.min.js` (or a
// force-push to `gh-pages`) would otherwise propagate a backdoored React
// to every visitor on the next page load with zero detection. With SRI
// pinned, any future tampering forces a hash regen and so passes through
// normal review — and if it doesn't, the browser refuses to execute the
// drifted bytes (silent fail, but the script never runs).
//
// The script is intentionally idempotent: it computes the SHA-384 of each
// canonical vendor file, walks every `tools/*.html`, finds each
// `<script src="../vendor/<file>">` tag, and ensures it carries
// `integrity="sha384-…"` and `crossorigin="anonymous"` matching the
// current bytes. Re-running with no vendor changes is a no-op (no log
// noise, no diff). Wired into the `prebuild` step so any vendor update
// regenerates the hashes automatically; a `--check` mode is available
// for CI to fail when an HTML file is out of sync with disk.
//
// Why a leading anchor? Same-origin SRI does not strictly need
// `crossorigin="anonymous"`, but the audit explicitly recommends it and
// it costs nothing. We add it whenever we add `integrity`.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoRoot = path.join(__dirname, "..");
const VENDOR_DIR = path.join(repoRoot, "vendor");
const TOOLS_DIR = path.join(repoRoot, "tools");

// Canonical list of vendored JS files that must be SRI-pinned. Keep this
// in lock-step with `vendor/`; if you add a new vendored asset that's
// loaded as a `<script>` tag, append it here and re-run.
const VENDORED = ["react.production.min.js", "react-dom.production.min.js"];

function sha384Base64(filePath) {
  const bytes = fs.readFileSync(filePath);
  return "sha384-" + crypto.createHash("sha384").update(bytes).digest("base64");
}

function hashesForVendor() {
  const out = {};
  for (const name of VENDORED) {
    const full = path.join(VENDOR_DIR, name);
    if (!fs.existsSync(full)) {
      throw new Error(`[vendor-sri] missing vendored file: ${name}`);
    }
    out[name] = sha384Base64(full);
  }
  return out;
}

// Returns the list of `tools/*.html` files (excluding generated outputs).
function listToolHtml() {
  return fs
    .readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(TOOLS_DIR, f));
}

// Build a regex that matches any `<script src="../vendor/<basename>"…></script>`
// tag — single-line or multi-line (prettier wraps long attribute lists),
// with or without existing `integrity` / `crossorigin` attributes, in any
// attribute order, single or double quotes. `[^>]` matches newlines in
// JS regex so this naturally crosses line boundaries. The capture groups
// are: (1) the leading indent (spaces / tabs at column 0 of the script
// tag), (2) the attribute soup between `<script` and the closing `>`.
function tagRegex(basename) {
  const escaped = basename.replace(/[.+?*^$()[\]{}|\\]/g, "\\$&");
  return new RegExp(
    "(^[ \\t]*)<script\\b([^>]*?\\bsrc\\s*=\\s*[\"']\\.\\./vendor/" +
      escaped +
      "[\"'][^>]*?)>\\s*</script>",
    "gm"
  );
}

// Pull the `src="…"` value out of the attribute soup so we can re-emit
// it canonically.
function extractSrc(attrSoup) {
  const m = attrSoup.match(/\bsrc\s*=\s*"([^"]*)"|\bsrc\s*=\s*'([^']*)'/);
  return m ? m[1] || m[2] : null;
}

// Pull any non-{src, integrity, crossorigin} attributes (e.g. `defer`,
// `nomodule`) out of the soup verbatim, in source order. These are
// preserved on the output tag so a future contributor can add `defer`
// without the rewriter clobbering it.
function extractExtraAttrs(attrSoup) {
  // Strip the well-known ones, including their (optional) value.
  const stripped = attrSoup
    .replace(/\bsrc\s*=\s*"[^"]*"/g, "")
    .replace(/\bsrc\s*=\s*'[^']*'/g, "")
    .replace(/\bintegrity\s*=\s*"[^"]*"/g, "")
    .replace(/\bintegrity\s*=\s*'[^']*'/g, "")
    .replace(/\bcrossorigin\s*=\s*"[^"]*"/g, "")
    .replace(/\bcrossorigin\s*=\s*'[^']*'/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped; // possibly empty
}

// Format the canonical multi-line tag prettier would produce for a
// long-attribute `<script>` (printWidth: 100). Each attribute lives on
// its own line, and the closing `></script>` sits on a line by itself
// at the parent indent. The integrity hash alone is 75+ chars, so the
// single-line form always exceeds 100 cols — emitting the multi-line
// form unconditionally avoids a re-wrap fight with `prettier --check`
// in CI. Indent is captured from the match position so any HTML
// hierarchy works; the inner indent is parent + 2 spaces (matches
// every existing tools/*.html).
function formatTag(indent, src, integrity, extras) {
  const inner = indent + "  ";
  const lines = [indent + "<script", inner + `src="${src}"`];
  if (extras) lines.push(inner + extras);
  lines.push(inner + `integrity="${integrity}"`);
  lines.push(inner + `crossorigin="anonymous"`);
  lines.push(indent + "></script>");
  return lines.join("\n");
}

function rewriteFile(htmlPath, hashes) {
  const before = fs.readFileSync(htmlPath, "utf8");
  let after = before;
  for (const name of VENDORED) {
    const re = tagRegex(name);
    after = after.replace(re, function (_, indent, attrSoup) {
      const src = extractSrc(attrSoup);
      const extras = extractExtraAttrs(attrSoup);
      return formatTag(indent, src, hashes[name], extras);
    });
  }
  return { before, after, changed: before !== after };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const hashes = hashesForVendor();
  const files = listToolHtml();
  const drifted = [];

  for (const f of files) {
    const { before, after, changed } = rewriteFile(f, hashes);
    if (!changed) continue;
    if (checkOnly) {
      drifted.push(path.relative(repoRoot, f));
    } else {
      fs.writeFileSync(f, after);
      drifted.push(path.relative(repoRoot, f));
    }
    void before; // unused outside check / debug
  }

  if (checkOnly && drifted.length > 0) {
    process.stderr.write(
      "[vendor-sri --check] SRI hashes are out of sync in:\n" +
        drifted.map((p) => "  - " + p).join("\n") +
        "\n  Run `node scripts/vendor-sri.js` to regenerate.\n"
    );
    process.exit(1);
  }

  if (drifted.length > 0) {
    process.stdout.write(
      `[vendor-sri] Updated ${drifted.length} file(s) with current vendor hashes.\n`
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { hashesForVendor, rewriteFile, VENDORED };

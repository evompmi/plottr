#!/usr/bin/env node
// Generates the per-page Content-Security-Policy `<meta http-equiv>` tag.
//
// Plöttr is a browser-only static site served from GitHub Pages, which
// cannot set HTTP response headers — so the CSP lives in a `<meta>` tag at
// the top of each page's `<head>`. The whole point is to make `script-src`
// strict: `'self'` plus a per-script `'sha256-…'` hash for each inline
// `<script>` block, and *no* `'unsafe-inline'`. With no `'unsafe-inline'`,
// the browser refuses to run injected inline event handlers (e.g. an
// `onerror=` smuggled in via a pasted-CSV column header), turning the i18n
// HTML-escaping fix into a defence-in-depth backstop rather than the only
// guard.
//
// Because the policy hashes the inline scripts, editing any inline `<script>`
// changes its hash and this file must be re-run (`node scripts/csp-sync.js`)
// to refresh the meta — otherwise the browser would block our own scripts,
// and (since the anti-clickjack snippet keeps the page `visibility:hidden`
// until its inline script runs) the page would render blank. `tests/csp.test.js`
// is the drift guard: it recomputes the hashes and fails if any page's meta
// is stale, the same way `lint:sri` guards the vendored-React SRI hashes.
//
// Idempotent: computes the SHA-256 of every attribute-less inline `<script>`
// on each page, builds the policy, and replaces (or inserts) the CSP meta
// immediately after the viewport meta. Re-running with no inline-script
// changes is a no-op. A `--check` mode fails (exit 1) when any page is out of
// sync, for CI / pre-commit use.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repoRoot = path.join(__dirname, "..");

// Every standalone HTML page. All three carry inline no-FOUC / anti-clickjack
// scripts, so all three need a CSP with the right hashes.
const HTML_PAGES = ["index.html", "privacy.html", "benchmark.html"];

// CSP directives other than `script-src` (which is assembled per page from the
// inline-script hashes). Kept deliberately permissive on the non-script axes so
// the policy hardens the dangerous vector (script execution) without breaking
// runtime behaviour:
//   - style-src 'unsafe-inline': React renders inline `style={{…}}` and each
//     page has inline `<style>` blocks; style injection is low-risk.
//   - img-src data: blob:: PNG export rasterises the chart through an
//     `Image()` fed a data:/blob: URL.
//   - font-src 'self': self-hosted woff2, no third-party font origin.
// `frame-ancestors` is intentionally absent — it is ignored in a `<meta>` CSP
// (header-only), and the inline anti-clickjack frame-buster already covers
// embedding.
const STATIC_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
];

// Match an attribute-less inline `<script>…</script>` and capture its exact
// text content. Attribute-less is deliberate: every inline script in the pages
// is a bare `<script>` (the external ones carry `src=`, the vendored one also
// `integrity=`), so `<script>` with no attributes selects exactly the inline
// blocks the browser hashes. `[\s\S]` crosses newlines; `*?` is non-greedy so
// each block is captured individually.
const INLINE_SCRIPT_RE = /<script>([\s\S]*?)<\/script>/g;

function sha256(content) {
  return "sha256-" + crypto.createHash("sha256").update(content, "utf8").digest("base64");
}

// Returns the `'sha256-…'` source for every inline `<script>` on the page, in
// document order, de-duplicated (two identical no-FOUC snippets collapse to one
// hash — the policy only needs each distinct hash once).
function scriptHashes(html) {
  const seen = new Set();
  const out = [];
  let m;
  INLINE_SCRIPT_RE.lastIndex = 0;
  while ((m = INLINE_SCRIPT_RE.exec(html)) !== null) {
    const h = "'" + sha256(m[1]) + "'";
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

// Build the full policy string for a page from its inline-script hashes.
function buildCsp(hashes) {
  const scriptSrc = ["script-src 'self'", ...hashes].join(" ");
  return [STATIC_DIRECTIVES[0], scriptSrc, ...STATIC_DIRECTIVES.slice(1)].join("; ");
}

// The CSP meta, formatted the way prettier (printWidth 100) emits a multi-line
// void element: each attribute on its own line, `/>` on a line by itself. The
// `content` value alone is far past 100 cols, so the single-line form would
// always lose a re-wrap fight with `prettier --check`.
function formatMeta(indent, csp) {
  const inner = indent + "  ";
  return [
    indent + "<meta",
    inner + 'http-equiv="Content-Security-Policy"',
    inner + `content="${csp}"`,
    indent + "/>",
  ].join("\n");
}

// Matches an existing CSP meta (single- or multi-line, any attribute order),
// including the leading indent, so a rewrite replaces it in place.
const EXISTING_META_RE =
  /^[ \t]*<meta\b[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'][^>]*?\/?>\s*\n/gim;

// Anchor: insert the CSP meta right after the viewport meta so it governs every
// inline script and resource that follows in the head.
const VIEWPORT_RE = /^([ \t]*)<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*?\/?>[ \t]*\n/im;

function rewriteFile(htmlPath) {
  const before = fs.readFileSync(htmlPath, "utf8");
  const hashes = scriptHashes(before);
  const csp = buildCsp(hashes);

  // Strip any existing CSP meta first so the operation is idempotent.
  let body = before.replace(EXISTING_META_RE, "");

  const vp = body.match(VIEWPORT_RE);
  if (!vp) {
    throw new Error(`[csp-sync] no <meta name="viewport"> anchor in ${path.basename(htmlPath)}`);
  }
  const indent = vp[1];
  const metaBlock = formatMeta(indent, csp) + "\n";
  body = body.replace(VIEWPORT_RE, (full) => full + metaBlock);

  return { before, after: body, changed: before !== body };
}

function listHtmlPages() {
  return HTML_PAGES.map((p) => path.join(repoRoot, p)).filter((p) => fs.existsSync(p));
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const files = listHtmlPages();
  const drifted = [];

  for (const f of files) {
    const { after, changed } = rewriteFile(f);
    if (!changed) continue;
    if (!checkOnly) fs.writeFileSync(f, after);
    drifted.push(path.relative(repoRoot, f));
  }

  if (checkOnly && drifted.length > 0) {
    process.stderr.write(
      "[csp-sync --check] CSP meta is out of sync in:\n" +
        drifted.map((p) => "  - " + p).join("\n") +
        "\n  Run `node scripts/csp-sync.js` to regenerate.\n"
    );
    process.exit(1);
  }

  if (drifted.length > 0) {
    process.stdout.write(`[csp-sync] Updated ${drifted.length} file(s) with current CSP hashes.\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scriptHashes, buildCsp, rewriteFile, sha256, HTML_PAGES, STATIC_DIRECTIVES };

// Drift guard for scripts/csp-sync.js — the helper that builds each page's
// Content-Security-Policy `<meta http-equiv>` tag from the SHA-256 of its
// inline `<script>` blocks. If an inline script is edited without re-running
// `node scripts/csp-sync.js`, its hash changes and the browser would block our
// own script — and since the anti-clickjack snippet keeps the page
// `visibility:hidden` until its inline script runs, the page would render
// blank. This test recomputes the hashes from the on-disk HTML and asserts each
// page's CSP meta is in sync, the same way tests/vendor-sri guards SRI.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { suite, test, assert, eq, summary } = require("./harness");
const { scriptHashes, buildCsp, rewriteFile, HTML_PAGES } = require("../scripts/csp-sync");

const repoRoot = path.join(__dirname, "..");

// Pull the CSP policy string out of a page's `<meta http-equiv>` tag. The meta
// is emitted multi-line (attribute per line), so allow whitespace/newlines
// between attributes.
function readCspMeta(html) {
  const m = html.match(
    /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*?content\s*=\s*"([^"]*)"[^>]*?\/?>/i
  );
  return m ? m[1] : null;
}

function parseDirectives(csp) {
  const out = {};
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(" ");
    const name = sp === -1 ? trimmed : trimmed.slice(0, sp);
    out[name] =
      sp === -1
        ? []
        : trimmed
            .slice(sp + 1)
            .trim()
            .split(/\s+/);
  }
  return out;
}

suite("csp-sync — every page has a CSP meta in sync with its inline scripts");

for (const page of HTML_PAGES) {
  const full = path.join(repoRoot, page);
  if (!fs.existsSync(full)) continue;

  test(`${page}: CSP meta is present and well-formed`, () => {
    const html = fs.readFileSync(full, "utf8");
    const csp = readCspMeta(html);
    assert(csp, `${page}: no Content-Security-Policy <meta> found`);
    const d = parseDirectives(csp);
    // The security-critical directive: script-src must exist, pin 'self', and
    // must NOT carry 'unsafe-inline' (which would re-enable injected handlers).
    assert(d["script-src"], `${page}: missing script-src`);
    assert(d["script-src"].includes("'self'"), `${page}: script-src lacks 'self'`);
    assert(
      !d["script-src"].includes("'unsafe-inline'"),
      `${page}: script-src must not allow 'unsafe-inline'`
    );
    assert(d["default-src"], `${page}: missing default-src`);
    eq(d["object-src"] && d["object-src"][0], "'none'", `${page}: object-src should be 'none'`);
  });

  test(`${page}: script-src hashes match the page's inline <script> blocks`, () => {
    const html = fs.readFileSync(full, "utf8");
    const csp = readCspMeta(html);
    const inMeta = new Set(
      parseDirectives(csp)["script-src"].filter((s) => s.startsWith("'sha256-"))
    );
    // Recompute independently from the inline scripts on disk.
    const expected = new Set(scriptHashes(html));
    eq(inMeta.size, expected.size, `${page}: script-src hash count drifted`);
    for (const h of expected) {
      assert(inMeta.has(h), `${page}: missing hash ${h} — run \`node scripts/csp-sync.js\``);
    }
    for (const h of inMeta) {
      assert(expected.has(h), `${page}: stale hash ${h} — run \`node scripts/csp-sync.js\``);
    }
  });

  test(`${page}: rewriteFile is a no-op (meta already canonical)`, () => {
    const { changed } = rewriteFile(full);
    assert(!changed, `${page}: CSP meta is out of sync — run \`node scripts/csp-sync.js\``);
  });
}

suite("csp-sync — hashing & policy assembly");

test("scriptHashes computes SHA-256 over each inline script's exact text", () => {
  const html =
    "<head>\n<script>var a=1;</script>\n<script src='x.js'></script>\n<script>var b=2;</script>\n</head>";
  const hashes = scriptHashes(html);
  // Only the two attribute-less inline blocks are hashed; the src= one is not.
  eq(hashes.length, 2);
  const expectA =
    "'sha256-" + crypto.createHash("sha256").update("var a=1;", "utf8").digest("base64") + "'";
  assert(hashes.includes(expectA), "expected hash of `var a=1;`");
});

test("scriptHashes de-duplicates identical inline blocks", () => {
  const html = "<script>same();</script>\n<script>same();</script>";
  eq(scriptHashes(html).length, 1);
});

test("buildCsp puts 'self' + hashes in script-src and never 'unsafe-inline'", () => {
  const csp = buildCsp(["'sha256-AAAA'"]);
  assert(/script-src 'self' 'sha256-AAAA'/.test(csp), "script-src should list self then hashes");
  assert(!/script-src[^;]*'unsafe-inline'/.test(csp), "script-src must not allow unsafe-inline");
});

summary();

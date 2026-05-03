// Regression coverage for scripts/vendor-sri.js — the helper that pins
// the vendored React / ReactDOM bytes via Subresource Integrity. Closes
// audit 02-05-2026 Tier B #4. The script is pure (no shell, no
// network), so we exercise it directly: hashesForVendor() must produce
// stable sha384 strings for the on-disk vendor files, and rewriteFile()
// must be idempotent on a synthetic HTML fixture (re-running with the
// already-correct integrity attribute is a no-op, drifted attributes
// get overwritten, and previously-bare tags get integrity + crossorigin
// added in canonical form).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { suite, test, assert, eq, summary } = require("./harness");
const { hashesForVendor, rewriteFile, VENDORED } = require("../scripts/vendor-sri");

const repoRoot = path.join(__dirname, "..");

suite("vendor-sri.js — hashesForVendor");

test("returns one sha384-prefixed base64 hash per canonical vendor file", () => {
  const h = hashesForVendor();
  for (const name of VENDORED) {
    assert(typeof h[name] === "string", `missing hash for ${name}`);
    assert(h[name].startsWith("sha384-"), `${name}: hash should be sha384-prefixed`);
    // Base64 chars only after the prefix; sha384 → 64-char base64 string.
    const b64 = h[name].slice("sha384-".length);
    assert(/^[A-Za-z0-9+/]+=*$/.test(b64), `${name}: hash payload not base64: ${b64}`);
    eq(b64.length, 64, `${name}: sha384 base64 should be 64 chars`);
  }
});

test("hashes match the on-disk bytes (recomputed independently)", () => {
  const h = hashesForVendor();
  for (const name of VENDORED) {
    const bytes = fs.readFileSync(path.join(repoRoot, "vendor", name));
    const expected = "sha384-" + crypto.createHash("sha384").update(bytes).digest("base64");
    eq(h[name], expected, `${name}: drift between hashesForVendor() and direct sha384`);
  }
});

suite("vendor-sri.js — rewriteFile idempotence");

// Build a synthetic in-memory HTML and feed it to rewriteFile by writing
// it to a temp path. The temp file is removed at the end of each test —
// the real `tools/*.html` files stay untouched.
function withTmpHtml(body, fn) {
  const p = path.join(repoRoot, ".tmp-vendor-sri-fixture.html");
  fs.writeFileSync(p, body);
  try {
    return fn(p);
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

test("adds integrity + crossorigin to a bare <script> tag", () => {
  const before =
    '<html><head>\n  <script src="../vendor/react.production.min.js"></script>\n</head></html>';
  withTmpHtml(before, (p) => {
    const r = rewriteFile(p, hashesForVendor());
    assert(r.changed, "should report changed=true on first run");
    assert(r.after.includes('integrity="sha384-'), "missing integrity attr");
    assert(r.after.includes('crossorigin="anonymous"'), "missing crossorigin attr");
  });
});

test("re-running on already-pinned tags is a no-op (changed=false)", () => {
  const hashes = hashesForVendor();
  // Canonical multi-line form (matches prettier-wrapped HTML and what
  // formatTag() emits). Re-running rewriteFile must not perturb it.
  const before =
    "<html><head>\n" +
    "    <script\n" +
    '      src="../vendor/react.production.min.js"\n' +
    '      integrity="' +
    hashes["react.production.min.js"] +
    '"\n' +
    '      crossorigin="anonymous"\n' +
    "    ></script>\n" +
    "</head></html>";
  withTmpHtml(before, (p) => {
    const r = rewriteFile(p, hashes);
    assert(!r.changed, "should be a no-op; got: " + r.after);
  });
});

test("overwrites a drifted integrity attribute", () => {
  // Stale hash, single-line form — represents the worst-case migration:
  // someone edited vendor/react and forgot to re-run vendor-sri.js.
  const before =
    '<html><head>\n  <script src="../vendor/react.production.min.js" integrity="sha384-OLDHASH" crossorigin="anonymous"></script>\n</head></html>';
  withTmpHtml(before, (p) => {
    const hashes = hashesForVendor();
    const r = rewriteFile(p, hashes);
    assert(r.changed, "should detect drift");
    assert(r.after.includes(hashes["react.production.min.js"]), "missing fresh hash");
    assert(!r.after.includes("OLDHASH"), "stale hash leaked through: " + r.after);
  });
});

test("preserves untouched src attribute and existing other attrs", () => {
  const before =
    '<html><head>\n  <script defer src="../vendor/react.production.min.js"></script>\n</head></html>';
  withTmpHtml(before, (p) => {
    const r = rewriteFile(p, hashesForVendor());
    assert(r.changed, "should add integrity");
    assert(r.after.includes("defer"), "should preserve `defer` attr: " + r.after);
    assert(r.after.includes("../vendor/react.production.min.js"), "should preserve src");
  });
});

test("rewriting an already-prettier-wrapped multi-line tag is a no-op", () => {
  // Belt + braces: even if a contributor lands a prettier-wrapped tag
  // before vendor-sri runs, re-running once should converge — and
  // re-running a *second* time must not flip back. This is the regression
  // for the format-fight loop we hit during initial rollout.
  const hashes = hashesForVendor();
  const before =
    "<html><head>\n" +
    "    <script\n" +
    '      src="../vendor/react.production.min.js"\n' +
    '      integrity="' +
    hashes["react.production.min.js"] +
    '"\n' +
    '      crossorigin="anonymous"\n' +
    "    ></script>\n" +
    "</head></html>";
  withTmpHtml(before, (p) => {
    const r1 = rewriteFile(p, hashes);
    assert(!r1.changed, "first re-run should already be a no-op");
    // Even after writing the same content back, a second pass must agree.
    const r2 = rewriteFile(p, hashes);
    assert(!r2.changed, "second re-run should also be a no-op");
  });
});

test("ignores unrelated <script> tags", () => {
  const before =
    '<html><head>\n  <script src="../tools/shared.bundle.js"></script>\n  <script src="../vendor/react.production.min.js"></script>\n</head></html>';
  withTmpHtml(before, (p) => {
    const r = rewriteFile(p, hashesForVendor());
    assert(r.changed, "should pin the react tag");
    // The shared.bundle.js tag must NOT receive an integrity attribute —
    // it is a build artefact that changes constantly, not a vendored asset.
    const sharedTag = r.after.match(/<script[^>]*shared\.bundle\.js[^>]*><\/script>/);
    assert(sharedTag, "shared.bundle.js tag missing");
    assert(
      !sharedTag[0].includes("integrity="),
      "shared.bundle.js should not get an integrity attr: " + sharedTag[0]
    );
  });
});

suite("vendor-sri.js — every checked-in tools/*.html is in sync");

test("running --check on the live repo state passes (no drift)", () => {
  const hashes = hashesForVendor();
  const toolsDir = path.join(repoRoot, "tools");
  const htmls = fs
    .readdirSync(toolsDir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(toolsDir, f));
  const drifted = [];
  for (const f of htmls) {
    const r = rewriteFile(f, hashes);
    if (r.changed) drifted.push(path.relative(repoRoot, f));
  }
  eq(
    drifted.length,
    0,
    "tools/*.html SRI hashes drifted from disk: " +
      drifted.join(", ") +
      " — run `node scripts/vendor-sri.js`."
  );
});

summary();

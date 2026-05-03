// Regression coverage for scripts/anti-clickjack-sync.js (the helper
// that maintains the inline frame-buster in every HTML) AND for the
// snippet's runtime behaviour. Closes audit 02-05-2026 Tier A #3.
//
// The snippet is plain ES5 and consumes only a tiny browser surface
// (window.top, window.self, window.location, document.referrer,
// document.getElementById, document.documentElement.innerHTML,
// window.stop). We mock that surface in a vm context and assert each
// of the four reachable paths:
//   1. Standalone tab → reveal (style removed)
//   2. Same-origin iframe → reveal
//   3. Cross-origin iframe → bust (innerHTML replaced + window.stop)
//   4. Iframe with no referrer → bust (referrer-policy strict case)

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const { suite, test, assert, eq, summary } = require("./harness");
const { rewriteHtml, SNIPPET, BEGIN, END } = require("../scripts/anti-clickjack-sync");

const repoRoot = path.join(__dirname, "..");

// ── Sync-helper tests ─────────────────────────────────────────────────────

suite("anti-clickjack-sync.js — rewriteHtml");

function withTmpHtml(body, fn) {
  const p = path.join(repoRoot, ".tmp-anti-clickjack-fixture.html");
  fs.writeFileSync(p, body);
  try {
    return fn(p);
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

const VIEWPORT_LINE =
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n';

test("inserts the snippet right after <meta name='viewport'> on first run", () => {
  const before =
    "<!doctype html>\n<html><head>\n" +
    VIEWPORT_LINE +
    "    <title>x</title>\n  </head><body></body></html>\n";
  withTmpHtml(before, (p) => {
    const r = rewriteHtml(p);
    assert(r.changed, "should report changed=true on first run");
    assert(r.after.includes(BEGIN), "missing BEGIN marker");
    assert(r.after.includes(END), "missing END marker");
    // Snippet must come *after* the viewport line and *before* the title.
    const idxVp = r.after.indexOf("viewport");
    const idxBegin = r.after.indexOf(BEGIN);
    const idxTitle = r.after.indexOf("<title>");
    assert(idxVp < idxBegin && idxBegin < idxTitle, "snippet inserted in wrong position");
  });
});

test("re-running on an already-synced file is a no-op (changed=false)", () => {
  const before =
    "<!doctype html>\n<html><head>\n" +
    VIEWPORT_LINE +
    SNIPPET +
    "\n    <title>x</title>\n  </head><body></body></html>\n";
  withTmpHtml(before, (p) => {
    const r = rewriteHtml(p);
    assert(!r.changed, "should be a no-op; got: " + r.after.slice(0, 200));
  });
});

test("replaces a drifted snippet (between BEGIN/END markers)", () => {
  const drifted =
    "<!doctype html>\n<html><head>\n" +
    VIEWPORT_LINE +
    "    " +
    BEGIN +
    "\n    <script>/* OLD VERSION */</script>\n    " +
    END +
    "\n" +
    "    <title>x</title>\n  </head></html>\n";
  withTmpHtml(drifted, (p) => {
    const r = rewriteHtml(p);
    assert(r.changed, "should detect drift");
    assert(!r.after.includes("OLD VERSION"), "stale block leaked through");
    assert(r.after.includes("dv-anti-clickjack"), "missing canonical content");
    // Markers must appear exactly once.
    eq(r.after.split(BEGIN).length - 1, 1, "BEGIN appears more than once");
    eq(r.after.split(END).length - 1, 1, "END appears more than once");
  });
});

test("throws a clear error when the viewport anchor is missing", () => {
  const before =
    "<!doctype html>\n<html><head>\n    <title>x</title>\n  </head><body></body></html>\n";
  withTmpHtml(before, (p) => {
    let threw = false;
    try {
      rewriteHtml(p);
    } catch (e) {
      threw = true;
      assert(/viewport/.test(e.message), "error should mention the missing anchor: " + e.message);
    }
    assert(threw, "should throw when no anchor is present");
  });
});

suite("anti-clickjack-sync.js — every checked-in HTML is in sync");

test("running the rewriter on the live repo is a no-op (no drift)", () => {
  const files = ["index.html"].concat(
    fs
      .readdirSync(path.join(repoRoot, "tools"))
      .filter((f) => f.endsWith(".html"))
      .map((f) => path.join("tools", f))
  );
  const drifted = [];
  for (const rel of files) {
    const full = path.join(repoRoot, rel);
    const r = rewriteHtml(full);
    if (r.changed) drifted.push(rel);
  }
  eq(
    drifted.length,
    0,
    "drift in: " + drifted.join(", ") + " — run `node scripts/anti-clickjack-sync.js`"
  );
});

// ── Runtime behaviour of the inline snippet ───────────────────────────────

// Extract the JS body between <script> and </script> in the canonical
// SNIPPET so we can run it under vm with mocked browser globals. We
// don't try to parse HTML — just slice between the two known tags.
function extractScript() {
  const m = SNIPPET.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("could not extract <script> body from canonical SNIPPET");
  return m[1];
}

// Build a vm context that mocks the browser surface the snippet uses.
// `frame` controls window.top===window.self; `referrer` controls
// document.referrer; `originHere` controls window.location.origin.
function makeCtx(opts) {
  const styleEl = {
    remove: () => {
      ctx.__styleRemoved = true;
    },
  };
  const docEl = {};
  Object.defineProperty(docEl, "innerHTML", {
    set: (v) => {
      ctx.__replacedHtml = v;
    },
    get: () => ctx.__replacedHtml || "",
  });
  const win = {};
  win.self = win;
  win.top = opts.framed ? {} : win; // distinct object signals framed
  win.location = {
    origin: opts.originHere || "https://plottr.example",
    href: (opts.originHere || "https://plottr.example") + "/tools/x.html",
  };
  win.stop = () => {
    ctx.__stopped = true;
  };
  const ctx = {
    window: win,
    document: {
      referrer: opts.referrer == null ? "" : opts.referrer,
      getElementById: (id) => (id === "dv-anti-clickjack" ? styleEl : null),
      documentElement: docEl,
    },
    URL: URL,
    __styleRemoved: false,
    __stopped: false,
    __replacedHtml: null,
  };
  vm.createContext(ctx);
  return ctx;
}

const SCRIPT_BODY = extractScript();

suite("anti-clickjack snippet — standalone tab path");

test("standalone tab reveals the page (removes the hide-style)", () => {
  const ctx = makeCtx({ framed: false });
  vm.runInContext(SCRIPT_BODY, ctx);
  assert(ctx.__styleRemoved, "style should be removed in standalone mode");
  assert(!ctx.__stopped, "window.stop must not be called");
  assert(!ctx.__replacedHtml, "innerHTML must not be replaced");
});

suite("anti-clickjack snippet — same-origin iframe path");

test("same-origin referrer reveals the page", () => {
  const ctx = makeCtx({
    framed: true,
    originHere: "https://plottr.example",
    referrer: "https://plottr.example/index.html",
  });
  vm.runInContext(SCRIPT_BODY, ctx);
  assert(ctx.__styleRemoved, "style should be removed for same-origin embed");
  assert(!ctx.__stopped, "window.stop must not be called");
});

suite("anti-clickjack snippet — cross-origin frame path");

test("cross-origin referrer triggers the bust-out", () => {
  const ctx = makeCtx({
    framed: true,
    originHere: "https://plottr.example",
    referrer: "https://attacker.example/lure.html",
  });
  vm.runInContext(SCRIPT_BODY, ctx);
  assert(ctx.__stopped, "window.stop should be called");
  assert(ctx.__replacedHtml, "innerHTML should be replaced with bust-out page");
  assert(
    /Open in a top-level tab/.test(ctx.__replacedHtml),
    "bust-out page missing the canonical link text"
  );
  assert(
    /href="https:\/\/plottr\.example/.test(ctx.__replacedHtml),
    "bust-out link should target own URL: " + ctx.__replacedHtml
  );
});

test("empty referrer (strict referrer policy) also triggers bust-out", () => {
  // referrer-policy: no-referrer / same-origin from a cross-origin
  // hostile parent leaves document.referrer empty. We fail closed.
  const ctx = makeCtx({
    framed: true,
    originHere: "https://plottr.example",
    referrer: "",
  });
  vm.runInContext(SCRIPT_BODY, ctx);
  assert(ctx.__replacedHtml, "empty-referrer iframe must still bust");
});

test("malformed referrer (URL throws) falls through to bust-out", () => {
  const ctx = makeCtx({
    framed: true,
    originHere: "https://plottr.example",
    referrer: "not-a-url::::",
  });
  vm.runInContext(SCRIPT_BODY, ctx);
  assert(ctx.__replacedHtml, "malformed referrer must still bust");
});

summary();

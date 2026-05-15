// Shared building blocks for the per-domain `*-loader.js` files. Every
// loader needs esbuild.buildSync + vm.runInContext + a React stub +
// neutral DOM stubs in some combination; this module exposes the
// composable pieces (built-in globals, neutral DOM stubs, the minimal
// React stub, esbuild bundling, in-memory localStorage, the
// "thread module.exports through a vm context" idiom) so each loader is
// just a declaration of what it actually needs.
//
// Two helpers intentionally manage their own context outside this file:
//
//   - `tests/helpers/render-loader.js` — real React + happy-dom plumbing,
//     which uses `globalThis` rather than a vm.createContext sandbox.
//   - Per-tool helpers loaders' Stryker-compatible require()-via-tmp-file
//     trick — specific to tools whose helpers.ts goes through mutation
//     testing; staying inline keeps the trick visible at the call site.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const TOOLS_DIR = path.join(__dirname, "../../tools");
const TMP_DIR = path.join(__dirname, "../.tmp");

// ── Built-in JS globals every vm.createContext sandbox wants ──────────
//
// Returns a fresh object each call so callers can mutate / extend it
// without leaking into sibling sandboxes. Includes the constructors,
// numeric helpers, console, and timer functions every shell module
// touches at module-load.
function builtins() {
  return {
    Math,
    JSON,
    Date,
    Number,
    String,
    Array,
    Object,
    Boolean,
    Error,
    RegExp,
    Set,
    Map,
    Infinity,
    NaN,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    console,
    setTimeout,
    clearTimeout,
  };
}

// ── Minimal React stub ────────────────────────────────────────────────
//
// Enough for shell modules whose top-level statements reach for
// React.createElement / React.memo / etc. without actually rendering
// anything. Tests that need real React go through render-loader.js
// (which uses the actual `react` package on globalThis + happy-dom).
const MINIMAL_REACT = {
  useState: () => [null, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useId: () => ":r0:",
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  forwardRef: (fn) => fn,
  createElement: () => null,
  memo: (fn) => fn,
  Component: class {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState() {}
  },
};

// ── Neutral browser-shape DOM stubs ───────────────────────────────────
//
// For shell modules that touch `document` / `window` / `localStorage`
// / `URL` / `Blob` / `FileReader` at top level. Each call returns a
// fresh object so per-call-fresh loaders (prefs, handoff) don't share
// state across `freshContext()` invocations.
//
// Loaders that need a real-ish localStorage (round-trip tests) override
// `localStorage` with `makeLocalStorage()`.
function makeDomStubs() {
  return {
    document: {
      createElement: () => ({
        addEventListener: () => {},
        appendChild: () => {},
        click: () => {},
        style: {},
      }),
      documentElement: {
        setAttribute: () => {},
        removeAttribute: () => {},
        getAttribute: () => null,
      },
      body: { appendChild: () => {}, removeChild: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: "visible",
    },
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      dispatchEvent: () => {},
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    CustomEvent: function () {},
    URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
    Blob: function () {},
    XMLSerializer: function () {
      this.serializeToString = () => "";
    },
    FileReader: function () {
      this.readAsText = () => {};
    },
  };
}

// ── In-memory localStorage ────────────────────────────────────────────
//
// Returns `{ store, localStorage }`. `store` is the underlying record so
// tests can inspect state directly; `localStorage` implements the
// browser API surface shell modules call (getItem / setItem /
// removeItem / clear).
function makeLocalStorage() {
  const store = {};
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
  return { store, localStorage };
}

// ── esbuild bundle cache ──────────────────────────────────────────────
//
// esbuild's *Sync APIs spawn an esbuild service child process. Under
// Stryker every test file — and therefore every loader that bundles
// shell / kernel source — is re-evaluated in a fully isolated context
// once per mutant run. Across thousands of mutants that is thousands of
// esbuild service spawns; the orphaned services pile up until the OS
// process table is exhausted. From that point a fresh spawn fails, the
// esbuild call throws "The service is no longer running", the loader's
// require() throws at the top of the test file, the file registers zero
// tests, and every remaining mutant is scored as a false "survived" with
// no test having run. (The same exhaustion is what makes the run exit
// with a `spawn pgrep EAGAIN` at teardown.)
//
// `cachedBundle` memoizes a bundle on disk. vitest's per-file isolation
// resets every in-memory anchor — `globalThis`, `process`, even the
// `esbuild` module object are fresh per mutant run — so the cache cannot
// live in memory; the filesystem is the only thing that survives. The
// cache is keyed only inside a Stryker sandbox: `tests/.tmp/` is
// gitignored, hence not copied into the sandbox, so it starts empty and
// the instrumented source is immutable for the sandbox's lifetime. A
// normal `npm test` / `test:watch` run skips the cache entirely and
// rebuilds every call, so it always sees fresh source.
const CACHE_BUNDLES = process.cwd().includes(".stryker-tmp");

function cachedBundle(key, build) {
  if (!CACHE_BUNDLES) return build();
  const cacheFile = path.join(TMP_DIR, `bundlecache-${key.replace(/[^a-zA-Z0-9]+/g, "_")}.js`);
  try {
    const cached = fs.readFileSync(cacheFile, "utf8");
    if (cached.length > 0) return cached;
  } catch {
    /* not cached yet — fall through to build */
  }
  const out = build();
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    // Write to a per-process temp then rename: rename is atomic, so a
    // concurrent reader in another Stryker worker never sees a partial
    // file. Worst case a few workers race and each builds once before
    // the file appears — a handful of esbuild spawns, not thousands.
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, cacheFile);
  } catch {
    /* best-effort cache; correctness does not depend on the write */
  }
  return out;
}

// ── Shell module bundling ─────────────────────────────────────────────
//
// `bundleShell(srcRelToTools)` runs esbuild.buildSync with `bundle:
// true` so cross-`_shell/*` imports get inlined — necessary for files
// that import from sibling modules (stats-dispatch.ts pulls in
// stats-registry.ts; r-export.ts pulls in stats-registry.ts; etc.).
//
// Pass `{ transform: true }` for a faster path that compiles the file
// in isolation — fine for shell modules with only ambient globals
// (handoff.ts, prefs-store.ts, discrete-palette.ts, svg-legend.ts).
// The CJS output looks the same to the vm.runInContext consumer either
// way; transform-only is just cheaper at boot.
function bundleShell(srcRelToTools, opts = {}) {
  return cachedBundle(`shell:${srcRelToTools} ${JSON.stringify(opts)}`, () => {
    const src = path.join(TOOLS_DIR, srcRelToTools);
    if (opts.transform) {
      return esbuild.transformSync(fs.readFileSync(src, "utf8"), {
        loader: srcRelToTools.endsWith(".tsx") ? "tsx" : "ts",
        format: "cjs",
        target: "es2022",
      }).code;
    }
    return esbuild.buildSync({
      entryPoints: [src],
      bundle: true,
      format: "cjs",
      platform: "neutral",
      jsx: "transform",
      write: false,
    }).outputFiles[0].text;
  });
}

// Read `tools/shared.bundle.js` — the concatenated plain-JS bundle the
// static HTML pages still load. Throws with a useful message if missing
// (regenerated by `npm run build:shared`, which runs in `pretest`).
function readSharedBundleSrc() {
  const p = path.join(TOOLS_DIR, "shared.bundle.js");
  if (!fs.existsSync(p)) {
    throw new Error(
      "tools/shared.bundle.js is missing. Run `npm run build:shared` (or any build / test) to regenerate it."
    );
  }
  return fs.readFileSync(p, "utf8");
}

// Bundled IIFE source of the `_core/shared.ts` barrel for the
// `vm.runInContext`-based loaders. `globalName` tells esbuild to expose
// the barrel's named exports as a single object literal; the synthetic
// `Object.assign(globalThis, __plottrShared)` footer spreads those onto
// the vm context's globalThis so callers like `ctx.parseRaw(...)` resolve
// without each `_core/*` module having to write to globalThis itself.
function readCoreSharedSource() {
  return cachedBundle("core-shared", () => {
    const result = esbuild.buildSync({
      entryPoints: [path.join(TOOLS_DIR, "_core/shared.ts")],
      bundle: true,
      format: "iife",
      globalName: "__plottrShared",
      platform: "neutral",
      target: "es2022",
      write: false,
    });
    return result.outputFiles[0].text + "\nObject.assign(globalThis, __plottrShared);\n";
  });
}

// ── Run a CJS bundle inside a vm context ──────────────────────────────
//
// Threads a fresh `module.exports` slot through `ctx` and returns that
// slot after the bundle runs. Multiple bundles in the same context
// don't clobber each other's exports — each call gets its own slot.
function runCjs(ctx, cjs) {
  const moduleObj = { exports: {} };
  ctx.module = moduleObj;
  ctx.exports = moduleObj.exports;
  vm.runInContext(cjs, ctx);
  return moduleObj.exports;
}

// ── Stryker-compatible require() via tmp file ─────────────────────────
//
// Stryker's per-test coverage instrumentation injects a `__stryker__`
// global into mutated source to trace which tests touch which lines.
// vm.runInContext gives loaded code its own context, so writes from
// inside the vm don't reach the runner — Stryker reports zero coverage
// and skips the mutants. Loading the bundle through Node's `require()`
// instead makes the file part of the module dependency graph and the
// instrumentation works.
//
// Writes `cjs` to `tests/.tmp/<basename>.<pid>.cjs`, busts the require
// cache (Stryker mutates the source on disk per cold-start), and returns
// the exports. The filename is per-process: under Stryker several worker
// processes share `tests/.tmp/`, and a single shared filename lets one
// process require() the file while another is mid-write — a torn read
// that surfaces as "Unexpected end of input".
function requireViaTmpFile(basename, cjs) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmpFile = path.join(TMP_DIR, `${basename}.${process.pid}.cjs`);
  fs.writeFileSync(tmpFile, cjs);
  delete require.cache[tmpFile];
  return require(tmpFile);
}

module.exports = {
  TOOLS_DIR,
  builtins,
  MINIMAL_REACT,
  makeDomStubs,
  makeLocalStorage,
  cachedBundle,
  bundleShell,
  readSharedBundleSrc,
  readCoreSharedSource,
  runCjs,
  requireViaTmpFile,
};

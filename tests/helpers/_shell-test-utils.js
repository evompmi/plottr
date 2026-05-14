// Shared building blocks for the per-domain `*-loader.js` files. Every
// recent migration added esbuild.buildSync + vm.runInContext + React-stub
// boilerplate that was 80% identical across loaders; this module exposes
// the small composable pieces (built-in globals, neutral DOM stubs, the
// minimal React stub, esbuild bundling, in-memory localStorage, the
// "thread module.exports through a vm context" idiom) so each loader is
// just declaration of what it actually needs.
//
// What does NOT live here:
//
//   - The render-loader's real-React + happy-dom plumbing. That uses
//     `globalThis` rather than a vm.createContext sandbox; combining the
//     two would muddy the abstraction.
//   - Per-tool helpers loaders' Stryker-compatible require()-via-tmp-file
//     trick. That's specific to tools whose helpers.ts goes through
//     mutation testing; staying inline keeps the trick visible.
//
// Both of those continue to manage their own context.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const TOOLS_DIR = path.join(__dirname, "../../tools");

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

// Bundled IIFE source of the migrated `_core/shared.ts` module. When run via
// vm.runInContext, the inline `globalThis.X = X` shim at the bottom of the
// module populates the ctx globals so per-tool loaders that previously did
// `fs.readFileSync(.../shared.js)` keep working without redesign.
function readCoreSharedSource() {
  const result = esbuild.buildSync({
    entryPoints: [path.join(TOOLS_DIR, "_core/shared.ts")],
    bundle: true,
    format: "iife",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0].text;
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
// Writes `cjs` to `tests/.tmp/<basename>.cjs`, busts the require cache
// (Stryker mutates the source on disk per cold-start), and returns the
// exports.
function requireViaTmpFile(basename, cjs) {
  const tmpDir = path.join(__dirname, "../.tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${basename}.cjs`);
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
  bundleShell,
  readSharedBundleSrc,
  readCoreSharedSource,
  runCjs,
  requireViaTmpFile,
};

// Loads tools/_shell/handoff.ts into a Node vm context with an in-memory
// localStorage stub, so the round-trip between setHandoff and
// consumeHandoff can be unit-tested without a browser.
//
// The 2026-05 migration from tools/shared-handoff.js (plain-JS IIFE that
// attached to `window`) to tools/_shell/handoff.ts (typed ES module)
// means the loader now runs the source through esbuild.transformSync to
// CommonJS, threads `module.exports` through the vm context, and reads
// the named exports off the resulting object.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "../../tools/_shell/handoff.ts");

function freshContext() {
  const store = {};
  const localStorage = {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };

  // The new module also dispatches a CustomEvent on setHandoff to wake up
  // any same-tab consumer; stub `window` with a no-op event API so the
  // pure round-trip logic exercises without happy-dom.
  const moduleObj = { exports: {} };
  const ctx = {
    JSON,
    Object,
    localStorage,
    CustomEvent: function CustomEvent(_type, _init) {
      /* no-op */
    },
    module: moduleObj,
    exports: moduleObj.exports,
  };
  ctx.window = {
    dispatchEvent: () => true,
    location: { assign: () => {} },
  };
  vm.createContext(ctx);

  const src = fs.readFileSync(SRC, "utf8");
  const transformed = esbuild.transformSync(src, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  }).code;
  vm.runInContext(transformed, ctx);
  const exports_ = ctx.module.exports;
  return {
    store,
    localStorage,
    setHandoff: exports_.setHandoff,
    consumeHandoff: exports_.consumeHandoff,
  };
}

module.exports = { freshContext };

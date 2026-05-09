// Loads tools/_shell/prefs-store.ts into a Node vm context so its pure
// validation logic can be unit-tested without a browser. Stubs localStorage,
// document, and FileReader with in-memory equivalents.
//
// The 2026-05 migration from tools/shared-prefs.js (plain-JS global) to
// tools/_shell/prefs-store.ts (typed ES module) means the loader now runs
// the source through esbuild.transformSync to produce CommonJS-shaped
// output, threads `module.exports` through the vm context, and reads the
// named exports off the resulting object — same shape as the per-tool
// helpers loaders (e.g. tests/helpers/scatter-loader.js).

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "../../tools/_shell/prefs-store.ts");

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

  const downloadCalls = [];
  function downloadText(text, filename) {
    downloadCalls.push({ text, filename });
  }

  const moduleObj = { exports: {} };
  const ctx = {
    console,
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
    setTimeout: (fn, _ms) => {
      // Execute immediately so tests don't need to await a debounce window.
      fn();
      return 0;
    },
    clearTimeout: () => {},
    localStorage,
    downloadText,
    document: {
      createElement: () => ({
        addEventListener: () => {},
        appendChild: () => {},
        click: () => {},
        style: {},
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
    },
    FileReader: function () {
      this.readAsText = () => {};
    },
    module: moduleObj,
    exports: moduleObj.exports,
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
    downloadCalls,
    loadAutoPrefs: exports_.loadAutoPrefs,
    saveAutoPrefs: exports_.saveAutoPrefs,
    flushAutoPrefs: exports_.flushAutoPrefs,
    clearAutoPrefs: exports_.clearAutoPrefs,
    exportPrefsFile: exports_.exportPrefsFile,
    mergePrefsSettings: exports_.mergePrefsSettings,
    extractStylePrefs: exports_.extractStylePrefs,
    isLabelKey: exports_.isLabelKey,
    migratePrefs: exports_.migratePrefs,
    PREFS_SCHEMA_VERSION: exports_.PREFS_SCHEMA_VERSION,
  };
}

module.exports = { freshContext };

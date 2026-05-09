// Loads `tools/_shell/prefs-store.ts` into a Node vm context with an
// in-memory localStorage stub + a downloadText capture, so the
// load/save/migrate/merge logic can be unit-tested without a browser.
//
// `freshContext()` returns a fresh sandbox per call — prefs persistence
// tests mutate localStorage and need isolation across tests.

const vm = require("vm");
const {
  builtins,
  bundleShell,
  makeDomStubs,
  makeLocalStorage,
  runCjs,
} = require("./_shell-test-utils");

const PREFS_CJS = bundleShell("_shell/prefs-store.ts", { transform: true });

function freshContext() {
  const { store, localStorage } = makeLocalStorage();
  const downloadCalls = [];
  const ctx = {
    ...builtins(),
    ...makeDomStubs(),
    // Override the neutral localStorage stub with the round-trip-able one.
    localStorage,
    // Capture exportPrefsFile()'s downloadText() invocations so tests
    // can assert on what was emitted.
    downloadText: (text, filename) => {
      downloadCalls.push({ text, filename });
    },
    // Fire-immediately setTimeout — saveAutoPrefs's debounce window
    // doesn't need to elapse during unit tests.
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {},
  };
  vm.createContext(ctx);
  const exports_ = runCjs(ctx, PREFS_CJS);
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

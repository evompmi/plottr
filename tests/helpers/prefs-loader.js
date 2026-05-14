// Loads `tools/_shell/prefs-store.ts` into a Node vm context with an
// in-memory localStorage stub, so the load / save / migrate / merge logic
// can be unit-tested without a browser.
//
// `freshContext()` returns a fresh sandbox per call — prefs persistence
// tests mutate localStorage and need isolation across tests.
//
// `exportPrefsFile`'s actual download is intercepted by passing a capture
// callback as the third argument (an explicit DI hook on the function
// signature), so the test no longer needs to stub a `downloadText` global.

const vm = require("vm");
const {
  builtins,
  bundleShell,
  makeDomStubs,
  makeLocalStorage,
  runCjs,
} = require("./_shell-test-utils");

const PREFS_CJS = bundleShell("_shell/prefs-store.ts");

function freshContext() {
  const { store, localStorage } = makeLocalStorage();
  const downloadCalls = [];
  const ctx = {
    ...builtins(),
    ...makeDomStubs(),
    // Override the neutral localStorage stub with the round-trip-able one.
    localStorage,
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
  const captureDownload = (text, filename) => {
    downloadCalls.push({ text, filename });
  };
  return {
    store,
    localStorage,
    downloadCalls,
    loadAutoPrefs: exports_.loadAutoPrefs,
    saveAutoPrefs: exports_.saveAutoPrefs,
    flushAutoPrefs: exports_.flushAutoPrefs,
    clearAutoPrefs: exports_.clearAutoPrefs,
    // Pre-bind the capture callback so existing tests (`c.exportPrefsFile(tool,
    // vis)`) continue working without touching their call sites.
    exportPrefsFile: (toolName, vis) => exports_.exportPrefsFile(toolName, vis, captureDownload),
    mergePrefsSettings: exports_.mergePrefsSettings,
    extractStylePrefs: exports_.extractStylePrefs,
    isLabelKey: exports_.isLabelKey,
    migratePrefs: exports_.migratePrefs,
    PREFS_SCHEMA_VERSION: exports_.PREFS_SCHEMA_VERSION,
  };
}

module.exports = { freshContext };

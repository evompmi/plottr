// Loads `tools/_shell/handoff.ts` into a Node vm context with an
// in-memory localStorage stub, so the round-trip between `setHandoff`
// and `consumeHandoff` can be unit-tested without a browser.
//
// `freshContext()` returns a fresh sandbox per call — handoff round-trip
// tests mutate localStorage and need isolation across tests.

const vm = require("vm");
const { builtins, bundleShell, makeLocalStorage, runCjs } = require("./_shell-test-utils");

const HANDOFF_CJS = bundleShell("_shell/handoff.ts", { transform: true });

function freshContext() {
  const { store, localStorage } = makeLocalStorage();
  const ctx = {
    ...builtins(),
    localStorage,
    // setHandoff dispatches a CustomEvent on the same-tab path; stub
    // `window.dispatchEvent` and the constructor so the dispatch
    // exercises without happy-dom.
    CustomEvent: function () {},
    window: {
      dispatchEvent: () => true,
      location: { assign: () => {} },
    },
  };
  vm.createContext(ctx);
  const exports_ = runCjs(ctx, HANDOFF_CJS);
  return {
    store,
    localStorage,
    setHandoff: exports_.setHandoff,
    consumeHandoff: exports_.consumeHandoff,
  };
}

module.exports = { freshContext };

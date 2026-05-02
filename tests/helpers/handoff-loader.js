// Loads tools/shared-handoff.js into a Node vm context with an in-memory
// localStorage stub, so the round-trip between setHandoff and
// consumeHandoff can be unit-tested without a browser.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

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

  // shared-handoff.js attaches its API to `window`. Wire `window` to the
  // ctx itself so `window.setHandoff = …` registers as a context global.
  const ctx = { JSON, Object, localStorage };
  ctx.window = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, "../../tools/shared-handoff.js"), "utf8");
  vm.runInContext(src, ctx);
  return {
    store,
    localStorage,
    setHandoff: ctx.setHandoff,
    consumeHandoff: ctx.consumeHandoff,
  };
}

module.exports = { freshContext };

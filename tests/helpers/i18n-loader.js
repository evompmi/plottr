// Loads `_core/i18n.ts` into a Node vm context so its pure translation
// surface (registerCatalog / t / interpolation / plural fallback) and the
// localStorage-backed language state (getLang / setLang) can be unit-tested.
// React hooks + the LangToggle component need a real renderer and are
// covered via the component render path, not here.

const vm = require("vm");
const {
  builtins,
  makeDomStubs,
  makeLocalStorage,
  bundleShell,
  runCjs,
} = require("./_shell-test-utils");

const cjs = bundleShell("_core/i18n.ts", { transform: true });

const { store, localStorage } = makeLocalStorage();
const ctx = {
  ...builtins(),
  ...makeDomStubs(),
  localStorage, // real-ish store so setLang persistence is observable
  Intl, // plural selection uses Intl.PluralRules
  BroadcastChannel: undefined, // exercise the no-channel fallback path
};
vm.createContext(ctx);
const api = runCjs(ctx, cjs);

module.exports = {
  registerCatalog: api.registerCatalog,
  t: api.t,
  tHtml: api.tHtml,
  getLang: api.getLang,
  setLang: api.setLang,
  toggleLang: api.toggleLang,
  LANGS: api.LANGS,
  // Underlying localStorage record so persistence assertions can inspect it.
  store,
};

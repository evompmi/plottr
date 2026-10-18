// Loads `_shell/methods-text.ts` (the methods-section paragraph builder)
// into a Node vm context together with the i18n language switch, so the
// generated sentences can be checked in both English and French. The shell
// catalogs register as a side effect of the bundled `_shell/i18n` import.

const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");
const {
  builtins,
  cachedBundle,
  makeDomStubs,
  makeLocalStorage,
  runCjs,
} = require("./_shell-test-utils");

const TOOLS = path.join(__dirname, "..", "..", "tools");
// Through cachedBundle like every esbuild-bundling loader (see tests/CLAUDE.md).
const cjs = cachedBundle(
  "methods-text",
  () =>
    esbuild.buildSync({
      stdin: {
        contents:
          'export * from "./_shell/methods-text";\n' +
          'export { rTestCall, rPostHocCall } from "./_shell/r-export";\n' +
          'export { setLang } from "./_core/i18n";\n',
        resolveDir: TOOLS,
        loader: "ts",
      },
      bundle: true,
      format: "cjs",
      platform: "neutral",
      jsx: "transform",
      write: false,
    }).outputFiles[0].text
);

const { localStorage } = makeLocalStorage();
const ctx = {
  ...builtins(),
  ...makeDomStubs(),
  localStorage,
  Intl,
  BroadcastChannel: undefined,
};
// Version string the software sentence reads (normally from tools/version.js).
ctx.window = { ...(ctx.window || {}), __APP_VERSION__: "v9.9.9" };
vm.createContext(ctx);
module.exports = runCjs(ctx, cjs);

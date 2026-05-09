// Loads `tools/boxplot/stats-reducer.ts` into a Node vm context. The
// reducer has zero runtime dependencies (pure data-shape manipulation),
// so we just transform the TypeScript to CommonJS and evaluate it in an
// empty context.

const vm = require("vm");
const { bundleShell, runCjs } = require("./_shell-test-utils");

const reducerCjs = bundleShell("boxplot/stats-reducer.ts", { transform: true });

const ctx = { Object, Array };
vm.createContext(ctx);
const reducer = runCjs(ctx, reducerCjs);

module.exports = {
  statsInit: reducer.statsInit,
  statsReducer: reducer.statsReducer,
};

// Loads tools/boxplot/stats-reducer.ts into a Node vm context. The reducer
// has zero runtime dependencies (pure data-shape manipulation), so we just
// transform the TypeScript to CommonJS and evaluate it in an empty context.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const reducerSrc = fs.readFileSync(path.join(toolsDir, "boxplot/stats-reducer.ts"), "utf8");

const reducerCjs = esbuild.transformSync(reducerSrc, {
  loader: "ts",
  format: "cjs",
}).code;

const moduleObj = { exports: {} };
const ctx = {
  Object,
  Array,
  module: moduleObj,
  exports: moduleObj.exports,
};

vm.createContext(ctx);
vm.runInContext(reducerCjs, ctx);

module.exports = {
  statsInit: moduleObj.exports.statsInit,
  statsReducer: moduleObj.exports.statsReducer,
};

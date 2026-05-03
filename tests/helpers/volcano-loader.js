// Loads the Volcano pure helpers (tools/volcano/helpers.ts) into a Node
// vm context. Pattern matches tests/helpers/upset-loader.js: transform
// the TS module to CommonJS via esbuild, then evaluate it in a vm
// context that already has the shared globals (parseRaw / parseData /
// scanForFormulaInjection) available — though the volcano helpers
// happen not to need any of them, we still load tools/shared.js for
// future-proofing.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const helpersSrc = fs.readFileSync(path.join(toolsDir, "volcano/helpers.ts"), "utf8");

const helpersCjs = esbuild.transformSync(helpersSrc, {
  loader: "ts",
  format: "cjs",
}).code;

const moduleObj = { exports: {} };
const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Number,
  String,
  Array,
  Object,
  Infinity,
  NaN,
  Set,
  Map,
  RegExp,
  module: moduleObj,
  exports: moduleObj.exports,
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(helpersCjs, ctx);

module.exports = {
  // shared.js re-exports kept for parity with sibling loaders
  parseRaw: ctx.parseRaw,
  parseData: ctx.parseData,
  // volcano/helpers.ts exports
  VOLCANO_DEFAULT_COLORS: moduleObj.exports.VOLCANO_DEFAULT_COLORS,
  classifyPoint: moduleObj.exports.classifyPoint,
  computePFloor: moduleObj.exports.computePFloor,
  negLog10P: moduleObj.exports.negLog10P,
  countClamped: moduleObj.exports.countClamped,
  summarize: moduleObj.exports.summarize,
  autoDetectColumns: moduleObj.exports.autoDetectColumns,
  pickTopLabels: moduleObj.exports.pickTopLabels,
  layoutLabels: moduleObj.exports.layoutLabels,
  approxMonoCharWidth: moduleObj.exports.approxMonoCharWidth,
};

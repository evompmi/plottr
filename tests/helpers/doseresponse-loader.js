// Loads tools/doseresponse/helpers.ts and the shared globals it consumes
// (`tinv`, `fcdf`, `pStars`) for unit and property tests.
//
// Hybrid pattern (vm + require + globalThis bridge): same shape as
// tests/helpers/lineplot-loader.js. shared.js + the stats.js bundle land in
// a vm context as script-mode globals; we lift the names helpers.ts touches
// onto globalThis before require()ing the compiled helpers via a stable
// temp file (so Stryker's per-test coverage instrumentation can see them).

const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { readStatsSource } = require("./stats-source");
const { TOOLS_DIR, builtins, bundleShell, requireViaTmpFile } = require("./_shell-test-utils");

const sharedSrc = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf8");
const statsSrc = readStatsSource();

const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);

const NEEDED_GLOBALS = ["tinv", "fcdf", "pStars", "tcdf", "norminv", "betai", "gammaln"];
for (const name of NEEDED_GLOBALS) {
  if (ctx[name] !== undefined) globalThis[name] = ctx[name];
}

const helpers = requireViaTmpFile(
  "doseresponse-helpers",
  bundleShell("doseresponse/helpers.ts", { transform: true })
);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  tinv: ctx.tinv,
  fcdf: ctx.fcdf,
  fourPL: helpers.fourPL,
  fourPLGrad: helpers.fourPLGrad,
  initialGuesses: helpers.initialGuesses,
  correlationSign: helpers.correlationSign,
  invertMatrix: helpers.invertMatrix,
  runLM: helpers.runLM,
  fit4PL: helpers.fit4PL,
  buildXGrid: helpers.buildXGrid,
  curveBand: helpers.curveBand,
  buildObservations: helpers.buildObservations,
  computeReplicateSds: helpers.computeReplicateSds,
  fitMulti: helpers.fitMulti,
  fTestSharedParam: helpers.fTestSharedParam,
  formatLogTick: helpers.formatLogTick,
  fmtEC50: helpers.fmtEC50,
  fmtNum: helpers.fmtNum,
  logTickRange: helpers.logTickRange,
  PARAM_KEYS: helpers.PARAM_KEYS,
  PARAM_INDEX: helpers.PARAM_INDEX,
  DEFAULT_PARAM_LOCKS: helpers.DEFAULT_PARAM_LOCKS,
  CURVE_PALETTE: helpers.CURVE_PALETTE,
  VIS_INIT_DOSERESPONSE: helpers.VIS_INIT_DOSERESPONSE,
};

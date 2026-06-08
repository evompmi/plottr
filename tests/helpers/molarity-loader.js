// Loads tools/molarity-app/helpers.ts — the pure prep-sheet math for the
// molarity calculator (unit conversions, single-compound molarity, C1V1=C2V2
// dilution, ligation insert mass, batch-row mass) — into a Node vm context.
// The module is self-contained (no shared-kernel free vars, no React), so it
// bundles and evaluates standalone, the same way boxplot/layout.ts does.

const vm = require("vm");
const { builtins, makeDomStubs, bundleShell, runCjs } = require("./_shell-test-utils");

const helpersCjs = bundleShell("molarity-app/helpers.ts");

const ctx = { ...builtins(), ...makeDomStubs() };
vm.createContext(ctx);
const helpers = runCjs(ctx, helpersCjs);

module.exports = {
  CONC_UNITS: helpers.CONC_UNITS,
  VOL_UNITS: helpers.VOL_UNITS,
  MASS_UNITS: helpers.MASS_UNITS,
  toBase: helpers.toBase,
  fromBase: helpers.fromBase,
  formatResult: helpers.formatResult,
  formatMass: helpers.formatMass,
  parseValueUnit: helpers.parseValueUnit,
  parseMassVolConc: helpers.parseMassVolConc,
  solveMolarity: helpers.solveMolarity,
  solveDilution: helpers.solveDilution,
  computeLigationInsertNg: helpers.computeLigationInsertNg,
  computeBatchMass: helpers.computeBatchMass,
};

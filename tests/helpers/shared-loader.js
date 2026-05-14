// Loads the migrated `_core/shared.ts` module into a Node vm context so its
// pure functions can be tested. Browser-only functions (flashSaved,
// downloadSvg, downloadCsv) are excluded from exports because they require
// DOM APIs — they are tested separately via integration tests.

const vm = require("vm");
const { builtins, makeDomStubs, readCoreSharedSource } = require("./_shell-test-utils");

const src = readCoreSharedSource();

const ctx = { ...builtins(), ...makeDomStubs() };
vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = {
  // Color helpers
  hexToRgb: ctx.hexToRgb,
  rgbToHex: ctx.rgbToHex,
  shadeColor: ctx.shadeColor,
  getPointColors: ctx.getPointColors,
  // Seeded random
  seededRandom: ctx.seededRandom,
  // Axis ticks
  niceStep: ctx.niceStep,
  makeTicks: ctx.makeTicks,
  makeLogTicks: ctx.makeLogTicks,
  // Separator / decimal
  autoDetectSep: ctx.autoDetectSep,
  fixDecimalCommas: ctx.fixDecimalCommas,
  tokenizeDelimited: ctx.tokenizeDelimited,
  // Numeric detection
  isNumericValue: ctx.isNumericValue,
  normalizeNumericString: ctx.normalizeNumericString,
  toNumericValue: ctx.toNumericValue,
  // CSV builder (pure — round-trip with parseRaw)
  buildCsvString: ctx.buildCsvString,
  // Formula-injection scanner (security audit Tier A #1)
  scanForFormulaInjection: ctx.scanForFormulaInjection,
  // Parsing helpers
  detectHeader: ctx.detectHeader,
  parseRaw: ctx.parseRaw,
  guessColumnType: ctx.guessColumnType,
  detectWideFormat: ctx.detectWideFormat,
  parseData: ctx.parseData,
  dataToColumns: ctx.dataToColumns,
  wideToLong: ctx.wideToLong,
  reshapeWide: ctx.reshapeWide,
  parseWideMatrix: ctx.parseWideMatrix,
  // Set-membership helpers (Venn / UpSet)
  parseSetData: ctx.parseSetData,
  parseLongFormatSets: ctx.parseLongFormatSets,
  // Colour palettes (shared between scatter + heatmap). `const` bindings
  // inside vm.runInContext stay script-scoped (they don't become
  // properties of the context object), so reading `ctx.COLOR_PALETTES`
  // returns undefined. Re-evaluate via vm.runInContext to pull the
  // values out — same pattern as the volcano + discrete-palette loaders.
  COLOR_PALETTES: vm.runInContext("COLOR_PALETTES", ctx),
  DIVERGING_PALETTES: vm.runInContext("DIVERGING_PALETTES", ctx),
  interpolateColor: ctx.interpolateColor,
  // Filename helpers
  fileBaseName: ctx.fileBaseName,
  // Statistics
  computeStats: ctx.computeStats,
  quartiles: ctx.quartiles,
  kde: ctx.kde,
  computeGroupStats: ctx.computeGroupStats,
};

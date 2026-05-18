// Loads the Genome Track (GFF3) pure helpers (`tools/gff/helpers.ts`) into a
// Node vm context. helpers.ts is a pure-TS ES module — its only imports are
// from `tools/_core/*`, which esbuild inlines when `bundleShell` bundles the
// file to CommonJS. No shared script-scope globals are needed.

const vm = require("vm");
const { builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const ctx = builtins();
vm.createContext(ctx);
const helpers = runCjs(ctx, bundleShell("gff/helpers.ts"));

module.exports = {
  parseGff3: helpers.parseGff3,
  parseGffAttributes: helpers.parseGffAttributes,
  gffDecode: helpers.gffDecode,
  buildGeneModels: helpers.buildGeneModels,
  packModels: helpers.packModels,
  summarizeSeqids: helpers.summarizeSeqids,
  assignTypeColors: helpers.assignTypeColors,
  strandColor: helpers.strandColor,
  formatBp: helpers.formatBp,
  formatBpExact: helpers.formatBpExact,
};

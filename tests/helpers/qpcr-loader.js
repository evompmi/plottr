// Loads the qPCR pure helpers (`tools/qpcr/helpers.ts`) and report builders
// (`tools/qpcr/reports.ts`) plus the Excel template sheets
// (`tools/qpcr/template.ts`) as CommonJS, with the stats kernel and the
// shell stats dispatcher they import bundled in. Pattern matches
// proportions-loader.js.

const vm = require("vm");
const { builtins, bundleShell, runCjs, readCoreSharedSource } = require("./_shell-test-utils");

const sharedSrc = readCoreSharedSource();
const ctx = builtins();
vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
const helpers = runCjs(ctx, bundleShell("qpcr/helpers.ts"));
const reports = runCjs(ctx, bundleShell("qpcr/reports.ts"));
const template = runCjs(ctx, bundleShell("qpcr/template.ts"));

module.exports = {
  parseRaw: ctx.parseRaw,
  autoDetectSep: ctx.autoDetectSep,
  fixDecimalCommas: ctx.fixDecimalCommas,
  ...helpers,
  buildQpcrReport: reports.buildQpcrReport,
  buildQpcrRScript: reports.buildQpcrRScript,
  TEMPLATE_HEADERS: template.TEMPLATE_HEADERS,
  templateExampleRows: template.templateExampleRows,
  buildQpcrTemplateSheets: template.buildQpcrTemplateSheets,
};

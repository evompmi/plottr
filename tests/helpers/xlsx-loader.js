// Loads `tools/_core/xlsx.ts` (with the zip builder it imports bundled in)
// standalone. Like zip.ts it needs only TextEncoder / DataView / typed
// arrays / Blob, all present in Node — no shared-kernel pre-load.

const vm = require("vm");
const { builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const ctx = {
  ...builtins(),
  TextEncoder,
  DataView,
  Uint8Array,
  Uint32Array,
  ArrayBuffer,
  Blob,
};
vm.createContext(ctx);
const xlsx = runCjs(ctx, bundleShell("_core/xlsx.ts"));

module.exports = {
  buildXlsx: xlsx.buildXlsx,
  xmlEscape: xlsx.xmlEscape,
  columnLetter: xlsx.columnLetter,
  sanitizeSheetName: xlsx.sanitizeSheetName,
  XLSX_MIME: xlsx.XLSX_MIME,
};

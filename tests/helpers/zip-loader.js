// Loads `tools/_core/zip.ts` standalone. zip.ts imports nothing and uses
// only TextEncoder / DataView / Uint8Array / Blob (all present in Node), so
// a plain bundle-to-CJS + runCjs is enough — no shared-kernel pre-load, no
// DOM stubs.

const vm = require("vm");
const { builtins, bundleShell, runCjs } = require("./_shell-test-utils");

const zipCjs = bundleShell("_core/zip.ts");

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
const zip = runCjs(ctx, zipCjs);

module.exports = {
  buildZip: zip.buildZip,
};

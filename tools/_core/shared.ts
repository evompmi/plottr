// _core/shared.ts — barrel for the shared kernel.
//
// Was a single 1100-line module in the v1.6.0 cut; split along functional
// seams into eight modules in v1.6.x to make the surface discoverable. Each
// sub-module owns its own `globalThis.X = X` transitional shim, so importing
// the barrel (the SPA entry does this) triggers every shim and keeps the
// legacy ambient surface alive for unmigrated callers until the per-caller
// import sweep is complete.

export * from "./color";
export * from "./icons";
export * from "./numeric";
export * from "./scale";
export * from "./csv";
export * from "./descriptive";
export * from "./svg-export";
export * from "./download";

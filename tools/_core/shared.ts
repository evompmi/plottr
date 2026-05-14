// _core/shared.ts — barrel for the shared kernel.
//
// Was a single 1100-line module in the v1.6.0 cut; split along functional
// seams into eight modules in v1.6.x to make the surface discoverable.
// Each sub-module emits real `export` declarations and is imported
// directly by its callers — the legacy `globalThis.X = X` transitional
// shim layer was retired once every tool consumer switched to direct
// imports.

export * from "./color";
export * from "./icons";
export * from "./numeric";
export * from "./scale";
export * from "./csv";
export * from "./descriptive";
export * from "./svg-export";
export * from "./download";

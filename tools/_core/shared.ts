// _core/shared.ts — barrel for the shared kernel. Re-exports every named
// symbol from the eight focused sub-modules so callers can either import
// from the barrel (`import { parseRaw } from "../_core/shared"`) or from
// the specific sub-module (`import { parseRaw } from "../_core/csv"`).
// Direct sub-module imports are the more common idiom in the tree.

export * from "./color";
export * from "./icons";
export * from "./numeric";
export * from "./scale";
export * from "./csv";
export * from "./descriptive";
export * from "./svg-export";
export * from "./download";

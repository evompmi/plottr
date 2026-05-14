// stats/index.ts — barrel re-exporting the migrated stats kernels.
//
// Importing this module from `tools/_app/index.tsx` (Phase-1 transition) is
// what loads each sub-module's side-effect globalThis shim before any tool
// component mounts, so the legacy ambient-global surface stays alive for
// unmigrated callers until Phase-5 cleanup.
//
// Direct callers (e.g. `_shell/stats-registry.ts`) should import named
// symbols straight from this barrel; the per-file shape stays internal.

export * from "./types";
export * from "./format";
export * from "./dist";
export * from "./tests";
export * from "./posthoc";
export * from "./cluster";
export * from "./msi";

// stats/index.ts — barrel re-exporting every named symbol from the
// stats kernel modules.
//
// Callers import the named symbols they need directly from this barrel —
// `_shell/stats-registry.ts` consumes the test / post-hoc functions,
// `_shell/power-from-data.ts` consumes the power family, scatter / volcano
// / boxplot helpers import the descriptive stats and correlation tests
// from here as well.

export * from "./types";
export * from "./format";
export * from "./dist";
export * from "./regression";
export * from "./tests";
export * from "./posthoc";
export * from "./cluster";
export * from "./msi";

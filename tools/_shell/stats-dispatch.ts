// Shared test / post-hoc dispatchers for every plot tool that runs
// inferential stats (boxplot, lineplot, aequorin). Thin wrappers over
// `STATS_TEST_REGISTRY` and `STATS_POSTHOC_REGISTRY` (defined in
// `./stats-registry`) — the registry is the single source of truth for
// the test-id → (label, runner, post-hoc, arity) mapping.
//
// Pre-registry, this file carried its own switch chain on test names,
// duplicated across `shared-stats-tile.js` and `aequorin/reports.ts` —
// adding a new test meant editing 4+ string-matching sites with no
// compile-time guarantee they stayed in sync. The registry collapses
// the dispatch surface to one table.
//
// All three functions return `{ error }`-shaped values on failure so
// callers don't have to branch on the test name.

import { STATS_TEST_REGISTRY, STATS_POSTHOC_REGISTRY } from "./stats-registry";

type GroupValues = number[][];
export type TestResult = { p?: number; error?: string; [key: string]: unknown };

export function runTest(name: RecommendedTest | string, values: GroupValues): TestResult {
  const entry = STATS_TEST_REGISTRY[name as RecommendedTest];
  if (!entry) return { error: "unknown test" };
  try {
    return entry.run(values) as TestResult;
  } catch (e) {
    return { error: String((e && (e as Error).message) || e) };
  }
}

export function runPostHoc(
  name: Exclude<RecommendedPostHoc, null> | string,
  values: GroupValues
): { pairs?: unknown[]; error?: string } | null {
  const entry = STATS_POSTHOC_REGISTRY[name as Exclude<RecommendedPostHoc, null>];
  if (!entry) return null;
  try {
    return entry.run(values) as { pairs?: unknown[]; error?: string };
  } catch (e) {
    return { error: String((e && (e as Error).message) || e) };
  }
}

export function postHocForTest(
  testName: RecommendedTest | string | null | undefined
): Exclude<RecommendedPostHoc, null> | null {
  if (testName == null) return null;
  const entry = STATS_TEST_REGISTRY[testName as RecommendedTest];
  return entry ? entry.postHoc : null;
}

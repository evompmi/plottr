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

// Union shape of every `STATS_TEST_REGISTRY[*].run(values)` return. Each
// underlying test (tTest / mannWhitneyU / oneWayANOVA / welchANOVA /
// kruskalWallis — see `tools/stats-tests.js`) populates only its own
// statistic field; `p`, `df*`, and `error` are common. Kept as a single
// shape with optional fields rather than a discriminated union because
// the call sites probe by field presence (`if (res.t != null)`), which
// works directly without per-test narrowing.
export interface TestResult {
  // Test-specific statistic — exactly one of these is present on success.
  t?: number; // Student / Welch t
  U?: number; // Mann-Whitney U
  U1?: number;
  U2?: number;
  z?: number;
  F?: number; // one-way ANOVA / Welch's ANOVA
  ssBetween?: number;
  ssWithin?: number;
  grandMean?: number;
  H?: number; // Kruskal-Wallis

  // Common fields (populated by whichever test ran).
  df?: number;
  df1?: number;
  df2?: number;
  n1?: number;
  n2?: number;
  mean1?: number;
  mean2?: number;
  var1?: number;
  var2?: number;
  p?: number;

  // Set when the underlying test threw or refused (n<2, k<2, …).
  error?: string;
}

// Pull whichever test statistic the result carries — for stats CSV
// export and similar display contexts that don't care which test ran.
// Returns null when the result is missing, errored, or carries no
// recognisable statistic.
export function testStatistic(res: TestResult | null | undefined): number | null {
  if (!res || res.error) return null;
  return res.t ?? res.U ?? res.F ?? res.H ?? null;
}

// Union shape of every post-hoc pair across tukeyHSD / gamesHowell /
// dunnTest. Same rationale as `TestResult` — callers probe by field
// presence (`pr.diff != null`, `pr.z != null`) rather than discriminating
// on a method tag.
export interface PostHocPair {
  i: number;
  j: number;

  // Tukey / Games-Howell carry diff/se/q (and Tukey adds lwr/upr).
  diff?: number;
  se?: number;
  q?: number;
  df?: number;
  lwr?: number;
  upr?: number;

  // Dunn carries z.
  z?: number;

  // Common.
  p: number;
  pAdj?: number | null;
}

export interface PostHocResult {
  pairs: PostHocPair[];
  k?: number;
  df?: number;
  mse?: number;
  method?: string;
  error?: string;
  // Soft warning — the result is still usable, but one or more derived
  // quantities (typically Tukey HSD CI bounds at small df with large k
  // and 1−α ≥ 0.95) were silently NaN. See `qtukey`'s design-envelope
  // comment in `tools/stats-posthoc.js`.
  warning?: string;
}

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
): PostHocResult | null {
  const entry = STATS_POSTHOC_REGISTRY[name as Exclude<RecommendedPostHoc, null>];
  if (!entry) return null;
  try {
    // Cast via `unknown`: the registry signature is the open
    // `Record<string, unknown>` shape so the runtime can also carry
    // tool-specific metadata; the static narrow to `PostHocResult` is
    // safe because `tukeyHSD` / `gamesHowell` / `dunnTest` always
    // return `{ pairs, ... }`.
    return entry.run(values) as unknown as PostHocResult;
  } catch (e) {
    return { pairs: [], error: String((e && (e as Error).message) || e) };
  }
}

export function postHocForTest(
  testName: RecommendedTest | string | null | undefined
): Exclude<RecommendedPostHoc, null> | null {
  if (testName == null) return null;
  const entry = STATS_TEST_REGISTRY[testName as RecommendedTest];
  return entry ? entry.postHoc : null;
}

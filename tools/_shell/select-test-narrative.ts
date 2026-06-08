// Localized rebuild of the selectTest / selectCorrelation recommendation
// narrative shown beneath the stats panels.
//
// The kernel (_core/stats) emits the canonical ENGLISH `reason` string —
// consumed verbatim by the deterministic tests and the plain-text / R-script
// exports, so it must stay English. This component-tier builder reconstructs
// the same prose from the structured diagnostics the kernel already returns
// (normality[], levene, suggestion, k / n) so the *on-screen* rationale follows
// the UI language. The English output here matches the kernel string verbatim;
// the catalog `fr` entries carry the translation.
//
// `tt` is non-reactive — call these from a component that already subscribes to
// language (useShellT / useT) so it re-renders, and the rebuilt prose with it,
// on a language toggle. Alpha is a parameter (default 0.05) because the kernel
// result does not echo it back; every current caller uses the 0.05 default.

import { tt } from "./i18n";
import { formatP } from "../_core/stats/format";
import type { SelectTestResult } from "../_core/stats/types";

export function buildSelectTestReason(
  rec: SelectTestResult | null | undefined,
  alphaN = 0.05
): string | null {
  if (!rec || !rec.recommendation) return null;
  const k = rec.k;
  const base = k === 2 ? tt("shell.selreason.base2") : tt("shell.selreason.baseK");

  const normality = rec.normality || [];
  const flagged = normality.filter((r) => r.normal === false);
  const allKnownNormal = normality.length > 0 && normality.every((r) => r.normal === true);
  let sw: string;
  if (flagged.length === 0 && allKnownNormal) {
    sw = tt("shell.selreason.swNormalAll", { alpha: alphaN });
  } else if (flagged.length > 0) {
    const labels = flagged
      .map((r) =>
        tt("shell.selreason.swFlaggedLabel", {
          i: r.group + 1,
          w: Number(r.W).toFixed(3),
          p: formatP(r.p),
        })
      )
      .join(", ");
    sw = tt("shell.selreason.swFlagged", { n: flagged.length, k, alpha: alphaN, labels });
  } else {
    sw = tt("shell.selreason.swCannotRun");
  }

  const lev = rec.levene;
  let levStr: string;
  if (!lev || "error" in lev || !Number.isFinite(lev.F) || !Number.isFinite(lev.p)) {
    const err = lev && "error" in lev ? lev.error : "non-finite result";
    levStr = tt("shell.selreason.levError", { err });
  } else if (lev.equalVar === false) {
    levStr = tt("shell.selreason.levRejected", { f: lev.F.toFixed(3), p: formatP(lev.p) });
  } else {
    levStr = tt("shell.selreason.levNotRejected", { f: lev.F.toFixed(3), p: formatP(lev.p) });
  }

  let sugg = "";
  if (rec.suggestion) {
    const testName =
      rec.suggestion.test === "mannWhitney" ? "Mann-Whitney U" : "Kruskal-Wallis + Dunn (BH)";
    sugg = tt("shell.selreason.suggest", { test: testName });
  }

  return `${base} ${sw} ${levStr}${sugg}${tt("shell.selreason.override")}`;
}

// selectCorrelation's result type is module-local to _core/stats/tests.ts, so
// the param is typed structurally here.
interface CorrelationAxisLike {
  axis: string;
  W: number | null;
  p: number | null;
  normal: boolean | null;
}
interface CorrelationRecLike {
  n: number;
  normality?: CorrelationAxisLike[];
  allNormal?: boolean;
  recommendation?: { test: string; reason: string };
  suggestion?: { test: string; reason: string };
}

export function buildCorrelationReason(
  rec: CorrelationRecLike | null | undefined,
  alphaN = 0.05
): string | null {
  if (!rec || !rec.recommendation) return null;
  if (rec.n < 3) return tt("shell.correason.needPairs");

  const base = tt("shell.correason.base");
  const normality = rec.normality || [];
  const flagged = normality.filter((r) => r.normal === false);
  const allKnownNormal = normality.length > 0 && normality.every((r) => r.normal === true);
  let sw: string;
  if (flagged.length === 0 && allKnownNormal) {
    sw = tt("shell.correason.swNormal", { alpha: alphaN });
  } else if (flagged.length > 0) {
    const labels = flagged
      .map((r) =>
        tt("shell.correason.swFlaggedLabel", {
          axis: r.axis,
          w: Number(r.W).toFixed(3),
          p: formatP(r.p),
        })
      )
      .join(", ");
    sw = tt("shell.correason.swFlagged", { labels, alpha: alphaN });
  } else {
    sw = tt("shell.correason.swCannotRun");
  }

  const sugg = rec.suggestion ? tt("shell.correason.suggest") : "";
  return `${base} ${sw}${sugg}${tt("shell.selreason.override")}`;
}

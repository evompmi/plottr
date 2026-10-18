// Methods-section text: a short paragraph describing what the stats panel
// actually ran (test, post-hoc, corrections, sample sizes, display, software
// version and the equivalent R calls), for pasting into a paper. Pure and
// i18n-aware — sentences come from the shell catalog in the current
// language. It states only what Plöttr knows and adds no references.
//
// `buildGroupMethodsText` covers the group-comparison engine shared by Group
// Plot, RLU, Line Plot and qPCR (selectTest → runTest → runPostHoc); tools
// with other statistics (correlation, counts, set intersections) assemble
// their own sentences and finish with `softwareSentence`.

import { getLang } from "../_core/i18n";
import type { SelectTestKind, SelectTestPostHoc } from "../_core/stats/types";
import { tt, type ShellKey } from "./i18n";
import { rPostHocCall, rTestCall } from "./r-export";

export const PLOTTR_URL = "https://evompmi.github.io/plottr";

export function plottrVersion(): string {
  const w =
    typeof window !== "undefined" ? (window as Window & { __APP_VERSION__?: string }) : null;
  return (w && typeof w.__APP_VERSION__ === "string" && w.__APP_VERSION__) || "";
}

// "A, B and C" / "A, B et C" in the current language.
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  const lang = getLang();
  const LF = (Intl as unknown as { ListFormat?: typeof Intl.ListFormat }).ListFormat;
  if (LF) return new LF(lang, { style: "long", type: "conjunction" }).format(items);
  return items.slice(0, -1).join(", ") + (lang === "fr" ? " et " : " and ") + items.at(-1);
}

// "n = 24" or "n = 6–24", from every group size across the analysed sets.
export function nRange(ns: number[]): string {
  const finite = ns.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return "";
  let lo = Infinity,
    hi = -Infinity;
  for (const n of finite) {
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  return lo === hi ? `n = ${lo}` : `n = ${lo}–${hi}`;
}

// Separator between clauses of a list ("; " / " ; " in French).
export function listSep(): string {
  return tt("shell.methods.listSep");
}

// "P < 0.05 was considered significant."
export function alphaSentence(): string {
  return tt("shell.methods.alpha");
}

// Closing sentence: software, version, URL, and the R equivalents.
export function softwareSentence(rCalls: string[]): string {
  const uniq = rCalls.filter((c, i) => c && rCalls.indexOf(c) === i);
  const version = plottrVersion();
  const sw = tt("shell.methods.software", {
    version: version ? " " + version : "",
    url: PLOTTR_URL,
  });
  if (uniq.length === 0) return sw + ".";
  return sw + tt("shell.methods.rEquivalent", { calls: uniq.join(listSep()) }) + ".";
}

// What the chart summarises, for "Data are shown as …".
export type MethodsDisplayKind = "sem" | "sd" | "ci95" | "none" | "box";
const DISPLAY_KEYS: Record<MethodsDisplayKind, ShellKey> = {
  sem: "shell.methods.disp.sem",
  sd: "shell.methods.disp.sd",
  ci95: "shell.methods.disp.ci95",
  none: "shell.methods.disp.none",
  box: "shell.methods.disp.box",
};
export function methodsDisplay(kind: string | null | undefined): string | null {
  return kind && kind in DISPLAY_KEYS ? tt(DISPLAY_KEYS[kind as MethodsDisplayKind]) : null;
}

// ── Group comparisons (selectTest engine) ─────────────────────────────────

export interface MethodsSet {
  // Label of this set (facet level, x value, gene); only used with ≥ 2 sets.
  name?: string;
  test: SelectTestKind;
  // Mann-Whitney only: true = exact null distribution, false = normal approx.
  exact?: boolean;
  postHoc: Exclude<SelectTestPostHoc, null> | null;
  // Per-group sample sizes.
  ns: number[];
}

export interface GroupMethodsInput {
  sets: MethodsSet[];
  // What the sets split on (facet column, x-axis title) and how it reads:
  // "level" → "each level of “Genotype”", "x" → "each value of “Time (h)”".
  setLabel?: string;
  setKind?: "level" | "x";
  // Or the scope already phrased by the tool (e.g. "each target gene").
  setScope?: string;
  // What was compared, when it is not the plotted values themselves, e.g.
  // "per-replicate signal sums over the selected window".
  valueNote?: string;
  // True when the user replaced the default test on any set.
  overridden?: boolean;
  // p-values adjusted across the sets (Line Plot: BH across x values).
  adjustAcrossSets?: "bh" | null;
  // What the error bars / summary show, e.g. "mean ± SEM".
  display?: string | null;
  // Tool-specific sentences: `intro` opens the paragraph (e.g. how the
  // analysed values were derived), `extra` goes before the software sentence.
  intro?: string[];
  extra?: string[];
}

const TEST_KEYS: Record<SelectTestKind, ShellKey> = {
  studentT: "shell.methods.test.studentT",
  welchT: "shell.methods.test.welchT",
  mannWhitney: "shell.methods.test.mannWhitney",
  oneWayANOVA: "shell.methods.test.oneWayANOVA",
  welchANOVA: "shell.methods.test.welchANOVA",
  kruskalWallis: "shell.methods.test.kruskalWallis",
};

const POSTHOC_KEYS: Record<Exclude<SelectTestPostHoc, null>, ShellKey> = {
  tukeyHSD: "shell.methods.posthoc.tukeyHSD",
  gamesHowell: "shell.methods.posthoc.gamesHowell",
  dunn: "shell.methods.posthoc.dunn",
};

// "Welch's t-test" / "a two-sided Mann-Whitney U test (exact p-values)" /
// "Welch's one-way ANOVA followed by Games-Howell pairwise comparisons".
function testPhrase(
  test: SelectTestKind,
  exact: boolean | "mixed" | undefined,
  postHoc: Exclude<SelectTestPostHoc, null> | null
): string {
  let s = tt(TEST_KEYS[test]);
  if (test === "mannWhitney") {
    s += tt(
      exact === "mixed"
        ? "shell.methods.mwMixed"
        : exact
          ? "shell.methods.mwExact"
          : "shell.methods.mwApprox"
    );
  }
  if (postHoc) s += tt("shell.methods.followedBy", { posthoc: tt(POSTHOC_KEYS[postHoc]) });
  return s;
}

export function buildGroupMethodsText(m: GroupMethodsInput): string {
  const sets = m.sets.filter((s) => s.ns.length >= 2);
  if (sets.length === 0) return "";
  const out: string[] = [];
  const allNs = sets.flatMap((s) => s.ns);
  const n = nRange(allNs);

  if (m.intro) out.push(...m.intro);
  if (m.valueNote) out.push(tt("shell.methods.valueNote", { what: m.valueNote }));

  // Group the sets by the analysis they received.
  const sigs: Array<{ key: string; set: MethodsSet; names: string[]; exact: boolean[] }> = [];
  for (const s of sets) {
    const key = s.test + "|" + (s.postHoc || "");
    let g = sigs.find((x) => x.key === key);
    if (!g) {
      g = { key, set: s, names: [], exact: [] };
      sigs.push(g);
    }
    if (s.name) g.names.push(s.name);
    if (s.test === "mannWhitney") g.exact.push(!!s.exact);
  }
  const exactOf = (g: (typeof sigs)[number]): boolean | "mixed" | undefined => {
    if (g.exact.length === 0) return undefined;
    if (g.exact.every((e) => e)) return true;
    if (g.exact.every((e) => !e)) return false;
    return "mixed";
  };

  if (sets.length === 1) {
    const s = sets[0];
    const k = s.ns.length;
    const phrase = testPhrase(s.test, exactOf(sigs[0]), s.postHoc);
    out.push(
      k === 2
        ? tt("shell.methods.compareTwo", { n, test: phrase })
        : tt("shell.methods.compareK", { k, n, test: phrase })
    );
  } else {
    const scope = m.setScope
      ? m.setScope
      : m.setLabel
        ? tt(m.setKind === "x" ? "shell.methods.scopeX" : "shell.methods.scopeLevel", {
            label: m.setLabel,
          })
        : tt("shell.methods.eachSet");
    if (sigs.length === 1) {
      out.push(
        tt("shell.methods.compareWithinSame", {
          scope,
          count: sets.length,
          test: testPhrase(sigs[0].set.test, exactOf(sigs[0]), sigs[0].set.postHoc),
        })
      );
    } else {
      const parts = sigs.map((g) =>
        tt("shell.methods.testFor", {
          test: testPhrase(g.set.test, exactOf(g), g.set.postHoc),
          names: joinList(g.names),
        })
      );
      out.push(tt("shell.methods.compareWithinMixed", { scope, list: parts.join(listSep()) }));
    }
    out.push(tt("shell.methods.sizes", { n }));
  }

  if (m.adjustAcrossSets === "bh" && sets.length > 1) {
    out.push(tt("shell.methods.adjustBH", { count: sets.length }));
  }

  const anyWelch = sets.some((s) => s.test === "welchT" || s.test === "welchANOVA");
  out.push(
    tt(!m.overridden && anyWelch ? "shell.methods.policyWelch" : "shell.methods.diagnostics")
  );
  out.push(tt("shell.methods.alpha"));
  if (m.display) out.push(tt("shell.methods.display", { display: m.display }));
  if (m.extra) out.push(...m.extra);

  const calls: string[] = [];
  for (const g of sigs) {
    const c = rTestCall(g.set.test);
    if (c) calls.push(c);
    const ph = rPostHocCall(g.set.postHoc);
    if (ph) calls.push(ph);
  }
  out.push(softwareSentence(calls));
  return out.join(" ");
}

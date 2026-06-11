// Shared state hook for every plot tool. Owns the upload-step state
// (step, rawText/fileName, separator override, decimal-comma fix flags,
// parse error) plus the `vis` reducer with auto-prefs persistence —
// everything every plot tool's `App()` needs.
//
// Tool-specific state (selectedMask, parsed rows, pendingSelection, etc.)
// stays outside this hook — the goal is a common scaffold, not a kitchen
// sink.

import { loadAutoPrefs, saveAutoPrefs } from "./prefs-store";

import type { FormulaInjectionWarning } from "../_core/csv";
const { useState, useReducer, useEffect } = React;

export interface PlotToolState<TVis extends object> {
  step: string;
  setStep: (s: string) => void;
  fileName: string;
  setFileName: (n: string) => void;
  parseError: string | null;
  setParseError: (e: string | null) => void;
  sepOverride: string;
  setSepOverride: (s: string) => void;
  commaFixed: boolean;
  setCommaFixed: (b: boolean) => void;
  commaFixCount: number;
  setCommaFixCount: (n: number) => void;
  // Result of scanForFormulaInjection on the most recent ingest. Set by each
  // tool's parse handler; null when the dataset is clean. Surfaced via
  // FormulaInjectionBanner inside PlotToolShell.
  injectionWarning: FormulaInjectionWarning | null;
  setInjectionWarning: (w: FormulaInjectionWarning | null) => void;
  vis: TVis;
  updVis: (patch: Partial<TVis> | { _reset: true }) => void;
}

export function usePlotToolState<TVis extends object>(
  toolKey: string,
  initialVis: TVis
): PlotToolState<TVis> {
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [injectionWarning, setInjectionWarning] = useState<FormulaInjectionWarning | null>(null);

  // The reducer captures `initialVis` by reference; React only invokes the
  // third argument (the initializer) once, so a new inline initialVis object
  // per render doesn't re-seed state. `_reset` resets to the initial shape
  // without touching persisted auto-prefs.
  const [vis, updVis] = useReducer(
    (s: TVis, a: Partial<TVis> | { _reset: true }) =>
      "_reset" in a && a._reset ? { ...initialVis } : { ...s, ...(a as Partial<TVis>) },
    initialVis,
    (init) => loadAutoPrefs(toolKey, init)
  );

  useEffect(() => {
    saveAutoPrefs(toolKey, vis);
  }, [toolKey, vis]);

  // Warn before a reload / tab-close silently discards an in-progress
  // dataset. Plot data lives only in memory — nothing but style prefs is
  // persisted — so a reload loses the pasted/loaded data and the configured
  // plot. Arm the guard only once the user has moved past the upload step
  // (a dataset is actually loaded); an empty upload screen has nothing to
  // lose, and tool-to-tool navigation is in-SPA so it never triggers
  // `beforeunload`. Browsers show their own generic "Leave site?" prompt;
  // custom text is no longer supported, hence the empty `returnValue`.
  useEffect(() => {
    if (step === "upload") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [step]);

  return {
    step,
    setStep,
    fileName,
    setFileName,
    parseError,
    setParseError,
    sepOverride,
    setSepOverride,
    commaFixed,
    setCommaFixed,
    commaFixCount,
    setCommaFixCount,
    injectionWarning,
    setInjectionWarning,
    vis,
    updVis,
  };
}

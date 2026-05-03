// venn/index.tsx — App orchestrator for the Venn tool. This file is the
// esbuild entry point (bundles to tools/venn/index.js) and only holds state
// wiring — chart rendering, step panels, sidebar controls, and plot-area
// composition live in sibling modules under tools/venn/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { computeIntersections, detectLongFormat, VIS_INIT_VENN } from "./helpers";
import { UploadStep, ConfigureStep } from "./steps";
import { PlotControls } from "./controls";
import { PlotArea } from "./plot-area";

const { useState, useMemo, useCallback, useRef } = React;

// parseSetData lives in tools/shared.js (shared with the UpSet tool).
// Pure helpers (geometry, set math, region paths) live in tools/venn/*.ts.

function App() {
  const shell = usePlotToolState("venn", VIS_INIT_VENN);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    setInjectionWarning,
    vis,
    updVis,
  } = shell;

  const [setNames, setSetNames] = useState<string[]>([]);
  const [sets, setSets] = useState<Map<string, Set<string>>>(new Map());
  const [setColors, setSetColors] = useState<Record<string, string>>({});
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [selectedMask, setSelectedMask] = useState<number | null>(null);
  const [activeSets, setActiveSets] = useState<Set<string>>(new Set());
  const [allColumnNames, setAllColumnNames] = useState<string[]>([]);
  const [allColumnSets, setAllColumnSets] = useState<Map<string, Set<string>>>(new Map());
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [isLongFormat, setIsLongFormat] = useState(false);

  const [proportional, setProportional] = useState(false);

  const chartRef = useRef<SVGSVGElement | null>(null);
  const [layoutInfo, setLayoutInfo] = useState({
    warnings: [] as string[],
    proportional: true,
    maxError: 0,
    meanError: 0,
  });

  const activeSetNames = useMemo(
    () => setNames.filter((n) => activeSets.has(n)),
    [setNames, activeSets]
  );
  const activeSetsMap = useMemo(() => {
    const m = new Map();
    for (const n of activeSetNames) m.set(n, sets.get(n));
    return m;
  }, [activeSetNames, sets]);

  const intersections = useMemo(() => {
    if (activeSetNames.length < 2) return [];
    return computeIntersections(activeSetNames, activeSetsMap);
  }, [activeSetNames, activeSetsMap]);

  const canNavigate = useCallback(
    (target: string) => {
      if (target === "upload") return true;
      if (target === "configure") return allColumnNames.length >= 2;
      if (target === "plot") {
        // When leaving configure, gate on the pending (pre-commit) selection
        // so the nav button tracks the checkboxes the user just edited.
        if (step === "configure")
          return pendingSelection.length >= 2 && pendingSelection.length <= 3;
        return setNames.length >= 2;
      }
      return false;
    },
    [allColumnNames, setNames, step, pendingSelection]
  );

  const commitSelection = useCallback((names: string[], allSets: Map<string, Set<string>>) => {
    const chosen = new Map<string, Set<string>>();
    names.forEach((n) => chosen.set(n, allSets.get(n)!));
    setSetNames(names);
    setSets(chosen);
    setActiveSets(new Set(names));
    const cols: Record<string, string> = {};
    names.forEach((n, i) => {
      cols[n] = PALETTE[i % PALETTE.length];
    });
    setSetColors(cols);
    setSelectedMask(null);
  }, []);

  // StepNavBar's top "Plot" tab routes via shell.setStep directly, so without
  // this intercept the user's configure-step checkbox edits would be lost
  // (only the bottom "Plot →" button ran commitSelection). Commit the
  // pending selection if it differs from the current one before navigating.
  const navigateStep = useCallback(
    (target: string) => {
      if (
        target === "plot" &&
        step === "configure" &&
        pendingSelection.length >= 2 &&
        pendingSelection.length <= 3
      ) {
        const changed =
          pendingSelection.length !== setNames.length ||
          pendingSelection.some((n: string) => !setNames.includes(n));
        if (changed) commitSelection(pendingSelection, allColumnSets);
      }
      setStep(target);
    },
    [step, pendingSelection, setNames, allColumnSets, commitSelection, setStep]
  );

  const doParse = useCallback(
    (text: string, sep: string) => {
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const { headers, rows, injectionWarnings } = parseRaw(dc.text, sep);
      setInjectionWarning(injectionWarnings);
      if (!headers.length || !rows.length) {
        setParseError("The file appears to be empty or has no data rows.");
        return;
      }

      // Decide long-format vs wide. Logic extracted into `detectLongFormat`
      // (tools/venn/long-format-detect.ts) so it's unit-testable; see that
      // file for the decision rules and the audit-M2 history.
      let sn: string[] = [];
      let ss: Map<string, Set<string>> = new Map();
      let usedLongFormat = false;
      if (headers.length === 2 && detectLongFormat(headers, rows).isLong) {
        try {
          const longParsed = parseLongFormatSets(headers, rows);
          sn = longParsed.setNames;
          ss = longParsed.sets;
          usedLongFormat = true;
        } catch {
          /* fall through to wide parse */
        }
      }
      if (!usedLongFormat) {
        const wide = parseSetData(headers, rows);
        sn = wide.setNames;
        ss = wide.sets;
      }

      if (sn.length < 2) {
        setParseError("Need at least 2 sets — each column header becomes a set name.");
        return;
      }

      setParseError(null);
      setParsedHeaders(headers);
      setParsedRows(rows);
      setAllColumnNames(sn);
      setAllColumnSets(ss);
      setIsLongFormat(usedLongFormat);

      if (sn.length <= 3) {
        setPendingSelection(sn);
        commitSelection(sn, ss);
        setStep("plot");
      } else {
        setPendingSelection([]);
        setSetNames([]);
        setSets(new Map());
        setActiveSets(new Set());
        setSetColors({});
        setSelectedMask(null);
        setStep("configure");
      }
    },
    [commitSelection, setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse, setFileName]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__VENN_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFileName("arabidopsis_stress.csv");
    doParse(text, ",");
  }, [doParse, setFileName, setSepOverride]);

  const handleColorChange = (name: string, color: string) => {
    setSetColors((prev) => ({ ...prev, [name]: color }));
  };

  const handleRename = (oldName: string, newName: string) => {
    if (oldName === newName || setNames.includes(newName)) return false;
    setSetNames((prev) => prev.map((n) => (n === oldName ? newName : n)));
    setSets((prev) => {
      const m = new Map<string, Set<string>>();
      for (const [k, v] of prev) m.set(k === oldName ? newName : k, v);
      return m;
    });
    setSetColors((prev) => {
      const c: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) c[k === oldName ? newName : k] = v;
      return c;
    });
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(oldName)) {
        s.delete(oldName);
        s.add(newName);
      }
      return s;
    });
    return true;
  };

  const handleToggleSet = (name: string) => {
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name);
      else s.add(name);
      return s;
    });
    setSelectedMask(null);
  };

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(new Map());
    setSetColors({});
    setActiveSets(new Set());
    setParseError(null);
    setInjectionWarning(null);
    setSelectedMask(null);
    setProportional(false);
    updVis({ _reset: true });
  };

  const selectedIntersection = intersections.find((g) => g.mask === selectedMask) || null;

  return (
    <PlotToolShell
      state={{ ...shell, setStep: navigateStep }}
      toolName="venn"
      title="Venn Diagram"
      visInit={VIS_INIT_VENN}
      steps={["upload", "configure", "plot"]}
      stepLabels={{
        // With 2–3 detected sets, step 2 is just a post-import sanity check
        // (rename / pick a colour and carry on). With 4+ it turns into a
        // real configure flow: the UpSet nudge, the 3-set cap, and the
        // rename/recolour picker all live there. Relabel so the stepper
        // tells users which it is at a glance.
        configure: allColumnNames.length >= 4 ? "Configure" : "Import check",
      }}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          handleFileLoad={handleFileLoad}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && allColumnNames.length >= 2 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          allColumnNames={allColumnNames}
          allColumnSets={allColumnSets}
          pendingSelection={pendingSelection}
          setPendingSelection={setPendingSelection}
          isLongFormat={isLongFormat}
        />
      )}

      {step === "plot" && activeSetNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              allSetNames={setNames}
              allSets={sets}
              activeSetNames={activeSetNames}
              activeSets={activeSets}
              intersections={intersections}
              onToggleSet={handleToggleSet}
              setColors={setColors}
              onColorChange={handleColorChange}
              onRename={handleRename}
              vis={vis}
              updVis={updVis}
              chartRef={chartRef}
              resetAll={resetAll}
              proportional={proportional}
              onProportionalChange={setProportional}
              fileName={fileName}
            />
            <PlotArea
              chartRef={chartRef}
              activeSetNames={activeSetNames}
              activeSetsMap={activeSetsMap}
              intersections={intersections}
              setColors={setColors}
              selectedMask={selectedMask}
              setSelectedMask={setSelectedMask}
              vis={vis}
              proportional={proportional}
              layoutInfo={layoutInfo}
              setLayoutInfo={setLayoutInfo}
              selectedIntersection={selectedIntersection}
              fileName={fileName}
            />
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Venn diagram">
    <App />
  </ErrorBoundary>
);

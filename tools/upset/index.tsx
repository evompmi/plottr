// upset/index.tsx — App orchestrator for the UpSet tool. This is the
// esbuild entry point (bundles to tools/upset/index.js). Chart, step
// panels, sidebar controls, intersection-stats panel, and item list
// live in sibling modules under tools/upset/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { ScrollablePlotCard } from "../_shell/ScrollablePlotCard";
import {
  computeMemberships,
  enumerateIntersections,
  sortIntersections,
  truncateIntersections,
} from "./helpers";
import { UpsetChart } from "./chart";
import { UploadStep, ConfigureStep, ItemListPanel } from "./steps";
import { PlotControls } from "./controls";
import { IntersectionStatsPanel } from "./stats-panel";

const { useState, useMemo, useCallback, useRef, useEffect } = React;

// parseSetData and parseLongFormatSets live in tools/shared.js.

const VIS_INIT_UPSET = {
  plotTitle: "",
  plotSubtitle: "",
  plotBg: "#ffffff",
  fontSize: 12,
  barOpacity: 1,
  dotSize: 6,
  sortMode: "size-desc",
  minSize: 1,
  minDegree: 1,
  // `maxDegree: null` means "no upper bound" (keep every degree). Persists
  // through loadAutoPrefs as null; the chart renders against setNames.length
  // when null.
  maxDegree: null as number | null,
  showIntersectionLabels: true,
  showSetSizeLabels: true,
  // "off" | "stars" | "p-value". Controls what (if anything) is drawn
  // above an intersection bar once the user has run the significance test
  // for that intersection. Only affects tested intersections — untested
  // bars never get a marker. Default: off (stays in the side panel only).
  significanceDisplay: "off",
  // When true, intersection bars with a cached test are coloured by
  // direction: green for significant enrichment, dark red for significant
  // depletion, black otherwise. Both tails can trigger — depletion is not a
  // dead branch (e.g. observed=0 against expected=5 gives a tiny lower-tail
  // p and a non-significant upper-tail p), so this surfaces findings the
  // star/p-value markers alone would hide.
  colorBarsBySignificance: false,
};

function App() {
  const shell = usePlotToolState("upset", VIS_INIT_UPSET);
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

  const [format, setFormat] = useState("wide");
  const [setNames, setSetNames] = useState<string[]>([]);
  const [sets, setSets] = useState<Map<string, Set<string>>>(new Map());
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [selectedMask, setSelectedMask] = useState<number | null>(null);
  const [allColumnNames, setAllColumnNames] = useState<string[]>([]);
  const [allColumnSets, setAllColumnSets] = useState<Map<string, Set<string>>>(new Map());
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [pendingMinDegree, setPendingMinDegree] = useState(1);
  const [pendingMaxDegree, setPendingMaxDegree] = useState<number>(Infinity);

  // Significance-test state for the selected intersection (Phase 2 of the
  // SuperExactTest-style work). The universe size defaults to the number of
  // distinct items across all uploaded sets but is user-overridable — a real
  // analysis often needs a larger background (e.g. the full genome, not just
  // the union of uploaded lists). The cache is keyed on `${mask}:${universe}`
  // so a universe-size change invalidates previously computed p-values. BH
  // adjustment runs across the cache every time a new entry is added.
  const [intersectionTests, setIntersectionTests] = useState(new Map());
  const [universeSize, setUniverseSize] = useState<number | "">("");
  const [universeOverridden, setUniverseOverridden] = useState(false);
  // Batch-compute state: `computingStats` gates the "Compute stats" button
  // (prevents double-fire mid-run); `computeProgress` drives the loader.
  const [computingStats, setComputingStats] = useState(false);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });

  const chartRef = useRef<SVGSVGElement | null>(null);

  // Sets render size-descending; rename/reorder isn't supported since the
  // uploaded file is the source of truth.
  const displaySetNames = useMemo(() => {
    const copy = setNames.slice();
    copy.sort((a, b) => (sets.get(b)?.size || 0) - (sets.get(a)?.size || 0));
    return copy;
  }, [setNames, sets]);

  const { allIntersections, membershipMap } = useMemo(() => {
    if (displaySetNames.length < 2)
      return {
        allIntersections: [] as ReturnType<typeof enumerateIntersections>,
        membershipMap: new Map<string, number>(),
      };
    const { membershipMap } = computeMemberships(displaySetNames, sets);
    return {
      allIntersections: enumerateIntersections(membershipMap, displaySetNames),
      membershipMap,
    };
  }, [displaySetNames, sets]);

  // Default universe = number of distinct items across all sets. When the
  // user hasn't explicitly overridden the field, track this automatically.
  const defaultUniverseSize = membershipMap.size;
  React.useEffect(() => {
    if (!universeOverridden) {
      setUniverseSize(defaultUniverseSize || "");
    }
  }, [defaultUniverseSize, universeOverridden]);

  // Chart-side lookup: only mark bars whose cached entry matches the current
  // universe size. Prior results for a different N are deliberately ignored —
  // they're stale under the active null.
  const significanceByMask = useMemo(() => {
    const m = new Map();
    const currentN = typeof universeSize === "number" ? universeSize : Number(universeSize);
    if (!Number.isFinite(currentN)) return m;
    for (const entry of intersectionTests.values()) {
      if (entry.universe === currentN) {
        m.set(entry.mask, {
          p: entry.p,
          pAdj: entry.pAdj,
          pAdjUpper: entry.pAdjUpper,
          pAdjLower: entry.pAdjLower,
          pAdjTwoSided: entry.pAdjTwoSided,
          direction: entry.direction,
        });
      }
    }
    return m;
  }, [intersectionTests, universeSize]);

  const sortedIntersections = useMemo(
    () => sortIntersections(allIntersections, vis.sortMode),
    [allIntersections, vis.sortMode]
  );

  // Largest intersection size in the current dataset (pre-filter). Drives the
  // dynamic max of the "Minimum intersection size" slider so the slider range
  // always matches what's actually on screen.
  const maxAllIntersectionSize = useMemo(
    () => allIntersections.reduce((m, r) => (r.size > m ? r.size : m), 0),
    [allIntersections]
  );

  // If the persisted minSize exceeds the current dataset's largest intersection,
  // clamp it down so the filter doesn't silently hide every bar after a
  // dataset swap (prefs persist per-tool, not per-dataset).
  // Intentionally depends only on maxAllIntersectionSize: we want to clamp
  // when the dataset changes, not on every minSize slider tick (which would
  // pull `vis.minSize` into the deps and re-fire mid-drag).
  React.useEffect(() => {
    if (maxAllIntersectionSize > 0 && vis.minSize > maxAllIntersectionSize) {
      updVis({ minSize: maxAllIntersectionSize });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxAllIntersectionSize]);

  const truncatedIntersections = useMemo(
    () =>
      truncateIntersections(sortedIntersections, {
        minSize: vis.minSize,
        minDegree: vis.minDegree,
        maxDegree: vis.maxDegree ?? Infinity,
      }),
    [sortedIntersections, vis.minSize, vis.minDegree, vis.maxDegree]
  );

  // Batch-compute significance for every intersection under the active set
  // selection — NOT the display-filtered subset. The minSize / minDegree /
  // maxDegree controls in the plot sidebar are purely visual; letting them
  // scope the BH family would make the multiple-testing correction depend on
  // the view, which is a real stats-validity bug (hide bars → BH adjusts over
  // a smaller family → surviving p-values look more significant). Active set
  // selection still scopes the null — that one IS a scientific choice.
  // Runs asynchronously in ~16-bar chunks with `setTimeout(0)` between them
  // so the progress bar actually animates and the browser doesn't freeze on
  // large configurations.
  const computeAllIntersectionStats = useCallback(async () => {
    if (computingStats) return;
    const universeN = typeof universeSize === "number" ? universeSize : Number(universeSize);
    if (!Number.isFinite(universeN) || universeN <= 0) return;
    // Test the EXCLUSIVE bar height. Under the independence approximation,
    // each item is in this cell with probability
    //   p_M = Π_{i∈inside}(nᵢ/N) · Π_{j∈outside}(1 − n_j/N),
    // so the count follows Binomial(N, p_M). Degree-1 bars are fine under
    // this null — "items in ONLY S_A" is a meaningful enrichment question.
    const bars = allIntersections;
    if (bars.length === 0) return;

    setComputingStats(true);
    setComputeProgress({ done: 0, total: bars.length });

    const pending = new Map(intersectionTests);
    const CHUNK_SIZE = 16;
    for (let i = 0; i < bars.length; i++) {
      const inter = bars[i];
      const insideSizes = inter.setIndices.map(
        (idx) => (sets.get(displaySetNames[idx]) || new Set()).size
      );
      const outsideSizes: number[] = [];
      for (let j = 0; j < displaySetNames.length; j++) {
        if (!inter.setIndices.includes(j)) {
          outsideSizes.push((sets.get(displaySetNames[j]) || new Set()).size);
        }
      }
      const xExclusive = inter.size;
      const expected = multisetExclusiveExpected(insideSizes, outsideSizes, universeN);
      const direction =
        !Number.isFinite(expected) || Math.abs(xExclusive - expected) < 1e-9
          ? "neutral"
          : xExclusive > expected
            ? "enriched"
            : "depleted";
      const pUpper = multisetExclusiveP(xExclusive, insideSizes, outsideSizes, universeN, {
        tail: "upper",
      });
      const pLower = multisetExclusiveP(xExclusive, insideSizes, outsideSizes, universeN, {
        tail: "lower",
      });
      // Two-sided p — textbook "double the smaller tail" convention for a
      // Binomial one-parameter test. This is the honest headline value: it
      // doesn't require the viewer to pick a tail after seeing the data
      // (cherry-picking inflates false positives), and it captures signals
      // from whichever side is surprising — significantly enriched OR
      // significantly depleted. The per-tail values stay around for anyone
      // who wants the directional breakdown (shown in the ItemList panel).
      const pTwoSided =
        Number.isFinite(pUpper) && Number.isFinite(pLower)
          ? Math.min(1, 2 * Math.min(pUpper, pLower))
          : NaN;
      const key = `${inter.mask}:${universeN}`;
      pending.set(key, {
        mask: inter.mask,
        universe: universeN,
        xExclusive,
        insideSizes,
        outsideSizes,
        expected,
        direction,
        p: pTwoSided, // headline raw p is two-sided; tails kept alongside
        pUpper,
        pLower,
        pTwoSided,
        pAdj: null,
        pAdjUpper: null,
        pAdjLower: null,
        pAdjTwoSided: null,
      });
      if ((i + 1) % CHUNK_SIZE === 0 || i === bars.length - 1) {
        setComputeProgress({ done: i + 1, total: bars.length });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // BH adjustment. The headline `pAdj` (drives plot markers + bar colour)
    // comes from the two-sided family: one test per bar, one BH pass, no
    // cherry-picking. The per-tail adjustments are kept around for the
    // directional breakdown in the ItemList panel (so a user who wants to
    // see "how significant was the enrichment side specifically" still can).
    // NaN filter guards any stale / invalid entries from an earlier batch.
    const matching = [...pending.values()].filter(
      (e) =>
        e.universe === universeN &&
        Number.isFinite(e.pUpper) &&
        Number.isFinite(e.pLower) &&
        Number.isFinite(e.pTwoSided)
    );
    const adjUpper = bhAdjust(matching.map((e) => e.pUpper));
    const adjLower = bhAdjust(matching.map((e) => e.pLower));
    const adjTwoSided = bhAdjust(matching.map((e) => e.pTwoSided));
    matching.forEach((e, j) => {
      e.pAdjUpper = adjUpper[j];
      e.pAdjLower = adjLower[j];
      e.pAdjTwoSided = adjTwoSided[j];
      e.pAdj = adjTwoSided[j]; // plot markers + bar colour key on `pAdj`
    });

    setIntersectionTests(pending);
    setComputingStats(false);
    setComputeProgress({ done: 0, total: 0 });
  }, [computingStats, universeSize, allIntersections, intersectionTests, sets, displaySetNames]);

  // Clear all cached stats — useful after a universe change if the user
  // wants to wipe stale entries before recomputing.
  const clearIntersectionStats = useCallback(() => {
    setIntersectionTests(new Map());
  }, []);

  const canNavigate = useCallback(
    (target: string) => {
      if (target === "upload") return true;
      if (target === "configure") return allColumnNames.length >= 2;
      if (target === "plot") {
        // When leaving configure, gate on the pending (pre-commit) selection
        // so the nav button tracks the checkboxes the user just edited.
        if (step === "configure") return pendingSelection.length >= 2;
        return displaySetNames.length >= 2;
      }
      return false;
    },
    [allColumnNames, displaySetNames, step, pendingSelection]
  );

  const commitSelection = useCallback((names: string[], allSets: Map<string, Set<string>>) => {
    const chosen = new Map<string, Set<string>>();
    names.forEach((n) => chosen.set(n, allSets.get(n)!));
    setSetNames(names);
    setSets(chosen);
    setSelectedMask(null);
  }, []);

  // StepNavBar's top "Plot" tab routes via shell.setStep directly, so without
  // this intercept the user's configure-step edits (set selection + degree
  // cutoffs) would be lost. Commit the pending selection if it differs from
  // the current one and patch vis with the pending min/max degree before
  // navigating, matching what the old bottom "Plot →" button used to do.
  const navigateStep = useCallback(
    (target: string) => {
      if (target === "plot" && step === "configure" && pendingSelection.length >= 2) {
        const changed =
          pendingSelection.length !== setNames.length ||
          pendingSelection.some((n: string) => !setNames.includes(n));
        if (changed) commitSelection(pendingSelection, allColumnSets);
        updVis({
          minDegree: Math.max(1, pendingMinDegree || 1),
          maxDegree: Number.isFinite(pendingMaxDegree) ? pendingMaxDegree : null,
        });
      }
      setStep(target);
    },
    [
      step,
      pendingSelection,
      setNames,
      allColumnSets,
      commitSelection,
      setStep,
      pendingMinDegree,
      pendingMaxDegree,
      updVis,
    ]
  );

  const doParse = useCallback(
    (text: string, sep: string, fmt: string) => {
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const { headers, rows, injectionWarnings } = parseRaw(dc.text, sep);
      setInjectionWarning(injectionWarnings);
      if (!headers.length || !rows.length) {
        setParseError("The file appears to be empty or has no data rows.");
        return;
      }
      let parsed;
      try {
        parsed = fmt === "long" ? parseLongFormatSets(headers, rows) : parseSetData(headers, rows);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setParseError(msg || "Unable to parse set membership.");
        return;
      }
      const { setNames: sn, sets: ss } = parsed;
      if (sn.length < 2) {
        setParseError(
          fmt === "long"
            ? "Need at least 2 distinct set names in the second column."
            : "Need at least 2 non-empty set columns."
        );
        return;
      }
      setParseError(null);
      setParsedHeaders(headers);
      setParsedRows(rows);
      setAllColumnNames(sn);
      setAllColumnSets(ss);
      setPendingSelection(sn);
      commitSelection(sn, ss);
      setStep("configure");
    },
    [commitSelection, setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride, format);
    },
    [sepOverride, format, doParse, setFileName]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__UPSET_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFormat("wide");
    setFileName("arabidopsis_stress_5set.csv");
    doParse(text, ",", "wide");
  }, [doParse, setFileName, setSepOverride]);

  // Hand-off from the Venn tool's "Open in UpSet" nudge: replaces whatever
  // file the user had previously loaded so the UpSet view shows the same
  // dataset they were just looking at in Venn. Two delivery channels:
  //   1. postMessage from the sibling Venn iframe (when both tools live
  //      under index.html — the common case).
  //   2. sessionStorage one-shot (when Venn was opened standalone and the
  //      "Open in UpSet" link navigates the same window to upset.html).
  // Both are consumed by the same handler so behaviour is identical either
  // way; the sessionStorage entry is removed immediately so a future page
  // load with no fresh hand-off doesn't re-load stale data.
  const handleHandoff = useCallback(
    (payload: any) => {
      if (!payload || typeof payload.text !== "string") return;
      // Audit policy: any ingest surface must gate on FILE_LIMIT_BYTES (see
      // doc-comment in tools/shared-file-drop.js). Same-origin only after
      // the origin check on the message listener — but a 100 MB hostile
      // payload from a compromised sibling tool would freeze the main thread
      // on next load with no error UX, so reject before doParse sees the
      // bytes.
      if (payload.text.length > FILE_LIMIT_BYTES) return;
      const sep = typeof payload.sep === "string" ? payload.sep : "";
      const fmt = payload.format === "long" ? "long" : "wide";
      // Bound fileName length and strip path separators / leading dots so a
      // crafted payload can't produce a download name like "../../etc/passwd"
      // when the user later exports a CSV.
      const rawName = typeof payload.fileName === "string" ? payload.fileName : "";
      const safeName = rawName.slice(0, 255).replace(/[/\\]/g, "_").replace(/^\.+/, "");
      setFileName(safeName);
      setSepOverride(sep);
      setFormat(fmt);
      setSelectedMask(null);
      doParse(payload.text, sep, fmt);
    },
    [doParse, setFileName, setSepOverride]
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dataviz-upset-handoff");
      if (raw) {
        sessionStorage.removeItem("dataviz-upset-handoff");
        handleHandoff(JSON.parse(raw));
      }
    } catch {
      /* storage disabled — handoff just won't fire */
    }
    const onMessage = (e: MessageEvent) => {
      if (!e || e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.type !== "dataviz-handoff") return;
      handleHandoff(d);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleHandoff]);

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(new Map());
    setParseError(null);
    setInjectionWarning(null);
    setSelectedMask(null);
    updVis({ _reset: true });
  };

  const setSizes = useMemo(() => {
    const m = new Map();
    for (const n of displaySetNames) m.set(n, (sets.get(n) || new Set()).size);
    return m;
  }, [displaySetNames, sets]);

  const selectedIntersectionIdx = truncatedIntersections.findIndex((g) => g.mask === selectedMask);
  const selectedIntersection =
    selectedIntersectionIdx >= 0 ? truncatedIntersections[selectedIntersectionIdx] : null;
  const selectedColumnId = selectedIntersectionIdx >= 0 ? selectedIntersectionIdx + 1 : null;
  const showColumnWarning = truncatedIntersections.length > 60;

  return (
    <PlotToolShell
      state={{ ...shell, setStep: navigateStep }}
      toolName="upset"
      title="UpSet plot"
      visInit={VIS_INIT_UPSET}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          format={format}
          setFormat={setFormat}
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
          minDegree={pendingMinDegree}
          setMinDegree={setPendingMinDegree}
          maxDegree={pendingMaxDegree}
          setMaxDegree={setPendingMaxDegree}
        />
      )}

      {step === "plot" && displaySetNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              activeSetNames={displaySetNames}
              allSets={sets}
              vis={vis}
              updVis={updVis}
              chartRef={chartRef}
              resetAll={resetAll}
              fileName={fileName}
              intersections={truncatedIntersections}
              computeAllIntersectionStats={computeAllIntersectionStats}
              clearIntersectionStats={clearIntersectionStats}
              computingStats={computingStats}
              computeProgress={computeProgress}
              intersectionTestsCount={intersectionTests.size}
              universeSize={universeSize}
              setUniverseSize={setUniverseSize}
              universeOverridden={universeOverridden}
              setUniverseOverridden={setUniverseOverridden}
              defaultUniverseSize={defaultUniverseSize}
              maxAllIntersectionSize={maxAllIntersectionSize}
              allIntersectionsCount={allIntersections.length}
            />

            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {selectedMask != null && (
                <button
                  type="button"
                  onClick={() => setSelectedMask(null)}
                  className="dv-btn dv-btn-secondary"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 14,
                    zIndex: 2,
                    padding: "4px 10px",
                    fontSize: 11,
                  }}
                >
                  Clear selection
                </button>
              )}
              <ScrollablePlotCard>
                <UpsetChart
                  ref={chartRef}
                  setNames={displaySetNames}
                  setSizes={setSizes}
                  intersections={truncatedIntersections}
                  selectedMask={selectedMask}
                  onColumnClick={setSelectedMask}
                  plotTitle={vis.plotTitle}
                  plotSubtitle={vis.plotSubtitle}
                  plotBg={vis.plotBg}
                  fontSize={vis.fontSize}
                  barOpacity={vis.barOpacity}
                  dotSize={vis.dotSize}
                  showIntersectionLabels={vis.showIntersectionLabels}
                  showSetSizeLabels={vis.showSetSizeLabels}
                  significanceDisplay={vis.significanceDisplay}
                  significanceByMask={significanceByMask}
                  colorBarsBySignificance={vis.colorBarsBySignificance}
                />
              </ScrollablePlotCard>

              {showColumnWarning && (
                <div
                  style={{
                    margin: "8px 0 0",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    fontSize: 11,
                    color: "var(--warning-text)",
                  }}
                >
                  {truncatedIntersections.length} columns — dots may overlap. Raise Minimum
                  intersection size, raise Minimum degree, or lower Maximum degree to reduce.
                </div>
              )}

              {truncatedIntersections.length === 0 && (
                <div
                  style={{
                    margin: "8px 0 0",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--info-bg)",
                    border: "1px solid var(--info-border)",
                    fontSize: 11,
                    color: "var(--info-text)",
                  }}
                >
                  No intersections to show. Lower Minimum intersection size, lower Minimum degree,
                  or raise Maximum degree.
                </div>
              )}

              {selectedIntersection && (
                <IntersectionStatsPanel
                  intersection={selectedIntersection}
                  displaySetNames={displaySetNames}
                  sets={sets}
                  membershipMap={membershipMap}
                  universeSize={universeSize}
                  intersectionTests={intersectionTests}
                />
              )}

              <div className="dv-panel" style={{ marginTop: 16 }}>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Items
                </p>
                <ItemListPanel
                  intersection={selectedIntersection}
                  setNames={displaySetNames}
                  fileName={fileName}
                  columnId={selectedColumnId}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="UpSet plot">
    <App />
  </ErrorBoundary>
);

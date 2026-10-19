// Proportions & counts — App orchestrator.
//
// Folder layout (matches volcano / boxplot):
//   helpers.ts     — pure parsing, selection, analysis, chart geometry and
//                    prop interfaces (loaded by tests/helpers/proportions-loader.js)
//   chart.tsx      — ProportionsChart (forwardRef SVG renderer)
//   controls.tsx   — sidebar tiles (Chart / Colours / Style)
//   stats-panel.tsx— StatsPanel (summary, omnibus, residuals, pairwise) + GofPanel
//   steps.tsx      — ConfigureStep + PlotStep
//   reports.ts     — CSV, text report, R script builders
//   howto.tsx      — in-tool help content
//
// Statistics live in tools/_core/stats/categorical.ts (Wilson CIs, Fisher,
// χ², exact goodness-of-fit, Holm), each pinned to R.

import { HowTo, PlotToolShell, UploadPanel, consumeHandoff, usePlotToolState } from "../_shell";
import type { HandoffPayload } from "../_shell";
import { resolveDiscretePalette } from "../_shell";
import "./i18n";
import { tt, useT } from "./i18n";
import { useProportionsHowTo } from "./howto";
import {
  analyseTable,
  applySelection,
  bracketPairs,
  collapseToFocus,
  defaultOrder,
  groupSummaries,
  parseCountsTable,
  parseRatio,
  resolveColors,
} from "./helpers";
import type { CountsParseError, CountsTable, OrderItem, ProportionsVis } from "./helpers";
import { ConfigureStep, PlotStep } from "./steps";
import { buildProportionsCsv, buildProportionsRScript, buildProportionsReport } from "./reports";
import { autoDetectSep, fixDecimalCommas, parseRaw } from "../_core/csv";
import { downloadCsv, downloadText, fileBaseName } from "../_core/download";

const { useState, useMemo, useCallback, useRef, useEffect } = React;

// Where a table handed off from Group Plot's composition pies came from;
// shown as a banner so the user knows what each count is.
interface CompositionOrigin {
  classColumn: string;
  groupColumn: string;
  facet: string | null;
}

function readCompositionOrigin(payload: HandoffPayload): CompositionOrigin | null {
  const c = payload.composition;
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.classColumn !== "string" || typeof o.groupColumn !== "string") return null;
  return {
    classColumn: o.classColumn,
    groupColumn: o.groupColumn,
    facet: typeof o.facet === "string" ? o.facet : null,
  };
}

const VIS_INIT_PROPORTIONS: ProportionsVis = {
  chartType: "proportion",
  showCI: true,
  showN: true,
  annotation: "brackets",
  showNsBrackets: false,
  segmentLabels: "percent",
  discretePalette: "okabe-ito",
  barWidthFrac: 0.6,
  barOutline: true,
  barOutlineWidth: 1,
  xLabelAngle: 0,
  plotWidth: 480,
  plotHeight: 340,
  tickFontSize: 11,
  plotTitle: "",
  yLabel: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  testChoice: "auto",
  adjustMethod: "holm",
};

// ── Bundled example datasets ──
// Arbuscular-mycorrhizal colonisation scored per plant (Medicago
// truncatula): wild type, two symbiosis mutants and a complemented line.
// Fixed illustrative counts — the mutants differ clearly from WT, the
// complemented line does not.
const EXAMPLE_CSV = `Genotype,Colonised,Not colonised
A17 (WT),41,7
dmi3-1,3,43
ram1-1,9,41
dmi3-1 + DMI3,37,10
`;

// Dihybrid F2 phenotype counts for the goodness-of-fit demo (9:3:3:1).
// First row: Mendel's 1866 seed-shape × cotyledon-colour counts; the
// other two families are illustrative.
const EXAMPLE_F2_CSV = `Family,Round yellow,Round green,Wrinkled yellow,Wrinkled green
Mendel 1866,315,108,101,32
F2 family 2,141,44,52,13
F2 family 3,98,37,22,19
`;

function parseErrorMessage(e: CountsParseError): string {
  switch (e.kind) {
    case "tooFewColumns":
      return tt("proportions.err.tooFewColumns");
    case "tooFewRows":
      return tt("proportions.err.tooFewRows");
    case "notCount":
      return tt("proportions.err.notCount", {
        group: e.group,
        category: e.category,
        value: e.value,
      });
    case "duplicateGroup":
      return tt("proportions.err.duplicateGroup", { group: e.group });
    case "emptyLabel":
      return tt("proportions.err.emptyLabel", { row: e.row });
  }
}

export function App() {
  const tr = useT();
  const howto = useProportionsHowTo();
  const shell = usePlotToolState("proportions", VIS_INIT_PROPORTIONS);
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

  const [rawText, setRawText] = useState<string | null>(null);
  const [table, setTable] = useState<CountsTable | null>(null);
  const [blankCells, setBlankCells] = useState(0);
  const [detectedSep, setDetectedSep] = useState("");
  const [groupOrder, setGroupOrder] = useState<OrderItem[]>([]);
  const [catOrder, setCatOrder] = useState<OrderItem[]>([]);
  const [focus, setFocus] = useState(0);
  const [ratioText, setRatioText] = useState("");
  // Per-name colour overrides (dataset-specific, so local state rather than
  // persisted vis). Picking a palette clears them, as in the other tools.
  const [groupColorOv, setGroupColorOv] = useState<Record<string, string>>({});
  const [catColorOv, setCatColorOv] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState<CompositionOrigin | null>(null);

  // Returns the parsed table (null on a parse error) so the hand-off path
  // can decide whether to skip straight to the plot.
  const doParse = useCallback(
    (text: string, sep: string): CountsTable | null => {
      const resolved = autoDetectSep(text, sep);
      const effectiveSep = typeof resolved === "string" ? resolved : "";
      setDetectedSep(effectiveSep);
      const dc = fixDecimalCommas(text, effectiveSep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const raw = parseRaw(dc.text, effectiveSep);
      setInjectionWarning(raw.injectionWarnings);
      const res = parseCountsTable(raw);
      if (!res.table) {
        setParseError(res.error ? parseErrorMessage(res.error) : null);
        return null;
      }
      setParseError(null);
      setRawText(dc.text);
      setTable(res.table);
      setBlankCells(res.blankCells);
      setGroupOrder(defaultOrder(res.table.groups));
      setCatOrder(defaultOrder(res.table.categories));
      setFocus(0);
      setRatioText("");
      setGroupColorOv({});
      setCatColorOv({});
      setOrigin(null);
      setStep("configure");
      return res.table;
    },
    [setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [doParse, setFileName, sepOverride]
  );
  const handleTextPaste = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      setSepOverride("");
      doParse(text, "");
    },
    [doParse, setFileName, setSepOverride]
  );
  const loadExample = useCallback(() => {
    setSepOverride("");
    setFileName("colonisation_example.csv");
    doParse(EXAMPLE_CSV, "");
  }, [doParse, setFileName, setSepOverride]);
  const loadF2Example = useCallback(() => {
    setSepOverride("");
    setFileName("f2_segregation_example.csv");
    doParse(EXAMPLE_F2_CSV, "");
    updVis({ chartType: "stacked" });
    setRatioText("9:3:3:1");
  }, [doParse, setFileName, setSepOverride, updVis]);

  // Inter-tool hand-off from Group Plot's composition pies. Same three
  // paths as Group Plot's consumer: mount-time read, cross-tab `storage`
  // event, same-tab `plottr-handoff` event (SPA keep-alive routing). The
  // applier lives in a ref refreshed every render so the mount-only
  // listeners always call the current closure.
  const applyHandoffRef = useRef<(payload: HandoffPayload | null) => void>(() => {});
  applyHandoffRef.current = (payload) => {
    if (!payload || typeof payload.csv !== "string") return;
    setSepOverride("");
    setFileName(typeof payload.fileName === "string" ? payload.fileName : "from_handoff.csv");
    const parsed = doParse(payload.csv, "");
    if (!parsed) return;
    setOrigin(readCompositionOrigin(payload));
    // More than two classes: the stacked chart shows (and tests) the full
    // groups × classes table instead of one focus class vs. the rest.
    if (parsed.categories.length > 2) updVis({ chartType: "stacked" });
    if (parsed.groups.length >= 2 && parsed.categories.length >= 2) setStep("plot");
  };
  useEffect(() => {
    applyHandoffRef.current(consumeHandoff("proportions"));
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "dataviz-handoff" || !e.newValue) return;
      applyHandoffRef.current(consumeHandoff("proportions"));
    };
    const onSameTabHandoff = () => applyHandoffRef.current(consumeHandoff("proportions"));
    window.addEventListener("storage", onStorage);
    window.addEventListener("plottr-handoff", onSameTabHandoff);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("plottr-handoff", onSameTabHandoff);
    };
    // Mount-only: the body reads only a module import and a stable ref.
  }, []);

  const resetAll = useCallback(() => {
    setRawText(null);
    setTable(null);
    setGroupOrder([]);
    setCatOrder([]);
    setFocus(0);
    setRatioText("");
    setGroupColorOv({});
    setCatColorOv({});
    setOrigin(null);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  }, [setFileName, setInjectionWarning, setStep]);

  // ── Derived data ──
  const selection = useMemo(
    () => (table ? applySelection(table, groupOrder, catOrder) : null),
    [table, groupOrder, catOrder]
  );
  const selected = selection?.table ?? null;
  const focusIdx = selected ? Math.min(focus, Math.max(0, selected.categories.length - 1)) : 0;
  const isProp = vis.chartType === "proportion";
  const displayed = useMemo(() => {
    if (!selected || selected.categories.length < 2) return selected;
    return isProp ? collapseToFocus(selected, focusIdx, tt("proportions.rest")) : selected;
  }, [selected, isProp, focusIdx]);
  const analysis = useMemo(
    () => (displayed ? analyseTable(displayed, vis.testChoice, vis.adjustMethod) : null),
    [displayed, vis.testChoice, vis.adjustMethod]
  );
  const summaries = useMemo(() => (displayed ? groupSummaries(displayed) : []), [displayed]);
  const brackets = useMemo(
    () => (analysis ? bracketPairs(analysis, vis.showNsBrackets) : []),
    [analysis, vis.showNsBrackets]
  );
  const colors = useMemo(() => {
    const names = displayed?.categories ?? [];
    return resolveColors(
      names,
      resolveDiscretePalette(vis.discretePalette, Math.max(1, names.length)),
      catColorOv
    );
  }, [vis.discretePalette, displayed, catColorOv]);
  const groupColors = useMemo(() => {
    const names = displayed?.groups ?? [];
    return resolveColors(
      names,
      resolveDiscretePalette(vis.discretePalette, Math.max(1, names.length)),
      groupColorOv
    );
  }, [vis.discretePalette, displayed, groupColorOv]);
  const onGroupColor = useCallback(
    (name: string, color: string) => setGroupColorOv((prev) => ({ ...prev, [name]: color })),
    []
  );
  const onCategoryColor = useCallback(
    (name: string, color: string) => setCatColorOv((prev) => ({ ...prev, [name]: color })),
    []
  );
  const onPaletteChange = useCallback(() => {
    setGroupColorOv({});
    setCatColorOv({});
  }, []);
  const focusLabel =
    isProp && selected && selected.categories.length > 2
      ? (selected.categories[focusIdx] ?? null)
      : null;

  // ── Downloads ──
  const chartRef = useRef<SVGSVGElement>(null);
  const stem = fileBaseName(fileName, "proportions");
  const ratio = analysis ? parseRatio(ratioText, analysis.table.categories.length) : null;
  const onDownloadCsv = () => {
    if (!displayed) return;
    const { headers, rows } = buildProportionsCsv(summaries, displayed.categories);
    downloadCsv(headers, rows, `${stem}_proportions.csv`);
  };
  const onDownloadReport = () => {
    if (!analysis || !displayed) return;
    downloadText(
      buildProportionsReport({
        fileName,
        chartType: vis.chartType,
        focusLabel,
        analysis,
        summaries,
        displayedCategories: displayed.categories,
        adjust: vis.adjustMethod,
        ratio,
      }),
      `${stem}_stats.txt`
    );
  };
  const onDownloadR = () => {
    if (!analysis || !displayed) return;
    downloadText(
      buildProportionsRScript({
        analysis,
        displayed,
        chartType: vis.chartType,
        adjust: vis.adjustMethod,
        ratio,
        colors,
        groupColors,
        outlineWidth: vis.barOutline ? vis.barOutlineWidth : 0,
        xLabelAngle: vis.xLabelAngle,
        plotTitle: vis.plotTitle,
      }),
      `${stem}.R`
    );
  };

  const ready = !!selected && selected.groups.length >= 2 && selected.categories.length >= 2;
  const canNavigate = (target: string) => {
    if (target === "upload") return true;
    if (target === "configure") return !!table;
    if (target === "plot") return ready;
    return false;
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="proportions"
      title="Proportions & Counts"
      visInit={VIS_INIT_PROPORTIONS}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <div>
          <UploadPanel
            sepOverride={sepOverride}
            onSepChange={(v) => {
              setSepOverride(v);
              if (rawText) doParse(rawText, v);
            }}
            onFileLoad={handleFileLoad}
            onTextPaste={handleTextPaste}
            autoDetect
            onLoadExample={loadExample}
            exampleSummary={{
              title: tr("proportions.example.title"),
              subtitle: tr("proportions.example.subtitle"),
            }}
            hint={tr("proportions.upload.hint")}
          />
          <div style={{ margin: "-4px 0 14px", textAlign: "center" }}>
            <button
              type="button"
              className="dv-btn dv-btn-secondary"
              onClick={loadF2Example}
              data-testid="load-example-f2"
              style={{ fontSize: 12 }}
            >
              {tr("proportions.example.f2")}
            </button>
          </div>
          <HowTo {...howto} />
        </div>
      )}

      {origin && step !== "upload" && (
        <div
          data-testid="composition-origin"
          style={{
            background: "var(--info-bg)",
            color: "var(--info-text)",
            border: "1px solid var(--info-border)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {tr("proportions.fromGroupPlot", {
            classes: origin.classColumn,
            groups: origin.groupColumn,
          })}
          {origin.facet !== null &&
            " " + tr("proportions.fromGroupPlotFacet", { facet: origin.facet })}
        </div>
      )}

      {step === "configure" && table && selection && (
        <ConfigureStep
          table={table}
          fileName={fileName}
          detectedSep={detectedSep}
          blankCells={blankCells}
          groupOrder={groupOrder}
          setGroupOrder={setGroupOrder}
          catOrder={catOrder}
          setCatOrder={setCatOrder}
          droppedGroups={selection.droppedGroups}
        />
      )}

      {step === "plot" && ready && selected && displayed && analysis && (
        <PlotStep
          chartRef={chartRef}
          selected={selected}
          displayed={displayed}
          analysis={analysis}
          summaries={summaries}
          brackets={brackets}
          colors={colors}
          groupColors={groupColors}
          onGroupColor={onGroupColor}
          onCategoryColor={onCategoryColor}
          onPaletteChange={onPaletteChange}
          focus={focusIdx}
          setFocus={setFocus}
          focusLabel={focusLabel}
          vis={vis}
          updVis={updVis}
          ratioText={ratioText}
          setRatioText={setRatioText}
          fileName={fileName}
          onDownloadCsv={onDownloadCsv}
          onDownloadReport={onDownloadReport}
          onDownloadR={onDownloadR}
          onReset={resetAll}
        />
      )}
    </PlotToolShell>
  );
}

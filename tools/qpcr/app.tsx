// qPCR relative quantification — App orchestrator.
//
// Folder layout (matches proportions / volcano):
//   helpers.ts      — parsing, technical replicates, ΔCt / −ΔΔCt, efficiency,
//                     standard curve, geNorm M, stats on ΔCt, annotations,
//                     prop interfaces (loaded by tests/helpers/qpcr-loader.js)
//   chart.tsx       — QpcrChart (one facet per target gene)
//   controls.tsx    — sidebar tiles (Chart / Colours / Style)
//   stats-panel.tsx — QpcrStatsPanel (tests on ΔCt via the Group Plot engine)
//   steps.tsx       — ConfigureStep + PlotStep (+ StdCurvePanel)
//   reports.ts      — TXT report + R script
//   howto.tsx       — in-tool help

import {
  HowTo,
  PlotToolShell,
  UploadPanel,
  resolveDiscretePalette,
  usePlotToolState,
} from "../_shell";
import "./i18n";
import { useT } from "./i18n";
import { useQpcrHowTo } from "./howto";
import {
  aggregateTechReps,
  computeGene,
  detectLayout,
  geneAnnotation,
  genormM,
  guessControl,
  guessRefs,
  noisyTechReps,
  parseEfficiency,
  parseLong,
  parseStandardCurve,
  parseWide,
  runGeneStats,
  sampleRowsForCsv,
  standardCurves,
} from "./helpers";
import type {
  GeneRow,
  LongColumns,
  Normalization,
  OrderItem,
  QpcrConfig,
  QpcrLayout,
  QpcrParseResult,
  QpcrVis,
  StdCurve,
  WideColumns,
} from "./helpers";
import { ConfigureStep, PlotStep } from "./steps";
import { buildQpcrRScript, buildQpcrReport } from "./reports";
import { autoDetectSep, fixDecimalCommas, parseRaw } from "../_core/csv";
import { downloadCsv, downloadText, fileBaseName } from "../_core/download";
import { seededRandom } from "../_core/numeric";

const { useState, useMemo, useCallback, useEffect, useRef } = React;

const VIS_INIT_QPCR: QpcrVis = {
  yScale: "log2",
  chartStyle: "bar",
  showPoints: true,
  errorBar: "ci95",
  showCalibrator: true,
  horizontal: false,
  pointSize: 2.6,
  jitterWidth: 0.45,
  fillOpacity: 1,
  yMin: "",
  yMax: "",
  yLabel: "",
  annotation: "brackets",
  showNs: false,
  discretePalette: "okabe-ito",
  barOutline: true,
  barOutlineWidth: 1,
  barWidthFrac: 0.6,
  facetWidth: 260,
  facetHeight: 260,
  facetCols: 3,
  xLabelAngle: 0,
  tickFontSize: 12,
  plotTitle: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
};

// ── Bundled example dataset ──
// Simulated Arabidopsis drought / salt experiment: two reference genes
// (ACT2, UBQ10), two targets (RD29A strongly drought-induced, WRKY33
// mildly salt-induced), 3 groups × 4 biological × 3 technical replicates.
// A per-sample RNA-input offset shifts every gene of a sample together (the
// variation the references normalise away). One well is "Undetermined" and
// one technical triplet is noisy, so the QC panel has something to show.
// Seeded, so the sample is identical on every load.
const EXAMPLE_CSV = (() => {
  const rand = seededRandom(7);
  const norm = (): number => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const base: Record<string, Record<string, number>> = {
    ACT2: { Control: 18.6, Drought: 18.6, Salt: 18.6 },
    UBQ10: { Control: 20.1, Drought: 20.1, Salt: 20.1 },
    RD29A: { Control: 27.0, Drought: 22.2, Salt: 24.6 },
    WRKY33: { Control: 24.2, Drought: 23.8, Salt: 23.0 },
  };
  const lines = ["Sample,Group,Gene,Ct"];
  for (const group of ["Control", "Drought", "Salt"]) {
    for (let s = 1; s <= 4; s++) {
      const input = 0.35 * norm();
      for (const gene of Object.keys(base)) {
        const bio = (gene === "ACT2" || gene === "UBQ10" ? 0.12 : 0.3) * norm();
        for (let t = 1; t <= 3; t++) {
          let ct = base[gene][group] + input + bio + 0.08 * norm();
          if (gene === "WRKY33" && group === "Salt" && s === 2 && t === 3) ct += 1.3;
          const cell =
            gene === "RD29A" && group === "Control" && s === 3 && t === 2
              ? "Undetermined"
              : ct.toFixed(2);
          lines.push(`${s},${group},${gene},${cell}`);
        }
      }
    }
  }
  return lines.join("\n") + "\n";
})();

export function App() {
  const tr = useT();
  const howto = useQpcrHowTo();
  const shell = usePlotToolState("qpcr", VIS_INIT_QPCR);
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
  const [raw, setRaw] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [detectedSep, setDetectedSep] = useState("");
  const [layout, setLayout] = useState<QpcrLayout>("long");
  const [longCols, setLongCols] = useState<LongColumns>({
    sample: -1,
    group: -1,
    gene: -1,
    ct: -1,
  });
  const [wideCols, setWideCols] = useState<WideColumns>({ sample: -1, group: -1, genes: [] });
  const [roles, setRoles] = useState<Record<string, GeneRow["role"]>>({});
  const [effText, setEffText] = useState<Record<string, string>>({});
  const [groupOrder, setGroupOrder] = useState<OrderItem[]>([]);
  const [control, setControl] = useState("");
  const [normalize, setNormalize] = useState<Normalization>("control");
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [colorOv, setColorOv] = useState<Record<string, string>>({});
  const [stdText, setStdText] = useState("");

  const doParse = useCallback(
    (text: string, sep: string) => {
      const resolved = autoDetectSep(text, sep);
      const effectiveSep = typeof resolved === "string" ? resolved : "";
      setDetectedSep(effectiveSep);
      const dc = fixDecimalCommas(text, effectiveSep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const r = parseRaw(dc.text, effectiveSep);
      setInjectionWarning(r.injectionWarnings);
      if (r.headers.length < 3 || r.rows.length === 0) {
        setParseError(tr("qpcr.err.tooFew"));
        return;
      }
      setParseError(null);
      const guess = detectLayout(r.headers, r.rows);
      setRawText(dc.text);
      setRaw({ headers: r.headers, rows: r.rows });
      setLayout(guess.layout);
      setLongCols(guess.long);
      setWideCols(guess.wide);
      setRoles({});
      setEffText({});
      setOverrides({});
      setColorOv({});
      setGroupOrder([]);
      setControl("");
      setStep("configure");
    },
    [setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep, tr]
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
    setFileName("qpcr_example.csv");
    doParse(EXAMPLE_CSV, "");
  }, [doParse, setFileName, setSepOverride]);

  const resetAll = useCallback(() => {
    setRawText(null);
    setRaw(null);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  }, [setFileName, setInjectionWarning, setStep]);

  // ── Parsed wells ──
  const parsed: QpcrParseResult | null = useMemo(() => {
    if (!raw) return null;
    return layout === "long"
      ? parseLong(raw.rows, longCols)
      : parseWide(raw.headers, raw.rows, wideCols);
  }, [raw, layout, longCols, wideCols]);
  const data = parsed?.data ?? null;

  // Reset group order / control when the set of groups changes.
  const groupsKey = data ? data.groups.join("\u0000") : "";
  useEffect(() => {
    if (!data) return;
    setGroupOrder(data.groups.map((name) => ({ name, include: true })));
    setControl(guessControl(data.groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsKey]);

  const defaultRefs = useMemo(() => (data ? guessRefs(data.genes) : []), [data]);
  const geneRows: GeneRow[] = useMemo(() => {
    if (!data) return [];
    return data.genes.map((name) => {
      const ws = data.wells.filter((w) => w.gene === name);
      return {
        name,
        role: roles[name] ?? (defaultRefs.includes(name) ? "ref" : "target"),
        effText: effText[name] ?? "100 %",
        nWells: ws.length,
        nMissing: ws.filter((w) => w.ct === null).length,
      };
    });
  }, [data, roles, effText, defaultRefs]);

  const cfg: QpcrConfig = useMemo(() => {
    const eff: Record<string, number> = {};
    for (const g of geneRows) eff[g.name] = parseEfficiency(g.effText) ?? NaN;
    return {
      refs: geneRows.filter((g) => g.role === "ref").map((g) => g.name),
      targets: geneRows.filter((g) => g.role === "target").map((g) => g.name),
      eff,
      normalize,
      // No calibrator in "refs" mode: "" matches no group, so nothing is
      // highlighted as the control downstream.
      control: normalize === "control" ? control : "",
      groupOrder: groupOrder.filter((g) => g.include).map((g) => g.name),
    };
  }, [geneRows, normalize, control, groupOrder]);

  const effValid = [...cfg.refs, ...cfg.targets].every((g) => Number.isFinite(cfg.eff[g]));
  const ready =
    !!data &&
    cfg.refs.length > 0 &&
    cfg.targets.length > 0 &&
    (normalize === "refs"
      ? cfg.groupOrder.length >= 1
      : cfg.groupOrder.length >= 2 && cfg.groupOrder.includes(control)) &&
    effValid;

  const samples = useMemo(() => (data ? aggregateTechReps(data.wells) : []), [data]);
  const noisy = useMemo(() => noisyTechReps(samples), [samples]);
  const genorm = useMemo(
    () => (effValid ? genormM(samples, cfg.refs, cfg.eff) : {}),
    [samples, cfg.refs, cfg.eff, effValid]
  );
  const genes = useMemo(
    () => (ready ? cfg.targets.map((t) => computeGene(samples, cfg, t)) : []),
    [ready, samples, cfg]
  );
  const stats = useMemo(
    () => genes.map((g) => runGeneStats(g, overrides[g.gene] ?? null)),
    [genes, overrides]
  );
  // Calibrator column hidden on the chart (stats unchanged).
  const hiddenGroup = normalize === "control" && !vis.showCalibrator ? control : null;
  const annotations = useMemo(
    () => genes.map((g, i) => geneAnnotation(g, stats[i], vis.annotation, vis.showNs, hiddenGroup)),
    [genes, stats, vis.annotation, vis.showNs, hiddenGroup]
  );
  const dropped = genes.reduce((a, g) => a + g.dropped.length, 0);

  const colors = useMemo(() => {
    const pal = resolveDiscretePalette(vis.discretePalette, Math.max(1, cfg.groupOrder.length));
    return cfg.groupOrder.map((g, i) => colorOv[g] ?? pal[i % pal.length]);
  }, [vis.discretePalette, cfg.groupOrder, colorOv]);

  const stdCurves: StdCurve[] = useMemo(() => {
    if (!stdText.trim()) return [];
    const r = parseRaw(stdText, "");
    return standardCurves(parseStandardCurve(r.headers, r.rows));
  }, [stdText]);
  const onApplyStd = useCallback(
    (curves: StdCurve[]) =>
      setEffText((prev) => {
        const next = { ...prev };
        for (const c of curves) next[c.gene] = `${c.percent.toFixed(1)} %`;
        return next;
      }),
    []
  );

  // ── Downloads & hand-off ──
  const chartRef = useRef<SVGSVGElement>(null);
  const stem = fileBaseName(fileName, "qpcr");
  const onDownloadCsv = () => {
    const { headers, rows } = sampleRowsForCsv(genes, normalize);
    downloadCsv(headers, rows, `${stem}_relative_expression.csv`);
  };
  const onDownloadReport = () => {
    downloadText(
      buildQpcrReport({
        fileName,
        cfg,
        genes,
        stats,
        missingCt: data?.missingCt ?? 0,
        noisy,
        genorm,
      }),
      `${stem}_stats.txt`
    );
  };
  const onDownloadR = () => {
    if (!data) return;
    downloadText(buildQpcrRScript({ wells: data.wells, cfg, genes, stats }), `${stem}.R`);
  };

  const canNavigate = (target: string) => {
    if (target === "upload") return true;
    if (target === "configure") return !!raw;
    if (target === "plot") return ready;
    return false;
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="qpcr"
      title="qPCR Relative Expression"
      visInit={VIS_INIT_QPCR}
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
              title: tr("qpcr.example.title"),
              subtitle: tr("qpcr.example.subtitle"),
            }}
            hint={tr("qpcr.upload.hint")}
          />
          <HowTo {...howto} />
        </div>
      )}

      {step === "configure" && raw && (
        <ConfigureStep
          fileName={fileName}
          detectedSep={detectedSep}
          headers={raw.headers}
          layout={layout}
          setLayout={setLayout}
          longCols={longCols}
          setLongCols={setLongCols}
          wideCols={wideCols}
          setWideCols={setWideCols}
          data={data}
          parseError={parsed?.error ?? null}
          geneRows={geneRows}
          setGeneRole={(gene, role) => setRoles((prev) => ({ ...prev, [gene]: role }))}
          setGeneEff={(gene, text) => setEffText((prev) => ({ ...prev, [gene]: text }))}
          groupOrder={groupOrder}
          setGroupOrder={setGroupOrder}
          normalize={normalize}
          setNormalize={setNormalize}
          control={control}
          setControl={(g) => {
            setControl(g);
            setGroupOrder((prev) => prev.map((x) => (x.name === g ? { ...x, include: true } : x)));
          }}
          noisy={noisy}
          genorm={genorm}
          stdText={stdText}
          setStdText={setStdText}
          stdCurves={stdCurves}
          onApplyStd={onApplyStd}
        />
      )}

      {step === "plot" && ready && (
        <PlotStep
          chartRef={chartRef}
          genes={genes}
          stats={stats}
          annotations={annotations}
          colors={colors}
          groupOrder={cfg.groupOrder}
          normalize={normalize}
          control={cfg.control}
          vis={vis}
          updVis={updVis}
          overrides={overrides}
          onOverride={(gene, test) => setOverrides((prev) => ({ ...prev, [gene]: test }))}
          onGroupColor={(name, color) => setColorOv((prev) => ({ ...prev, [name]: color }))}
          onPaletteChange={() => setColorOv({})}
          fileName={fileName}
          onDownloadCsv={onDownloadCsv}
          onDownloadReport={onDownloadReport}
          onDownloadR={onDownloadR}
          onReset={resetAll}
          dropped={dropped}
        />
      )}
    </PlotToolShell>
  );
}

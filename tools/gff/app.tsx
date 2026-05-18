// gff/app.tsx — App orchestrator for the Genome Track (GFF3) tool. Holds the
// parsed GFF3 document, the active contig + view window, the per-type filter,
// and the selected feature; routes between the upload / configure / plot
// steps. Parser + layout math live in helpers.ts; chart / controls / step
// panels live in sibling modules.

import { PlotToolShell, usePlotToolState } from "../_shell";
import {
  assignTypeColors,
  buildGeneModels,
  packModels,
  parseGff3,
  summarizeSeqids,
} from "./helpers";
import type { GeneModel, GffParseResult } from "./helpers";
import { GffChart } from "./chart";
import { PlotControls } from "./controls";
import { ConfigureStep, FeatureDetailPanel, UploadStep } from "./steps";

const { useState, useMemo, useCallback, useRef } = React;

const VIS_INIT_GFF = {
  plotTitle: "",
  plotSubtitle: "",
  plotBg: "#ffffff",
  fontSize: 12,
  // Box height for a CDS part; non-CDS parts draw at 62% of this.
  featureHeight: 12,
  // "type" colours each part by feature type; "strand" colours by ±.
  colorMode: "type",
  showLabels: true,
  showChevrons: true,
};

// ── Bundled example dataset ──
// A small synthetic GFF3 contig — three genes (two forward, one reverse),
// each with an mRNA plus exon and multi-segment CDS children. Coordinates are
// illustrative, not from any real assembly. Stored as EXAMPLE_TSV because
// GFF3 is a tab-separated format (see tools/CLAUDE.md "Sample-data convention").
const EXAMPLE_TSV = `##gff-version 3
##sequence-region ctg1 1 12000
ctg1\tplottr\tgene\t1000\t3500\t.\t+\t.\tID=gene1;Name=GeneA
ctg1\tplottr\tmRNA\t1000\t3500\t.\t+\t.\tID=mrna1;Parent=gene1;Name=GeneA.1
ctg1\tplottr\texon\t1000\t1320\t.\t+\t.\tID=exon1;Parent=mrna1
ctg1\tplottr\texon\t1900\t2250\t.\t+\t.\tID=exon2;Parent=mrna1
ctg1\tplottr\texon\t3050\t3500\t.\t+\t.\tID=exon3;Parent=mrna1
ctg1\tplottr\tCDS\t1150\t1320\t.\t+\t0\tID=cds1;Parent=mrna1
ctg1\tplottr\tCDS\t1900\t2250\t.\t+\t1\tID=cds1;Parent=mrna1
ctg1\tplottr\tCDS\t3050\t3280\t.\t+\t2\tID=cds1;Parent=mrna1
ctg1\tplottr\tgene\t4600\t7200\t.\t-\t.\tID=gene2;Name=GeneB
ctg1\tplottr\tmRNA\t4600\t7200\t.\t-\t.\tID=mrna2;Parent=gene2;Name=GeneB.1
ctg1\tplottr\texon\t4600\t5100\t.\t-\t.\tID=exon4;Parent=mrna2
ctg1\tplottr\texon\t6000\t6400\t.\t-\t.\tID=exon5;Parent=mrna2
ctg1\tplottr\texon\t6900\t7200\t.\t-\t.\tID=exon6;Parent=mrna2
ctg1\tplottr\tCDS\t4750\t5100\t.\t-\t0\tID=cds2;Parent=mrna2
ctg1\tplottr\tCDS\t6000\t6400\t.\t-\t2\tID=cds2;Parent=mrna2
ctg1\tplottr\tCDS\t6900\t7050\t.\t-\t1\tID=cds2;Parent=mrna2
ctg1\tplottr\tgene\t8200\t9000\t.\t+\t.\tID=gene3;Name=GeneC;Note=single-exon gene
ctg1\tplottr\tmRNA\t8200\t9000\t.\t+\t.\tID=mrna3;Parent=gene3
ctg1\tplottr\texon\t8200\t9000\t.\t+\t.\tID=exon7;Parent=mrna3
ctg1\tplottr\tCDS\t8260\t8900\t.\t+\t0\tID=cds3;Parent=mrna3`;

export function App() {
  const shell = usePlotToolState("gff", VIS_INIT_GFF);
  const { step, setStep, fileName, setFileName, setParseError, vis, updVis } = shell;

  const [result, setResult] = useState<GffParseResult | null>(null);
  const [activeSeqid, setActiveSeqid] = useState("");
  const [viewStart, setViewStart] = useState(1);
  const [viewEnd, setViewEnd] = useState(1000);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const chartRef = useRef<SVGSVGElement | null>(null);

  const seqidSummary = useMemo(() => (result ? summarizeSeqids(result.features) : []), [result]);

  const doParse = useCallback(
    (text: string) => {
      const parsed = parseGff3(text);
      if (parsed.features.length === 0) {
        setParseError(
          parsed.skippedLines > 0
            ? `No valid GFF3 feature lines — all ${parsed.skippedLines} non-comment line(s) failed to parse. Check that columns are tab-separated.`
            : "No features found. A GFF3 file needs at least one 9-column feature line."
        );
        return;
      }
      setParseError(null);
      setResult(parsed);
      setHiddenTypes([]);
      setSelectedKey(null);
      // Default to the contig carrying the most features, viewed end to end.
      const summ = summarizeSeqids(parsed.features);
      const main = summ.reduce((a, b) => (b.featureCount > a.featureCount ? b : a), summ[0]);
      setActiveSeqid(main.seqid);
      setViewStart(main.start);
      setViewEnd(main.end);
      setStep("configure");
    },
    [setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text);
    },
    [doParse, setFileName]
  );

  const handleTextPaste = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text);
    },
    [doParse, setFileName]
  );

  const loadExample = useCallback(() => {
    setFileName("demo_annotation.gff3");
    doParse(EXAMPLE_TSV);
  }, [doParse, setFileName]);

  // All gene models on the active contig (pre-filter).
  const models = useMemo(
    () => (result ? buildGeneModels(result.features, activeSeqid) : []),
    [result, activeSeqid]
  );

  // Distinct feature types actually drawn (root types + part types), first-seen.
  const renderedTypes = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of models) {
      if (!seen.has(m.feature.type)) {
        seen.add(m.feature.type);
        out.push(m.feature.type);
      }
      for (const p of m.parts) {
        if (!seen.has(p.type)) {
          seen.add(p.type);
          out.push(p.type);
        }
      }
    }
    return out;
  }, [models]);

  const typeColors = useMemo(() => assignTypeColors(renderedTypes), [renderedTypes]);

  // Apply the per-type filter: drop models whose root type is hidden, and
  // strip hidden part types from the rest.
  const visibleModels = useMemo(() => {
    const hidden = new Set(hiddenTypes);
    if (hidden.size === 0) return models;
    return models
      .filter((m) => !hidden.has(m.feature.type))
      .map((m) => ({ ...m, parts: m.parts.filter((p) => !hidden.has(p.type)) }));
  }, [models, hiddenTypes]);

  // Clip to the view window, then pack into non-overlapping lanes.
  const { packed, laneCount } = useMemo(() => {
    const inView = visibleModels.filter((m) => m.start <= viewEnd && m.end >= viewStart);
    return packModels(inView, Math.max(1, (viewEnd - viewStart) * 0.015));
  }, [visibleModels, viewStart, viewEnd]);

  const featuresInView = useMemo(() => {
    if (!result) return [];
    return result.features.filter(
      (f) => f.seqid === activeSeqid && f.start <= viewEnd && f.end >= viewStart
    );
  }, [result, activeSeqid, viewStart, viewEnd]);

  const selectedModel: GeneModel | null =
    selectedKey != null ? (models.find((m) => m.key === selectedKey) ?? null) : null;

  const handleSeqidChange = useCallback(
    (s: string) => {
      setActiveSeqid(s);
      setSelectedKey(null);
      const m = seqidSummary.find((x) => x.seqid === s);
      if (m) {
        setViewStart(m.start);
        setViewEnd(m.end);
      }
    },
    [seqidSummary]
  );

  const fitToContig = useCallback(() => {
    const m = seqidSummary.find((x) => x.seqid === activeSeqid);
    if (m) {
      setViewStart(m.start);
      setViewEnd(m.end);
    }
  }, [seqidSummary, activeSeqid]);

  const toggleType = useCallback((t: string) => {
    setHiddenTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }, []);

  const canNavigate = useCallback(
    (target: string) => {
      if (target === "upload") return true;
      return result != null && result.features.length > 0;
    },
    [result]
  );

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setResult(null);
    setActiveSeqid("");
    setHiddenTypes([]);
    setSelectedKey(null);
    setParseError(null);
    updVis({ _reset: true });
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="gff"
      title="Genome track"
      visInit={VIS_INIT_GFF}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          handleFileLoad={handleFileLoad}
          handleTextPaste={handleTextPaste}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && result && (
        <ConfigureStep fileName={fileName} result={result} seqidSummary={seqidSummary} />
      )}

      {step === "plot" && result && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <PlotControls
            vis={vis}
            updVis={updVis}
            chartRef={chartRef}
            resetAll={resetAll}
            fileName={fileName}
            seqids={result.seqids}
            activeSeqid={activeSeqid}
            setActiveSeqid={handleSeqidChange}
            seqidSummary={seqidSummary}
            viewStart={viewStart}
            viewEnd={viewEnd}
            setViewStart={setViewStart}
            setViewEnd={setViewEnd}
            fitToContig={fitToContig}
            renderedTypes={renderedTypes}
            typeCounts={result.typeCounts}
            hiddenTypes={hiddenTypes}
            toggleType={toggleType}
            typeColors={typeColors}
            featuresInView={featuresInView}
          />

          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {selectedKey != null && (
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
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
            <div className="dv-panel dv-plot-card">
              <GffChart
                ref={chartRef}
                packed={packed}
                laneCount={laneCount}
                seqid={activeSeqid}
                viewStart={viewStart}
                viewEnd={viewEnd}
                typeColors={typeColors}
                colorMode={vis.colorMode}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                plotTitle={vis.plotTitle}
                plotSubtitle={vis.plotSubtitle}
                plotBg={vis.plotBg}
                fontSize={vis.fontSize}
                featureHeight={vis.featureHeight}
                showLabels={vis.showLabels}
                showChevrons={vis.showChevrons}
              />
            </div>

            {viewEnd <= viewStart && (
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
                View end must be greater than view start — use “Fit to contig” to reset the window.
              </div>
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
                Feature detail
              </p>
              <FeatureDetailPanel model={selectedModel} />
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

import type { HowToContent } from "../_shell/HowTo";

export const VOLCANO_HOWTO: HowToContent = {
  toolName: "volcano",
  title: "Volcano Plot — How to use",
  subtitle: "One row per feature · log₂FC on X · p-value (−log₁₀) on Y",
  purpose: (
    <>
      Highlight differentially expressed features by combining <strong>fold change</strong> with{" "}
      <strong>statistical significance</strong> — the canonical way to inspect RNA-seq, proteomics,
      or metabolomics tables.
    </>
  ),
  dataLayout: (
    <>
      One <strong>row</strong> per feature. Two numeric columns: a <strong>log₂ fold change</strong>{" "}
      and a <strong>p-value</strong> (raw or adjusted). An optional <strong>label</strong> column
      (gene symbol, feature ID) drives annotations. DESeq2, limma, edgeR, MaxQuant column names
      auto-detect.
    </>
  ),
  display: (
    <>
      Tweak <strong>|log₂FC|</strong> + <strong>p</strong> cutoffs in the Thresholds tile to set the
      up / down / ns split. Label features via auto top-N, click-to-label, or paste-list search in
      the Labels tile. Optional colour and size aesthetic mappings (e.g. expression level) render
      in-SVG legends.
    </>
  ),
};

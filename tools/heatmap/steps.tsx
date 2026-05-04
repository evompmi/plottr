// UploadStep for the Heatmap tool — presents the UploadPanel, a max-size
// hint, and the "How to use" info card. No local state; pure presentational
// wrapper fed by App. Relies on shared globals (UploadPanel, toolIcon)
// resolved through shared.bundle.js.

import type { UploadStepProps } from "./helpers";

export function UploadStep({
  sepOverride,
  setSepOverride,
  handleFileLoad,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Example gene-expression matrix (500 genes × 6 samples)"
        hint="CSV · TSV · TXT — first column = row labels, first row = column labels, rest numeric · 2 MB max"
      />
      <HowToCard
        toolName="heatmap"
        title="Heatmap — How to use"
        subtitle="Upload wide-format matrix → optional normalisation & clustering → plot"
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--info-text)",
              marginBottom: 6,
            }}
          >
            1 · Shape your file
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <li>First column: row labels (genes, samples, time-points, …)</li>
            <li>First row: column labels (treatments, replicates, conditions)</li>
            <li>
              Everything else: numeric values (blanks / non-numeric render as grey "NaN" cells)
            </li>
          </ul>
        </div>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--info-text)",
              marginBottom: 6,
            }}
          >
            2 · Normalise & cluster
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <li>
              Normalisation: <strong>None</strong>, <strong>Z-score by row</strong> (compare
              patterns across genes of different baseline), <strong>Z-score by column</strong>, or{" "}
              <strong>log₂</strong>
            </li>
            <li>
              Clustering: hierarchical (3 distance metrics — Euclidean / Manhattan / 1−r — × 3
              linkages — average / complete / single) or <strong>k-means</strong> with seed control;
              toggle row and column independently
            </li>
            <li>
              Show / hide the row & column <strong>dendrograms</strong> and the cluster strips that
              colour-code group membership
            </li>
            <li>Switch to a diverging palette (RdBu / bwr) when values are centred on 0</li>
          </ul>
        </div>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--info-text)",
              marginBottom: 6,
            }}
          >
            3 · Export
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <li>
              <strong>SVG / PNG</strong> of the rendered heatmap, <strong>CSV</strong> of the
              plotted matrix (post-normalisation, post-reorder), or a runnable{" "}
              <strong>R script</strong> that reproduces the plot
            </li>
            <li>
              Drag-to-zoom on the heatmap to select a sub-region and export just that cluster's rows
              / columns
            </li>
          </ul>
        </div>
      </HowToCard>
    </div>
  );
}

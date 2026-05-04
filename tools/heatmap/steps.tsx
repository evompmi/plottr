// UploadStep for the Heatmap tool — presents the UploadPanel, a max-size
// hint, and the "How to use" info card. No local state; pure presentational
// wrapper fed by App. Relies on shared globals (UploadPanel, toolIcon)
// resolved through shared.bundle.js.

import type { UploadStepProps } from "./helpers";
import { HowTo } from "../_shell/HowTo";
import { HEATMAP_HOWTO } from "./howto";

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
      <HowTo {...HEATMAP_HOWTO} />
    </div>
  );
}

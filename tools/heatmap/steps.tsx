// UploadStep for the Heatmap tool — presents the UploadPanel, a max-size
// hint, and the "How to use" info card. No local state; pure presentational
// wrapper fed by App. Relies on shared globals (UploadPanel, toolIcon)
// resolved through shared.bundle.js.

import type { UploadStepProps } from "./helpers";
import { HowTo, UploadPanel } from "../_shell";
import { HEATMAP_HOWTO } from "./howto";

export function UploadStep({
  sepOverride,
  setSepOverride,
  handleFileLoad,
  handleTextPaste,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onTextPaste={handleTextPaste}
        autoDetect
        onLoadExample={onLoadExample}
        exampleSummary={{
          icon: toolIcon("heatmap", 32, { circle: true }),
          title: "Gene-expression matrix",
          subtitle: "500 genes × 6 samples (3 Control · 3 Stress) · clustered demo",
          buttonLabel: "Plot this example →",
        }}
        hint="CSV · TSV · TXT — first column = row labels, first row = column labels, rest numeric · 2 MB max"
      />
      <HowTo {...HEATMAP_HOWTO} />
    </div>
  );
}

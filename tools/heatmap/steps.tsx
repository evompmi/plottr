// UploadStep for the Heatmap tool — presents the UploadPanel, a max-size
// hint, and the "How to use" info card. No local state; pure presentational
// wrapper fed by App. Relies on shared globals (UploadPanel, toolIcon)
// resolved through shared.bundle.js.

import type { UploadStepProps } from "./helpers";
import { HowTo, UploadPanel } from "../_shell";
import { useHeatmapHowTo } from "./howto";
import { useT } from "./i18n";

export function UploadStep({
  sepOverride,
  setSepOverride,
  handleFileLoad,
  handleTextPaste,
  onLoadExample,
}: UploadStepProps) {
  const tr = useT();
  const howto = useHeatmapHowTo();
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
          title: tr("heatmap.example.title"),
          subtitle: tr("heatmap.example.subtitle"),
        }}
        hint={tr("heatmap.upload.hint")}
      />
      <HowTo {...howto} />
    </div>
  );
}

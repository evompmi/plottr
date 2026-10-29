// scatter/steps.tsx — UploadStep.

import { HowTo, UploadPanel } from "../_shell";
import { useScatterHowTo } from "./howto";
import { useT } from "./i18n";

// ── UploadStep ─────────────────────────────────────────────────────────────

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  rawText: string | null;
  doParse: (text: string, sep: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  handleTextPaste: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  handleTextPaste,
  onLoadExample,
}: UploadStepProps) {
  const tr = useT();
  const howto = useScatterHowTo();
  return (
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
        onLoadExample={onLoadExample}
        exampleSummary={{
          title: tr("scatter.example.title"),
          subtitle: tr("scatter.example.subtitle"),
        }}
        hint={tr("scatter.upload.hint")}
      />
      <HowTo {...howto} />
    </div>
  );
}

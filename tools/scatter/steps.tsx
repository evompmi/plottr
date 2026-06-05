// scatter/steps.tsx — UploadStep, plus the AesBox themed wrapper. AesBox +
// the aesTheme palette are re-exported because the Plot step and its sidebar
// both want them. (The ControlSection disclosure tile now lives in ../_shell.)

import { HowTo, UploadPanel } from "../_shell";
import { useScatterHowTo } from "./howto";
import { useT, type ScatterKey } from "./i18n";

const AES_LABEL_KEYS: Record<"color" | "size" | "shape", ScatterKey> = {
  color: "scatter.aes.color",
  size: "scatter.aes.size",
  shape: "scatter.aes.shape",
};

export const aesTheme = {
  color: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "Color",
  },
  size: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Size",
  },
  shape: {
    bg: "var(--aes-shape-bg)",
    border: "var(--aes-shape-border)",
    header: "var(--aes-shape-header)",
    headerText: "var(--aes-shape-header-text)",
    label: "Shape",
  },
};

export function AesBox({
  theme,
  children,
}: {
  theme: "color" | "size" | "shape";
  children?: React.ReactNode;
}) {
  const tr = useT();
  const t = aesTheme[theme];
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
      <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
        <span
          style={{
            color: t.headerText,
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          {tr(AES_LABEL_KEYS[theme])}
        </span>
      </div>
      <div style={{ padding: "12px 14px", minHeight: 40 }}>{children}</div>
    </div>
  );
}

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

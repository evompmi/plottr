// scatter/steps.tsx — UploadStep, plus the AesBox themed wrapper and the
// small ControlSection disclosure helper. AesBox + the aesTheme palette
// are re-exported because the Plot step and its sidebar both want them.

import { HowTo } from "../_shell/HowTo";
import { SCATTER_HOWTO } from "./howto";

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

export function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        className="dv-tile-title"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
          aria-hidden="true"
        />
        {title}
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function AesBox({
  theme,
  children,
}: {
  theme: "color" | "size" | "shape";
  children?: React.ReactNode;
}) {
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
          {t.label}
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
  onLoadExample: () => void;
}

export function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          setSepOverride(v);
          if (rawText) doParse(rawText, v);
        }}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Fisher's Iris dataset (150 rows, 3 species)"
        hint="CSV · TSV · TXT — one column per variable, one row per point · 2 MB max"
      />
      <HowTo {...SCATTER_HOWTO} />
    </div>
  );
}

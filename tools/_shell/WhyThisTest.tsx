// Collapsed "Why this test?" disclosure for the stats panels: the result line
// leads, and the auto-picker's justification (selectTest's `reason`) sits one
// click away instead of as a dense paragraph above it.

import { useShellT } from "./i18n";

export function WhyThisTest({ text }: { text: string | null | undefined }) {
  const tr = useShellT();
  if (!text) return null;
  return (
    <details className="dv-why" style={{ marginTop: 6, fontSize: 11 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontWeight: 600 }}>
        {tr("shell.statsui.whyThisTest")}
      </summary>
      <div
        style={{
          marginTop: 4,
          color: "var(--text-muted)",
          fontStyle: "italic",
          lineHeight: 1.45,
        }}
      >
        {text}
      </div>
    </details>
  );
}

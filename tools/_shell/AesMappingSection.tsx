// Sidebar section for an aesthetic mapping (column → colour / size / shape),
// used by Scatter and Volcano. A `ControlSection` like every other control
// group, with a small glyph naming the aesthetic before the title and, once a
// column is mapped, a tag on the right saying what kind of column it is
// ("continuous", "3 categories").

import { ControlSection } from "./ControlSection";

export type AesKind = "color" | "size" | "shape";

export interface AesMappingSectionProps {
  kind: AesKind;
  title: string;
  /** Detected column type; omitted while nothing is mapped. */
  tag?: string | null;
  children?: React.ReactNode;
}

function AesGlyph({ kind }: { kind: AesKind }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {kind === "color" && (
        <g fill="currentColor">
          <circle cx="5" cy="5" r="3.5" opacity="0.9" />
          <circle cx="9.5" cy="6" r="3.5" opacity="0.55" />
          <circle cx="7" cy="10" r="3.5" opacity="0.3" />
        </g>
      )}
      {kind === "size" && (
        <g fill="currentColor">
          <circle cx="2" cy="10" r="1.5" />
          <circle cx="6" cy="9" r="2.5" />
          <circle cx="11" cy="7.5" r="3" />
        </g>
      )}
      {kind === "shape" && (
        <g fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="3.5" cy="4" r="2.5" />
          <rect x="8" y="1.5" width="5" height="5" />
          <path d="M7 8 L10 13 L4 13 Z" />
        </g>
      )}
    </svg>
  );
}

export function AesMappingSection({ kind, title, tag, children }: AesMappingSectionProps) {
  return (
    <ControlSection
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AesGlyph kind={kind} />
          {title}
        </span>
      }
      headerRight={tag ? <span className="dv-aes-tag">{tag}</span> : null}
    >
      {children}
    </ControlSection>
  );
}

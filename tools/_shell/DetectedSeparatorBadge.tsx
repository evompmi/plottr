// `DetectedSeparatorBadge` — small inline reminder of which delimiter the
// auto-detector picked on the most recent parse, surfaced on each tool's
// post-upload step (configure / preview / plot) so users can sanity-check
// the pick before reading too much into the chart. Renders nothing when
// `sep` is empty (no parse yet) or the empty-string whitespace fallback.
//
// Designed to slot into an existing muted text line as a trailing fragment,
// e.g. `<file.csv> — 4 cols × 72 rows {<Badge sep={detectedSep} />}` —
// styled neutrally on `var(--text-faint)` so it doesn't compete with the
// file name or counts.

export function describeSeparator(sep: string): string {
  if (sep === ",") return "comma";
  if (sep === ";") return "semicolon";
  if (sep === "\t") return "tab";
  if (sep === " ") return "space";
  return "whitespace";
}

interface DetectedSeparatorBadgeProps {
  sep: string;
}

export function DetectedSeparatorBadge({ sep }: DetectedSeparatorBadgeProps) {
  if (!sep) return null;
  return (
    <span style={{ marginLeft: 8, color: "var(--text-faint)", fontWeight: 400 }}>
      · detected: <strong>{describeSeparator(sep)}</strong>-separated
    </span>
  );
}

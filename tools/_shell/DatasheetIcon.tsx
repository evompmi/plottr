// `DatasheetIcon` — single shared hand-drawn notepad icon for the
// sample-dataset banner on every plot tool's upload step. Replaced
// the per-tool `TOOL_ICONS` art that briefly lived in that slot —
// repeating the tool icon there made the upload page top-heavy with
// the same glyph (topbar + sample banner + how-to chevron) and over-
// claimed visual centre; a plain datasheet sketch signals "load the
// example data" without competing with the topbar's branding role.
//
// Drawing notes:
//   - Dog-eared page outline (top-right corner folded under) so it
//     reads as a paper / notebook rather than a generic rectangle.
//   - Four horizontal "rows" inside, the last one short on purpose to
//     suggest a trailing partial row in a real spreadsheet.
//   - Subtle hand-drawn wobble on the rows via quadratic curves (~0.5
//     px control-point offset). Outline is straight — over-sketched
//     edges read as cartoony at small sizes, the wobble belongs in the
//     interior strokes only.
//   - `stroke="currentColor"` so the icon inherits the surrounding
//     text colour (e.g. `var(--success-text)` inside the sample
//     banner) and themes automatically in dark mode.

interface DatasheetIconProps {
  size?: number;
}

export function DatasheetIcon({ size = 36 }: DatasheetIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Page outline with dog-eared corner */}
      <path d="M10 6 L29 6 L37 14 L37 38 L10 38 Z" />
      {/* The fold itself — short L joining the page edge to the dog-ear */}
      <path d="M29 6 L29 14 L37 14" />
      {/* Four rows with subtle hand-drawn wobble. Last row deliberately
          short so the spreadsheet "feels" alive rather than printed. */}
      <path d="M14 20 Q22.5 19.3 33 20" />
      <path d="M14 25 Q22.5 24.6 33 25" />
      <path d="M14 30 Q22.5 29.5 33 30" />
      <path d="M14 34 Q19 33.6 26 34" />
    </svg>
  );
}

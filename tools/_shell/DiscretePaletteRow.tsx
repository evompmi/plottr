// Dropdown of palette keys with an inline preview strip — used in every
// plot tool's controls sidebar to pick a discrete palette for groups /
// categories / sets. Stateless: parent owns `value`, listens to onChange,
// optionally seeds per-group colours via `applyColors(hexArray)` (a 3-line
// lambda that maps `hexArray[i]` into whatever shape the tool stores).
//
// Splitting the dropdown into Select + SwatchStrip keeps the visual preview
// updating live with the picked palette without forcing the parent to
// re-render.

import {
  DISCRETE_PALETTES,
  COLORBLIND_SAFE_PALETTES,
  resolveDiscretePalette,
} from "./discrete-palette";

interface DiscreteSwatchStripProps {
  palette: string;
  n?: number;
  height?: number;
  width?: number | string;
}

// n side-by-side coloured rects — discrete analogue of PaletteStrip. Default
// preview length = 8 (covers most real-world group counts).
export function DiscreteSwatchStrip({
  palette,
  n = 8,
  height = 12,
  width = "100%",
}: DiscreteSwatchStripProps) {
  const colours = resolveDiscretePalette(palette, n);
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    // colours[i] is always defined: resolveDiscretePalette returns exactly n
    // entries when n > 0, and `n = props.n || 8` is always > 0.
    cells.push(<div key={i} style={{ flex: 1, background: colours[i] }} />);
  }
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid var(--border-strong)",
      }}
    >
      {cells}
    </div>
  );
}

interface DiscretePaletteSelectProps {
  value: string;
  onChange: (next: string) => void;
  n?: number;
}

// Dropdown of palette keys with an inline preview strip below.
// Uses className="dv-select" so the dropdown chrome inherits the same
// theme-aware styling (background, border, text colour) as every other
// select in the codebase — without it, the browser's default select chrome
// shows up white-on-white in dark mode.
export function DiscretePaletteSelect({ value, onChange, n = 8 }: DiscretePaletteSelectProps) {
  const keys = Object.keys(DISCRETE_PALETTES);
  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="dv-select"
        style={{ width: "100%", fontSize: 11, margin: "2px 0 6px" }}
        title="Pick a discrete palette. Picking a palette overwrites every group's colour. 👁 marks colour-blind-safe palettes."
      >
        {keys.map((k) => (
          <option key={k} value={k}>
            {k + (COLORBLIND_SAFE_PALETTES.has(k) ? "  👁" : "")}
          </option>
        ))}
      </select>
      <DiscreteSwatchStrip palette={value} n={n} />
    </div>
  );
}

interface DiscretePaletteRowProps {
  value: string;
  onChange: (next: string) => void;
  // Optional list of group/category names. Used to size the preview strip
  // (clamped 4..12) and to seed `applyColors` with a correctly-sized hex
  // array when the user picks a palette.
  names?: string[];
  // High-level adapter: when the user picks a palette, the resolved hex
  // array is pushed back to the parent so it can clobber every group's
  // colour with the new palette. Optional — omit if the parent only wants
  // to track the picked name.
  applyColors?: (hexes: string[]) => void;
}

// High-level adapter: dropdown + preview + clobber-on-pick wiring. The tool
// supplies `applyColors(hexArray)` — a 3-line lambda that maps `hexArray[i]`
// into whatever shape the tool stores (record, array, nested). That keeps
// the per-tool integration tiny while leaving storage shapes untouched.
export function DiscretePaletteRow({
  value,
  onChange,
  names,
  applyColors,
}: DiscretePaletteRowProps) {
  const list = Array.isArray(names) ? names : [];
  const handle = (next: string) => {
    onChange(next);
    if (typeof applyColors === "function") {
      const resolved = resolveDiscretePalette(next, list.length || 8);
      applyColors(resolved);
    }
  };
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="dv-label" style={{ fontSize: 11, marginBottom: 2 }}>
        Palette
      </div>
      <DiscretePaletteSelect
        value={value}
        onChange={handle}
        n={Math.max(4, Math.min(12, list.length || 8))}
      />
    </div>
  );
}

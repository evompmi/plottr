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
import { useShellT } from "./i18n";

const { useState } = React;

// Sensible swatch count for the runtime-generated palettes ("ggplot2-hue",
// "viridis-d") whose `DISCRETE_PALETTES` entry is a single "*" sentinel.
// 10 stops is enough to read as a continuous-ish gradient and still leaves
// each swatch clickable at sidebar widths.
const RUNTIME_PALETTE_PREVIEW_N = 10;

// "Natural length" of a palette — what the swatch strip renders. For static
// palettes this is the catalogue length (10 for okabe-ito, 12 for set3,
// etc.); for the runtime "*" palettes we sample `RUNTIME_PALETTE_PREVIEW_N`
// evenly-spaced stops.
function naturalPaletteLength(name: string): number {
  const def = DISCRETE_PALETTES[name];
  if (!def || def.length === 0) return RUNTIME_PALETTE_PREVIEW_N;
  if (def.length === 1 && def[0] === "*") return RUNTIME_PALETTE_PREVIEW_N;
  return def.length;
}

interface DiscreteSwatchStripProps {
  palette: string;
  // Optional override; defaults to the palette's natural length so the
  // strip always shows the full catalogue and users can copy any hex,
  // not just the ones currently bound to a group / category.
  n?: number;
  height?: number;
  width?: number | string;
}

// Full-palette swatch strip with click-to-copy. Each swatch is a real
// `<button>` so it gets keyboard focus + Enter activation for free;
// clicking copies its hex to the clipboard and surfaces a brief
// "✓ Copied #ABC123" caption below the strip so the user knows the value
// is on their clipboard (paste into any of the tool's hex inputs to
// override a single group's colour).
//
// Renders the full catalogue (every hex stop) rather than just the first
// `n` swatches, so users can see and copy any colour from the picker
// without having to peek at `tools/_shell/discrete-palette.ts`.
export function DiscreteSwatchStrip({
  palette,
  n,
  height = 18,
  width = "100%",
}: DiscreteSwatchStripProps) {
  const tr = useShellT();
  const count = typeof n === "number" && n > 0 ? n : naturalPaletteLength(palette);
  const colours = resolveDiscretePalette(palette, count);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (hex: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(hex).then(
        () => {
          setCopied(hex);
          setTimeout(() => setCopied(null), 1500);
        },
        () => {
          // Clipboard permission denied (rare; some browsers gate
          // writeText behind a transient user-gesture check that
          // fails when the page was navigated by a router). Surface
          // the hex in the caption anyway so the user can copy it
          // manually from there.
          setCopied(hex);
          setTimeout(() => setCopied(null), 2500);
        }
      );
    } else {
      // Browser without a clipboard API (older Safari, non-HTTPS
      // contexts). Showing the hex still gives the user something to
      // type by hand.
      setCopied(hex);
      setTimeout(() => setCopied(null), 2500);
    }
  };

  return (
    <div>
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
        {colours.map((hex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleCopy(hex)}
            title={tr("shell.palette.swatchTitle", { hex })}
            aria-label={tr("shell.palette.swatchAria", { hex })}
            style={{
              flex: 1,
              background: hex,
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              minWidth: 0,
            }}
          />
        ))}
      </div>
      <div
        aria-live="polite"
        style={{
          fontSize: 10,
          lineHeight: 1.4,
          marginTop: 3,
          color: copied ? "var(--success-text)" : "var(--text-faint)",
        }}
      >
        {copied ? tr("shell.palette.copied", { hex: copied }) : tr("shell.palette.clickToCopy")}
      </div>
    </div>
  );
}

interface DiscretePaletteSelectProps {
  value: string;
  onChange: (next: string) => void;
}

// Dropdown of palette keys with an inline preview strip below.
// Uses className="dv-select" so the dropdown chrome inherits the same
// theme-aware styling (background, border, text colour) as every other
// select in the codebase — without it, the browser's default select chrome
// shows up white-on-white in dark mode.
export function DiscretePaletteSelect({ value, onChange }: DiscretePaletteSelectProps) {
  const tr = useShellT();
  const keys = Object.keys(DISCRETE_PALETTES);
  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="dv-select"
        style={{ width: "100%", fontSize: 11, margin: "2px 0 6px" }}
        title={tr("shell.palette.pickerTitle")}
      >
        {keys.map((k) => (
          <option key={k} value={k}>
            {k + (COLORBLIND_SAFE_PALETTES.has(k) ? "  👁" : "")}
          </option>
        ))}
      </select>
      <DiscreteSwatchStrip palette={value} />
    </div>
  );
}

interface DiscretePaletteRowProps {
  value: string;
  onChange: (next: string) => void;
  // Optional list of group/category names. Only used to seed `applyColors`
  // with a correctly-sized hex array when the user picks a palette — the
  // preview strip itself always renders the full catalogue so users can
  // copy any hex, not just the ones currently bound to a group.
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
      <DiscretePaletteSelect value={value} onChange={handle} />
    </div>
  );
}

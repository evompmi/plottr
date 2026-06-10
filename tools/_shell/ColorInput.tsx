// `ColorInput` — paired native `<input type="color">` swatch + hex text
// field, with mid-keystroke guarding against value/text round-trip
// clobber. Used in every per-group / per-category colour picker across
// the plot tools.
//
// `normalizeHexColor` accepts `#rgb` or `#rrggbb` (case-insensitive) and
// returns the lowercased 6-char form, or null if the string is not a
// valid hex colour. Exported separately so other call sites can validate
// hex strings without instantiating the component.

import { useShellT } from "./i18n";

const { useState, useEffect } = React;

export function normalizeHexColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const s = v.toLowerCase();
    return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return null;
}

interface ColorInputProps {
  value: string;
  onChange: (next: string) => void;
  // Square edge length in pixels for the colour-picker swatch. Default 22.
  size?: number;
  // Accessible name for the pair — typically the group / series / role this
  // colour belongs to (e.g. a group name, "Up-regulated", "Background"). Used
  // to give both the swatch and the hex field an `aria-label` so screen-reader
  // users can tell which series each picker controls. Falls back to a generic
  // translated "Color" when omitted.
  label?: string;
}

export function ColorInput({ value, onChange, size = 22, label }: ColorInputProps) {
  const tr = useShellT();
  const swatchAria = label ? tr("shell.color.swatch", { label }) : tr("shell.color.swatchGeneric");
  const hexAria = label ? tr("shell.color.hex", { label }) : tr("shell.color.hexGeneric");
  const [text, setText] = useState(value);
  // Only sync local text from parent `value` when the current text doesn't
  // already normalise to that value. Without this guard, typing `#abc` would
  // commit `#aabbcc` upstream, which round-trips back through this effect and
  // rewrites the text field to the 6-char form mid-keystroke — the cursor
  // jumps and the user's `#abc` shorthand gets auto-expanded against their
  // will. With the guard, external value changes (preset swap, palette reset)
  // still sync, but self-commits don't clobber what the user typed.
  useEffect(() => {
    if (normalizeHexColor(text) !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (v: string) => {
    const n = normalizeHexColor(v);
    if (n) onChange(n);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={swatchAria}
        style={{
          width: size,
          height: size,
          border: "1px solid var(--border-strong)",
          borderRadius: 4,
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={text}
        aria-label={hexAria}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={(e) => {
          const n = normalizeHexColor(e.target.value);
          if (n) onChange(n);
          else setText(value);
        }}
        maxLength={7}
        spellCheck={false}
        style={{
          width: 64,
          fontFamily: "monospace",
          fontSize: 11,
          border: "1px solid var(--border-strong)",
          borderRadius: 4,
          padding: "2px 5px",
          color: "var(--text)",
          background: "var(--surface)",
        }}
      />
    </div>
  );
}

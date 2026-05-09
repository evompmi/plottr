// `GroupColorEditor` — list of {colour swatch, name input, optional
// toggle, `n=…`} rows for editing per-group colours and display
// names. Used in every plot tool's plot-step sidebar that exposes
// per-group colour overrides.

import { ColorInput } from "./ColorInput";

const h = React.createElement;

interface GroupColorEditorGroup {
  name: string;
  color: string;
  displayName?: string;
  enabled?: boolean;
  stats?: { n: number } | null;
}

interface GroupColorEditorProps {
  groups: GroupColorEditorGroup[];
  onColorChange: (i: number, color: string) => void;
  onNameChange?: (i: number, name: string) => void;
  onToggle?: (i: number) => void;
}

export function GroupColorEditor(props: GroupColorEditorProps) {
  const groups = props.groups;
  const onColorChange = props.onColorChange;
  const onNameChange = props.onNameChange;
  const onToggle = props.onToggle;
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 4 } },
    groups.map((g, i) => {
      const enabled = g.enabled !== false;
      const children: React.ReactNode[] = [];
      if (onToggle) {
        children.push(
          h("input", {
            key: "cb",
            type: "checkbox",
            checked: enabled,
            onChange: () => onToggle(i),
            style: { accentColor: g.color, flexShrink: 0, cursor: "pointer" },
          })
        );
      }
      children.push(
        h(ColorInput, {
          key: "clr",
          value: g.color,
          onChange: (c: string) => onColorChange(i, c),
          size: 18,
        })
      );
      children.push(
        h("input", {
          key: "nm",
          value: g.displayName || g.name,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onNameChange) onNameChange(i, e.target.value);
          },
          style: {
            flex: 1,
            minWidth: 0,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 4,
            color: "var(--text)",
            padding: "2px 4px",
            fontSize: 11,
            fontFamily: "inherit",
          },
        })
      );
      children.push(
        h(
          "span",
          { key: "n", style: { color: "var(--text-faint)", fontSize: 10, flexShrink: 0 } },
          "n=" + (g.stats ? g.stats.n : 0)
        )
      );
      return h(
        "div",
        {
          key: g.name,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 12,
            background: enabled ? "var(--surface-sunken)" : "var(--surface-subtle)",
            opacity: enabled ? 1 : 0.4,
            border: "1px solid var(--border-strong)",
          },
        },
        children
      );
    })
  );
}

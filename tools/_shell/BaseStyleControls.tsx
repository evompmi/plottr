// `BaseStyleControls` — background colour + grid on/off + grid
// colour controls. Used in the plot-style tile of every group-aware
// plot tool's sidebar.

import { ColorInput } from "./ColorInput";

const h = React.createElement;

interface BaseStyleControlsProps {
  plotBg: string;
  onPlotBgChange: (hex: string) => void;
  showGrid: boolean;
  onShowGridChange: (v: boolean) => void;
  gridColor: string;
  onGridColorChange: (hex: string) => void;
}

export function BaseStyleControls(props: BaseStyleControlsProps) {
  const plotBg = props.plotBg;
  const onPlotBgChange = props.onPlotBgChange;
  const showGrid = props.showGrid;
  const onShowGridChange = props.onShowGridChange;
  const gridColor = props.gridColor;
  const onGridColorChange = props.onGridColorChange;
  const children: React.ReactNode[] = [
    h(
      "div",
      {
        key: "bg",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
      h("span", { className: "dv-label" }, "Background"),
      h(ColorInput, { value: plotBg, onChange: onPlotBgChange, size: 24 })
    ),
    h(
      "div",
      { key: "grid" },
      h("span", { className: "dv-label" }, "Grid"),
      h(
        "div",
        {
          style: {
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
          },
        },
        ["off", "on"].map((mode) => {
          const active = mode === "on" ? showGrid : !showGrid;
          return h(
            "button",
            {
              key: mode,
              type: "button",
              onClick: () => onShowGridChange(mode === "on"),
              style: {
                flex: 1,
                padding: "4px 0",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                fontFamily: "inherit",
                cursor: "pointer",
                border: "none",
                background: active ? "var(--accent-primary)" : "var(--surface)",
                color: active ? "var(--on-accent)" : "var(--text-muted)",
                transition: "background 120ms ease, color 120ms ease",
              },
            },
            mode === "off" ? "Off" : "On"
          );
        })
      )
    ),
  ];
  if (showGrid) {
    children.push(
      h(
        "div",
        {
          key: "gc",
          style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
        },
        h("span", { className: "dv-label" }, "Grid color"),
        h(ColorInput, { value: gridColor, onChange: onGridColorChange, size: 24 })
      )
    );
  }
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, children);
}

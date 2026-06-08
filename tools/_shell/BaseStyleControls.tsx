// `BaseStyleControls` — background colour + grid on/off + grid
// colour controls. Used in the plot-style tile of every group-aware
// plot tool's sidebar.

import { ColorInput } from "./ColorInput";
import { OnOffToggle } from "./SegToggle";
import { useShellT } from "./i18n";

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
  const tr = useShellT();
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
      h("span", { className: "dv-label" }, tr("shell.style.background")),
      h(ColorInput, { value: plotBg, onChange: onPlotBgChange, size: 24 })
    ),
    h(
      "div",
      { key: "grid" },
      h("span", { className: "dv-label" }, tr("shell.style.grid")),
      h(OnOffToggle, {
        value: showGrid,
        onChange: onShowGridChange,
        ariaLabel: tr("shell.style.grid"),
      })
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
        h("span", { className: "dv-label" }, tr("shell.style.gridColor")),
        h(ColorInput, { value: gridColor, onChange: onGridColorChange, size: 24 })
      )
    );
  }
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, children);
}

// tools/_app/tool-registry.ts — single source of truth for the SPA
// router's known routes.
//
// Each entry maps a route key (the segment after `#/`) to the tool's
// human label, the inline SVG icon used in the topbar / landing tile,
// and the React component to render. The 10 entries here mirror the
// `TOOL_META` + `TOOL_ORDER` blocks that lived in `index.html` under
// the iframe shell (lines 1032-1091 of the pre-SPA version) — kept
// byte-identical for the icons so the visual identity carries across.
//
// `Component` is intentionally typed as `React.ComponentType` so each
// tool can be a plain function component or a `forwardRef`; the SPA
// just renders `<Component />` with no props.
//
// Phase 1 (this commit): components are placeholders that render a
// "Tool not yet wired" banner so the registry compiles standalone.
// Phase 3 swaps each placeholder for the real exported `App` from
// `tools/<tool>/index.tsx` once Phase 2 has added the `export`
// keyword to each tool's `function App()` declaration.

export interface ToolEntry {
  key: string;
  label: string;
  // Inline SVG markup for the topbar / landing tile icon. The actual
  // tile + topbar markup is rendered by `App.tsx` via `dangerouslySetInnerHTML`
  // (the icons are hand-authored static SVG strings — same pattern the
  // pre-SPA `index.html` used).
  iconSvg: string;
  Component: React.ComponentType;
}

// Pre-Phase-3 placeholder so the registry compiles before the per-tool
// exports land. Each entry will be replaced with the real `App` import
// in Phase 3.
function ToolNotWired({ name }: { name: string }) {
  return React.createElement(
    "div",
    {
      style: {
        padding: 24,
        margin: 24,
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        borderRadius: 8,
        color: "var(--warning-text)",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 13,
      },
    },
    `[SPA scaffold — Phase 1] ${name} component not wired yet. The real App will be imported here in Phase 3.`
  );
}

function makePlaceholder(label: string): React.ComponentType {
  return function Placeholder() {
    return React.createElement(ToolNotWired, { name: label });
  };
}

export const TOOL_REGISTRY: ToolEntry[] = [
  {
    key: "boxplot",
    label: "Group Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="4" x2="22" y2="12"/><rect x="14" y="12" width="16" height="18" rx="2"/><line x1="14" y1="22" x2="30" y2="22"/><line x1="22" y1="30" x2="22" y2="40"/></svg>',
    Component: makePlaceholder("Group Plot"),
  },
  {
    key: "scatter",
    label: "Scatter Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="10" cy="30" r="3"/><circle cx="16" cy="22" r="2.5"/><circle cx="24" cy="26" r="3.5"/><circle cx="20" cy="14" r="2"/><circle cx="32" cy="18" r="3"/><circle cx="36" cy="10" r="2.5"/><circle cx="28" cy="32" r="2"/></svg>',
    Component: makePlaceholder("Scatter Plot"),
  },
  {
    key: "venn",
    label: "Venn Diagram",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="16" cy="20" r="12"/><circle cx="28" cy="20" r="12"/></svg>',
    Component: makePlaceholder("Venn Diagram"),
  },
  {
    key: "upset",
    label: "UpSet Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="none" aria-hidden="true"><rect x="10" y="4" width="4" height="10" fill="currentColor"/><rect x="18" y="7" width="4" height="7" fill="currentColor"/><rect x="26" y="10" width="4" height="4" fill="currentColor"/><rect x="34" y="11" width="4" height="3" fill="currentColor"/><circle cx="12" cy="22" r="2.5" fill="currentColor"/><circle cx="20" cy="22" r="2.5" fill="currentColor"/><circle cx="28" cy="22" r="2.5" fill="currentColor" fill-opacity="0.25"/><circle cx="36" cy="22" r="2.5" fill="currentColor" fill-opacity="0.25"/><circle cx="12" cy="29" r="2.5" fill="currentColor"/><circle cx="20" cy="29" r="2.5" fill="currentColor" fill-opacity="0.25"/><circle cx="28" cy="29" r="2.5" fill="currentColor"/><circle cx="36" cy="29" r="2.5" fill="currentColor" fill-opacity="0.25"/></svg>',
    Component: makePlaceholder("UpSet Plot"),
  },
  {
    key: "lineplot",
    label: "Line Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,34 16,24 26,28 36,12"/><circle cx="6" cy="34" r="2.5" fill="currentColor"/><circle cx="16" cy="24" r="2.5" fill="currentColor"/><circle cx="26" cy="28" r="2.5" fill="currentColor"/><circle cx="36" cy="12" r="2.5" fill="currentColor"/></svg>',
    Component: makePlaceholder("Line Plot"),
  },
  {
    key: "aequorin",
    label: "RLU Timecourse",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 36 C8 36, 10 36, 12 34 C14 30, 15 8, 17 6 C19 4, 20 14, 22 22 C24 28, 25 32, 27 34 C29 36, 32 36, 40 36"/></svg>',
    Component: makePlaceholder("RLU Timecourse"),
  },
  {
    key: "heatmap",
    label: "Heatmap",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="none" aria-hidden="true"><rect x="6" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.2"/><rect x="17" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="28" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="6" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="17" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="28" y="17" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="6" y="28" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="17" y="28" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="28" y="28" width="10" height="10" fill="#785EF0"/></svg>',
    Component: makePlaceholder("Heatmap"),
  },
  {
    key: "volcano",
    label: "Volcano Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="22" cy="38" r="1.4" fill-opacity="0.4"/><circle cx="20" cy="36" r="1.2" fill-opacity="0.4"/><circle cx="24" cy="36" r="1.2" fill-opacity="0.4"/><circle cx="18" cy="38" r="1" fill-opacity="0.4"/><circle cx="26" cy="38" r="1" fill-opacity="0.4"/><circle cx="22" cy="34" r="1" fill-opacity="0.4"/><circle cx="17" cy="28" r="1.6"/><circle cx="13" cy="22" r="2"/><circle cx="9" cy="16" r="2.4"/><circle cx="5" cy="10" r="2.6"/><circle cx="27" cy="28" r="1.6"/><circle cx="31" cy="22" r="2"/><circle cx="35" cy="16" r="2.4"/><circle cx="39" cy="10" r="2.6"/></svg>',
    Component: makePlaceholder("Volcano Plot"),
  },
  {
    key: "power",
    label: "Power Analysis",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="38" x2="6" y2="6"/><line x1="6" y1="38" x2="38" y2="38"/><path d="M8 34 C12 33, 16 28, 20 20 C24 12, 28 8, 36 7" stroke-width="2.5"/><line x1="6" y1="14" x2="38" y2="14" stroke-dasharray="3,3" stroke-width="1" opacity="0.6"/></svg>',
    Component: makePlaceholder("Power Analysis"),
  },
  {
    key: "molarity",
    label: "Calculator",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="10" x2="18" y2="10"/><line x1="13" y1="5" x2="13" y2="15"/><line x1="26" y1="10" x2="36" y2="10"/><line x1="8" y1="30" x2="18" y2="30"/><circle cx="13" cy="25" r="1.5" fill="currentColor" stroke="none"/><circle cx="13" cy="35" r="1.5" fill="currentColor" stroke="none"/><line x1="28" y1="27" x2="34" y2="33"/><line x1="34" y1="27" x2="28" y2="33"/></svg>',
    Component: makePlaceholder("Calculator"),
  },
];

// Lookup helper used by the router. Returns the entry whose key
// matches, or null when the route is unknown / landing.
export function findToolEntry(key: string | null): ToolEntry | null {
  if (key == null) return null;
  return TOOL_REGISTRY.find((t) => t.key === key) || null;
}

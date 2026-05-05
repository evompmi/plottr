// tools/_app/App.tsx — top-level SPA shell.
//
// Reads the current hash route via `useRoute()`, looks up the tool
// component in `TOOL_REGISTRY`, and renders one of:
//   - The landing tile grid (route is null / unknown).
//   - A topbar + the tool's `App` component (route is a known tool).
//
// The topbar mirrors what the iframe shell rendered inside each
// tool's HTML page (back-to-home button + sibling tool quick-jump
// icons + theme toggle). The landing tile grid is intentionally
// minimal in Phase 1 — Phase 5 lifts the full landing markup out
// of `index.html` once the iframe shell goes away.

import { useRoute, navigate } from "./Router";
import { TOOL_REGISTRY, findToolEntry } from "./tool-registry";

// Inline SVG icons reused across the SPA shell. Match the pre-SPA
// markup in `index.html` for visual identity.
const HOME_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10 L10 3 L17 10"/><path d="M5 9 V17 H15 V9"/></svg>';

// Tiny helper for inline-SVG icon buttons. Same pattern the pre-SPA
// landing topbar used (`tb-icon-btn` class declared in the existing
// `index.html` style block; will move into `components.css` during
// Phase 5).
function IconButton({
  title,
  svg,
  onClick,
  extraAttrs,
}: {
  title: string;
  svg: string;
  onClick?: () => void;
  extraAttrs?: Record<string, string>;
}) {
  return React.createElement("button", {
    type: "button",
    className: "tb-icon-btn",
    title,
    "aria-label": title,
    onClick,
    dangerouslySetInnerHTML: { __html: svg },
    ...(extraAttrs || {}),
  });
}

// Topbar rendered above an active tool. Phase 1 stays minimal:
// theme toggle (data-theme-toggle attribute is what theme.js's
// listener picks up — same wiring the iframe shell used) + home
// button + sibling-tool quick-jump icons.
function ToolTopbar({ currentKey }: { currentKey: string }) {
  const others = TOOL_REGISTRY.filter((t) => t.key !== currentKey);
  return React.createElement(
    "div",
    {
      className: "tool-topbar",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      },
    },
    React.createElement("button", {
      type: "button",
      className: "tb-icon-btn",
      "data-theme-toggle": "",
      "aria-label": "Toggle theme",
    }),
    React.createElement("div", { className: "tb-sep" }),
    IconButton({
      title: "Home",
      svg: HOME_SVG,
      onClick: () => navigate(null),
    }),
    React.createElement("div", { className: "tb-sep" }),
    ...others.map((t) =>
      React.createElement(IconButton, {
        key: t.key,
        title: t.label,
        svg: t.iconSvg,
        onClick: () => navigate(t.key),
      })
    )
  );
}

// Phase-1 placeholder landing view. The full tile grid lives in
// `index.html` for now (still owned by the iframe shell); Phase 5
// migrates that markup into a proper `LandingView` component here.
function LandingPlaceholder() {
  return React.createElement(
    "div",
    {
      style: {
        padding: 32,
        margin: "32px auto",
        maxWidth: 720,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        textAlign: "center",
      },
    },
    React.createElement(
      "h2",
      { style: { margin: "0 0 12px", color: "var(--text)" } },
      "Plöttr SPA — Phase 1"
    ),
    React.createElement(
      "p",
      { style: { color: "var(--text-muted)", margin: "0 0 16px" } },
      "Pick a tool from the registry. The landing tile grid moves here in Phase 5."
    ),
    React.createElement(
      "ul",
      {
        style: {
          listStyle: "none",
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        },
      },
      ...TOOL_REGISTRY.map((t) =>
        React.createElement(
          "li",
          { key: t.key },
          React.createElement(
            "button",
            {
              type: "button",
              className: "dv-btn dv-btn-secondary",
              onClick: () => navigate(t.key),
            },
            t.label
          )
        )
      )
    )
  );
}

export function App() {
  const route = useRoute();
  const entry = findToolEntry(route);

  if (!entry) {
    return React.createElement(LandingPlaceholder);
  }

  // ErrorBoundary is a script-tag global from tools/shared-core.js
  // (declared in types/globals.d.ts). Wrapping every tool view here
  // means a runaway throw inside a tool can't crash the whole SPA —
  // the boundary swaps in a "this tool crashed, here's the stack"
  // view, and the user can navigate to a different route via the
  // topbar.
  const Tool = entry.Component;
  return React.createElement(
    "div",
    null,
    React.createElement(ToolTopbar, { currentKey: entry.key }),
    React.createElement(
      ErrorBoundary,
      { toolName: entry.label },
      React.createElement(Tool)
    )
  );
}

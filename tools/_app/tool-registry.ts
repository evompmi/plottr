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
// **Lazy loading.** Each tool's `App` is wrapped in `React.lazy` so its
// per-tool chunk only downloads when the user navigates to that route.
// esbuild's `--splitting` flag treats the literal `import("…")` calls
// below as code-split points and emits one chunk per tool plus shared
// chunks for code two or more tools touch. A first-visit mobile user
// opening only the molarity calculator pays for React + the shared
// bundle + the `_app` shell + the molarity chunk, instead of the
// ~740 KB monolith the pre-splitting build shipped.

// Re-attempt a failed dynamic import a couple of times before
// surfacing the rejection to React. Catches transient flakes —
// chunk request that 5xx'd, connection dropped mid-fetch, GH Pages
// CDN hiccup — without bothering the user. Does NOT help with
// promises that hang forever (the browser's module map dedupes
// `import("...")` calls to the same URL, so a re-call awaits the
// same in-flight fetch); the `ChunkLoadingFallback` in App.tsx
// owns the stuck-state safety net for that case.
const importWithRetry = <T>(
  loader: () => Promise<T>,
  { attempts = 3, baseDelayMs = 400 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> => {
  let attempt = 0;
  const tryOnce = (): Promise<T> =>
    loader().catch((err) => {
      attempt += 1;
      if (attempt >= attempts) throw err;
      // Linear backoff: 400 ms, 800 ms, 1200 ms. Short enough that a
      // user with a real network glitch sees recovery before they'd
      // think to reload, long enough that a flapping CDN gets a
      // chance to settle.
      return new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * attempt)).then(() =>
        tryOnce()
      );
    });
  return tryOnce();
};

const lazyApp = (loader: () => Promise<{ App: React.ComponentType }>): React.ComponentType =>
  React.lazy(() => importWithRetry(loader).then((m) => ({ default: m.App })));

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

export const TOOL_REGISTRY: ToolEntry[] = [
  {
    key: "boxplot",
    label: "Group Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="4" x2="22" y2="12"/><rect x="14" y="12" width="16" height="18" rx="2"/><line x1="14" y1="22" x2="30" y2="22"/><line x1="22" y1="30" x2="22" y2="40"/></svg>',
    Component: lazyApp(() => import("../boxplot/app")),
  },
  {
    key: "scatter",
    label: "Scatter Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="10" cy="30" r="3"/><circle cx="16" cy="22" r="2.5"/><circle cx="24" cy="26" r="3.5"/><circle cx="20" cy="14" r="2"/><circle cx="32" cy="18" r="3"/><circle cx="36" cy="10" r="2.5"/><circle cx="28" cy="32" r="2"/></svg>',
    Component: lazyApp(() => import("../scatter/app")),
  },
  {
    key: "venn",
    label: "Venn Diagram",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="16" cy="20" r="12"/><circle cx="28" cy="20" r="12"/></svg>',
    Component: lazyApp(() => import("../venn/app")),
  },
  {
    key: "upset",
    label: "UpSet Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="none" aria-hidden="true"><rect x="10" y="4" width="4" height="10" fill="currentColor"/><rect x="18" y="7" width="4" height="7" fill="currentColor"/><rect x="26" y="10" width="4" height="4" fill="currentColor"/><rect x="34" y="11" width="4" height="3" fill="currentColor"/><circle cx="12" cy="22" r="2.5" fill="currentColor"/><circle cx="20" cy="22" r="2.5" fill="currentColor"/><circle cx="28" cy="22" r="2.5" fill="currentColor" fill-opacity="0.25"/><circle cx="36" cy="22" r="2.5" fill="currentColor" fill-opacity="0.25"/><circle cx="12" cy="29" r="2.5" fill="currentColor"/><circle cx="20" cy="29" r="2.5" fill="currentColor" fill-opacity="0.25"/><circle cx="28" cy="29" r="2.5" fill="currentColor"/><circle cx="36" cy="29" r="2.5" fill="currentColor" fill-opacity="0.25"/></svg>',
    Component: lazyApp(() => import("../upset/app")),
  },
  {
    key: "lineplot",
    label: "Line Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,34 16,24 26,28 36,12"/><circle cx="6" cy="34" r="2.5" fill="currentColor"/><circle cx="16" cy="24" r="2.5" fill="currentColor"/><circle cx="26" cy="28" r="2.5" fill="currentColor"/><circle cx="36" cy="12" r="2.5" fill="currentColor"/></svg>',
    Component: lazyApp(() => import("../lineplot/app")),
  },
  {
    key: "aequorin",
    label: "RLU Timecourse",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 36 C8 36, 10 36, 12 34 C14 30, 15 8, 17 6 C19 4, 20 14, 22 22 C24 28, 25 32, 27 34 C29 36, 32 36, 40 36"/></svg>',
    Component: lazyApp(() => import("../aequorin/app")),
  },
  {
    key: "heatmap",
    label: "Heatmap",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="none" aria-hidden="true"><rect x="6" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.2"/><rect x="17" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="28" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="6" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="17" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="28" y="17" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="6" y="28" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="17" y="28" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="28" y="28" width="10" height="10" fill="#785EF0"/></svg>',
    Component: lazyApp(() => import("../heatmap/app")),
  },
  {
    key: "volcano",
    label: "Volcano Plot",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="22" cy="38" r="1.4" fill-opacity="0.4"/><circle cx="20" cy="36" r="1.2" fill-opacity="0.4"/><circle cx="24" cy="36" r="1.2" fill-opacity="0.4"/><circle cx="18" cy="38" r="1" fill-opacity="0.4"/><circle cx="26" cy="38" r="1" fill-opacity="0.4"/><circle cx="22" cy="34" r="1" fill-opacity="0.4"/><circle cx="17" cy="28" r="1.6"/><circle cx="13" cy="22" r="2"/><circle cx="9" cy="16" r="2.4"/><circle cx="5" cy="10" r="2.6"/><circle cx="27" cy="28" r="1.6"/><circle cx="31" cy="22" r="2"/><circle cx="35" cy="16" r="2.4"/><circle cx="39" cy="10" r="2.6"/></svg>',
    Component: lazyApp(() => import("../volcano/app")),
  },
  {
    key: "power",
    label: "Power Analysis",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="38" x2="6" y2="6"/><line x1="6" y1="38" x2="38" y2="38"/><path d="M8 34 C12 33, 16 28, 20 20 C24 12, 28 8, 36 7" stroke-width="2.5"/><line x1="6" y1="14" x2="38" y2="14" stroke-dasharray="3,3" stroke-width="1" opacity="0.6"/></svg>',
    Component: lazyApp(() => import("../power-app")),
  },
  {
    key: "molarity",
    label: "Calculator",
    iconSvg:
      '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="10" x2="18" y2="10"/><line x1="13" y1="5" x2="13" y2="15"/><line x1="26" y1="10" x2="36" y2="10"/><line x1="8" y1="30" x2="18" y2="30"/><circle cx="13" cy="25" r="1.5" fill="currentColor" stroke="none"/><circle cx="13" cy="35" r="1.5" fill="currentColor" stroke="none"/><line x1="28" y1="27" x2="34" y2="33"/><line x1="34" y1="27" x2="28" y2="33"/></svg>',
    Component: lazyApp(() => import("../molarity-app")),
  },
];

// Lookup helper used by the router. Returns the entry whose key
// matches, or null when the route is unknown / landing.
export function findToolEntry(key: string | null): ToolEntry | null {
  if (key == null) return null;
  return TOOL_REGISTRY.find((t) => t.key === key) || null;
}

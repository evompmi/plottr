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
import { ErrorBoundary } from "../_shell";
// Inline SVG icons reused across the SPA shell. Match the pre-SPA
// markup in `index.html` for visual identity.
const HOME_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10 L10 3 L17 10"/><path d="M5 9 V17 H15 V9"/></svg>';
const SUN_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
const MOON_SVG =
  '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none" aria-hidden="true"><path d="M16.5 12.8A6.5 6.5 0 0 1 7.2 3.5a.6.6 0 0 0-.8-.78 8 8 0 1 0 10.86 10.86.6.6 0 0 0-.78-.78z"/></svg>';

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

// Theme toggle for the SPA topbar. The inline IIFE in `index.html`
// only walks `[data-theme-toggle]` once at load time, so React-rendered
// buttons created later are never wired. We render our own button
// against `useThemeMode()` / `toggleTheme()` from `tools/theme.js`
// (script-scope globals via the shared bundle), kept visually
// consistent with the rest of the topbar's `tb-icon-btn` siblings.
function ThemeButton() {
  const mode = useThemeMode();
  const isDark = mode === "dark";
  const title = isDark ? "Switch to light mode" : "Switch to dark mode";
  return React.createElement("button", {
    type: "button",
    className: "tb-icon-btn",
    title,
    "aria-label": title,
    onClick: () => toggleTheme(),
    dangerouslySetInnerHTML: { __html: isDark ? SUN_SVG : MOON_SVG },
  });
}

// Topbar rendered above an active tool. Theme toggle + home button +
// sibling-tool quick-jump icons.
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
    React.createElement(ThemeButton),
    React.createElement("div", { className: "tb-sep" }),
    IconButton({
      title: "Home",
      svg: HOME_SVG,
      onClick: () => navigate(null),
      // `data-back` + `data-tool` are read by the @media (max-width: 900px)
      // rule in index.html that strips the topbar to "just the two
      // calculators + theme toggle" on phones (plot tools want a wider
      // canvas than mobile gives them, so a user mid-calculator
      // shouldn't be invited into one). The attributes were on the
      // pre-SPA per-tool HTML topbar; the React migration dropped them
      // and the selector silently matched nothing.
      extraAttrs: { "data-back": "true" },
    }),
    React.createElement("div", { className: "tb-sep" }),
    ...others.map((t) =>
      React.createElement(IconButton, {
        key: t.key,
        title: t.label,
        svg: t.iconSvg,
        onClick: () => navigate(t.key),
        extraAttrs: { "data-tool": t.key },
      })
    )
  );
}

// How long we wait before deciding a chunk fetch is stuck. The
// retry wrapper in `tool-registry.ts` re-attempts on rejection
// (CDN flake, dropped connection), but a hung promise — the
// browser fetched the chunk URL once, the request never
// completes, and the module map dedupes subsequent `import()`
// calls onto the same in-flight fetch — leaves Suspense in the
// fallback state forever. After this timeout we morph the
// spinner into a "Reload page" prompt so the user can recover
// without copying the URL into a fresh tab. 6 s is long enough
// for any plot chunk (≤ 116 KB) to finish on a 50 kb/s phone
// connection but short enough that a genuinely stuck fetch
// doesn't burn the user's patience.
const CHUNK_LOAD_STUCK_MS = 6000;

// Fallback shown while a tool's lazy chunk is fetching from the
// network. Sized to fill the route slot so the topbar doesn't reflow
// when the chunk resolves and the real tool renders. Uses themed
// CSS variables for the surface / text so light + dark match.
//
// After `CHUNK_LOAD_STUCK_MS` we swap to a "Reload page" prompt —
// covers stalled fetches that neither resolve nor reject (browser
// throttling on a backgrounded tab, transient CDN tarpit) where the
// user's only recourse is otherwise a manual reload.
function ChunkLoadingFallback({ label }: { label: string }) {
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setStuck(true), CHUNK_LOAD_STUCK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (stuck) {
    return React.createElement(
      "div",
      {
        role: "alert",
        style: {
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: "var(--text)",
          fontFamily: "monospace",
          fontSize: 13,
          padding: 24,
          textAlign: "center",
        },
      },
      React.createElement(
        "div",
        { style: { color: "var(--text-muted)" } },
        "Loading ",
        label,
        " is taking longer than expected."
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "dv-btn dv-btn-primary",
          onClick: () => window.location.reload(),
        },
        "Reload page"
      ),
      React.createElement(
        "div",
        { style: { color: "var(--text-faint)", fontSize: 11 } },
        "Your data, settings, and theme stay in browser storage."
      )
    );
  }

  return React.createElement(
    "div",
    {
      role: "status",
      "aria-live": "polite",
      style: {
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--text-muted)",
        fontFamily: "monospace",
        fontSize: 13,
      },
    },
    React.createElement("div", { className: "dv-chunk-spinner", "aria-hidden": "true" }),
    React.createElement("div", null, "Loading ", label, "…")
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

  // Keep-alive: every tool the user has navigated to stays mounted for
  // the rest of the session. Inactive tools are hidden via display:none
  // rather than unmounted, so navigating aequorin → boxplot → aequorin
  // returns to the original aequorin state (parsed CSV, plot, panels)
  // instead of a fresh mount. Mount-on-demand still applies — a tool
  // the user never visits never boots, so the cold-start cost is paid
  // only when needed.
  const [visitedKeys, setVisitedKeys] = React.useState<Set<string>>(() =>
    entry ? new Set([entry.key]) : new Set()
  );
  React.useEffect(() => {
    if (!entry) return;
    setVisitedKeys((prev) => {
      if (prev.has(entry.key)) return prev;
      const next = new Set(prev);
      next.add(entry.key);
      return next;
    });
    // We only react to the route key flipping. The functional setState
    // callback above handles dedupe internally so we don't need to
    // depend on `visitedKeys`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.key]);

  // Render every visited tool unconditionally so React keeps their
  // sub-trees mounted across route changes. Each tool sits inside its
  // own ErrorBoundary so a crashed tool doesn't take the whole SPA
  // down, and inside its own Suspense so the per-tool chunk load
  // (`React.lazy` in `tool-registry.ts`) shows a fallback only in
  // that tool's slot — already-resolved tools alongside it stay
  // visible. The active route renders normally; everything else hides
  // under display:none.
  const mountedTools = TOOL_REGISTRY.filter((t) => visitedKeys.has(t.key)).map((t) =>
    React.createElement(
      "div",
      {
        key: t.key,
        style: {
          display: entry && entry.key === t.key ? "block" : "none",
        },
      },
      React.createElement(
        ErrorBoundary,
        { toolName: t.label },
        React.createElement(
          React.Suspense,
          { fallback: React.createElement(ChunkLoadingFallback, { label: t.label }) },
          React.createElement(t.Component)
        )
      )
    )
  );

  if (!entry) {
    // Home view. The static landing markup in index.html owns the user-
    // visible tile grid; this placeholder only shows if the route-toggle
    // IIFE in index.html failed to run. Visited tools stay mounted
    // underneath so a future route restores their state intact.
    return React.createElement(
      "div",
      null,
      React.createElement(LandingPlaceholder),
      ...mountedTools
    );
  }

  return React.createElement(
    "div",
    null,
    React.createElement(ToolTopbar, { currentKey: entry.key }),
    ...mountedTools
  );
}

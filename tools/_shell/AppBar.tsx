// `AppBar` — the one bar across the top of every tool page: brand + tool
// switcher on the left, the tool's own content (step nav, file chip, export
// buttons, prefs) in the middle and right, and the app utilities (theme,
// language, feedback) at the far right.
//
// The brand, switcher and utilities need the tool registry and the SPA
// router, which live in `_app/` — a tier `_shell/` must not import. So
// `_app/App.tsx` builds those nodes once and hands them down through
// `AppChromeContext`; the bar reads them here. Outside the SPA (tests,
// standalone renders) the context is empty and the bar shows only the
// tool's own content.

const { useLayoutEffect, useRef } = React;

export interface AppChrome {
  // Rune + wordmark, linking home.
  brand: React.ReactNode;
  // Tool-switcher menu button for the current tool.
  switcher: React.ReactNode;
  // Theme / language / feedback buttons.
  utilities: React.ReactNode;
}

export const AppChromeContext = React.createContext<AppChrome | null>(null);

// Publish the bar's height as `--dv-sticky-top` so sticky elements below it
// (workspace columns, the plot sidebar) park just under it. Tools stay
// mounted while hidden (keep-alive routing); a hidden bar measures 0 px, so
// only a visible bar writes the variable.
function useStickyTopVar(ref: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!el || !root) return undefined;
    const apply = () => {
      if (el.offsetHeight > 0) root.style.setProperty("--dv-sticky-top", el.offsetHeight + "px");
    };
    apply();
    const RO = typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
    const ro = RO ? new RO(apply) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
    };
  }, [ref]);
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      style={{ flex: "0 0 auto", width: 1, height: 24, background: "var(--border)" }}
    />
  );
}

interface AppBarProps {
  // Step navigation (plot tools) — sits right after the switcher.
  steps?: React.ReactNode;
  // Tool-specific content on the right: file chip, Start over, exports, prefs.
  actions?: React.ReactNode;
}

export function AppBar({ steps, actions }: AppBarProps) {
  const chrome = React.useContext(AppChromeContext);
  const barRef = useRef<HTMLElement>(null);
  useStickyTopVar(barRef);
  return (
    <header
      ref={barRef}
      className="dv-appbar"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 20px",
          minHeight: 56,
          boxSizing: "border-box",
          flexWrap: "wrap",
        }}
      >
        {chrome && chrome.brand}
        {chrome && <Divider />}
        {chrome && chrome.switcher}
        {steps}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {actions}
          {actions && chrome && <Divider />}
          {chrome && chrome.utilities}
        </div>
      </div>
    </header>
  );
}

// Monospace chip naming the loaded file (and optionally its size).
export function FileChip({ name }: { name: string }) {
  if (!name) return null;
  return (
    <span
      className="dv-file-chip"
      title={name}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-muted)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "5px 10px",
        maxWidth: 240,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

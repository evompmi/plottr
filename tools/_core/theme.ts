// _core/theme.ts — theme toggle wiring + `ThemeToggle` React component.
//
// Migrated from the legacy script-scope `tools/theme.js`. Reads / writes
// `dataviz-theme` in localStorage, syncs across same-origin tabs via
// BroadcastChannel (storage event as fallback), and exposes a small
// `ThemeToggle` React component.
//
// First-visit / no-FOUC behaviour is unchanged: a tiny inline IIFE in each
// HTML `<head>` reads `dataviz-theme` and applies the `data-theme` attribute
// synchronously before paint, so the migration of this module to the SPA
// bundle doesn't reintroduce theme flashing.
//
// The standalone HTML pages (`benchmark.html`, `privacy.html`) load the
// bundled IIFE via `<script>` and reference `getTheme` / `setTheme` /
// `toggleTheme` from inline scripts; `scripts/build-shared.js` appends a
// synthetic `Object.assign(globalThis, …)` footer at bundling time so
// those legacy consumers continue to resolve the names.

const THEME_STORAGE_KEY = "dataviz-theme";

type ThemeMode = "dark" | "light";

let _themeChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel === "function") {
    _themeChannel = new BroadcastChannel("dataviz-theme");
  }
} catch {
  _themeChannel = null;
}

function _applyThemeAttr(mode: ThemeMode | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark" || mode === "light") {
    root.setAttribute("data-theme", mode);
  } else {
    root.removeAttribute("data-theme");
  }
}

function _readStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export function getTheme(): ThemeMode {
  if (typeof document === "undefined" || typeof window === "undefined") return "light";
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function setTheme(mode: ThemeMode | null): void {
  try {
    if (mode === "dark" || mode === "light") {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } else {
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
  } catch {
    // localStorage may be blocked (private mode, iframe sandbox). Still apply
    // the attribute so the current page reflects the change.
  }
  _applyThemeAttr(mode);
  try {
    if (_themeChannel) _themeChannel.postMessage({ type: "theme", theme: mode });
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: mode } }));
  } catch {
    /* ignore */
  }
}

export function toggleTheme(): void {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

// Apply any stored theme immediately. The no-FOUC inline snippet in each HTML
// <head> already does this before first paint; re-running here is idempotent
// and covers the case where this module is loaded without the inline snippet.
if (typeof document !== "undefined") {
  _applyThemeAttr(_readStoredTheme());
}

if (_themeChannel) {
  _themeChannel.addEventListener("message", (e: MessageEvent) => {
    const data = e && (e.data as { type?: string; theme?: string });
    if (!data || data.type !== "theme") return;
    const v: ThemeMode | null =
      data.theme === "dark" || data.theme === "light" ? (data.theme as ThemeMode) : null;
    _applyThemeAttr(v);
    try {
      window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: v } }));
    } catch {
      /* ignore */
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    const v: ThemeMode | null =
      e.newValue === "dark" || e.newValue === "light" ? (e.newValue as ThemeMode) : null;
    _applyThemeAttr(v);
    try {
      window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: v } }));
    } catch {
      /* ignore */
    }
  });

  window.addEventListener("pageshow", () => {
    _applyThemeAttr(_readStoredTheme());
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      _applyThemeAttr(_readStoredTheme());
    }
  });
}

export function useThemeMode(): ThemeMode {
  const [mode, setMode] = React.useState<ThemeMode>(() => getTheme());
  React.useEffect(() => {
    const onChange = (): void => setMode(getTheme());
    window.addEventListener("dataviz-theme-change", onChange);
    window.addEventListener("storage", onChange);
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq && (mq as MediaQueryList).addListener) (mq as MediaQueryList).addListener(onChange);
    return () => {
      window.removeEventListener("dataviz-theme-change", onChange);
      window.removeEventListener("storage", onChange);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq && (mq as MediaQueryList).removeListener)
        (mq as MediaQueryList).removeListener(onChange);
    };
  }, []);
  return mode;
}

const _SUN_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
const _MOON_SVG =
  '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none" width="16" height="16" aria-hidden="true"><path d="M16.5 12.8A6.5 6.5 0 0 1 7.2 3.5a.6.6 0 0 0-.8-.78 8 8 0 1 0 10.86 10.86.6.6 0 0 0-.78-.78z"/></svg>';

interface ThemeToggleProps {
  style?: React.CSSProperties;
}

export function ThemeToggle(props?: ThemeToggleProps): React.ReactElement {
  const p = props || {};
  const mode = useThemeMode();
  const isDark = mode === "dark";
  const title = isDark ? "Switch to light mode" : "Switch to dark mode";
  const style: React.CSSProperties = Object.assign(
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      padding: 0,
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--surface)",
      color: "var(--text)",
      cursor: "pointer",
      lineHeight: 0,
    },
    p.style || {}
  );
  return React.createElement(
    "button",
    {
      type: "button",
      onClick: toggleTheme,
      title,
      "aria-label": title,
      style,
    },
    React.createElement("span", {
      dangerouslySetInnerHTML: { __html: isDark ? _SUN_SVG : _MOON_SVG },
      style: { display: "inline-block", lineHeight: 0 },
    })
  );
}

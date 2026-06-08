// _core/i18n.ts — lightweight i18n primitive + `LangToggle` React component.
// The i18n twin of `_core/theme.ts`: reads / writes `plottr-lang` in
// localStorage, syncs across same-origin tabs via BroadcastChannel (with
// the `storage` event as a fallback), and exposes a `useLang()` hook plus a
// `LangToggle` button mirroring `ThemeToggle`.
//
// No runtime third-party dep: string lookup + `{var}` interpolation are a
// few lines here, and the only genuinely hard part — CLDR plural categories
// — is delegated to the platform's `Intl.PluralRules`.
//
// First-visit / no-FOUC behaviour: a tiny inline IIFE in each HTML `<head>`
// reads `plottr-lang` and pins `document.documentElement.lang` synchronously
// before paint (matters for screen readers / hyphenation / `<html lang>`).
// Re-running the apply here is idempotent.
//
// Like `theme.ts`, this module is bundled into `tools/shared.bundle.js`
// (via `_core/shared-bundle-entry.ts`) so the static landing's inline
// scripts can call `getLang` / `setLang` / `t` / `applyStaticI18n` as
// globals; `scripts/build-shared.js` appends the
// `Object.assign(globalThis, __plottrShared)` footer that exposes them.

const LANG_STORAGE_KEY = "plottr-lang";

export type Lang = "en" | "fr";
export const LANGS: readonly Lang[] = ["en", "fr"] as const;
const DEFAULT_LANG: Lang = "en";

function _isLang(v: unknown): v is Lang {
  return v === "en" || v === "fr";
}

// ---------------------------------------------------------------------------
// Catalog registry
//
// A catalog is a flat map of dotted keys (`"shell.upload.dropHere"`) to
// template strings. Namespaces are the segment before the first dot —
// "core" / "shell" / "landing" (eager) plus one per tool (lazy, registered
// by that tool's chunk via `import "./i18n"`). Both locales ship in the same
// chunk so switching language is synchronous and offline-safe (no fetch).
// ---------------------------------------------------------------------------

export type Catalog = Record<string, string>;

// Plural keys are stored as sibling entries `${base}.${category}` (e.g.
// `…detail.one` / `…detail.other`). Callers pass the BASE key + a `count`
// var; `t()` resolves the right sibling. These helpers let a namespace's
// typed wrapper accept the base key in addition to the concrete keys.
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type PluralBaseKey<K extends string> = K extends `${infer B}.${PluralCategory}` ? B : never;
export type TranslatableKey<K extends string> = K | PluralBaseKey<K>;

type Registry = Record<string, Partial<Record<Lang, Catalog>>>;
const _registry: Registry = Object.create(null) as Registry;

export function registerCatalog(ns: string, lang: Lang, cat: Catalog): void {
  (_registry[ns] ??= {})[lang] = cat;
}

// ---------------------------------------------------------------------------
// Translation function
// ---------------------------------------------------------------------------

export interface TVars {
  [k: string]: string | number;
}

const _plurals = new Map<Lang, Intl.PluralRules>();
function _pluralRules(l: Lang): Intl.PluralRules {
  let r = _plurals.get(l);
  if (!r) {
    r = new Intl.PluralRules(l);
    _plurals.set(l, r);
  }
  return r;
}

function _lookup(key: string, lang: Lang): string | undefined {
  const dot = key.indexOf(".");
  const ns = dot === -1 ? key : key.slice(0, dot);
  return _registry[ns]?.[lang]?.[key];
}

// HTML-escape a substituted value. Applied only by `tHtml` (the variant whose
// result is injected via `dangerouslySetInnerHTML`): the catalog *template* is
// authored by us and may legitimately carry markup, but `{var}` substitutions
// can be user data (e.g. a pasted CSV column header), so each interpolated
// value is escaped to neutralise injected tags.
function _escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _interpolate(s: string, vars: TVars, escape: boolean): string {
  return s.replace(/\{(\w+)\}/g, (_m, k: string) => {
    if (!(k in vars)) return `{${k}}`;
    const v = String(vars[k]);
    return escape ? _escapeHtml(v) : v;
  });
}

function _translate(key: string, vars: TVars | undefined, escape: boolean): string {
  let raw = _lookup(key, _lang) ?? _lookup(key, DEFAULT_LANG);
  if (vars && typeof vars.count === "number") {
    const cat = _pluralRules(_lang).select(vars.count);
    raw =
      _lookup(`${key}.${cat}`, _lang) ??
      _lookup(`${key}.other`, _lang) ??
      _lookup(`${key}.${cat}`, DEFAULT_LANG) ??
      _lookup(`${key}.other`, DEFAULT_LANG) ??
      raw;
  }
  if (raw === undefined) return key;
  return vars ? _interpolate(raw, vars, escape) : raw;
}

// Translate `key` in the current language. Falls back to English, then to
// the key itself (so a missing translation is visible, never a blank). When
// `vars.count` is a number, prefers the plural sibling key
// `${key}.${category}` (then `.other`) resolved via `Intl.PluralRules`.
//
// `t` does NOT escape interpolated values — it targets plain-text contexts
// (React text children, `textContent`, `title` attributes) where the renderer
// already escapes. For results fed to `dangerouslySetInnerHTML`, use `tHtml`.
export function t(key: string, vars?: TVars): string {
  return _translate(key, vars, false);
}

// HTML-safe sibling of `t`: identical lookup/plural/fallback behaviour, but
// every interpolated `{var}` value is HTML-escaped. Use this — never `t` —
// whenever the returned string is injected via `dangerouslySetInnerHTML` AND
// carries interpolation vars, so user-supplied values can't inject markup.
export function tHtml(key: string, vars?: TVars): string {
  return _translate(key, vars, true);
}

// ---------------------------------------------------------------------------
// Language state + cross-tab sync (mirrors theme.ts)
// ---------------------------------------------------------------------------

function _readStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return _isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function _detectLang(): Lang | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator.language || (navigator.languages && navigator.languages[0]) || "";
  return nav.toLowerCase().startsWith("fr") ? "fr" : null;
}

let _lang: Lang = _readStoredLang() ?? _detectLang() ?? DEFAULT_LANG;

let _langChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel === "function") {
    _langChannel = new BroadcastChannel(LANG_STORAGE_KEY);
  }
} catch {
  _langChannel = null;
}

function _applyLangAttr(lang: Lang): void {
  // Guard documentElement too: under the test vm loaders `document` may be a
  // bare stub without a documentElement.
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang;
  }
}

export function getLang(): Lang {
  return _lang;
}

export function setLang(lang: Lang): void {
  if (!_isLang(lang)) return;
  _lang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // localStorage may be blocked (private mode, iframe sandbox). Still
    // apply + broadcast so the current page reflects the change.
  }
  _applyLangAttr(lang);
  try {
    if (_langChannel) _langChannel.postMessage({ type: "lang", lang });
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("plottr-lang-change", { detail: { lang } }));
  } catch {
    /* ignore */
  }
}

// Swap the static-page text marked up with `data-i18n` / `data-i18n-html`.
// Used by the landing / privacy pages (Phase 1); the catalog values are
// authored by us, so `innerHTML` for the markup-bearing variant is safe.
export function applyStaticI18n(root: ParentNode = document): void {
  // `data-i18n` → textContent (plain text); `data-i18n-html` → innerHTML
  // (for entries carrying authored markup like <b> / <br>; values are ours,
  // not user input, so innerHTML is safe); `data-i18n-title` → the title
  // attribute (tooltips on trust badges etc.).
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (key) el.innerHTML = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key) el.setAttribute("title", t(key));
  });
}

// Re-apply the stored language on load (idempotent — the no-FOUC head
// snippet already did this before first paint).
_applyLangAttr(_lang);

if (_langChannel) {
  _langChannel.addEventListener("message", (e: MessageEvent) => {
    const data = e && (e.data as { type?: string; lang?: string });
    if (!data || data.type !== "lang" || !_isLang(data.lang)) return;
    _lang = data.lang;
    _applyLangAttr(_lang);
    try {
      window.dispatchEvent(new CustomEvent("plottr-lang-change", { detail: { lang: _lang } }));
    } catch {
      /* ignore */
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== LANG_STORAGE_KEY || !_isLang(e.newValue)) return;
    _lang = e.newValue;
    _applyLangAttr(_lang);
    try {
      window.dispatchEvent(new CustomEvent("plottr-lang-change", { detail: { lang: _lang } }));
    } catch {
      /* ignore */
    }
  });

  window.addEventListener("pageshow", () => {
    const v = _readStoredLang();
    if (v) {
      _lang = v;
      _applyLangAttr(v);
    }
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const v = _readStoredLang();
      if (v) {
        _lang = v;
        _applyLangAttr(v);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// React hooks + LangToggle component
// ---------------------------------------------------------------------------

export function useLang(): Lang {
  const [lang, setL] = React.useState<Lang>(() => getLang());
  React.useEffect(() => {
    const onChange = (): void => setL(getLang());
    window.addEventListener("plottr-lang-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("plottr-lang-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return lang;
}

// Subscribe-and-return-`t` convenience: a component that renders `t()`
// output calls `const tr = useT()` once so it re-renders on language change.
export function useT(): typeof t {
  useLang();
  return t;
}

// Per-namespace typed-wrapper factory. A tool's `i18n/index.ts` registers
// its catalogs then does `export const { tt, useT } = makeT<ToolKey>()` —
// `tt(key)` is key-checked (accepting plural base keys), and `useT()`
// subscribes to language changes before returning `tt` so components
// re-render on toggle. Cuts the per-tool boilerplate to three lines.
export function makeT<K extends string>(): {
  tt: (key: TranslatableKey<K>, vars?: TVars) => string;
  ttHtml: (key: TranslatableKey<K>, vars?: TVars) => string;
  useT: () => (key: TranslatableKey<K>, vars?: TVars) => string;
} {
  const tt = (key: TranslatableKey<K>, vars?: TVars): string => t(key, vars);
  // Key-checked twin of `tt` that HTML-escapes interpolated values; use at
  // `dangerouslySetInnerHTML` sites. Not a hook — call it inside a component
  // that already subscribes via `useT()`/`useLang()` so it re-renders on the
  // language toggle and `ttHtml` reads the current language at call time.
  const ttHtml = (key: TranslatableKey<K>, vars?: TVars): string => tHtml(key, vars);
  const useTHook = (): ((key: TranslatableKey<K>, vars?: TVars) => string) => {
    useLang();
    return tt;
  };
  return { tt, ttHtml, useT: useTHook };
}

export function toggleLang(): void {
  setLang(getLang() === "fr" ? "en" : "fr");
}

interface LangToggleProps {
  style?: React.CSSProperties;
}

// Two-state EN | FR toggle, styled like `ThemeToggle` so it can sit beside
// it on the static landing (shipped via shared.bundle.js) and in tool chrome.
export function LangToggle(props?: LangToggleProps): React.ReactElement {
  const p = props || {};
  const lang = useLang();
  const next = lang === "fr" ? "en" : "fr";
  const title = lang === "fr" ? "Passer en anglais" : "Switch to French";
  const style: React.CSSProperties = Object.assign(
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 32,
      height: 32,
      padding: "0 8px",
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--surface)",
      color: "var(--text)",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: 0.5,
    },
    p.style || {}
  );
  return React.createElement(
    "button",
    {
      type: "button",
      onClick: toggleLang,
      title,
      "aria-label": title,
      style,
    },
    next.toUpperCase()
  );
}

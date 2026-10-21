// tools/_app/App.tsx — top-level SPA shell.
//
// Reads the current hash route via `useRoute()`, looks up the tool
// component in `TOOL_REGISTRY`, and renders one of:
//   - The landing fallback (route is null / unknown).
//   - The tool's `App` component (route is a known tool).
//
// Every tool page is topped by the shared `AppBar` (`_shell/AppBar.tsx`).
// Its brand link, tool switcher and utility buttons (theme, language,
// feedback) need the registry and the router, so they are built here and
// handed down through `AppChromeContext`; plot tools render the bar inside
// `PlotToolShell`, and this file renders it directly for the calculators.
// The real landing markup lives in `index.html` and is hidden via CSS
// whenever the SPA hash route resolves to a tool.

import { useRoute, navigate } from "./Router";
import { TOOL_REGISTRY, findToolEntry } from "./tool-registry";
import type { ToolCategory, ToolEntry } from "./tool-registry";
import { ErrorBoundary } from "../_shell";
import { AppBar, AppChromeContext } from "../_shell/AppBar";
import type { AppChrome } from "../_shell/AppBar";
import { toggleTheme, useThemeMode } from "../_core/theme";
import { useLang, setLang } from "../_core/i18n";
import { useShellT } from "../_shell/i18n";
import type { ShellKey } from "../_shell/i18n";
import { TOOL_ACCENT, tintIcon } from "../_core/icons";
// Inline SVG icons for the app-bar utility buttons.
const SUN_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
const MOON_SVG =
  '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none" aria-hidden="true"><path d="M16.5 12.8A6.5 6.5 0 0 1 7.2 3.5a.6.6 0 0 0-.8-.78 8 8 0 1 0 10.86 10.86.6.6 0 0 0-.78-.78z"/></svg>';
// Speech-bubble (chat) icon for the "Send feedback" affordance. Same
// monoline aesthetic the other topbar SVGs use (20×20 viewBox, 1.8
// stroke, currentColor, round caps + joins). Rounded-rect bubble with
// a small tail dropping down-left so the glyph reads as "message"
// rather than generic rectangle at icon-button scale.
const FEEDBACK_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5 a2 2 0 0 1 2-2 h10 a2 2 0 0 1 2 2 v7 a2 2 0 0 1-2 2 h-6 l-3 3 v-3 h-1 a2 2 0 0 1-2-2 z"/></svg>';

// "Send feedback" delivery address. Email rather than GitHub Issues
// because most internal wet-lab users don't have a GitHub account, and
// "create a free account" is enough friction to lose them. Living at
// module scope so a fork can swap it without touching the callsite.
const FEEDBACK_EMAIL = "plottrproject@gmail.com";

// Builds the subject + prefilled body shared by the mailto: draft and the
// in-app feedback dialog. The body carries (a) two empty prompt sections
// the user fills in, (b) the current tool key, Plöttr version, browser UA
// and timestamp so we can reproduce — all visible *before* anything is
// sent, and editable / strippable wherever the user composes (their mail
// client or a webmail compose box). Section underlines and field-label
// padding are computed from the translated text so it stays aligned in any
// language. No tracking, no telemetry, no fetches.
function buildFeedbackContent(
  tool: string,
  tr: ReturnType<typeof useShellT>
): { subject: string; body: string } {
  const version =
    (typeof window !== "undefined" && (window as { __APP_VERSION__?: string }).__APP_VERSION__) ||
    "v?";
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "unknown";
  const whatHappened = tr("shell.feedback.whatHappened");
  const whatExpected = tr("shell.feedback.whatExpected");
  const fields: [string, string][] = [
    [tr("shell.feedback.fieldTool"), tool],
    [tr("shell.feedback.fieldVersion"), version],
    [tr("shell.feedback.fieldBrowser"), ua],
    [tr("shell.feedback.fieldReported"), new Date().toISOString()],
  ];
  const labelWidth = Math.max(...fields.map(([label]) => label.length));
  const body = [
    tr("shell.feedback.intro"),
    "",
    whatHappened,
    "-".repeat(whatHappened.length),
    tr("shell.feedback.whatHappenedHint"),
    "",
    whatExpected,
    "-".repeat(whatExpected.length),
    tr("shell.feedback.whatExpectedHint"),
    "",
    "---",
    ...fields.map(([label, value]) => "- " + label.padEnd(labelWidth + 1) + value),
  ].join("\n");
  return { subject: tr("shell.feedback.subject", { tool }), body };
}

// `mailto:` URL for a subject + body. `URLSearchParams` would encode spaces
// as `+`, which some mail clients (Outlook desktop in particular) take
// literally rather than decoding back to spaces; `encodeURIComponent` on
// each field yields `%20`, which every client handles correctly.
function buildMailto(subject: string, body: string): string {
  return (
    "mailto:" +
    encodeURIComponent(FEEDBACK_EMAIL) +
    "?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body)
  );
}

// Small copy-to-clipboard button with transient "Copied!" feedback. Falls
// back gracefully where `navigator.clipboard` is missing (older Safari,
// non-HTTPS / file:// contexts) or `writeText` rejects (permission gated
// behind a user gesture) — the adjacent text is selectable either way, so
// the user can still copy by hand; we just flash the confirmation anyway so
// the click never looks dead.
function CopyButton({ text, label }: { text: string; label: string }) {
  const tr = useShellT();
  const [copied, setCopied] = React.useState(false);
  const onClick = (): void => {
    const flash = (): void => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(flash, flash);
    } else {
      flash();
    }
  };
  return React.createElement(
    "button",
    { type: "button", className: "dv-btn dv-btn-secondary", onClick },
    copied ? tr("shell.feedback.copied") : label
  );
}

// In-app feedback dialog. Rendered instead of firing `window.location.href`
// at a `mailto:` blind, because there is no browser API to detect whether a
// mail handler exists — a user without one would otherwise click and see
// nothing happen. The dialog gives two always-available paths: "Open in
// email app" (the mailto, for users who do have a client) and copy buttons
// for the address + message (paste into Gmail / Outlook web). Plöttr itself
// still sends nothing.
function FeedbackDialog({ tool, onClose }: { tool: string; onClose: () => void }) {
  const tr = useShellT();
  const { subject, body } = buildFeedbackContent(tool, tr);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Escape-to-close, matching the rest of the shell's keyboard affordances.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Honour the `aria-modal` contract: move focus into the dialog on open (so
  // screen readers announce it and Tab proceeds from inside, not from the
  // topbar button behind the scrim) and restore it to the trigger on close.
  // The panel carries `tabIndex={-1}` so it can receive programmatic focus.
  React.useEffect(() => {
    const prevFocus = typeof document !== "undefined" ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      if (prevFocus instanceof HTMLElement) prevFocus.focus();
    };
  }, []);
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "var(--text-faint)",
  };
  return React.createElement(
    "div",
    {
      // Backdrop. `rgba(...)` scrim is not a hex literal, so it doesn't trip
      // the `no-chrome-hex-literal` ESLint rule; theming it isn't necessary
      // (a translucent dark scrim reads correctly over either theme).
      role: "presentation",
      onClick: onClose,
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 18, 25, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      },
    },
    React.createElement(
      "div",
      {
        ref: panelRef,
        tabIndex: -1,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "feedback-dialog-title",
        // Stop backdrop click-to-close from firing when interacting inside.
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        style: {
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--cta-primary-shadow)",
          // Programmatic focus lands on this container (tabIndex -1); the
          // visible focus ring belongs to the inner controls, not the panel.
          outline: "none",
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        },
      },
      React.createElement(
        "h2",
        {
          id: "feedback-dialog-title",
          style: { margin: 0, fontSize: 18, color: "var(--text)" },
        },
        tr("shell.feedback.dialogTitle")
      ),
      React.createElement(
        "p",
        { style: { margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)" } },
        tr("shell.feedback.dialogIntro")
      ),
      // To: address + copy.
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 6 } },
        React.createElement("span", { style: labelStyle }, tr("shell.feedback.toLabel")),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
          React.createElement(
            "code",
            {
              style: {
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--text)",
                userSelect: "all",
              },
            },
            FEEDBACK_EMAIL
          ),
          React.createElement(CopyButton, {
            text: FEEDBACK_EMAIL,
            label: tr("shell.feedback.copyAddress"),
          })
        )
      ),
      // Subject (short; shown so it can be retyped into webmail if needed).
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 6 } },
        React.createElement("span", { style: labelStyle }, tr("shell.feedback.subjectLabel")),
        React.createElement(
          "span",
          { style: { fontSize: 13, color: "var(--text)", userSelect: "all" } },
          subject
        )
      ),
      // Message body — read-only, selectable, scrollable.
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 6 } },
        React.createElement("span", { style: labelStyle }, tr("shell.feedback.messageLabel")),
        React.createElement("textarea", {
          readOnly: true,
          value: body,
          rows: 9,
          style: {
            width: "100%",
            resize: "vertical",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--text)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 10,
            boxSizing: "border-box",
          },
        })
      ),
      // Actions.
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            marginTop: 4,
          },
        },
        React.createElement(CopyButton, {
          text: body,
          label: tr("shell.feedback.copyMessage"),
        }),
        React.createElement(
          "a",
          {
            className: "dv-btn dv-btn-primary",
            href: buildMailto(subject, body),
            style: { textDecoration: "none", display: "inline-flex", alignItems: "center" },
          },
          tr("shell.feedback.openDraft")
        ),
        React.createElement(
          "button",
          { type: "button", className: "dv-btn dv-btn-secondary", onClick: onClose },
          tr("shell.feedback.close")
        )
      )
    )
  );
}

// "Send feedback" affordance. Opt-in by design: clicking it opens the
// in-app `FeedbackDialog` (Plöttr itself sends nothing). Distinct visual
// region from the tool buttons (separated by a `tb-sep`, pushed to the
// right edge of the topbar via `margin-left: auto`) so it reads as chrome
// rather than another nav target.
function FeedbackButton({ currentKey }: { currentKey: string | null }) {
  const tr = useShellT();
  const [open, setOpen] = React.useState(false);
  const tool = currentKey || "landing";
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("button", {
      type: "button",
      className: "dv-icon-btn",
      title: tr("shell.feedback.title"),
      "aria-label": tr("shell.feedback.aria"),
      onClick: () => setOpen(true),
      dangerouslySetInnerHTML: { __html: FEEDBACK_SVG },
      // `data-feedback` is a no-op for the existing mobile-strip CSS rule
      // (which targets `[data-back]` / `[data-tool]` / `.tb-sep` only) —
      // here only so the feedback button has a queryable hook if a future
      // selector needs it.
      "data-feedback": "true",
    }),
    open ? React.createElement(FeedbackDialog, { tool, onClose: () => setOpen(false) }) : null
  );
}

// Theme toggle for the SPA topbar. The inline IIFE in `index.html`
// only walks `[data-theme-toggle]` once at load time, so React-rendered
// buttons created later are never wired by that path. We render our
// own button against `useThemeMode()` / `toggleTheme()` from
// `_core/theme`, kept visually consistent with the rest of the
// app bar's `dv-icon-btn` siblings.
function ThemeButton() {
  const tr = useShellT();
  const mode = useThemeMode();
  const isDark = mode === "dark";
  const title = isDark ? tr("shell.chrome.themeToLight") : tr("shell.chrome.themeToDark");
  return React.createElement("button", {
    type: "button",
    className: "dv-icon-btn",
    title,
    "aria-label": title,
    onClick: () => toggleTheme(),
    dangerouslySetInnerHTML: { __html: isDark ? SUN_SVG : MOON_SVG },
  });
}

// Language toggle for the SPA topbar. Mirrors ThemeButton — the inline
// IIFE in index.html only wires static-page buttons at load time, so the
// React-rendered topbar carries its own button against useLang() / setLang()
// from _core/i18n, styled to match the dv-icon-btn siblings (text label
// instead of a glyph). Two-state EN | FR for now.
function LangButton() {
  const lang = useLang();
  const next = lang === "fr" ? "en" : "fr";
  const title = lang === "fr" ? "Passer en anglais" : "Switch to French";
  return React.createElement(
    "button",
    {
      type: "button",
      className: "dv-icon-btn",
      title,
      "aria-label": title,
      onClick: () => setLang(next),
      style: { fontWeight: 700, fontSize: 11, letterSpacing: 0.5 },
    },
    next.toUpperCase()
  );
}

// Rune + wordmark, linking home.
function BrandLink() {
  const tr = useShellT();
  return (
    <a
      href="#/"
      className="dv-brand"
      aria-label={tr("shell.chrome.homeAria")}
      onClick={(e) => {
        e.preventDefault();
        navigate(null);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        color: "var(--text)",
      }}
    >
      <span style={{ color: "var(--brand-rune)", display: "inline-flex", flex: "0 0 auto" }}>
        <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M 13 6.5 L 13 25.5" />
            <path d="M 13 6.5 L 22 11.5" />
            <path d="M 13 13 L 22 18" />
          </g>
        </svg>
      </span>
      <span
        className="dv-brand-word"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}
      >
        Plöttr
      </span>
    </a>
  );
}

const CATEGORY_ORDER: ToolCategory[] = ["compare", "trends", "sets", "bench"];
const CATEGORY_LABEL: Record<ToolCategory, ShellKey> = {
  compare: "shell.chrome.cat.compare",
  trends: "shell.chrome.cat.trends",
  sets: "shell.chrome.cat.sets",
  bench: "shell.chrome.cat.bench",
};

function ToolGlyph({ entry, size }: { entry: ToolEntry; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="dv-tool-glyph"
      style={{ width: size, height: size, flex: "0 0 auto", color: TOOL_ACCENT[entry.key] }}
      dangerouslySetInnerHTML={{ __html: tintIcon(entry.iconSvg, entry.key) }}
    />
  );
}

// Menu button naming the current tool; opens every tool grouped by the
// question it answers. Escape or an outside click closes it, and focus
// returns to the button; Up / Down move between items.
export function ToolSwitcher({ current }: { current: ToolEntry }) {
  const tr = useShellT();
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const active = menuRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    (active || (items && items[0]))?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close(e.key === "Escape");
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        className="dv-icon-btn dv-switcher-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title={tr("shell.chrome.switchTool")}
        onClick={() => setOpen((x) => !x)}
        style={{ padding: "0 10px 0 8px", fontWeight: 600, fontSize: 14, color: "var(--text)" }}
      >
        <ToolGlyph entry={current} size={20} />
        {current.label}
        <span style={{ color: "var(--text-faint)", display: "inline-flex" }}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={tr("shell.chrome.switchTool")}
          className="dv-switcher-menu"
          onKeyDown={onMenuKey}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 40,
            minWidth: 260,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: 6,
          }}
        >
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} data-category={cat} role="group" aria-label={tr(CATEGORY_LABEL[cat])}>
              <div
                className="dv-tile-title"
                aria-hidden="true"
                style={{ padding: "10px 10px 4px" }}
              >
                {tr(CATEGORY_LABEL[cat])}
              </div>
              {TOOL_REGISTRY.filter((t) => t.category === cat).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-tool={t.key}
                  aria-current={t.key === current.key ? "page" : undefined}
                  className="dv-switcher-item"
                  onClick={() => {
                    close(false);
                    navigate(t.key);
                  }}
                >
                  <ToolGlyph entry={t} size={18} />
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppUtilities({ currentKey }: { currentKey: string }) {
  return (
    <div className="dv-appbar-utils" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <ThemeButton />
      <LangButton />
      <FeedbackButton currentKey={currentKey} />
    </div>
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
  const tr = useShellT();
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
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          padding: 24,
          textAlign: "center",
        },
      },
      React.createElement(
        "div",
        { style: { color: "var(--text-muted)" } },
        tr("shell.chunk.slow", { label })
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "dv-btn dv-btn-primary",
          onClick: () => window.location.reload(),
        },
        tr("shell.chunk.reload")
      ),
      React.createElement(
        "div",
        { style: { color: "var(--text-faint)", fontSize: 11 } },
        tr("shell.chunk.persist")
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
        fontFamily: "var(--font-mono)",
        fontSize: 13,
      },
    },
    React.createElement("div", { className: "dv-chunk-spinner", "aria-hidden": "true" }),
    React.createElement("div", null, tr("shell.chunk.loading", { label }))
  );
}

// Placeholder landing view. Normally never rendered — `index.html`'s
// static landing markup is hidden / shown via the `data-spa-route`
// attribute, so this component only appears if that CSS hide-rule
// fails (e.g. a `?theme=` redirect to a tool route that wasn't
// recognised).
function LandingPlaceholder() {
  const tr = useShellT();
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
    React.createElement("h2", { style: { margin: "0 0 12px", color: "var(--text)" } }, "Plöttr"),
    React.createElement(
      "p",
      { style: { color: "var(--text-muted)", margin: "0 0 16px" } },
      tr("shell.landing.lead")
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

// One chrome value per tool, so each kept-alive tool's switcher names
// itself. Memoised by key: the nodes are stable across App re-renders.
const chromeCache = new Map<string, AppChrome>();
function chromeFor(t: ToolEntry): AppChrome {
  let c = chromeCache.get(t.key);
  if (!c) {
    c = {
      brand: <BrandLink />,
      switcher: <ToolSwitcher current={t} />,
      utilities: <AppUtilities currentKey={t.key} />,
    };
    chromeCache.set(t.key, c);
  }
  return c;
}

// The page's `<main>` landmark. Plot tools carry their own (the body under
// their app bar, in PlotToolShell); the calculators get it here.
function ToolMain({ bench, children }: { bench: boolean; children: React.ReactNode }) {
  return bench ? <main>{children}</main> : <>{children}</>;
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
  const mountedTools = TOOL_REGISTRY.filter((t) => visitedKeys.has(t.key)).map((t) => (
    <div key={t.key} style={{ display: entry && entry.key === t.key ? "block" : "none" }}>
      <AppChromeContext.Provider value={chromeFor(t)}>
        {/* Plot tools draw the bar in PlotToolShell (with their steps and
            exports); the calculators have no steps, so the bar goes here. */}
        {t.category === "bench" && <AppBar />}
        <ToolMain bench={t.category === "bench"}>
          <ErrorBoundary toolName={t.label}>
            <React.Suspense fallback={<ChunkLoadingFallback label={t.label} />}>
              <t.Component />
            </React.Suspense>
          </ErrorBoundary>
        </ToolMain>
      </AppChromeContext.Provider>
    </div>
  ));

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

  return React.createElement("div", null, ...mountedTools);
}

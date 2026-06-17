// tools/_app/App.tsx — top-level SPA shell.
//
// Reads the current hash route via `useRoute()`, looks up the tool
// component in `TOOL_REGISTRY`, and renders one of:
//   - The landing tile grid (route is null / unknown).
//   - A topbar + the tool's `App` component (route is a known tool).
//
// The topbar carries the back-to-home button, sibling-tool quick-jump
// icons, and the theme toggle. The landing tile grid here is a minimal
// fallback — the real landing markup lives in `index.html` and is
// hidden via CSS whenever the SPA hash route resolves to a tool.

import { useRoute, navigate } from "./Router";
import { TOOL_REGISTRY, findToolEntry } from "./tool-registry";
import { ErrorBoundary } from "../_shell";
import { toggleTheme, useThemeMode } from "../_core/theme";
import { useLang, setLang } from "../_core/i18n";
import { useShellT } from "../_shell/i18n";
import { TOOL_ACCENT, tintIcon } from "../_core/icons";
// Inline SVG icons reused across the SPA shell. Visual identity mirrors
// the landing markup in `index.html`.
const HOME_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10 L10 3 L17 10"/><path d="M5 9 V17 H15 V9"/></svg>';
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

// Tiny helper for inline-SVG icon buttons. The `tb-icon-btn` class is
// declared in `index.html`'s top-level style block.
function IconButton({
  title,
  svg,
  onClick,
  extraAttrs,
  color,
}: {
  title: string;
  svg: string;
  onClick?: () => void;
  extraAttrs?: Record<string, string>;
  // When set, tints the (currentColor) glyph to this tool's accent so the
  // topbar quick-jumps carry the same per-tool colour as the landing tiles.
  // Inline style outranks `.tb-icon-btn:hover`, so the colour also holds on
  // hover (only the border/background change).
  color?: string;
}) {
  return React.createElement("button", {
    type: "button",
    className: "tb-icon-btn",
    title,
    "aria-label": title,
    onClick,
    ...(color ? { style: { color } } : {}),
    dangerouslySetInnerHTML: { __html: svg },
    ...(extraAttrs || {}),
  });
}

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
  // Escape-to-close, matching the rest of the shell's keyboard affordances.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
      className: "tb-icon-btn",
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
// topbar's `tb-icon-btn` siblings.
function ThemeButton() {
  const tr = useShellT();
  const mode = useThemeMode();
  const isDark = mode === "dark";
  const title = isDark ? tr("shell.chrome.themeToLight") : tr("shell.chrome.themeToDark");
  return React.createElement("button", {
    type: "button",
    className: "tb-icon-btn",
    title,
    "aria-label": title,
    onClick: () => toggleTheme(),
    dangerouslySetInnerHTML: { __html: isDark ? SUN_SVG : MOON_SVG },
  });
}

// Language toggle for the SPA topbar. Mirrors ThemeButton — the inline
// IIFE in index.html only wires static-page buttons at load time, so the
// React-rendered topbar carries its own button against useLang() / setLang()
// from _core/i18n, styled to match the tb-icon-btn siblings (text label
// instead of a glyph). Two-state EN | FR for now.
function LangButton() {
  const lang = useLang();
  const next = lang === "fr" ? "en" : "fr";
  const title = lang === "fr" ? "Passer en anglais" : "Switch to French";
  return React.createElement(
    "button",
    {
      type: "button",
      className: "tb-icon-btn",
      title,
      "aria-label": title,
      onClick: () => setLang(next),
      style: { fontWeight: 700, fontSize: 11, letterSpacing: 0.5 },
    },
    next.toUpperCase()
  );
}

// Topbar rendered above an active tool. Theme toggle + language toggle +
// home button + sibling-tool quick-jump icons.
function ToolTopbar({ currentKey }: { currentKey: string }) {
  const tr = useShellT();
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
    React.createElement(LangButton),
    React.createElement("div", { className: "tb-sep" }),
    IconButton({
      title: tr("shell.chrome.home"),
      svg: HOME_SVG,
      onClick: () => navigate(null),
      // `data-back` + `data-tool` are read by the @media (max-width: 900px)
      // rule in index.html that strips the topbar to "just the two
      // calculators + theme toggle" on phones (plot tools want a wider
      // canvas than mobile gives them, so a user mid-calculator
      // shouldn't be invited into one). Don't drop these attributes —
      // the CSS selector silently matches nothing without them.
      extraAttrs: { "data-back": "true" },
    }),
    React.createElement("div", { className: "tb-sep" }),
    ...others.map((t) =>
      React.createElement(IconButton, {
        key: t.key,
        title: t.label,
        svg: tintIcon(t.iconSvg, t.key),
        color: TOOL_ACCENT[t.key],
        onClick: () => navigate(t.key),
        extraAttrs: { "data-tool": t.key },
      })
    ),
    // "Send feedback" sits on the right edge of the topbar, separated
    // from the tool quick-jumps by a `tb-sep` so it reads as chrome
    // (like the Home / theme buttons on the left) rather than another
    // tool affordance. `margin-left: auto` on the separator pushes the
    // whole right-cluster to the trailing edge of the flex row.
    React.createElement("div", {
      key: "feedback-sep",
      className: "tb-sep",
      style: { marginLeft: "auto" },
    }),
    React.createElement(FeedbackButton, { key: "feedback", currentKey })
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
          fontFamily: "monospace",
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
        fontFamily: "monospace",
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

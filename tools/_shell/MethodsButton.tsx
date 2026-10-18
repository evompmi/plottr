// "Methods" button for a stats panel header: opens a read-only popover with
// a methods-section paragraph describing the analysis (built on demand by
// `getText`, see methods-text.ts) and a Copy button. Closes on Escape, on the
// close button, or on a click outside. The wrapper is a flex box so the button
// stretches to the height of the header row it sits in (matching TXT / R).

import { useShellT } from "./i18n";

const { useEffect, useRef, useState } = React;

interface MethodsButtonProps {
  getText: () => string;
}

function copyText(text: string, fallbackEl: HTMLElement | null): Promise<boolean> {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    return nav.clipboard.writeText(text).then(
      () => true,
      () => false
    );
  }
  // Older browsers: select the paragraph so the user can copy it by hand.
  if (fallbackEl && typeof window !== "undefined" && window.getSelection) {
    const range = document.createRange();
    range.selectNodeContents(fallbackEl);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  return Promise.resolve(false);
}

export function MethodsButton({ getText }: MethodsButtonProps) {
  const tr = useShellT();
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  // Fixed-position anchor under the button: stats panels clip overflow, so
  // the popover lives in viewport coordinates and follows scroll / resize.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const open = text != null;

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      setAnchor({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setText(null);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setText(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <div ref={rootRef} style={{ display: "flex" }}>
      <button
        ref={btnRef}
        type="button"
        className="dv-btn dv-btn-secondary"
        title={tr("shell.methods.buttonTitle")}
        aria-expanded={open}
        data-testid="methods-button"
        onClick={(e) => {
          e.stopPropagation();
          setCopied(false);
          setText(open ? null : getText());
        }}
      >
        {"📝 " + tr("shell.methods.button")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={tr("shell.methods.title")}
          data-testid="methods-popover"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: anchor ? anchor.top : 0,
            right: anchor ? anchor.right : 8,
            zIndex: 40,
            width: 520,
            maxWidth: "80vw",
            maxHeight: "70vh",
            overflowY: "auto",
            padding: "12px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            boxShadow: "var(--shadow-lg)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: 13, color: "var(--text)" }}>
              {tr("shell.methods.title")}
            </strong>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="dv-btn dv-btn-primary"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => {
                  copyText(text || "", textRef.current).then((ok) => setCopied(ok));
                }}
              >
                {copied ? tr("shell.methods.copied") : tr("shell.methods.copy")}
              </button>
              <button
                type="button"
                className="dv-btn dv-btn-secondary"
                style={{ padding: "4px 10px", fontSize: 12 }}
                aria-label={tr("shell.methods.close")}
                onClick={() => setText(null)}
              >
                ✕
              </button>
            </div>
          </div>
          <p
            ref={textRef}
            data-testid="methods-text"
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--text)",
              userSelect: "text",
              whiteSpace: "pre-wrap",
            }}
          >
            {text}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--text-faint)" }}>
            {tr("shell.methods.note")}
          </p>
        </div>
      )}
    </div>
  );
}

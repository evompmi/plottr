// "Methods" button for a stats panel header: opens a read-only popover with
// a methods-section paragraph describing the analysis (built on demand by
// `getText`, see methods-text.ts) and a Copy button. The popover opens below the
// button, or above it when the button sits near the bottom of the window, and
// always stays inside the window. Closes on Escape, on the close button, or on a
// click outside. The wrapper is a flex box so the button
// stretches to the height of the header row it sits in (matching TXT / R).

import { useShellT } from "./i18n";

const { useEffect, useLayoutEffect, useRef, useState } = React;

interface MethodsButtonProps {
  getText: () => string;
}

export interface PopoverRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PopoverPlacement {
  top: number;
  left: number;
}

const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;

// Viewport position for a popover of `width` × `height` anchored to the
// button `btn`: below the button when it fits, else above it, else pinned to
// the bottom edge of the window (the popover is capped at 70vh, so it fits);
// right-aligned with the button and pushed back inside the window horizontally.
export function placeMethodsPopover(
  btn: PopoverRect,
  width: number,
  height: number,
  viewportW: number,
  viewportH: number
): PopoverPlacement {
  const below = btn.bottom + POPOVER_GAP;
  const above = btn.top - POPOVER_GAP - height;
  const bottomLimit = viewportH - VIEWPORT_MARGIN;
  let top: number;
  if (below + height <= bottomLimit) top = below;
  else if (above >= VIEWPORT_MARGIN && above + height <= bottomLimit) top = above;
  else top = bottomLimit - height;
  top = Math.max(VIEWPORT_MARGIN, top);
  const maxLeft = viewportW - VIEWPORT_MARGIN - width;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(btn.right - width, maxLeft));
  return { top, left };
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
  const popRef = useRef<HTMLDivElement>(null);
  // Fixed-position placement next to the button: stats panels clip overflow,
  // so the popover lives in viewport coordinates and follows scroll / resize.
  // Placed before paint (layout effect) once its size is known; hidden until then.
  const [anchor, setAnchor] = useState<PopoverPlacement | null>(null);
  const open = text != null;

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return undefined;
    }
    const place = () => {
      const b = btnRef.current;
      const pop = popRef.current;
      if (!b || !pop) return;
      setAnchor(
        placeMethodsPopover(
          b.getBoundingClientRect(),
          pop.offsetWidth,
          pop.offsetHeight,
          window.innerWidth,
          window.innerHeight
        )
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, text]);

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
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: anchor ? anchor.top : 0,
            left: anchor ? anchor.left : 0,
            visibility: anchor ? "visible" : "hidden",
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

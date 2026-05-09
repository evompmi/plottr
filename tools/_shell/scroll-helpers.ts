// `scrollIntoViewWithinAncestor` + `scrollDisclosureIntoView` — scroll-
// affordance helpers used by ControlSection / collapsible disclosures
// across plot tools. Picks one scrollable ancestor (typically a sticky
// sidebar with its own overflow-y) and only moves that one — does NOT
// use Element.scrollIntoView() because that bubbles up and scrolls
// every scrollable ancestor including the page.

export function scrollIntoViewWithinAncestor(
  el: Element | null,
  pad?: number,
  extraBottom?: number
): void {
  if (!el) return;
  const padding = pad == null ? 8 : pad;
  const extra = extraBottom || 0;
  let parent: Element | null = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const ov = style.overflowY;
    if ((ov === "auto" || ov === "scroll") && parent.scrollHeight > parent.clientHeight) {
      const parentRect = parent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const revealBottom = elRect.bottom + extra;
      if (revealBottom > parentRect.bottom - padding) {
        const delta = revealBottom - parentRect.bottom + padding;
        const maxDelta = elRect.top - parentRect.top - padding;
        parent.scrollBy({ top: Math.min(delta, Math.max(0, maxDelta)), behavior: "smooth" });
      } else if (elRect.top < parentRect.top + padding) {
        parent.scrollBy({ top: elRect.top - parentRect.top - padding, behavior: "smooth" });
      }
      return;
    }
    parent = parent.parentElement;
  }
  // No scrollable ancestor — the page itself is what scrolls (heatmap case).
  const elRect = el.getBoundingClientRect();
  const viewportBottom = window.innerHeight;
  const revealBottom = elRect.bottom + extra;
  if (revealBottom > viewportBottom - padding) {
    const delta = revealBottom - viewportBottom + padding;
    const maxDelta = Math.max(0, elRect.top - padding);
    window.scrollBy({ top: Math.min(delta, maxDelta), behavior: "smooth" });
  } else if (elRect.top < padding) {
    window.scrollBy({ top: elRect.top - padding, behavior: "smooth" });
  }
}

// `scrollDisclosureIntoView` — disclosure-specific wrapper. Measures
// where the next section's header sits relative to the expanded section,
// and reveals its bottom edge plus ~14 px of clearance below so the
// next header lands comfortably inside the viewport instead of flush at
// the bottom edge.
const DISCLOSURE_TRAILING_CLEARANCE = 40;
export function scrollDisclosureIntoView(el: Element | null, pad?: number): void {
  if (!el) return;
  const next = el.nextElementSibling;
  const nextHeader = next && next.firstElementChild;
  let extra = 0;
  if (nextHeader) {
    const elRect = el.getBoundingClientRect();
    const nhRect = nextHeader.getBoundingClientRect();
    extra = Math.max(0, nhRect.bottom + DISCLOSURE_TRAILING_CLEARANCE - elRect.bottom);
  }
  scrollIntoViewWithinAncestor(el, pad == null ? 8 : pad, extra);
}

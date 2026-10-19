// One-shot inter-tool data hand-off. A source tool (e.g. RLU timecourse's
// Σ barplot tile) writes a small payload into sessionStorage under a single
// fixed key, then navigates this same tab to the destination tool
// (`navigateToTool`). The destination reads-and-clears the payload addressed
// to it and skips its regular upload step.
//
// Why sessionStorage and not postMessage / URL fragments / localStorage:
//   • postMessage needs both pages alive at once; the source view is gone
//     (or hidden) by the time the destination mounts.
//   • URL fragments hit the ~2 KB browser limit on payloads and leak
//     data into history / referers.
//   • localStorage is shared by every tab, so an already-open copy of the
//     destination in another tab could consume the payload first.
//     sessionStorage is per tab and survives the same-tab page load of the
//     standalone fallback.
// The target clears the payload on read, and anything older than
// HANDOFF_TTL_MS is discarded by whichever receiver sees it next.
//
// A receiver whose tool doesn't match leaves the payload alone. Every
// mounted receiver reacts to every write (same-tab `plottr-handoff` event),
// so a source tool that is itself a receiver — Group Plot sending its
// composition pies to Proportions — would otherwise delete its own outgoing
// payload before the target mounts.
//
// Destination tools receive with `useHandoff(tool, apply)` (useHandoff.ts).
// Payload shape is intentionally loose — each consumer decides how to
// parse the `csv` string and react to `source`. Conventional fields are
// listed in the HandoffPayload interface; tool-specific fields (Venn →
// UpSet's `text` / `sep` / `format`) ride on its index signature and are
// type-checked by the consumer at runtime.

export interface HandoffPayload {
  // Routing key — required. Destination tool's `consumeHandoff(targetTool)`
  // call only returns a payload whose `tool` matches.
  tool: string;
  // Long- or wide-format CSV/TSV the destination should parse.
  csv?: string;
  // Hint for the destination's parse path; optional.
  mode?: "long" | "wide";
  // Human-readable origin string; surfaced in banners / breadcrumbs.
  source?: string;
  // Suggested filename for download chrome on the destination.
  fileName?: string;
  // Suggested y-axis label for the destination tool's plot view, used
  // when the auto-derived label (typically the value column's name)
  // is an implementation detail rather than the standard scientific
  // term. Aequorin sends "A.U.C." when handing off Σ-of-luminescence
  // data so the boxplot reads as area-under-curve, not "Raw Sum".
  // Consumers should treat a present value as authoritative — apply
  // it after their own auto-sync logic so it isn't immediately
  // clobbered. Optional; the destination's own auto-derivation runs
  // when this is absent.
  yLabel?: string;
  // Pre-assigned column-role hints; optional.
  colRoles?: string[];
  // Tool-specific consumers extend with their own fields (e.g. upset's
  // intersection-payload variant) via a structural-typing widening.
  [key: string]: unknown;
}

declare global {
  interface Window {
    __plottrSpaNavigate?: (toolKey: string) => void;
  }
}

const HANDOFF_KEY = "dataviz-handoff";
// Long enough for a lazy tool chunk to load on a slow connection; short
// enough that an unconsumed payload never resurfaces on a later visit.
export const HANDOFF_TTL_MS = 30_000;

export function setHandoff(payload: HandoffPayload): boolean {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...payload, sentAt: Date.now() }));
  } catch (_e) {
    return false;
  }
  // Under the SPA's keep-alive routing the destination may already be
  // mounted, its mount-time read long past. This synchronous event lets it
  // re-run consumeHandoff.
  try {
    window.dispatchEvent(new CustomEvent("plottr-handoff", { detail: { key: HANDOFF_KEY } }));
  } catch (_e) {
    /* swallow */
  }
  return true;
}

export function consumeHandoff(targetTool: string): HandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(HANDOFF_KEY);
  } catch (_e) {
    return null;
  }
  if (!raw) return null;
  const clear = (): void => {
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch (_e) {
      /* swallow */
    }
  };
  let payload: HandoffPayload | null = null;
  try {
    payload = JSON.parse(raw) as HandoffPayload | null;
  } catch (_e) {
    payload = null;
  }
  // Malformed, untargeted or expired payloads can never be delivered.
  const sentAt = payload ? payload.sentAt : undefined;
  if (
    !payload ||
    typeof payload.tool !== "string" ||
    typeof sentAt !== "number" ||
    Date.now() - sentAt > HANDOFF_TTL_MS
  ) {
    clear();
    return null;
  }
  // Someone else's payload: leave it for its target.
  if (payload.tool !== targetTool) return null;
  clear();
  return payload;
}

// SPA-aware tool navigation. Source tools (e.g. RLU timecourse →
// Group Plot) call this after `setHandoff(...)` to switch the visible
// view. Two paths:
//   1. SPA mode (the production deploy): `window.__plottrSpaNavigate` is
//      registered by `tools/_app/index.tsx` on boot. Calling it changes
//      `location.hash` and the SPA router re-renders the new tool
//      in-place. The destination tool's mount-time `consumeHandoff()`
//      finds the sessionStorage payload we just wrote and applies it.
//   2. Standalone-page fallback: `__plottrSpaNavigate` is undefined,
//      so we fall back to a top-level navigation to `<key>.html`. The
//      destination tool boots fresh and its mount-time `consumeHandoff()`
//      does the same.
// Call sites stay shell-agnostic — they just call
// `setHandoff(payload); navigateToTool(payload.tool);`.
export function navigateToTool(toolKey: string): void {
  if (typeof toolKey !== "string" || toolKey === "") return;
  const spaNav = window.__plottrSpaNavigate;
  if (typeof spaNav === "function") {
    try {
      spaNav(toolKey);
      return;
    } catch (_e) {
      // Fall through to standalone-page navigation if the SPA path errors.
    }
  }
  try {
    window.location.assign(toolKey + ".html");
  } catch (_e) {
    /* swallow */
  }
}

// One-shot inter-tool data hand-off. A source tool (e.g. RLU timecourse's
// Σ barplot tile) writes a small payload into localStorage under a single
// fixed key, then top-level-navigates the browser to the destination
// tool. The destination tool's App() reads-and-clears the payload on
// mount; if it matches the expected target tool, the payload is consumed
// instead of running through the regular upload step.
//
// Why localStorage and not postMessage / URL fragments:
//   • postMessage requires both pages to be alive simultaneously plus a
//     coordinator iframe; tool navigation hops the top-level frame, so
//     the source page is gone by the time the destination mounts.
//   • URL fragments hit the ~2 KB browser limit on payloads and leak
//     data into history / referers.
//   • localStorage is per-origin, synchronous, and the payload lives only
//     for the milliseconds between A's setHandoff and B's consumeHandoff
//     because consume always clears first (even if parsing later fails).
//
// Payload shape is intentionally loose — each consumer decides how to
// parse the `csv` string and react to `source`. Conventional fields
// listed in the HandoffPayload interface; tool-specific extensions
// (e.g. `tools/upset/helpers.ts` → `UpsetHandoffPayload`) extend it.

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

const KEY = "dataviz-handoff";

export function setHandoff(payload: HandoffPayload): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (_e) {
    return false;
  }
  // Notify same-tab consumers. The browser `storage` event only fires
  // across tabs / iframes, so under the SPA's keep-alive routing (target
  // tool already mounted) it never reaches the consumer. Dispatching a
  // synchronous CustomEvent gives the already-mounted destination a
  // chance to re-run consumeHandoff.
  try {
    window.dispatchEvent(new CustomEvent("plottr-handoff", { detail: { key: KEY } }));
  } catch (_e) {
    /* swallow */
  }
  return true;
}

export function consumeHandoff(targetTool: string): HandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (_e) {
    return null;
  }
  if (!raw) return null;
  // Always remove first — even if parsing or routing later fails, we
  // don't want this payload to resurrect on the next mount.
  try {
    localStorage.removeItem(KEY);
  } catch (_e) {
    /* swallow */
  }
  try {
    const payload = JSON.parse(raw) as HandoffPayload | null;
    if (!payload || payload.tool !== targetTool) return null;
    return payload;
  } catch (_e) {
    return null;
  }
}

// SPA-aware tool navigation. Source tools (e.g. RLU timecourse →
// Group Plot) call this after `setHandoff(...)` to switch the visible
// view. Two paths:
//   1. SPA mode (the production deploy): `window.__plottrSpaNavigate` is
//      registered by `tools/_app/index.tsx` on boot. Calling it changes
//      `location.hash` and the SPA router re-renders the new tool
//      in-place. The destination tool's mount-time `consumeHandoff()`
//      finds the localStorage payload we just wrote and applies it.
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

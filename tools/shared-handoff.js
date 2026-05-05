// One-shot inter-tool data hand-off. A source tool (e.g. RLU timecourse's
// Σ barplot tile) writes a small payload into localStorage under a single
// fixed key, then top-level-navigates the browser to the destination
// tool's HTML page. The destination tool's App() reads-and-clears the
// payload on mount; if it matches the expected target tool, the payload
// is consumed instead of running through the regular upload step.
//
// Why localStorage and not postMessage / URL fragments:
//   • postMessage requires both pages to be alive simultaneously and a
//     coordinator iframe; tools navigate top-level (separate HTML files).
//   • URL fragments hit the ~2 KB browser limit on payloads and leak
//     data into history / referers.
//   • localStorage is per-origin, synchronous, and the payload lives only
//     for the milliseconds between A's setHandoff and B's consumeHandoff
//     because consume always clears first (even if parsing later fails).
//
// Payload shape is intentionally loose — each consumer decides how to
// parse the `csv` string and react to `source`. Conventional fields:
//   { tool: "<targetToolKey>",   // required; routing key
//     csv: "<text>",             // long- or wide-format CSV/TSV
//     mode: "long" | "wide",     // hint, optional
//     source: "<human-readable>",// for banners / breadcrumbs
//     fileName: "<suggested>",   // for download chrome
//     colRoles: [...]            // optional pre-assigned roles
//   }
//
// Stays plain JS (script-scope global) so it ships in shared.bundle.js
// alongside every other shared helper.

(function () {
  var KEY = "dataviz-handoff";

  function setHandoff(payload) {
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  function consumeHandoff(targetTool) {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    // Always remove first — even if parsing or routing later fails, we
    // don't want this payload to ressurect on the next mount.
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* swallow */
    }
    try {
      var payload = JSON.parse(raw);
      if (!payload || payload.tool !== targetTool) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  // SPA-aware tool navigation. Source tools (e.g. RLU timecourse →
  // Group Plot) call this after `setHandoff(...)` to switch the
  // visible view. Two paths:
  //   1. SPA mode: `window.__plottrSpaNavigate` is registered by
  //      `tools/_app/index.tsx` on boot. Calling it changes
  //      `location.hash` and the SPA router re-renders the new tool
  //      in-place. The destination tool's mount-time
  //      `consumeHandoff()` finds the localStorage payload we just
  //      wrote and applies it.
  //   2. Pre-SPA / iframe shell mode: `window.__plottrSpaNavigate`
  //      is undefined, so we fall back to a top-level navigation to
  //      `tools/<key>.html`. The destination tool boots fresh and
  //      its mount-time `consumeHandoff()` does the same.
  // This means call sites can be written shell-agnostically — they
  // just call `setHandoff(payload); navigateToTool(payload.tool);`.
  function navigateToTool(toolKey) {
    if (typeof toolKey !== "string" || toolKey === "") return;
    var spaNav = window.__plottrSpaNavigate;
    if (typeof spaNav === "function") {
      try {
        spaNav(toolKey);
        return;
      } catch (e) {
        // Fall through to legacy navigation if the SPA path errors.
      }
    }
    // Legacy: full top-level navigation. The path stays
    // `tools/<key>.html` in iframe-shell deploys; in SPA-only deploys
    // these files no longer exist (phase 6 of the SPA migration), so
    // navigateToTool is effectively SPA-only there.
    try {
      window.location.assign(toolKey + ".html");
    } catch (e) {
      /* swallow */
    }
  }

  window.setHandoff = setHandoff;
  window.consumeHandoff = consumeHandoff;
  window.navigateToTool = navigateToTool;
})();

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

  window.setHandoff = setHandoff;
  window.consumeHandoff = consumeHandoff;
})();

// tools/_app/Router.tsx — minimal hash router for the SPA shell.
//
// Why hash routing: GitHub Pages serves the static repo as-is; with
// hash routing, every URL reaches the same `index.html` and the SPA
// reads `location.hash` to pick the right view. No `404.html →
// index.html` SPA-fallback dance, no Pages config, and `file://`
// double-click deploys keep working.
//
// API:
//   useRoute()                 → "boxplot" | "scatter" | … | null
//                                (null = landing / home view)
//   navigate("boxplot")        → updates hash, fires re-render
//   getInitialRouteFromHash()  → side-effect-free hash parser
//
// Implementation: `useSyncExternalStore` over `window.location.hash`
// so the router stays trivially correct under concurrent React 18.
// `react-router-dom` is overkill for 10 fixed routes and would
// violate the project's "no runtime deps from external CDNs" stance.

const { useSyncExternalStore } = React;

// Strip the "#/" prefix and any query / sub-path. `#/` and `#` and
// "" all map to null (landing). `#/boxplot?file=demo` maps to
// "boxplot" (the query is ignored at this layer; deep-linking with
// query params is a future-work knob).
export function getInitialRouteFromHash(): string | null {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  if (!hash || hash === "#" || hash === "#/") return null;
  // Permit `#boxplot` and `#/boxplot` interchangeably.
  const stripped = hash.replace(/^#\/?/, "");
  // Cut off a `?query` or `/sub` component so the route key is clean.
  const key = stripped.split(/[/?]/)[0];
  return key || null;
}

// Subscriber for `useSyncExternalStore`. Listens on the standard
// `hashchange` event and on `popstate` (forward / back nav also
// updates the hash on every browser).
function subscribeToHashChange(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function getRouteSnapshot(): string | null {
  return getInitialRouteFromHash();
}

// SSR-safe: when there is no `window` yet, default to the landing view.
function getRouteServerSnapshot(): string | null {
  return null;
}

export function useRoute(): string | null {
  return useSyncExternalStore(subscribeToHashChange, getRouteSnapshot, getRouteServerSnapshot);
}

// Programmatic navigation. Setting `location.hash` triggers
// `hashchange`, which `useRoute()` already listens for, so callers
// don't have to do anything more.
export function navigate(routeKey: string | null): void {
  if (routeKey == null || routeKey === "") {
    // Use `pushState` instead of `location.hash = ""` because the
    // latter leaves a literal `#` in the URL. `pushState` lets us
    // clear the hash entirely without a reload.
    window.history.pushState(null, "", window.location.pathname + window.location.search);
    // pushState does NOT emit `hashchange`, so we synthesise one so
    // any subscribers re-render.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  // Setting location.hash naturally fires hashchange.
  window.location.hash = `#/${routeKey}`;
}

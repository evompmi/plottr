// Stats-panel state reducer + initial shape. Extracted from stats-panel.tsx
// so the reducer can be unit-tested without loading the React-heavy panel
// component. This module has zero runtime dependencies — pure data shape
// with a single switch. stats-panel.tsx re-exports from here so existing
// consumers of the `statsReducer` / `statsInit` names keep working.
//
// Shape invariant: each of the three display modes (flat, facet, subgroup)
// owns its own annotation + summary slots so nothing leaks across modes.
// `clearFacetState` / `clearSubgroupState` wipe the keyed dicts when the
// user exits facet or subgroup mode — otherwise stale category entries
// accumulate across long sessions (the dict grows without bound; harmless
// visually because downstream lookups key by current category, but a real
// memory leak and a latent confounder if someone queries the dicts without
// the current-category filter).

export const statsInit = {
  displayMode: "none" as "none" | "cld" | "brackets",
  showNs: false,
  showSummary: false,
  flatSummary: null as string | null,
  flatAnnotation: null as unknown,
  facetAnnotations: {} as Record<string, unknown>,
  facetSummaries: {} as Record<string, string | null>,
  subgroupSummaries: {} as Record<string, string | null>,
  subgroupAnnotSpecs: {} as Record<string, unknown>,
};

export function statsReducer(state: typeof statsInit, a: any): typeof statsInit {
  switch (a.type) {
    case "reset":
      return statsInit;
    case "setDisplayMode":
      if (a.value === "none") {
        return {
          ...state,
          displayMode: "none",
          flatAnnotation: null,
          facetAnnotations: {},
          subgroupAnnotSpecs: {},
        };
      }
      return { ...state, displayMode: a.value };
    case "setShowNs":
      return { ...state, showNs: a.value };
    case "setShowSummary":
      if (!a.value) {
        return {
          ...state,
          showSummary: false,
          flatSummary: null,
          facetSummaries: {},
          subgroupSummaries: {},
        };
      }
      return { ...state, showSummary: true };
    case "setFlatSummary":
      return { ...state, flatSummary: a.value };
    case "setFlatAnnotation":
      return { ...state, flatAnnotation: a.value };
    case "clearFacetState":
      if (
        Object.keys(state.facetAnnotations).length === 0 &&
        Object.keys(state.facetSummaries).length === 0
      ) {
        return state;
      }
      return { ...state, facetAnnotations: {}, facetSummaries: {} };
    case "clearSubgroupState":
      if (
        Object.keys(state.subgroupAnnotSpecs).length === 0 &&
        Object.keys(state.subgroupSummaries).length === 0
      ) {
        return state;
      }
      return { ...state, subgroupAnnotSpecs: {}, subgroupSummaries: {} };
    case "setFacetAnnotation":
      if (state.facetAnnotations[a.key] === a.value) return state;
      return { ...state, facetAnnotations: { ...state.facetAnnotations, [a.key]: a.value } };
    case "setFacetSummary":
      if (state.facetSummaries[a.key] === a.value) return state;
      return { ...state, facetSummaries: { ...state.facetSummaries, [a.key]: a.value } };
    case "setSubgroupAnnotSpec":
      if (state.subgroupAnnotSpecs[a.key] === a.value) return state;
      return { ...state, subgroupAnnotSpecs: { ...state.subgroupAnnotSpecs, [a.key]: a.value } };
    case "setSubgroupSummary":
      if (state.subgroupSummaries[a.key] === a.value) return state;
      return { ...state, subgroupSummaries: { ...state.subgroupSummaries, [a.key]: a.value } };
    default:
      return state;
  }
}

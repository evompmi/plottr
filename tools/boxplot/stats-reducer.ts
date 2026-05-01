// Stats-panel state reducer + initial shape. Extracted from stats-panel.tsx
// so the reducer can be unit-tested without loading the React-heavy panel
// component. This module has zero runtime dependencies — pure data shape
// with a single switch. stats-panel.tsx re-exports from here so existing
// consumers of the `statsReducer` / `statsInit` names keep working.
//
// Shape invariant: a single composite-key store covers every plot mode —
// flat / facet only / subgroup only / facet × subgroup. App composes the
// key (e.g. `${facet}::${subgroup}`) and the reducer just stamps values
// into the dict. `clearCells` wipes both dicts when the active facet or
// subgroup column changes — otherwise stale category entries accumulate
// across long sessions (dict grows without bound; harmless visually because
// downstream lookups key by current category, but a real memory leak).

export const statsInit = {
  displayMode: "none" as "none" | "cld" | "brackets",
  showNs: false,
  showSummary: false,
  cellAnnotations: {} as Record<string, unknown>,
  cellSummaries: {} as Record<string, string | null>,
};

export function statsReducer(state: typeof statsInit, a: any): typeof statsInit {
  switch (a.type) {
    case "reset":
      return statsInit;
    case "setDisplayMode":
      if (a.value === "none") {
        if (state.displayMode === "none" && Object.keys(state.cellAnnotations).length === 0) {
          return state;
        }
        return { ...state, displayMode: "none", cellAnnotations: {} };
      }
      if (state.displayMode === a.value) return state;
      return { ...state, displayMode: a.value };
    case "setShowNs":
      if (state.showNs === a.value) return state;
      return { ...state, showNs: a.value };
    case "setShowSummary":
      if (!a.value) {
        if (!state.showSummary && Object.keys(state.cellSummaries).length === 0) {
          return state;
        }
        return { ...state, showSummary: false, cellSummaries: {} };
      }
      if (state.showSummary) return state;
      return { ...state, showSummary: true };
    case "clearCells":
      if (
        Object.keys(state.cellAnnotations).length === 0 &&
        Object.keys(state.cellSummaries).length === 0
      ) {
        return state;
      }
      return { ...state, cellAnnotations: {}, cellSummaries: {} };
    case "setCellAnnotation":
      if (state.cellAnnotations[a.key] === a.value) return state;
      return { ...state, cellAnnotations: { ...state.cellAnnotations, [a.key]: a.value } };
    case "setCellSummary":
      if (state.cellSummaries[a.key] === a.value) return state;
      return { ...state, cellSummaries: { ...state.cellSummaries, [a.key]: a.value } };
    default:
      return state;
  }
}

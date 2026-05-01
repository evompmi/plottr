// Unit tests for the boxplot stats-panel reducer. The reducer lives in
// tools/boxplot/stats-reducer.ts (re-exported from stats-panel.tsx for
// backward compat) so it can be tested without pulling the React-heavy
// panel component into the vm context.

const { suite, test, assert, eq, summary } = require("./harness");
const { statsInit, statsReducer } = require("./helpers/boxplot-stats-reducer-loader");

suite("statsReducer — initial shape");

test("init shape has the expected keys and defaults", () => {
  eq(statsInit.displayMode, "none");
  eq(statsInit.showNs, false);
  eq(statsInit.showSummary, false);
  eq(Object.keys(statsInit.cellAnnotations).length, 0);
  eq(Object.keys(statsInit.cellSummaries).length, 0);
});

test("reset returns a fresh init", () => {
  const s = statsReducer(statsInit, { type: "setShowNs", value: true });
  const r = statsReducer(s, { type: "reset" });
  eq(r.showNs, false);
});

suite("statsReducer — setDisplayMode");

test("setting displayMode to 'none' clears every cell annotation", () => {
  const populated = {
    ...statsInit,
    displayMode: "brackets",
    cellAnnotations: {
      flat: { bracket: 1 },
      "setosa::": { bracket: 2 },
      "::A|x": { spec: true },
      "setosa::A|x": { combined: true },
    },
  };
  const next = statsReducer(populated, { type: "setDisplayMode", value: "none" });
  eq(next.displayMode, "none");
  eq(Object.keys(next.cellAnnotations).length, 0);
});

test("switching to a non-none displayMode preserves annotations", () => {
  const withCells = {
    ...statsInit,
    cellAnnotations: { "setosa::": { bracket: 2 } },
  };
  const next = statsReducer(withCells, { type: "setDisplayMode", value: "brackets" });
  eq(next.displayMode, "brackets");
  eq(next.cellAnnotations["setosa::"].bracket, 2);
});

suite("statsReducer — clearCells");

test("clearCells wipes both annotation + summary dicts", () => {
  const populated = {
    ...statsInit,
    cellAnnotations: { "setosa::A": { bracket: 1 }, "setosa::B": { bracket: 2 } },
    cellSummaries: { "setosa::A": "n=10", "setosa::B": "n=20" },
  };
  const next = statsReducer(populated, { type: "clearCells" });
  eq(Object.keys(next.cellAnnotations).length, 0);
  eq(Object.keys(next.cellSummaries).length, 0);
});

test("clearCells leaves displayMode / showNs / showSummary untouched", () => {
  const populated = {
    ...statsInit,
    displayMode: "brackets",
    showNs: true,
    showSummary: true,
    cellAnnotations: { x: { spec: 1 } },
  };
  const next = statsReducer(populated, { type: "clearCells" });
  eq(next.displayMode, "brackets");
  eq(next.showNs, true);
  eq(next.showSummary, true);
});

test("clearCells is a no-op when both dicts are already empty (avoids gratuitous re-renders)", () => {
  const next = statsReducer(statsInit, { type: "clearCells" });
  assert(next === statsInit, "should return the exact same object reference");
});

suite("statsReducer — per-key setters");

test("setCellAnnotation stamps a composite key", () => {
  const next = statsReducer(statsInit, {
    type: "setCellAnnotation",
    key: "facetA::sgX",
    value: { kind: "brackets" },
  });
  eq(next.cellAnnotations["facetA::sgX"].kind, "brackets");
});

test("setCellSummary stamps a composite key", () => {
  const next = statsReducer(statsInit, {
    type: "setCellSummary",
    key: "facetA::sgX",
    value: "n=42",
  });
  eq(next.cellSummaries["facetA::sgX"], "n=42");
});

test("setCellAnnotation with the same value returns the same state reference", () => {
  const s1 = statsReducer(statsInit, {
    type: "setCellAnnotation",
    key: "setosa",
    value: null,
  });
  // setosa was already absent (undefined), and the reducer only bails when
  // the stored value === incoming. undefined === null is false, so the
  // first call should create a new state. A second identical call should
  // be the no-op.
  const s2 = statsReducer(s1, {
    type: "setCellAnnotation",
    key: "setosa",
    value: null,
  });
  assert(s1 !== statsInit, "first set allocates");
  assert(s2 === s1, "second identical set is a no-op");
});

test("setShowSummary(false) clears summaries; setShowSummary(true) does not", () => {
  const populated = {
    ...statsInit,
    showSummary: true,
    cellSummaries: { a: "n=1" },
  };
  const off = statsReducer(populated, { type: "setShowSummary", value: false });
  eq(off.showSummary, false);
  eq(Object.keys(off.cellSummaries).length, 0);
  const on = statsReducer(statsInit, { type: "setShowSummary", value: true });
  eq(on.showSummary, true);
});

summary();

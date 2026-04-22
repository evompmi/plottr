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
  eq(statsInit.flatSummary, null);
  eq(statsInit.flatAnnotation, null);
  eq(Object.keys(statsInit.facetAnnotations).length, 0);
  eq(Object.keys(statsInit.facetSummaries).length, 0);
  eq(Object.keys(statsInit.subgroupAnnotSpecs).length, 0);
  eq(Object.keys(statsInit.subgroupSummaries).length, 0);
});

test("reset returns a fresh init", () => {
  const s = statsReducer(statsInit, { type: "setShowNs", value: true });
  const r = statsReducer(s, { type: "reset" });
  eq(r.showNs, false);
});

suite("statsReducer — setDisplayMode");

test("setting displayMode to 'none' clears annotations across all three modes", () => {
  const populated = {
    ...statsInit,
    displayMode: "brackets",
    flatAnnotation: { bracket: 1 },
    facetAnnotations: { setosa: { bracket: 2 } },
    subgroupAnnotSpecs: { "A|x": { spec: true } },
  };
  const next = statsReducer(populated, { type: "setDisplayMode", value: "none" });
  eq(next.displayMode, "none");
  eq(next.flatAnnotation, null);
  eq(Object.keys(next.facetAnnotations).length, 0);
  eq(Object.keys(next.subgroupAnnotSpecs).length, 0);
});

test("switching to a non-none displayMode preserves annotations", () => {
  const withFacet = {
    ...statsInit,
    facetAnnotations: { setosa: { bracket: 2 } },
  };
  const next = statsReducer(withFacet, { type: "setDisplayMode", value: "brackets" });
  eq(next.displayMode, "brackets");
  eq(next.facetAnnotations.setosa.bracket, 2);
});

suite("statsReducer — clearFacetState / clearSubgroupState (audit M5)");

test("clearFacetState wipes facetAnnotations and facetSummaries", () => {
  const populated = {
    ...statsInit,
    facetAnnotations: { setosa: { bracket: 1 }, versicolor: { bracket: 2 } },
    facetSummaries: { setosa: "n=50, W=0.98", versicolor: "n=50, W=0.95" },
  };
  const next = statsReducer(populated, { type: "clearFacetState" });
  eq(Object.keys(next.facetAnnotations).length, 0);
  eq(Object.keys(next.facetSummaries).length, 0);
});

test("clearFacetState leaves flat + subgroup state untouched", () => {
  const populated = {
    ...statsInit,
    flatAnnotation: { bracket: 99 },
    facetAnnotations: { setosa: { bracket: 1 } },
    subgroupAnnotSpecs: { "A|x": { spec: true } },
    subgroupSummaries: { "A|x": "n=10" },
  };
  const next = statsReducer(populated, { type: "clearFacetState" });
  eq(next.flatAnnotation.bracket, 99);
  eq(next.subgroupAnnotSpecs["A|x"].spec, true);
  eq(next.subgroupSummaries["A|x"], "n=10");
});

test("clearFacetState is a no-op when both facet dicts are already empty (avoids gratuitous re-renders)", () => {
  const next = statsReducer(statsInit, { type: "clearFacetState" });
  assert(next === statsInit, "should return the exact same object reference");
});

test("clearSubgroupState wipes subgroupAnnotSpecs and subgroupSummaries", () => {
  const populated = {
    ...statsInit,
    subgroupAnnotSpecs: { "A|x": { spec: 1 }, "B|y": { spec: 2 } },
    subgroupSummaries: { "A|x": "n=10", "B|y": "n=20" },
  };
  const next = statsReducer(populated, { type: "clearSubgroupState" });
  eq(Object.keys(next.subgroupAnnotSpecs).length, 0);
  eq(Object.keys(next.subgroupSummaries).length, 0);
});

test("clearSubgroupState leaves flat + facet state untouched", () => {
  const populated = {
    ...statsInit,
    flatAnnotation: { bracket: 99 },
    facetAnnotations: { setosa: { bracket: 1 } },
    subgroupAnnotSpecs: { "A|x": { spec: true } },
  };
  const next = statsReducer(populated, { type: "clearSubgroupState" });
  eq(next.flatAnnotation.bracket, 99);
  eq(next.facetAnnotations.setosa.bracket, 1);
});

test("clearSubgroupState is a no-op when both subgroup dicts are empty", () => {
  const next = statsReducer(statsInit, { type: "clearSubgroupState" });
  assert(next === statsInit, "should return the exact same object reference");
});

suite("statsReducer — per-key setters preserve identity on no-op");

test("setFacetAnnotation with the same value returns the same state reference", () => {
  const s1 = statsReducer(statsInit, {
    type: "setFacetAnnotation",
    key: "setosa",
    value: null,
  });
  // setosa was already absent (undefined), and the reducer only bails when
  // the stored value === incoming. undefined === null is false, so the
  // first call should create a new state. A second identical call should
  // be the no-op.
  const s2 = statsReducer(s1, {
    type: "setFacetAnnotation",
    key: "setosa",
    value: null,
  });
  assert(s1 !== statsInit, "first set allocates");
  assert(s2 === s1, "second identical set is a no-op");
});

summary();

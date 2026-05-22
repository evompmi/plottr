// Unit tests for the Factorial Analysis tool's pure helpers
// (`tools/factorial/helpers.ts`): summarizeDesign + validateDesign.
//
// The stats kernel itself (`twoWayANOVA`) is exhaustively tested in
// tests/stats.test.js; this file focuses on the configure-step gates
// that decide whether the design is estimable before invoking the
// kernel.

const harness = require("./harness");
const {
  summarizeDesign,
  validateDesign,
  FACTORIAL_ROLE_COLORS,
  buildHandoffPayload,
} = require("./helpers/factorial-loader");

const test = harness.test;
const suite = harness.suite;
const { assert, eq } = harness;

suite("factorial — summarizeDesign");

test("unbalanced 2×2: cellCounts in row-major order, balanced=false", () => {
  // 10 obs across 4 cells in row-major (x,p)(x,q)(y,p)(y,q) order:
  // x/p = 2, x/q = 3, y/p = 2, y/q = 3 → unbalanced.
  const a = ["x", "x", "x", "y", "y", "y", "x", "x", "y", "y"];
  const b = ["p", "p", "q", "p", "p", "q", "q", "q", "q", "q"];
  const s = summarizeDesign(a, b);
  eq(s.levelsA, ["x", "y"]);
  eq(s.levelsB, ["p", "q"]);
  eq(s.cellCounts, [2, 3, 2, 3]);
  assert(s.balanced === false, "expected unbalanced");
  assert(s.emptyCells === 0);
  assert(s.singletonCells === 0);
  assert(s.N === 10);
});

test("equal-n balanced 2×2 is detected", () => {
  const a = ["x", "x", "y", "y", "x", "x", "y", "y"];
  const b = ["p", "p", "p", "p", "q", "q", "q", "q"];
  const s = summarizeDesign(a, b);
  eq(s.cellCounts, [2, 2, 2, 2]);
  assert(s.balanced === true, "expected balanced=true");
  assert(s.singletonCells === 0);
});

test("empty cell flagged via cellCount=0", () => {
  const a = ["x", "x", "y", "y"];
  const b = ["p", "p", "p", "p"]; // y/q never occurs and x/q never occurs
  const s = summarizeDesign(a, b);
  eq(s.levelsA, ["x", "y"]);
  eq(s.levelsB, ["p"]);
  // Only one level in B → emptyCells = 0 (no q to be empty)
  assert(s.emptyCells === 0);
});

test("partially empty design: 2×2 with one cell unfilled", () => {
  const a = ["x", "x", "y", "y"];
  const b = ["p", "q", "p", "p"]; // y/q is empty
  const s = summarizeDesign(a, b);
  eq(s.cellCounts, [1, 1, 2, 0]);
  assert(s.emptyCells === 1, `expected 1 empty, got ${s.emptyCells}`);
  assert(s.singletonCells === 2, `expected 2 singletons, got ${s.singletonCells}`);
  assert(s.balanced === false);
});

test("level order is alphabetical (deterministic)", () => {
  const a = ["zz", "aa", "mm", "zz", "aa", "mm"];
  const b = ["b", "a", "b", "a", "b", "a"];
  const s = summarizeDesign(a, b);
  eq(s.levelsA, ["aa", "mm", "zz"]);
  eq(s.levelsB, ["a", "b"]);
});

suite("factorial — validateDesign");

test("null role indices → role-pick error per role", () => {
  const s = summarizeDesign(["x", "y"], ["p", "q"]);
  const e1 = validateDesign(s, { aColIdx: null, bColIdx: 1, valueColIdx: 2 });
  assert(e1 != null && /factor A/i.test(e1), `aColIdx null msg: ${e1}`);
  const e2 = validateDesign(s, { aColIdx: 0, bColIdx: null, valueColIdx: 2 });
  assert(e2 != null && /factor B/i.test(e2), `bColIdx null msg: ${e2}`);
  const e3 = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: null });
  assert(e3 != null && /value/i.test(e3), `valueColIdx null msg: ${e3}`);
});

test("same column picked for A and B → error", () => {
  const s = summarizeDesign(["x", "y", "x", "y"], ["p", "q", "p", "q"]);
  const err = validateDesign(s, { aColIdx: 0, bColIdx: 0, valueColIdx: 1 });
  assert(err != null && /different/i.test(err), `msg: ${err}`);
});

test("single-level factor → error", () => {
  // factorA has only one level
  const sA = summarizeDesign(["x", "x", "x", "x"], ["p", "p", "q", "q"]);
  const eA = validateDesign(sA, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
  assert(eA != null && /factor A/i.test(eA), `single-level A: ${eA}`);
  // factorB has only one level
  const sB = summarizeDesign(["x", "y", "x", "y"], ["p", "p", "p", "p"]);
  const eB = validateDesign(sB, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
  assert(eB != null && /factor B/i.test(eB), `single-level B: ${eB}`);
});

test("empty cell → non-estimable error", () => {
  const s = summarizeDesign(["x", "x", "y", "y"], ["p", "q", "p", "p"]);
  const err = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
  assert(err != null && /non-estimable/i.test(err), `msg: ${err}`);
});

test("N ≤ k_A · k_B → not-enough-observations error (zero residual df)", () => {
  // 2×2 design with exactly 4 obs → df_resid = 0, can't compute F.
  const s = summarizeDesign(["x", "y", "x", "y"], ["p", "q", "q", "p"]);
  const err = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
  assert(err != null && /Need at least/i.test(err), `expected N-too-small err: ${err}`);
});

test("happy path → null", () => {
  const s = summarizeDesign(
    ["x", "x", "y", "y", "x", "y", "x", "y"],
    ["p", "p", "p", "p", "q", "q", "q", "q"]
  );
  const err = validateDesign(s, { aColIdx: 0, bColIdx: 1, valueColIdx: 2 });
  assert(err == null, `expected null, got: ${err}`);
});

suite("factorial — FACTORIAL_ROLE_COLORS");

test("every role in the union has a color entry", () => {
  for (const role of ["factorA", "factorB", "value", "ignore"]) {
    assert(
      FACTORIAL_ROLE_COLORS[role] && /^#[0-9A-F]{6}$/i.test(FACTORIAL_ROLE_COLORS[role]),
      `missing or malformed color for role=${role}: ${FACTORIAL_ROLE_COLORS[role]}`
    );
  }
});

test("colors are distinct (no two roles share the same hex)", () => {
  const seen = new Set();
  for (const role of ["factorA", "factorB", "value", "ignore"]) {
    const c = FACTORIAL_ROLE_COLORS[role];
    assert(!seen.has(c), `duplicate color for ${role}: ${c}`);
    seen.add(c);
  }
});

suite("factorial — buildHandoffPayload");

const longRows3 = [
  { a: "WT", b: "ctrl", v: 12.3 },
  { a: "WT", b: "drug", v: 15.2 },
  { a: "ko", b: "ctrl", v: 11.9 },
  { a: "ko", b: "drug", v: 11.8 },
];

test("groupFactor='A': column order is (factorA, value, factorB)", () => {
  const payload = buildHandoffPayload({
    factorAName: "genotype",
    factorBName: "treatment",
    valueName: "growth",
    longRows: longRows3,
    fileStem: "plant",
    groupFactor: "A",
  });
  const lines = payload.csv.split("\n");
  eq(lines[0], "genotype,growth,treatment");
  eq(lines[1], "WT,12.3,ctrl");
  eq(lines[2], "WT,15.2,drug");
  eq(lines[3], "ko,11.9,ctrl");
  eq(lines[4], "ko,11.8,drug");
});

test("groupFactor='B' swaps factorA and factorB columns", () => {
  const payload = buildHandoffPayload({
    factorAName: "genotype",
    factorBName: "treatment",
    valueName: "growth",
    longRows: longRows3,
    fileStem: "plant",
    groupFactor: "B",
  });
  const lines = payload.csv.split("\n");
  eq(lines[0], "treatment,growth,genotype");
  eq(lines[1], "ctrl,12.3,WT");
  eq(lines[2], "drug,15.2,WT");
});

test("payload routes to boxplot with the correct contract fields", () => {
  const payload = buildHandoffPayload({
    factorAName: "genotype",
    factorBName: "treatment",
    valueName: "growth",
    longRows: longRows3,
    fileStem: "plant",
    groupFactor: "A",
  });
  assert(payload.tool === "boxplot", `tool=${payload.tool}`);
  assert(payload.mode === "long", `mode=${payload.mode}`);
  assert(payload.source === "factorial", `source=${payload.source}`);
  assert(payload.fileName === "plant_drilldown.csv", `fileName=${payload.fileName}`);
  assert(payload.yLabel === "growth", `yLabel=${payload.yLabel}`);
  eq(payload.colRoles, ["group", "value", "filter"]);
});

test("CSV-injection-shaped strings get quoted, never bare", () => {
  const payload = buildHandoffPayload({
    factorAName: "genotype, alias",
    factorBName: "treatment",
    valueName: 'value "raw"',
    longRows: [{ a: 'has "quote"', b: "ctrl", v: 1.5 }],
    fileStem: "x",
    groupFactor: "A",
  });
  const lines = payload.csv.split("\n");
  // Header: comma-containing name + quote-containing name both quoted, with
  // doubled internal quotes.
  eq(lines[0], '"genotype, alias","value ""raw""",treatment');
  // Data row: quote-containing factor label is also escaped.
  eq(lines[1], '"has ""quote""",1.5,ctrl');
});

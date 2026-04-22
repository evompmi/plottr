// Unit tests for tools/venn/ pure helpers. Currently covers only the
// long-format detector (audit M2). Extend as other venn helpers grow tests.

const { suite, test, assert, eq, summary } = require("./harness");
const { detectLongFormat } = require("./helpers/venn-loader");

suite("detectLongFormat — long-format inputs");

test("3-row 2-set long format is detected (was a false negative before M2)", () => {
  // Before M2 this failed: the old guard required col2.length >= 4.
  const rows = [
    ["geneA", "setX"],
    ["geneB", "setY"],
    ["geneC", "setX"],
  ];
  const r = detectLongFormat(["item", "set"], rows);
  assert(r.isLong, `expected long-format, got ${JSON.stringify(r)}`);
});

test("20-row 3-set long format is detected", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push([`gene${i}`, ["A", "B", "C"][i % 3]]);
  }
  const r = detectLongFormat(["gene", "category"], rows);
  assert(r.isLong);
  eq(r.col2Distinct, 3);
});

test("classic long format with 2 sets, heavy column-1 uniqueness", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push([`item${i}`, i < 5 ? "A" : "B"]);
  }
  const r = detectLongFormat(["item", "set"], rows);
  assert(r.isLong);
});

suite("detectLongFormat — wide-format inputs (must NOT flip)");

test("20-row wide Venn with one duplicated item in col 2 stays wide (was a false positive before M2)", () => {
  // Old heuristic: col2Distinct < col2.length → 19 < 20 → flipped to long
  // incorrectly. New heuristic requires heavy repetition (≥ half of col 2),
  // so a single dup fails.
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push([`A_item${i}`, `B_item${i}`]);
  rows.push([`A_item20`, `B_item0`]); // single duplicate in col 2
  const r = detectLongFormat(["setA", "setB"], rows);
  assert(!r.isLong, `expected wide, got ${JSON.stringify(r)}`);
});

test("wide Venn with no duplicates stays wide", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push([`leftItem${i}`, `rightItem${i}`]);
  const r = detectLongFormat(["left", "right"], rows);
  assert(!r.isLong);
});

suite("detectLongFormat — edge cases");

test("non-2-column input returns false", () => {
  eq(detectLongFormat(["a"], [["x"]]).isLong, false);
  eq(detectLongFormat(["a", "b", "c"], [["x", "y", "z"]]).isLong, false);
});

test("empty rows return false", () => {
  eq(detectLongFormat(["item", "set"], []).isLong, false);
});

test("fewer than 3 populated col-2 rows returns false (too ambiguous)", () => {
  const r = detectLongFormat(
    ["item", "set"],
    [
      ["a", "X"],
      ["b", "X"],
    ]
  );
  eq(r.isLong, false);
});

test("col 2 with > 20 distinct values returns false (UpSet territory)", () => {
  // 25 unique "set labels" — user should be on UpSet, not Venn. Don't auto-flip
  // to long format here; let the wide parse produce a more meaningful error.
  const rows = [];
  for (let i = 0; i < 25; i++) rows.push([`g${i}`, `set${i}`]);
  const r = detectLongFormat(["g", "s"], rows);
  assert(!r.isLong);
});

test("col 1 with heavy duplication blocks long-format (wide-format symmetry)", () => {
  // 10 rows but col 1 has only 2 distinct values — not a typical long-format
  // layout (long-format's col 1 is item identifiers, nearly always unique).
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push([i % 2 === 0 ? "A" : "B", "setX"]);
  }
  const r = detectLongFormat(["left", "right"], rows);
  assert(!r.isLong);
});

summary();

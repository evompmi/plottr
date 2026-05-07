// Shared fast-check arbitraries for CSV-shaped inputs.
//
// Every plot-tool property test that exercises the parse-→-compute
// pipeline pulls its input arbitraries from here so we don't duplicate
// CSV-pathology generation across eight files. Two flavours:
//
//   1. `arbCorpusCsv` — wraps the curated pathological-input corpus
//      from `csv-corpus.js` (BOM-prefixed, CRLF, mixed delimiters,
//      decimal commas, null bytes, unicode labels, ragged rows, very
//      long labels, NaN/Inf tokens, …). fast-check picks a generator
//      and a seed; the corpus generator runs deterministically with
//      that seed. Limited shrinking (only the seed shrinks) but covers
//      the full pathology surface area the prior fuzz harnesses tested.
//
//   2. `arbWideCsv` / `arbLongCsv` / `arbSetCsv` — fast-check-native
//      structural arbitraries that build CSV strings from scratch. The
//      shrinker collapses rows / columns / cells to a minimal failing
//      example (real value: a downstream invariant violation gives a
//      one-line repro instead of a 200-character corpus output).
//
// The per-tool property tests typically pull from `arbAnyCsv` (union
// of all of the above) for "no-throw" properties and from the
// structural arbitraries for shape-invariant properties where
// shrinking matters.

const fc = require("fast-check");
const { GENERATORS, makeRng } = require("./csv-corpus");

// ── Wrap the curated corpus as a fast-check arbitrary ───────────────────

const arbCorpusCsv = fc
  .tuple(
    fc.integer({ min: 0, max: GENERATORS.length - 1 }),
    fc.integer({ min: 1, max: 0x7fffffff })
  )
  .map(([genIdx, seed]) => {
    const rng = makeRng(seed >>> 0 || 1);
    const { label, text } = GENERATORS[genIdx](rng);
    return { label, text };
  });

// Convenience: the same arbitrary stripped down to just the CSV string,
// since most properties don't need the label.
const arbCorpusCsvText = arbCorpusCsv.map((r) => r.text);

// ── Structural arbitraries (shrinkable) ─────────────────────────────────

const DELIMITERS = [",", "\t", ";"];
const arbDelim = fc.constantFrom(...DELIMITERS);

// A single numeric-like cell. Most are finite numbers, with a tail of
// edge cases (empty, NaN/Inf tokens, exponential, negative). Returned
// as a string because that's what enters the parser.
const arbNumericCell = fc.oneof(
  {
    weight: 50,
    arbitrary: fc
      .double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
      .map((n) => n.toFixed(3)),
  },
  { weight: 10, arbitrary: fc.constant("") },
  { weight: 8, arbitrary: fc.constantFrom("NaN", "Inf", "-Inf", "nan", "inf") },
  {
    weight: 8,
    arbitrary: fc
      .double({ min: 1e-50, max: 1e50, noNaN: true, noDefaultInfinity: true })
      .map((n) => n.toExponential(2)),
  },
  { weight: 8, arbitrary: fc.constantFrom("0", "1", "-1", "1.5", "-3.14", "0.0001", "1e-300") },
  { weight: 8, arbitrary: fc.constantFrom("abc", "x", "?", "NA", "—", "n/a") },
  { weight: 8, arbitrary: fc.string({ maxLength: 8 }) }
);

// A label cell — mix of realistic short labels, hostile chars, and
// random strings. Used as headers, group names, and item ids.
const arbLabelCell = fc.oneof(
  {
    weight: 60,
    arbitrary: fc.constantFrom(
      "ctrl",
      "treat",
      "g1",
      "g2",
      "g3",
      "G0",
      "G1",
      "set1",
      "α",
      "🧬",
      "with,comma",
      'with"quote',
      "with\ttab",
      "x",
      "GENE_A",
      "AT1G01010",
      "chr1",
      ""
    ),
  },
  { weight: 30, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 10, arbitrary: fc.constantFrom("S0", "S1", "T0", "T1") }
);

// Wide-format matrix CSV: row header + numeric cells. The first column
// is a label column (genes / samples), subsequent columns are numeric.
// Header row leads with an empty cell to match the project's expected
// shape (parseWideMatrix detects this).
const arbWideCsv = fc
  .record({
    ncols: fc.integer({ min: 2, max: 6 }),
    nrows: fc.integer({ min: 1, max: 12 }),
    sep: arbDelim,
  })
  .chain(({ ncols, nrows, sep }) =>
    fc
      .record({
        headers: fc.array(arbLabelCell, { minLength: ncols - 1, maxLength: ncols - 1 }),
        rows: fc.array(
          fc.record({
            label: arbLabelCell,
            cells: fc.array(arbNumericCell, {
              minLength: ncols - 1,
              maxLength: ncols - 1,
            }),
          }),
          { minLength: nrows, maxLength: nrows }
        ),
      })
      .map(({ headers, rows }) => {
        const lines = [["", ...headers].join(sep)];
        for (const r of rows) lines.push([r.label, ...r.cells].join(sep));
        return lines.join("\n");
      })
  );

// Long-format CSV: header row, then rows of (value, group, [subgroup]).
// Used by boxplot / scatter / lineplot / aequorin (single-condition).
const arbLongCsv = fc
  .record({
    hasSubgroup: fc.boolean(),
    nrows: fc.integer({ min: 2, max: 30 }),
    sep: arbDelim,
  })
  .chain(({ hasSubgroup, nrows, sep }) => {
    const headers = hasSubgroup ? ["value", "group", "subgroup"] : ["value", "group"];
    return fc
      .array(
        fc.record({
          v: arbNumericCell,
          g: fc.constantFrom("G0", "G1", "G2", "G3", "α", ""),
          s: fc.constantFrom("S0", "S1", "S2"),
        }),
        { minLength: nrows, maxLength: nrows }
      )
      .map((rows) => {
        const lines = [headers.join(sep)];
        for (const r of rows) {
          const cells = hasSubgroup ? [r.v, r.g, r.s] : [r.v, r.g];
          lines.push(cells.join(sep));
        }
        return lines.join("\n");
      });
  });

// Set-membership CSV: wide table where each column is a set name and
// each cell is an item label (or empty / blank). Used by venn / upset.
// Items repeat across columns to create real intersections.
const arbSetCsv = fc
  .record({
    nsets: fc.integer({ min: 1, max: 6 }),
    nrows: fc.integer({ min: 1, max: 25 }),
    sep: arbDelim,
  })
  .chain(({ nsets, nrows, sep }) =>
    fc
      .record({
        setNames: fc.array(arbLabelCell, { minLength: nsets, maxLength: nsets }),
        rows: fc.array(
          fc.array(
            fc.oneof(
              { weight: 60, arbitrary: fc.constantFrom("g1", "g2", "g3", "g4", "g5", "α", "🧬") },
              { weight: 30, arbitrary: fc.constant("") },
              { weight: 10, arbitrary: fc.string({ maxLength: 6 }) }
            ),
            { minLength: nsets, maxLength: nsets }
          ),
          { minLength: nrows, maxLength: nrows }
        ),
      })
      .map(({ setNames, rows }) => {
        const lines = [setNames.join(sep)];
        for (const r of rows) lines.push(r.join(sep));
        return lines.join("\n");
      })
  );

// 2-column long-format set CSV: (item, set) pairs. Used by upset's
// long-format parser path.
const arbLongSetCsv = fc
  .record({
    nrows: fc.integer({ min: 2, max: 40 }),
    sep: arbDelim,
  })
  .chain(({ nrows, sep }) =>
    fc
      .array(
        fc.record({
          item: fc.oneof(
            fc.constantFrom("g1", "g2", "g3", "α", "🧬", "with,comma", ""),
            fc.string({ maxLength: 8 })
          ),
          set: fc.oneof(
            fc.constantFrom("A", "B", "C", "D", "E", "set 1", ""),
            fc.string({ maxLength: 6 })
          ),
        }),
        { minLength: nrows, maxLength: nrows }
      )
      .map((rows) => {
        const lines = [["item", "set"].join(sep)];
        for (const r of rows) lines.push([r.item, r.set].join(sep));
        return lines.join("\n");
      })
  );

// Pathology transformers — apply BOM / CRLF to a base CSV.
const withBom = (a) => a.map((s) => "﻿" + s);
const withCrlf = (a) => a.map((s) => s.replace(/\n/g, "\r\n"));

// "Anything CSV-shaped" — use this for parser-resilience properties
// where you only assert that parsing doesn't throw. Combines the curated
// corpus with the structural arbitraries.
const arbAnyCsv = fc.oneof(
  { weight: 30, arbitrary: arbCorpusCsvText },
  { weight: 25, arbitrary: arbWideCsv },
  { weight: 20, arbitrary: arbLongCsv },
  { weight: 5, arbitrary: arbSetCsv },
  { weight: 5, arbitrary: arbLongSetCsv },
  { weight: 5, arbitrary: withBom(arbWideCsv) },
  { weight: 5, arbitrary: withCrlf(arbWideCsv) },
  { weight: 5, arbitrary: fc.constantFrom("", "  ", "\n\n", "\t", "header_only", "x") }
);

module.exports = {
  arbCorpusCsv,
  arbCorpusCsvText,
  arbDelim,
  arbNumericCell,
  arbLabelCell,
  arbWideCsv,
  arbLongCsv,
  arbSetCsv,
  arbLongSetCsv,
  arbAnyCsv,
};

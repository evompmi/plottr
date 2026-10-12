// Property-based tests for the Proportions parse → select → analyse
// pipeline (tools/proportions/helpers.ts).

const fc = require("fast-check");
const { suite, test } = require("./harness");
const { arbAnyCsv } = require("./helpers/csv-arbitraries");
const L = require("./helpers/proportions-loader");

const RUNS = 200;
const RUNS_HEAVY = 60;
const check = (prop, runs = RUNS) => fc.assert(prop, { numRuns: runs });

// A well-formed counts table as CSV text plus its expected counts.
const arbCountsCsvMax = (maxCell, maxR = 6, maxC = 4) =>
  fc
    .tuple(fc.integer({ min: 2, max: maxR }), fc.integer({ min: 2, max: maxC }))
    .chain(([nr, nc]) =>
      fc.array(fc.array(fc.integer({ min: 0, max: maxCell }), { minLength: nc, maxLength: nc }), {
        minLength: nr,
        maxLength: nr,
      })
    )
    .map((counts) => {
      const cats = counts[0].map((_, j) => `cat${j}`);
      const groups = counts.map((_, i) => `g${i}`);
      const text =
        [
          "group," + cats.join(","),
          ...counts.map((row, i) => `${groups[i]},${row.join(",")}`),
        ].join("\n") + "\n";
      return { text, counts, groups, cats };
    });
const arbCountsCsv = arbCountsCsvMax(40);

suite("parseCountsTable — resilience");

test("never throws; returns exactly one of table / error", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const r = L.parseCountsTable(L.parseRaw(text));
      return (r.table === null) !== (r.error === null);
    })
  );
});

test("round-trips a well-formed counts table", () => {
  check(
    fc.property(arbCountsCsv, ({ text, counts, groups, cats }) => {
      const r = L.parseCountsTable(L.parseRaw(text));
      return (
        r.error === null &&
        JSON.stringify(r.table.counts) === JSON.stringify(counts) &&
        r.table.groups.join() === groups.join() &&
        r.table.categories.join() === cats.join()
      );
    })
  );
});

suite("selection / collapse");

test("selection keeps only included, non-empty groups, in order", () => {
  check(
    fc.property(
      arbCountsCsv,
      fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
      ({ text }, inc) => {
        const t = L.parseCountsTable(L.parseRaw(text)).table;
        const order = L.defaultOrder(t.groups)
          .map((g, i) => ({ ...g, include: inc[i] }))
          .reverse();
        const s = L.applySelection(t, order, L.defaultOrder(t.categories));
        const expected = order.filter((g) => g.include).map((g) => g.name);
        const kept = s.table.groups.concat(s.droppedGroups);
        return (
          kept.length === expected.length &&
          s.table.groups.every((g) => expected.includes(g)) &&
          s.table.counts.every((row) => row.reduce((a, b) => a + b, 0) > 0)
        );
      }
    )
  );
});

test("collapseToFocus preserves group totals and the focus count", () => {
  check(
    fc.property(arbCountsCsv, fc.nat(), ({ text }, f) => {
      const t = L.parseCountsTable(L.parseRaw(text)).table;
      const focus = f % t.categories.length;
      const c = L.collapseToFocus(t, focus, "Other");
      return c.counts.every(
        (row, i) =>
          row[0] === t.counts[i][focus] &&
          row[0] + row[1] === t.counts[i].reduce((a, b) => a + b, 0)
      );
    })
  );
});

suite("analysis");

// Small counts keep forced-Fisher on the exact path (6×4 tables
// fall back to a ~0.5–1 s Monte-Carlo, too slow for a property run).
test("p in [0, 1]; CLD letters and brackets index real groups", () => {
  check(
    fc.property(
      arbCountsCsvMax(8, 4, 3),
      fc.constantFrom("auto", "fisher", "chi2"),
      ({ text }, choice) => {
        const t = L.parseCountsTable(L.parseRaw(text)).table;
        const s = L.applySelection(t, L.defaultOrder(t.groups), L.defaultOrder(t.categories)).table;
        if (s.groups.length < 2) return true;
        const a = L.analyseTable(s, choice, "holm");
        if (a.error) return a.table.groups.length < 2 || a.table.categories.length < 2;
        const k = a.table.groups.length;
        const pOk = (a.test === "chi2" && a.chi2.error) || (a.p >= 0 && a.p <= 1);
        const pairsOk = a.pairs.length === (k > 2 ? (k * (k - 1)) / 2 : 0);
        const brOk = L.bracketPairs(a, true).every((b) => b.i < b.j && b.j < k);
        return pOk && pairsOk && brOk && a.cld.length === k;
      }
    ),
    RUNS_HEAVY
  );
});

suite("chart geometry");

test("stacked segments tile [0, 1] when n > 0", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 50 }), { minLength: 1, maxLength: 6 }),
      (row) => {
        const s = L.stackSegments(row);
        const n = row.reduce((a, b) => a + b, 0);
        if (n === 0) return s.every((x) => x.y0 === 0 && x.y1 === 0);
        return (
          s[0].y0 === 0 &&
          Math.abs(s[s.length - 1].y1 - 1) < 1e-12 &&
          s.every((x, i) => i === 0 || x.y0 === s[i - 1].y1)
        );
      }
    )
  );
});

test("mosaic spans fill the width (minus gaps) proportionally", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 8 }),
      fc.integer({ min: 100, max: 1200 }),
      (totals, width) => {
        const sp = L.mosaicSpans(totals, width, 6);
        const n = totals.reduce((a, b) => a + b, 0);
        const usable = width - 6 * (totals.length - 1);
        return (
          Math.abs(sp[sp.length - 1][1] - width) < 1e-9 &&
          sp.every((s, i) => Math.abs(s[1] - s[0] - (usable * totals[i]) / n) < 1e-9)
        );
      }
    )
  );
});

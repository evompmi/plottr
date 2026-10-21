// @vitest-environment happy-dom
//
// The landing page shows real output, not illustration: Group Plot's own
// example dataset drawn by the real chart (tools/landing-specimen.svg), the
// statistics Group Plot prints for it, and the public benchmark's total
// comparison count. Regenerate everything from source and compare with the
// committed copies, so the landing can never drift from what the app does.
// After an intended change (new example data, chart restyle, new benchmark
// run): `UPDATE_LANDING=1 npx vitest run tests/landing.test.js`.

const fs = require("fs");
const path = require("path");
const { suite, test, eq, assert } = require("./harness");
const { buildSpecimen, benchmarkComparisons, SPECIMEN_SVG } = require("./helpers/landing-specimen");

const INDEX = path.join(__dirname, "../index.html");
const UPDATE = process.env.UPDATE_LANDING === "1";

const specimen = buildSpecimen();
const total = benchmarkComparisons().toLocaleString("en-US");

function specimenSpans(html, kind) {
  return [...html.matchAll(new RegExp(`data-specimen="${kind}">([^<]*)<`, "g"))].map((m) => m[1]);
}

if (UPDATE) {
  fs.writeFileSync(SPECIMEN_SVG, specimen.svg);
  let html = fs.readFileSync(INDEX, "utf8");
  const put = (kind, values) => {
    let n = 0;
    html = html.replace(new RegExp(`(data-specimen="${kind}">)[^<]*(<)`, "g"), (m, a, b) => {
      const v = values[n++];
      return v == null ? m : a + v + b;
    });
  };
  put("statistic", [specimen.stats.statistic]);
  put("p", [specimen.stats.p]);
  put("pair", specimen.stats.pairs);
  html = html.replace(/(data-benchmark-count>)[^<]*(<)/, `$1${total}$2`);
  fs.writeFileSync(INDEX, html);
}

const html = fs.readFileSync(INDEX, "utf8");

suite("landing — real output only");

test("the hero figure is Group Plot's chart of its example data", () => {
  const committed = fs.readFileSync(SPECIMEN_SVG, "utf8");
  assert(committed === specimen.svg, "tools/landing-specimen.svg is stale — run UPDATE_LANDING=1");
  assert(committed.startsWith("<svg") && committed.includes('xmlns="http://www.w3.org/2000/svg"'));
});

test("the statistics beside it are the ones Group Plot computes", () => {
  eq(specimenSpans(html, "statistic").join("|"), specimen.stats.statistic);
  eq(specimenSpans(html, "p").join("|"), specimen.stats.p);
  eq(specimenSpans(html, "pair").join("|"), specimen.stats.pairs.join("|"));
});

test("the comparison count is the benchmark page's R + SciPy total", () => {
  const m = html.match(/data-benchmark-count>([^<]*)</);
  assert(m, "benchmark count element");
  eq(m[1], total);
});

suite("landing — tool links");

test("every registry tool is linked once, in its category", () => {
  const reg = fs.readFileSync(path.join(__dirname, "../tools/_app/tool-registry.ts"), "utf8");
  const tools = [...reg.matchAll(/key: "(\w+)",\n\s+label: "[^"]+",\n\s+category: "(\w+)"/g)].map(
    (m) => ({ key: m[1], cat: m[2] })
  );
  eq(tools.length, 12);
  for (const { key, cat } of tools) {
    const links = [...html.matchAll(new RegExp(`href="#/${key}" data-tool="${key}"`, "g"))];
    eq(links.length, 1, `${key} linked once`);
    // The link sits inside the block for its registry category.
    const at = html.indexOf(`href="#/${key}" data-tool="${key}"`);
    const blockStart = html.lastIndexOf('data-category="', at);
    eq(html.slice(blockStart + 15, html.indexOf('"', blockStart + 15)), cat, `${key} category`);
  }
});

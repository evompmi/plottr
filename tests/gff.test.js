// Unit tests for the Genome Track (GFF3) pure helpers — the GFF3 document
// parser, attribute parsing, gene-model assembly, lane packing, and the
// colour / coordinate formatters. Source: tools/gff/helpers.ts.

const { suite, test, assert, eq, summary } = require("./harness");
const {
  parseGff3,
  parseGffAttributes,
  gffDecode,
  buildGeneModels,
  packModels,
  summarizeSeqids,
  assignTypeColors,
  strandColor,
  formatBp,
  formatBpExact,
} = require("./helpers/gff-loader");

// Tab-joined GFF3 feature line.
const f = (...cols) => cols.join("\t");

const SIMPLE_GFF = [
  "##gff-version 3",
  "##sequence-region ctg1 1 5000",
  "# a human comment",
  f("ctg1", "src", "gene", "100", "900", ".", "+", ".", "ID=g1;Name=Alpha"),
  f("ctg1", "src", "mRNA", "100", "900", ".", "+", ".", "ID=m1;Parent=g1"),
  f("ctg1", "src", "exon", "100", "300", ".", "+", ".", "ID=e1;Parent=m1"),
  f("ctg1", "src", "exon", "600", "900", ".", "+", ".", "ID=e2;Parent=m1"),
  f("ctg1", "src", "CDS", "150", "300", "5.5", "+", "0", "ID=c1;Parent=m1"),
].join("\n");

// ── parseGff3 ────────────────────────────────────────────────────────────────

suite("parseGff3");

test("parses feature lines and skips directives + comments", () => {
  const r = parseGff3(SIMPLE_GFF);
  eq(r.features.length, 5);
  eq(r.version, "3");
  eq(r.seqids, ["ctg1"]);
  eq(r.skippedLines, 0);
});

test("captures column values on the first feature", () => {
  const r = parseGff3(SIMPLE_GFF);
  const gene = r.features[0];
  eq(gene.seqid, "ctg1");
  eq(gene.type, "gene");
  eq(gene.start, 100);
  eq(gene.end, 900);
  eq(gene.strand, "+");
  eq(gene.id, "g1");
  eq(gene.name, "Alpha");
});

test("score '.' is null, numeric score is parsed", () => {
  const r = parseGff3(SIMPLE_GFF);
  eq(r.features[0].score, null);
  eq(r.features[4].score, 5.5);
});

test("phase parses to 0/1/2 or null", () => {
  const r = parseGff3(SIMPLE_GFF);
  eq(r.features[0].phase, null);
  eq(r.features[4].phase, 0);
});

test("counts feature types in first-seen order", () => {
  const r = parseGff3(SIMPLE_GFF);
  eq([...r.typeCounts.keys()], ["gene", "mRNA", "exon", "CDS"]);
  eq(r.typeCounts.get("exon"), 2);
});

test("records sequence-region directives", () => {
  const r = parseGff3(SIMPLE_GFF);
  eq(r.sequenceRegions.get("ctg1"), { start: 1, end: 5000 });
});

test("collects warnings for malformed lines instead of throwing", () => {
  const messy = [
    "##gff-version 3",
    f("ctg1", "src", "gene", "100", "200", ".", "+", ".", "ID=ok"),
    f("ctg1", "src", "gene", "NaN", "200", ".", "+", ".", "ID=badstart"),
    f("ctg1", "src", "gene", "500", "100", ".", "+", ".", "ID=inverted"),
    "only\tthree\tcolumns",
  ].join("\n");
  const r = parseGff3(messy);
  eq(r.features.length, 1);
  eq(r.skippedLines, 3);
  eq(r.warnings.length, 3);
  assert(r.warnings[0].lineNo === 3, "first warning is the NaN-start line");
});

test("stops at the ##FASTA directive", () => {
  const withFasta = [
    "##gff-version 3",
    f("ctg1", "src", "gene", "1", "10", ".", "+", ".", "ID=g1"),
    "##FASTA",
    ">ctg1",
    "ACGTACGTAC",
  ].join("\n");
  const r = parseGff3(withFasta);
  eq(r.features.length, 1);
  eq(r.fastaSkipped, true);
  eq(r.skippedLines, 0); // FASTA body is not counted as skipped feature lines
});

test("strips a leading BOM and handles CRLF newlines", () => {
  const crlf = "﻿##gff-version 3\r\n" + f("ctg1", "s", "gene", "1", "9", ".", ".", ".", "");
  const r = parseGff3(crlf);
  eq(r.features.length, 1);
  eq(r.version, "3");
});

test("unknown strand tokens coerce to '.'", () => {
  const r = parseGff3(f("c", "s", "gene", "1", "9", ".", "x", ".", "ID=g"));
  eq(r.features[0].strand, ".");
});

test("empty / non-string input returns an empty result", () => {
  const r = parseGff3("");
  eq(r.features.length, 0);
  eq(r.seqids.length, 0);
});

// ── parseGffAttributes ───────────────────────────────────────────────────────

suite("parseGffAttributes");

test("parses tag=value pairs", () => {
  const a = parseGffAttributes("ID=gene1;Name=BRCA2");
  eq(a.get("ID"), ["gene1"]);
  eq(a.get("Name"), ["BRCA2"]);
});

test("splits comma-separated multi-values", () => {
  const a = parseGffAttributes("Parent=mrnaA,mrnaB");
  eq(a.get("Parent"), ["mrnaA", "mrnaB"]);
});

test("URL-decodes encoded characters", () => {
  const a = parseGffAttributes("Note=tab%09here;Name=a%2Cb");
  eq(a.get("Note"), ["tab\there"]);
  eq(a.get("Name"), ["a,b"]); // %2C is an encoded comma — not a list separator
});

test("skips malformed pieces and the '.' placeholder", () => {
  eq(parseGffAttributes(".").size, 0);
  const a = parseGffAttributes("ID=g1;junk;=novalue;");
  eq([...a.keys()], ["ID"]);
});

// ── gffDecode ────────────────────────────────────────────────────────────────

suite("gffDecode");

test("decodes percent escapes and leaves malformed input verbatim", () => {
  eq(gffDecode("a%20b"), "a b");
  eq(gffDecode("no-escapes"), "no-escapes");
  eq(gffDecode("100%"), "100%"); // malformed — returned unchanged, not thrown
});

// ── buildGeneModels ──────────────────────────────────────────────────────────

suite("buildGeneModels");

test("resolves a gene → mRNA → exon/CDS hierarchy into one model", () => {
  const r = parseGff3(SIMPLE_GFF);
  const models = buildGeneModels(r.features, "ctg1");
  eq(models.length, 1);
  eq(models[0].feature.type, "gene");
  // Parts are the leaf descendants: 2 exons + 1 CDS.
  eq(models[0].parts.length, 3);
  eq(models[0].start, 100);
  eq(models[0].end, 900);
});

test("a discontinuous CDS sharing one ID yields several parts", () => {
  const gff = [
    f("c", "s", "gene", "1", "900", ".", "+", ".", "ID=g"),
    f("c", "s", "mRNA", "1", "900", ".", "+", ".", "ID=m;Parent=g"),
    f("c", "s", "CDS", "1", "200", ".", "+", "0", "ID=cds;Parent=m"),
    f("c", "s", "CDS", "400", "600", ".", "+", "1", "ID=cds;Parent=m"),
    f("c", "s", "CDS", "800", "900", ".", "+", "2", "ID=cds;Parent=m"),
  ].join("\n");
  const models = buildGeneModels(parseGff3(gff).features, "c");
  eq(models.length, 1);
  eq(models[0].parts.length, 3);
});

test("features with no resolvable parent each become their own model", () => {
  const gff = [
    f("c", "s", "gene", "1", "100", ".", "+", ".", "ID=g1"),
    f("c", "s", "gene", "200", "300", ".", "-", ".", "ID=g2"),
  ].join("\n");
  const models = buildGeneModels(parseGff3(gff).features, "c");
  eq(models.length, 2);
  eq(models[0].parts.length, 0); // no children → drawn as a single block
});

test("filters to the requested seqid", () => {
  const gff = [
    f("ctg1", "s", "gene", "1", "100", ".", "+", ".", "ID=g1"),
    f("ctg2", "s", "gene", "1", "100", ".", "+", ".", "ID=g2"),
  ].join("\n");
  const models = buildGeneModels(parseGff3(gff).features, "ctg2");
  eq(models.length, 1);
  eq(models[0].feature.id, "g2");
});

test("a Parent cycle terminates instead of looping forever", () => {
  const gff = [
    f("c", "s", "gene", "1", "100", ".", "+", ".", "ID=a;Parent=b"),
    f("c", "s", "gene", "1", "100", ".", "+", ".", "ID=b;Parent=a"),
  ].join("\n");
  // Both features parent each other — neither is a root, so no model is
  // produced, but the call must return (not hang).
  const models = buildGeneModels(parseGff3(gff).features, "c");
  eq(models.length, 0);
});

// ── packModels ───────────────────────────────────────────────────────────────

suite("packModels");

const gm = (key, start, end) => ({ key, start, end, parts: [], feature: { type: "gene" } });

test("overlapping models land on different lanes", () => {
  const { packed, laneCount } = packModels([gm("a", 1, 100), gm("b", 50, 150)], 0);
  eq(laneCount, 2);
  eq(packed[0].lane, 0);
  eq(packed[1].lane, 1);
});

test("non-overlapping models share a lane", () => {
  const { packed, laneCount } = packModels([gm("a", 1, 100), gm("b", 200, 300)], 0);
  eq(laneCount, 1);
  eq(packed[0].lane, 0);
  eq(packed[1].lane, 0);
});

test("the gap clearance forces near-touching models apart", () => {
  // b starts only 5 bp after a ends — a 20 bp gap should bump it to lane 1.
  const { laneCount } = packModels([gm("a", 1, 100), gm("b", 105, 200)], 20);
  eq(laneCount, 2);
});

test("empty input packs to zero lanes", () => {
  eq(packModels([], 0), { packed: [], laneCount: 0 });
});

// ── summarizeSeqids ──────────────────────────────────────────────────────────

suite("summarizeSeqids");

test("counts features and extent per seqid", () => {
  const gff = [
    f("ctg1", "s", "gene", "100", "500", ".", "+", ".", "ID=g1"),
    f("ctg1", "s", "gene", "800", "1200", ".", "+", ".", "ID=g2"),
    f("ctg2", "s", "gene", "1", "50", ".", "+", ".", "ID=g3"),
  ].join("\n");
  const summary = summarizeSeqids(parseGff3(gff).features);
  eq(summary.length, 2);
  eq(summary[0], { seqid: "ctg1", featureCount: 2, start: 100, end: 1200 });
  eq(summary[1], { seqid: "ctg2", featureCount: 1, start: 1, end: 50 });
});

// ── assignTypeColors ─────────────────────────────────────────────────────────

suite("assignTypeColors");

test("known SO types get stable hint colours", () => {
  const c = assignTypeColors(["gene", "exon", "CDS"]);
  eq(c.get("gene"), "#648FFF");
  eq(c.get("CDS"), "#DC267F");
});

test("unknown types draw from the shared palette and stay deterministic", () => {
  const a = assignTypeColors(["match", "repeat_region"]);
  const b = assignTypeColors(["match", "repeat_region"]);
  eq([...a.values()], [...b.values()]);
  assert(/^#[0-9A-Fa-f]{6}$/.test(a.get("match")), "palette colour is a hex literal");
});

// ── strandColor / formatBp ───────────────────────────────────────────────────

suite("strandColor + formatBp");

test("strandColor maps + / - / other", () => {
  eq(strandColor("+"), "#0072B2");
  eq(strandColor("-"), "#DC267F");
  eq(strandColor("."), "#888888");
  eq(strandColor("?"), "#888888");
});

test("formatBp picks bp / kb / Mb units", () => {
  eq(formatBp(500), "500");
  eq(formatBp(2000), "2.00 kb");
  eq(formatBp(45000), "45.0 kb");
  eq(formatBp(3500000), "3.50 Mb");
});

test("formatBpExact adds thousands separators", () => {
  eq(formatBpExact(1234567), "1,234,567");
  eq(formatBpExact(50), "50");
});

summary();

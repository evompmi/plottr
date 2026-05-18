// Property-based tests for the Genome Track (GFF3) pipeline: text → parseGff3
// → buildGeneModels → packModels, plus summarizeSeqids / assignTypeColors.
// Structural invariants that are clumsy to pin with example-based tests.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  parseGff3,
  buildGeneModels,
  packModels,
  summarizeSeqids,
  assignTypeColors,
} = require("./helpers/gff-loader");
const { arbAnyCsv } = require("./helpers/csv-arbitraries");

const RUNS = 200;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

const VALID_STRANDS = ["+", "-", ".", "?"];

// A well-formed GFF3 document: a version directive plus gene blocks, each a
// gene line with 0–5 exon children whose coordinates stay inside the gene.
const arbGffDoc = fc
  .array(
    fc.record({
      seqid: fc.constantFrom("ctg1", "ctg2", "ctg3"),
      start: fc.integer({ min: 1, max: 90000 }),
      len: fc.integer({ min: 20, max: 9000 }),
      strand: fc.constantFrom("+", "-", ".", "?"),
      exonOffsets: fc.array(fc.integer({ min: 0, max: 8500 }), { maxLength: 5 }),
    }),
    { maxLength: 14 }
  )
  .map((genes) => {
    const lines = ["##gff-version 3"];
    genes.forEach((g, i) => {
      const gid = "g" + i;
      const gEnd = g.start + g.len;
      lines.push(
        [g.seqid, "fc", "gene", g.start, gEnd, ".", g.strand, ".", "ID=" + gid].join("\t")
      );
      g.exonOffsets.forEach((off, j) => {
        const es = g.start + (off % g.len);
        const ee = Math.min(gEnd, es + 60);
        lines.push(
          [
            g.seqid,
            "fc",
            "exon",
            es,
            ee,
            ".",
            g.strand,
            ".",
            "ID=" + gid + "e" + j + ";Parent=" + gid,
          ].join("\t")
        );
      });
    });
    return lines.join("\n");
  });

// ── Parse resilience ─────────────────────────────────────────────────────────

suite("gff property — parseGff3 resilience");

test("never throws on arbitrary text", () => {
  check(
    fc.property(fc.oneof(arbAnyCsv, arbGffDoc, fc.string()), (text) => {
      parseGff3(text);
      return true;
    })
  );
});

test("every parsed feature has valid coordinates and strand", () => {
  check(
    fc.property(fc.oneof(arbAnyCsv, arbGffDoc, fc.string()), (text) => {
      const r = parseGff3(text);
      for (const ft of r.features) {
        if (!Number.isInteger(ft.start) || ft.start < 1) return false;
        if (!Number.isInteger(ft.end) || ft.end < ft.start) return false;
        if (!VALID_STRANDS.includes(ft.strand)) return false;
        if (ft.score !== null && !Number.isFinite(ft.score)) return false;
        if (!r.seqids.includes(ft.seqid)) return false;
      }
      return true;
    })
  );
});

test("seqids list is deduplicated", () => {
  check(
    fc.property(arbGffDoc, (text) => {
      const r = parseGff3(text);
      return new Set(r.seqids).size === r.seqids.length;
    })
  );
});

test("type counts sum to the feature total", () => {
  check(
    fc.property(arbGffDoc, (text) => {
      const r = parseGff3(text);
      let total = 0;
      for (const n of r.typeCounts.values()) total += n;
      return total === r.features.length;
    })
  );
});

// ── summarizeSeqids ──────────────────────────────────────────────────────────

suite("gff property — summarizeSeqids");

test("per-seqid feature counts sum to the total and extents are ordered", () => {
  check(
    fc.property(arbGffDoc, (text) => {
      const r = parseGff3(text);
      const summary = summarizeSeqids(r.features);
      let total = 0;
      for (const s of summary) {
        if (s.start > s.end) return false;
        total += s.featureCount;
      }
      return total === r.features.length;
    })
  );
});

// ── buildGeneModels ──────────────────────────────────────────────────────────

suite("gff property — buildGeneModels");

test("a model's span covers itself and all of its parts", () => {
  check(
    fc.property(arbGffDoc, (text) => {
      const r = parseGff3(text);
      for (const seqid of r.seqids) {
        for (const m of buildGeneModels(r.features, seqid)) {
          if (m.start > m.end) return false;
          if (m.start > m.feature.start || m.end < m.feature.end) return false;
          for (const p of m.parts) {
            if (p.start < m.start || p.end > m.end) return false;
          }
        }
      }
      return true;
    })
  );
});

test("model count never exceeds the seqid's feature count", () => {
  check(
    fc.property(arbGffDoc, (text) => {
      const r = parseGff3(text);
      for (const seqid of r.seqids) {
        const inSeq = r.features.filter((ft) => ft.seqid === seqid).length;
        if (buildGeneModels(r.features, seqid).length > inSeq) return false;
      }
      return true;
    })
  );
});

// ── packModels ───────────────────────────────────────────────────────────────

suite("gff property — packModels");

test("models sharing a lane never overlap", () => {
  check(
    fc.property(arbGffDoc, (text) => {
      const r = parseGff3(text);
      for (const seqid of r.seqids) {
        const models = buildGeneModels(r.features, seqid);
        const { packed, laneCount } = packModels(models, 0);
        // Group by lane; packed is already start-ascending.
        const byLane = new Map();
        for (const p of packed) {
          const arr = byLane.get(p.lane);
          if (arr) arr.push(p.model);
          else byLane.set(p.lane, [p.model]);
        }
        for (const arr of byLane.values()) {
          for (let i = 1; i < arr.length; i++) {
            if (arr[i].start <= arr[i - 1].end) return false;
          }
        }
        // laneCount is the exclusive upper bound on used lane indices.
        for (const p of packed) {
          if (p.lane < 0 || p.lane >= Math.max(1, laneCount)) return false;
        }
        if (packed.length !== models.length) return false;
      }
      return true;
    })
  );
});

// ── assignTypeColors ─────────────────────────────────────────────────────────

suite("gff property — assignTypeColors");

test("every type maps to a hex colour, deterministically", () => {
  check(
    fc.property(fc.array(fc.string({ maxLength: 12 }), { maxLength: 20 }), (types) => {
      const a = assignTypeColors(types);
      const b = assignTypeColors(types);
      for (const t of types) {
        const c = a.get(t);
        if (typeof c !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(c)) return false;
        if (b.get(t) !== c) return false;
      }
      return true;
    })
  );
});

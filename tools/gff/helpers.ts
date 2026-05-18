// Pure parsing + layout helpers for the Genome Track (GFF3) tool. No React /
// DOM dependency — tests/helpers/gff-loader.js loads this file directly. The
// SVG renderer, sidebar, and step panels live in sibling modules under
// tools/gff/.
//
// GFF3 reference: tab-delimited, 9 columns per feature line, `##` directive
// lines, `#` comment lines, and an optional `##FASTA` section after which the
// rest of the file is sequence data (skipped here — Plöttr draws annotation
// tracks, not sequence). Attribute values are URL-encoded; `Parent` / `ID`
// pairs wire features into a gene → mRNA → exon/CDS hierarchy.

import { PALETTE } from "../_core/color";

// ── Core types ───────────────────────────────────────────────────────────────

// GFF3 column 7. `.` = no strand, `?` = strand relevant but unknown.
export type GffStrand = "+" | "-" | "." | "?";

// One parsed feature line. `start` / `end` are 1-based inclusive (GFF3
// convention) and always satisfy `start <= end` even on the minus strand.
export interface GffFeature {
  lineNo: number;
  seqid: string;
  source: string;
  type: string;
  start: number;
  end: number;
  score: number | null;
  strand: GffStrand;
  phase: 0 | 1 | 2 | null;
  // Decoded attribute map — every reserved + custom tag, each value a list
  // (GFF3 allows comma-separated multi-values, e.g. `Parent=a,b`).
  attributes: Map<string, string[]>;
  id: string | null;
  parents: string[];
  // Display name: `Name` attribute, falling back to `ID`, then `type`.
  name: string;
}

// A line the parser could not turn into a feature. Collected, never thrown —
// a single bad row should not abort a 50k-line annotation file.
export interface GffParseWarning {
  lineNo: number;
  reason: string;
  text: string;
}

export interface GffParseResult {
  features: GffFeature[];
  // Distinct seqids in first-seen order — drives the contig picker.
  seqids: string[];
  // Feature type → occurrence count, in first-seen order.
  typeCounts: Map<string, number>;
  // `##sequence-region` declarations, keyed by seqid.
  sequenceRegions: Map<string, { start: number; end: number }>;
  version: string | null;
  // Capped at WARN_CAP entries; `skippedLines` is the true total.
  warnings: GffParseWarning[];
  skippedLines: number;
  fastaSkipped: boolean;
}

// One drawable segment of a gene model — an exon, a CDS chunk, a UTR, etc.
export interface GffPart {
  type: string;
  start: number;
  end: number;
  phase: 0 | 1 | 2 | null;
}

// A top-level feature plus its flattened leaf descendants. The track draws one
// of these per row item: the connector line spans `start..end`, the `parts`
// are the boxes. Multi-isoform genes collapse into a single union of leaves.
export interface GeneModel {
  key: string;
  feature: GffFeature;
  start: number;
  end: number;
  strand: GffStrand;
  parts: GffPart[];
}

// A gene model assigned to a horizontal lane by the interval packer.
export interface PackedModel {
  model: GeneModel;
  lane: number;
}

export interface PackResult {
  packed: PackedModel[];
  laneCount: number;
}

export interface SeqidSummary {
  seqid: string;
  featureCount: number;
  start: number;
  end: number;
}

// At most this many bad lines are kept with full detail; the rest only bump
// `skippedLines`. A pathological file can't balloon the result object.
const WARN_CAP = 50;

// ── Attribute parsing ────────────────────────────────────────────────────────

// Decode a GFF3 percent-encoded token. GFF3 uses RFC 3986 `%XX` escapes (and,
// unlike form-encoding, a literal `+` is NOT a space), so `decodeURIComponent`
// is the correct primitive. Malformed escapes are left verbatim rather than
// throwing.
export function gffDecode(s: string): string {
  if (s.indexOf("%") < 0) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Parse column 9 — `;`-separated `tag=value` pairs, each value a `,`-separated
// list. Keys and values are URL-decoded. Malformed pieces (no `=`, empty key)
// are skipped silently; a `.` placeholder yields an empty map.
export function parseGffAttributes(col9: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (typeof col9 !== "string" || col9 === "" || col9 === ".") return out;
  for (const piece of col9.split(";")) {
    const trimmed = piece.trim();
    if (trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = gffDecode(trimmed.slice(0, eq).trim());
    if (key === "") continue;
    out.set(
      key,
      trimmed
        .slice(eq + 1)
        .split(",")
        .map((v) => gffDecode(v))
    );
  }
  return out;
}

function truncateLine(raw: string): string {
  return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
}

// ── GFF3 document parser ─────────────────────────────────────────────────────

// Parse a whole GFF3 document. Never throws: structurally bad lines land in
// `warnings` (capped) and bump `skippedLines`. Stops at the `##FASTA`
// directive — Plöttr renders annotation, not sequence.
export function parseGff3(text: string): GffParseResult {
  const features: GffFeature[] = [];
  const warnings: GffParseWarning[] = [];
  const seqids: string[] = [];
  const seen = new Set<string>();
  const typeCounts = new Map<string, number>();
  const sequenceRegions = new Map<string, { start: number; end: number }>();
  let version: string | null = null;
  let skippedLines = 0;
  let fastaSkipped = false;

  const empty: GffParseResult = {
    features,
    seqids,
    typeCounts,
    sequenceRegions,
    version,
    warnings,
    skippedLines,
    fastaSkipped,
  };
  if (typeof text !== "string" || text === "") return empty;

  // Strip a leading UTF-8 BOM, then split on any newline flavour.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r\n|\r|\n/);

  const warn = (lineNo: number, reason: string, raw: string): void => {
    skippedLines++;
    if (warnings.length < WARN_CAP) warnings.push({ lineNo, reason, text: truncateLine(raw) });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (raw === "") continue;

    // `##FASTA` — everything below is sequence; stop reading features.
    if (raw === "##FASTA" || raw.startsWith("##FASTA\t") || raw.startsWith("##FASTA ")) {
      fastaSkipped = true;
      break;
    }
    // `##` directives — capture version + sequence-region bounds.
    if (raw.startsWith("##")) {
      const directive = raw.slice(2).trim();
      if (directive.startsWith("gff-version")) {
        version = directive.slice("gff-version".length).trim() || version;
      } else if (directive.startsWith("sequence-region")) {
        const p = directive.split(/\s+/);
        const s = Number(p[2]);
        const e = Number(p[3]);
        if (p.length >= 4 && Number.isFinite(s) && Number.isFinite(e)) {
          sequenceRegions.set(p[1], { start: s, end: e });
        }
      }
      continue;
    }
    // `#` — human comment.
    if (raw.startsWith("#")) continue;

    // Feature line: exactly 9 tab-separated columns per the GFF3 spec.
    const cols = raw.split("\t");
    if (cols.length < 9) {
      warn(lineNo, `expected 9 tab-separated columns, found ${cols.length}`, raw);
      continue;
    }
    const seqid = cols[0];
    const start = Number(cols[3]);
    const end = Number(cols[4]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      warn(lineNo, `invalid start/end coordinates ("${cols[3]}", "${cols[4]}")`, raw);
      continue;
    }
    const scoreTok = cols[5];
    const score = scoreTok === "." || !Number.isFinite(Number(scoreTok)) ? null : Number(scoreTok);
    const strandTok = cols[6];
    const strand: GffStrand =
      strandTok === "+" || strandTok === "-" || strandTok === "?" ? strandTok : ".";
    const phaseTok = cols[7];
    const phase: 0 | 1 | 2 | null =
      phaseTok === "0" ? 0 : phaseTok === "1" ? 1 : phaseTok === "2" ? 2 : null;
    const attributes = parseGffAttributes(cols[8]);
    const idArr = attributes.get("ID");
    const id = idArr && idArr.length > 0 ? idArr[0] : null;
    const nameArr = attributes.get("Name");
    const type = cols[2];
    const name = (nameArr && nameArr.length > 0 && nameArr[0]) || id || type;

    features.push({
      lineNo,
      seqid,
      source: cols[1],
      type,
      start,
      end,
      score,
      strand,
      phase,
      attributes,
      id,
      parents: attributes.get("Parent") ?? [],
      name,
    });
    if (!seen.has(seqid)) {
      seen.add(seqid);
      seqids.push(seqid);
    }
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }

  return {
    features,
    seqids,
    typeCounts,
    sequenceRegions,
    version,
    warnings,
    skippedLines,
    fastaSkipped,
  };
}

// ── Gene-model assembly ──────────────────────────────────────────────────────

// Resolve the ID/Parent graph for one seqid into drawable gene models. A
// feature with no resolvable parent is a model root; its leaf descendants
// (features with no children of their own — typically exons / CDS) become the
// model's `parts`. A root with no descendants draws as a single block.
//
// The walk is BFS with a visited guard, so a malformed file with a Parent
// cycle terminates instead of looping forever.
export function buildGeneModels(features: GffFeature[], seqid: string): GeneModel[] {
  const inSeq = features.filter((f) => f.seqid === seqid);
  const idSet = new Set<string>();
  for (const f of inSeq) if (f.id) idSet.add(f.id);

  const childrenOf = new Map<string, GffFeature[]>();
  for (const f of inSeq) {
    for (const p of f.parents) {
      if (!idSet.has(p)) continue;
      const arr = childrenOf.get(p);
      if (arr) arr.push(f);
      else childrenOf.set(p, [f]);
    }
  }
  const isChild = (f: GffFeature): boolean => f.parents.some((p) => idSet.has(p));
  const hasChildren = (f: GffFeature): boolean =>
    f.id != null && (childrenOf.get(f.id)?.length ?? 0) > 0;

  const models: GeneModel[] = [];
  for (const root of inSeq) {
    if (isChild(root)) continue;

    // Collect every descendant via BFS over the children map.
    const descendants: GffFeature[] = [];
    const visited = new Set<GffFeature>([root]);
    let frontier: GffFeature[] = root.id ? (childrenOf.get(root.id) ?? []) : [];
    while (frontier.length > 0) {
      const next: GffFeature[] = [];
      for (const f of frontier) {
        if (visited.has(f)) continue;
        visited.add(f);
        descendants.push(f);
        const kids = f.id ? childrenOf.get(f.id) : undefined;
        if (kids) for (const k of kids) if (!visited.has(k)) next.push(k);
      }
      frontier = next;
    }

    // Parts = leaf descendants. A root with descendants draws its leaves; a
    // root with none draws as one block (empty parts list).
    const parts: GffPart[] = [];
    for (const d of descendants) {
      if (!hasChildren(d)) {
        parts.push({ type: d.type, start: d.start, end: d.end, phase: d.phase });
      }
    }
    parts.sort((a, b) => a.start - b.start || a.end - b.end);

    let start = root.start;
    let end = root.end;
    for (const p of parts) {
      if (p.start < start) start = p.start;
      if (p.end > end) end = p.end;
    }
    models.push({ key: "f" + root.lineNo, feature: root, start, end, strand: root.strand, parts });
  }
  models.sort((a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key));
  return models;
}

// Greedy interval packing: assign each model to the first lane whose last
// occupied feature ends (with `gapBp` clearance) before this model starts.
// Models are processed start-ascending, which yields the minimum lane count.
export function packModels(models: GeneModel[], gapBp: number): PackResult {
  const gap = Number.isFinite(gapBp) && gapBp > 0 ? gapBp : 0;
  const laneEnds: number[] = [];
  const packed: PackedModel[] = [];
  const sorted = models.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  for (const model of sorted) {
    let lane = 0;
    while (lane < laneEnds.length && !(laneEnds[lane] < model.start - gap)) lane++;
    packed.push({ model, lane });
    laneEnds[lane] = model.end;
  }
  return { packed, laneCount: laneEnds.length };
}

// Per-seqid feature counts + coordinate extent — drives the configure-step
// summary table and the default plot view window.
export function summarizeSeqids(features: GffFeature[]): SeqidSummary[] {
  const m = new Map<string, SeqidSummary>();
  for (const f of features) {
    const cur = m.get(f.seqid);
    if (!cur) {
      m.set(f.seqid, { seqid: f.seqid, featureCount: 1, start: f.start, end: f.end });
    } else {
      cur.featureCount++;
      if (f.start < cur.start) cur.start = f.start;
      if (f.end > cur.end) cur.end = f.end;
    }
  }
  return [...m.values()];
}

// ── Colour + formatting ──────────────────────────────────────────────────────

// Sensible defaults for the common Sequence-Ontology types so a typical
// gene → mRNA → exon/CDS file always looks "right" without configuration.
// A Map (not a plain object) so a feature type literally named `__proto__`
// or `constructor` can't reach a prototype member instead of `undefined`.
const TYPE_COLOR_HINTS = new Map<string, string>([
  ["gene", "#648FFF"],
  ["mRNA", "#785EF0"],
  ["transcript", "#785EF0"],
  ["exon", "#0072B2"],
  ["CDS", "#DC267F"],
  ["five_prime_UTR", "#FE6100"],
  ["three_prime_UTR", "#FFB000"],
]);

// Map every feature type to a stable colour: a hint for known SO terms, then
// the shared colour-blind-safe PALETTE cycled for anything else.
export function assignTypeColors(types: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let paletteIdx = 0;
  for (const t of types) {
    if (map.has(t)) continue;
    const hint = TYPE_COLOR_HINTS.get(t);
    if (hint) {
      map.set(t, hint);
    } else {
      map.set(t, PALETTE[paletteIdx % PALETTE.length]);
      paletteIdx++;
    }
  }
  return map;
}

// Strand → colour for the "colour by strand" display mode.
export function strandColor(strand: GffStrand): string {
  if (strand === "+") return "#0072B2";
  if (strand === "-") return "#DC267F";
  return "#888888";
}

// Compact axis-tick rendering of a base-pair coordinate (kb / Mb suffixes).
export function formatBp(bp: number): string {
  if (!Number.isFinite(bp)) return "—";
  const abs = Math.abs(bp);
  if (abs >= 1e6) return (bp / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + " Mb";
  if (abs >= 1e3) return (bp / 1e3).toFixed(abs >= 1e4 ? 1 : 2) + " kb";
  return String(Math.round(bp));
}

// Exact base-pair coordinate with thousands separators — for tooltips and the
// feature-detail panel, where precision matters.
export function formatBpExact(bp: number): string {
  if (!Number.isFinite(bp)) return "—";
  return Math.round(bp).toLocaleString("en-US");
}

// ── Step / control prop bags ────────────────────────────────────────────────
//
// GffVis is declared here (not derived from VIS_INIT_GFF in app.tsx) so the
// chart / controls prop interfaces can reference it without a circular import.

export interface GffVis {
  plotTitle: string;
  plotSubtitle: string;
  plotBg: string;
  fontSize: number;
  featureHeight: number;
  // "type" colours each part by its feature type; "strand" colours by ±.
  colorMode: string;
  showLabels: boolean;
  showChevrons: boolean;
}

export type UpdGffVis = (patch: Partial<GffVis> | { _reset: true }) => void;

export interface GffChartProps {
  packed: PackedModel[];
  laneCount: number;
  seqid: string;
  viewStart: number;
  viewEnd: number;
  typeColors: Map<string, string>;
  colorMode: string;
  selectedKey: string | null;
  onSelect?: (key: string | null) => void;
  plotTitle: string;
  plotSubtitle: string;
  plotBg: string;
  fontSize: number;
  featureHeight: number;
  showLabels: boolean;
  showChevrons: boolean;
}

export interface UploadStepProps {
  handleFileLoad: (text: string, name: string) => void;
  handleTextPaste: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export interface ConfigureStepProps {
  fileName: string;
  result: GffParseResult;
  seqidSummary: SeqidSummary[];
}

export interface FeatureDetailPanelProps {
  model: GeneModel | null;
}

export interface PlotControlsProps {
  vis: GffVis;
  updVis: UpdGffVis;
  chartRef: React.RefObject<SVGSVGElement | null>;
  resetAll: () => void;
  fileName: string;
  seqids: string[];
  activeSeqid: string;
  setActiveSeqid: (s: string) => void;
  seqidSummary: SeqidSummary[];
  viewStart: number;
  viewEnd: number;
  setViewStart: (n: number) => void;
  setViewEnd: (n: number) => void;
  fitToContig: () => void;
  renderedTypes: string[];
  typeCounts: Map<string, number>;
  hiddenTypes: string[];
  toggleType: (t: string) => void;
  typeColors: Map<string, string>;
  featuresInView: GffFeature[];
}

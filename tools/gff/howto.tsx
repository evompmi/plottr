import type { HowToContent } from "../_shell";
export const GFF_HOWTO: HowToContent = {
  toolName: "gff",
  title: "Genome Track — How to use",
  subtitle: "Read a GFF3 annotation file and draw its features along the genome",
  purpose: (
    <>
      Turn a GFF3 / GFF annotation file into a genome-browser-style track — genes laid out along
      their contig, with exons and CDS drawn as boxes and introns as connecting lines.
    </>
  ),
  dataLayout: (
    <>
      Standard <strong>GFF3</strong>: tab-delimited, 9 columns per feature (
      <em>seqid, source, type, start, end, score, strand, phase, attributes</em>). <code>##</code>{" "}
      directive lines and <code>#</code> comments are handled; an <code>ID</code>/
      <code>Parent</code> hierarchy is resolved into gene models. Anything after a{" "}
      <code>##FASTA</code> line is skipped.
    </>
  ),
  display: (
    <>
      Pick a contig, then pan/zoom by editing the view window. Features pack into lanes so they
      never overlap. Colour by <strong>feature type</strong> or by <strong>strand</strong>; toggle
      strand chevrons and labels. Click any feature to see its full attribute list.
    </>
  ),
  tips: (
    <>
      Bad lines (wrong column count, invalid coordinates) are collected as warnings rather than
      aborting the file — check the Configure step to see what was skipped.
    </>
  ),
  capabilities: ["GFF3 / GFF", "ID/Parent gene models", "lane packing", "SVG / PNG / CSV export"],
};

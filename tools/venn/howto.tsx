import type { HowToContent } from "../_shell/HowTo";

export const VENN_HOWTO: HowToContent = {
  toolName: "venn",
  title: "Venn Diagram — How to use",
  subtitle: "Item-overlap between 2–3 sets, area-proportional or classic",
  purpose: (
    <>
      Show which items are shared between 2 or 3 sets (genes upregulated in two conditions; taxa
      common to multiple samples). For ≥ 4 sets, use the UpSet tool instead.
    </>
  ),
  dataLayout: (
    <>
      <strong>Wide</strong> — one column per set, items stacked in each column.{" "}
      <strong>Long</strong> — two columns: <em>item</em> and <em>set</em>. Both formats auto-detect.
    </>
  ),
  display: (
    <>
      Toggle between <strong>area-proportional</strong> (circle sizes scale with set size; subset
      relationships are exact) and <strong>classic</strong> (uniform-radius Euler-style). Click any
      region to drill down into its item list. CSV export per region.
    </>
  ),
};

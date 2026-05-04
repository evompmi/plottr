import type { HowToContent } from "../_shell/HowTo";

export const UPSET_HOWTO: HowToContent = {
  toolName: "upset",
  title: "UpSet Plot — How to use",
  subtitle: "Set-intersection sizes for 2+ sets, where Venn breaks down",
  purpose: (
    <>
      Show intersections between many sets at once — UpSet plots scale gracefully past three sets
      where Venn diagrams collapse into unreadable shapes.
    </>
  ),
  dataLayout: (
    <>
      <strong>Wide</strong> — one column per set, items stacked in each column.{" "}
      <strong>Long</strong> — two columns: <em>item</em> and <em>set</em>. Same format as Venn.
    </>
  ),
  display: (
    <>
      Each intersection is a column: top-half bar shows its size, bottom-half dot matrix shows the
      set membership. Sort by <strong>size</strong> (default) or <strong>degree</strong>; filter by
      minimum size + degree window. Per-intersection significance test against a uniform-random null
      with BH-adjusted p-values.
    </>
  ),
};

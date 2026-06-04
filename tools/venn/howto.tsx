import type { HowToContent } from "../_shell";
import { useT, type VennKey } from "./i18n";

// How-to content as a hook so it re-renders on language change. The
// dataLayout / display copy carries <strong>/<em> emphasis, rendered from
// authored HTML strings in the catalog (safe — not user input).
export function useVennHowTo(): HowToContent {
  const tr = useT();
  const html = (k: VennKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "venn",
    title: tr("venn.howto.title"),
    subtitle: tr("venn.howto.subtitle"),
    purpose: html("venn.howto.purpose"),
    dataLayout: html("venn.howto.dataLayout"),
    display: html("venn.howto.display"),
  };
}

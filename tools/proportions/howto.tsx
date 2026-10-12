import type { HowToContent } from "../_shell";
import { useT, type ProportionsKey } from "./i18n";

export function useProportionsHowTo(): HowToContent {
  const tr = useT();
  const html = (k: ProportionsKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "proportions",
    title: tr("proportions.howto.title"),
    subtitle: tr("proportions.howto.subtitle"),
    purpose: html("proportions.howto.purpose"),
    dataLayout: html("proportions.howto.dataLayout"),
    display: html("proportions.howto.display"),
  };
}

import type { HowToContent } from "../_shell";
import { useT, type VolcanoKey } from "./i18n";

export function useVolcanoHowTo(): HowToContent {
  const tr = useT();
  const html = (k: VolcanoKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "volcano",
    title: tr("volcano.howto.title"),
    subtitle: tr("volcano.howto.subtitle"),
    purpose: html("volcano.howto.purpose"),
    dataLayout: html("volcano.howto.dataLayout"),
    display: html("volcano.howto.display"),
  };
}

import type { HowToContent } from "../_shell";
import { useT, type BoxplotKey } from "./i18n";

export function useBoxplotHowTo(): HowToContent {
  const tr = useT();
  const html = (k: BoxplotKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "boxplot",
    title: tr("boxplot.howto.title"),
    subtitle: tr("boxplot.howto.subtitle"),
    purpose: html("boxplot.howto.purpose"),
    dataLayout: html("boxplot.howto.dataLayout"),
    display: html("boxplot.howto.display"),
    tips: html("boxplot.howto.tips"),
  };
}

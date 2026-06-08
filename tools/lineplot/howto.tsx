import type { HowToContent } from "../_shell";
import { useT, type LineplotKey } from "./i18n";

export function useLineplotHowTo(): HowToContent {
  const tr = useT();
  const html = (k: LineplotKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "lineplot",
    title: tr("lineplot.howto.title"),
    subtitle: tr("lineplot.howto.subtitle"),
    purpose: html("lineplot.howto.purpose"),
    dataLayout: html("lineplot.howto.dataLayout"),
    display: html("lineplot.howto.display"),
  };
}

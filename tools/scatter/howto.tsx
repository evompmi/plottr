import type { HowToContent } from "../_shell";
import { useT, type ScatterKey } from "./i18n";

export function useScatterHowTo(): HowToContent {
  const tr = useT();
  const html = (k: ScatterKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "scatter",
    title: tr("scatter.howto.title"),
    subtitle: tr("scatter.howto.subtitle"),
    purpose: html("scatter.howto.purpose"),
    dataLayout: html("scatter.howto.dataLayout"),
    display: html("scatter.howto.display"),
  };
}

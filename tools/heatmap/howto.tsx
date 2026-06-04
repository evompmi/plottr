import type { HowToContent } from "../_shell";
import { useT, type HeatmapKey } from "./i18n";

export function useHeatmapHowTo(): HowToContent {
  const tr = useT();
  const html = (k: HeatmapKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "heatmap",
    title: tr("heatmap.howto.title"),
    subtitle: tr("heatmap.howto.subtitle"),
    purpose: html("heatmap.howto.purpose"),
    dataLayout: html("heatmap.howto.dataLayout"),
    display: html("heatmap.howto.display"),
  };
}

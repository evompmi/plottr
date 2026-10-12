import type { HowToContent } from "../_shell";
import { useT, type QpcrKey } from "./i18n";

export function useQpcrHowTo(): HowToContent {
  const tr = useT();
  const html = (k: QpcrKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "qpcr",
    title: tr("qpcr.howto.title"),
    subtitle: tr("qpcr.howto.subtitle"),
    purpose: html("qpcr.howto.purpose"),
    dataLayout: html("qpcr.howto.dataLayout"),
    display: html("qpcr.howto.display"),
  };
}

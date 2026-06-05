import type { HowToContent } from "../_shell";
import { useT, type AequorinKey } from "./i18n";

export function useAequorinHowTo(): HowToContent {
  const tr = useT();
  const html = (k: AequorinKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "aequorin",
    title: tr("aequorin.howto.title"),
    subtitle: tr("aequorin.howto.subtitle"),
    purpose: html("aequorin.howto.purpose"),
    dataLayout: html("aequorin.howto.dataLayout"),
    display: html("aequorin.howto.display"),
  };
}

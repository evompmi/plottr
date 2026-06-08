import type { HowToContent } from "../_shell";
import { useT, type UpsetKey } from "./i18n";

export function useUpsetHowTo(): HowToContent {
  const tr = useT();
  const html = (k: UpsetKey) => <span dangerouslySetInnerHTML={{ __html: tr(k) }} />;
  return {
    toolName: "upset",
    title: tr("upset.howto.title"),
    subtitle: tr("upset.howto.subtitle"),
    purpose: html("upset.howto.purpose"),
    dataLayout: html("upset.howto.dataLayout"),
    display: html("upset.howto.display"),
  };
}

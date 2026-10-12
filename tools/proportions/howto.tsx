import { HowToExampleTable } from "../_shell";
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
    dataLayout: (
      <>
        {html("proportions.howto.dataLayout")}
        <HowToExampleTable
          headers={[
            tr("proportions.howto.exGroup"),
            tr("proportions.howto.exYes"),
            tr("proportions.howto.exNo"),
          ]}
          rows={[
            ["WT", "41", "7"],
            ["mutant-1", "3", "43"],
            ["mutant-2", "9", "41"],
          ]}
          highlight={[1, 2]}
          caption={tr("proportions.howto.exCaption")}
        />
        <HowToExampleTable
          headers={[
            tr("proportions.howto.exFamily"),
            tr("proportions.howto.exRY"),
            tr("proportions.howto.exRG"),
            tr("proportions.howto.exWY"),
            tr("proportions.howto.exWG"),
          ]}
          rows={[
            ["F2-1", "315", "108", "101", "32"],
            ["F2-2", "141", "44", "52", "13"],
          ]}
          caption={tr("proportions.howto.exCaption2")}
        />
      </>
    ),
    display: html("proportions.howto.display"),
  };
}

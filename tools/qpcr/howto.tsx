import { HowToExampleTable } from "../_shell";
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
    dataLayout: (
      <>
        {html("qpcr.howto.dataLayout")}
        <HowToExampleTable
          headers={["Sample", "Group", "Gene", "Ct"]}
          rows={[
            ["1", "Control", "ACT2", "18.52"],
            ["1", "Control", "ACT2", "18.47"],
            ["1", "Control", "RD29A", "27.31"],
            ["1", "Control", "RD29A", "Undetermined"],
            ["2", "Control", "ACT2", "18.61"],
            ["1", "Drought", "RD29A", "22.18"],
          ]}
          more
          caption={tr("qpcr.howto.exLongCaption")}
        />
        <HowToExampleTable
          headers={["Sample", "Group", "ACT2", "UBQ10", "RD29A"]}
          rows={[
            ["1", "Control", "18.50", "20.05", "27.31"],
            ["2", "Control", "18.61", "20.12", "26.85"],
            ["1", "Drought", "18.44", "19.98", "22.18"],
          ]}
          more
          caption={tr("qpcr.howto.exWideCaption")}
        />
      </>
    ),
    display: html("qpcr.howto.display"),
  };
}

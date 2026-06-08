import type { FormulaInjectionWarning } from "../_core/csv";
import { useShellT } from "./i18n";

// `FormulaInjectionBanner` — yellow alert banner that surfaces the
// result of `scanForFormulaInjection` at ingest time. Shows up when the
// uploaded file contains cells / headers that would trigger formula
// evaluation in Excel / LibreOffice / Sheets. Plöttr exports prefix
// these with a leading apostrophe to neutralise them, but the original
// file is unchanged so flagging the input is the safer signal.

const h = React.createElement;

interface FormulaInjectionBannerProps {
  warning: FormulaInjectionWarning | null;
}

export function FormulaInjectionBanner(props: FormulaInjectionBannerProps) {
  const tr = useShellT();
  const w = props.warning;
  if (!w || !w.count) return null;
  const trim = (v: unknown) => {
    const s = String(v);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  };
  const fmtCell = (c: { header?: string | null; row: number; col: number; value: unknown }) => {
    const where = c.header
      ? tr("shell.formula.cellWithHeader", { header: c.header, row: c.row + 1 })
      : tr("shell.formula.cellNoHeader", { row: c.row + 1, col: c.col + 1 });
    return where + ": " + trim(c.value);
  };
  const fmtHeader = (hdr: { idx: number; value: unknown }) => {
    return tr("shell.formula.colLabel", { n: hdr.idx + 1 }) + ": " + trim(hdr.value);
  };
  const examples: string[] = [];
  for (let i = 0; i < w.headers.length; i++)
    examples.push(tr("shell.formula.headerLabel") + fmtHeader(w.headers[i]));
  for (let i = 0; i < w.cells.length; i++) examples.push(fmtCell(w.cells[i]));
  const shown = examples.length;
  const overflow = w.count - shown;
  return h(
    "div",
    {
      role: "alert",
      style: {
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      },
    },
    h("span", { style: { fontSize: 18, lineHeight: "20px" }, "aria-hidden": "true" }, "⚠️"),
    h(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      h(
        "p",
        { style: { margin: 0, fontSize: 12, color: "var(--warning-text)", fontWeight: 700 } },
        tr("shell.formula.title", { count: w.count })
      ),
      h(
        "p",
        {
          style: {
            margin: "2px 0 6px",
            fontSize: 11,
            color: "var(--warning-text)",
            opacity: 0.9,
          },
        },
        tr("shell.formula.explain")
      ),
      h(
        "ul",
        {
          style: {
            margin: 0,
            paddingLeft: 18,
            fontSize: 11,
            color: "var(--warning-text)",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "Liberation Mono", monospace',
            wordBreak: "break-all",
          },
        },
        examples.map((e, i) => h("li", { key: i }, e))
      ),
      overflow > 0
        ? h(
            "p",
            {
              style: {
                margin: "4px 0 0",
                fontSize: 11,
                color: "var(--warning-text)",
                opacity: 0.85,
              },
            },
            tr("shell.formula.overflow", { count: overflow })
          )
        : null
    )
  );
}

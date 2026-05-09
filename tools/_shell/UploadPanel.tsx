// `UploadPanel` — separator selector + FileDropZone combo for the
// upload step. Disables the drop zone until a separator is picked.
// Optional `onLoadExample` button below the drop zone for the
// "try sample data" affordance every plot tool exposes.

import { FileDropZone } from "./FileDropZone";

const h = React.createElement;

interface UploadPanelProps {
  sepOverride: string;
  onSepChange: (s: string) => void;
  onFileLoad: (text: string, fileName: string) => void;
  onLoadExample?: () => void;
  exampleLabel?: React.ReactNode;
  hint?: string;
}

export function UploadPanel(props: UploadPanelProps) {
  const { sepOverride, onSepChange, onFileLoad, onLoadExample, exampleLabel, hint } = props;
  return h(
    "div",
    { className: "dv-panel" },
    h(
      "div",
      {
        style: {
          marginBottom: 12,
          padding: "12px 16px",
          background: "var(--info-bg)",
          borderRadius: 8,
          border: "1.5px solid var(--info-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        },
      },
      h(
        "label",
        {
          htmlFor: "dv-separator-select",
          style: { fontSize: 13, fontWeight: 600, color: "var(--accent-primary)" },
        },
        "Column separator"
      ),
      h(
        "select",
        {
          id: "dv-separator-select",
          value: sepOverride,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onSepChange(e.target.value),
          className: "dv-select-sep",
        },
        h("option", { value: "" }, "— Select —"),
        h("option", { value: "," }, "Comma (,)"),
        h("option", { value: ";" }, "Semicolon (;)"),
        h("option", { value: "\t" }, "Tab (\\t)"),
        h("option", { value: " " }, "Space")
      )
    ),
    !sepOverride
      ? h(
          "div",
          {
            style: {
              border: "2px dashed var(--border-strong)",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--surface-sunken)",
              opacity: 0.5,
            },
          },
          h("div", { style: { fontSize: 40, marginBottom: 8 }, "aria-hidden": "true" }, "🚫"),
          h(
            "p",
            { style: { margin: 0, fontSize: 15, color: "var(--text-faint)" } },
            "Pick a column separator above to enable file loading"
          )
        )
      : h(FileDropZone, {
          onFileLoad,
          accept: ".csv,.tsv,.txt,.dat,.tab",
          hint: hint || "CSV · TSV · TXT · DAT — 2 MB max",
        }),
    onLoadExample
      ? h(
          "div",
          {
            style: {
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-muted)",
            },
          },
          h("span", null, "Try sample data:"),
          h(
            "button",
            {
              type: "button",
              className: "dv-btn dv-btn-secondary",
              onClick: onLoadExample,
              "data-testid": "load-example",
            },
            exampleLabel || "Load example →"
          )
        )
      : null
  );
}

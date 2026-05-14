// `UploadPanel` — separator selector + FileDropZone combo for the
// upload step. Disables the drop zone until a separator is picked
// (legacy mode). When `autoDetect` is on, the picker is hidden by
// default — the tool's `doParse` calls `autoDetectSep` instead —
// and an "Override separator ▾" disclosure exposes the picker for
// the edge cases the auto-detector can't resolve. With `onTextPaste`
// set, Drop and Paste render side-by-side as equally-prominent cards
// so the paste path is discoverable without a toggle.
//
// When `exampleSummary` is supplied alongside `autoDetect`, the
// sample-dataset CTA promotes from the cramped "Try sample data:" line
// beneath the cards into a prominent banner at the very top of the
// upload step — icon, title, dataset description, primary button —
// because the legacy treatment is invisible under the two large cards.
//
// All three of these behaviours are opt-in props so the 7 other plot
// tools keep their existing UX untouched while we evaluate the
// auto-detect + paste + prominent-sample flow on boxplot.

import { DatasheetIcon } from "./DatasheetIcon";
import { FILE_LIMIT_BYTES, FILE_WARN_BYTES, FileDropZone } from "./FileDropZone";

const h = React.createElement;
const { useState } = React;

// Structured payload for the prominent sample-dataset banner in
// auto-detect mode. `icon` accepts any React node so callers can pass
// the polished per-tool SVG via `toolIcon(<key>, 32, { circle: true })`
// from `shared.js` — that's the canonical pro-looking choice and what
// every plot tool currently uses. Legacy emoji strings still render
// fine (React treats them as text children). When this prop is
// missing, the banner falls back to a generic "Try a sample dataset"
// pitch with `exampleLabel` as the subtitle (legacy compat).
export interface ExampleSummary {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  buttonLabel?: string;
}

interface UploadPanelProps {
  sepOverride: string;
  onSepChange: (s: string) => void;
  onFileLoad: (text: string, fileName: string) => void;
  onLoadExample?: () => void;
  exampleLabel?: React.ReactNode;
  hint?: string;
  // Opt-in: hide the separator picker behind an "Override" disclosure
  // and enable the drop zone immediately. The tool's `doParse` is
  // responsible for running `autoDetectSep(text, sepOverride)` itself
  // (sepOverride stays "" until the user expands and picks a value).
  autoDetect?: boolean;
  // Opt-in: surface a "Paste data" card alongside "Drop file" that
  // routes the textarea contents through the same parse pipeline as
  // a dropped file. Gates on FILE_LIMIT_BYTES / FILE_WARN_BYTES per
  // the ingest size policy in tools/CLAUDE.md.
  onTextPaste?: (text: string, fileName: string) => void;
  // Opt-in (autoDetect only): structured description for the prominent
  // sample-dataset banner at the top of the upload step. Replaces the
  // tiny bottom-of-card "Try sample data: [button]" affordance whose
  // visibility collapsed once Drop + Paste landed side-by-side.
  exampleSummary?: ExampleSummary;
}

export function UploadPanel(props: UploadPanelProps) {
  if (props.autoDetect) {
    return <AutoDetectUploadPanel {...props} />;
  }
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

// New auto-detect + side-by-side variant. Behaviour:
// - The separator picker is collapsed behind an "Override ▾" disclosure
//   that starts closed. The drop zone is enabled immediately; the tool's
//   parse pipeline calls autoDetectSep(text, sepOverride) so empty
//   sepOverride means "auto".
// - When `onTextPaste` is provided, the panel renders Drop / Paste as
//   two equally-prominent bordered cards in a 2-column grid — both
//   always visible, no tab toggle to discover. The Paste card holds a
//   textarea + "Parse pasted data" button; size is measured with
//   `new Blob([text]).size` to match FileDropZone's FILE_LIMIT_BYTES
//   gate exactly.
// - "Try sample data" stays in the same position as the legacy panel so
//   muscle memory and the load-example test selector still work.
function AutoDetectUploadPanel(props: UploadPanelProps) {
  const {
    sepOverride,
    onSepChange,
    onFileLoad,
    onLoadExample,
    exampleLabel,
    exampleSummary,
    hint,
    onTextPaste,
  } = props;
  const [overrideOpen, setOverrideOpen] = useState(sepOverride !== "");
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteWarn, setPasteWarn] = useState<string | null>(null);

  // Prominent sample-dataset banner. Renders only when the tool provides
  // `onLoadExample`; pulls structured title / subtitle / icon from
  // `exampleSummary`, with `exampleLabel` as a plain-string fallback.
  const renderSamplePromo = () => {
    if (!onLoadExample) return null;
    const summary: ExampleSummary = exampleSummary ?? {
      title: "Try a sample dataset",
      subtitle: typeof exampleLabel === "string" ? exampleLabel : undefined,
    };
    const buttonLabel = summary.buttonLabel ?? "Plot this example →";
    return (
      <div
        style={{
          marginBottom: 16,
          padding: "14px 18px",
          background: "var(--success-bg)",
          borderRadius: 12,
          border: "1.5px solid var(--success-border)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
        data-testid="sample-promo"
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            lineHeight: 1,
            flexShrink: 0,
            // Slight dim so the icon supports the title without competing.
            // The previous per-tool `toolIcon` art with a white circle was
            // too visually central — feedback was "too attractive".
            opacity: 0.7,
          }}
          aria-hidden="true"
        >
          {summary.icon ?? <DatasheetIcon size={36} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              color: "var(--success-text)",
              opacity: 0.75,
              marginBottom: 2,
            }}
          >
            New here? Quick start
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--success-text)" }}>
            {summary.title}
          </div>
          {summary.subtitle && (
            <div
              style={{
                fontSize: 12,
                color: "var(--success-text)",
                opacity: 0.85,
                marginTop: 2,
              }}
            >
              {summary.subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onLoadExample}
          className="dv-btn dv-btn-primary"
          style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, padding: "8px 14px" }}
          data-testid="load-example"
        >
          {buttonLabel}
        </button>
      </div>
    );
  };

  const submitPaste = () => {
    setPasteError(null);
    setPasteWarn(null);
    const text = pasteText;
    if (!text || text.trim() === "") {
      setPasteError("Paste some data first — copy a selection from Excel, Sheets, or any CSV.");
      return;
    }
    const bytes = new Blob([text]).size;
    if (bytes > FILE_LIMIT_BYTES) {
      setPasteError(
        `Pasted data too large (${(bytes / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB — split the data or sample rows and try again.`
      );
      return;
    }
    if (bytes > FILE_WARN_BYTES) {
      setPasteWarn(
        `Large paste (${(bytes / 1024 / 1024).toFixed(1)} MB) — parsing may take a moment.`
      );
    }
    if (onTextPaste) onTextPaste(text, "pasted_data.csv");
  };

  const cardWrap: React.CSSProperties = {
    borderRadius: 12,
    border: "1.5px solid var(--border)",
    background: "var(--surface)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };
  const cardHeader: React.CSSProperties = {
    background: "var(--surface-subtle)",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };
  const cardHeaderLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text)",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  };
  const cardBody: React.CSSProperties = { padding: 14, flex: 1 };

  return (
    <div className="dv-panel">
      {renderSamplePromo()}
      <div
        style={{
          marginBottom: 12,
          padding: "10px 14px",
          background: "var(--info-bg)",
          borderRadius: 8,
          border: "1.5px solid var(--info-border)",
          fontSize: 12,
          color: "var(--info-text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true">ℹ</span>
          <span>
            Plöttr auto-detects the column separator (comma, tab, semicolon, …) from the data.
          </span>
          <button
            type="button"
            onClick={() => setOverrideOpen((v) => !v)}
            className="dv-btn dv-btn-secondary"
            style={{
              marginLeft: "auto",
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 600,
            }}
            aria-expanded={overrideOpen}
          >
            {overrideOpen ? "Hide override ▴" : "Override ▾"}
          </button>
        </div>
        {overrideOpen && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid var(--info-border)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <label
              htmlFor="dv-separator-select"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-primary)" }}
            >
              Force separator
            </label>
            <select
              id="dv-separator-select"
              value={sepOverride}
              onChange={(e) => onSepChange(e.target.value)}
              className="dv-select-sep"
            >
              <option value="">Auto-detect</option>
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value={"\t"}>Tab (\t)</option>
              <option value=" ">Space</option>
            </select>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Only needed when the detector picks the wrong delimiter.
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: onTextPaste ? "1fr 1fr" : "1fr",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        <div style={cardWrap}>
          <div style={cardHeader}>
            <span aria-hidden="true">📂</span>
            <span style={cardHeaderLabel}>Drop a file</span>
          </div>
          <div style={cardBody}>
            <FileDropZone
              onFileLoad={onFileLoad}
              accept=".csv,.tsv,.txt,.dat,.tab"
              hint={hint || "CSV · TSV · TXT · DAT — 2 MB max"}
            />
          </div>
        </div>

        {onTextPaste && (
          <div style={cardWrap}>
            <div style={cardHeader}>
              <span aria-hidden="true">📋</span>
              <span style={cardHeaderLabel}>Paste data</span>
            </div>
            <div style={cardBody}>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  "Paste comma-, tab-, or semicolon-separated rows here.\n" +
                  "Tip: a selection copied from Excel or Google Sheets becomes tab-separated automatically."
                }
                className="dv-input"
                spellCheck={false}
                style={{
                  width: "100%",
                  minHeight: 160,
                  boxSizing: "border-box",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.4,
                  padding: "10px 12px",
                  resize: "vertical",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
                aria-label="Paste tabular data"
              />
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={submitPaste}
                  className="dv-btn dv-btn-primary"
                  disabled={pasteText.trim() === ""}
                  data-testid="paste-parse"
                >
                  Parse pasted data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasteText("");
                    setPasteError(null);
                    setPasteWarn(null);
                  }}
                  className="dv-btn dv-btn-secondary"
                  disabled={pasteText === ""}
                >
                  Clear
                </button>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>2 MB max</span>
              </div>
              {pasteError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--danger-text)",
                    fontWeight: 600,
                  }}
                >
                  <span aria-hidden="true">🚫</span>
                  <span>{pasteError}</span>
                </div>
              )}
              {pasteWarn && (
                <div
                  role="status"
                  style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--warning-text)",
                  }}
                >
                  <span aria-hidden="true">⚠️</span>
                  <span>{pasteWarn}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sample-dataset CTA moved to the prominent banner at the top
          (renderSamplePromo). The old bottom-of-card affordance is gone
          in auto-detect mode — it was unreadable beneath the side-by-side
          Drop + Paste cards, which was the whole point of the move. */}
    </div>
  );
}

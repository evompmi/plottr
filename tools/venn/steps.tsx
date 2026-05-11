// venn/steps.tsx — UploadStep + ConfigureStep panels for the Venn tool. The
// Plot step's render lives in `plot-area.tsx` (chart + selection panels);
// only the upload and configure steps live here.

import type { UploadStepProps, ConfigureStepProps } from "./helpers";
import { DataPreview, HowTo, UploadPanel, navigateToTool } from "../_shell";
import { VENN_HOWTO } from "./howto";

export function UploadStep({
  sepOverride,
  setSepOverride,
  handleFileLoad,
  handleTextPaste,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onTextPaste={handleTextPaste}
        autoDetect
        onLoadExample={onLoadExample}
        exampleSummary={{
          icon: "🧬",
          title: "Arabidopsis stress-response DEGs",
          subtitle: "3 sets — Drought · Heat · Salt",
          buttonLabel: "Plot this example →",
        }}
        hint="CSV · TSV · TXT — wide (one column per set, 2–3) or long (item, set) · 2 MB max"
      />
      <HowTo {...VENN_HOWTO} />
    </div>
  );
}

export function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  allColumnNames,
  allColumnSets,
  pendingSelection,
  setPendingSelection,
  isLongFormat,
}: ConfigureStepProps) {
  const needsPicker = allColumnNames.length > 3;
  const selectedCount = pendingSelection.length;

  const openUpset = (e: React.MouseEvent) => {
    e.preventDefault();
    // Hand the currently-loaded dataset off to the UpSet tool so it doesn't
    // open showing whatever stale file the user had loaded there before.
    // We rebuild a TSV from the already-parsed headers/rows (rather than
    // keeping a copy of the raw bytes around) and let UpSet re-parse it.
    // Tabs/newlines inside cells are flattened to spaces — set-membership
    // values are typically alphanumeric IDs so this is effectively a no-op
    // for real data and just hardens against the rare odd cell.
    const escape = (c: unknown) => String(c == null ? "" : c).replace(/[\t\n\r]/g, " ");
    const tsv = [
      parsedHeaders.map(escape).join("\t"),
      ...parsedRows.map((r: string[]) => r.map(escape).join("\t")),
    ].join("\n");
    const payload = {
      type: "dataviz-handoff",
      text: tsv,
      fileName: fileName || "",
      sep: "\t",
      format: isLongFormat ? "long" : "wide",
    };
    // SPA + standalone-page path: stash in sessionStorage (UpSet's
    // mount-time effect consumes the entry and clears it) and ask
    // `navigateToTool` to switch the view. In SPA mode the helper
    // calls the registered hash-router navigator and the same
    // document just rerenders; in legacy / standalone-page mode it
    // falls back to a top-level navigation to upset.html. The pre-SPA
    // sibling-iframe postMessage path is gone — it relied on UpSet
    // already being mounted next door, which only ever held inside
    // the iframe shell.
    try {
      sessionStorage.setItem("dataviz-upset-handoff", JSON.stringify(payload));
    } catch {
      /* storage disabled — fall back to opening UpSet without the data */
    }
    // Notify same-tab consumers. Under the SPA's keep-alive routing,
    // UpSet may already be mounted from an earlier visit, in which
    // case its mount-time sessionStorage read happened long ago and
    // won't fire again. Dispatching a synchronous CustomEvent gives
    // the already-mounted UpSet a chance to re-read the sessionStorage
    // key. If UpSet hasn't been visited yet, no listener is attached
    // and the mount-time path picks up the payload after navigation.
    try {
      window.dispatchEvent(
        new CustomEvent("plottr-handoff", { detail: { key: "dataviz-upset-handoff" } })
      );
    } catch {
      /* swallow */
    }
    navigateToTool("upset");
  };
  const showNudge = allColumnNames.length >= 4;

  const toggle = (name: string) => {
    setPendingSelection((prev: string[]) => {
      if (prev.includes(name)) return prev.filter((n: string) => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  let pickerStatusText = "Pick 2 or 3 sets to overlap.";
  let pickerStatusColor = "var(--text-muted)";
  if (selectedCount === 1) {
    pickerStatusText = "1 selected — pick at least one more.";
    pickerStatusColor = "var(--warning-text)";
  } else if (selectedCount === 2 || selectedCount === 3) {
    pickerStatusText = `${selectedCount} selected — ready to plot.`;
    pickerStatusColor = "var(--success-text)";
  }

  return (
    <div>
      {showNudge && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
            color: "var(--info-text)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
          }}
        >
          <span style={{ fontSize: 16 }}>💡</span>
          <span style={{ flex: 1 }}>
            <strong>{allColumnNames.length} sets detected</strong> — Venn diagrams only render 2 or
            3 sets. For 4+ sets, use the UpSet tool.
          </span>
          <a
            href="upset.html"
            onClick={openUpset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              background: "var(--cta-primary-bg)",
              color: "var(--on-accent)",
              fontWeight: 700,
              fontSize: 12,
              textDecoration: "none",
              whiteSpace: "nowrap",
              boxShadow: "var(--cta-primary-shadow)",
            }}
          >
            Open in UpSet →
          </a>
        </div>
      )}
      {needsPicker && (
        <div className="dv-panel">
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Choose sets to overlap
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: pickerStatusColor }}>
            {pickerStatusText}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 6,
            }}
          >
            {allColumnNames.map((name: string) => {
              const checked = pendingSelection.includes(name);
              const atCap = !checked && pendingSelection.length >= 3;
              const size = allColumnSets.get(name)?.size ?? 0;
              return (
                <label
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border)"}`,
                    background: checked ? "var(--info-bg)" : "var(--surface-subtle)",
                    cursor: atCap ? "not-allowed" : "pointer",
                    opacity: atCap ? 0.5 : 1,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={atCap}
                    onChange={() => toggle(name)}
                    style={{ accentColor: "var(--cta-primary-bg)" }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      flex: "1 1 auto",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}
                  >
                    {size}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <div className="dv-panel" style={{ marginTop: needsPicker || showNudge ? 16 : 0 }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>
    </div>
  );
}

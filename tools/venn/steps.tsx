// venn/steps.tsx — UploadStep + ConfigureStep panels for the Venn tool. The
// Plot step's render lives in `plot-area.tsx` (chart + selection panels);
// only the upload and configure steps live here.

export function UploadStep({ sepOverride, setSepOverride, handleFileLoad, onLoadExample }: any) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Arabidopsis abiotic stress genes (Drought / Heat / Salt)"
        hint="CSV · TSV · TXT — wide (one column per set, 2–3) or long (item, set) · 2 MB max"
      />
      <HowToCard
        toolName="venn"
        title="Venn Diagram — How to use"
        subtitle="Upload wide or long data → review sets → plot"
      >
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
            gridColumn: "1/-1",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Data layout (wide format)
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.75,
              color: "var(--text-muted)",
              margin: "0 0 10px",
            }}
          >
            Each <strong>column</strong> = one set (2 to 3 columns). Each <strong>row</strong> lists
            one item per set. Columns can have different lengths — empty cells are ignored.
            Long-format files with two columns (<em>item</em>, <em>set</em>) are auto-detected and
            reshaped to wide on upload.
          </p>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead>
              <tr style={{ background: "var(--info-bg)" }}>
                {["Set A", "Set B", "Set C"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "4px 10px",
                      textAlign: "left",
                      color: "var(--accent-primary)",
                      fontWeight: 700,
                      borderBottom: "1.5px solid var(--info-border)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["gene1", "gene2", "gene1"],
                ["gene3", "gene3", "gene4"],
                ["gene5", "gene1", "gene6"],
                ["gene7", "", ""],
              ].map((r, i) => (
                <tr
                  key={i}
                  style={{ background: i % 2 === 0 ? "var(--surface-subtle)" : "var(--surface)" }}
                >
                  {r.map((v, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "3px 10px",
                        color: v ? "var(--text)" : "var(--border-strong)",
                        fontFamily: "monospace",
                      }}
                    >
                      {v || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Features
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Equal-size circles by default, with optional area-proportional mode. Click any region
            count to highlight it and view its items. Rename sets, adjust colors and opacity from
            the plot controls.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Export
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Download the diagram as <strong>SVG</strong> or <strong>PNG</strong>. Export item lists
            per region or a full membership matrix as <strong>CSV</strong>.
          </p>
        </div>

        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "2–3 sets",
            "Proportional toggle",
            "Subset detection",
            "Item extraction",
            "SVG / PNG / CSV export",
            "100% browser-side",
          ].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--surface)",
                border: "1px solid var(--info-border)",
                color: "var(--text-muted)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </HowToCard>
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
}: any) {
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
    // In-iframe path: post directly into the sibling UpSet iframe (same
    // origin, so we can reach it via parent.document) before asking the
    // landing page to switch views. postMessage delivery is synchronous so
    // the data arrives before the user sees the UpSet view.
    if (window.parent && window.parent !== window) {
      try {
        const frame = window.parent.document.getElementById("frame-upset") as HTMLIFrameElement;
        // Origin-pin both targets so a hostile embedder can't sniff the
        // handoff payload by intercepting wildcard postMessages. Both
        // hops are same-origin by construction (sibling iframes from the
        // landing page); pin to `window.location.origin` and let the
        // browser drop the message if any frame ever lands cross-origin.
        if (frame && frame.contentWindow)
          frame.contentWindow.postMessage(payload, window.location.origin);
      } catch {
        /* cross-origin or detached — fall through to the openTool ask */
      }
      window.parent.postMessage({ type: "openTool", tool: "upset" }, window.location.origin);
    } else {
      // Standalone path: stash in sessionStorage and full-page navigate.
      // UpSet's mount-time effect consumes the entry and clears it.
      try {
        sessionStorage.setItem("dataviz-upset-handoff", JSON.stringify(payload));
      } catch {
        /* storage disabled — fall back to opening UpSet without the data */
      }
      window.location.href = "upset.html";
    }
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

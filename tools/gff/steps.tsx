// gff/steps.tsx — UploadStep (drop / paste a GFF3 file), ConfigureStep (parse
// summary + type & contig breakdown + skipped-line warnings), and
// FeatureDetailPanel (the attribute dump for the clicked feature).

import { FILE_LIMIT_BYTES, FILE_WARN_BYTES, FileDropZone, HowTo } from "../_shell";
import { assignTypeColors, formatBpExact } from "./helpers";
import type { ConfigureStepProps, FeatureDetailPanelProps, UploadStepProps } from "./helpers";
import { GFF_HOWTO } from "./howto";

const { useState } = React;

// ── Upload step ──────────────────────────────────────────────────────────────

export function UploadStep({ handleFileLoad, handleTextPaste, onLoadExample }: UploadStepProps) {
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const submitPaste = () => {
    setPasteError(null);
    if (pasteText.trim() === "") {
      setPasteError("Paste some GFF3 text first.");
      return;
    }
    const bytes = new Blob([pasteText]).size;
    if (bytes > FILE_LIMIT_BYTES) {
      setPasteError(
        `Pasted data too large (${(bytes / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB — load it as a file instead.`
      );
      return;
    }
    handleTextPaste(pasteText, "pasted.gff3");
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
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text)",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  };

  return (
    <div>
      <div className="dv-panel">
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
        >
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
              Three-gene demo annotation
            </div>
            <div
              style={{ fontSize: 12, color: "var(--success-text)", opacity: 0.85, marginTop: 2 }}
            >
              A small GFF3 contig — genes with mRNA, exons and CDS on both strands.
            </div>
          </div>
          <button
            type="button"
            onClick={onLoadExample}
            className="dv-btn dv-btn-primary"
            style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, padding: "8px 14px" }}
            data-testid="load-example"
          >
            Plot this example →
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={cardWrap}>
            <div style={cardHeader}>
              <span aria-hidden="true">📂</span>
              <span>Drop a file</span>
            </div>
            <div style={{ padding: 14 }}>
              <FileDropZone
                onFileLoad={handleFileLoad}
                accept=".gff,.gff3,.gff2,.gtf,.txt"
                hint="GFF3 / GFF — tab-delimited feature table · 2 MB max"
              />
            </div>
          </div>

          <div style={cardWrap}>
            <div style={cardHeader}>
              <span aria-hidden="true">📋</span>
              <span>Paste GFF3</span>
            </div>
            <div style={{ padding: 14 }}>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"##gff-version 3\nchr1\tsrc\tgene\t1000\t3500\t.\t+\t.\tID=gene1"}
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
                aria-label="Paste GFF3 text"
              />
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={submitPaste}
                  className="dv-btn dv-btn-primary"
                  disabled={pasteText.trim() === ""}
                  data-testid="paste-parse"
                >
                  Parse pasted data
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
                    fontSize: 12,
                    color: "var(--danger-text)",
                    fontWeight: 600,
                  }}
                >
                  {pasteError}
                </div>
              )}
            </div>
          </div>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
          Large pastes ({(FILE_WARN_BYTES / 1024 / 1024).toFixed(0)} MB+) may take a moment to
          parse.
        </p>
      </div>

      <HowTo {...GFF_HOWTO} />
    </div>
  );
}

// ── Configure step ───────────────────────────────────────────────────────────

export function ConfigureStep({ fileName, result, seqidSummary }: ConfigureStepProps) {
  const types = [...result.typeCounts.keys()];
  const typeColors = assignTypeColors(types);
  const fact: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
  const strong: React.CSSProperties = { color: "var(--text)", fontWeight: 700 };

  return (
    <div>
      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 6px" }}>
          Parsed <strong style={{ color: "var(--text)" }}>{fileName}</strong>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 22px" }}>
          <span style={fact}>
            <span style={strong}>{result.features.length.toLocaleString()}</span> features
          </span>
          <span style={fact}>
            <span style={strong}>{result.seqids.length}</span>{" "}
            {result.seqids.length === 1 ? "contig" : "contigs"}
          </span>
          <span style={fact}>
            <span style={strong}>{result.typeCounts.size}</span> feature types
          </span>
          <span style={fact}>
            GFF version <span style={strong}>{result.version ?? "unspecified"}</span>
          </span>
        </div>
        {result.fastaSkipped && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            A <code>##FASTA</code> section was found — sequence data below it was skipped.
          </p>
        )}
      </div>

      <div className="dv-panel" style={{ marginTop: 16 }}>
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          Feature types
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {types.map((t) => {
            const swatch = typeColors.get(t) || "#888888";
            return (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 11, height: 11, borderRadius: 2, background: swatch }}
                />
                <span style={{ flex: 1, color: "var(--text)", fontWeight: 600 }}>{t}</span>
                <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>
                  {(result.typeCounts.get(t) ?? 0).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dv-panel" style={{ marginTop: 16 }}>
        <p className="dv-tile-title" style={{ margin: "0 0 8px" }}>
          Contigs
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {seqidSummary.map((s) => (
            <div
              key={s.seqid}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
            >
              <span style={{ flex: 1, color: "var(--text)", fontWeight: 600 }}>{s.seqid}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {formatBpExact(s.start)}–{formatBpExact(s.end)} bp
              </span>
              <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>
                {s.featureCount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {result.skippedLines > 0 && (
        <div
          className="dv-panel"
          style={{
            marginTop: 16,
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
          }}
        >
          <p className="dv-tile-title" style={{ margin: "0 0 6px", color: "var(--warning-text)" }}>
            {result.skippedLines.toLocaleString()} line
            {result.skippedLines === 1 ? "" : "s"} skipped
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--warning-text)" }}>
            These rows could not be parsed as GFF3 features and were left out. Everything else
            loaded fine.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {result.warnings.map((w, i) => (
              <div
                key={i}
                style={{ fontSize: 11, color: "var(--warning-text)", fontFamily: "monospace" }}
              >
                line {w.lineNo}: {w.reason}
              </div>
            ))}
            {result.skippedLines > result.warnings.length && (
              <div style={{ fontSize: 11, color: "var(--warning-text)" }}>
                … and {(result.skippedLines - result.warnings.length).toLocaleString()} more.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feature detail panel ─────────────────────────────────────────────────────

export function FeatureDetailPanel({ model }: FeatureDetailPanelProps) {
  if (!model) {
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        Click a feature on the track to see its attributes.
      </div>
    );
  }
  const f = model.feature;
  const rowLabel: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-faint)",
    width: 96,
    flexShrink: 0,
  };
  const rowValue: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text)",
    wordBreak: "break-word",
  };
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
      <span style={rowLabel}>{label}</span>
      <span style={rowValue}>{children}</span>
    </div>
  );

  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
        {f.name} <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({f.type})</span>
      </p>
      <Row label="Location">
        <span style={{ fontFamily: "monospace" }}>
          {f.seqid}:{formatBpExact(f.start)}–{formatBpExact(f.end)}
        </span>{" "}
        ({(f.end - f.start + 1).toLocaleString()} bp, {f.strand} strand)
      </Row>
      <Row label="Source">{f.source}</Row>
      <Row label="Score">{f.score == null ? "—" : String(f.score)}</Row>
      <Row label="Phase">{f.phase == null ? "—" : String(f.phase)}</Row>
      {model.parts.length > 0 && (
        <Row label="Parts">
          {model.parts.length} segment{model.parts.length === 1 ? "" : "s"} —{" "}
          {model.parts.filter((p) => p.type === "CDS").length} CDS
        </Row>
      )}

      <p
        style={{
          margin: "10px 0 4px",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.6px",
        }}
      >
        Attributes
      </p>
      {f.attributes.size === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>None.</p>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--surface-subtle)",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {[...f.attributes.entries()].map(([k, vals]) => (
            <div
              key={k}
              style={{
                display: "flex",
                gap: 8,
                padding: "3px 10px",
                borderBottom: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--accent-primary)", fontWeight: 700, flexShrink: 0 }}>
                {k}
              </span>
              <span
                style={{ color: "var(--text)", wordBreak: "break-word", fontFamily: "monospace" }}
              >
                {vals.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

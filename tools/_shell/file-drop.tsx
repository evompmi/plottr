// `FileDropZone` — drag-and-drop / click-to-browse upload widget shared by
// every tool's UploadStep. Gates on the canonical `FILE_LIMIT_BYTES`
// (2 MB hard reject) and `FILE_WARN_BYTES` (1 MB warn) constants exported
// here too — any new ingest surface (paste textarea, URL fetch, …) must
// gate on the same constants and surface the same red-banner UX.
//
// 2026-05 migration from `tools/shared-file-drop.js`: converted to JSX,
// `FILE_LIMIT_BYTES` / `FILE_WARN_BYTES` exported alongside.

const { useState, useRef } = React;

// 2 MB — hard reject. Any new ingest surface (paste textarea, URL fetch,
// clipboard image OCR, …) must gate on this and the warning threshold
// below; don't redeclare a local 2-MB number, don't pick your own.
export const FILE_LIMIT_BYTES = 2 * 1024 * 1024;
// 1 MB — show warning but allow.
export const FILE_WARN_BYTES = 1 * 1024 * 1024;

interface FileDropZoneProps {
  onFileLoad: (text: string, fileName: string) => void;
  // Comma-separated extension list passed to the hidden `<input type="file">`.
  // Default covers the canonical text formats the parsers handle.
  accept?: string;
  // Sub-text under the main "Drop CSV, TSV, or TXT" line. Override per-tool
  // to spell out additional accepted extensions or constraints.
  hint?: string;
}

export function FileDropZone({
  onFileLoad,
  accept = ".csv,.tsv,.txt,.dat",
  hint = "CSV · TSV · TXT · DAT — 2 MB max",
}: FileDropZoneProps) {
  const [drag, setDrag] = useState(false);
  const [focus, setFocus] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [sizeWarn, setSizeWarn] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handle = (file: File) => {
    setSizeError(null);
    setSizeWarn(null);
    setReadError(null);
    if (file.size > FILE_LIMIT_BYTES) {
      setSizeError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB — split the file or sample rows and try again.`
      );
      return;
    }
    if (file.size > FILE_WARN_BYTES) {
      setSizeWarn(
        `Large file (${(file.size / 1024 / 1024).toFixed(1)} MB) — parsing may take a moment.`
      );
    }
    const reader = new FileReader();
    // `onload` used to fire `onFileLoad` directly; `onerror` was never wired,
    // so a corrupt file or blocked read silently did nothing and the user
    // was left staring at the drop zone wondering what happened. Audit M3.
    setReading(true);
    reader.onload = (e) => {
      setReading(false);
      onFileLoad(String(e.target?.result ?? ""), file.name);
    };
    reader.onerror = () => {
      setReading(false);
      const msg = (reader.error && (reader.error.message || reader.error.name)) || "unknown error";
      setReadError(`Couldn't read the file (${msg}). Check permissions and try again.`);
    };
    reader.readAsText(file);
  };

  const openPicker = () => inputRef.current && inputRef.current.click();

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a data file here or press Enter to browse"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
        }}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          border: `2px dashed ${
            drag ? "var(--accent-primary)" : sizeError ? "var(--danger-text)" : "var(--text-faint)"
          }`,
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: drag
            ? "var(--accent-primary-weak)"
            : sizeError
              ? "var(--danger-bg)"
              : "transparent",
          transition: "all .2s",
          outline: focus ? "2px solid var(--accent-primary)" : "none",
          outlineOffset: 2,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) handle(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">
          📂
        </div>
        <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
          Drop CSV, TSV, or TXT — or click to browse
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-faint)" }}>{hint}</p>
      </div>
      {sizeError && (
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
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden="true">
            🚫
          </span>
          <span style={{ fontSize: 12, color: "var(--danger-text)", fontWeight: 600 }}>
            {sizeError}
          </span>
        </div>
      )}
      {sizeWarn && (
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
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden="true">
            ⚠️
          </span>
          <span style={{ fontSize: 12, color: "var(--warning-text)" }}>{sizeWarn}</span>
        </div>
      )}
      {readError && (
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
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden="true">
            🚫
          </span>
          <span style={{ fontSize: 12, color: "var(--danger-text)", fontWeight: 600 }}>
            {readError}
          </span>
        </div>
      )}
      {reading && (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--info-text)",
          }}
        >
          Reading file…
        </div>
      )}
    </div>
  );
}

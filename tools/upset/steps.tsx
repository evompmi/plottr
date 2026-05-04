// upset/steps.tsx — UploadStep (with explicit Wide/Long format toggle),
// ConfigureStep (rename / colour / include + degree window), and
// ItemListPanel (the per-intersection items table + CSV download).

import {
  intersectionLabel,
  intersectionFilenamePart,
  computeMemberships,
  enumerateIntersections,
} from "./helpers";
import type {
  ConfigureStepProps,
  Intersection,
  ItemListPanelProps,
  UploadStepProps,
} from "./helpers";
import { HowTo } from "../_shell/HowTo";
import { UPSET_HOWTO } from "./howto";

const { useEffect, useMemo } = React;

// ── Upload step ─────────────────────────────────────────────────────────────

export function UploadStep({
  sepOverride,
  setSepOverride,
  format,
  setFormat,
  handleFileLoad,
  onLoadExample,
}: UploadStepProps) {
  return (
    <div>
      <div className="dv-panel" style={{ marginBottom: 12 }}>
        <p className="dv-tile-title" style={{ margin: "0 0 6px" }}>
          Data format
        </p>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            width: "fit-content",
          }}
        >
          {(["wide", "long"] as const).map((f) => {
            const active = format === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  padding: "6px 18px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: "none",
                  background: active ? "var(--accent-primary)" : "var(--surface)",
                  color: active ? "var(--on-accent)" : "var(--text-muted)",
                }}
              >
                {f === "wide" ? "Wide" : "Long"}
              </button>
            );
          })}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
          {format === "wide"
            ? "One column per set. Cells are item ids; empty cells are ignored."
            : "Two columns: item id, set name. Each row is one (item, set) pair."}
        </p>
      </div>

      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Arabidopsis abiotic stress genes (5-set DEG lists)"
        hint={
          format === "wide"
            ? "CSV · TSV · TXT — one column per set (2+), items in rows · 2 MB max"
            : "CSV · TSV · TXT — two columns (item, set), one per row · 2 MB max"
        }
      />

      <HowTo {...UPSET_HOWTO} />
    </div>
  );
}

// ── Configure step ──────────────────────────────────────────────────────────

export function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  allColumnNames,
  allColumnSets,
  pendingSelection,
  setPendingSelection,
  minDegree,
  setMinDegree,
  maxDegree,
  setMaxDegree,
}: ConfigureStepProps) {
  const selectedCount = pendingSelection.length;
  const needsCutoff = selectedCount > 8;
  // Reset the cutoff window back to "all degrees" whenever the gate disappears
  // so it doesn't silently apply to a later 3-set selection. Also re-clamp to
  // the current selection when the gate is active.
  useEffect(() => {
    if (!needsCutoff) {
      setMinDegree(1);
      setMaxDegree(Infinity);
      return;
    }
    setMinDegree((d: number) => Math.max(1, Math.min(selectedCount, d)));
    setMaxDegree((d: number) =>
      Number.isFinite(d) ? Math.max(1, Math.min(selectedCount, d)) : selectedCount
    );
  }, [needsCutoff, selectedCount, setMaxDegree, setMinDegree]);
  // Keep min ≤ max whenever either edge changes.
  useEffect(() => {
    if (Number.isFinite(maxDegree) && minDegree > maxDegree) setMinDegree(maxDegree);
  }, [minDegree, maxDegree, setMinDegree]);

  const allPossible = selectedCount >= 2 ? Math.pow(2, selectedCount) - 1 : 0;
  const effectiveMaxDegree = Number.isFinite(maxDegree) ? maxDegree : selectedCount;
  const cutoffPreview = useMemo(() => {
    if (!needsCutoff) return null;
    const pendingSets = new Map();
    pendingSelection.forEach((n: string) => pendingSets.set(n, allColumnSets.get(n)));
    const { membershipMap } = computeMemberships(pendingSelection, pendingSets);
    const all = enumerateIntersections(membershipMap, pendingSelection);
    const kept = all.filter(
      (r: Intersection) => r.degree >= minDegree && r.degree <= effectiveMaxDegree
    ).length;
    return { nonEmpty: all.length, kept };
  }, [needsCutoff, pendingSelection, allColumnSets, minDegree, effectiveMaxDegree]);

  const toggle = (name: string) => {
    setPendingSelection((prev: string[]) =>
      prev.includes(name) ? prev.filter((n: string) => n !== name) : [...prev, name]
    );
  };
  let pickerStatusText = "Pick at least 2 sets to plot.";
  let pickerStatusColor = "var(--text-muted)";
  if (selectedCount === 1) {
    pickerStatusText = "1 selected — pick at least one more.";
    pickerStatusColor = "var(--warning-text)";
  } else if (selectedCount >= 2) {
    pickerStatusText = `${selectedCount} selected — ready to plot.`;
    pickerStatusColor = "var(--success-text)";
  }
  return (
    <div>
      <div className="dv-panel">
        <p className="dv-tile-title" style={{ margin: "0 0 4px" }}>
          Sets to include
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
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text)",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
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
                <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>
                  {size}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {needsCutoff && (
        <div className="dv-panel" style={{ marginTop: 16 }}>
          <p className="dv-tile-title" style={{ margin: "0 0 4px" }}>
            Intersection cutoff
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-muted)" }}>
            With {selectedCount} sets, up to {allPossible.toLocaleString()} intersections are
            possible. Keep only intersections whose degree falls in this window:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Min</label>
            <NumberInput
              min={1}
              max={selectedCount}
              step={1}
              value={minDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(1, Math.min(selectedCount, v));
                setMinDegree(clamped);
                if (Number.isFinite(maxDegree) && clamped > maxDegree) setMaxDegree(clamped);
              }}
              style={{ width: 96 }}
            />
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Max</label>
            <NumberInput
              min={1}
              max={selectedCount}
              step={1}
              value={effectiveMaxDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(1, Math.min(selectedCount, v));
                setMaxDegree(clamped);
                if (clamped < minDegree) setMinDegree(clamped);
              }}
              style={{ width: 96 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {cutoffPreview
                ? `${cutoffPreview.kept.toLocaleString()} of ${cutoffPreview.nonEmpty.toLocaleString()} non-empty intersections kept.`
                : ""}
            </span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Degree 1 keeps singletons (items unique to one set); degree = {selectedCount} keeps the
            all-sets intersection. You can change this later in the plot controls.
          </p>
        </div>
      )}

      <div className="dv-panel" style={{ marginTop: 16 }}>
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

// ── ItemListPanel ──────────────────────────────────────────────────────────

export function ItemListPanel({ intersection, setNames, fileName, columnId }: ItemListPanelProps) {
  const baseName = fileBaseName(fileName, "upset");
  if (!intersection)
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        Click an intersection bar or matrix column to view items.
      </div>
    );
  const label = intersectionLabel(intersection.setIndices, setNames);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {columnId != null && (
            <span
              style={{
                fontFamily: "monospace",
                color: "var(--text-muted)",
                marginRight: 6,
              }}
            >
              I{columnId}
            </span>
          )}
          {label}{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            ({intersection.size} items)
          </span>
        </p>
        <button
          onClick={() =>
            downloadCsv(
              ["Item"],
              intersection.items.map((i: string) => [i]),
              columnId != null
                ? `${baseName}_upset_I${columnId}.csv`
                : `${baseName}_upset_${intersectionFilenamePart(label)}.csv`
            )
          }
          className="dv-btn dv-btn-secondary"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success-text)",
            fontWeight: 600,
            fontSize: 11,
            marginLeft: "auto",
            flexShrink: 0,
          }}
        >
          ⬇ CSV
        </button>
      </div>
      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--surface-subtle)",
        }}
      >
        {intersection.items.map((item: string, i: number) => (
          <div
            key={i}
            style={{
              padding: "3px 10px",
              fontSize: 12,
              color: "var(--text)",
              borderBottom: "1px solid var(--border)",
              fontFamily: "monospace",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

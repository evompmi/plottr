// gff/controls.tsx — plot-step sidebar for the Genome Track tool. Owns the
// download tile and the ControlSection-grouped tiles: Region (contig + view
// window), Feature types (per-type show/hide), Display, and Labels.

import {
  ColorInput,
  DownloadTiles,
  NumberInput,
  PlotSidebar,
  SliderControl,
  scrollDisclosureIntoView,
} from "../_shell";
import { formatBpExact } from "./helpers";
import type { GffVis, PlotControlsProps } from "./helpers";

import { downloadCsv, fileBaseName } from "../_core/download";
const { useState, useRef, useEffect } = React;

export function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        className="dv-tile-title"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
          aria-hidden="true"
        />
        {title}
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// A two-button "Off / On" segmented toggle (same visual as the other tools).
function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 6,
        overflow: "hidden",
        border: "1px solid var(--border-strong)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: "4px 0",
              fontSize: 11,
              fontWeight: active ? 700 : 400,
              fontFamily: "inherit",
              cursor: "pointer",
              border: "none",
              background: active ? "var(--accent-primary)" : "var(--surface)",
              color: active ? "var(--on-accent)" : "var(--text-muted)",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function PlotControls({
  vis,
  updVis,
  chartRef,
  resetAll,
  fileName,
  seqids,
  activeSeqid,
  setActiveSeqid,
  seqidSummary,
  viewStart,
  viewEnd,
  setViewStart,
  setViewEnd,
  fitToContig,
  renderedTypes,
  typeCounts,
  hiddenTypes,
  toggleType,
  typeColors,
  featuresInView,
}: PlotControlsProps) {
  const baseName = fileBaseName(fileName, "gff");
  const sv = (k: keyof GffVis) => (v: unknown) => updVis({ [k]: v } as Partial<GffVis>);
  const summary = seqidSummary.find((s) => s.seqid === activeSeqid);

  return (
    <PlotSidebar>
      <DownloadTiles
        chartRef={chartRef}
        fileStem={`${baseName}_track`}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "Features",
            title:
              "Download every feature inside the current view window as a CSV — one row per GFF3 feature line with its parsed columns.",
            onClick: () => {
              const headers = [
                "seqid",
                "source",
                "type",
                "start",
                "end",
                "score",
                "strand",
                "phase",
                "ID",
                "Name",
              ];
              const rows = featuresInView.map((f) => [
                f.seqid,
                f.source,
                f.type,
                String(f.start),
                String(f.end),
                f.score == null ? "." : String(f.score),
                f.strand,
                f.phase == null ? "." : String(f.phase),
                f.id ?? "",
                f.name,
              ]);
              downloadCsv(headers, rows, `${baseName}_features.csv`);
            },
          },
        ]}
      />

      <ControlSection title="Region" defaultOpen>
        {seqids.length > 1 && (
          <div>
            <span className="dv-label">Contig / sequence</span>
            <select
              value={activeSeqid}
              onChange={(e) => setActiveSeqid(e.target.value)}
              className="dv-input"
              style={{ width: "100%" }}
            >
              {seqids.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        <label style={{ display: "block" }}>
          <span className="dv-label">View start (bp)</span>
          <NumberInput
            value={viewStart}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setViewStart(v);
            }}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">View end (bp)</span>
          <NumberInput
            value={viewEnd}
            step={1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setViewEnd(v);
            }}
            style={{ width: "100%" }}
          />
        </label>
        <button
          type="button"
          onClick={fitToContig}
          className="dv-btn dv-btn-secondary"
          style={{ fontSize: 11, padding: "4px 8px" }}
        >
          Fit to contig
        </button>
        {summary && (
          <p
            style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-faint)", lineHeight: 1.4 }}
          >
            {activeSeqid} spans {formatBpExact(summary.start)}–{formatBpExact(summary.end)} bp ·{" "}
            {summary.featureCount.toLocaleString()} features.
          </p>
        )}
      </ControlSection>

      <ControlSection title="Feature types" defaultOpen>
        <p style={{ margin: "0 0 2px", fontSize: 10, color: "var(--text-faint)", lineHeight: 1.4 }}>
          Uncheck a type to hide it from the track.
        </p>
        {renderedTypes.map((t) => {
          const checked = !hiddenTypes.includes(t);
          const swatch = typeColors.get(t) || "#888888";
          return (
            <label
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleType(t)}
                style={{ accentColor: "var(--cta-primary-bg)" }}
              />
              <span
                aria-hidden="true"
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 2,
                  background: swatch,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {t}
              </span>
              <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>
                {(typeCounts.get(t) ?? 0).toLocaleString()}
              </span>
            </label>
          );
        })}
      </ControlSection>

      <ControlSection title="Display">
        <div>
          <div className="dv-label">Colour by</div>
          <Segmented
            options={[
              { value: "type", label: "Feature type" },
              { value: "strand", label: "Strand" },
            ]}
            value={vis.colorMode}
            onChange={(v) => updVis({ colorMode: v })}
          />
        </div>
        <SliderControl
          label="Feature height"
          value={vis.featureHeight}
          min={6}
          max={28}
          step={1}
          onChange={sv("featureHeight")}
        />
        <SliderControl
          label="Font size"
          value={vis.fontSize}
          min={8}
          max={20}
          step={1}
          onChange={sv("fontSize")}
        />
        <div>
          <div className="dv-label">Feature labels</div>
          <Segmented
            options={[
              { value: "on", label: "Show" },
              { value: "off", label: "Hide" },
            ]}
            value={vis.showLabels ? "on" : "off"}
            onChange={(v) => updVis({ showLabels: v === "on" })}
          />
        </div>
        <div>
          <div className="dv-label">Strand chevrons</div>
          <Segmented
            options={[
              { value: "on", label: "Show" },
              { value: "off", label: "Hide" },
            ]}
            value={vis.showChevrons ? "on" : "off"}
            onChange={(v) => updVis({ showChevrons: v === "on" })}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="dv-label">Background</span>
          <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
        </div>
      </ControlSection>

      <ControlSection title="Labels">
        <label style={{ display: "block" }}>
          <span className="dv-label">Title</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Subtitle</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>
    </PlotSidebar>
  );
}

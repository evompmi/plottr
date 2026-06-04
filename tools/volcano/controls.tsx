// Sidebar tiles + AesBox primitive for the Volcano tool. Pattern-matches
// boxplot/controls.tsx and scatter's tile layout. Shared form widgets
// (SliderControl, ColorInput, NumberInput, DiscretePaletteRow) and
// palette helpers (COLOR_PALETTES, DIVERGING_PALETTES, interpolateColor,
// PALETTE, resolveDiscretePalette) are imported from `_core/*` and
// `_shell/*`.

import {
  ColorInput,
  ControlSection,
  DiscretePaletteRow,
  NumberInput,
  SliderControl,
  resolveDiscretePalette,
} from "../_shell";
import { VOLCANO_DEFAULT_COLORS, eligibleColumns } from "./helpers";
import type {
  ColorMapTileProps,
  ColorRowProps,
  ColorsTileProps,
  LabelMatchResult,
  LabelSearchRowProps,
  LabelsTileProps,
  SizeMapTileProps,
  StyleTileProps,
  SummaryTileProps,
  ThresholdsTileProps,
} from "./helpers";
import { matchPointsByLabel } from "./helpers";
import { useT, type VolcanoKey } from "./i18n";

import { COLOR_PALETTES, DIVERGING_PALETTES, interpolateColor } from "../_core/color";
const { useState, useEffect, useMemo } = React;

// ── AesBox themes — one source of truth used by Configure tiles +
// the ColorMap / SizeMap sidebar boxes. Same `--aes-*` CSS vars
// scatter / boxplot use, so the visual language carries across tools.
export const VOLCANO_AES_THEMES = {
  // X axis (log2 fold change) — purple "shape" theme. Mirrors boxplot's
  // group-column tile colour so the "primary positional axis" idea is
  // visually consistent across tools.
  x: {
    bg: "var(--aes-shape-bg)",
    border: "var(--aes-shape-border)",
    header: "var(--aes-shape-header)",
    headerText: "var(--aes-shape-header-text)",
    label: "X axis · log₂ fold change",
  },
  // Y axis (p-value) — green "size" theme, same as boxplot's value-
  // column tile. The "primary measurement" slot.
  y: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Y axis · p-value (−log₁₀)",
  },
  // Label column — slate "color" theme, neutral / auxiliary feel for
  // an optional role.
  label: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "Feature label (optional)",
  },
  // Sidebar aesthetic boxes — matches scatter's "Color" and "Size"
  // aesthetic cards exactly (same `--aes-*` CSS vars, same labels) so
  // the visual language carries across tools. The configure-step
  // tiles above re-use the same CSS vars in different semantic roles
  // — visually identical, but they only ever appear on different
  // steps so there's no clash.
  colorMap: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    headerText: "var(--aes-color-header-text)",
    label: "Color",
  },
  sizeMap: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    headerText: "var(--aes-size-header-text)",
    label: "Size",
  },
} as const;

const AES_LABEL_KEYS: Record<keyof typeof VOLCANO_AES_THEMES, VolcanoKey> = {
  x: "volcano.aes.x",
  y: "volcano.aes.y",
  label: "volcano.aes.label",
  colorMap: "volcano.aes.colorMap",
  sizeMap: "volcano.aes.sizeMap",
};

export function VolcanoAesBox({
  theme,
  children,
}: {
  theme: keyof typeof VOLCANO_AES_THEMES;
  children: React.ReactNode;
}) {
  const tr = useT();
  const t = VOLCANO_AES_THEMES[theme];
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
      <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
        <span
          style={{
            color: t.headerText,
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          {tr(AES_LABEL_KEYS[theme])}
        </span>
      </div>
      <div style={{ padding: "12px 14px", minHeight: 40 }}>{children}</div>
    </div>
  );
}

// Collapsible disclosure panel — same shape as scatter / lineplot /
// upset's ControlSection so the visual language stays consistent across
// every plot tool. Clicking the header toggles the body; the disclosure
// chevron flips via `dv-disclosure-open` (CSS rotation in
// components.css). After expand, scrollDisclosureIntoView ensures the
// newly-opened body lands inside the sticky sidebar's scroll viewport.
// Canonical on/off selector — the `dv-seg` segmented pill-bar declared
// in components.css. Same widget power and molarity use for two-state
// pickers (mode / alpha / tails / separator). A row of buttons where
// the active one carries `dv-seg-btn-active`; one source of truth means
// a future tweak propagates to every tool without per-tile drift. Label
// sits above the pill-bar in `dv-label` typography for consistency
// with how power.tsx introduces each segmented control.
export function ToggleRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const tr = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="dv-label">{children}</span>
      <div className="dv-seg">
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={checked}
          className={"dv-seg-btn" + (checked ? " dv-seg-btn-active" : "")}
          style={{ fontSize: 12 }}
        >
          {tr("volcano.on")}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!checked}
          className={"dv-seg-btn" + (!checked ? " dv-seg-btn-active" : "")}
          style={{ fontSize: 12 }}
        >
          {tr("volcano.off")}
        </button>
      </div>
    </div>
  );
}

export function ThresholdsTile({ vis, updVis }: ThresholdsTileProps) {
  const tr = useT();
  // |log2FC| cutoff: numeric stepper (−/+ buttons + free-form entry).
  // p-value cutoff: discrete select with the conventional values
  // researchers actually use ({0.05, 0.01, 0.001}) plus "None" — the
  // sentinel for "no p threshold" is a stored cutoff of 1, which is
  // strictly greater than any real p-value, so `classifyPoint`'s
  // `p < pCutoff` test admits every point on the p axis. 1 also
  // round-trips through localStorage cleanly (Infinity / NaN don't).
  const onFcChange = (e: { target: { value: string } }) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    updVis({ fcCutoff: Math.max(0, Math.min(10, v)) });
  };
  const P_OPTIONS = [
    { value: 1, label: tr("volcano.thresh.none") },
    { value: 0.05, label: "0.05" },
    { value: 0.01, label: "0.01" },
    { value: 0.001, label: "0.001" },
  ];
  // Snap the persisted vis value to the closest option in the picker
  // (handles legacy values from before this control existed).
  const pPickValue = P_OPTIONS.find((o) => Math.abs(o.value - vis.pCutoff) < 1e-12)?.value ?? 0.05;
  return (
    <ControlSection title={tr("volcano.thresh.title")} defaultOpen>
      <label style={{ display: "block" }}>
        <span className="dv-label">{tr("volcano.thresh.fcCutoff")}</span>
        <NumberInput
          value={vis.fcCutoff}
          min={0}
          max={10}
          step={0.1}
          onChange={onFcChange}
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "block" }}>
        <span className="dv-label">{tr("volcano.thresh.pCutoff")}</span>
        {/* Same `dv-seg` segmented pill-bar power and molarity use for
            their alpha / tails / mode pickers — one canonical
            exclusive-selector look across the whole tool. Every option
            is a real value (1 = "no p threshold"); the active one
            carries `.dv-seg-btn-active`. */}
        <div className="dv-seg">
          {P_OPTIONS.map((o) => {
            const active = pPickValue === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={active}
                className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
                style={{ fontSize: 12 }}
                onClick={() => updVis({ pCutoff: o.value })}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </label>
      <ToggleRow checked={vis.showRefLines} onChange={(v) => updVis({ showRefLines: v })}>
        {tr("volcano.thresh.showRefLines")}
      </ToggleRow>
    </ControlSection>
  );
}

export function ColorsTile({ vis, updVis }: ColorsTileProps) {
  const tr = useT();
  // Volcano has only 3 fixed slots (up / down / ns), not N categories. The
  // palette picker maps the resolved hex list into the two SIGNIFICANT
  // slots only — `[0]` → colorUp, `[1]` → colorDown — and leaves
  // colorNs at its default neutral grey (`VOLCANO_DEFAULT_COLORS.ns`).
  // Reason: the non-significant majority should stay visually muted
  // regardless of palette, so the up/down splay reads as the signal.
  // The user can still hand-edit any slot afterward via the per-row
  // ColorInput; picking a different palette clobbers up/down again.
  const handlePalette = (next: string) => {
    const seed = resolveDiscretePalette(next, 2);
    updVis({
      discretePalette: next,
      colorUp: seed[0] || vis.colorUp,
      colorDown: seed[1] || vis.colorDown,
      colorNs: VOLCANO_DEFAULT_COLORS.ns,
    });
  };
  return (
    <ControlSection title={tr("volcano.colors.title")}>
      <DiscretePaletteRow
        value={vis.discretePalette || "okabe-ito"}
        onChange={handlePalette}
        names={["up", "down", "ns"]}
      />
      <ColorRow
        label={tr("volcano.colors.up")}
        value={vis.colorUp}
        onChange={(v) => updVis({ colorUp: v })}
      />
      <ColorRow
        label={tr("volcano.colors.down")}
        value={vis.colorDown}
        onChange={(v) => updVis({ colorDown: v })}
      />
      <ColorRow
        label={tr("volcano.colors.ns")}
        value={vis.colorNs}
        onChange={(v) => updVis({ colorNs: v })}
      />
    </ControlSection>
  );
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
      <ColorInput value={value} onChange={onChange} size={20} />
    </div>
  );
}

// Search-by-label sub-tile for the Labels panel. Local state for the
// query so typing doesn't bubble re-renders through the chart; only the
// `Add` action lifts state up via `addToManualSelection(indices)`.
//
// Match preview is computed live (debounced 150 ms) against a memoised
// lower-cased label cache so a 50 k-point dataset stays snappy. The live
// readout is informational only — nothing commits until the user submits.
function LabelSearchRow({ points, labelCol, addToManualSelection }: LabelSearchRowProps) {
  const tr = useT();
  const [query, setQuery] = useState("");
  const [previewQuery, setPreviewQuery] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(false);

  // Pre-lowercase every label once per `points` reference. The match
  // helper accepts this cache via its third argument.
  const labelLowerCache = useMemo(
    () => points.map((pt) => (pt.label == null ? null : pt.label.toLocaleLowerCase())),
    [points]
  );

  // 150 ms debounce on the live preview — typing fires `setQuery`, the
  // effect copies into `previewQuery` after the user pauses. The actual
  // match runs against `previewQuery`, so the chart never re-renders on
  // intermediate keystrokes (this component is pure-local state).
  useEffect(() => {
    const id = setTimeout(() => setPreviewQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  const preview: LabelMatchResult = useMemo(() => {
    if (!previewQuery.trim()) return { matched: [], unmatchedTokens: [] };
    return matchPointsByLabel(points, previewQuery, labelLowerCache);
  }, [previewQuery, points, labelLowerCache]);

  const disabled = labelCol == null || labelCol < 0;
  const matchCount = preview.matched.length;
  const unmatchedCount = preview.unmatchedTokens.length;
  const hasQuery = previewQuery.trim().length > 0;
  const hasOnlyUnmatched = hasQuery && matchCount === 0;
  const tooMany = matchCount > 50;

  const submit = () => {
    if (disabled || matchCount === 0) return;
    addToManualSelection(preview.matched);
    setQuery("");
    setPreviewQuery("");
    setShowUnmatched(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="dv-label">{tr("volcano.search.label")}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="search"
          className="dv-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={tr("volcano.search.placeholder")}
          disabled={disabled}
          style={{ flex: 1, fontSize: 11, padding: "3px 6px" }}
          title={tr("volcano.search.inputTitle")}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || matchCount === 0}
          className="dv-btn dv-btn-secondary"
          style={{ padding: "4px 10px", fontSize: 11 }}
          title={
            disabled
              ? tr("volcano.search.disabledTitle")
              : matchCount === 0
                ? tr("volcano.search.typeTitle")
                : tr("volcano.search.addTitle", { n: matchCount })
          }
        >
          {tr("volcano.search.add")}
        </button>
      </div>
      {disabled ? (
        <span style={{ fontSize: 10, color: "var(--text-faint)", fontStyle: "italic" }}>
          {tr("volcano.search.disabledHint")}
        </span>
      ) : hasQuery ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontSize: 10,
              color: hasOnlyUnmatched
                ? "var(--warning-text)"
                : tooMany
                  ? "var(--warning-text)"
                  : "var(--success-text)",
            }}
          >
            {matchCount === 0
              ? tr("volcano.search.noMatches")
              : tr("volcano.search.matches", { n: matchCount }) +
                (tooMany ? tr("volcano.search.overlap") : "") +
                (unmatchedCount > 0 ? tr("volcano.search.unmatched", { n: unmatchedCount }) : "")}
          </span>
          {unmatchedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowUnmatched((v) => !v)}
              style={{
                alignSelf: "flex-start",
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 10,
                color: "var(--text-faint)",
                fontFamily: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
              }}
              title={tr("volcano.search.unmatchedToggleTitle")}
            >
              {showUnmatched
                ? tr("volcano.search.hideUnmatched")
                : tr("volcano.search.showUnmatched")}
            </button>
          )}
          {showUnmatched && unmatchedCount > 0 && (
            <ul
              style={{
                margin: "2px 0 0",
                padding: "4px 8px 4px 18px",
                fontSize: 10,
                fontFamily: "monospace",
                color: "var(--warning-text)",
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
                borderRadius: 4,
                maxHeight: 80,
                overflowY: "auto",
              }}
            >
              {preview.unmatchedTokens.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 10, color: "var(--text-faint)", fontStyle: "italic" }}>
          {tr("volcano.search.placeholderHint")}
        </span>
      )}
    </div>
  );
}

export function LabelsTile({
  vis,
  updVis,
  manualSelection,
  clearManualSelection,
  points,
  labelCol,
  addToManualSelection,
  // {forcedCount, attemptedCount} from the chart's last layout pass.
  // Drives the density-aware "labels may overlap" warning below the
  // top-N sliders. Calibrated to the actual layout outcome — not a
  // heuristic estimate based on point count or plot dimensions.
  labelDensity,
}: LabelsTileProps) {
  const tr = useT();
  const manualCount = manualSelection ? manualSelection.size : 0;
  const hasManual = manualCount > 0;
  // The cap warning is hidden in manual mode (the user's explicit
  // click-to-label choice supersedes the auto top-N picks; warning
  // would be confusing). Otherwise: forced > 0 means the data
  // distribution can't fit every requested label cleanly.
  const forcedCount = (labelDensity && labelDensity.forcedCount) || 0;
  const attemptedCount = (labelDensity && labelDensity.attemptedCount) || 0;
  const showDensityWarning = !hasManual && forcedCount > 0 && attemptedCount > 0;
  // Cleanly-placed budget = attempted minus forced. Suggested top-N
  // splits the budget across up/down in the same ratio the user
  // currently asked for (so a 15-up / 5-down request scales down
  // proportionally rather than going to 50/50).
  const cleanBudget = Math.max(0, attemptedCount - forcedCount);
  const totalRequested = (vis.topNUp || 0) + (vis.topNDown || 0);
  const ratioUp = totalRequested > 0 ? (vis.topNUp || 0) / totalRequested : 0.5;
  const suggestedUp = Math.max(0, Math.round(cleanBudget * ratioUp));
  const suggestedDown = Math.max(0, cleanBudget - suggestedUp);
  return (
    <ControlSection title={tr("volcano.labels.title")} defaultOpen={hasManual}>
      <ToggleRow checked={vis.showLabels} onChange={(v) => updVis({ showLabels: v })}>
        {tr("volcano.labels.annotateTop")}
      </ToggleRow>
      <LabelSearchRow
        points={points}
        labelCol={labelCol}
        addToManualSelection={addToManualSelection}
      />
      {/* Manual-selection mode — when the user has clicked one or more
          points, we hide the auto-pick sliders (they're moot, the user
          is in charge) and surface a Clear button to drop back to
          auto. Mirrors heatmap's selection-clear pattern. */}
      {hasManual ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 6,
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--info-text)" }}>
            {tr("volcano.labels.clicked", { n: manualCount })}
          </span>
          <button
            onClick={clearManualSelection}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "4px 10px", fontSize: 11 }}
            title={tr("volcano.labels.clearTitle")}
          >
            {tr("volcano.labels.clear")}
          </button>
        </div>
      ) : (
        <span style={{ fontSize: 10, color: "var(--text-faint)", fontStyle: "italic" }}>
          {tr("volcano.labels.clickHint")}
        </span>
      )}
      <SliderControl
        label={tr("volcano.labels.topUp")}
        value={vis.topNUp}
        displayValue={String(vis.topNUp)}
        min={0}
        max={50}
        step={1}
        onChange={(v) => updVis({ topNUp: Number(v) })}
      />
      <SliderControl
        label={tr("volcano.labels.topDown")}
        value={vis.topNDown}
        displayValue={String(vis.topNDown)}
        min={0}
        max={50}
        step={1}
        onChange={(v) => updVis({ topNDown: Number(v) })}
      />
      <SliderControl
        label={tr("volcano.labels.fontSize")}
        value={vis.labelFontSize}
        displayValue={String(vis.labelFontSize)}
        min={8}
        max={16}
        step={1}
        onChange={(v) => updVis({ labelFontSize: Number(v) })}
      />
      {showDensityWarning && (
        <div
          role="status"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "8px 10px",
            borderRadius: 6,
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            fontSize: 11,
            color: "var(--warning-text)",
            marginTop: 6,
          }}
        >
          <span>
            ⚠ {tr("volcano.labels.densityWarn", { forced: forcedCount, attempted: attemptedCount })}
          </span>
          {cleanBudget > 0 && cleanBudget < totalRequested && (
            <button
              type="button"
              onClick={() => updVis({ topNUp: suggestedUp, topNDown: suggestedDown })}
              className="dv-btn dv-btn-secondary"
              style={{ alignSelf: "flex-start", padding: "3px 10px", fontSize: 11 }}
              title={tr("volcano.labels.dropTitle", { up: suggestedUp, down: suggestedDown })}
            >
              {tr("volcano.labels.useSuggested", { up: suggestedUp, down: suggestedDown })}
            </button>
          )}
        </div>
      )}
    </ControlSection>
  );
}

export function StyleTile({ vis, updVis }: StyleTileProps) {
  const tr = useT();
  return (
    <ControlSection title={tr("volcano.style.title")}>
      <SliderControl
        label={tr("volcano.style.plotWidth")}
        value={vis.plotWidth}
        displayValue={String(Math.round(vis.plotWidth)) + " px"}
        min={600}
        max={1600}
        step={20}
        onChange={(v) => updVis({ plotWidth: Number(v) })}
      />
      <SliderControl
        label={tr("volcano.style.pointRadius")}
        value={vis.pointRadius}
        displayValue={vis.pointRadius.toFixed(1)}
        min={1}
        max={8}
        step={0.5}
        onChange={(v) => updVis({ pointRadius: Number(v) })}
      />
      <SliderControl
        label={tr("volcano.style.pointAlpha")}
        value={vis.pointAlpha}
        displayValue={vis.pointAlpha.toFixed(2)}
        min={0.1}
        max={1}
        step={0.05}
        onChange={(v) => updVis({ pointAlpha: Number(v) })}
      />
      <ToggleRow checked={vis.showAxes} onChange={(v) => updVis({ showAxes: v })}>
        {tr("volcano.style.showGrid")}
      </ToggleRow>
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
          color: "var(--text)",
        }}
      >
        {tr("volcano.style.plotTitle")}
        <input
          type="text"
          className="dv-input"
          value={vis.plotTitle}
          onChange={(e) => updVis({ plotTitle: e.target.value })}
          placeholder={tr("volcano.style.optional")}
        />
      </label>
    </ControlSection>
  );
}

// ── Aesthetic-mapping tiles ────────────────────────────────────────────
//
// Both tiles ride the aequorin "Summary barplot" pattern: the "— None —"
// entry in the column dropdown is the off state (col === -1 disables the
// mapping). Column index lives in App's local state (it's dataset-
// specific); palette / radius bounds live in `vis` so the user's style
// preference persists across reloads.

// Inline palette-strip preview — same shape as heatmap's `PaletteStrip`
// helper (48-segment flex bar). Inlined here rather than imported from
// `tools/heatmap/chart` because esbuild bundles each tool independently
// and cross-tool imports would drag the heatmap's chart into the volcano
// bundle. The body is tiny (~12 lines) so duplication is fine.
function PaletteStrip({
  palette,
  invert = false,
  height = 12,
}: {
  palette: string;
  invert?: boolean;
  height?: number;
}) {
  const base = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const stops = invert ? [...base].reverse() : base;
  const n = 48;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ flex: 1, background: interpolateColor(stops, i / (n - 1)) }} />
      ))}
    </div>
  );
}

export function ColorMapTile({
  parsed,
  xCol,
  yCol,
  labelCol,
  col,
  setCol,
  colorMap,
  vis,
  updVis,
}: ColorMapTileProps) {
  const tr = useT();
  const candidates = eligibleColumns(parsed, xCol, yCol, labelCol);
  // Bare-global access — see the comment in App's colorMap useMemo for
  // why we don't go through `window`.
  const paletteNames = Object.keys(COLOR_PALETTES);
  return (
    <VolcanoAesBox theme="colorMap">
      <select
        className="dv-select"
        value={col === -1 ? "" : col}
        onChange={(e) => setCol(e.target.value === "" ? -1 : parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: colorMap ? 8 : 0 }}
      >
        <option value="">{tr("volcano.map.none")}</option>
        {candidates.map(({ h, i }) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
      {colorMap && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
            {tr("volcano.map.detected")}
            <strong
              style={{
                color: colorMap.type === "continuous" ? "var(--accent-dna)" : "var(--accent-blue)",
              }}
            >
              {colorMap.type === "continuous"
                ? tr("volcano.map.continuous")
                : tr("volcano.map.categorical", { n: colorMap.legend.length })}
            </strong>
          </div>
          {colorMap.type === "continuous" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <select
                className="dv-select"
                value={vis.colorMapPalette}
                onChange={(e) => updVis({ colorMapPalette: e.target.value })}
                style={{ width: "100%", fontSize: 11 }}
              >
                {paletteNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                    {DIVERGING_PALETTES.has(name) ? tr("volcano.map.diverging") : ""}
                  </option>
                ))}
              </select>
              {/* Live palette preview — picks up the inversion flag so
                  the user sees the actual gradient direction the chart
                  will use. Same widget heatmap renders below its
                  palette dropdown. */}
              <PaletteStrip palette={vis.colorMapPalette} invert={vis.colorMapInvert} />
              {/* Normal / Inverted segmented picker — matches heatmap's
                  "Direction" dv-seg row exactly. */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="dv-label" style={{ fontSize: 11, flexShrink: 0 }}>
                  {tr("volcano.map.direction")}
                </span>
                <div className="dv-seg" role="group" aria-label={tr("volcano.map.directionAria")}>
                  <button
                    type="button"
                    aria-pressed={!vis.colorMapInvert}
                    className={"dv-seg-btn" + (!vis.colorMapInvert ? " dv-seg-btn-active" : "")}
                    onClick={() => updVis({ colorMapInvert: false })}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                  >
                    {tr("volcano.map.normal")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={vis.colorMapInvert}
                    className={"dv-seg-btn" + (vis.colorMapInvert ? " dv-seg-btn-active" : "")}
                    onClick={() => updVis({ colorMapInvert: true })}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                  >
                    {tr("volcano.map.inverted")}
                  </button>
                </div>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {tr("volcano.map.range", {
                  min: colorMap.vmin.toPrecision(3),
                  max: colorMap.vmax.toPrecision(3),
                })}
              </span>
            </div>
          )}
          {colorMap.type === "discrete" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 160,
                overflowY: "auto",
              }}
            >
              {colorMap.legend.map((entry) => (
                <div
                  key={entry.value}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: entry.color,
                      border: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </VolcanoAesBox>
  );
}

export function SizeMapTile({
  parsed,
  xCol,
  yCol,
  labelCol,
  col,
  setCol,
  vis,
  updVis,
}: SizeMapTileProps) {
  const tr = useT();
  const candidates = eligibleColumns(parsed, xCol, yCol, labelCol);
  const active = col >= 0;
  return (
    <VolcanoAesBox theme="sizeMap">
      <select
        className="dv-select"
        value={col === -1 ? "" : col}
        onChange={(e) => setCol(e.target.value === "" ? -1 : parseInt(e.target.value))}
        style={{ width: "100%", marginBottom: active ? 8 : 0 }}
      >
        <option value="">{tr("volcano.map.none")}</option>
        {candidates.map(({ h, i }) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
      {active && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SliderControl
            label={tr("volcano.size.minRadius")}
            value={vis.sizeMapMinR}
            displayValue={vis.sizeMapMinR.toFixed(1)}
            min={1}
            max={vis.sizeMapMaxR - 0.5}
            step={0.5}
            onChange={(v) => updVis({ sizeMapMinR: Number(v) })}
          />
          <SliderControl
            label={tr("volcano.size.maxRadius")}
            value={vis.sizeMapMaxR}
            displayValue={vis.sizeMapMaxR.toFixed(1)}
            min={vis.sizeMapMinR + 0.5}
            max={20}
            step={0.5}
            onChange={(v) => updVis({ sizeMapMaxR: Number(v) })}
          />
          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
            {tr("volcano.size.fallbackNote")}
          </span>
        </div>
      )}
    </VolcanoAesBox>
  );
}

export function SummaryTile({ summary, fcCutoff, pCutoff }: SummaryTileProps) {
  const tr = useT();
  return (
    <div
      className="dv-panel"
      style={{ padding: "10px 14px", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}
    >
      <span>
        <strong style={{ color: VOLCANO_DEFAULT_COLORS.up }}>{tr("volcano.summary.up")}</strong>:{" "}
        {summary.up}
      </span>
      <span>
        <strong style={{ color: VOLCANO_DEFAULT_COLORS.down }}>{tr("volcano.summary.down")}</strong>
        : {summary.down}
      </span>
      <span>
        <strong style={{ color: VOLCANO_DEFAULT_COLORS.ns }}>{tr("volcano.summary.ns")}</strong>:{" "}
        {summary.ns}
      </span>
      <span style={{ color: "var(--text-muted)" }}>
        {tr("volcano.summary.ofValid", { n: summary.total })}
        {summary.discarded > 0 ? tr("volcano.summary.discarded", { n: summary.discarded }) : ""}
      </span>
      <span style={{ color: "var(--text-faint)" }}>
        {tr("volcano.summary.cutoffs", { fc: fcCutoff, p: pCutoff })}
      </span>
    </div>
  );
}

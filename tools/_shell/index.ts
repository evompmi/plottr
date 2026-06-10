// Barrel export for the typed shared scaffold. Consumers import from
// `"../_shell"` (the directory) and pick exports by name; the file
// structure inside `_shell/` is an implementation detail. One file
// per exported component / helper / hook is the convention — see
// `_shell/README.md`.
//
// Re-exports are alphabetised within their grouping (components first,
// then pure helpers / hooks / data, then re-exported types). Adding a
// new `_shell/` file: drop it here, slot the import line in the right
// alphabetical position, done.

// ── React components ────────────────────────────────────────────────
export { ActionsPanel } from "./ActionsPanel";
export type { ActionsPanelDownload } from "./ActionsPanel";
export { BaseStyleControls } from "./BaseStyleControls";
export { CldLabels } from "./CldLabels";
export { ColorInput, normalizeHexColor } from "./ColorInput";
export { ColumnRoleEditor } from "./ColumnRoleEditor";
export { CommaFixBanner } from "./CommaFixBanner";
export { ControlSection } from "./ControlSection";
export type { ControlSectionProps } from "./ControlSection";
export { DataPreview } from "./DataPreview";
export { DatasheetIcon } from "./DatasheetIcon";
export { DetectedSeparatorBadge, describeSeparator } from "./DetectedSeparatorBadge";
export { DiscretePaletteRow } from "./DiscretePaletteRow";
export { DownloadTiles } from "./DownloadTiles";
export { ErrorBoundary } from "./ErrorBoundary";
export { FileDropZone, FILE_LIMIT_BYTES, FILE_WARN_BYTES } from "./FileDropZone";
export { FilterCheckboxPanel } from "./FilterCheckboxPanel";
export { FormulaInjectionBanner } from "./FormulaInjectionBanner";
export { GroupColorEditor } from "./GroupColorEditor";
export { HowTo } from "./HowTo";
export type { HowToContent } from "./HowTo";
export { HowToCard } from "./HowToCard";
export { NumberInput } from "./NumberInput";
export { PageHeader } from "./PageHeader";
export { ParseErrorBanner } from "./ParseErrorBanner";
export { PlotSidebar } from "./PlotSidebar";
export { PlotToolShell } from "./PlotToolShell";
export { PrefsPanel } from "./PrefsPanel";
export { RenameReorderPanel } from "./RenameReorderPanel";
export { ScrollablePlotCard } from "./ScrollablePlotCard";
export { SegToggle, OnOffToggle } from "./SegToggle";
export type { SegOption, SegToggleProps, OnOffToggleProps } from "./SegToggle";
export { SignificanceBrackets } from "./SignificanceBrackets";
export { SliderControl } from "./SliderControl";
export { StatsTable } from "./StatsTable";
export { StatsTile } from "./StatsTile";
export { StepNavBar } from "./StepNavBar";
export { UploadPanel } from "./UploadPanel";

// ── Pure helpers / data / hooks ─────────────────────────────────────
export { assignBracketLevels } from "./bracket-levels";
export { CHART_MARGIN, buildLineD, valueAxisLeftMargin } from "./chart-layout";
export {
  COLORBLIND_SAFE_PALETTES,
  DISCRETE_PALETTES,
  applyDiscretePalette,
  buildGgplot2Hue,
  buildViridisDiscrete,
  resolveDiscretePalette,
} from "./discrete-palette";
export { consumeHandoff, navigateToTool, setHandoff } from "./handoff";
export type { HandoffPayload } from "./handoff";
export { detectLongFormat } from "./long-format-detect";
export type { LongFormatDetection } from "./long-format-detect";
export { computePowerFromData } from "./power-from-data";
export type { PowerFromDataResult, PowerFromDataRow } from "./power-from-data";
export {
  PREFS_SCHEMA_VERSION,
  clearAutoPrefs,
  exportPrefsFile,
  extractStylePrefs,
  flushAutoPrefs,
  importPrefsFile,
  isLabelKey,
  isPrefValueCompatible,
  loadAutoPrefs,
  mergePrefsSettings,
  migratePrefs,
  saveAutoPrefs,
} from "./prefs-store";
export {
  buildRScript,
  buildRScriptForPower,
  formatRNumber,
  formatRVector,
  R_MAX_LINE,
  sanitizeRComment,
  sanitizeRString,
  wrapRItems,
} from "./r-export";
export type { BuildRScriptCtx, PowerScriptState } from "./r-export";
export { scrollDisclosureIntoView } from "./scroll-helpers";
export { round2, round4 } from "./round";
export { useIsMobile } from "./use-is-mobile";
export {
  STATS_POSTHOC_REGISTRY,
  STATS_TESTS_FOR_K,
  STATS_TESTS_FOR_K2,
  STATS_TEST_REGISTRY,
} from "./stats-registry";
export { postHocForTest, runPostHoc, runTest, testStatistic } from "./stats-dispatch";
export type { PostHocPair, PostHocResult, TestResult } from "./stats-dispatch";
export { buildSelectTestReason, buildCorrelationReason } from "./select-test-narrative";
export { computeLegendHeight, renderSvgLegend } from "./svg-legend";
export type { LegendBlock, LegendItemWidth } from "./svg-legend";
export { usePlotToolState } from "./usePlotToolState";
export type { PlotToolState } from "./usePlotToolState";

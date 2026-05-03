// Ambient globals for tools/shared.js and tools/shared-*.js.
// Those files are loaded as plain <script> tags in each tool HTML and expose
// their top-level names globally. Tool .tsx files consume them without imports.
//
// Types here are the public surface only. Component prop interfaces match
// the runtime contract documented in each shared-*.js source.

import type { CSSProperties, FC, ReactElement, ReactNode } from "react";
import * as ReactNs from "react";

declare global {
  // ── Vendored React (loaded via <script> tag) ───────────────────────────────
  const React: typeof ReactNs;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React {
    export type CSSProperties = ReactNs.CSSProperties;
    export type FC<P = object> = ReactNs.FC<P>;
    export type ReactElement = ReactNs.ReactElement;
    export type ReactNode = ReactNs.ReactNode;
    export type RefObject<T> = ReactNs.RefObject<T>;
    export type MutableRefObject<T> = ReactNs.MutableRefObject<T>;
    export type ChangeEvent<T = Element> = ReactNs.ChangeEvent<T>;
    export type MouseEvent<T = Element> = ReactNs.MouseEvent<T>;
    export type KeyboardEvent<T = Element> = ReactNs.KeyboardEvent<T>;
    export type FormEvent<T = Element> = ReactNs.FormEvent<T>;
  }
  const ReactDOM: typeof import("react-dom/client");

  // ── Color helpers ──────────────────────────────────────────────────────────
  function hexToRgb(hex: string): [number, number, number];
  function rgbToHex(r: number, g: number, b: number): string;
  function shadeColor(hex: string, factor: number): string;
  function getPointColors(baseColor: string, nSources: number): string[];

  // ── Palette & icons ────────────────────────────────────────────────────────
  const PALETTE: readonly string[];
  const TOOL_ICONS: Record<string, string>;
  function toolIcon(name: string, size?: number, opts?: { circle?: boolean }): ReactElement | null;

  // ── Style constants (RETIRED — see CLAUDE.md Theming) ─────────────────────
  // The old inline-style constants (inp / inpN / sec / lbl / btnPrimary /
  // btnSecondary / btnDanger / btnDownload / btnPlot / selStyle / sepSelect)
  // were removed from tools/shared.js when the dv-* CSS classes landed.
  // We deliberately do NOT re-declare them here so that any future
  // contributor reaching for `style={btnPrimary}` gets a TS error
  // pointing them at the right tool: use the dv-* className idiom
  // (`className="dv-btn dv-btn-primary"`, `className="dv-select"`,
  // `className="dv-input"`, etc.) per CLAUDE.md.
  const roleColors: Record<string, string>;

  // ── Ingest size policy (shared-file-drop.js) ───────────────────────────────
  const FILE_LIMIT_BYTES: number;
  const FILE_WARN_BYTES: number;

  // ── Numeric detection & seeded RNG ─────────────────────────────────────────
  function isNumericValue(v: unknown): boolean;
  function seededRandom(seed: number): () => number;
  function makeExamplePlantCSV(): string;
  function downloadText(text: string, filename: string): void;
  function powerTwoSample(d: number, n: number, alpha: number, tails: number): number;
  function powerPaired(d: number, n: number, alpha: number, tails: number): number;
  function powerOneSample(d: number, n: number, alpha: number, tails: number): number;
  function powerAnova(f: number, n: number, alpha: number, k: number): number;
  function powerCorrelation(r: number, n: number, alpha: number, tails: number): number;
  function powerChi2(w: number, n: number, alpha: number, df: number): number;
  function fFromGroupMeans(means: number[], sd: number): number;
  function makeTicks(min: number, max: number, approxN: number): number[];
  function niceStep(range: number, approxN: number): number;
  interface LogTick {
    value: number;
    major: boolean;
  }
  function makeLogTicks(dataMin: number, dataMax: number, base: number): LogTick[];

  // ── Separator detection & decimal comma fix ────────────────────────────────
  function autoDetectSep(text: string, override?: string): string | RegExp;
  function fixDecimalCommas(
    text: string,
    sep: string | RegExp
  ): { text: string; commaFixed: boolean; count: number };

  // ── CSV / TSV parsing ──────────────────────────────────────────────────────
  // Reported by `scanForFormulaInjection`, attached to every parse result.
  // `null` when the dataset is clean. Example arrays are capped at 8 each so
  // the warning banner stays compact on huge sheets.
  interface FormulaInjectionWarning {
    count: number;
    headers: Array<{ idx: number; value: string }>;
    cells: Array<{ row: number; col: number; header: string | null; value: string }>;
  }
  function scanForFormulaInjection(
    headers: string[] | null | undefined,
    rows: string[][] | null | undefined,
    opts?: { cap?: number }
  ): FormulaInjectionWarning;

  interface ParseRawResult {
    headers: string[];
    rows: string[][];
    hasHeader: boolean;
    injectionWarnings: FormulaInjectionWarning | null;
  }
  function parseRaw(text: string, sepOv?: string): ParseRawResult;

  // Long-format column role assigned to each parsed column. "group" picks the
  // x-axis categorical column, "value" picks the numeric column, "filter" keeps
  // the column visible in the filter/rename UI without driving the plot, "text"
  // is a free-text annotation column, and "ignore" hides the column entirely.
  // guessColumnType can return any of the four roles directly; the boxplot
  // configure step then demotes duplicates of "group" / "value" to "filter"
  // so each role stays singular where the plot requires it.
  type ColumnRole = "group" | "value" | "filter" | "ignore";
  function guessColumnType(vals: string[]): ColumnRole;
  function detectWideFormat(headers: string[], rows: string[][]): boolean;

  interface ParseDataResult {
    headers: string[];
    data: Array<Array<number | null>>;
    rawData: string[][];
    injectionWarnings: FormulaInjectionWarning | null;
  }
  function parseData(text: string, sepOv?: string): ParseDataResult;

  function dataToColumns<T>(data: T[][], nCols: number): T[][];

  interface ParseWideMatrixResult {
    rowLabels: string[];
    colLabels: string[];
    matrix: number[][];
    warnings: { nonNumeric: number };
    injectionWarnings: FormulaInjectionWarning | null;
  }
  function parseWideMatrix(text: string, sepOv?: string): ParseWideMatrixResult;

  // ── Colour palettes ────────────────────────────────────────────────────────
  const COLOR_PALETTES: Record<string, string[]>;
  const DIVERGING_PALETTES: Set<string>;
  function interpolateColor(stops: string[], t: number): string;

  function wideToLong(
    headers: string[],
    rows: string[][]
  ): { headers: [string, string]; rows: string[][] };
  function reshapeWide(
    rows: string[][],
    gi: number,
    vi: number
  ): { headers: string[]; rows: string[][] };

  // ── Set-membership parsing (Venn / UpSet) ───────────────────────────────────
  function parseSetData(
    headers: string[],
    rows: string[][]
  ): { setNames: string[]; sets: Map<string, Set<string>> };
  function parseLongFormatSets(
    headers: string[],
    rows: string[][]
  ): { setNames: string[]; sets: Map<string, Set<string>> };

  // ── Statistics ─────────────────────────────────────────────────────────────
  interface Stats {
    mean: number;
    sd: number;
    sem: number;
    n: number;
    min: number;
    max: number;
    median: number;
  }
  function computeStats(arr: number[]): Stats | null;

  interface QuartileStats {
    min: number;
    max: number;
    q1: number;
    med: number;
    q3: number;
    iqr: number;
    wLo: number;
    wHi: number;
    n: number;
  }
  function quartiles(arr: number[]): QuartileStats | null;

  function kde(values: number[], nPoints?: number): Array<{ x: number; d: number }>;

  interface GroupStats {
    name: string;
    n: number;
    mean: number | null;
    sd: number | null;
    sem: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
  }
  function computeGroupStats(groups: Record<string, string[]>): GroupStats[];

  // ── Download helpers ───────────────────────────────────────────────────────
  function svgSafeId(s: unknown): string;
  function fileBaseName(fileName: string | null | undefined, fallback?: string): string;
  function flashSaved(btn: HTMLElement | null): void;
  function downloadSvg(svgEl: SVGSVGElement | null, filename: string): void;
  function downloadPng(svgEl: SVGSVGElement | null, filename: string, scale?: number): void;
  function downloadCsv(
    headers: string[],
    rows: Array<Array<string | number>>,
    filename: string
  ): void;

  // ── R-script export (shared-r-export.js) ──────────────────────────────────
  // Per-group context fed into the R reproducibility script. `recommendation` is
  // the full selectTest() return — we accept it loosely because callers
  // sometimes pass the raw selectTest result and sometimes a slimmed copy.
  interface BuildRScriptContext {
    names: string[];
    values: number[][];
    recommendation?: {
      recommendation?: {
        test?: RecommendedTest;
        postHoc?: RecommendedPostHoc;
        reason?: string;
      };
    } | null;
    chosenTest?: RecommendedTest | null;
    postHocName?: string | null;
    dataNote?: string;
    generatedAt?: string;
  }
  function buildRScript(ctx: BuildRScriptContext): string;

  // Power-tool context. Numeric fields may be null when the tool is mid-edit;
  // the script generator emits a placeholder comment in that case rather than
  // rejecting the input.
  interface BuildRScriptForPowerState {
    testKey: string;
    // Loose `string` / `number` rather than narrow unions because the calling
    // tool stores these in `useState` without a type parameter; tightening here
    // would force casts at every call site without catching real bugs.
    solveFor: string;
    es?: number | null;
    n?: number | null;
    alpha?: number | null;
    power?: number | null;
    tails?: number | null;
    k?: number | null;
    df?: number | null;
    result?: number | null;
    generatedAt?: string;
  }
  function buildRScriptForPower(state: BuildRScriptForPowerState): string;
  function sanitizeRString(s: unknown): string;
  function sanitizeRComment(s: unknown): string;
  function formatRNumber(n: number | null | undefined): string;
  function formatRVector(arr: Array<number | null | undefined>): string;

  // ── Shared components ──────────────────────────────────────────────────────
  // Implementations live in `tools/shared-*.js` (plain JS, concatenated into
  // shared.bundle.js — see CLAUDE.md). Prop types are tightened here for
  // .tsx call sites; runtime is unaffected.
  const ColorInput: FC<{ value: string; onChange: (hex: string) => void; size?: number }>;
  const FileDropZone: FC<{
    onFileLoad: (text: string, fileName: string) => void;
    accept?: string;
    hint?: string;
  }>;
  const DataPreview: FC<{
    headers: string[];
    rows: Array<Array<string | number | null>>;
    maxRows?: number;
  }>;
  // NumberInput mirrors `<input type="number">`: onChange fires with
  // `{ target: { value: string } }` so `(e) => setX(e.target.value)`
  // handlers keep working unchanged.
  const NumberInput: FC<{
    value: number | string | null | undefined;
    onChange: (e: { target: { value: string } }) => void;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    style?: CSSProperties;
    inputStyle?: CSSProperties;
  }>;
  const SliderControl: FC<{
    label: ReactNode;
    value: number;
    displayValue?: ReactNode;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
  }>;
  const StepNavBar: FC<{
    steps: string[];
    currentStep: string;
    onStepChange: (s: string) => void;
    canNavigate?: (s: string) => boolean;
    stepLabels?: Record<string, string>;
  }>;
  const PageHeader: FC<{
    toolName: string;
    title: ReactNode;
    middle?: ReactNode;
    right?: ReactNode;
  }>;
  const UploadPanel: FC<{
    sepOverride: string;
    onSepChange: (s: string) => void;
    onFileLoad: (text: string, fileName: string) => void;
    onLoadExample?: () => void;
    exampleLabel?: ReactNode;
    hint?: string;
  }>;
  const HowToCard: FC<{
    toolName: string;
    title: ReactNode;
    subtitle?: ReactNode;
    children?: ReactNode;
  }>;
  interface ActionsPanelDownload {
    label: string;
    title?: string;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  }
  const ActionsPanel: FC<{
    onDownloadSvg?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onDownloadPng?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    extraDownloads?: ActionsPanelDownload[];
    onReset: () => void;
  }>;
  const CommaFixBanner: FC<{ commaFixed: boolean; commaFixCount: number }>;
  const ParseErrorBanner: FC<{ error: string | null | undefined }>;
  const FormulaInjectionBanner: FC<{ warning: FormulaInjectionWarning | null }>;
  interface FilterEntry {
    unique: string[];
    included: Set<string>;
  }
  interface ColumnRoleEditorProps {
    headers: string[];
    rows: string[][];
    colRoles: ColumnRole[];
    colNames: string[];
    onRoleChange: (i: number, role: ColumnRole) => void;
    onNameChange: (i: number, name: string) => void;
  }
  const ColumnRoleEditor: FC<ColumnRoleEditorProps>;

  interface FilterCheckboxPanelProps {
    headers: string[];
    colNames: string[];
    colRoles: ColumnRole[];
    filters: Record<number, FilterEntry>;
    filteredCount: number;
    totalCount: number;
    onToggle: (i: number, value: string) => void;
    onToggleAll: (i: number, allOn: boolean) => void;
  }
  const FilterCheckboxPanel: FC<FilterCheckboxPanelProps>;

  interface RenameReorderPanelProps {
    headers: string[];
    colNames: string[];
    colRoles: ColumnRole[];
    filters: Record<number, FilterEntry>;
    valueRenames: Record<number, Record<string, string>>;
    orderableCols?: Record<number, { order: string[]; onReorder: (newOrder: string[]) => void }>;
    applyRename: (i: number, value: string) => string;
    onRenameVal: (i: number, origValue: string, newValue: string) => void;
    dragState: { col: number; idx: number } | null;
    onDragStart: (state: { col: number; idx: number }) => void;
    onDragEnd: () => void;
  }
  const RenameReorderPanel: FC<RenameReorderPanelProps>;
  const StatsTable: FC<{
    stats: GroupStats[] | null | undefined;
    groupLabel: string;
  }>;
  // Group color editor — one row per group with a colour swatch, a name input
  // (commits via `onNameChange`), and an optional toggle checkbox. `g.stats`
  // is shown as `n=…` when present.
  interface GroupColorEditorGroup {
    name: string;
    color: string;
    displayName?: string;
    enabled?: boolean;
    stats?: { n: number } | null;
  }
  const GroupColorEditor: FC<{
    groups: GroupColorEditorGroup[];
    onColorChange: (i: number, color: string) => void;
    onNameChange?: (i: number, name: string) => void;
    onToggle?: (i: number) => void;
  }>;
  const BaseStyleControls: FC<{
    plotBg: string;
    onPlotBgChange: (hex: string) => void;
    showGrid: boolean;
    onShowGridChange: (v: boolean) => void;
    gridColor: string;
    onGridColorChange: (hex: string) => void;
  }>;
  const ErrorBoundary: FC<{ toolName?: string; children?: ReactNode }>;
  // StatsTile — assumption checks + test selection + post-hocs + annotation
  // emission. `groups` is the list of {name, values}; `onAnnotationsChange`
  // receives a brackets/CLD spec the parent chart renders. `compact` shrinks
  // text by ~15%; `renderLayout` is an optional escape hatch for tools that
  // need to swap the default vertical stack for a custom container.
  interface StatsTileAnnotationBracket {
    kind: "brackets";
    pairs: Array<{ i: number; j: number; label: string; p: number }>;
    groupNames: string[];
  }
  interface StatsTileAnnotationCLD {
    kind: "cld";
    labels: string[];
    groupNames: string[];
  }
  type StatsTileAnnotation = StatsTileAnnotationBracket | StatsTileAnnotationCLD;
  const StatsTile: FC<{
    groups: Array<{ name: string; values: number[] }> | null | undefined;
    onAnnotationsChange?: (spec: StatsTileAnnotation | null) => void;
    onStatsSummaryChange?: (summary: unknown) => void;
    defaultOpen?: boolean;
    title?: ReactNode;
    compact?: boolean;
    renderLayout?: (children: ReactNode) => ReactNode;
    fileStem?: string;
  }>;
  function scrollIntoViewWithinAncestor(
    el: Element | null,
    pad?: number,
    extraBottom?: number
  ): void;
  function scrollDisclosureIntoView(el: Element | null, pad?: number): void;

  // ── Preferences persistence (shared-prefs.js) ──────────────────────────────
  function loadAutoPrefs<T extends Record<string, any>>(toolName: string, visInit: T): T;
  function saveAutoPrefs(toolName: string, vis: Record<string, any>): void;
  function flushAutoPrefs(toolName: string, vis: Record<string, any>): void;
  function clearAutoPrefs(toolName: string): void;
  function exportPrefsFile(toolName: string, vis: Record<string, any>): void;
  function importPrefsFile(
    toolName: string,
    visInit: Record<string, any>,
    cb: (merged: Record<string, any> | null, error: string | null) => void
  ): void;
  function mergePrefsSettings(
    settings: Record<string, any>,
    visInit: Record<string, any>,
    opts?: { onlyStyle?: boolean }
  ): Record<string, any>;
  function extractStylePrefs(vis: Record<string, any>): Record<string, any>;
  function isLabelKey(key: string): boolean;

  // ── Inter-tool data hand-off (shared-handoff.js) ───────────────────────────
  interface HandoffPayload {
    tool: string;
    csv?: string;
    mode?: "long" | "wide";
    source?: string;
    fileName?: string;
    colRoles?: string[];
    [key: string]: any;
  }
  function setHandoff(payload: HandoffPayload): boolean;
  function consumeHandoff(targetTool: string): HandoffPayload | null;
  const PrefsPanel: FC<{
    tool: string;
    vis: Record<string, any>;
    visInit: Record<string, any>;
    updVis: (patch: Record<string, any>) => void;
  }>;
  interface SubgroupMeta {
    name: string;
    startIndex: number;
    count: number;
  }

  interface BracketPair {
    i: number;
    j: number;
    p?: number;
    pAdj?: number;
    label?: string;
    _level?: number;
  }
  function assignBracketLevels(pairs: BracketPair[]): BracketPair[];

  interface PowerFromDataRow {
    alpha: number;
    achieved: number;
    nForTarget: number | null;
  }
  interface PowerFromDataResult {
    effectLabel: string;
    effect: number;
    rows: PowerFromDataRow[];
    targetPower: number;
    nLabel: string;
    approximate: boolean;
  }
  function computePowerFromData(chosenTest: string, values: number[][]): PowerFromDataResult | null;

  // ── Legend SVG helpers from shared-components.js ───────────────────────────
  interface LegendBlock {
    items: Array<{ label: string; color: string }>;
    [k: string]: any;
  }
  type LegendItemWidth = number | ((block: LegendBlock) => number);
  function computeLegendHeight(
    blocks: LegendBlock[],
    usableW: number,
    itemWidth: LegendItemWidth
  ): number;
  function renderSvgLegend(
    blocks: LegendBlock[],
    startY: number,
    leftX: number,
    usableW: number,
    itemWidth: LegendItemWidth,
    truncateLabel?: number
  ): ReactNode;

  // ── tools/stats.js ─────────────────────────────────────────────────────────
  function normcdf(x: number): number;
  function norminv(p: number): number;
  function gammaln(x: number): number;
  function betai(a: number, b: number, x: number): number;
  function betacf(a: number, b: number, x: number): number;
  function gammainc(a: number, x: number): number;
  function gammainc_upper(a: number, x: number): number;
  function tcdf(t: number, df: number): number;
  function tinv(p: number, df: number): number;
  function fcdf(f: number, d1: number, d2: number): number;
  function chi2cdf(x: number, k: number): number;
  function chi2inv(p: number, k: number): number;
  function nctcdf(t: number, df: number, delta: number): number;
  function ncf_sf(f: number, d1: number, d2: number, lambda: number): number;
  function ncchi2cdf(x: number, k: number, lambda: number): number;
  function bisect(
    fn: (x: number) => number,
    target: number,
    lo: number,
    hi: number,
    tol?: number,
    maxIter?: number
  ): number;
  function sampleMean(x: number[]): number;
  function sampleVariance(x: number[]): number;
  function sampleSD(x: number[]): number;
  function rankWithTies(x: number[]): { ranks: number[]; tieCorrection: number };
  function shapiroWilk(x: number[]): { W: number; p: number; error?: string };
  function leveneTest(groups: number[][]): {
    F: number;
    df1: number;
    df2: number;
    p: number;
    error?: string;
  };
  function tTest(
    x: number[],
    y: number[],
    opts?: { equalVar?: boolean }
  ): {
    t: number;
    df: number;
    p: number;
    mean1?: number;
    mean2?: number;
    var1?: number;
    var2?: number;
    n1?: number;
    n2?: number;
    error?: string;
  };
  function mannWhitneyU(
    x: number[],
    y: number[]
  ): {
    U: number;
    U1: number;
    U2: number;
    z: number;
    p: number;
    n1: number;
    n2: number;
    error?: string;
  };
  function cohenD(x: number[], y: number[]): number;
  function hedgesG(x: number[], y: number[]): number;
  function rankBiserial(U1: number, n1: number, n2: number): number;
  function oneWayANOVA(groups: number[][]): {
    F: number;
    df1: number;
    df2: number;
    p: number;
    ssBetween?: number;
    ssWithin?: number;
    grandMean?: number;
    error?: string;
  };
  function welchANOVA(groups: number[][]): {
    F: number;
    df1: number;
    df2: number;
    p: number;
    error?: string;
  };
  function kruskalWallis(groups: number[][]): {
    H: number;
    df: number;
    p: number;
    error?: string;
  };
  function etaSquared(groups: number[][]): number;
  function epsilonSquared(groups: number[][]): number;
  function ptukey(q: number, k: number, df: number): number;
  function qtukey(p: number, k: number, df: number): number;
  interface TukeyPair {
    i: number;
    j: number;
    diff: number;
    se: number;
    q: number;
    p: number;
    lwr: number;
    upr: number;
  }
  function tukeyHSD(
    groups: number[][],
    opts?: { alpha?: number }
  ): { pairs: TukeyPair[]; k?: number; df?: number; mse?: number; error?: string };
  interface GamesHowellPair {
    i: number;
    j: number;
    diff: number;
    se: number;
    q: number;
    df: number;
    p: number;
  }
  function gamesHowell(groups: number[][]): {
    pairs: GamesHowellPair[];
    k?: number;
    error?: string;
  };
  function bhAdjust(ps: number[]): number[];
  function multisetIntersectionPExact(xObs: number, ns: number[], N: number): number;
  function multisetIntersectionPExactLower(xObs: number, ns: number[], N: number): number;
  function multisetIntersectionPPoisson(xObs: number, ns: number[], N: number): number;
  function multisetIntersectionP(xObs: number, ns: number[], N: number): number;
  function multisetIntersectionExpected(ns: number[], N: number): number;
  function multisetExclusiveExpected(
    insideSizes: number[],
    outsideSizes: number[],
    N: number
  ): number;
  function multisetExclusiveP(
    xObs: number,
    insideSizes: number[],
    outsideSizes: number[],
    N: number,
    opts?: { tail?: "upper" | "lower" }
  ): number;
  interface DunnPair {
    i: number;
    j: number;
    z: number;
    p: number;
    pAdj?: number;
  }
  function dunnTest(groups: number[][]): { pairs: DunnPair[]; method?: string; error?: string };
  function compactLetterDisplay(
    pairs: Array<{ i: number; j: number; p: number; pAdj?: number }>,
    k: number,
    alpha?: number
  ): string[];
  interface NormalityResult {
    group: number;
    n: number;
    W: number | null;
    p: number | null;
    normal: boolean | null;
    note?: string;
  }
  type RecommendedTest =
    | "studentT"
    | "welchT"
    | "mannWhitney"
    | "oneWayANOVA"
    | "welchANOVA"
    | "kruskalWallis";
  type RecommendedPostHoc = "tukeyHSD" | "gamesHowell" | "dunn" | null;
  function selectTest(
    groups: number[][],
    opts?: { alphaNormality?: number; alphaVariance?: number }
  ): {
    k: number;
    normality?: NormalityResult[];
    allNormal?: boolean;
    levene?: {
      F?: number;
      df1?: number;
      df2?: number;
      p?: number;
      equalVar?: boolean | null;
      error?: string;
    };
    recommendation?: {
      test: RecommendedTest;
      postHoc: RecommendedPostHoc;
      reason: string;
    };
    error?: string;
  };
  function pStars(p: number): string;
  function formatP(p: number | null | undefined): string;

  // ── Clustering (stats.js) ──────────────────────────────────────────────────
  function pairwiseDistance(matrix: number[][], metric: string): number[][];
  interface HClustNode {
    index?: number;
    left?: HClustNode;
    right?: HClustNode;
    height: number;
    size: number;
  }
  function hclust(distMatrix: number[][], linkage: string): { tree: HClustNode; order: number[] };
  interface DendrogramSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  function dendrogramLayout(tree: HClustNode): {
    segments: DendrogramSegment[];
    maxHeight: number;
  };
  function kmeans(
    matrix: number[][],
    k: number,
    opts?: { seed?: number; maxIter?: number; restarts?: number }
  ): {
    clusters: number[];
    centroids: number[][];
    inertia: number;
    iterations: number;
    order: number[];
  };
}

export {};

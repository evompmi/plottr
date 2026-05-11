// Barrel re-export for the Venn tool's pure helpers. Consumers (venn.tsx,
// tests/helpers/venn-loader.js) import from here; the actual code lives in
// cohesion-keyed sibling modules:
//
//   constants.ts — VENN_CONFIG, VIS_INIT_VENN
//   set-math.ts  — intersection enumeration, region labels, subset/disjoint detection
//   geometry.ts  — circle overlap, intersection points, region-path assembly
//   areas.ts     — closed-form region areas + layout-error metric
//   layout.ts    — proportional + classic layout builders, validator, refinement loop
//   centroids.ts — visual-centroid finder for region labels
//
// The split replaces a single 965-line `helpers.ts` grab-bag with six files
// keyed on what the code *does*, so navigation no longer depends on
// remembering which section marker a symbol lives under.

export { VENN_CONFIG, VIS_INIT_VENN } from "./constants";
export {
  computeIntersections,
  regionLabel,
  regionFilenamePart,
  detectSubsets,
  detectDisjoint,
} from "./set-math";
export {
  circleOverlapArea,
  solveDistance,
  circleIntersectionPoints,
  isInsideCircle,
  normAngle,
  buildRegionPaths,
} from "./geometry";
export {
  triangleArea,
  chordSegmentArea,
  tripleIntersectionArea,
  computeAllRegionAreas,
  computeLayoutError,
} from "./areas";
export {
  validateAndFixLayout,
  fitCirclesToViewport,
  clampRadii,
  refine3SetLayout,
  buildVenn2Layout,
  buildVenn3Layout,
  buildVenn2LayoutClassic,
  buildVenn3LayoutClassic,
} from "./layout";
export { computeRegionCentroids } from "./centroids";
// `detectLongFormat` lifted to `_shell/long-format-detect.ts` 2026-05
// (UpSet shares the same logic — see tools/upset/app.tsx). Re-exported
// here so the venn test loader (tests/helpers/venn-loader.js) keeps
// pulling it through the venn/helpers barrel without changes.
export { detectLongFormat } from "../_shell/long-format-detect";
export type { LongFormatDetection } from "../_shell/long-format-detect";
export type { Region, SetMap } from "./set-math";

import type { Region, SetMap } from "./set-math";
import { VIS_INIT_VENN } from "./constants";

// ── Vis state + prop interfaces ─────────────────────────────────────────────
//
// `VennVis` is the runtime shape of `VIS_INIT_VENN` in constants.ts —
// re-derived here via `typeof` so the prop bags don't need to duplicate
// the field list. UpdVis matches the reducer signature emitted by
// `usePlotToolState`.
export type VennVis = typeof VIS_INIT_VENN;
export type UpdVis = (patch: Partial<VennVis> | { _reset: true }) => void;

// ── Step / control prop bags ────────────────────────────────────────────────

export interface UploadStepProps {
  sepOverride: string;
  setSepOverride: (s: string) => void;
  handleFileLoad: (text: string, name: string) => void;
  handleTextPaste: (text: string, name: string) => void;
  onLoadExample: () => void;
}

export interface ConfigureStepProps {
  fileName: string;
  // Separator the auto-detector resolved. Empty string until first parse.
  detectedSep: string;
  parsedHeaders: string[];
  parsedRows: string[][];
  allColumnNames: string[];
  allColumnSets: SetMap;
  pendingSelection: string[];
  // Mirrors React's `Dispatch<SetStateAction<string[]>>` — accepts a
  // direct value OR a functional updater. Step uses both forms.
  setPendingSelection: (sel: string[] | ((prev: string[]) => string[])) => void;
  isLongFormat: boolean;
}

// ── Layout warning info ─────────────────────────────────────────────────────
//
// Reported by VennChart back to App via `onLayoutInfo` after every layout
// pass. The warnings array is human-readable text (proportional layout
// can hit a degenerate config that the validator falls back from); the
// error metrics let the App badge the chart when the requested
// proportions couldn't be honoured exactly.
export interface VennLayoutInfo {
  warnings: string[];
  proportional: boolean;
  maxError: number;
  meanError: number;
}

// `setSetColors` accepts either a direct value or a functional updater
// (mirrors React's `Dispatch<SetStateAction<T>>` shape so call sites
// using either form keep working).
export type SetColorsUpdater =
  | Record<string, string>
  | ((prev: Record<string, string>) => Record<string, string>);

export interface VennChartProps {
  setNames: string[];
  sets: SetMap;
  intersections: Region[];
  colors: Record<string, string>;
  selectedMask: number | null;
  onRegionClick?: (mask: number | null) => void;
  plotTitle: string;
  plotBg: string;
  fontSize: number;
  fillOpacity: number;
  onLayoutInfo?: (info: VennLayoutInfo) => void;
  proportional: boolean;
  readabilityBlend?: number;
  showOutline?: boolean;
}

export interface IntersectionTableProps {
  intersections: Region[];
  allSetNames: string[];
  selectedMask: number | null;
  onSelect: (mask: number | null) => void;
}

export interface ItemListPanelProps {
  intersection: Region | null;
  allSetNames: string[];
  fileName: string;
}

export interface PlotAreaProps {
  chartRef: React.RefObject<SVGSVGElement>;
  activeSetNames: string[];
  activeSetsMap: SetMap;
  intersections: Region[];
  setColors: Record<string, string>;
  selectedMask: number | null;
  setSelectedMask: (mask: number | null) => void;
  vis: VennVis;
  proportional: boolean;
  layoutInfo: VennLayoutInfo;
  setLayoutInfo: (info: VennLayoutInfo) => void;
  selectedIntersection: Region | null;
  fileName: string;
}

export interface PlotControlsProps {
  allSetNames: string[];
  allSets: SetMap;
  activeSetNames: string[];
  activeSets: Set<string>;
  intersections: Region[];
  onToggleSet: (name: string) => void;
  setColors: Record<string, string>;
  onColorChange: (name: string, color: string) => void;
  onRename: (oldName: string, newName: string) => boolean;
  vis: VennVis;
  updVis: UpdVis;
  chartRef: React.RefObject<SVGSVGElement>;
  resetAll: () => void;
  proportional: boolean;
  onProportionalChange: (b: boolean) => void;
  fileName: string;
}

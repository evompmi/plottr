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
export { detectLongFormat } from "./long-format-detect";
export type { LongFormatDetection } from "./long-format-detect";
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
  onLoadExample: () => void;
}

export interface ConfigureStepProps {
  fileName: string;
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
  chartRef: React.RefObject<SVGSVGElement | null>;
  resetAll: () => void;
  proportional: boolean;
  onProportionalChange: (b: boolean) => void;
  fileName: string;
}

// Shared result-shape interfaces for the stats kernels.
//
// Pragmatic types — match the runtime shapes produced by the test / post-hoc
// implementations. They intentionally keep optional fields where the function
// returns a different subset on the error path (`error` present) vs. the
// happy path (full statistic + p-value).

export interface SampleErr {
  error?: string;
}

export interface TTestResult extends SampleErr {
  t: number;
  df: number;
  p: number;
  mean1?: number;
  mean2?: number;
  var1?: number;
  var2?: number;
  n1?: number;
  n2?: number;
}

export interface MannWhitneyResult extends SampleErr {
  U: number;
  U1?: number;
  U2?: number;
  z: number;
  p: number;
  n1?: number;
  n2?: number;
}

export interface ShapiroWilkResult extends SampleErr {
  W: number;
  p: number;
}

export interface LeveneResult extends SampleErr {
  F: number;
  df1: number;
  df2: number;
  p: number;
}

export interface ANOVAResult extends SampleErr {
  F: number;
  df1: number;
  df2: number;
  p: number;
  ssBetween?: number;
  ssWithin?: number;
  grandMean?: number;
}

export interface KruskalWallisResult extends SampleErr {
  H: number;
  df: number;
  p: number;
}

export interface CorrelationCI {
  lo: number;
  hi: number;
}

export interface PearsonResult extends SampleErr {
  r: number;
  t: number;
  df: number;
  p: number;
  n: number;
  ci?: CorrelationCI;
}

export interface SpearmanResult extends SampleErr {
  rho: number;
  t: number;
  df: number;
  p: number;
  n: number;
  ci?: CorrelationCI;
}

export interface KendallResult extends SampleErr {
  tau: number;
  z: number;
  p: number;
  n: number;
  S: number;
}

export interface TukeyPair {
  i: number;
  j: number;
  diff: number;
  se: number;
  q: number;
  p: number;
  lwr: number;
  upr: number;
}

export interface TukeyResult extends SampleErr {
  pairs: TukeyPair[];
  k?: number;
  df?: number;
  mse?: number;
  warning?: string;
}

export interface GamesHowellPair {
  i: number;
  j: number;
  diff: number;
  se: number;
  q: number;
  df: number;
  p: number;
}

export interface GamesHowellResult extends SampleErr {
  pairs: GamesHowellPair[];
  k?: number;
}

export interface DunnPair {
  i: number;
  j: number;
  z: number;
  p: number;
  pAdj?: number;
}

export interface DunnResult extends SampleErr {
  pairs: DunnPair[];
  method?: string;
}

export interface RankWithTies {
  ranks: number[];
  tieCorrection: number;
}

export interface PairwiseComplete {
  xs: number[];
  ys: number[];
  n: number;
}

export type SelectTestKind =
  | "welchT"
  | "welchANOVA"
  | "studentT"
  | "oneWayANOVA"
  | "mannWhitney"
  | "kruskalWallis";

export type SelectTestPostHoc = "tukeyHSD" | "gamesHowell" | "dunn" | null;

export interface NormalityResult {
  group: number;
  n: number;
  W: number | null;
  p: number | null;
  normal: boolean | null;
  note?: string;
}

export interface SelectTestSuggestion {
  test: SelectTestKind;
  postHoc: SelectTestPostHoc;
  reason: string;
}

export interface SelectTestResult {
  k: number;
  normality?: NormalityResult[];
  allNormal?: boolean;
  levene?:
    | { error: string }
    | { F: number; df1: number; df2: number; p: number; equalVar: boolean | null };
  recommendation?: { test: SelectTestKind; postHoc: SelectTestPostHoc; reason: string };
  suggestion?: SelectTestSuggestion;
  error?: string;
}

// Clustering — used by tools/heatmap/.
export interface HClustTreeNode {
  index: number;
  left: HClustTreeNode | null;
  right: HClustTreeNode | null;
  height: number;
  size: number;
  _leafPos?: number;
}

export interface HClustResult {
  tree: HClustTreeNode | null;
  order: number[];
}

export interface DendrogramSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DendrogramLayout {
  segments: DendrogramSegment[];
  maxHeight: number;
}

export interface KMeansOptions {
  seed?: number;
  maxIter?: number;
  restarts?: number;
}

export interface KMeansResult {
  clusters: number[];
  centroids: number[][];
  inertia: number;
  iterations: number;
  order: number[];
}

export type DistanceMetric = "euclidean" | "manhattan" | "correlation";
export type LinkageMethod = "average" | "complete" | "single";

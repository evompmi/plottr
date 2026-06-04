// Volcano plot — App orchestrator. Mirrors scatter's wiring (the closest
// tool in shape) but with three-class significance colouring, reference
// lines, p-value clamping, top-N feature labels, click-to-label, and
// optional Color / Size aesthetic mappings.
//
// Folder layout (matches the boxplot convention):
//   helpers.ts   — pure logic (classify / score / layout / aesthetic
//                   maps / row→VolcanoPoint pull / eligibleColumns).
//                   Loaded by tests/helpers/volcano-loader.js.
//   chart.tsx    — VolcanoChart (forwardRef SVG renderer)
//   chart-layout.ts / chart-legends.tsx — supporting modules for chart.tsx
//   controls.tsx — VolcanoAesBox + sidebar tiles (Thresholds / Colors /
//                   ColorMap / SizeMap / Labels / Style / Summary).
//   steps.tsx    — ConfigureStep + PlotStep wrappers.
//   reports.ts   — buildVolcanoRScript + buildVolcanoCsv (sanitised)
//   howto.tsx    — VOLCANO_HOWTO content for the in-tool help tile.
//   index.tsx    — this file: App + ReactDOM mount.
//
// All shared scaffold (PlotToolShell, usePlotToolState, FormulaInjection
// banner, etc.) come from the tools/_shell/ + shared.bundle.js pair every
// other tool uses.

import { HowTo, PlotToolShell, UploadPanel, usePlotToolState } from "../_shell";
import "./i18n";
import { tt, useT } from "./i18n";
import { useVolcanoHowTo } from "./howto";
import {
  VOLCANO_DEFAULT_COLORS,
  classifyPoint,
  computePFloor,
  countClamped,
  summarize,
  autoDetectColumns,
  buildColorMap,
  buildSizeMap,
  buildPoints,
} from "./helpers";
import type { ColorMap, LabelLayoutInfo, VolcanoPoint, VolcanoVis } from "./helpers";
import { ConfigureStep, PlotStep } from "./steps";
import { buildVolcanoRScript, buildVolcanoCsv } from "./reports";

import { COLOR_PALETTES, PALETTE, interpolateColor } from "../_core/color";
import { autoDetectSep, fixDecimalCommas, parseData } from "../_core/csv";
import type { ParseDataResult } from "../_core/csv";
import { downloadCsv, downloadText, fileBaseName } from "../_core/download";
const { useState, useEffect, useMemo, useCallback, useRef } = React;

// Initial visualisation state — persisted via auto-prefs. Annotated as
// `VolcanoVis` so the type widens beyond the const-literal shape (the
// `colorUp` slot is `string`, not the `"#D55E00"` literal that
// `VOLCANO_DEFAULT_COLORS.up` would otherwise narrow it to).
const VIS_INIT_VOLCANO: VolcanoVis = {
  fcCutoff: 1,
  pCutoff: 0.05,
  topNUp: 10,
  topNDown: 10,
  showLabels: true,
  showRefLines: true,
  showAxes: true,
  pointRadius: 3,
  pointAlpha: 0.7,
  labelFontSize: 11,
  // Aesthetic mapping defaults (used when the colour-/size-map tiles
  // are toggled On). Column indices live in local state; these are the
  // style knobs that survive reloads.
  colorMapPalette: "viridis",
  colorMapInvert: false,
  sizeMapMinR: 2,
  sizeMapMaxR: 9,
  plotWidth: 800,
  colorUp: VOLCANO_DEFAULT_COLORS.up,
  colorDown: VOLCANO_DEFAULT_COLORS.down,
  colorNs: VOLCANO_DEFAULT_COLORS.ns,
  // Discrete-palette key driving the up/down/ns slot mapping. Default
  // "okabe-ito" keeps the existing VOLCANO_DEFAULT_COLORS visually
  // (PALETTE[5] = vermillion = up, PALETTE[4] = blue = down, neutral grey
  // = ns). Picking a palette maps `[0]` → up, `[1]` → down, last/neutral
  // → ns. The user can hand-edit any of the 3 slots afterward.
  discretePalette: "okabe-ito",
  xMin: null,
  xMax: null,
  yMin: null,
  yMax: null,
  plotTitle: "",
};

// ── App ────────────────────────────────────────────────────────────────

// ── Bundled example dataset ──
// Synthetic DESeq2-style differential expression dataset for the
// Volcano tool's "Load example" button. ~215 features, five columns:
//
//   gene_symbol      — feature label (Arabidopsis ortholog symbols
//                       like CCA1, LHY, TOC1, PIF4, … plus made-up
//                       AT-numbers; covers what a user would paste).
//   log2FoldChange   — X axis.
//   padj             — adjusted p-value (preferred Y axis).
//   pvalue           — raw p-value, deterministically computed as
//                       padj × (some shrink factor in [0.5, 0.95]).
//                       Always ≤ padj, matching BH correction's
//                       monotonicity. Useful as an alternate Y axis
//                       to demo the auto-detect picking padj over
//                       pvalue.
//   baseMean         — average normalised expression across samples,
//                       on a log scale (~10 to ~50000). Loosely tied
//                       to significance (sig hits skew higher) so a
//                       size-by-baseMean mapping shows a sensible
//                       visual gradient. Designed for the Size
//                       aesthetic; can also drive the Color aesthetic
//                       in continuous mode.
//
// Numbers are deterministic (no randomness) so the same example
// produces the same chart every time. Generated once and frozen
// here; not regenerated at build time. If you re-roll, keep at
// least ~10 strongly-up and ~10 strongly-down features so the demo
// is visually informative on first load.
const EXAMPLE_TSV = `gene_symbol\tlog2FoldChange\tpadj\tpvalue\tbaseMean
CCA1\t-3.42\t1.2e-18\t6.0e-19\t158
LHY\t-3.15\t4.5e-17\t3.8e-17\t2336
TOC1\t2.87\t8.1e-15\t5.7e-15\t34538
PRR9\t-2.94\t2.3e-14\t1.3e-14\t406
PRR7\t-2.61\t6.7e-13\t6.0e-13\t5997
PRR5\t-2.18\t9.4e-11\t7.1e-11\t70.4
ELF3\t1.95\t3.8e-10\t2.3e-10\t1041
ELF4\t1.72\t5.9e-9\t5.6e-9\t15394
LUX\t1.48\t1.4e-8\t1.1e-8\t181
GI\t-2.34\t7.6e-12\t4.9e-12\t2673
ZTL\t1.21\t8.2e-7\t4.1e-7\t39517
FKF1\t1.08\t3.5e-6\t3.0e-6\t464
COP1\t-1.85\t6.3e-9\t4.4e-9\t6861
HY5\t2.23\t1.7e-10\t9.4e-11\t80.6
PIF4\t3.18\t9.4e-16\t8.5e-16\t1191
PIF5\t2.76\t4.2e-14\t3.1e-14\t17613
PIF7\t2.41\t8.8e-13\t5.3e-13\t207
SPA1\t-1.62\t2.7e-7\t2.6e-7\t3058
PHYA\t0.85\t8.4e-4\t6.7e-4\t35.9
PHYB\t-1.12\t1.3e-5\t8.5e-6\t531
CRY1\t1.34\t6.1e-7\t3.0e-7\t7851
CRY2\t-0.98\t4.5e-4\t3.8e-4\t92.2
TIC\t-1.41\t9.7e-6\t6.8e-6\t1363
JMJD5\t0.72\t3.2e-3\t0.002\t13435
LWD1\t-2.05\t8.6e-10\t7.7e-10\t237
LWD2\t-1.83\t4.1e-9\t3.1e-9\t3499
NF-YB\t1.16\t2.8e-5\t1.7e-5\t41.1
NF-YC\t1.04\t1.9e-4\t1.8e-4\t608
RVE4\t-2.52\t6.4e-12\t5.1e-12\t8982
RVE6\t-2.31\t1.8e-11\t1.2e-11\t106
RVE8\t-1.89\t9.2e-9\t4.6e-9\t1560
BBX19\t1.55\t3.7e-7\t3.1e-7\t23058
BBX24\t-1.27\t8.3e-6\t5.8e-6\t271
DOG1\t0.45\t0.018\t0.010\t2669
ABI3\t-0.61\t0.008\t0.007\t31.3
ABI5\t1.31\t1.2e-5\t9.0e-6\t695
RD29A\t2.84\t6.2e-13\t3.7e-13\t10277
RD29B\t1.97\t8.1e-9\t7.7e-9\t121
COR15A\t1.62\t2.4e-7\t1.9e-7\t1784
COR15B\t1.41\t1.6e-6\t1.0e-6\t26382
KIN1\t1.18\t9.8e-5\t4.9e-5\t310
KIN2\t1.07\t3.4e-4\t2.9e-4\t4581
LTI78\t-0.52\t0.025\t0.017\t35.9
LEA14\t1.93\t4.6e-9\t2.5e-9\t795
DREB1A\t2.41\t7.3e-12\t6.6e-12\t11759
DREB1B\t2.18\t2.9e-11\t2.2e-11\t138
DREB2A\t1.74\t1.3e-7\t7.8e-8\t2042
GolS3\t1.52\t6.8e-7\t6.5e-7\t30186
COL\t-1.05\t6.4e-5\t5.1e-5\t355
SOC1\t-0.42\t0.041\t0.027\t3494
FT\t-1.84\t8.9e-9\t4.5e-9\t61.6
TFL1\t0.75\t6.2e-4\t5.3e-4\t910
LFY\t-0.88\t8.3e-4\t5.8e-4\t13454
AP1\t-1.21\t9.4e-5\t5.2e-5\t158
AP3\t0.31\t0.083\t0.075\t1298
PI\t0.18\t0.241\t0.181\t19188
SEP3\t-0.42\t0.038\t0.023\t270
AG\t-0.65\t0.003\t0.003\t3998
SVP\t1.14\t5.3e-5\t4.2e-5\t70.4
FLM\t-0.87\t6.7e-4\t4.4e-4\t1041
FLC\t1.62\t8.4e-7\t4.2e-7\t15394
VIN3\t-0.95\t8.2e-4\t7.0e-4\t181
VIL1\t0.43\t0.029\t0.020\t1782
VIL2\t-0.31\t0.092\t0.051\t21954
WRKY70\t2.18\t6.2e-10\t5.6e-10\t464
WRKY33\t1.83\t3.1e-8\t2.3e-8\t6861
WRKY40\t-0.92\t6.4e-4\t3.8e-4\t80.6
NPR1\t1.42\t9.1e-6\t8.6e-6\t1191
PAD4\t1.18\t4.7e-5\t3.8e-5\t17613
EDS1\t1.04\t8.2e-5\t5.3e-5\t207
SAG13\t2.04\t1.3e-9\t6.5e-10\t3058
SAG21\t1.81\t8.6e-9\t7.3e-9\t35.9
SAG29\t1.57\t1.4e-7\t9.8e-8\t531
ORE1\t-1.24\t8.4e-6\t4.6e-6\t7851
NAC32\t-0.78\t1.2e-3\t0.001\t61.5
NAC72\t-0.61\t0.006\t0.005\t909
ANAC019\t1.84\t9.3e-9\t5.6e-9\t20153
ANAC055\t1.62\t8.7e-8\t8.3e-8\t237
ANAC072\t1.48\t6.1e-7\t4.9e-7\t3499
MYC2\t1.27\t3.4e-6\t2.2e-6\t41.1
MYB2\t-0.88\t6.3e-4\t3.2e-4\t608
MYB44\t1.31\t1.2e-5\t1.0e-5\t8982
MYB60\t-1.74\t2.6e-8\t1.8e-8\t106
MYB96\t1.94\t8.4e-9\t4.6e-9\t1560
JAZ1\t1.62\t8.4e-7\t7.6e-7\t23058
JAZ3\t1.42\t6.8e-6\t5.1e-6\t271
JAZ7\t-0.95\t6.2e-4\t3.7e-4\t4004
LOX2\t1.38\t8.4e-6\t8.0e-6\t47.0
LOX3\t1.21\t4.6e-5\t3.7e-5\t695
AOS\t1.04\t1.8e-4\t1.2e-4\t10277
AOC1\t0.98\t3.4e-4\t1.7e-4\t121
OPR3\t1.31\t1.7e-5\t1.4e-5\t1784
JAR1\t1.18\t8.4e-5\t5.9e-5\t26382
COI1\t-0.42\t0.039\t0.021\t207
ICS1\t-0.58\t0.012\t0.011\t3054
PR1\t-1.24\t6.4e-6\t4.8e-6\t53.8
PR2\t-0.82\t1.4e-3\t8.4e-4\t530
PR5\t-1.05\t6.2e-5\t5.9e-5\t11759
SID2\t-0.91\t9.3e-4\t7.4e-4\t138
EDS5\t-0.68\t0.005\t0.003\t1361
NDR1\t0.38\t0.067\t0.034\t16770
PAD3\t1.68\t8.2e-8\t7.0e-8\t355
CYP71A12\t1.48\t6.4e-7\t4.5e-7\t5241
CYP71A13\t1.62\t8.4e-8\t4.6e-8\t61.6
CAMTA1\t-0.42\t0.035\t0.032\t607
CAMTA3\t-0.61\t0.007\t0.005\t8970
CBP60g\t-0.85\t9.4e-4\t5.6e-4\t158
SARD1\t-0.92\t6.2e-4\t5.9e-4\t2336
WRKY46\t1.34\t1.6e-5\t1.3e-5\t34538
WRKY54\t1.21\t8.4e-5\t5.5e-5\t406
WRKY70b\t-0.78\t1.4e-3\t7.0e-4\t3998
PEN1\t0.45\t0.024\t0.020\t46.9
PEN2\t0.62\t0.005\t0.003\t694
PEN3\t-0.31\t0.092\t0.051\t8552
RPS2\t0.18\t0.295\t0.266\t100
RPM1\t0.21\t0.218\t0.164\t1485
RPS4\t-0.42\t0.037\t0.022\t26345
RPP1\t-0.85\t8.4e-4\t8.0e-4\t464
RPP4\t1.04\t1.4e-4\t1.1e-4\t6861
ADR1\t1.21\t6.4e-5\t4.2e-5\t80.6
NRG1\t-0.95\t6.2e-4\t3.1e-4\t1191
EDS16\t-0.78\t1.6e-3\t0.001\t11742
SNI1\t0.45\t0.026\t0.018\t138
SUMO1\t-0.31\t0.087\t0.048\t1699
SUMO2\t0.21\t0.224\t0.202\t20.0
SUMO3\t-0.62\t0.006\t0.005\t354
SIZ1\t-0.42\t0.031\t0.019\t5234
ESD4\t0.18\t0.302\t0.287\t51.2
RHA2A\t1.42\t1.7e-6\t1.4e-6\t1363
RHA2B\t1.21\t6.4e-5\t4.2e-5\t20153
ATL1\t-0.85\t9.1e-4\t4.6e-4\t237
ATL3\t-0.61\t0.008\t0.007\t2333
ATL5\t1.48\t6.4e-7\t4.5e-7\t41.1
ATL31\t1.34\t1.6e-5\t8.8e-6\t608
PUB22\t1.18\t8.4e-5\t7.6e-5\t8982
PUB23\t1.07\t1.4e-4\t1.0e-4\t106
PUB24\t-0.78\t1.4e-3\t8.4e-4\t1040
KEG\t-0.42\t0.041\t0.039\t15372
SAP5\t1.84\t9.3e-9\t7.4e-9\t271
SAP18\t1.62\t8.4e-8\t5.5e-8\t4004
SLY1\t-1.21\t6.4e-5\t3.2e-5\t47.0
GAI\t1.08\t1.4e-4\t1.2e-4\t695
RGA\t1.31\t1.7e-5\t1.2e-5\t10277
RGL1\t1.04\t1.8e-4\t9.9e-5\t121
RGL2\t0.95\t6.2e-4\t5.6e-4\t1784
RGL3\t1.42\t6.8e-6\t5.1e-6\t26382
SCL3\t-0.62\t0.005\t0.003\t207
SCR\t-0.42\t0.034\t0.032\t3054
SHR\t0.21\t0.241\t0.193\t29.9
MAGPIE\t1.18\t8.4e-5\t5.5e-5\t795
SHORT-ROOT\t1.34\t1.6e-5\t8.0e-6\t11759
PIN1\t-0.82\t1.4e-3\t0.001\t92.1
PIN2\t-0.61\t0.008\t0.006\t1361
PIN3\t1.04\t1.4e-4\t7.7e-5\t30186
PIN7\t1.21\t6.4e-5\t5.8e-5\t355
AUX1\t-0.42\t0.028\t0.021\t3494
LAX1\t0.31\t0.093\t0.056\t34.2
PID\t-0.85\t9.3e-4\t8.8e-4\t910
WAG1\t-0.62\t0.005\t0.004\t8970
TIR1\t1.18\t8.4e-5\t5.5e-5\t158
AFB1\t1.04\t1.6e-4\t8.0e-5\t2336
AFB2\t-0.78\t1.4e-3\t0.001\t23025
ARF1\t1.21\t6.4e-5\t4.5e-5\t406
ARF7\t1.42\t6.8e-6\t3.7e-6\t5997
ARF19\t1.34\t1.6e-5\t1.4e-5\t70.4
IAA1\t-0.85\t8.4e-4\t6.3e-4\t1041
IAA12\t1.48\t6.4e-7\t3.8e-7\t15394
IAA29\t-0.42\t0.038\t0.036\t121
GH3.1\t1.18\t8.4e-5\t6.7e-5\t2673
GH3.6\t1.07\t1.4e-4\t9.1e-5\t39517
SAUR15\t-0.82\t1.4e-3\t7.0e-4\t309
SAUR23\t-0.61\t0.008\t0.007\t4574
SAUR24\t1.04\t1.4e-4\t9.8e-5\t80.6
SAUR25\t1.31\t1.7e-5\t9.4e-6\t1191
ARR1\t-0.42\t0.031\t0.028\t11742
ARR2\t0.21\t0.247\t0.185\t115
ARR4\t-0.95\t6.2e-4\t3.7e-4\t3058
ARR5\t-1.08\t1.4e-4\t1.3e-4\t35.9
ARR6\t-1.21\t6.4e-5\t5.1e-5\t531
AHK4\t0.62\t0.005\t0.003\t5234
AHP1\t0.45\t0.024\t0.012\t61.5
AHP2\t-0.18\t0.341\t0.290\t757
KMD1\t1.42\t6.8e-6\t4.8e-6\t20153
ABA1\t1.84\t9.3e-9\t5.1e-9\t237
ABA2\t1.62\t8.4e-8\t7.6e-8\t3499
ABA3\t1.48\t6.4e-7\t4.8e-7\t41.1
NCED3\t2.12\t8.7e-11\t5.2e-11\t608
NCED5\t1.94\t8.4e-10\t8.0e-10\t8982
NCED6\t1.71\t8.4e-9\t6.7e-9\t106
NCED9\t1.58\t6.4e-8\t4.2e-8\t1560
ZEP\t1.42\t6.8e-7\t3.4e-7\t23058
AAO3\t1.31\t1.7e-6\t1.4e-6\t271
PYR1\t-0.85\t9.3e-4\t6.5e-4\t4004
PYL2\t-0.62\t0.005\t0.003\t31.3
PYL4\t-0.42\t0.031\t0.028\t463
PYL8\t0.21\t0.231\t0.173\t5710
SnRK2.2\t1.84\t9.3e-9\t5.6e-9\t121
SnRK2.3\t1.62\t8.4e-8\t8.0e-8\t1784
SnRK2.6\t1.48\t6.4e-7\t5.1e-7\t26382
ABF1\t1.21\t6.4e-5\t4.2e-5\t310
ABF2\t1.34\t1.6e-5\t8.0e-6\t4581
ABF3\t1.18\t8.4e-5\t7.1e-5\t53.8
ABF4\t1.07\t1.4e-4\t9.8e-5\t795
HB6\t1.42\t6.8e-6\t3.7e-6\t11759
HB12\t-0.78\t1.4e-3\t0.001\t92.1
AT1G01010\t0.18\t0.412\t0.309\t1134
AT2G45960\t0.42\t0.045\t0.027\t20124
AT3G18050\t-0.31\t0.084\t0.080\t197
AT4G12420\t0.21\t0.218\t0.174\t2912
AT5G50260\t-0.42\t0.027\t0.018\t41.0
AT1G73600\t1.84\t9.3e-9\t4.7e-9\t910
AT2G24310\t-1.62\t8.4e-8\t7.1e-8\t13454
AT3G47620\t1.48\t6.4e-7\t4.5e-7\t158
AT4G02380\t-1.21\t6.4e-5\t3.5e-5\t2336
AT5G64750\t1.34\t1.6e-5\t1.4e-5\t34538
`;

export function App() {
  const tr = useT();
  const howto = useVolcanoHowTo();
  const shell = usePlotToolState("volcano", VIS_INIT_VOLCANO);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    setInjectionWarning,
    vis,
    updVis,
  } = shell;

  // Tool-local state — column picks, parsed data, derived points.
  const [parsed, setParsed] = useState<ParseDataResult | null>(null);
  const [xCol, setXCol] = useState(-1);
  const [yCol, setYCol] = useState(-1);
  const [labelCol, setLabelCol] = useState(-1);
  const [yIsAdjusted, setYIsAdjusted] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const sepRef = useRef("");
  // Separator the auto-detector resolved on the most recent parse. Surfaced
  // inline on the Configure step's file-info line.
  const [detectedSep, setDetectedSep] = useState<string>("");

  // Self-healing guard for the non-significant slot. The palette picker
  // (in ColorsTile) commits `colorNs = VOLCANO_DEFAULT_COLORS.ns` every
  // time it fires — but two scenarios leave a stale non-grey value in
  // `vis.colorNs`:
  //   1. A brief Phase-2 build mapped the palette's last hex into
  //      colorNs. Users who picked a palette under that build have a
  //      non-grey value persisted in localStorage.
  //   2. Native `<select>` doesn't fire onChange when you re-pick the
  //      already-selected value, so handlePalette can't run.
  // This effect re-pins colorNs to the canonical grey on every
  // discretePalette change AND once on mount, which heals both cases on
  // the first interaction (and on first load for stale state). Manual
  // ns edits via the per-row ColorInput stay sticky during the session
  // — the dep is `vis.discretePalette`, so editing colorNs alone
  // doesn't fire this — but they are not preserved across a palette
  // change or a page reload. That matches the spec: "non-significant
  // should always be a shade of grey by default, whatever the palette
  // selected".
  useEffect(() => {
    if (vis.colorNs !== VOLCANO_DEFAULT_COLORS.ns) {
      updVis({ colorNs: VOLCANO_DEFAULT_COLORS.ns });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis.discretePalette]);

  // Manually-selected points (Set of original-row indices). Click on a
  // point in the chart to add/remove it; when this set is non-empty the
  // top-N auto-labelling is replaced with exactly these picks (so the
  // user can call out specific features regardless of class). Cleared
  // by the "Clear" button in the Labels tile, by re-uploading, or by
  // changing column roles in the Configure step (since picked indices
  // would no longer make sense against new data).
  const [manualSelection, setManualSelection] = useState<Set<number>>(() => new Set());

  // Optional aesthetic mappings — colour-by-column and size-by-column.
  // No on/off toggle: the "— None —" entry in the tile's column dropdown
  // is the off state (col === -1 disables the mapping). The column index
  // is local state (it's dataset-specific), but palette and radius bounds
  // live in `vis` so the user's style preference persists across reloads.
  const [colorMapCol, setColorMapCol] = useState<number>(-1);
  const [sizeMapCol, setSizeMapCol] = useState<number>(-1);
  const togglePointSelection = useCallback((idx: number) => {
    setManualSelection((prev) => {
      const next = new Set<number>(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);
  // Search-by-name path: union the matched indices into the same set as
  // click-to-label. Same Clear button covers both.
  const addToManualSelection = useCallback((indices: number[]) => {
    if (!indices || indices.length === 0) return;
    setManualSelection((prev) => {
      const next = new Set<number>(prev);
      for (const i of indices) next.add(i);
      return next;
    });
  }, []);
  const clearManualSelection = useCallback(() => setManualSelection(new Set()), []);

  // ── Parsing ──────────────────────────────────────────────────────────

  const doParse = useCallback(
    (text: string, sep: string) => {
      // Resolve "auto" (sep === "") before fixDecimalCommas so European
      // semicolon-delimited input still gets its decimal commas fixed
      // — `fixDecimalCommas` short-circuits on sep === "". Same pattern
      // as boxplot/app.tsx.
      const resolved = autoDetectSep(text, sep);
      const effectiveSep = typeof resolved === "string" ? resolved : "";
      sepRef.current = effectiveSep;
      setDetectedSep(effectiveSep);
      const dc = fixDecimalCommas(text, effectiveSep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const fixed = dc.text;
      const out = parseData(fixed, effectiveSep);
      setInjectionWarning(out.injectionWarnings);
      if (out.headers.length < 2 || out.data.length === 0) {
        setParseError(tt("volcano.err.fewCols"));
        return;
      }
      setParseError(null);
      setRawText(fixed);
      setParsed(out);
      // Auto-pick column roles on first load.
      const guess = autoDetectColumns(out.headers);
      setXCol(guess.xCol >= 0 ? guess.xCol : 0);
      setYCol(guess.yCol >= 0 ? guess.yCol : Math.min(1, out.headers.length - 1));
      setLabelCol(guess.labelCol);
      setYIsAdjusted(guess.yIsAdjusted);
      // Drop any prior manual selection / aesthetic mappings — their
      // column indices reference the previous dataset and would point
      // at the wrong column (or no column) on the new shape.
      setManualSelection(new Set());
      setColorMapCol(-1);
      setSizeMapCol(-1);
      setStep("configure");
    },
    [setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [doParse, setFileName, sepOverride]
  );

  // Paste-data path. UploadPanel hands raw text + a synthetic filename;
  // size is gated in the panel against FILE_LIMIT_BYTES. Force
  // sepOverride="" so auto-detect kicks in for Excel/Sheets paste.
  const handleTextPaste = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      setSepOverride("");
      doParse(text, "");
    },
    [doParse, setFileName, setSepOverride]
  );

  const onLoadExample = useCallback(() => {
    const ex = EXAMPLE_TSV;
    if (!ex) return;
    // Leave sepOverride empty so the Override disclosure stays closed on
    // back-nav; autoDetectSep resolves "\t" from the bundled TSV.
    setSepOverride("");
    setFileName("volcano_example.tsv");
    doParse(ex, "");
  }, [doParse, setFileName, setSepOverride]);

  const resetAll = useCallback(() => {
    setRawText(null);
    setParsed(null);
    setXCol(-1);
    setYCol(-1);
    setLabelCol(-1);
    setYIsAdjusted(false);
    setFileName("");
    setInjectionWarning(null);
    setManualSelection(new Set());
    setColorMapCol(-1);
    setSizeMapCol(-1);
    setStep("upload");
  }, [setFileName, setInjectionWarning, setStep]);

  // ── Derived points + p-floor ─────────────────────────────────────────

  const points: VolcanoPoint[] = useMemo(() => {
    if (!parsed || xCol < 0 || yCol < 0) return [];
    return buildPoints(parsed.rawData, xCol, yCol, labelCol);
  }, [parsed, xCol, yCol, labelCol]);

  const pFloor = useMemo(() => computePFloor(points), [points]);
  const clampedCount = useMemo(() => countClamped(points), [points]);
  const summary = useMemo(
    () => summarize(points, vis.fcCutoff, vis.pCutoff),
    [points, vis.fcCutoff, vis.pCutoff]
  );

  const xLabel = parsed && xCol >= 0 ? parsed.headers[xCol] : tr("volcano.xLabelFallback");
  const yLabel = parsed && yCol >= 0 ? "−log₁₀(" + parsed.headers[yCol] + ")" : "−log₁₀(p-value)";

  // Derived aesthetic mappings — null when the tile is toggled Off,
  // populated otherwise. The chart consumes `colorByIdx` / `radiusByIdx`
  // maps directly: keyed by VolcanoPoint.idx (the original parsed-row
  // index). Memoised against parsed data + the column / palette knobs
  // so dragging a slider doesn't rebuild on every render.
  const colorMap: ColorMap = useMemo(() => {
    if (!parsed || colorMapCol < 0) return null;
    // shared.js declares `const COLOR_PALETTES` / `const PALETTE` /
    // `function interpolateColor` at script-top scope — `function` and
    // `var` attach to `window` in a classic <script> tag, but `const`
    // and `let` do not. Reach for the bare ambient globals (typed in
    // types/globals.d.ts) directly; `window.COLOR_PALETTES` is `undefined`
    // here and dereferencing it crashed the colour-mapping path.
    const baseStops = COLOR_PALETTES[vis.colorMapPalette] || COLOR_PALETTES.viridis;
    const stops = vis.colorMapInvert ? [...baseStops].reverse() : baseStops;
    // Restrict the mapping to features that pass the thresholds —
    // colouring noise dilutes the legend and the visual signal. The
    // chart enforces the same rule in its `fillFor` resolver, so even
    // if a stale colorByIdx entry leaked through it would be ignored
    // for ns points; filtering here keeps the type-detection /
    // legend / colourbar range consistent with what the user sees.
    const sigIndices: number[] = [];
    for (const pt of points) {
      const cls = classifyPoint(pt.log2fc, pt.p, vis.fcCutoff, vis.pCutoff);
      if (cls !== "ns") sigIndices.push(pt.idx);
    }
    return buildColorMap({
      rawData: parsed.rawData,
      pointIndices: sigIndices,
      col: colorMapCol,
      paletteStops: stops,
      paletteName: vis.colorMapPalette,
      discretePalette: PALETTE,
      interpolate: interpolateColor,
    });
  }, [
    parsed,
    colorMapCol,
    vis.colorMapPalette,
    vis.colorMapInvert,
    vis.fcCutoff,
    vis.pCutoff,
    points,
  ]);

  const sizeMap = useMemo(() => {
    if (!parsed || sizeMapCol < 0) return null;
    return buildSizeMap(
      parsed.rawData,
      points.map((p) => p.idx),
      sizeMapCol,
      vis.sizeMapMinR,
      vis.sizeMapMaxR
    );
  }, [parsed, sizeMapCol, vis.sizeMapMinR, vis.sizeMapMaxR, points]);

  // Column header names for the SVG legend titles. Empty when the
  // mapping is off (no legend rendered).
  const colorMapLabel = parsed && colorMapCol >= 0 ? parsed.headers[colorMapCol] : "";
  const sizeMapLabel = parsed && sizeMapCol >= 0 ? parsed.headers[sizeMapCol] : "";

  // ── Download handlers ────────────────────────────────────────────────

  const chartRef = useRef<SVGSVGElement>(null);

  // Density-aware label cap: chart fires this after each layout
  // computation with the actual forced/attempted counts. Surfaces in
  // the LabelsTile as a "labels at this density may overlap" warning
  // when the user has asked for more than the data distribution can
  // place cleanly. One render-tick lag (chart commits → effect →
  // setState → controls re-render); fine for an advisory hint.
  const [labelDensity, setLabelDensity] = useState<LabelLayoutInfo>({
    forcedCount: 0,
    attemptedCount: 0,
  });

  const onDownloadCsv = () => {
    const { headers, rows } = buildVolcanoCsv({
      points,
      fcCutoff: vis.fcCutoff,
      pCutoff: vis.pCutoff,
      yIsAdjusted,
    });
    downloadCsv(headers, rows, fileBaseName(fileName, "volcano") + "_classified.csv");
  };
  const onDownloadR = () => {
    const txt = buildVolcanoRScript({
      points,
      fcCutoff: vis.fcCutoff,
      pCutoff: vis.pCutoff,
      colors: { up: vis.colorUp, down: vis.colorDown, ns: vis.colorNs },
      xLabel,
      yLabel,
      plotTitle: vis.plotTitle,
      yIsAdjusted,
    });
    downloadText(txt, fileBaseName(fileName, "volcano") + ".R");
  };

  // ── Navigation guards ────────────────────────────────────────────────

  const canNavigate = (target: string) => {
    if (target === "upload") return true;
    if (target === "configure") return !!parsed;
    if (target === "plot") return !!parsed && xCol >= 0 && yCol >= 0;
    return false;
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <PlotToolShell
      state={shell}
      toolName="volcano"
      title="Volcano Plot"
      visInit={VIS_INIT_VOLCANO}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <div>
          <UploadPanel
            sepOverride={sepOverride}
            onSepChange={(v) => {
              setSepOverride(v);
              if (rawText) doParse(rawText, v);
            }}
            onFileLoad={handleFileLoad}
            onTextPaste={handleTextPaste}
            autoDetect
            onLoadExample={onLoadExample}
            exampleSummary={{
              title: tr("volcano.example.title"),
              subtitle: tr("volcano.example.subtitle"),
            }}
            hint={tr("volcano.upload.hint")}
          />
          <HowTo {...howto} />
        </div>
      )}

      {step === "configure" && parsed && (
        <ConfigureStep
          parsed={parsed}
          fileName={fileName}
          detectedSep={detectedSep}
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          yIsAdjusted={yIsAdjusted}
          setXCol={setXCol}
          setYCol={setYCol}
          setLabelCol={setLabelCol}
          setYIsAdjusted={setYIsAdjusted}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          chartRef={chartRef}
          parsed={parsed}
          xCol={xCol}
          yCol={yCol}
          labelCol={labelCol}
          points={points}
          pFloor={pFloor}
          clampedCount={clampedCount}
          summary={summary}
          xLabel={xLabel}
          yLabel={yLabel}
          vis={vis}
          updVis={updVis}
          manualSelection={manualSelection}
          togglePointSelection={togglePointSelection}
          clearManualSelection={clearManualSelection}
          addToManualSelection={addToManualSelection}
          colorMapCol={colorMapCol}
          setColorMapCol={setColorMapCol}
          colorMap={colorMap}
          colorMapLabel={colorMapLabel}
          sizeMapCol={sizeMapCol}
          setSizeMapCol={setSizeMapCol}
          sizeMap={sizeMap}
          sizeMapLabel={sizeMapLabel}
          fileName={fileName}
          onDownloadCsv={onDownloadCsv}
          onDownloadR={onDownloadR}
          onReset={resetAll}
          labelDensity={labelDensity}
          onLabelLayoutInfo={setLabelDensity}
        />
      )}
    </PlotToolShell>
  );
}

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

window.__VOLCANO_EXAMPLE__ = `gene_symbol\tlog2FoldChange\tpadj\tpvalue\tbaseMean
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

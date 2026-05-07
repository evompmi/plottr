// Loads tools/stats.js into a Node vm context and exposes its
// statistical primitives (distributions, tests, descriptive helpers,
// effect sizes, post-hocs, p-value adjustments) for direct testing.
//
// Pattern: identical to shared-loader.js — the file is plain ES2022
// script-mode JS, so we just runInContext and read functions off the
// context. No esbuild transform needed.
//
// Used by: tests/stats.property.test.js (and any future stats test
// file that wants the primitives without paying for the full
// shared.js / shared-stats-tile.js / per-tool helpers stack).

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../../tools/stats.js"), "utf8");

const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Number,
  String,
  Array,
  Object,
  Infinity,
  NaN,
  Set,
  Map,
};

vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = {
  // Standard normal
  normcdf: ctx.normcdf,
  norminv: ctx.norminv,
  // Gamma / Beta family (used to build the others)
  gammaln: ctx.gammaln,
  gammainc: ctx.gammainc,
  gammainc_upper: ctx.gammainc_upper,
  betai: ctx.betai,
  betacf: ctx.betacf,
  // Student t
  tcdf: ctx.tcdf,
  tcdf_upper: ctx.tcdf_upper,
  tinv: ctx.tinv,
  // F + chi-square
  fcdf: ctx.fcdf,
  fcdf_upper: ctx.fcdf_upper,
  chi2cdf: ctx.chi2cdf,
  chi2inv: ctx.chi2inv,
  // Non-central distributions (used by power calcs)
  nctcdf: ctx.nctcdf,
  ncf_sf: ctx.ncf_sf,
  ncchi2cdf: ctx.ncchi2cdf,
  // Numeric utility
  bisect: ctx.bisect,
  // Descriptive
  sampleMean: ctx.sampleMean,
  sampleVariance: ctx.sampleVariance,
  sampleSD: ctx.sampleSD,
  rankWithTies: ctx.rankWithTies,
  // Tests
  shapiroWilk: ctx.shapiroWilk,
  leveneTest: ctx.leveneTest,
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  // Effect sizes
  cohenD: ctx.cohenD,
  hedgesG: ctx.hedgesG,
  rankBiserial: ctx.rankBiserial,
  etaSquared: ctx.etaSquared,
  epsilonSquared: ctx.epsilonSquared,
  // Post-hocs
  ptukey: ctx.ptukey,
  qtukey: ctx.qtukey,
  tukeyHSD: ctx.tukeyHSD,
  gamesHowell: ctx.gamesHowell,
  dunnTest: ctx.dunnTest,
  bhAdjust: ctx.bhAdjust,
  compactLetterDisplay: ctx.compactLetterDisplay,
  // Routing
  selectTest: ctx.selectTest,
};

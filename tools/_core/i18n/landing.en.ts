// English catalog for the static landing page (namespace "landing").
// Applied to index.html via data-i18n / data-i18n-html / data-i18n-title
// by `applyStaticI18n`. Shipped in tools/shared.bundle.js (registered in
// _core/shared-bundle-entry.ts) so the landing's inline script can swap
// copy without the SPA module bundle.
//
// `*.html` values carry authored markup (<b>, <br/>, super/subscripts);
// they are ours, not user input, so innerHTML application is safe.

import type { Catalog } from "../i18n";

const landingEn = {
  "landing.eyebrow": "Browser-only · no install · your data stays put",
  "landing.tagline":
    "Paste a spreadsheet. Get a <b>publication-ready figure</b> — and the <b>R code</b> for the statistics behind it.",

  "landing.trust.validated": "Validated against R + SciPy",
  "landing.trust.validatedTitle": "Cross-checked vs R 4.5 + SciPy 1.17 — see the public benchmark",
  "landing.trust.privacy": "Data stays in your browser",
  "landing.trust.privacyTitle": "No uploads, no tracking — see the data-flow diagram",

  "landing.hiw.label": "How it works",
  "landing.hiw.step1": "Upload CSV",
  "landing.hiw.step2": "Assign roles",
  "landing.hiw.step3": "Tweak plot",
  "landing.hiw.step4": "Download SVG + R",

  "landing.group.plotsKicker": "Plots",
  "landing.group.plotsText": "Eight chart types, one paste away",
  "landing.group.statsKicker": "Statistics & Calculators",
  "landing.group.statsText": "Quick math at the bench",

  "landing.desc.boxplot": "Box / violin / bar<br/>with stats &amp; facets",
  "landing.desc.scatter": "XY with color<br/>&amp; size mapping",
  "landing.desc.lineplot": "Profile plot<br/>mean ± error by group",
  "landing.desc.aequorin": "Optional Ca²⁺<br/>calibration",
  "landing.desc.venn": "Set overlaps<br/>2–3 sets",
  "landing.desc.upset": "Set overlaps<br/>4+ sets",
  "landing.desc.heatmap": "Matrix view<br/>with clustering",
  "landing.desc.volcano": "log₂FC vs −log₁₀p<br/>for —omics hits",
  "landing.desc.power": "Sample size &amp; power<br/>for t, ANOVA, χ², r",
  "landing.desc.molarity": "Molarity, dilution<br/>&amp; batch prep sheets",

  // Theme toggle (title/aria) — set dynamically by index.html's inline
  // theme IIFE via t(); changes with the current mode.
  "landing.theme.toLight": "Switch to light mode",
  "landing.theme.toDark": "Switch to dark mode",

  "landing.footer.cite": "Cite — Zenodo DOI",
  "landing.footer.citeTitle": "Archived on Zenodo — cite Plöttr via DOI 10.5281/zenodo.20245057",
  "landing.footer.mit": "MIT licensed",
  "landing.footer.crosschecked": "Cross-checked vs R 4.5 + SciPy 1.17",
} as const satisfies Catalog;

export default landingEn;
export type LandingKey = keyof typeof landingEn;

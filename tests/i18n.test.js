// Smoke tests for the i18n primitive in tools/_core/i18n.ts — the
// translation lookup (with English + key fallbacks), `{var}` interpolation,
// Intl.PluralRules-driven plural selection, and the localStorage-backed
// language state.

const { suite, test, assert, eq } = require("./harness");
const {
  registerCatalog,
  t,
  tHtml,
  getLang,
  setLang,
  toggleLang,
  LANGS,
  store,
} = require("./helpers/i18n-loader");

// Seed catalogs once for the lookup suites below.
registerCatalog("smoke", "en", {
  "smoke.hello": "Hello",
  "smoke.greet": "Hello, {name}",
  "smoke.items.one": "{count} item",
  "smoke.items.other": "{count} items",
  "smoke.enOnly": "English only",
});
registerCatalog("smoke", "fr", {
  "smoke.hello": "Bonjour",
  "smoke.greet": "Bonjour, {name}",
  "smoke.items.one": "{count} élément",
  "smoke.items.other": "{count} éléments",
  // intentionally NO smoke.enOnly — exercises the English fallback
});

// ── lookup + fallbacks ────────────────────────────────────────────────

suite("i18n — lookup & fallbacks");

test("missing key returns the key itself (never blank)", () => {
  eq(t("smoke.does.not.exist"), "smoke.does.not.exist");
});

test("resolves a registered key in the current language (en default)", () => {
  eq(getLang(), "en");
  eq(t("smoke.hello"), "Hello");
});

test("falls back to English when the current language lacks the key", () => {
  setLang("fr");
  eq(t("smoke.hello"), "Bonjour"); // present in fr
  eq(t("smoke.enOnly"), "English only"); // missing in fr → en fallback
  setLang("en");
});

// ── interpolation ─────────────────────────────────────────────────────

suite("i18n — interpolation");

test("substitutes {var} placeholders", () => {
  eq(t("smoke.greet", { name: "Ada" }), "Hello, Ada");
});

test("leaves unknown placeholders intact", () => {
  eq(t("smoke.greet", {}), "Hello, {name}");
});

test("t does NOT escape interpolated values (plain-text contexts)", () => {
  // `t` targets React text children / textContent / title attrs, where the
  // renderer escapes — so `t` must pass raw values through verbatim, or an
  // ampersand in a group name would show up as "&amp;".
  eq(t("smoke.greet", { name: "A & B" }), "Hello, A & B");
});

// ── HTML-safe interpolation (tHtml) ───────────────────────────────────
//
// `tHtml` is the variant whose result is injected via dangerouslySetInnerHTML.
// It must HTML-escape every interpolated value so a user-supplied string (e.g.
// a pasted CSV column header) cannot inject markup — while preserving the
// authored template text itself.

suite("i18n — tHtml escaping");

test("tHtml escapes <, >, &, \" and ' in interpolated values", () => {
  eq(
    tHtml("smoke.greet", { name: '<img src=x onerror="alert(1)">' }),
    "Hello, &lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
});

test("tHtml escapes a bare ampersand and a single quote", () => {
  eq(tHtml("smoke.greet", { name: "A & B's" }), "Hello, A &amp; B&#39;s");
});

test("tHtml leaves the authored template (and benign values) unchanged", () => {
  eq(tHtml("smoke.greet", { name: "Ada" }), "Hello, Ada");
  eq(tHtml("smoke.hello"), "Hello");
});

test("tHtml still resolves plurals, with the count escaped harmlessly", () => {
  eq(tHtml("smoke.items", { count: 5 }), "5 items");
});

// ── pluralization ─────────────────────────────────────────────────────

suite("i18n — pluralization");

test("selects the .one / .other sibling via Intl.PluralRules", () => {
  eq(t("smoke.items", { count: 1 }), "1 item");
  eq(t("smoke.items", { count: 5 }), "5 items");
  eq(t("smoke.items", { count: 0 }), "0 items"); // en: 0 is 'other'
});

// ── language state ────────────────────────────────────────────────────

suite("i18n — language state");

test("LANGS lists the supported locales", () => {
  assert(Array.isArray(LANGS) && LANGS.includes("en") && LANGS.includes("fr"), "expected en + fr");
});

test("setLang persists to localStorage and getLang reflects it", () => {
  setLang("fr");
  eq(getLang(), "fr");
  eq(store["plottr-lang"], "fr");
  setLang("en");
  eq(getLang(), "en");
  eq(store["plottr-lang"], "en");
});

test("setLang ignores an invalid language", () => {
  setLang("en");
  setLang("zz");
  eq(getLang(), "en");
});

test("toggleLang flips between en and fr", () => {
  setLang("en");
  toggleLang();
  eq(getLang(), "fr");
  toggleLang();
  eq(getLang(), "en");
});

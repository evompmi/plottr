// Chrome colour tokens in tools/theme.css: legibility and the dark-mode rules.
//
// Every text-on-background token pair the chrome relies on must reach WCAG
// 2.1 AA (4.5:1) in both themes; the two dark blocks (the explicit
// [data-theme="dark"] one and the prefers-color-scheme fallback) must hold
// identical declarations; and every --accent-* / --cta-* fill in dark mode
// must be equal to or dimmer than its light counterpart.

const fs = require("fs");
const path = require("path");
const { suite, test, assert, eq } = require("./harness");

const css = fs.readFileSync(path.join(__dirname, "../tools/theme.css"), "utf8");

function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function blockAfter(marker) {
  const start = css.indexOf(marker);
  assert(start >= 0, `theme.css is missing ${marker}`);
  const open = css.indexOf("{", start + marker.length - 1);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced block after ${marker}`);
}

const light = declarations(blockAfter(":root {"));
const darkOwn = declarations(blockAfter(':root[data-theme="dark"] {'));
const darkMedia = declarations(
  blockAfter(':root:not([data-theme="light"]):not([data-theme="dark"]) {')
);
const dark = { ...light, ...darkOwn };

function hexToRgb(hex) {
  const h = hex.replace(/^#/, "");
  assert(/^[0-9a-f]{6}$/i.test(h), `expected a 6-digit hex colour, got ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function luminance(hex) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, background token] pairs that carry readable text.
const TEXT_PAIRS = [
  ...["--text", "--text-muted", "--text-faint"].flatMap((t) =>
    ["--surface", "--surface-subtle", "--surface-sunken", "--page-bg", "--canvas-bg"].map((bg) => [
      t,
      bg,
    ])
  ),
  ["--link", "--surface"],
  ["--link", "--page-bg"],
  ["--link", "--surface-subtle"],
  ["--dna-text", "--surface"],
  ["--dna-text", "--surface-subtle"],
  ["--dna-text", "--page-bg"],
  ["--warning-text", "--surface"],
  ["--plot-card-text-muted", "--plot-card-bg"],
  ...["--role-group-text", "--role-value-text", "--role-filter-text"].flatMap((t) =>
    ["--surface", "--surface-subtle", "--warning-bg"].map((bg) => [t, bg])
  ),
  ["--on-accent", "--cta-primary-bg"],
  ["--on-accent", "--accent-primary-hover"],
  ["--seg-selected-text", "--seg-selected-bg"],
  ["--inverse-text", "--inverse-bg"],
  ["--subhead-text", "--subhead-bg"],
  ["--success-text", "--success-bg"],
  ["--step-ready", "--step-ready-bg"],
  ["--danger-text", "--danger-bg"],
  ["--warning-text", "--warning-bg"],
  ["--info-text", "--info-bg"],
  ["--neutral-text", "--neutral-bg"],
];

suite("theme.css — chrome tokens");

test("no token is declared twice in one block (a later copy silently wins)", () => {
  for (const marker of [
    ":root {",
    ':root[data-theme="dark"] {',
    ':root:not([data-theme="light"]):not([data-theme="dark"]) {',
  ]) {
    const names = [...blockAfter(marker).matchAll(/(--[\w-]+):/g)].map((m) => m[1]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    eq(dupes.join(", "), "", `${marker} declares ${dupes.join(", ")} more than once`);
  }
});

test("the prefers-color-scheme dark block mirrors [data-theme=dark] exactly", () => {
  eq(JSON.stringify(darkMedia), JSON.stringify(darkOwn));
});

for (const [themeName, vars] of [
  ["light", light],
  ["dark", dark],
]) {
  test(`${themeName}: every text pair reaches 4.5:1`, () => {
    const failures = TEXT_PAIRS.map(([fg, bg]) => {
      assert(vars[fg] && vars[bg], `${themeName} is missing ${fg} or ${bg}`);
      return [fg, bg, contrast(vars[fg], vars[bg])];
    }).filter(([, , ratio]) => ratio < 4.5);
    const report = failures.map(([fg, bg, r]) => `${fg} on ${bg} = ${r.toFixed(2)}`).join("; ");
    eq(report, "", `${themeName} contrast failures: ${report}`);
  });
}

// [indicator token, background token] pairs that must reach the 3:1 WCAG asks
// of non-text indicators (focus rings).
const INDICATOR_PAIRS = ["--surface", "--surface-subtle", "--surface-sunken", "--page-bg"].map(
  (bg) => ["--focus-outline", bg]
);

for (const [themeName, vars] of [
  ["light", light],
  ["dark", dark],
]) {
  test(`${themeName}: the focus outline reaches 3:1 on every surface`, () => {
    const failures = INDICATOR_PAIRS.map(([fg, bg]) => {
      assert(vars[fg] && vars[bg], `${themeName} is missing ${fg} or ${bg}`);
      return [fg, bg, contrast(vars[fg], vars[bg])];
    }).filter(([, , ratio]) => ratio < 3);
    const report = failures.map(([fg, bg, r]) => `${fg} on ${bg} = ${r.toFixed(2)}`).join("; ");
    eq(report, "", `${themeName} focus-outline failures: ${report}`);
  });
}

test("dark accents and CTA fills are never brighter than light", () => {
  // --accent-blue is the documented exception (see its comment in theme.css):
  // the light value is so dark that matching it would fail AA on dark surfaces.
  const names = Object.keys(darkOwn).filter(
    (k) => /^--(accent|cta)-/.test(k) && k !== "--accent-blue" && /^#[0-9a-f]{6}$/i.test(darkOwn[k])
  );
  assert(names.length >= 5, "expected several hex accent / cta tokens in dark mode");
  const brighter = names.filter((k) => luminance(darkOwn[k]) > luminance(light[k]));
  eq(brighter.join(", "), "", `dark tokens brighter than light: ${brighter.join(", ")}`);
});

test("pick-one controls show the selected option in ink, not the accent", () => {
  // Blue marks actions, links, the current step and focus. A selected option
  // in a segmented / pick-one control uses --seg-selected-* (the dark pill),
  // so a hand-built toggle must not fill its active state with an accent.
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) files.push(p);
    }
  };
  walk(path.join(__dirname, "../tools"));
  assert(files.length > 50, "expected to scan the tools' .tsx sources");
  const accentFill =
    /background:\s*[^,\n]*\?\s*"var\(--(accent-primary|cta-primary-bg|step-active-bg)\)"\s*:\s*"var\(--surface\)"/;
  const hits = files.flatMap((f) =>
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((line, i) => [path.relative(path.join(__dirname, ".."), f) + ":" + (i + 1), line])
      .filter(([, line]) => accentFill.test(line))
      .map(([loc]) => loc)
  );
  eq(hits.join(", "), "", `accent-filled selected states: ${hits.join(", ")}`);
});

test("sanity: the contrast maths matches known WCAG values", () => {
  eq(contrast("#000000", "#ffffff").toFixed(2), "21.00");
  eq(contrast("#777777", "#ffffff").toFixed(2), "4.48");
});

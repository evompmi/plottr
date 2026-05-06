// Custom ESLint rule: forbid CSS `var(--…)` references inside SVG element
// `fill` / `stroke` / `color` attributes and inline `style={{...}}` props.
//
// Why: per CLAUDE.md ("Theming"), chrome elements use CSS variables so
// dark/light mode flips correctly, while colours INSIDE the SVG (cell
// fills, axis lines, text fills, gradient stops) must stay as hex literals.
// `var(--name)` resolves correctly on screen via the document's
// `:root { --name: … }` block, but the moment the SVG is exported and
// opened in a viewer that does not carry that DOM context — Inkscape, an
// embedded preview, a thumbnailer, the browser's "open SVG file directly"
// path with a stripped CSS env — the variable cannot be resolved and the
// element falls back to default fill (usually black) or to `currentColor`.
// Result: an exported chart that looks completely different from what the
// user saw on screen, with zero feedback at edit time.
//
// The companion `no-chrome-hex-literal` rule covers the inverse direction
// (hex literals on chrome → flag). Together they encode the rule that
// theme-fragile literals belong in chrome and never in SVG, and that
// theme variables belong in chrome and never in SVG.
//
// Forbidden:
//   <rect fill="var(--accent)">
//   <text style={{ fill: "var(--text)" }}>
//   <stop stopColor="var(--accent)">
//
// Allowed:
//   <rect fill="#abc"> / <rect fill={NAN_FILL}>
//   <rect fill={someComputedColor}>  (expression containers — out of scope;
//                                     the helper resolves to a literal at
//                                     runtime, not a `var(--)` reference)

"use strict";

// SVG-namespaced JSX tags. Matches the list in `no-chrome-hex-literal.js`
// — see that file for the rationale (foreignObject is included pragmatically;
// HTML descendants of foreignObject inherit "treat as SVG" context, which
// is fine because we only check the immediate tag here).
const SVG_TAGS = new Set([
  "svg",
  "g",
  "rect",
  "path",
  "line",
  "circle",
  "ellipse",
  "text",
  "polyline",
  "polygon",
  "tspan",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "marker",
  "use",
  "image",
  "title",
  "desc",
  "foreignObject",
  "pattern",
]);

// SVG attributes that paint colour. JSX uses camelCase for hyphenated
// SVG attribute names (stop-color → stopColor, flood-color → floodColor,
// lighting-color → lightingColor). The plain forms (`fill`, `stroke`,
// `color`) are also valid SVG presentation attributes.
const SVG_COLOR_ATTRS = new Set([
  "fill",
  "stroke",
  "color",
  "stopColor",
  "floodColor",
  "lightingColor",
]);

// Inline-style keys that map to SVG paint. React's CSS-in-JS object
// uses camelCase, same as the attribute equivalents.
const SVG_COLOR_STYLE_KEYS = new Set([
  "fill",
  "stroke",
  "color",
  "stopColor",
  "floodColor",
  "lightingColor",
]);

// `var(--`. We require the identifier-prefix `--` so we don't false-positive
// on stray `var(` text inside a longer value.
const VAR_REF = /\bvar\(\s*--/;

function getTagName(openingElement) {
  if (!openingElement || !openingElement.name) return null;
  if (openingElement.name.type === "JSXIdentifier") return openingElement.name.name;
  return null;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow CSS var(--…) references in SVG element fill / stroke / " +
        "color attributes and style props. Theme variables don't survive " +
        "SVG export to viewers without DOM context (Inkscape, embedded " +
        "preview, etc.), so the element renders with default fill instead " +
        "of the intended colour. Use a hex literal or a shared constant.",
    },
    messages: {
      attr:
        'SVG `<{{tag}} {{attr}}="{{value}}">` references a CSS variable, which ' +
        "does not survive SVG export to non-DOM viewers (the element falls " +
        "back to default fill). Use a hex literal, a shared constant " +
        "(e.g. NAN_FILL), or compute the colour at render time and inline it.",
      style:
        'SVG `<{{tag}} style={{ {{key}}: "{{value}}" }}>` references a CSS ' +
        "variable, which does not survive SVG export to non-DOM viewers. " +
        "Use a hex literal, a shared constant (e.g. NAN_FILL), or compute " +
        "the colour at render time and inline it.",
    },
    schema: [],
  },

  create(context) {
    return {
      JSXAttribute(node) {
        const opening = node.parent;
        if (!opening || opening.type !== "JSXOpeningElement") return;
        const tag = getTagName(opening);
        if (!tag || !SVG_TAGS.has(tag)) return;

        const attrName = node.name && node.name.name;
        if (!attrName) return;

        // Direct colour attribute: <rect fill="var(--x)">
        if (SVG_COLOR_ATTRS.has(attrName)) {
          if (!node.value || node.value.type !== "Literal") return;
          const v = node.value.value;
          if (typeof v !== "string") return;
          if (VAR_REF.test(v)) {
            context.report({
              node: node.value,
              messageId: "attr",
              data: { tag, attr: attrName, value: v },
            });
          }
          return;
        }

        // Inline style: <rect style={{ fill: "var(--x)" }}>. Only flag
        // SVG-relevant style keys; a typo like style={{ background:
        // "var(--x)" }} on an SVG element is harmless (SVG ignores
        // `background`) and will be caught by visual review anyway.
        if (attrName === "style") {
          if (!node.value || node.value.type !== "JSXExpressionContainer") return;
          const expr = node.value.expression;
          if (!expr || expr.type !== "ObjectExpression") return;
          for (const prop of expr.properties) {
            if (prop.type !== "Property") continue;
            if (!prop.value || prop.value.type !== "Literal") continue;
            const v = prop.value.value;
            if (typeof v !== "string") continue;
            const key = (prop.key && (prop.key.name || prop.key.value)) || "";
            if (!SVG_COLOR_STYLE_KEYS.has(key)) continue;
            if (VAR_REF.test(v)) {
              context.report({
                node: prop.value,
                messageId: "style",
                data: { tag, key: String(key), value: v },
              });
            }
          }
        }
      },
    };
  },
};

// Custom ESLint rule: forbid hex literal colors inside JSX `style={...}`
// attributes that are NOT inside an SVG subtree.
//
// Why: per CLAUDE.md, theming works because chrome (panels, banners, page
// background, sidebar tiles) references CSS variables defined in
// `tools/theme.css`, while SVG element fills / strokes / text fills stay as
// hex literals so the exported SVG/PNG charts render the same on any
// reader. The rule is "every inline style={…} on a non-SVG element must use
// var(--name)". This rule encodes that policy so a future contributor
// reaching for `style={{ background: "#fff" }}` on a chrome <div> gets a
// linter error, instead of silently breaking dark mode.
//
// Scope: only flags inline object expressions — `style={{ k: "#fff" }}`.
// Identifier refs (`style={someStyle}`) and spread cases get a pass since
// chasing indirection reliably across modules is out of scope.

"use strict";

// Match hex literal colors only — three-, four-, six-, or eight-digit forms.
// We do not match things like `#abc-123` or `rgba(...)`; those aren't hex
// literals and aren't what the rule is about.
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// SVG-namespaced JSX tags that legitimately accept hex literal fills /
// strokes per the CLAUDE.md "Theming" section. Anything nested inside one
// of these is exempt — chart internals must stay as hex so exported
// SVG/PNG renders consistently regardless of theme.
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

function isInsideSvgSubtree(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "JSXElement" && cur.openingElement && cur.openingElement.name) {
      const name = cur.openingElement.name;
      // <foo>: name.type === "JSXIdentifier", name.name = "foo"
      if (name.type === "JSXIdentifier" && SVG_TAGS.has(name.name)) return true;
    }
    cur = cur.parent;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hex literal colors inside JSX style={...} attributes outside SVG subtrees. " +
        "Use CSS variables (var(--...)) so dark/light theming stays consistent across all chrome.",
    },
    messages: {
      hex:
        "Chrome style={{...}} should reference CSS variables, not hex literals. " +
        "Found `{{value}}` on `{{key}}`. " +
        "Define a theme variable in tools/theme.css and use `var(--name)` instead.",
    },
    schema: [],
  },

  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "style") return;
        if (!node.value || node.value.type !== "JSXExpressionContainer") return;
        const expr = node.value.expression;
        if (!expr || expr.type !== "ObjectExpression") return;
        if (isInsideSvgSubtree(node)) return;

        for (const prop of expr.properties) {
          if (prop.type !== "Property") continue;
          if (!prop.value || prop.value.type !== "Literal") continue;
          const v = prop.value.value;
          if (typeof v !== "string") continue;
          if (!HEX.test(v.trim())) continue;
          const k = (prop.key && (prop.key.name || prop.key.value)) || "(unknown)";
          context.report({
            node: prop.value,
            messageId: "hex",
            data: { key: String(k), value: v },
          });
        }
      },
    };
  },
};

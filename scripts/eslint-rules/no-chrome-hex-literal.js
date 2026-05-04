// Custom ESLint rule: forbid theme-fragile colour literals inside JSX
// `style={...}` attributes that are NOT inside an SVG subtree.
//
// Why: per CLAUDE.md, theming works because chrome (panels, banners, page
// background, sidebar tiles) references CSS variables defined in
// `tools/theme.css`, while SVG element fills / strokes / text fills stay
// as hex literals so the exported SVG/PNG charts render the same on any
// reader. The rule is "every inline style={…} on a non-SVG element must
// use var(--name)". This rule encodes that policy so a future contributor
// reaching for `style={{ background: "#fff" }}` on a chrome <div> gets a
// linter error, instead of silently breaking dark mode.
//
// Forbidden literal forms (outside SVG subtree):
//   - hex literals: `"#abc"`, `"#abcd"`, `"#aabbcc"`, `"#aabbccdd"`
//   - named colors: `"white"`, `"black"`, `"slategray"`, etc. (closed list)
//   - functional notations anywhere in the string: `rgba(...)`, `rgb(...)`,
//     `hsl(...)`, `hsla(...)` — catches both bare colour values and
//     literals buried inside multi-token strings like
//     `boxShadow: "0 2px 6px rgba(0,0,0,0.15)"` or
//     `background: "linear-gradient(..., rgba(255,255,255,0))"`.
//
// Allowed: `var(...)` references, `transparent`, `currentColor`,
// `inherit`, `unset`, `initial`, `none`, plus any value that doesn't
// match one of the forbidden forms.
//
// Scope: only flags inline object expressions — `style={{ k: "#fff" }}`.
// Identifier refs (`style={someStyle}`) and spread cases get a pass
// since chasing indirection reliably across modules is out of scope.

"use strict";

// Match hex literal colors only — three-, four-, six-, or eight-digit
// forms. We do not match things like `#abc-123`; those aren't hex
// literals.
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Functional-notation colour literals can appear ANYWHERE in a string
// value (a multi-token boxShadow or a linear-gradient, not just at the
// start). Substring match is the right check.
const FN_NOTATION = /\b(rgba?|hsla?)\s*\(/i;

// Named colours that are theme-fragile — picking any of these in chrome
// hard-codes a tone that won't flip in dark mode. The list covers the
// CSS-named keywords most likely to be reached for; gray-/grey- + dark-/
// light- variants are spelled out so spelling alternates don't sneak
// through. `transparent` / `currentColor` etc. are intentionally NOT
// here — they're theme-safe.
const NAMED_COLORS = new Set([
  "white",
  "black",
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "cyan",
  "magenta",
  "silver",
  "gold",
  "lime",
  "aqua",
  "teal",
  "navy",
  "maroon",
  "olive",
  "fuchsia",
  "coral",
  "salmon",
  "khaki",
  "violet",
  "indigo",
  "gray",
  "grey",
  "slategray",
  "slategrey",
  "lightgray",
  "lightgrey",
  "darkgray",
  "darkgrey",
  "lightblue",
  "darkblue",
  "lightgreen",
  "darkgreen",
  "lightyellow",
  "darkred",
  "lightcoral",
  "lightpink",
  "lightseagreen",
  "lightskyblue",
  "lightsteelblue",
  "darkorange",
  "darkviolet",
  "deepskyblue",
  "dodgerblue",
  "firebrick",
  "forestgreen",
  "goldenrod",
  "limegreen",
  "mediumblue",
  "midnightblue",
  "skyblue",
  "steelblue",
  "tan",
  "thistle",
  "tomato",
  "turquoise",
  "wheat",
  "whitesmoke",
]);

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
        "Disallow theme-fragile colour literals (hex / named CSS colours / " +
        "rgba / rgb / hsl / hsla) inside JSX style={...} attributes outside " +
        "SVG subtrees. Use CSS variables (var(--...)) so dark/light theming " +
        "stays consistent across all chrome. Rule name kept as " +
        "`no-chrome-hex-literal` for stable config; the scope was widened " +
        "in the 2026-05 theme-var audit.",
    },
    messages: {
      hex:
        "Chrome style={{...}} should reference CSS variables, not hex literals. " +
        "Found `{{value}}` on `{{key}}`. " +
        "Define a theme variable in tools/theme.css and use `var(--name)` instead.",
      named:
        "Chrome style={{...}} should reference CSS variables, not named CSS colours. " +
        "Found `{{value}}` on `{{key}}`. " +
        "Define a theme variable in tools/theme.css and use `var(--name)` instead, " +
        "or use `transparent` if the slot is meant to be see-through.",
      functional:
        "Chrome style={{...}} should reference CSS variables, not rgba/rgb/hsl/hsla literals. " +
        "Found `{{value}}` on `{{key}}`. " +
        "Define a theme variable in tools/theme.css (light + dark blocks) " +
        "and use `var(--name)` instead.",
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
          const trimmed = v.trim();
          const k = (prop.key && (prop.key.name || prop.key.value)) || "(unknown)";

          // Hex literals — exact match on the trimmed value.
          if (HEX.test(trimmed)) {
            context.report({
              node: prop.value,
              messageId: "hex",
              data: { key: String(k), value: v },
            });
            continue;
          }

          // Functional notation — substring match anywhere in the value
          // so multi-token strings (boxShadow, linear-gradient, …) are
          // also caught.
          if (FN_NOTATION.test(v)) {
            context.report({
              node: prop.value,
              messageId: "functional",
              data: { key: String(k), value: v },
            });
            continue;
          }

          // Named colours — exact match on the trimmed, lower-cased
          // value. Avoids false-positives on multi-token strings (a
          // gradient that happens to mention "white" as part of an
          // argument is already caught by the FN_NOTATION rule).
          if (NAMED_COLORS.has(trimmed.toLowerCase())) {
            context.report({
              node: prop.value,
              messageId: "named",
              data: { key: String(k), value: v },
            });
            continue;
          }
        }
      },
    };
  },
};

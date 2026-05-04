// Loads the shared bundle into a Node vm context and exposes the
// discrete-palette catalogue + helpers for unit testing. Mirrors
// tests/helpers/components-loader.js.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");
const bundlePath = path.join(toolsDir, "shared.bundle.js");
if (!fs.existsSync(bundlePath)) {
  throw new Error(
    "discrete-palette-loader: tools/shared.bundle.js is missing. Run `npm run build:shared` (or any build / test) to generate it."
  );
}
const bundleSrc = fs.readFileSync(bundlePath, "utf8");

const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  Number,
  String,
  Array,
  Object,
  Set,
  console,
  setTimeout: () => {},
  document: {
    createElement: () => ({}),
    documentElement: {
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
    },
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: "visible",
  },
  window: {
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    dispatchEvent: () => {},
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  CustomEvent: function () {},
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
  React: {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useId: () => ":r0:",
    createElement: () => null,
    memo: (fn) => fn,
    Component: class {
      constructor(props) {
        this.props = props;
        this.state = {};
      }
      setState() {}
    },
  },
};

vm.createContext(ctx);
vm.runInContext(bundleSrc, ctx);

// `const` bindings declared at the top of a vm-loaded script don't become
// properties of the context object — only `var` and `function` do. Use
// vm.runInContext("name", ctx) to read them out of the script's lexical
// scope. Function declarations (resolveDiscretePalette, applyDiscretePalette,
// buildGgplot2Hue, buildViridisDiscrete) are on `ctx` directly.
module.exports = {
  PALETTE: vm.runInContext("PALETTE", ctx),
  DISCRETE_PALETTES: vm.runInContext("DISCRETE_PALETTES", ctx),
  COLORBLIND_SAFE_PALETTES: vm.runInContext("COLORBLIND_SAFE_PALETTES", ctx),
  resolveDiscretePalette: ctx.resolveDiscretePalette,
  applyDiscretePalette: ctx.applyDiscretePalette,
  buildGgplot2Hue: ctx.buildGgplot2Hue,
  buildViridisDiscrete: ctx.buildViridisDiscrete,
};

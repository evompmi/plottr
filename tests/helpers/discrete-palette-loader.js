// Loads the shared bundle into a Node vm context (for COLOR_PALETTES /
// interpolateColor / PALETTE — still plain-JS globals from shared.js) and
// then esbuild-transforms tools/_shell/discrete-palette.ts on top of that
// context so the migrated module's exports can be read out for unit tests.
// Mirrors tests/helpers/prefs-loader.js's hybrid bundle-then-module pattern.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const bundlePath = path.join(toolsDir, "shared.bundle.js");
const palettePath = path.join(toolsDir, "_shell", "discrete-palette.ts");
if (!fs.existsSync(bundlePath)) {
  throw new Error(
    "discrete-palette-loader: tools/shared.bundle.js is missing. Run `npm run build:shared` (or any build / test) to generate it."
  );
}
const bundleSrc = fs.readFileSync(bundlePath, "utf8");
const paletteSrc = fs.readFileSync(palettePath, "utf8");

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

// Thread module.exports through so the transformed CJS-shaped TS module
// finds the slot to write its named exports into.
const moduleObj = { exports: {} };
ctx.module = moduleObj;
ctx.exports = moduleObj.exports;

vm.createContext(ctx);
vm.runInContext(bundleSrc, ctx);

const transformed = esbuild.transformSync(paletteSrc, {
  loader: "ts",
  format: "cjs",
  target: "es2022",
}).code;
vm.runInContext(transformed, ctx);
const palette = ctx.module.exports;

// `PALETTE` (from shared.js) is a `const` binding; not a context property,
// so we read it via vm.runInContext. Everything else comes off the migrated
// module's named exports.
module.exports = {
  PALETTE: vm.runInContext("PALETTE", ctx),
  DISCRETE_PALETTES: palette.DISCRETE_PALETTES,
  COLORBLIND_SAFE_PALETTES: palette.COLORBLIND_SAFE_PALETTES,
  resolveDiscretePalette: palette.resolveDiscretePalette,
  applyDiscretePalette: palette.applyDiscretePalette,
  buildGgplot2Hue: palette.buildGgplot2Hue,
  buildViridisDiscrete: palette.buildViridisDiscrete,
};

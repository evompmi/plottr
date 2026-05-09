const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-config-prettier");

// Local rules. Register as the "plottr" plugin so they namespace cleanly
// (avoids colliding with anything from @eslint/js or @typescript-eslint).
const plottrLocal = {
  rules: {
    "no-chrome-hex-literal": require("./scripts/eslint-rules/no-chrome-hex-literal.js"),
    "no-css-var-in-svg": require("./scripts/eslint-rules/no-css-var-in-svg.js"),
    "require-example-const": require("./scripts/eslint-rules/require-example-const.js"),
  },
};

const compiledTools = ["tools/_app/index.js", "tools/version.js"];

// Names declared at top-level of tools/shared.js, the tools/stats-*.js files,
// and the tools/shared-*.js component files, consumed by tool .tsx files via
// <script>-tag globals.
const sharedGlobals = {
  // shared.js
  hexToRgb: "readonly",
  rgbToHex: "readonly",
  shadeColor: "readonly",
  getPointColors: "readonly",
  PALETTE: "readonly",
  TOOL_ICONS: "readonly",
  toolIcon: "readonly",
  roleColors: "readonly",
  isNumericValue: "readonly",
  seededRandom: "readonly",
  makeTicks: "readonly",
  makeLogTicks: "readonly",
  autoDetectSep: "readonly",
  fixDecimalCommas: "readonly",
  parseRaw: "readonly",
  guessColumnType: "readonly",
  detectWideFormat: "readonly",
  parseData: "readonly",
  dataToColumns: "readonly",
  wideToLong: "readonly",
  reshapeWide: "readonly",
  parseWideMatrix: "readonly",
  parseSetData: "readonly",
  parseLongFormatSets: "readonly",
  COLOR_PALETTES: "readonly",
  DIVERGING_PALETTES: "readonly",
  interpolateColor: "readonly",
  computeStats: "readonly",
  quartiles: "readonly",
  kde: "readonly",
  computeGroupStats: "readonly",
  fileBaseName: "readonly",
  flashSaved: "readonly",
  svgSafeId: "readonly",
  downloadSvg: "readonly",
  downloadPng: "readonly",
  downloadCsv: "readonly",
  downloadText: "readonly",
  powerTwoSample: "readonly",
  powerPaired: "readonly",
  powerOneSample: "readonly",
  powerAnova: "readonly",
  powerCorrelation: "readonly",
  powerChi2: "readonly",
  fFromGroupMeans: "readonly",
  // stats-*.js (carved from the original stats.js)
  normcdf: "readonly",
  normsf: "readonly",
  norminv: "readonly",
  gammaln: "readonly",
  betai: "readonly",
  betai_upper: "readonly",
  betacf: "readonly",
  gammainc: "readonly",
  gammainc_upper: "readonly",
  tcdf: "readonly",
  tcdf_upper: "readonly",
  tpdf: "readonly",
  tinv: "readonly",
  fcdf: "readonly",
  fcdf_upper: "readonly",
  chi2cdf: "readonly",
  chi2pdf: "readonly",
  chi2inv: "readonly",
  nctcdf: "readonly",
  ncf_sf: "readonly",
  ncchi2cdf: "readonly",
  _gaussLegendre: "readonly",
  bisect: "readonly",
  sampleMean: "readonly",
  sampleVariance: "readonly",
  sampleSD: "readonly",
  rankWithTies: "readonly",
  shapiroWilk: "readonly",
  leveneTest: "readonly",
  tTest: "readonly",
  mannWhitneyU: "readonly",
  cohenD: "readonly",
  hedgesG: "readonly",
  rankBiserial: "readonly",
  oneWayANOVA: "readonly",
  welchANOVA: "readonly",
  kruskalWallis: "readonly",
  etaSquared: "readonly",
  epsilonSquared: "readonly",
  ptukey: "readonly",
  qtukey: "readonly",
  tukeyHSD: "readonly",
  gamesHowell: "readonly",
  bhAdjust: "readonly",
  dunnTest: "readonly",
  compactLetterDisplay: "readonly",
  selectTest: "readonly",
  // shared-stats-registry.js
  STATS_TEST_REGISTRY: "readonly",
  STATS_POSTHOC_REGISTRY: "readonly",
  STATS_TESTS_FOR_K2: "readonly",
  STATS_TESTS_FOR_K: "readonly",
  pStars: "readonly",
  formatP: "readonly",
  StatsTile: "readonly",
  assignBracketLevels: "readonly",
  computePowerFromData: "readonly",
  pairwiseDistance: "readonly",
  hclust: "readonly",
  dendrogramLayout: "readonly",
  kmeans: "readonly",
  // shared-r-export.js
  buildRScript: "readonly",
  buildRScriptForPower: "readonly",
  sanitizeRString: "readonly",
  formatRNumber: "readonly",
  formatRVector: "readonly",
  // theme.js
  ThemeToggle: "readonly",
  useThemeMode: "readonly",
  setTheme: "readonly",
  getTheme: "readonly",
  toggleTheme: "readonly",
};

const browserPlus = {
  ...globals.browser,
  React: "readonly",
  ReactDOM: "readonly",
};

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "vendor/**",
      "test-results/**",
      "playwright-report/**",
      // Stryker mutation-testing scratch dirs — sandbox copies of the
      // repo with mutated source. Local-only, gitignored, and would
      // produce thousands of duplicate lint errors against the copy.
      ".stryker-tmp/**",
      "reports/**",
      // Per-tool helpers compiled to CJS by the require()-based test
      // loaders (see tests/helpers/scatter-loader.js,
      // tests/helpers/lineplot-loader.js). Gitignored, regenerated on
      // every test run.
      "tests/.tmp/**",
      ...compiledTools,
    ],
  },

  js.configs.recommended,

  // This config file itself + build scripts + benchmark runner (CommonJS, Node).
  {
    files: [
      "eslint.config.js",
      ".prettierrc.js",
      "vitest.config.js",
      "scripts/**/*.js",
      "benchmark/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // ES-module Node scripts (utility tools that use top-level await / import).
  {
    files: ["scripts/**/*.mjs", "benchmark/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // Tool TSX sources — consume shared globals. Uses the TypeScript parser so
  // ESLint can understand type annotations; actual type-checking is handled
  // separately by `tsc --noEmit`.
  {
    files: ["tools/**/*.tsx"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "@typescript-eslint": tsPlugin,
      plottr: plottrLocal,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "script",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...browserPlus, ...sharedGlobals },
    },
    settings: { react: { version: "18" } },
    rules: {
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "no-unused-vars": "off",
      // TypeScript handles undefined-identifier checks (and understands type-only
      // references like `ColumnRole` from globals.d.ts that ESLint cannot see).
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Theme drift guards: chrome style={{...}} must use CSS variables
      // (var(--name)), not hex literals; SVG element fill/stroke/color must
      // stay as hex literals (or shared constants), not var(--…) — see
      // CLAUDE.md "Theming" and the rule files in scripts/eslint-rules/.
      "plottr/no-chrome-hex-literal": "error",
      "plottr/no-css-var-in-svg": "error",
      // React Hooks safety. Both at error level after a one-time audit:
      // rules-of-hooks is non-negotiable (call order has to be stable);
      // exhaustive-deps caught real stale-closure / facetRefs.current
      // capture bugs across the audit and now sits at zero warnings.
      // Intentional omissions (numeric-signature memo keys, mount-only
      // effects, closures over already-listed primitives) carry an
      // explicit `// eslint-disable-next-line` with a short rationale at
      // each site, so the rule's noise floor is real bugs only.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Plot-tool app.tsx orchestrators (one per folder) must declare a
  // top-level `const EXAMPLE_CSV` / `EXAMPLE_TSV` for the "Try sample
  // data" button — see scripts/eslint-rules/require-example-const.js
  // and tools/CLAUDE.md "Sample-data convention". Glob matches plot
  // tools (`tools/<tool>/app.tsx`); calculator app files
  // (`tools/<calc>-app.tsx`) don't have a sample-data button and
  // are excluded.
  {
    files: ["tools/*/app.tsx"],
    plugins: { plottr: plottrLocal },
    rules: {
      "plottr/require-example-const": "error",
    },
  },

  // Hand-written shared plain JS and browser-only helper scripts. These files
  // BOTH define and consume shared globals (the shared-*.js files use styles
  // from shared.js), so we list the shared globals, disable no-redeclare
  // (self-declarations collide with the global list), and disable
  // no-unused-vars (names are consumed via globals).
  {
    files: ["tools/shared.js", "tools/stats-*.js", "tools/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserPlus, ...sharedGlobals },
    },
    rules: {
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Tests run under Vitest. Most files are pure-Node CJS, but
  // `tests/components.test.js` declares `// @vitest-environment happy-dom`
  // at the top and uses `document` / `window` directly in its
  // assertion helpers (`rootEl(html)` parses HTML through happy-dom's
  // DOMParser-style API). Allow the browser globals everywhere under
  // `tests/` rather than carving out a per-file override; the smaller
  // test files don't reference them, and the bigger one needs them.
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Playwright e2e specs — TypeScript run by `npx playwright test`. Uses
  // `@playwright/test`'s named imports, no globals (test / expect are
  // imported each spec). The TS parser is required so type annotations
  // don't trip up the base recommended config.
  {
    files: ["e2e/**/*.ts", "e2e/**/*.tsx", "playwright.config.ts"],
    plugins: { "@typescript-eslint": tsPlugin },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  prettier,
];

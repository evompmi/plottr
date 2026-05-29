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

// Generated outputs that lint never has anything useful to say about.
// `tools/_app/chunks/**` covers the per-tool lazy chunks emitted by
// esbuild's `--splitting --chunk-names=chunks/[name]-[hash]`.
const compiledTools = [
  "tools/_app/index.js",
  "tools/_app/chunks/**",
  "tools/version.js",
  "tools/shared.bundle.js",
];

// Pre-v1.6 this listed ~120 names from tools/shared.js / stats-*.js /
// theme.js so tool .tsx files could consume them through script-tag
// globals without TS / lint flagging undefined-variable. The v1.6 `_core/`
// migration converted the entire shared kernel into ES modules with real
// `export` declarations, and the per-caller import sweep replaced the
// global references with `import { … } from "../_core/…"` lines.
//
// Two ambient names still remain in `_shell/prefs-store.ts` (`downloadText`
// — kept ambient so the test loader's vm-context stub can intercept) and
// in unmigrated `upset` references to `multiset*`. Those are declared
// inline in the files themselves via `declare const`, so they don't need
// to live here.
const sharedGlobals = {};

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

  // `_core/*` modules are real ES modules with TS syntax. They legitimately
  // *define* the names the rest of the codebase consumes as globals (via the
  // trailing `globalThis.X = X` shims) — `no-redeclare` would otherwise flag
  // every `export function toolIcon` against the `toolIcon` ambient in
  // `sharedGlobals`. Use the TS parser so the .ts files parse, and turn off
  // `no-redeclare` since the canonical source-of-truth for those names IS
  // this folder.
  {
    files: ["tools/_core/**/*.ts", "tools/_core/**/*.tsx"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...browserPlus, ...sharedGlobals },
    },
    rules: {
      "no-redeclare": "off",
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Plot-tool app.tsx orchestrators (one per folder) must declare a
  // top-level `const EXAMPLE_CSV` / `EXAMPLE_TSV` for the "Try sample
  // data" button — see scripts/eslint-rules/require-example-const.js
  // and tools/CLAUDE.md "Sample-data convention". Glob matches plot
  // tools (`tools/<tool>/app.tsx`); calculator app files
  // (`tools/<calc>-app.tsx`) don't have a sample-data button and
  // are excluded.
  //
  // `tools/_app/**` is excluded explicitly: the SPA shell root is
  // `tools/_app/App.tsx` (capital A), which the case-sensitive `app.tsx`
  // glob skips on Linux CI — but on a case-insensitive FS (macOS) the
  // path resolves and the rule false-fires. The ignore makes the skip
  // independent of filename casing (and survives a future App.tsx → app.tsx
  // rename to match the other tools).
  {
    files: ["tools/*/app.tsx"],
    ignores: ["tools/_app/**"],
    plugins: { plottr: plottrLocal },
    rules: {
      "plottr/require-example-const": "error",
    },
  },

  // Hand-written shared plain JS and browser-only helper scripts. Most of
  // the legacy script-scope files (`shared.js`, `stats-*.js`, `theme.js`)
  // were migrated to TS modules under `tools/_core/` in v1.6.x; the residual
  // `tools/*.js` glob still catches any future leaf scripts that need the
  // script-scope-globals environment.
  {
    files: ["tools/*.js"],
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
      // Vitest injects `expect` / `describe` / `it` / `vi` etc. as globals
      // (`globals: true` in vitest.config.js). The house harness wraps
      // `test` / `suite`, but snapshot tests call
      // `expect(...).toMatchSnapshot()` directly — declare the Vitest
      // globals so ESLint doesn't flag that raw usage as undefined.
      globals: {
        ...globals.node,
        ...globals.browser,
        expect: "readonly",
        describe: "readonly",
        it: "readonly",
        vi: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
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

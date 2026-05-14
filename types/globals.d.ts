// Ambient globals — what's left after the v1.6 `_core/` migration:
//
//   - **Vendored React / ReactDOM** still live as `<script>`-tag globals
//     because the SPA's HTML loads them from `/vendor/` before any module
//     bundle parses, and every tool .tsx file references `React.useState`,
//     `React.createElement`, etc. against the global.
//   - **Stats-registry types** (`RecommendedTest` / `StatsTestEntry` etc.)
//     remain ambient because `tools/_shell/stats-registry.ts` uses them as
//     unqualified type names — re-homing them as exports would force every
//     consumer to add a type import for marginal benefit.
//
// Everything else (~550 lines of function / interface declarations for the
// pre-migration shared kernel) has been deleted: the kernel now lives in
// real `_core/*` ES modules with proper `export` declarations and every
// caller imports its symbols directly.

import type { CSSProperties, FC, ReactElement, ReactNode } from "react";
import * as ReactNs from "react";

declare global {
  // ── Vendored React (loaded via <script> tag) ───────────────────────────────
  const React: typeof ReactNs;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React {
    export type CSSProperties = ReactNs.CSSProperties;
    export type FC<P = object> = ReactNs.FC<P>;
    export type ComponentType<P = object> = ReactNs.ComponentType<P>;
    export type ReactElement = ReactNs.ReactElement;
    export type ReactNode = ReactNs.ReactNode;
    export type RefObject<T> = ReactNs.RefObject<T>;
    export type MutableRefObject<T> = ReactNs.MutableRefObject<T>;
    export type ChangeEvent<T = Element> = ReactNs.ChangeEvent<T>;
    export type MouseEvent<T = Element> = ReactNs.MouseEvent<T>;
    export type KeyboardEvent<T = Element> = ReactNs.KeyboardEvent<T>;
    export type FormEvent<T = Element> = ReactNs.FormEvent<T>;
    export type PointerEvent<T = Element> = ReactNs.PointerEvent<T>;
    export type WheelEvent<T = Element> = ReactNs.WheelEvent<T>;
  }
  const ReactDOM: typeof import("react-dom/client");

  // ── Stats-registry ambients ────────────────────────────────────────────────
  // `tools/_shell/stats-registry.ts` references these type names unqualified.
  // The runtime values they describe (test functions, post-hoc functions) are
  // imported directly from `_core/stats/*`; only the ambient *type* surface
  // stays here to avoid an `import type` line at every consumer.
  type RecommendedTest =
    | "studentT"
    | "welchT"
    | "mannWhitney"
    | "oneWayANOVA"
    | "welchANOVA"
    | "kruskalWallis";
  type RecommendedPostHoc = "tukeyHSD" | "gamesHowell" | "dunn" | null;
  type TestArity = 2 | "k";
  interface StatsTestEntry {
    label: string;
    // Shorter label for tight UIs — fall back to `label` if absent.
    shortLabel?: string;
    arity: TestArity;
    postHoc: Exclude<RecommendedPostHoc, null> | null;
    // Returns whichever result-shape the underlying test produces
    // (TTestResult, ANOVAResult, …); consumers narrow via the typed
    // dispatchers in `_shell/stats-dispatch.ts`.
    run: (values: number[][]) => unknown;
  }
  interface StatsPostHocEntry {
    label: string;
    run: (values: number[][]) => unknown;
  }

  // ── Shared-component prop ambients ─────────────────────────────────────────
  // Used unqualified in `_shell/FilterCheckboxPanel.tsx`,
  // `_shell/RenameReorderPanel.tsx`, and the per-tool helpers that wire
  // significance brackets. They're not part of `_core/` — they describe
  // shared UI prop shapes — so they stay ambient rather than being lifted
  // into the kernel.
  interface FilterEntry {
    unique: string[];
    included: Set<string>;
  }
  interface BracketPair {
    i: number;
    j: number;
    p?: number;
    pAdj?: number;
    label?: string;
    _level?: number;
  }
}

// Re-export React type aliases at module scope so unrelated TS files that
// `import type { CSSProperties }` from this module's react re-export stay
// resolvable. Keeping the imports in scope prevents tsc from stripping
// the `import * as ReactNs` line as unused.
export type { CSSProperties, FC, ReactElement, ReactNode };

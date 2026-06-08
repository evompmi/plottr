// Shell i18n namespace ("shell") — registers the en/fr catalogs as a
// side effect on import and exports a typed translation wrapper.
//
// Registration is eager: `tools/_app/index.tsx` side-effect-imports this
// module so the shell strings are in the entry chunk (every tool reuses
// the shell chrome). Components translate via `useShellT()` — which
// subscribes to language changes (so they re-render on toggle) and
// returns the key-typed `tt`.

import { t, registerCatalog, useLang } from "../../_core/i18n";
import type { TVars, TranslatableKey } from "../../_core/i18n";
import en, { type ShellKey } from "./en";
import fr from "./fr";

registerCatalog("shell", "en", en);
registerCatalog("shell", "fr", fr);

export type { ShellKey };
// The set of keys callers may pass: the concrete keys plus the base of any
// plural pair (`…detail` resolves `…detail.one` / `…detail.other`).
export type ShellTKey = TranslatableKey<ShellKey>;

// Key-typed translate. Use inside a component that already subscribes to
// language (via useShellT or a parent useLang); for one-off non-reactive
// strings (class components, module scope) it's fine on its own.
export function tt(key: ShellTKey, vars?: TVars): string {
  return t(key, vars);
}

// Subscribe-and-return: a function component calls `const tr = useShellT()`
// once so it re-renders when the language changes, then uses `tr("shell.…")`.
export function useShellT(): (key: ShellTKey, vars?: TVars) => string {
  useLang();
  return tt;
}

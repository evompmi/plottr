// Scatter i18n namespace — registers en/fr and exports the key-typed
// tt / useT. Imported for its side effect by scatter/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type ScatterKey } from "./en";
import fr from "./fr";

registerCatalog("scatter", "en", en);
registerCatalog("scatter", "fr", fr);

export type { ScatterKey };
export const { tt, useT } = makeT<ScatterKey>();

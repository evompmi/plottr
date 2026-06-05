// Line Plot i18n namespace — registers en/fr and exports the key-typed
// tt / useT. Imported for its side effect by lineplot/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type LineplotKey } from "./en";
import fr from "./fr";

registerCatalog("lineplot", "en", en);
registerCatalog("lineplot", "fr", fr);

export type { LineplotKey };
export const { tt, useT } = makeT<LineplotKey>();

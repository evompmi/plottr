// Power Analysis calculator i18n namespace — registers en/fr and exports the
// key-typed tt / useT. Imported for its side effect by power-app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type PowerKey } from "./en";
import fr from "./fr";

registerCatalog("power", "en", en);
registerCatalog("power", "fr", fr);

export type { PowerKey };
export const { tt, ttHtml, useT } = makeT<PowerKey>();

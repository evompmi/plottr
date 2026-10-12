// qPCR i18n namespace — registers en/fr catalogs and exports the key-typed
// tt / useT. Imported for its side effect by qpcr/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type QpcrKey } from "./en";
import fr from "./fr";

registerCatalog("qpcr", "en", en);
registerCatalog("qpcr", "fr", fr);

export type { QpcrKey };
export const { tt, useT } = makeT<QpcrKey>();

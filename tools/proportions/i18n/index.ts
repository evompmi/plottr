// Proportions i18n namespace — registers en/fr catalogs and exports the
// key-typed tt / useT. Imported for its side effect by proportions/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type ProportionsKey } from "./en";
import fr from "./fr";

registerCatalog("proportions", "en", en);
registerCatalog("proportions", "fr", fr);

export type { ProportionsKey };
export const { tt, useT } = makeT<ProportionsKey>();

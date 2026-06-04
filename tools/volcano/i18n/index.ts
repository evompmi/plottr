// Volcano i18n namespace — registers en/fr catalogs and exports the
// key-typed tt / useT. Imported for its side effect by volcano/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type VolcanoKey } from "./en";
import fr from "./fr";

registerCatalog("volcano", "en", en);
registerCatalog("volcano", "fr", fr);

export type { VolcanoKey };
export const { tt, useT } = makeT<VolcanoKey>();

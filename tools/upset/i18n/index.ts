// UpSet i18n namespace — registers en/fr catalogs and exports the
// key-typed tt / useT. Imported for its side effect by upset/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type UpsetKey } from "./en";
import fr from "./fr";

registerCatalog("upset", "en", en);
registerCatalog("upset", "fr", fr);

export type { UpsetKey };
export const { tt, useT } = makeT<UpsetKey>();

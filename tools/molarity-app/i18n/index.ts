// Calculator (molarity) i18n namespace — registers en/fr and exports the
// key-typed tt / useT. Imported for its side effect by molarity-app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type MolarityKey } from "./en";
import fr from "./fr";

registerCatalog("molarity", "en", en);
registerCatalog("molarity", "fr", fr);

export type { MolarityKey };
export const { tt, useT } = makeT<MolarityKey>();

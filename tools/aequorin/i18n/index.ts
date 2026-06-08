// RLU Timecourse (aequorin) i18n namespace — registers en/fr and exports the
// key-typed tt / useT. Imported for its side effect by aequorin/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type AequorinKey } from "./en";
import fr from "./fr";

registerCatalog("aequorin", "en", en);
registerCatalog("aequorin", "fr", fr);

export type { AequorinKey };
export const { tt, useT } = makeT<AequorinKey>();

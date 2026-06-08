// Venn i18n namespace — registers the en/fr catalogs (side effect) and
// exports the key-typed `tt` / `useT`. Imported for its side effect by
// venn/app.tsx (`import "./i18n"`), so the catalog ships in venn's chunk.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type VennKey } from "./en";
import fr from "./fr";

registerCatalog("venn", "en", en);
registerCatalog("venn", "fr", fr);

export type { VennKey };
export const { tt, useT } = makeT<VennKey>();

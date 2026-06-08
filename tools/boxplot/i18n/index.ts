// Group Plot (boxplot) i18n namespace — registers en/fr and exports the
// key-typed tt / useT. Imported for its side effect by boxplot/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type BoxplotKey } from "./en";
import fr from "./fr";

registerCatalog("boxplot", "en", en);
registerCatalog("boxplot", "fr", fr);

export type { BoxplotKey };
export const { tt, ttHtml, useT } = makeT<BoxplotKey>();

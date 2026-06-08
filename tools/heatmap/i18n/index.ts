// Heatmap i18n namespace — registers en/fr catalogs and exports the
// key-typed tt / useT. Imported for its side effect by heatmap/app.tsx.

import { registerCatalog, makeT } from "../../_core/i18n";
import en, { type HeatmapKey } from "./en";
import fr from "./fr";

registerCatalog("heatmap", "en", en);
registerCatalog("heatmap", "fr", fr);

export type { HeatmapKey };
export const { tt, useT } = makeT<HeatmapKey>();
